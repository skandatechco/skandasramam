/**
 * Applies the complete migration sequence to a CLEAN database and attacks the
 * policies as anon, as a signed-in non-admin and as an admin.
 * (PGlite = real PostgreSQL engine, in-process; auth schema/roles are stand-ins.)
 */
import { beforeAll, describe, expect, it } from "vitest";
import { NAKSHATRAS, TITHIS } from "../shared/panchangam";
import {
  ADMIN,
  USER,
  createTestDb,
  denied,
  migrationFiles,
  type TestDb,
} from "./testDb";

let t: TestDb;
const q = (sql: string, params?: any[]) => t.db.query<any>(sql, params);

const HASH = "a".repeat(64);
async function newBooking(over: Record<string, string> = {}) {
  const v = {
    pooja: "p-daily",
    date: "2027-01-10",
    name: "Devotee One",
    phone: "9876543210",
    hash: HASH,
    ...over,
  };
  return q(
    `insert into public.bookings (pooja_id, pooja_name, booking_date, devotee_name, phone, email, amount_inr, access_token_hash)
     select id, name, $2::date, $3, $4, 'd@example.com', 500, $5 from public.poojas where slug = $1 returning *`,
    [v.pooja, v.date, v.name, v.phone, v.hash],
  );
}

beforeAll(async () => {
  t = await createTestDb({ withPoojaDays: true });
  await t.db.exec(`
    insert into public.pooja_days (date, tithi, paksha, nakshatra, source_provider)
      values ('2027-01-10', 'Trayodashi', 'Shukla', 'Rohini', 'prokerala');
    insert into public.poojas (slug, name, type, amount_inr, active) values
      ('p-daily', 'Daily Pooja', 'daily', 500, true),
      ('p-special', 'Special Pooja', 'special', 1000, true),
      ('p-panch', 'Panchangam Pooja', 'panchangam', 300, true),
      ('p-hidden', 'Hidden Pooja', 'daily', 100, false);
  `);
});

describe("clean migration sequence", () => {
  it("has the five migrations, applied in order, with no errors", () => {
    expect(migrationFiles()).toEqual([
      "20261115000001_admin_users_and_poojas.sql",
      "20261115000002_bookings.sql",
      "20261115000003_admin_audit_and_actions.sql",
      "20261115000004_pricing_and_schedule_admin.sql",
      "20261115000005_festival_offerings.sql",
    ]);
  });

  it("leaves the existing pooja_days table and its data untouched", async () => {
    const rows = (await q("select * from public.pooja_days")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].nakshatra).toBe("Rohini");
    expect(
      (await q("select 1 from pg_policies where tablename = 'pooja_days'"))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await q(
          "select relrowsecurity r from pg_class where relname = 'pooja_days'",
        )
      ).rows[0].r,
    ).toBe(false);
    expect(
      (
        await q(
          "select 1 from pg_trigger where tgrelid = 'public.pooja_days'::regclass and not tgisinternal",
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("enables RLS on every new table", async () => {
    const r = await q(
      `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
         and relname <> 'pooja_days' and not relrowsecurity`,
    );
    expect(r.rows).toEqual([]);
    const tables = (
      await q(
        `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`,
      )
    ).rows.map((x) => x.relname);
    expect(tables).toEqual([
      "admin_users",
      "booking_audit_log",
      "bookings",
      "festival_offerings",
      "panchangam_pooja_rules",
      "pooja_days",
      "pooja_price_audit_log",
      "poojas",
      "recurring_pooja_schedule",
      "schedule_audit_log",
      "special_pooja_schedule",
    ]);
  });

  it("API roles have NO direct write privilege on any table", async () => {
    const tables = (
      await q(
        `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'pooja_days'`,
      )
    ).rows.map((x) => x.relname);
    for (const role of ["anon", "authenticated"]) {
      for (const table of tables) {
        for (const priv of ["insert", "update", "delete", "truncate"]) {
          const r = await q(
            `select has_table_privilege($1, 'public.' || $2, $3) as ok`,
            [role, table, priv],
          );
          expect([role, table, priv, r.rows[0].ok]).toEqual([
            role,
            table,
            priv,
            false,
          ]);
        }
      }
    }
  });

  it("every SECURITY DEFINER function pins its search_path", async () => {
    const r = await q(
      `select proname, proconfig from pg_proc where pronamespace = 'public'::regnamespace and prosecdef`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(8);
    for (const f of r.rows) {
      expect([f.proname, String(f.proconfig).includes("search_path=")]).toEqual(
        [f.proname, true],
      );
    }
  });

  it("admin functions are closed to anon; internal helpers to everyone", async () => {
    for (const fn of [
      "public.admin_booking_action(uuid,text,text)",
      "public.admin_set_pooja_price(uuid,numeric,text)",
      "public.admin_special_schedule_create(uuid,date,time,text,text)",
      "public.admin_special_schedule_update(uuid,jsonb,text,text)",
      "public.admin_schedule_rule_set_active(text,uuid,boolean,text,text)",
    ]) {
      const r = await q(
        `select has_function_privilege('anon', '${fn}', 'execute') a, has_function_privilege('authenticated', '${fn}', 'execute') u`,
      );
      expect([fn, r.rows[0].a, r.rows[0].u]).toEqual([fn, false, true]);
    }
    for (const fn of [
      "public._require_admin()",
      "public._set_audit_context(text,text,jsonb)",
      "public.is_admin()",
    ]) {
      const r = await q(
        `select has_function_privilege('anon', '${fn}', 'execute') a`,
      );
      expect(r.rows[0].a).toBe(false);
    }
    const helpers = await q(
      `select has_function_privilege('authenticated', 'public._require_admin()', 'execute') u`,
    );
    expect(helpers.rows[0].u).toBe(false);
  });

  it("is_admin() reflects admin_users and nothing client-supplied", async () => {
    expect(
      (
        await t.as("authenticated", ADMIN, () =>
          q("select public.is_admin() a"),
        )
      ).rows[0].a,
    ).toBe(true);
    expect(
      (await t.as("authenticated", USER, () => q("select public.is_admin() a")))
        .rows[0].a,
    ).toBe(false);
    await denied(t.as("anon", null, () => q("select public.is_admin()")));
  });
});

describe("catalogue and schedules: read access", () => {
  it("anon sees only active poojas and cannot write", async () => {
    const r = await t.as("anon", null, () =>
      q("select slug from public.poojas order by slug"),
    );
    expect(r.rows.map((x) => x.slug)).toEqual([
      "p-daily",
      "p-panch",
      "p-special",
    ]);
    await denied(
      t.as("anon", null, () => q("update public.poojas set amount_inr = 1")),
    );
    await denied(
      t.as("anon", null, () =>
        q(
          "insert into public.poojas (slug,name,type) values ('x','x','daily')",
        ),
      ),
    );
  });
  it("a signed-in non-admin and even an admin cannot write the catalogue directly", async () => {
    await denied(
      t.as("authenticated", USER, () =>
        q("update public.poojas set amount_inr = 1"),
      ),
    );
    await denied(
      t.as("authenticated", ADMIN, () =>
        q("update public.poojas set amount_inr = 1"),
      ),
    );
    await denied(
      t.as("authenticated", ADMIN, () =>
        q(
          "insert into public.poojas (slug,name,type) values ('y','y','daily')",
        ),
      ),
    );
    await denied(
      t.as("authenticated", ADMIN, () => q("delete from public.poojas")),
    );
  });
  it("an admin (only) can read inactive poojas", async () => {
    const a = await t.as("authenticated", ADMIN, () =>
      q("select count(*)::int n from public.poojas"),
    );
    expect(a.rows[0].n).toBe(4);
    const u = await t.as("authenticated", USER, () =>
      q("select count(*)::int n from public.poojas"),
    );
    expect(u.rows[0].n).toBe(3);
  });
  it("rejects bad prices and unknown pooja types at the table level", async () => {
    for (const sql of [
      "update public.poojas set amount_inr = 0 where slug = 'p-daily'",
      "update public.poojas set amount_inr = -5 where slug = 'p-daily'",
      "update public.poojas set amount_inr = 1000000.01 where slug = 'p-daily'",
      "insert into public.poojas (slug,name,type) values ('z','z','weekly')",
      "insert into public.poojas (slug,name,type) values ('Bad Slug','z','daily')",
    ]) {
      await expect(q(sql)).rejects.toThrow(/violates|check/i);
    }
  });
  it("admin_users is not readable across users", async () => {
    expect(
      (
        await t.as("authenticated", USER, () =>
          q("select * from public.admin_users"),
        )
      ).rows,
    ).toHaveLength(0);
    const own = await t.as("authenticated", ADMIN, () =>
      q("select user_id from public.admin_users"),
    );
    expect(own.rows.map((r) => r.user_id)).toEqual([ADMIN]);
    await denied(
      t.as("authenticated", ADMIN, () =>
        q(`insert into public.admin_users values ('${USER}', 'x')`),
      ),
    );
    await denied(
      t.as("anon", null, () => q("select * from public.admin_users")),
    );
  });
});

describe("recurring schedule constraints", () => {
  it("weekly needs a weekday; daily must not have one", async () => {
    await expect(
      q(
        "insert into public.recurring_pooja_schedule (pooja_id, recurrence) select id, 'weekly' from public.poojas limit 1",
      ),
    ).rejects.toThrow(/violates/);
    await expect(
      q(
        "insert into public.recurring_pooja_schedule (pooja_id, recurrence, weekday) select id, 'daily', 2 from public.poojas limit 1",
      ),
    ).rejects.toThrow(/violates/);
    await expect(
      q(
        "insert into public.recurring_pooja_schedule (pooja_id, recurrence, weekday) select id, 'weekly', 7 from public.poojas limit 1",
      ),
    ).rejects.toThrow(/violates/);
  });
});

describe("panchangam_pooja_rules constraints", () => {
  const insert = (cols: string, vals: string) =>
    q(
      `insert into public.panchangam_pooja_rules (pooja_id, ${cols}) select id, ${vals} from public.poojas where slug = 'p-panch'`,
    );

  it("accepts every canonical tithi and nakshatra id used by the application", async () => {
    await insert(
      "tithis",
      `array[${TITHIS.map((x) => `'${x}'`).join(",")}]::text[]`,
    );
    await insert(
      "nakshatras",
      `array[${NAKSHATRAS.map((x) => `'${x}'`).join(",")}]::text[]`,
    );
    await q("delete from public.panchangam_pooja_rules");
  });
  it("accepts tithi + paksha + nakshatra combinations", async () => {
    await insert(
      "tithis, paksha, nakshatras",
      "array['ashtami']::text[], 'krishna', array['rohini']::text[]",
    );
    await q("delete from public.panchangam_pooja_rules");
  });
  it("rejects unknown ids, free text, empty rules and bad paksha", async () => {
    for (const [c, v] of [
      ["tithis", "array['trayodasi']::text[]"], // misspelt id: must be canonical
      ["tithis", "array['Trayodashi']::text[]"],
      ["nakshatras", "array['karthigai']::text[]"],
      ["tithis", "array[]::text[]"],
      ["paksha", "'krishna'"], // paksha alone is not a schedule
      ["tithis, paksha", "array['ashtami']::text[], 'waxing'"],
    ]) {
      await expect(insert(c, v)).rejects.toThrow(/violates/);
    }
  });
  it("rejects contradictory rules (Purnima in Krishna, Amavasya in Shukla)", async () => {
    await expect(
      insert("tithis, paksha", "array['purnima']::text[], 'krishna'"),
    ).rejects.toThrow(/violates/);
    await expect(
      insert("tithis, paksha", "array['amavasya']::text[], 'shukla'"),
    ).rejects.toThrow(/violates/);
  });
  it("is readable by anon only while active; never writable through the API", async () => {
    await insert("tithis, active", "array['trayodashi']::text[], false");
    await insert("tithis, active", "array['purnima']::text[], true");
    const anon = await t.as("anon", null, () =>
      q("select tithis from public.panchangam_pooja_rules"),
    );
    expect(anon.rows.map((r) => r.tithis)).toEqual([["purnima"]]);
    const admin = await t.as("authenticated", ADMIN, () =>
      q("select 1 from public.panchangam_pooja_rules"),
    );
    expect(admin.rows).toHaveLength(2);
    await denied(
      t.as("authenticated", ADMIN, () =>
        q("update public.panchangam_pooja_rules set active = true"),
      ),
    );
    await denied(
      t.as("anon", null, () => q("delete from public.panchangam_pooja_rules")),
    );
    await q("delete from public.panchangam_pooja_rules");
  });
});

describe("bookings", () => {
  it("generates unique, non-sequential order numbers in the expected format", async () => {
    const nos = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = await newBooking({
        date: "2027-02-01",
        name: `Person ${i}`,
        phone: `98765432${String(i).padStart(2, "0")}`,
      });
      expect(r.rows[0].order_no).toMatch(/^SKD-\d{6}-[0-9A-F]{6}$/);
      nos.add(r.rows[0].order_no);
    }
    expect(nos.size).toBe(20);
  });

  it("anon has no access at all; a non-admin user sees and changes nothing", async () => {
    await denied(t.as("anon", null, () => q("select * from public.bookings")));
    await denied(
      t.as("anon", null, () =>
        q("insert into public.bookings (order_no) values ('x')"),
      ),
    );
    await denied(
      t.as("anon", null, () =>
        q("update public.bookings set status = 'confirmed'"),
      ),
    );
    expect(
      (
        await t.as("authenticated", USER, () =>
          q("select order_no from public.bookings"),
        )
      ).rows,
    ).toHaveLength(0);
    await denied(
      t.as("authenticated", USER, () =>
        q("update public.bookings set status = 'confirmed'"),
      ),
    );
  });

  it("admins can read bookings (not the token hash) but cannot write them directly", async () => {
    await denied(
      t.as("authenticated", ADMIN, () => q("select * from public.bookings")),
    );
    await denied(
      t.as("authenticated", ADMIN, () =>
        q("select access_token_hash from public.bookings"),
      ),
    );
    const ok = await t.as("authenticated", ADMIN, () =>
      q("select order_no, upi_ref, payment_status from public.bookings"),
    );
    expect(ok.rows.length).toBeGreaterThan(0);
    for (const sql of [
      "update public.bookings set amount_inr = 1",
      "update public.bookings set status = 'confirmed'",
      "update public.bookings set payment_status = 'verified'",
      "update public.bookings set devotee_name = 'x'",
      "delete from public.bookings",
      "insert into public.bookings (order_no) values ('x')",
    ]) {
      await denied(t.as("authenticated", ADMIN, () => q(sql)));
    }
  });

  it("payment constraints: reference required, one live use per reference, rejected releases it", async () => {
    const a = (
      await newBooking({
        date: "2027-03-01",
        name: "Pay A",
        phone: "9000000001",
      })
    ).rows[0];
    const b = (
      await newBooking({
        date: "2027-03-01",
        name: "Pay B",
        phone: "9000000002",
      })
    ).rows[0];
    await expect(
      q(
        "update public.bookings set payment_status = 'awaiting_verification' where id = $1",
        [a.id],
      ),
    ).rejects.toThrow(/violates/);
    await q(
      "update public.bookings set upi_ref = '123456789012', payment_status = 'awaiting_verification' where id = $1",
      [a.id],
    );
    await expect(
      q(
        "update public.bookings set upi_ref = '123456789012', payment_status = 'awaiting_verification' where id = $1",
        [b.id],
      ),
    ).rejects.toThrow(/violates/);
    await q(
      "update public.bookings set payment_status = 'rejected' where id = $1",
      [a.id],
    );
    await q(
      "update public.bookings set upi_ref = '123456789012', payment_status = 'awaiting_verification' where id = $1",
      [b.id],
    );
    await expect(
      q("update public.bookings set upi_ref = '12 34' where id = $1", [a.id]),
    ).rejects.toThrow(/violates/);
  });

  it("blocks duplicate live bookings (same devotee, pooja, date) but allows rebooking after cancel", async () => {
    const first = (
      await newBooking({
        date: "2027-05-01",
        name: "Dupe D",
        phone: "9000000004",
      })
    ).rows[0];
    await expect(
      newBooking({ date: "2027-05-01", name: "dupe d", phone: "9000000004" }),
    ).rejects.toThrow(/violates/);
    await newBooking({
      date: "2027-05-01",
      name: "Dupe D",
      phone: "9000000005",
    });
    await q("update public.bookings set status = 'cancelled' where id = $1", [
      first.id,
    ]);
    await newBooking({
      date: "2027-05-01",
      name: "Dupe D",
      phone: "9000000004",
    });
  });

  it("rejects a malformed token hash and a malformed phone", async () => {
    await expect(
      newBooking({ hash: "not-a-hash", date: "2027-06-01" }),
    ).rejects.toThrow(/violates/);
    await expect(
      newBooking({ phone: "+91 98", date: "2027-06-01" }),
    ).rejects.toThrow(/violates/);
  });

  it("the agreed amount, pooja and order number can never be edited, even by the table owner", async () => {
    const b = (
      await newBooking({
        date: "2027-07-01",
        name: "Snapshot S",
        phone: "9000000006",
      })
    ).rows[0];
    for (const sql of [
      "update public.bookings set amount_inr = 1 where id = $1",
      "update public.bookings set pooja_name = 'Other' where id = $1",
      "update public.bookings set order_no = 'SKD-000000-AAAAAA' where id = $1",
      `update public.bookings set pooja_id = (select id from public.poojas where slug = 'p-special') where id = $1`,
      "update public.bookings set access_token_hash = repeat('b', 64) where id = $1",
    ]) {
      await expect(q(sql, [b.id])).rejects.toThrow(
        /booking_snapshot_is_immutable/,
      );
    }
    // ordinary workflow fields are still editable
    await q("update public.bookings set status = 'confirmed' where id = $1", [
      b.id,
    ]);
  });
});
