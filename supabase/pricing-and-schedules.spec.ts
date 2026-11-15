/**
 * Price administration, schedule administration, audit trails and the explicit
 * handling of existing bookings, against the real migrations on a clean database.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN,
  OTHER_ADMIN,
  USER,
  createTestDb,
  denied,
  type TestDb,
} from "./testDb";

let t: TestDb;
const q = (sql: string, params?: any[]) => t.db.query<any>(sql, params);
const as = (uid: string | null, fn: () => Promise<any>) =>
  t.as(uid ? "authenticated" : "anon", uid, fn);
const call = (uid: string, sql: string, params: any[] = []) =>
  as(uid, () => q(sql, params));

const ids: Record<string, string> = {};
let seq = 0;

async function booking(opts: {
  pooja: string;
  date: string;
  status?: string;
  amount?: number;
}) {
  const n = ++seq;
  const r = await q(
    `insert into public.bookings (pooja_id, pooja_name, booking_date, devotee_name, phone, email, amount_inr, access_token_hash, status)
     select id, name, $2::date, 'Devotee ' || $3::text, '91000' || lpad($3::text, 5, '0'), 'd@example.com', $4, $5, $6
       from public.poojas where slug = $1 returning id, order_no`,
    [
      opts.pooja,
      opts.date,
      n,
      opts.amount ?? 1000,
      "a".repeat(64),
      opts.status ?? "pending",
    ],
  );
  return r.rows[0] as { id: string; order_no: string };
}
const bookingRow = async (id: string) =>
  (
    await q(
      "select booking_date::text d, status, amount_inr::float8 amt from public.bookings where id = $1",
      [id],
    )
  ).rows[0];
const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return e;
  }
  throw new Error("expected the call to fail");
};

beforeAll(async () => {
  t = await createTestDb();
  await t.db.exec(`
    insert into public.poojas (slug, name, type, amount_inr) values
      ('p-daily', 'Daily Pooja', 'daily', 100),
      ('p-panch', 'Pradosham', 'panchangam', 300),
      ('p-special', 'Homam', 'special', null),
      ('p-special2', 'Other Homam', 'special', 1500);
  `);
  for (const s of ["p-daily", "p-panch", "p-special", "p-special2"]) {
    ids[s] = (
      await q("select id from public.poojas where slug = $1", [s])
    ).rows[0].id;
  }
});

// =================================================================================
describe("price administration", () => {
  const setPrice = (
    uid: string,
    slug: string,
    amount: number | null,
    reason: string | null,
  ) =>
    call(uid, "select * from public.admin_set_pooja_price($1, $2, $3)", [
      ids[slug],
      amount,
      reason,
    ]);

  it("an admin sets one fixed INR amount; the change is audited with identity, time, old and new value", async () => {
    const r = await setPrice(
      ADMIN,
      "p-special",
      1200,
      "Approved by trustees, 14 Nov",
    );
    expect(r.rows[0].old_amount).toBeNull();
    expect(Number(r.rows[0].new_amount)).toBe(1200);
    expect(
      (
        await q(
          "select amount_inr::float8 a from public.poojas where slug = 'p-special'",
        )
      ).rows[0].a,
    ).toBe(1200);

    const [a] = (
      await q(
        "select * from public.pooja_price_audit_log where pooja_id = $1",
        [ids["p-special"]],
      )
    ).rows;
    expect(a).toMatchObject({
      admin_id: ADMIN,
      admin_email: "admin@example.com",
      pooja_name: "Homam",
      old_amount: null,
      reason: "Approved by trustees, 14 Nov",
    });
    expect(
      Math.abs(Date.now() - new Date(a.created_at).getTime()),
    ).toBeLessThan(60_000);
  });

  it("records every change in order, attributed to whoever made it", async () => {
    await setPrice(OTHER_ADMIN, "p-special", 1300, "Revised after review");
    await setPrice(ADMIN, "p-special", 1250.5, "Rounding corrected");
    const log = (
      await q(
        "select admin_email, old_amount::float8 o, new_amount::float8 n from public.pooja_price_audit_log where pooja_id = $1 order by created_at, id",
        [ids["p-special"]],
      )
    ).rows;
    expect(log.map((x) => [x.admin_email, x.o, x.n])).toEqual([
      ["admin@example.com", null, 1200],
      ["second@example.com", 1200, 1300],
      ["admin@example.com", 1300, 1250.5],
    ]);
  });

  it("only administrators may change prices", async () => {
    await expect(setPrice(USER, "p-daily", 999, "attempt")).rejects.toThrow(
      /forbidden/,
    );
    await denied(
      as(null, () =>
        q("select * from public.admin_set_pooja_price($1, 5, 'x')", [
          ids["p-daily"],
        ]),
      ),
    );
    expect(
      (
        await q(
          "select amount_inr::float8 a from public.poojas where slug = 'p-daily'",
        )
      ).rows[0].a,
    ).toBe(100);
  });

  it("there is no other route: admins cannot UPDATE poojas directly", async () => {
    await denied(
      call(
        ADMIN,
        "update public.poojas set amount_inr = 1 where slug = 'p-daily'",
      ),
    );
  });

  it("requires a written reason", async () => {
    for (const reason of [null, "", "   ", "ab"]) {
      await expect(setPrice(ADMIN, "p-daily", 110, reason)).rejects.toThrow(
        /reason_required/,
      );
    }
    await expect(
      setPrice(ADMIN, "p-daily", 110, "x".repeat(501)),
    ).rejects.toThrow(/reason_too_long/);
  });

  it("accepts only a positive INR amount with at most two decimals", async () => {
    for (const bad of [0, -1, 1000000.01, 10.123]) {
      await expect(
        setPrice(ADMIN, "p-daily", bad, "valid reason"),
      ).rejects.toThrow(/invalid_amount/);
    }
    await setPrice(ADMIN, "p-daily", 1000000, "upper bound is allowed");
    await setPrice(ADMIN, "p-daily", 100, "restore");
  });

  it("rejects unknown poojas and no-op changes (nothing is logged for them)", async () => {
    const before = (
      await q("select count(*)::int n from public.pooja_price_audit_log")
    ).rows[0].n;
    await expect(
      call(
        ADMIN,
        "select * from public.admin_set_pooja_price($1, 5, 'valid reason')",
        ["00000000-0000-0000-0000-00000000dead"],
      ),
    ).rejects.toThrow(/pooja_not_found/);
    await expect(setPrice(ADMIN, "p-daily", 100, "same price")).rejects.toThrow(
      /no_change/,
    );
    expect(
      (await q("select count(*)::int n from public.pooja_price_audit_log"))
        .rows[0].n,
    ).toBe(before);
  });

  it("a withdrawn price (NULL) closes booking and is audited", async () => {
    await setPrice(ADMIN, "p-special2", null, "Pending re-approval");
    expect(
      (
        await q(
          "select amount_inr from public.poojas where slug = 'p-special2'",
        )
      ).rows[0].amount_inr,
    ).toBeNull();
    const last = (
      await q(
        "select old_amount::float8 o, new_amount n from public.pooja_price_audit_log where pooja_id = $1 order by created_at desc, id desc limit 1",
        [ids["p-special2"]],
      )
    ).rows[0];
    expect(last).toEqual({ o: 1500, n: null });
    await setPrice(ADMIN, "p-special2", 1500, "Re-approved");
  });

  it("changes made outside the API (SQL operator / seeding) are audited as 'system'", async () => {
    await q("update public.poojas set amount_inr = 105 where slug = 'p-daily'");
    const last = (
      await q(
        "select admin_id, admin_email, old_amount::float8 o, new_amount::float8 n, reason from public.pooja_price_audit_log where pooja_id = $1 order by created_at desc, id desc limit 1",
        [ids["p-daily"]],
      )
    ).rows[0];
    expect(last).toEqual({
      admin_id: null,
      admin_email: null,
      o: 100,
      n: 105,
      reason: null,
    });
    await setPrice(ADMIN, "p-daily", 100, "restore after test");
  });

  describe("historical booking prices", () => {
    it("existing bookings keep the amount they were made at; new bookings use the new price", async () => {
      await setPrice(ADMIN, "p-panch", 300, "baseline").catch(() => {}); // already 300: no-op
      const early = await booking({
        pooja: "p-panch",
        date: "2099-03-01",
        amount: 300,
      });
      await setPrice(ADMIN, "p-panch", 450, "Annual revision");
      const late = await booking({
        pooja: "p-panch",
        date: "2099-03-02",
        amount: 450,
      });
      await setPrice(ADMIN, "p-panch", 600, "Second revision");

      expect((await bookingRow(early.id)).amt).toBe(300);
      expect((await bookingRow(late.id)).amt).toBe(450);
      expect(
        (
          await q(
            "select amount_inr::float8 a from public.poojas where slug = 'p-panch'",
          )
        ).rows[0].a,
      ).toBe(600);
    });
    it("the stored booking amount cannot be edited by anyone, so a price change can never rewrite history", async () => {
      const b = await booking({
        pooja: "p-panch",
        date: "2099-03-03",
        amount: 600,
      });
      await expect(
        q("update public.bookings set amount_inr = 1 where id = $1", [b.id]),
      ).rejects.toThrow(/booking_snapshot_is_immutable/);
      await denied(
        call(ADMIN, "update public.bookings set amount_inr = 1 where id = $1", [
          b.id,
        ]),
      );
    });
  });

  describe("audit trail is append-only and admin-readable only", () => {
    it("nobody can edit, delete or truncate price history (even as the table owner)", async () => {
      await expect(
        q("update public.pooja_price_audit_log set new_amount = 1"),
      ).rejects.toThrow(/audit_log_is_append_only/);
      await expect(
        q("delete from public.pooja_price_audit_log"),
      ).rejects.toThrow(/audit_log_is_append_only/);
      await expect(q("truncate public.pooja_price_audit_log")).rejects.toThrow(
        /audit_log_is_append_only/,
      );
      await denied(
        call(ADMIN, "update public.pooja_price_audit_log set new_amount = 1"),
      );
      await denied(
        call(
          ADMIN,
          "insert into public.pooja_price_audit_log (pooja_id, pooja_name) values ($1, 'x')",
          [ids["p-daily"]],
        ),
      );
    });
    it("is readable by admins, hidden from everyone else", async () => {
      expect(
        (await call(ADMIN, "select * from public.pooja_price_audit_log")).rows
          .length,
      ).toBeGreaterThan(5);
      expect(
        (await call(USER, "select * from public.pooja_price_audit_log")).rows,
      ).toHaveLength(0);
      await denied(
        as(null, () => q("select * from public.pooja_price_audit_log")),
      );
    });
  });
});

// =================================================================================
describe("special pooja date administration", () => {
  const create = (
    uid: string,
    slug: string,
    date: string,
    time: string | null = null,
    notes: string | null = null,
    reason: string | null = null,
  ) =>
    call(
      uid,
      "select public.admin_special_schedule_create($1, $2, $3, $4, $5) as id",
      [ids[slug], date, time, notes, reason],
    );
  const update = (
    uid: string,
    id: string,
    patch: object,
    handling: string | null = null,
    reason: string | null = null,
  ) =>
    call(
      uid,
      "select * from public.admin_special_schedule_update($1, $2::jsonb, $3, $4)",
      [id, JSON.stringify(patch), handling, reason],
    );
  const auditFor = async (recordId: string) =>
    (
      await q(
        "select * from public.schedule_audit_log where record_id = $1 order by created_at, id",
        [recordId],
      )
    ).rows;

  it("creates a date for a special pooja and audits it (who, when, new values)", async () => {
    const r = await create(
      ADMIN,
      "p-special",
      "2099-06-01",
      "10:00",
      " Bring flowers ",
      "Trustee request",
    );
    const id = r.rows[0].id;
    const row = (
      await q(
        "select date::text d, start_time::text st, notes from public.special_pooja_schedule where id = $1",
        [id],
      )
    ).rows[0];
    expect(row).toEqual({
      d: "2099-06-01",
      st: "10:00:00",
      notes: "Bring flowers",
    });
    const [a] = await auditFor(id);
    expect(a).toMatchObject({
      schedule_table: "special_pooja_schedule",
      action: "insert",
      admin_id: ADMIN,
      admin_email: "admin@example.com",
      pooja_name: "Homam",
      old_values: null,
      reason: "Trustee request",
    });
    expect(a.new_values).toMatchObject({
      date: "2099-06-01",
      start_time: "10:00:00",
      active: true,
    });
    expect(a.new_values.updated_at).toBeUndefined(); // noise is excluded from the comparison snapshot
  });

  it("refuses non-admins, non-special poojas, past dates, unknown poojas and duplicates", async () => {
    await expect(create(USER, "p-special", "2099-06-02")).rejects.toThrow(
      /forbidden/,
    );
    await denied(
      as(null, () =>
        q("select public.admin_special_schedule_create($1, '2099-06-02')", [
          ids["p-special"],
        ]),
      ),
    );
    await expect(create(ADMIN, "p-daily", "2099-06-02")).rejects.toThrow(
      /not_a_special_pooja/,
    );
    await expect(create(ADMIN, "p-panch", "2099-06-02")).rejects.toThrow(
      /not_a_special_pooja/,
    );
    await expect(create(ADMIN, "p-special", "2000-01-01")).rejects.toThrow(
      /date_in_past/,
    );
    await expect(
      call(
        ADMIN,
        "select public.admin_special_schedule_create($1, '2099-06-02')",
        ["00000000-0000-0000-0000-00000000dead"],
      ),
    ).rejects.toThrow(/pooja_not_found/);
    await expect(create(ADMIN, "p-special", "2099-06-01")).rejects.toThrow(
      /violates unique|duplicate/i,
    );
  });

  it("edits time and notes, recording old and new values; a no-op edit records nothing", async () => {
    const id = (await create(ADMIN, "p-special2", "2099-07-01", "09:00"))
      .rows[0].id;
    await update(
      OTHER_ADMIN,
      id,
      { start_time: "11:30", notes: "Moved to main hall" },
      null,
      "Hall booked",
    );
    const logs = await auditFor(id);
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({
      action: "update",
      admin_email: "second@example.com",
      reason: "Hall booked",
      affected_handling: null,
    });
    expect(logs[1].old_values).toMatchObject({
      start_time: "09:00:00",
      notes: null,
    });
    expect(logs[1].new_values).toMatchObject({
      start_time: "11:30:00",
      notes: "Moved to main hall",
    });
    await update(ADMIN, id, { start_time: "11:30" }); // identical value
    expect(await auditFor(id)).toHaveLength(2);
  });

  it("validates patches", async () => {
    const id = (await create(ADMIN, "p-special2", "2099-07-02")).rows[0].id;
    for (const bad of [
      {},
      { poojaId: "x" },
      { amount: 5 },
      { active: null },
      { date: null },
    ]) {
      await expect(update(ADMIN, id, bad)).rejects.toThrow(/invalid_patch/);
    }
    await expect(update(ADMIN, id, { date: "2000-01-01" })).rejects.toThrow(
      /date_in_past/,
    );
    await expect(update(USER, id, { notes: "x" })).rejects.toThrow(/forbidden/);
    await expect(
      update(ADMIN, "00000000-0000-0000-0000-00000000dead", { notes: "x" }),
    ).rejects.toThrow(/schedule_not_found/);
  });

  it("cannot move or disable a date in the past (history is preserved)", async () => {
    const old = (
      await q(
        `insert into public.special_pooja_schedule (pooja_id, date) values ($1, '2020-01-01') returning id`,
        [ids["p-special"]],
      )
    ).rows[0].id;
    await expect(update(ADMIN, old, { active: false })).rejects.toThrow(
      /schedule_in_past/,
    );
    await expect(update(ADMIN, old, { date: "2099-08-01" })).rejects.toThrow(
      /schedule_in_past/,
    );
    await update(ADMIN, old, { notes: "historic note" }); // harmless edits still fine
  });

  describe("existing bookings are never silently moved or cancelled", () => {
    let sid: string;
    let b1: { id: string; order_no: string };
    let b2: { id: string; order_no: string };
    let cancelled: { id: string };

    async function fresh(date: string) {
      sid = (await create(ADMIN, "p-special", date)).rows[0].id;
      b1 = await booking({ pooja: "p-special", date, amount: 1250.5 });
      b2 = await booking({
        pooja: "p-special",
        date,
        status: "confirmed",
        amount: 1250.5,
      });
      cancelled = await booking({
        pooja: "p-special",
        date,
        status: "cancelled",
        amount: 1250.5,
      });
    }

    it("moving a date with live bookings is REFUSED until the admin chooses; nothing changes", async () => {
      await fresh("2099-09-01");
      const e = await errorOf(update(ADMIN, sid, { date: "2099-09-05" }));
      expect(e.message).toMatch(/affected_bookings_unresolved/);
      const detail = JSON.parse(e.detail);
      expect(detail.count).toBe(2); // the cancelled booking is not "affected"
      expect(detail.orders.sort()).toEqual([b1.order_no, b2.order_no].sort());
      expect(
        (
          await q(
            "select date::text d from public.special_pooja_schedule where id = $1",
            [sid],
          )
        ).rows[0].d,
      ).toBe("2099-09-01");
      expect((await bookingRow(b1.id)).d).toBe("2099-09-01");
      // disabling is refused in the same way
      await expect(update(ADMIN, sid, { active: false })).rejects.toThrow(
        /affected_bookings_unresolved/,
      );
    });

    it("an unrelated edit (notes/time) does not require a decision and leaves bookings alone", async () => {
      await update(ADMIN, sid, { notes: "Updated note", start_time: "08:00" });
      expect((await bookingRow(b1.id)).d).toBe("2099-09-01");
    });

    it("'keep': the admin explicitly acknowledges; bookings stay untouched and the audit lists them", async () => {
      const r = await update(
        ADMIN,
        sid,
        { date: "2099-09-05" },
        "keep",
        "Priest unavailable; will phone devotees",
      );
      expect(r.rows[0]).toEqual({
        affected_count: 2,
        cancelled_count: 0,
        moved_count: 0,
      });
      expect((await bookingRow(b1.id)).d).toBe("2099-09-01"); // NOT moved
      expect((await bookingRow(b1.id)).status).toBe("pending"); // NOT cancelled
      const last = (await auditFor(sid)).pop();
      expect(last).toMatchObject({
        action: "update",
        admin_id: ADMIN,
        affected_handling: "keep",
        reason: "Priest unavailable; will phone devotees",
      });
      expect(last.affected_bookings.sort()).toEqual(
        [b1.order_no, b2.order_no].sort(),
      );
      expect(last.old_values.date).toBe("2099-09-01");
      expect(last.new_values.date).toBe("2099-09-05");
    });

    it("'cancel': bookings are cancelled explicitly, each with its own audit entry; refunds stay manual", async () => {
      await fresh("2099-10-01");
      const r = await update(
        ADMIN,
        sid,
        { active: false },
        "cancel",
        "Pooja cancelled this month",
      );
      expect(r.rows[0]).toEqual({
        affected_count: 2,
        cancelled_count: 2,
        moved_count: 0,
      });
      expect((await bookingRow(b1.id)).status).toBe("cancelled");
      expect((await bookingRow(b2.id)).status).toBe("cancelled");
      expect((await bookingRow(b1.id)).amt).toBe(1250.5); // amount history intact
      const logs = (
        await q(
          "select action, admin_email, from_status, to_status, note from public.booking_audit_log where booking_id = any($1) order by action",
          [[b1.id, b2.id]],
        )
      ).rows;
      expect(logs).toHaveLength(2);
      expect(
        logs.every(
          (l) =>
            l.action === "schedule_cancel" &&
            l.admin_email === "admin@example.com" &&
            l.note === "Schedule change: Pooja cancelled this month",
        ),
      ).toBe(true);
      expect(logs.map((l) => l.from_status).sort()).toEqual([
        "confirmed",
        "pending",
      ]);
      expect(
        (
          await q(
            "select active from public.special_pooja_schedule where id = $1",
            [sid],
          )
        ).rows[0].active,
      ).toBe(false);
    });

    it("'move': bookings move to the new date explicitly and are audited", async () => {
      await fresh("2099-11-01");
      const r = await update(
        ADMIN,
        sid,
        { date: "2099-11-08" },
        "move",
        "Festival date changed",
      );
      expect(r.rows[0]).toEqual({
        affected_count: 2,
        cancelled_count: 0,
        moved_count: 2,
      });
      expect((await bookingRow(b1.id)).d).toBe("2099-11-08");
      expect((await bookingRow(b2.id)).d).toBe("2099-11-08");
      expect((await bookingRow(cancelled.id)).d).toBe("2099-11-01"); // cancelled booking left alone
      const log = (
        await q(
          "select action, note from public.booking_audit_log where booking_id = $1",
          [b1.id],
        )
      ).rows[0];
      expect(log).toEqual({
        action: "schedule_move",
        note: "Moved from 2099-11-01 to 2099-11-08: Festival date changed",
      });
      expect((await auditFor(sid)).pop()).toMatchObject({
        affected_handling: "move",
      });
    });

    it("requires a written reason and a valid choice", async () => {
      await fresh("2099-12-01");
      await expect(
        update(ADMIN, sid, { date: "2099-12-09" }, "keep", null),
      ).rejects.toThrow(/reason_required/);
      await expect(
        update(ADMIN, sid, { date: "2099-12-09" }, "keep", "ab"),
      ).rejects.toThrow(/reason_required/);
      await expect(
        update(ADMIN, sid, { date: "2099-12-09" }, "delete", "valid reason"),
      ).rejects.toThrow(/invalid_handling/);
      await expect(
        update(ADMIN, sid, { active: false }, "move", "valid reason"),
      ).rejects.toThrow(/invalid_handling/); // cannot move when only disabling
      await expect(
        update(
          ADMIN,
          sid,
          { date: "2099-12-09", active: false },
          "move",
          "valid reason",
        ),
      ).rejects.toThrow(/invalid_handling/);
      expect((await bookingRow(b1.id)).d).toBe("2099-12-01");
    });

    it("a failed move (devotee already booked on the target date) rolls everything back", async () => {
      await fresh("2100-01-01");
      // same devotee (name/phone) already has a live booking for the target date -> unique index conflict
      await q(
        `insert into public.bookings (pooja_id, pooja_name, booking_date, devotee_name, phone, email, amount_inr, access_token_hash)
         select pooja_id, pooja_name, '2100-01-09', devotee_name, phone, email, amount_inr, $2 from public.bookings where id = $1`,
        [b1.id, "b".repeat(64)],
      );
      await expect(
        update(ADMIN, sid, { date: "2100-01-09" }, "move", "Date change"),
      ).rejects.toThrow(/violates unique|duplicate/i);
      expect(
        (
          await q(
            "select date::text d from public.special_pooja_schedule where id = $1",
            [sid],
          )
        ).rows[0].d,
      ).toBe("2100-01-01");
      expect((await bookingRow(b1.id)).d).toBe("2100-01-01");
      expect((await bookingRow(b2.id)).d).toBe("2100-01-01");
      expect(
        (
          await q(
            "select count(*)::int n from public.booking_audit_log where booking_id = any($1)",
            [[b1.id, b2.id]],
          )
        ).rows[0].n,
      ).toBe(0);
    });

    it("a date with no live bookings can be moved or disabled without any decision", async () => {
      const id = (await create(ADMIN, "p-special2", "2100-02-01")).rows[0].id;
      const r = await update(ADMIN, id, { date: "2100-02-02" });
      expect(r.rows[0]).toEqual({
        affected_count: 0,
        cancelled_count: 0,
        moved_count: 0,
      });
      await update(ADMIN, id, { active: false });
      await update(ADMIN, id, { active: true });
      expect((await auditFor(id)).map((a) => a.action)).toEqual([
        "insert",
        "update",
        "update",
        "update",
      ]);
    });
  });

  it("direct table writes by an administrator are not possible", async () => {
    for (const sql of [
      "insert into public.special_pooja_schedule (pooja_id, date) select id, '2099-01-01' from public.poojas limit 1",
      "update public.special_pooja_schedule set date = '2099-01-02'",
      "delete from public.special_pooja_schedule",
    ]) {
      await denied(call(ADMIN, sql));
    }
  });
});

// =================================================================================
describe("recurring and Panchangam rule administration", () => {
  const setActive = (
    uid: string,
    kind: string,
    id: string,
    active: boolean,
    handling: string | null = null,
    reason: string | null = null,
  ) =>
    call(
      uid,
      "select * from public.admin_schedule_rule_set_active($1, $2, $3, $4, $5)",
      [kind, id, active, handling, reason],
    );

  let recurringId: string;
  let panchId: string;
  beforeAll(async () => {
    recurringId = (
      await q(
        `insert into public.recurring_pooja_schedule (pooja_id, recurrence, start_time) values ($1, 'daily', '09:15') returning id`,
        [ids["p-daily"]],
      )
    ).rows[0].id;
    panchId = (
      await q(
        `insert into public.panchangam_pooja_rules (pooja_id, tithis, start_time) values ($1, array['trayodashi'], '17:30') returning id`,
        [ids["p-panch"]],
      )
    ).rows[0].id;
  });

  it("disables and re-enables a rule when no future bookings depend on it, with an audit entry each time", async () => {
    await setActive(
      ADMIN,
      "recurring",
      recurringId,
      false,
      null,
      "Seasonal pause",
    );
    await setActive(OTHER_ADMIN, "recurring", recurringId, true);
    const logs = (
      await q(
        "select action, admin_email, old_values->>'active' o, new_values->>'active' n, reason from public.schedule_audit_log where record_id = $1 and action = 'update' order by created_at, id",
        [recurringId],
      )
    ).rows;
    expect(logs).toEqual([
      {
        action: "update",
        admin_email: "admin@example.com",
        o: "true",
        n: "false",
        reason: "Seasonal pause",
      },
      {
        action: "update",
        admin_email: "second@example.com",
        o: "false",
        n: "true",
        reason: null,
      },
    ]);
  });

  it("refuses to disable a rule while the pooja has live future bookings, until acknowledged with 'keep'", async () => {
    const live = await booking({ pooja: "p-panch", date: "2099-04-01" });
    const e = await errorOf(setActive(ADMIN, "panchangam", panchId, false));
    expect(e.message).toMatch(/affected_bookings_unresolved/);
    const detail = JSON.parse(e.detail);
    const liveNow = (
      await q(
        `select count(*)::int n from public.bookings b join public.poojas p on p.id = b.pooja_id
          where p.slug = 'p-panch' and b.status <> 'cancelled' and b.booking_date >= current_date`,
      )
    ).rows[0].n;
    expect(detail.count).toBe(liveNow); // every live future booking of the pooja is listed...
    expect(detail.count).toBeGreaterThanOrEqual(1);
    expect(detail.orders).toContain(live.order_no); // ...including this one
    expect(
      (
        await q(
          "select active from public.panchangam_pooja_rules where id = $1",
          [panchId],
        )
      ).rows[0].active,
    ).toBe(true);

    await expect(
      setActive(ADMIN, "panchangam", panchId, false, "keep"),
    ).rejects.toThrow(/reason_required/);
    // bulk-cancelling or moving through a rule change is not offered
    await expect(
      setActive(ADMIN, "panchangam", panchId, false, "cancel", "valid reason"),
    ).rejects.toThrow(/invalid_handling/);
    await expect(
      setActive(ADMIN, "panchangam", panchId, false, "move", "valid reason"),
    ).rejects.toThrow(/invalid_handling/);

    await setActive(
      ADMIN,
      "panchangam",
      panchId,
      false,
      "keep",
      "Rule being rewritten",
    );
    expect((await bookingRow(live.id)).status).toBe("pending"); // booking untouched
    const last = (
      await q(
        "select * from public.schedule_audit_log where record_id = $1 order by created_at desc, id desc limit 1",
        [panchId],
      )
    ).rows[0];
    expect(last).toMatchObject({
      schedule_table: "panchangam_pooja_rules",
      affected_handling: "keep",
      reason: "Rule being rewritten",
      admin_id: ADMIN,
    });
    expect(last.affected_bookings).toContain(live.order_no);
    await setActive(ADMIN, "panchangam", panchId, true); // re-enabling needs no decision
  });

  it("validates input and permissions", async () => {
    await expect(
      setActive(USER, "recurring", recurringId, false),
    ).rejects.toThrow(/forbidden/);
    await denied(
      as(null, () =>
        q(
          "select * from public.admin_schedule_rule_set_active('recurring', $1, false)",
          [recurringId],
        ),
      ),
    );
    await expect(
      setActive(ADMIN, "weekly", recurringId, false),
    ).rejects.toThrow(/invalid_kind/);
    await expect(
      setActive(
        ADMIN,
        "recurring",
        "00000000-0000-0000-0000-00000000dead",
        false,
      ),
    ).rejects.toThrow(/schedule_not_found/);
    await expect(
      setActive(ADMIN, "recurring", recurringId, true),
    ).rejects.toThrow(/no_change/);
  });

  it("rule edits made directly in SQL (operator) are audited as 'system'", async () => {
    await q(
      "update public.panchangam_pooja_rules set start_time = '18:00' where id = $1",
      [panchId],
    );
    const last = (
      await q(
        "select admin_id, old_values->>'start_time' o, new_values->>'start_time' n from public.schedule_audit_log where record_id = $1 order by created_at desc, id desc limit 1",
        [panchId],
      )
    ).rows[0];
    expect(last).toEqual({ admin_id: null, o: "17:30:00", n: "18:00:00" });
  });
});

// =================================================================================
describe("schedule audit trail", () => {
  it("is append-only (even for the table owner) and readable only by admins", async () => {
    await expect(
      q("update public.schedule_audit_log set reason = 'x'"),
    ).rejects.toThrow(/audit_log_is_append_only/);
    await expect(q("delete from public.schedule_audit_log")).rejects.toThrow(
      /audit_log_is_append_only/,
    );
    await expect(q("truncate public.schedule_audit_log")).rejects.toThrow(
      /audit_log_is_append_only/,
    );
    await denied(call(ADMIN, "delete from public.schedule_audit_log"));
    await denied(
      call(
        ADMIN,
        "insert into public.schedule_audit_log (schedule_table, record_id, pooja_id, action) values ('special_pooja_schedule', gen_random_uuid(), $1, 'insert')",
        [ids["p-daily"]],
      ),
    );
    expect(
      (await call(ADMIN, "select * from public.schedule_audit_log")).rows
        .length,
    ).toBeGreaterThan(10);
    expect(
      (await call(USER, "select * from public.schedule_audit_log")).rows,
    ).toHaveLength(0);
    await denied(as(null, () => q("select * from public.schedule_audit_log")));
  });
  it("the booking audit trail stays append-only too (including the new schedule actions)", async () => {
    await expect(
      q("update public.booking_audit_log set note = 'x'"),
    ).rejects.toThrow(/audit_log_is_append_only/);
    await expect(q("delete from public.booking_audit_log")).rejects.toThrow(
      /audit_log_is_append_only/,
    );
    await expect(q("truncate public.booking_audit_log")).rejects.toThrow(
      /audit_log_is_append_only/,
    );
  });
});
