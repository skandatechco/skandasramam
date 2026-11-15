/**
 * Exercises public.admin_booking_action() and the audit log against the real
 * migration SQL in an in-process Postgres (PGlite) with a stand-in for
 * Supabase's auth schema/roles. Nothing here touches any real database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { BOOKING_ACTIONS, allowedActions } from "../shared/admin";

const dir = join(__dirname, "migrations");
const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const OTHER_ADMIN = "00000000-0000-0000-0000-0000000000a2";
const USER = "00000000-0000-0000-0000-0000000000b1";
const EMAIL: Record<string, string> = {
  [ADMIN]: "admin@example.com",
  [OTHER_ADMIN]: "second@example.com",
  [USER]: "user@example.com",
};

let db: PGlite;
let seq = 0;

async function as<T>(
  role: "anon" | "authenticated",
  uid: string | null,
  fn: () => Promise<T>,
) {
  await db.exec(
    `reset role;
     select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);
     select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, email: EMAIL[uid] }) : "{}"}', false);
     set role ${role};`,
  );
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const denied = (p: Promise<unknown>) =>
  expect(p).rejects.toThrow(/permission denied|row-level security|violates/i);

/** Creates a booking directly in the given state (as superuser; test setup only). */
async function booking(status: string, pay: string): Promise<string> {
  const n = ++seq;
  const needsRef = pay === "awaiting_verification" || pay === "verified";
  const r = await db.query<any>(
    `insert into public.bookings
       (pooja_id, pooja_name, booking_date, devotee_name, phone, email, amount_inr,
        access_token_hash, status, payment_status, upi_ref,
        payment_verified_at, payment_verified_by)
     select id, name, '2027-02-01', 'Devotee ' || $1::text, '90000' || lpad($1::text, 5, '0'),
            'd@example.com', 500, $2, $3, $4, $5,
            case when $4 = 'verified' then now() end,
            case when $4 = 'verified' then $6::uuid end
       from public.poojas where slug = 'p-daily'
     returning id`,
    [
      n,
      "a".repeat(64),
      status,
      pay,
      needsRef ? `UTRREF${String(n).padStart(8, "0")}` : null,
      ADMIN,
    ],
  );
  return r.rows[0].id;
}

const act = (
  uid: string,
  id: string,
  action: string,
  note: string | null = "reason",
) =>
  as("authenticated", uid, () =>
    db.query<any>("select * from public.admin_booking_action($1, $2, $3)", [
      id,
      action,
      note,
    ]),
  );
const state = async (id: string) =>
  (
    await db.query<any>(
      "select status, payment_status from public.bookings where id = $1",
      [id],
    )
  ).rows[0];
const auditRows = async (id: string) =>
  (
    await db.query<any>(
      "select * from public.booking_audit_log where booking_id = $1 order by created_at, id",
      [id],
    )
  ).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    insert into auth.users values ('${ADMIN}', 'admin@example.com'), ('${OTHER_ADMIN}', 'second@example.com'), ('${USER}', 'user@example.com');
  `);
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(`
    insert into public.admin_users values ('${ADMIN}', 'admin@example.com'), ('${OTHER_ADMIN}', 'second@example.com');
    insert into public.poojas (slug, name, type, amount_inr) values ('p-daily', 'Daily Pooja', 'daily', 500);
  `);
});

describe("function hardening", () => {
  it("is SECURITY DEFINER with a pinned search_path", async () => {
    const r = await db.query<any>(
      "select prosecdef, proconfig from pg_proc where proname = 'admin_booking_action'",
    );
    expect(r.rows[0].prosecdef).toBe(true);
    expect(String(r.rows[0].proconfig)).toContain("search_path=");
  });
  it("anon cannot execute it; a signed-in non-admin is refused", async () => {
    const id = await booking("pending", "awaiting_verification");
    await denied(
      as("anon", null, () =>
        db.query(
          "select * from public.admin_booking_action($1, 'verify_payment', null)",
          [id],
        ),
      ),
    );
    await expect(act(USER, id, "verify_payment", null)).rejects.toThrow(
      /forbidden/,
    );
    expect(await state(id)).toEqual({
      status: "pending",
      payment_status: "awaiting_verification",
    });
    expect(await auditRows(id)).toHaveLength(0);
  });
  it("rejects unknown bookings and unknown actions", async () => {
    const id = await booking("pending", "unpaid");
    await expect(
      act(ADMIN, "00000000-0000-0000-0000-00000000dead", "add_note"),
    ).rejects.toThrow(/booking_not_found/);
    await expect(act(ADMIN, id, "mark_paid")).rejects.toThrow(/invalid_action/);
    await expect(act(ADMIN, id, "status = 'verified'")).rejects.toThrow(
      /invalid_action/,
    );
  });
});

describe("transition rules: SQL and the TypeScript mirror agree on every state/action", () => {
  const statuses = ["pending", "confirmed", "cancelled"] as const;
  const payments = [
    "unpaid",
    "awaiting_verification",
    "verified",
    "rejected",
  ] as const;
  const EXPECT = {
    verify_payment: (s: string, p: string) => ({
      status: s,
      payment_status: "verified",
    }),
    reject_payment: (s: string, p: string) => ({
      status: s,
      payment_status: "rejected",
    }),
    confirm_booking: (s: string, p: string) => ({
      status: "confirmed",
      payment_status: p,
    }),
    cancel_booking: (s: string, p: string) => ({
      status: "cancelled",
      payment_status: p,
    }),
    add_note: (s: string, p: string) => ({ status: s, payment_status: p }),
  } as const;

  for (const s of statuses) {
    for (const p of payments) {
      it(`status=${s} payment=${p}`, async () => {
        for (const action of BOOKING_ACTIONS) {
          const id = await booking(s, p);
          const permitted = allowedActions(s, p).includes(action);
          if (permitted) {
            await act(ADMIN, id, action, "note");
            expect(await state(id)).toEqual(EXPECT[action](s, p));
            expect(await auditRows(id)).toHaveLength(1);
          } else {
            await expect(act(ADMIN, id, action, "note")).rejects.toThrow(
              /invalid_transition/,
            );
            expect(await state(id)).toEqual({ status: s, payment_status: p });
            expect(await auditRows(id)).toHaveLength(0); // a refused action leaves no trace and no change
          }
        }
      });
    }
  }
});

describe("notes", () => {
  it("are required for reject, cancel and add_note (blank counts as missing)", async () => {
    for (const [action, s, p] of [
      ["reject_payment", "pending", "awaiting_verification"],
      ["cancel_booking", "pending", "unpaid"],
      ["add_note", "pending", "unpaid"],
    ] as const) {
      const id = await booking(s, p);
      await expect(act(ADMIN, id, action, null)).rejects.toThrow(
        /note_required/,
      );
      await expect(act(ADMIN, id, action, "   ")).rejects.toThrow(
        /note_required/,
      );
      expect(await auditRows(id)).toHaveLength(0);
    }
  });
  it("are optional for verify/confirm and capped at 1000 characters", async () => {
    const id = await booking("pending", "awaiting_verification");
    await act(ADMIN, id, "verify_payment", null);
    await act(ADMIN, id, "confirm_booking", null);
    await expect(act(ADMIN, id, "add_note", "x".repeat(1001))).rejects.toThrow(
      /note_too_long/,
    );
  });
});

describe("audit trail", () => {
  it("records the acting admin, their email, the states and the time", async () => {
    const id = await booking("pending", "awaiting_verification");
    await act(ADMIN, id, "verify_payment", "Matched bank statement");
    const [row] = await auditRows(id);
    expect(row).toMatchObject({
      booking_id: id,
      admin_id: ADMIN,
      admin_email: "admin@example.com",
      action: "verify_payment",
      from_status: "pending",
      to_status: "pending",
      from_payment_status: "awaiting_verification",
      to_payment_status: "verified",
      note: "Matched bank statement",
    });
    expect(
      Math.abs(Date.now() - new Date(row.created_at).getTime()),
    ).toBeLessThan(60_000);
    // verification stamped on the booking from the same identity
    const b = (
      await db.query<any>(
        "select payment_verified_by, payment_verified_at from public.bookings where id = $1",
        [id],
      )
    ).rows[0];
    expect(b.payment_verified_by).toBe(ADMIN);
    expect(b.payment_verified_at).not.toBeNull();
  });
  it("attributes each action to the admin who performed it", async () => {
    const id = await booking("pending", "awaiting_verification");
    await act(ADMIN, id, "verify_payment", null);
    await act(OTHER_ADMIN, id, "confirm_booking", null);
    await act(OTHER_ADMIN, id, "add_note", "Called devotee");
    const rows = await auditRows(id);
    expect(rows.map((r) => [r.action, r.admin_id])).toEqual([
      ["verify_payment", ADMIN],
      ["confirm_booking", OTHER_ADMIN],
      ["add_note", OTHER_ADMIN],
    ]);
  });
  it("is append-only: admins cannot insert, edit or delete audit rows", async () => {
    const id = await booking("pending", "unpaid");
    await act(ADMIN, id, "add_note", "first");
    for (const sql of [
      `insert into public.booking_audit_log (booking_id, admin_id, action, from_status, to_status, from_payment_status, to_payment_status) values ('${id}', '${ADMIN}', 'add_note', 'pending', 'pending', 'unpaid', 'unpaid')`,
      "update public.booking_audit_log set note = 'tampered'",
      "delete from public.booking_audit_log",
    ]) {
      await denied(as("authenticated", ADMIN, () => db.query(sql)));
    }
    expect((await auditRows(id))[0].note).toBe("first");
  });
  it("is readable by admins only", async () => {
    const id = await booking("pending", "unpaid");
    await act(ADMIN, id, "add_note", "visible?");
    const adminSees = await as("authenticated", ADMIN, () =>
      db.query<any>(
        "select note from public.booking_audit_log where booking_id = $1",
        [id],
      ),
    );
    expect(adminSees.rows).toHaveLength(1);
    const userSees = await as("authenticated", USER, () =>
      db.query<any>(
        "select note from public.booking_audit_log where booking_id = $1",
        [id],
      ),
    );
    expect(userSees.rows).toHaveLength(0);
    await denied(
      as("anon", null, () =>
        db.query("select * from public.booking_audit_log"),
      ),
    );
  });
});

describe("duplicate and sequential-concurrent actions", () => {
  it("a payment can only be verified once", async () => {
    const id = await booking("pending", "awaiting_verification");
    await act(ADMIN, id, "verify_payment", null);
    await expect(act(OTHER_ADMIN, id, "verify_payment", null)).rejects.toThrow(
      /invalid_transition/,
    );
    expect(
      (await auditRows(id)).filter((r) => r.action === "verify_payment"),
    ).toHaveLength(1);
  });
  it("a verified payment cannot then be rejected, and a rejected one cannot be verified", async () => {
    const a = await booking("pending", "awaiting_verification");
    await act(ADMIN, a, "verify_payment", null);
    await expect(act(ADMIN, a, "reject_payment", "oops")).rejects.toThrow(
      /invalid_transition/,
    );
    const b = await booking("pending", "awaiting_verification");
    await act(ADMIN, b, "reject_payment", "no match");
    await expect(act(ADMIN, b, "verify_payment", null)).rejects.toThrow(
      /invalid_transition/,
    );
  });
  it("a cancelled booking is terminal", async () => {
    const id = await booking("pending", "awaiting_verification");
    await act(ADMIN, id, "cancel_booking", "requested by devotee");
    for (const a of [
      "verify_payment",
      "reject_payment",
      "confirm_booking",
      "cancel_booking",
    ]) {
      await expect(act(ADMIN, id, a, "x")).rejects.toThrow(
        /invalid_transition/,
      );
    }
    await act(ADMIN, id, "add_note", "refund handled offline"); // notes still allowed
  });
  it("confirming requires a verified payment", async () => {
    const id = await booking("pending", "awaiting_verification");
    await expect(act(ADMIN, id, "confirm_booking", null)).rejects.toThrow(
      /invalid_transition/,
    );
    await act(ADMIN, id, "verify_payment", null);
    await act(ADMIN, id, "confirm_booking", null);
    expect(await state(id)).toEqual({
      status: "confirmed",
      payment_status: "verified",
    });
  });
});
