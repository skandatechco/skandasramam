/**
 * The catalogue seed is reviewed by the temple and run by hand, but it must stay
 * valid: it applies cleanly after the migrations, is idempotent, applies the
 * approved standard rates (regular INR 100, special INR 1,000), never overwrites
 * an administrator's price or touches a booking, and every pooja it creates has a
 * real public page.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  REGULAR_PAGE_TITLES,
  SPECIAL_PAGE_TITLES,
  isDonationSlug,
  resolveDestination,
  slugify,
} from "../shared/poojaPages";
import { occurrenceOn, type PoojaScheduleInput } from "../shared/scheduling";
import { ADMIN, createTestDb, type TestDb } from "./testDb";

const SEED = readFileSync(join(__dirname, "seed", "poojas.seed.sql"), "utf8");
let t: TestDb;
const q = (sql: string, params?: any[]) => t.db.query<any>(sql, params);

beforeAll(async () => {
  t = await createTestDb();
  await t.db.exec(SEED);
});

describe("catalogue seed", () => {
  it("is not a migration (it can never be applied automatically)", () => {
    expect(join(__dirname, "seed")).not.toContain("migrations");
  });

  it("is idempotent: running it again changes nothing", async () => {
    const count = async () =>
      (
        await q(`select (select count(*) from public.poojas)::int p, (select count(*) from public.recurring_pooja_schedule)::int r,
                       (select count(*) from public.panchangam_pooja_rules)::int n`)
      ).rows[0];
    const before = await count();
    await t.db.exec(SEED);
    expect(await count()).toEqual(before);
    expect(before).toEqual({ p: 30, r: 1, n: 11 });
  });

  it("applies the approved standard rates: regular poojas INR 100, special poojas INR 1,000", async () => {
    const price = async (slug: string) =>
      (
        await q(
          "select amount_inr::float8 a from public.poojas where slug = $1",
          [slug],
        )
      ).rows[0].a;
    // by the section of the website the pooja is listed in
    for (const title of REGULAR_PAGE_TITLES)
      expect([title, await price(slugify(title))]).toEqual([title, 100]);
    for (const title of SPECIAL_PAGE_TITLES)
      expect([title, await price(slugify(title))]).toEqual([title, 1000]);
    const n = (
      await q(
        "select amount_inr::float8 a, count(*)::int n from public.poojas group by 1 order by 1",
      )
    ).rows;
    expect(n).toEqual([
      { a: 100, n: REGULAR_PAGE_TITLES.length },
      { a: 1000, n: SPECIAL_PAGE_TITLES.length },
    ]);
  });

  it("keeps each pooja's own recurrence: only the daily homam has a daily rule; no dates are invented", async () => {
    const r = (
      await q(`select p.slug,
                      (select count(*) from public.recurring_pooja_schedule x where x.pooja_id = p.id)::int rec,
                      (select count(*) from public.panchangam_pooja_rules x where x.pooja_id = p.id)::int pan
                 from public.poojas p where p.amount_inr = 100 order by p.slug`)
    ).rows;
    expect(r.filter((x) => x.rec > 0).map((x) => x.slug)).toEqual([
      "prathiyankara-sarabha-sulini-homam",
    ]);
    expect(r.filter((x) => x.pan > 0).length).toBe(11);
    expect(
      (await q("select count(*)::int n from public.special_pooja_schedule"))
        .rows[0].n,
    ).toBe(0);
  });

  it("records every standard rate in the price audit log as a system change with a reason", async () => {
    const r = (
      await q(
        "select count(*)::int n, count(admin_id)::int a, min(reason) reason from public.pooja_price_audit_log",
      )
    ).rows[0];
    expect(r).toEqual({
      n: 30,
      a: 0,
      reason: "Initial approved standard rate (catalogue seed)",
    });
  });

  it("excludes the Annadanam donation from pricing and booking", async () => {
    const rows = (
      await q(
        "select 1 from public.poojas where slug ilike '%annad%' or name ilike '%annad%'",
      )
    ).rows;
    expect(rows).toHaveLength(0);
    expect(resolveDestination("annadanam")).toBeNull();
  });

  it("contains every pooja that has a public page, and no donation", async () => {
    const slugs = new Set(
      (await q("select slug from public.poojas")).rows.map((r) => r.slug),
    );
    for (const title of [...REGULAR_PAGE_TITLES, ...SPECIAL_PAGE_TITLES]) {
      expect([title, slugs.has(slugify(title))]).toEqual([title, true]);
    }
    for (const s of slugs) expect([s, isDonationSlug(s)]).toEqual([s, false]);
    expect(slugs.size).toBe(
      REGULAR_PAGE_TITLES.length + SPECIAL_PAGE_TITLES.length,
    );
  });

  it("every seeded pooja resolves to a real destination page", async () => {
    for (const { slug, type } of (
      await q("select slug, type from public.poojas")
    ).rows) {
      const dest = resolveDestination(slug);
      expect([slug, dest === null]).toEqual([slug, false]);
      // pooja type is independent of which section's page serves it
      expect(dest).toMatch(/^\/poojas\/(regular|special)\/[a-z0-9-]+$/);
      expect(["daily", "panchangam", "special"]).toContain(type);
    }
    // Tamil Month First Saturday is a SPECIAL pooja served by a regular page
    expect(resolveDestination("tamil-month-first-saturday")).toBe(
      "/poojas/regular/tamil-month-first-saturday",
    );
  });

  it("types: one daily, eleven Panchangam-based, the rest special", async () => {
    const r = (
      await q(
        "select type, count(*)::int n from public.poojas group by type order by type",
      )
    ).rows;
    expect(r).toEqual([
      { type: "daily", n: 1 },
      { type: "panchangam", n: 11 },
      { type: "special", n: 18 },
    ]);
  });
});

describe("seeded Panchangam rules schedule the poojas as the temple's pages describe", () => {
  const inputs = new Map<string, PoojaScheduleInput>();
  beforeAll(async () => {
    const poojas = (await q("select id, slug, type from public.poojas")).rows;
    const rules = (
      await q(
        "select pooja_id, tithis, paksha, nakshatras, start_time::text st from public.panchangam_pooja_rules",
      )
    ).rows;
    const rec = (
      await q(
        "select pooja_id, recurrence, weekday, start_time::text st from public.recurring_pooja_schedule",
      )
    ).rows;
    for (const p of poojas) {
      inputs.set(p.slug, {
        type: p.type,
        recurring: rec
          .filter((r) => r.pooja_id === p.id)
          .map((r) => ({
            recurrence: r.recurrence,
            weekday: r.weekday,
            startTime: r.st,
          })),
        panchangamRules: rules
          .filter((r) => r.pooja_id === p.id)
          .map((r) => ({
            tithis: r.tithis,
            paksha: r.paksha,
            nakshatras: r.nakshatras,
            startTime: r.st,
          })),
        special: [],
      });
    }
  });
  const on = (
    slug: string,
    tithi: string,
    paksha: string | null,
    nakshatra: string,
  ) =>
    occurrenceOn(inputs.get(slug)!, "2099-01-01", { tithi, paksha, nakshatra })
      .scheduled;

  it("Pradosham: Trayodashi, both pakshas", () => {
    expect(on("pradosham", "Trayodashi", "Shukla Paksha", "Rohini")).toBe(true);
    expect(on("pradosham", "Trayodashi", "Krishna Paksha", "Hasta")).toBe(true);
    expect(on("pradosham", "Dwadashi", "Shukla Paksha", "Rohini")).toBe(false);
  });
  it("Pournami and Amavasya", () => {
    expect(on("pournami-full-moon", "Pournami", "", "Pushya")).toBe(true);
    expect(on("amavasya-new-moon", "Amavasai", "", "Mula")).toBe(true);
    expect(on("pournami-full-moon", "Amavasya", "", "Mula")).toBe(false);
  });
  it("Sankata Hara Chaturthi and Krishna Ashtami are paksha-sensitive (CONFIRM with the temple)", () => {
    expect(
      on("sankata-hara-chaturthi", "Chaturthi", "Krishna Paksha", "Hasta"),
    ).toBe(true);
    expect(
      on("sankata-hara-chaturthi", "Chaturthi", "Shukla Paksha", "Hasta"),
    ).toBe(false);
    expect(
      on("krishna-paksha-ashtami", "Ashtami", "Krishna Paksha", "Hasta"),
    ).toBe(true);
    expect(
      on("krishna-paksha-ashtami", "Ashtami", "Shukla Paksha", "Hasta"),
    ).toBe(false);
  });
  it("the five nakshatra poojas follow their nakshatra, in any spelling", () => {
    const cases: [string, string[]][] = [
      ["krithigai", ["Krittika", "Karthigai", "Krithigai"]],
      ["uthiram-nakshatram", ["Uttara Phalguni", "Uthiram"]],
      ["chitirai-nakshatram", ["Chitra", "Chithirai"]],
      ["swathi-nakshatram", ["Swati", "Swathi"]],
      ["vishakam-vishagam-nakshatram", ["Vishakha", "Visakam", "Vishagam"]],
    ];
    for (const [slug, names] of cases) {
      for (const n of names)
        expect([slug, n, on(slug, "Panchami", "Shukla", n)]).toEqual([
          slug,
          n,
          true,
        ]);
      expect(on(slug, "Panchami", "Shukla", "Rohini")).toBe(false);
      expect(on(slug, "Panchami", "Shukla", "Rohini / " + names[0])).toBe(
        false,
      ); // two nakshatras: ambiguous
    }
  });
  it("Navavarna: Panchami, Ashtami, Chaturdashi, Amavasya, Purnima", () => {
    for (const t of [
      "Panchami",
      "Ashtami",
      "Chaturdasi",
      "Amavasya",
      "Pournami",
    ]) {
      expect([t, on("navavarna-pooja", t, null, "Hasta")]).toEqual([t, true]);
    }
    for (const t of ["Pratipada", "Saptami", "Dashami", "Trayodashi"]) {
      expect([t, on("navavarna-pooja", t, null, "Hasta")]).toEqual([t, false]);
    }
  });
  it("the daily homam occurs every day, with no Panchangam needed", () => {
    expect(
      occurrenceOn(
        inputs.get("prathiyankara-sarabha-sulini-homam")!,
        "2099-05-05",
        null,
      ),
    ).toMatchObject({ scheduled: true, basis: "daily", startTime: "09:15:00" });
  });
  it("Tamil Month First Saturday has no automatic dates (needs the Tamil solar month)", () => {
    expect(
      occurrenceOn(inputs.get("tamil-month-first-saturday")!, "2099-01-01", {
        tithi: "x",
        paksha: null,
        nakshatra: "y",
      }).scheduled,
    ).toBe(false);
  });
  it("Panchangam poojas never occur without Panchangam data", () => {
    for (const [slug, input] of inputs) {
      if (input.type !== "panchangam") continue;
      expect([slug, occurrenceOn(input, "2099-01-01", null).scheduled]).toEqual(
        [slug, false],
      );
    }
  });
});

describe("every seeded pooja is bookable from the start", () => {
  it("each has an approved price and a valid destination page", async () => {
    const rows = (
      await q("select slug, amount_inr::float8 a from public.poojas")
    ).rows;
    expect(rows).toHaveLength(30);
    expect(
      rows.every((p) => p.a > 0 && resolveDestination(p.slug) !== null),
    ).toBe(true);
  });

  it("an administrator can still change a seeded rate, and the change is audited after the seeded entry", async () => {
    const { id } = (
      await q("select id from public.poojas where slug = 'pradosham'")
    ).rows[0];
    await t.as("authenticated", ADMIN, () =>
      q(
        "select * from public.admin_set_pooja_price($1, 150, 'Trustees revised')",
        [id],
      ),
    );
    const log = (
      await q(
        "select old_amount::float8 o, new_amount::float8 n, admin_id from public.pooja_price_audit_log where pooja_id = $1 order by created_at, id",
        [id],
      )
    ).rows;
    expect(log).toEqual([
      { o: null, n: 100, admin_id: null },
      { o: 100, n: 150, admin_id: ADMIN },
    ]);
    // re-running the seed does not undo that decision
    await t.db.exec(SEED);
    expect(
      (
        await q(
          "select amount_inr::float8 a from public.poojas where slug = 'pradosham'",
        )
      ).rows[0].a,
    ).toBe(150);
  });
});

describe("re-running the seed on a catalogue that already has data", () => {
  let u: TestDb;
  const uq = (sql: string, params?: any[]) => u.db.query<any>(sql, params);
  const priceOf = async (slug: string) =>
    (
      await uq(
        "select amount_inr::float8 a from public.poojas where slug = $1",
        [slug],
      )
    ).rows[0].a;

  beforeAll(async () => {
    u = await createTestDb();
    await u.db.exec(`
      -- an administrator already priced Pradosham at 750, and a devotee booked it
      insert into public.poojas (slug, name, type, amount_inr) values ('pradosham', 'Pradosham', 'panchangam', 750);
      insert into public.bookings (pooja_id, pooja_name, booking_date, devotee_name, phone, email, amount_inr, access_token_hash)
        select id, name, '2099-03-03', 'Devotee', '9100000001', 'd@example.com', 750, repeat('a', 64) from public.poojas where slug = 'pradosham';
      -- Pournami had a price, then an administrator withdrew it on purpose
      insert into public.poojas (slug, name, type, amount_inr) values ('pournami-full-moon', 'Pournami / Full Moon', 'panchangam', 300);
      update public.poojas set amount_inr = null where slug = 'pournami-full-moon';
      -- Krithigai exists but has never been priced
      insert into public.poojas (slug, name, type) values ('krithigai', 'Krithigai', 'panchangam');
      -- Lord Shiva exists under another slug: it must not be duplicated
      insert into public.poojas (slug, name, type, amount_inr) values ('shiva-old', 'Lord Shiva', 'special', 1500);
    `);
    await u.db.exec(SEED);
    await u.db.exec(SEED); // and once more
  });

  it("does not overwrite a price an administrator set", async () => {
    expect(await priceOf("pradosham")).toBe(750);
  });
  it("does not re-price a pooja whose price was withdrawn", async () => {
    expect(await priceOf("pournami-full-moon")).toBeNull();
  });
  it("prices an existing pooja that was never priced", async () => {
    expect(await priceOf("krithigai")).toBe(100);
  });
  it("creates no duplicate: a pooja matching by name is not added again", async () => {
    const r = (
      await uq(
        "select slug from public.poojas where lower(name) = 'lord shiva'",
      )
    ).rows;
    expect(r.map((x) => x.slug)).toEqual(["shiva-old"]);
    expect(await priceOf("shiva-old")).toBe(1500);
  });
  it("preserves existing bookings and their original amounts", async () => {
    const b = (
      await uq("select amount_inr::float8 a, pooja_name from public.bookings")
    ).rows;
    expect(b).toEqual([{ a: 750, pooja_name: "Pradosham" }]);
  });
  it("adds no second schedule to a pooja that has one", async () => {
    const dup = (
      await uq(
        "select count(*)::int n from (select pooja_id from public.panchangam_pooja_rules group by pooja_id having count(*) > 1) d",
      )
    ).rows[0].n;
    expect(dup).toBe(0);
  });
});
