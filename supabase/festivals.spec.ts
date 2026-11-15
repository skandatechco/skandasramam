/**
 * Festival-day pooja offerings against the real migrations on a clean database:
 * creation, own fixed price (never the template's), audit, admin permissions,
 * booking rules (window, date, capacity), historical booking amounts, and explicit
 * handling of existing bookings when a festival changes.
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
import { festivalPath, isFestivalSlug } from "../shared/festival";
import { resolveDestination } from "../shared/poojaPages";

let t: TestDb;
const q = (sql: string, params?: any[]) => t.db.query<any>(sql, params);
const as = (uid: string | null, fn: () => Promise<any>) =>
  t.as(uid ? "authenticated" : "anon", uid, fn);
const call = (uid: string, sql: string, params: any[] = []) =>
  as(uid, () => q(sql, params));

const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return e;
  }
  throw new Error("expected the call to fail");
};

const day = (offset: number) =>
  new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000)
    .toISOString()
    .slice(0, 10);

interface Made {
  festivalId: string;
  poojaId: string;
  slug: string;
}

let seq = 0;
/** Creates a festival through the admin function and returns its ids. */
async function createFestival(
  over: Partial<{
    festival: string;
    pooja: string;
    description: string | null;
    date: string;
    time: string | null;
    amount: number | null;
    opens: string | null;
    closes: string | null;
    max: number | null;
    active: boolean;
    template: string | null;
    reason: string | null;
    uid: string;
  }> = {},
): Promise<Made> {
  const n = ++seq;
  const r = await call(
    over.uid ?? ADMIN,
    `select * from public.admin_festival_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      over.festival ?? `Festival ${n}`,
      over.pooja ?? `Abhishekam ${n}`,
      over.description === undefined ? "Special abhishekam" : over.description,
      over.date ?? day(30),
      over.time === undefined ? "06:30" : over.time,
      over.amount === undefined ? 501 : over.amount,
      over.opens ?? null,
      over.closes ?? null,
      over.max ?? null,
      over.active ?? true,
      over.template ?? null,
      over.reason ?? null,
    ],
  );
  const row = r.rows[0];
  return {
    festivalId: row.o_festival_id,
    poojaId: row.o_pooja_id,
    slug: row.o_slug,
  };
}

const update = (
  uid: string,
  id: string,
  patch: object,
  handling: string | null = null,
  reason: string | null = "Test change",
) =>
  call(
    uid,
    "select * from public.admin_festival_update($1, $2::jsonb, $3, $4)",
    [id, JSON.stringify(patch), handling, reason],
  );

let bseq = 0;
async function book(
  m: Made,
  opts: { date?: string; status?: string; amount?: number } = {},
) {
  const n = ++bseq;
  const r = await q(
    `insert into public.bookings (pooja_id, pooja_name, booking_date, devotee_name, phone, email, amount_inr, access_token_hash, status)
     select id, name, $2::date, 'Devotee ' || $3::text, '92000' || lpad($3::text, 5, '0'), 'd@example.com', $4, $5, $6
       from public.poojas where id = $1 returning id, order_no`,
    [
      m.poojaId,
      opts.date ?? (await dateOf(m)),
      n,
      opts.amount ?? 501,
      "b".repeat(64),
      opts.status ?? "pending",
    ],
  );
  return r.rows[0] as { id: string; order_no: string };
}
const dateOf = async (m: Made) =>
  (
    await q(
      "select date::text d from public.festival_offerings where id = $1",
      [m.festivalId],
    )
  ).rows[0].d as string;
const bookingRow = async (id: string) =>
  (
    await q(
      "select booking_date::text d, status, amount_inr::float8 amt from public.bookings where id = $1",
      [id],
    )
  ).rows[0];
const festivalRow = async (id: string) =>
  (
    await q(
      `select f.*, f.date::text d, p.amount_inr::float8 amt, p.slug, p.name, p.type
         from public.festival_offerings f join public.poojas p on p.id = f.pooja_id where f.id = $1`,
      [id],
    )
  ).rows[0];

let templateId: string;

beforeAll(async () => {
  t = await createTestDb();
  await t.db.exec(`
    insert into public.poojas (slug, name, type, amount_inr) values
      ('pradosham', 'Pradosham', 'panchangam', 100),
      ('annadanam', 'Annadanam', 'special', null);
  `);
  templateId = (
    await q("select id from public.poojas where slug = 'pradosham'")
  ).rows[0].id;
});

// =================================================================================
describe("creating a festival offering", () => {
  it("creates its own catalogue entry with its own fixed price, time and description", async () => {
    const m = await createFestival({
      festival: "Maha Shivaratri",
      pooja: "Rudra Abhishekam",
      description: "Abhishekam through the night",
      date: day(40),
      time: "18:00",
      amount: 1501,
      max: 50,
    });
    const f = await festivalRow(m.festivalId);
    expect(f).toMatchObject({
      type: "festival",
      festival_name: "Maha Shivaratri",
      pooja_name: "Rudra Abhishekam",
      name: "Rudra Abhishekam", // the catalogue row mirrors the pooja name
      description: "Abhishekam through the night",
      amt: 1501,
      max_bookings: 50,
      active: true,
    });
    expect(f.start_time).toBe("18:00:00");
    expect(f.slug).toMatch(/^festival-maha-shivaratri-rudra-abhishekam-\d{8}$/);
  });

  it("uses an existing pooja as a template WITHOUT changing that pooja's standard rate", async () => {
    const before = (
      await q(
        "select amount_inr::float8 a, updated_at from public.poojas where id = $1",
        [templateId],
      )
    ).rows[0];
    const auditBefore = (
      await q(
        "select count(*)::int n from public.pooja_price_audit_log where pooja_id = $1",
        [templateId],
      )
    ).rows[0].n;

    const m = await createFestival({
      festival: "Karthigai Deepam",
      pooja: "Pradosham Special",
      amount: 750,
      template: templateId,
    });

    const after = (
      await q(
        "select amount_inr::float8 a, updated_at from public.poojas where id = $1",
        [templateId],
      )
    ).rows[0];
    expect(after.a).toBe(100); // standard rate untouched
    expect(after.updated_at).toEqual(before.updated_at);
    expect(
      (
        await q(
          "select count(*)::int n from public.pooja_price_audit_log where pooja_id = $1",
          [templateId],
        )
      ).rows[0].n,
    ).toBe(auditBefore);
    expect((await festivalRow(m.festivalId)).amt).toBe(750);
    expect((await festivalRow(m.festivalId)).template_pooja_id).toBe(
      templateId,
    );
  });

  it("never raises a pooja's price for a festival: the same pooja can have a festival offering at another price", async () => {
    await createFestival({
      pooja: "Pradosham",
      amount: 2000,
      festival: "Diwali",
    });
    expect(
      (
        await q(
          "select amount_inr::float8 a from public.poojas where slug = 'pradosham'",
        )
      ).rows[0].a,
    ).toBe(100);
  });

  it("requires its own fixed price and rejects invalid amounts", async () => {
    for (const bad of [null, 0, -5, 1000001, 10.255]) {
      const e = await errorOf(createFestival({ amount: bad as any }));
      expect([bad, e.message]).toEqual([bad, "invalid_amount"]);
    }
  });

  it("validates dates, window and capacity", async () => {
    expect((await errorOf(createFestival({ date: day(-1) }))).message).toBe(
      "date_in_past",
    );
    expect(
      (
        await errorOf(
          createFestival({ date: day(10), opens: day(8), closes: day(5) }),
        )
      ).message,
    ).toBe("invalid_window");
    expect(
      (await errorOf(createFestival({ date: day(10), closes: day(11) })))
        .message,
    ).toBe("invalid_window");
    expect((await errorOf(createFestival({ max: 0 }))).message).toBe(
      "invalid_capacity",
    );
    expect((await errorOf(createFestival({ festival: "  " }))).message).toBe(
      "invalid_festival",
    );
  });

  it("rejects an exact duplicate and a donation as a template", async () => {
    await createFestival({
      festival: "Dup Fest",
      pooja: "Dup Pooja",
      date: day(60),
    });
    expect(
      (
        await errorOf(
          createFestival({
            festival: "dup fest",
            pooja: "DUP POOJA",
            date: day(60),
          }),
        )
      ).message,
    ).toBe("duplicate_festival");
    const donation = (
      await q("select id from public.poojas where slug = 'annadanam'")
    ).rows[0].id;
    expect(
      (await errorOf(createFestival({ template: donation }))).message,
    ).toBe("template_not_allowed");
  });

  it("gives colliding names distinct slugs", async () => {
    const a = await createFestival({
      festival: "Slug A",
      pooja: "B C",
      date: day(70),
    });
    const b = await createFestival({
      festival: "Slug A B",
      pooja: "C",
      date: day(70),
    });
    expect(a.slug).not.toBe(b.slug);
  });

  it("every active festival offering resolves to a valid booking destination", async () => {
    await createFestival({ festival: "Link Check", pooja: "Resolves" });
    const rows = (
      await q(
        "select p.slug from public.poojas p join public.festival_offerings f on f.pooja_id = p.id where f.active and p.amount_inr is not null",
      )
    ).rows;
    expect(rows.length).toBeGreaterThan(3);
    for (const { slug } of rows) {
      expect([slug, isFestivalSlug(slug)]).toEqual([slug, true]);
      expect(resolveDestination(slug)).toBe(festivalPath(slug));
    }
  });

  it("keeps the 'festival-' slug prefix exclusive to festival offerings", async () => {
    await denied(
      q(
        "insert into public.poojas (slug, name, type) values ('festival-x', 'X', 'special')",
      ),
    );
    await denied(
      q(
        "insert into public.poojas (slug, name, type) values ('plain-x', 'X', 'festival')",
      ),
    );
  });
});

// =================================================================================
describe("administrator permissions", () => {
  it("only administrators can create or edit festival offerings", async () => {
    const m = await createFestival();
    for (const uid of [USER]) {
      expect((await errorOf(createFestival({ uid }))).message).toBe(
        "forbidden",
      );
      expect(
        (await errorOf(update(uid, m.festivalId, { max_bookings: 5 }))).message,
      ).toBe("forbidden");
    }
    await expect(
      as(null, () =>
        q(
          "select * from public.admin_festival_create('A','B',null,$1,null,100,null,null,null,true,null,null)",
          [day(20)],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(null, () =>
        q(
          "select * from public.admin_festival_update($1,'{}'::jsonb,null,'x')",
          [m.festivalId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("API roles cannot write the festival tables directly, even an administrator", async () => {
    const m = await createFestival();
    for (const uid of [ADMIN, USER]) {
      await denied(
        call(
          uid,
          "update public.festival_offerings set max_bookings = 1 where id = $1",
          [m.festivalId],
        ),
      );
      await denied(
        call(uid, "update public.poojas set amount_inr = 1 where id = $1", [
          m.poojaId,
        ]),
      );
      await denied(
        call(uid, "delete from public.festival_offerings where id = $1", [
          m.festivalId,
        ]),
      );
    }
  });

  it("the public sees only active offerings; administrators see all", async () => {
    const active = await createFestival({ festival: "Visible" });
    const hidden = await createFestival({ festival: "Hidden", active: false });
    const anon = (
      await as(null, () => q("select id from public.festival_offerings"))
    ).rows.map((r) => r.id);
    expect(anon).toContain(active.festivalId);
    expect(anon).not.toContain(hidden.festivalId);
    const admin = (
      await call(ADMIN, "select id from public.festival_offerings")
    ).rows.map((r) => r.id);
    expect(admin).toEqual(
      expect.arrayContaining([active.festivalId, hidden.festivalId]),
    );
    const user = (
      await call(USER, "select id from public.festival_offerings")
    ).rows.map((r) => r.id);
    expect(user).not.toContain(hidden.festivalId);
  });

  it("audit tables stay append-only", async () => {
    const m = await createFestival();
    await expect(
      q("delete from public.schedule_audit_log where record_id = $1", [
        m.festivalId,
      ]),
    ).rejects.toThrow(/audit_log_is_append_only/);
    await expect(
      q(
        "update public.pooja_price_audit_log set reason = 'x' where pooja_id = $1",
        [m.poojaId],
      ),
    ).rejects.toThrow(/audit_log_is_append_only/);
  });
});

// =================================================================================
describe("editing: prices, schedule and audit history", () => {
  it("records who created it, and every later change with old and new values and a reason", async () => {
    const m = await createFestival({
      festival: "Audit Fest",
      date: day(45),
      reason: "Requested by the trustees",
    });
    await update(
      OTHER_ADMIN,
      m.festivalId,
      { start_time: "07:15", max_bookings: 20 },
      null,
      "Time moved",
    );
    await update(
      ADMIN,
      m.festivalId,
      { description: "New text" },
      null,
      "Wording",
    );

    const log = (
      await q(
        `select action, admin_email, reason, old_values->>'start_time' old_t, new_values->>'start_time' new_t
           from public.schedule_audit_log where schedule_table = 'festival_offerings' and record_id = $1
          order by created_at, id`,
        [m.festivalId],
      )
    ).rows;
    expect(log.map((l) => [l.action, l.admin_email, l.reason])).toEqual([
      ["insert", "admin@example.com", "Requested by the trustees"],
      ["update", "second@example.com", "Time moved"],
      ["update", "admin@example.com", "Wording"],
    ]);
    expect(log[1]).toMatchObject({ old_t: "06:30:00", new_t: "07:15:00" });
  });

  it("a price change is audited with reason, old and new amount, and changes only this offering", async () => {
    const m = await createFestival({ amount: 600 });
    const r = await update(
      ADMIN,
      m.festivalId,
      { amount: 900 },
      null,
      "Costs rose",
    );
    expect(r.rows[0].affected_count).toBe(0);
    expect((await festivalRow(m.festivalId)).amt).toBe(900);

    const log = (
      await q(
        `select admin_email, old_amount::float8 o, new_amount::float8 n, reason
           from public.pooja_price_audit_log where pooja_id = $1 order by created_at, id`,
        [m.poojaId],
      )
    ).rows;
    expect(log).toEqual([
      {
        admin_email: "admin@example.com",
        o: null,
        n: 600,
        reason: "Festival offering created",
      },
      {
        admin_email: "admin@example.com",
        o: 600,
        n: 900,
        reason: "Costs rose",
      },
    ]);
    expect(
      (
        await q(
          "select amount_inr::float8 a from public.poojas where id = $1",
          [templateId],
        )
      ).rows[0].a,
    ).toBe(100);
  });

  it("mirrors a renamed pooja and its description into the catalogue", async () => {
    const m = await createFestival();
    await update(ADMIN, m.festivalId, {
      pooja_name: "Renamed",
      description: null,
    });
    expect(await festivalRow(m.festivalId)).toMatchObject({
      name: "Renamed",
      description: null,
    });
  });

  it("requires a reason, a valid price, and some real change", async () => {
    const m = await createFestival();
    expect(
      (
        await errorOf(
          update(ADMIN, m.festivalId, { max_bookings: 3 }, null, null),
        )
      ).message,
    ).toBe("reason_required");
    expect(
      (await errorOf(update(ADMIN, m.festivalId, { amount: 0 }))).message,
    ).toBe("invalid_amount");
    expect(
      (await errorOf(update(ADMIN, m.festivalId, { amount: null }))).message,
    ).toBe("invalid_amount");
    expect(
      (await errorOf(update(ADMIN, m.festivalId, { amount: 501 }))).message,
    ).toBe("no_change");
    expect(
      (await errorOf(update(ADMIN, m.festivalId, { foo: 1 }))).message,
    ).toBe("invalid_patch");
  });

  it("a rejected change leaves no partial edit and no audit row", async () => {
    const m = await createFestival();
    const before = (
      await q(
        "select count(*)::int n from public.schedule_audit_log where record_id = $1",
        [m.festivalId],
      )
    ).rows[0].n;
    await errorOf(
      update(ADMIN, m.festivalId, { start_time: "09:00", amount: -1 }),
    );
    expect((await festivalRow(m.festivalId)).start_time).toBe("06:30:00");
    expect(
      (
        await q(
          "select count(*)::int n from public.schedule_audit_log where record_id = $1",
          [m.festivalId],
        )
      ).rows[0].n,
    ).toBe(before);
  });
});

// =================================================================================
describe("booking rules enforced by the database", () => {
  it("accepts a booking on the festival date inside the window", async () => {
    const m = await createFestival({
      date: day(5),
      opens: day(-1),
      closes: day(4),
    });
    await expect(book(m)).resolves.toBeTruthy();
  });

  it("refuses a booking on any other date", async () => {
    const m = await createFestival({ date: day(5) });
    expect((await errorOf(book(m, { date: day(6) }))).message).toBe(
      "festival_wrong_date",
    );
  });

  it("refuses bookings before the window opens and after it closes", async () => {
    const early = await createFestival({ date: day(20), opens: day(3) });
    expect((await errorOf(book(early))).message).toBe("festival_not_open");
    const late = await createFestival({
      date: day(20),
      closes: day(-1),
      opens: day(-5),
    });
    expect((await errorOf(book(late))).message).toBe("festival_closed");
  });

  it("an inactive offering cannot be booked", async () => {
    const m = await createFestival({ active: false });
    expect((await errorOf(book(m))).message).toBe("festival_not_open");
  });

  it("enforces the maximum number of bookings; cancelled bookings free a place", async () => {
    const m = await createFestival({ max: 2 });
    const a = await book(m);
    await book(m);
    expect((await errorOf(book(m))).message).toBe("festival_full");
    await q("update public.bookings set status = 'cancelled' where id = $1", [
      a.id,
    ]);
    await expect(book(m)).resolves.toBeTruthy();
    expect((await errorOf(book(m))).message).toBe("festival_full");
  });

  it("does not affect poojas that are not festival offerings", async () => {
    await expect(
      q(
        `insert into public.bookings (pooja_id, pooja_name, booking_date, devotee_name, phone, email, amount_inr, access_token_hash)
         values ($1, 'Pradosham', '2099-03-03', 'Plain', '9300000001', 'p@example.com', 100, $2)`,
        [templateId, "c".repeat(64)],
      ),
    ).resolves.toBeTruthy();
  });
});

// =================================================================================
describe("historical booking amounts", () => {
  it("existing bookings keep their original amount when the festival price changes", async () => {
    const m = await createFestival({ amount: 500 });
    const b = await book(m, { amount: 500 });
    await update(ADMIN, m.festivalId, { amount: 800 }, null, "Price revised");
    expect((await bookingRow(b.id)).amt).toBe(500);
    const later = await book(m, { amount: 800 });
    expect((await bookingRow(later.id)).amt).toBe(800);
  });

  it("the stored amount can never be edited, by anyone", async () => {
    const m = await createFestival();
    const b = await book(m);
    await expect(
      q("update public.bookings set amount_inr = 1 where id = $1", [b.id]),
    ).rejects.toThrow(/booking_snapshot_is_immutable/);
  });
});

// =================================================================================
describe("changing a festival that has bookings", () => {
  it("never silently touches bookings: moving the date needs an explicit choice", async () => {
    const m = await createFestival({ date: day(30) });
    const b = await book(m);
    const e = await errorOf(update(ADMIN, m.festivalId, { date: day(31) }));
    expect(e.message).toBe("affected_bookings_unresolved");
    expect(JSON.parse(e.detail ?? e.hint ?? "{}").count ?? 1).toBe(1);
    expect((await festivalRow(m.festivalId)).d).toBe(day(30));
    expect((await bookingRow(b.id)).d).toBe(day(30));
  });

  it("keep: the date moves and the bookings stay as they are, recorded in the audit", async () => {
    const m = await createFestival({ date: day(30) });
    const b = await book(m);
    const r = await update(
      ADMIN,
      m.festivalId,
      { date: day(33) },
      "keep",
      "Priest unavailable",
    );
    expect(r.rows[0]).toMatchObject({
      affected_count: 1,
      cancelled_count: 0,
      moved_count: 0,
    });
    expect((await bookingRow(b.id)).d).toBe(day(30));
    const a = (
      await q(
        `select affected_handling, affected_bookings from public.schedule_audit_log
          where record_id = $1 and action = 'update'`,
        [m.festivalId],
      )
    ).rows[0];
    expect(a.affected_handling).toBe("keep");
    expect(a.affected_bookings).toEqual([b.order_no]);
  });

  it("move: bookings follow the new date and each is audited", async () => {
    const m = await createFestival({ date: day(30) });
    const b = await book(m);
    const r = await update(
      ADMIN,
      m.festivalId,
      { date: day(34) },
      "move",
      "Date changed",
    );
    expect(r.rows[0].moved_count).toBe(1);
    expect((await bookingRow(b.id)).d).toBe(day(34));
    expect(
      (
        await q(
          "select action, admin_email, note from public.booking_audit_log where booking_id = $1",
          [b.id],
        )
      ).rows,
    ).toEqual([
      expect.objectContaining({
        action: "schedule_move",
        admin_email: "admin@example.com",
      }),
    ]);
  });

  it("cancel: deactivating can cancel the bookings, each audited; amounts are kept", async () => {
    const m = await createFestival({ date: day(30) });
    const b = await book(m, { amount: 501 });
    const r = await update(
      ADMIN,
      m.festivalId,
      { active: false },
      "cancel",
      "Festival cancelled",
    );
    expect(r.rows[0].cancelled_count).toBe(1);
    expect(await bookingRow(b.id)).toMatchObject({
      status: "cancelled",
      amt: 501,
    });
    expect((await festivalRow(m.festivalId)).active).toBe(false);
  });

  it("move is refused when deactivating, and a handling choice needs a reason", async () => {
    const m = await createFestival({ date: day(30) });
    await book(m);
    expect(
      (await errorOf(update(ADMIN, m.festivalId, { active: false }, "move")))
        .message,
    ).toBe("invalid_handling");
    expect(
      (
        await errorOf(
          update(ADMIN, m.festivalId, { date: day(31) }, "keep", null),
        )
      ).message,
    ).toBe("reason_required");
  });

  it("price, description and capacity changes need no decision and leave bookings alone", async () => {
    const m = await createFestival({ date: day(30), amount: 500 });
    const b = await book(m, { amount: 500 });
    const r = await update(ADMIN, m.festivalId, {
      amount: 700,
      description: "Updated",
      max_bookings: 10,
    });
    expect(r.rows[0].affected_count).toBe(0);
    expect(await bookingRow(b.id)).toMatchObject({
      d: day(30),
      status: "pending",
      amt: 500,
    });
  });

  it("a past festival cannot be moved or deactivated", async () => {
    const m = await createFestival({ date: day(0) });
    await q(
      "update public.festival_offerings set date = (now() - interval '3 day')::date, booking_closes_on = null, booking_opens_on = null where id = $1",
      [m.festivalId],
    );
    expect(
      (
        await errorOf(
          update(ADMIN, m.festivalId, { active: false }, "keep", "Late"),
        )
      ).message,
    ).toBe("schedule_in_past");
  });
});
