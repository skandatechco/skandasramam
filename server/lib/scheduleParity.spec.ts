import { describe, expect, it, vi } from "vitest";
import { monthDates } from "../../shared/calendar";
import { buildCalendarMonth, type PoojaRow } from "./calendarMonth";

// No network: the Prokerala fallback is exercised in its own suite.
vi.mock("./panchangFallback", () => ({
  panchangFallback: { get: () => null, fill: async () => 0 },
}));
const { checkPoojaScheduledOn } = await import("./bookingSchedule");

/** Minimal in-memory stand-in for the supabase-js query builder (select/eq/maybeSingle). */
function memoryDb(tables: Record<string, any[]>) {
  return {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      const b: any = {
        select: () => b,
        eq: (col: string, val: any) => (
          (rows = rows.filter((r) => r[col] === val)),
          b
        ),
        maybeSingle: () =>
          Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (res: any, rej: any) =>
          Promise.resolve({ data: rows, error: null }).then(res, rej),
      };
      return b;
    },
  } as any;
}

const poojas: (PoojaRow & { active: boolean })[] = [
  {
    id: "d1",
    slug: "prathiyankara-sarabha-sulini-homam",
    name: "Daily",
    type: "daily",
    amount_inr: 100,
    active: true,
  },
  {
    id: "d2",
    slug: "tamil-month-first-saturday",
    name: "Saturdays",
    type: "daily",
    amount_inr: 100,
    active: true,
  },
  {
    id: "p1",
    slug: "pradosham",
    name: "Pradosham",
    type: "panchangam",
    amount_inr: 300,
    active: true,
  },
  {
    id: "p2",
    slug: "pournami-full-moon",
    name: "Pournami",
    type: "panchangam",
    amount_inr: 300,
    active: true,
  },
  {
    id: "p3",
    slug: "sankata-hara-chaturthi",
    name: "Sankata",
    type: "panchangam",
    amount_inr: 300,
    active: true,
  },
  {
    id: "p4",
    slug: "krithigai",
    name: "Krithigai",
    type: "panchangam",
    amount_inr: 300,
    active: true,
  },
  {
    id: "p5",
    slug: "navavarna-pooja",
    name: "Navavarna",
    type: "panchangam",
    amount_inr: 300,
    active: true,
  },
  {
    id: "s1",
    slug: "lord-shiva",
    name: "Shiva",
    type: "special",
    amount_inr: 900,
    active: true,
  },
];

const T = "2099-02-"; // far future: never "today"
const day = (
  d: number,
  tithi: string,
  paksha: string | null,
  nakshatra: string,
) => ({
  date: `${T}${String(d).padStart(2, "0")}`,
  tithi,
  paksha,
  nakshatra,
  labels: [],
});
// Deliberately includes ambiguous/missing cases; days 25-28 have no row at all.
const pooja_days = [
  day(1, "Trayodashi", "Shukla Paksha", "Rohini"),
  day(2, "Chaturdashi", "Shukla Paksha", "Bharani"),
  day(3, "Pournami", "", "Pushya"),
  day(4, "Chaturthi", "Krishna Paksha", "Hasta"),
  day(5, "Chaturthi", "Shukla Paksha", "Hasta"),
  day(6, "Chaturthi", "", "Hasta"), // paksha unknown
  day(7, "Panchami", "Shukla", "Karthigai"),
  day(8, "Ashtami", "Krishna", "Ardra / Punarvasu"), // ambiguous nakshatra
  day(9, "Amavasya", "Krishna", "Mula"),
  day(10, "Purnima", "Krishna", "Hasta"), // self-contradicting row
  day(11, "???", "???", "???"), // garbage
  day(12, "Trayodasi", "Krishna Paksha", "Krittika"),
  day(13, "Panchami", "Shukla", "Rohini"),
  day(14, "Amavasai", "", "Rohini"),
];

const tables = {
  poojas,
  recurring_pooja_schedule: [
    {
      pooja_id: "d1",
      recurrence: "daily",
      weekday: null,
      start_time: "09:15:00",
      active: true,
    },
    {
      pooja_id: "d2",
      recurrence: "weekly",
      weekday: 6,
      start_time: null,
      active: true,
    },
  ],
  panchangam_pooja_rules: [
    {
      pooja_id: "p1",
      tithis: ["trayodashi"],
      paksha: null,
      nakshatras: null,
      start_time: null,
      active: true,
    },
    {
      pooja_id: "p2",
      tithis: ["purnima"],
      paksha: null,
      nakshatras: null,
      start_time: null,
      active: true,
    },
    {
      pooja_id: "p3",
      tithis: ["chaturthi"],
      paksha: "krishna",
      nakshatras: null,
      start_time: null,
      active: true,
    },
    {
      pooja_id: "p4",
      tithis: null,
      paksha: null,
      nakshatras: ["krittika"],
      start_time: null,
      active: true,
    },
    {
      pooja_id: "p5",
      tithis: ["panchami", "ashtami", "chaturdashi", "amavasya", "purnima"],
      paksha: null,
      nakshatras: null,
      start_time: null,
      active: true,
    },
  ],
  special_pooja_schedule: [
    {
      pooja_id: "s1",
      date: `${T}15`,
      start_time: "10:00:00",
      notes: null,
      active: true,
    },
    {
      pooja_id: "s1",
      date: `${T}16`,
      start_time: null,
      notes: null,
      active: false,
    }, // disabled: neither shows nor books
  ],
  pooja_days,
};
const active = (rows: any[]) => rows.filter((r) => r.active !== false);

describe("homepage calendar and booking validation use the same rules", () => {
  const cal = buildCalendarMonth({
    year: 2099,
    month: 2,
    panchang: new Map(
      pooja_days.map((d) => [
        d.date,
        {
          tithi: d.tithi,
          paksha: d.paksha,
          nakshatra: d.nakshatra,
          labels: d.labels,
          source: "pooja_days" as const,
        },
      ]),
    ),
    poojas: active(poojas),
    recurring: active(tables.recurring_pooja_schedule),
    panchangamRules: active(tables.panchangam_pooja_rules),
    special: active(tables.special_pooja_schedule),
  });
  const listedOn = (date: string) => {
    const d = cal.days.find((x) => x.date === date)!;
    return new Set(
      [...d.recurring, ...d.panchangam, ...d.special].map((o) => o.slug),
    );
  };

  // booking validation only ever sees ACTIVE schedule rows (as the real queries do)
  const db = memoryDb({
    ...tables,
    recurring_pooja_schedule: active(tables.recurring_pooja_schedule),
    panchangam_pooja_rules: active(tables.panchangam_pooja_rules),
    special_pooja_schedule: active(tables.special_pooja_schedule),
  });

  it("agree on every pooja for every date of the month", async () => {
    let compared = 0;
    for (const date of monthDates(2099, 2)) {
      for (const p of poojas) {
        const shown = listedOn(date).has(p.slug);
        const bookable = (await checkPoojaScheduledOn(db, p, date)).ok;
        expect([p.slug, date, bookable]).toEqual([p.slug, date, shown]);
        compared++;
      }
    }
    expect(compared).toBe(28 * poojas.length);
  });

  it("the cases that must NOT be bookable really are refused", async () => {
    const refused = async (slug: string, d: number) =>
      (
        await checkPoojaScheduledOn(
          db,
          poojas.find((p) => p.slug === slug)!,
          `${T}${String(d).padStart(2, "0")}`,
        )
      ).ok;
    expect(await refused("sankata-hara-chaturthi", 5)).toBe(false); // Shukla Chaturthi
    expect(await refused("sankata-hara-chaturthi", 6)).toBe(false); // paksha unknown
    expect(await refused("krithigai", 8)).toBe(false); // two nakshatras
    expect(await refused("pournami-full-moon", 10)).toBe(false); // contradictory row
    expect(await refused("pradosham", 11)).toBe(false); // garbage text
    expect(await refused("pradosham", 26)).toBe(false); // no Panchangam row
    expect(await refused("lord-shiva", 16)).toBe(false); // disabled special date
  });

  it("and the cases that must be bookable are accepted", async () => {
    const ok = async (slug: string, d: number) =>
      (
        await checkPoojaScheduledOn(
          db,
          poojas.find((p) => p.slug === slug)!,
          `${T}${String(d).padStart(2, "0")}`,
        )
      ).ok;
    expect(await ok("pradosham", 1)).toBe(true);
    expect(await ok("pradosham", 12)).toBe(true);
    expect(await ok("pournami-full-moon", 3)).toBe(true);
    expect(await ok("sankata-hara-chaturthi", 4)).toBe(true);
    expect(await ok("krithigai", 7)).toBe(true);
    expect(await ok("krithigai", 12)).toBe(true);
    expect(await ok("navavarna-pooja", 14)).toBe(true); // Amavasya
    expect(await ok("lord-shiva", 15)).toBe(true);
    expect(await ok("prathiyankara-sarabha-sulini-homam", 20)).toBe(true); // daily, no Panchangam needed
  });

  it("tells missing/ambiguous Panchangam apart from a plain 'not on this date'", async () => {
    const pradosham = poojas.find((p) => p.slug === "pradosham")!;
    const missing = await checkPoojaScheduledOn(db, pradosham, `${T}26`);
    expect(missing).toMatchObject({
      ok: false,
      code: "PANCHANGAM_UNAVAILABLE",
    });
    const plain = await checkPoojaScheduledOn(db, pradosham, `${T}02`); // Chaturdashi: clearly not Trayodashi
    expect(plain).toMatchObject({ ok: false, code: "NOT_SCHEDULED" });
  });
});
