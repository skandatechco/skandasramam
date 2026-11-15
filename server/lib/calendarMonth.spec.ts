import { describe, expect, it } from "vitest";
import type { CalendarPanchang } from "../../shared/calendar";
import {
  buildCalendarMonth,
  type PanchangamRuleRow,
  type PoojaRow,
} from "./calendarMonth";

// Real slugs: they have public detail pages, so a price makes them bookable.
const poojas: PoojaRow[] = [
  {
    id: "d1",
    slug: "prathiyankara-sarabha-sulini-homam",
    name: "Daily Homam",
    type: "daily",
    amount_inr: 100,
  },
  {
    id: "d2",
    slug: "tamil-month-first-saturday",
    name: "Saturday Pooja",
    type: "daily",
    amount_inr: null,
  },
  {
    id: "p1",
    slug: "pradosham",
    name: "Pradosham",
    type: "panchangam",
    amount_inr: "300.00",
  },
  {
    id: "p2",
    slug: "pournami-full-moon",
    name: "Pournami",
    type: "panchangam",
    amount_inr: 250,
  },
  {
    id: "p3",
    slug: "amavasya-new-moon",
    name: "Amavasya",
    type: "panchangam",
    amount_inr: 250,
  },
  {
    id: "p4",
    slug: "krithigai",
    name: "Krithigai",
    type: "panchangam",
    amount_inr: 200,
  },
  {
    id: "p5",
    slug: "sankata-hara-chaturthi",
    name: "Sankata Hara Chaturthi",
    type: "panchangam",
    amount_inr: 200,
  },
  {
    id: "p6",
    slug: "swathi-nakshatram",
    name: "Swathi",
    type: "panchangam",
    amount_inr: null,
  },
  {
    id: "s1",
    slug: "lord-shiva",
    name: "Lord Shiva",
    type: "special",
    amount_inr: "1500.00",
  },
  {
    id: "s2",
    slug: "homam-for-world-peace",
    name: "World Peace Homam",
    type: "special",
    amount_inr: null,
  },
  // priced but there is NO public page for this slug, so it must never be bookable
  {
    id: "x1",
    slug: "no-such-page",
    name: "Pageless Pooja",
    type: "special",
    amount_inr: 500,
  },
];
const rule = (
  pooja_id: string,
  over: Partial<PanchangamRuleRow>,
): PanchangamRuleRow => ({
  pooja_id,
  tithis: null,
  paksha: null,
  nakshatras: null,
  start_time: null,
  ...over,
});
const rules: PanchangamRuleRow[] = [
  rule("p1", { tithis: ["trayodashi"], start_time: "17:30:00" }),
  rule("p2", { tithis: ["purnima"] }),
  rule("p3", { tithis: ["amavasya"] }),
  rule("p4", { nakshatras: ["krittika"] }),
  rule("p5", { tithis: ["chaturthi"], paksha: "krishna" }),
  rule("p6", { nakshatras: ["swati"] }),
];

const pj = (
  tithi: string,
  paksha: string | null,
  nakshatra: string,
): CalendarPanchang => ({
  tithi,
  paksha: paksha as any,
  nakshatra,
  labels: [],
  source: "pooja_days",
});
const build = (over: Partial<Parameters<typeof buildCalendarMonth>[0]> = {}) =>
  buildCalendarMonth({
    year: 2027,
    month: 1,
    panchang: new Map(),
    poojas,
    recurring: [],
    panchangamRules: rules,
    special: [],
    ...over,
  });
const day = (r: ReturnType<typeof build>, date: string) =>
  r.days.find((d) => d.date === date)!;
const slugs = (o: { slug: string }[]) => o.map((x) => x.slug);

describe("month shape", () => {
  it("returns one entry per date, including leap-day February", () => {
    expect(build().days).toHaveLength(31);
    expect(build({ year: 2028, month: 2 }).days).toHaveLength(29);
    expect(build({ year: 2027, month: 2 }).days).toHaveLength(28);
    expect(build({ year: 2027, month: 4 }).days[29].date).toBe("2027-04-30");
  });
});

describe("A. daily poojas", () => {
  it("a 'daily' rule puts the pooja on every date; no Panchangam data needed", () => {
    const r = build({
      recurring: [
        {
          pooja_id: "d1",
          recurrence: "daily",
          weekday: null,
          start_time: "09:15:00",
        },
      ],
    });
    expect(
      r.days.every(
        (d) =>
          slugs(d.recurring).join() === "prathiyankara-sarabha-sulini-homam",
      ),
    ).toBe(true);
    expect(r.days[0].recurring[0].startTime).toBe("09:15:00");
    expect(r.hasScheduledPoojas).toBe(true);
  });
  it("a weekly rule appears only on that weekday (Saturdays of Jan 2027)", () => {
    const r = build({
      recurring: [
        { pooja_id: "d2", recurrence: "weekly", weekday: 6, start_time: null },
      ],
    });
    expect(r.days.filter((d) => d.recurring.length).map((d) => d.date)).toEqual(
      ["2027-01-02", "2027-01-09", "2027-01-16", "2027-01-23", "2027-01-30"],
    );
  });
  it("dedupes overlapping rules and sorts by time then name", () => {
    const r = build({
      recurring: [
        {
          pooja_id: "d1",
          recurrence: "daily",
          weekday: null,
          start_time: "18:00:00",
        },
        {
          pooja_id: "d1",
          recurrence: "weekly",
          weekday: 0,
          start_time: "07:00:00",
        },
        {
          pooja_id: "d2",
          recurrence: "daily",
          weekday: null,
          start_time: null,
        },
      ],
    });
    expect(
      day(r, "2027-01-03").recurring.map((o) => [o.slug, o.startTime]),
    ).toEqual([
      ["prathiyankara-sarabha-sulini-homam", "07:00:00"],
      ["tamil-month-first-saturday", null],
    ]);
  });
});

describe("B. Panchangam-based poojas", () => {
  const panchang = new Map<string, CalendarPanchang>([
    ["2027-01-05", pj("Trayodashi", "Shukla Paksha", "Rohini")], // Pradosham
    ["2027-01-19", pj("Trayodasi", "Krishna Paksha", "Hasta")], // Pradosham (spelling, other paksha)
    ["2027-01-06", pj("Chaturdashi", "Shukla Paksha", "Bharani")], // nothing
    ["2027-01-22", pj("Pournami", null, "Pushya")], // Pournami
    ["2027-01-08", pj("Amavasai", "Krishna", "Mula")], // Amavasya
    ["2027-01-12", pj("Panchami", "Shukla", "Karthigai")], // Krithigai (nakshatra)
    ["2027-01-14", pj("Chaturthi", "Krishna Paksha", "Hasta")], // Sankata Hara (Krishna)
    ["2027-01-28", pj("Chaturthi", "Shukla Paksha", "Hasta")], // NOT Sankata Hara (Shukla)
    ["2027-01-16", pj("Chaturthi", null, "Hasta")], // paksha unknown -> undetermined
    ["2027-01-20", pj("Saptami", "Krishna", "Ardra / Punarvasu")], // ambiguous nakshatra
  ]);
  const r = build({ panchang });
  const on = (date: string) => slugs(day(r, date).panchangam);

  it("Pradosham occurs on Trayodashi in either paksha, with its rule's time", () => {
    expect(on("2027-01-05")).toEqual(["pradosham"]);
    expect(on("2027-01-19")).toEqual(["pradosham"]);
    expect(day(r, "2027-01-05").panchangam[0].startTime).toBe("17:30:00");
    expect(on("2027-01-06")).toEqual([]);
  });
  it("Pournami and Amavasya occur on Purnima / Amavasya only", () => {
    expect(on("2027-01-22")).toEqual(["pournami-full-moon"]);
    expect(on("2027-01-08")).toEqual(["amavasya-new-moon"]);
  });
  it("a nakshatra pooja occurs on its nakshatra whatever the spelling", () => {
    expect(on("2027-01-12")).toEqual(["krithigai"]);
  });
  it("paksha-sensitive: Sankata Hara Chaturthi only in the Krishna paksha", () => {
    expect(on("2027-01-14")).toEqual(["sankata-hara-chaturthi"]);
    expect(on("2027-01-28")).toEqual([]);
  });
  it("never invents a date: unknown paksha, ambiguous nakshatra or missing data list nothing", () => {
    expect(on("2027-01-16")).toEqual([]); // paksha unknown
    expect(on("2027-01-20")).toEqual([]); // two nakshatras in the day
    for (const d of ["2027-01-01", "2027-01-02", "2027-01-30"])
      expect(on(d)).toEqual([]); // no Panchangam row at all
    expect(
      r.days.filter((d) => d.panchangam.length).map((d) => d.date),
    ).toEqual([
      "2027-01-05",
      "2027-01-08",
      "2027-01-12",
      "2027-01-14",
      "2027-01-19",
      "2027-01-22",
    ]);
  });
  it("without any Panchangam data no Panchangam pooja is listed, but daily and special still are", () => {
    const empty = build({
      recurring: [
        {
          pooja_id: "d1",
          recurrence: "daily",
          weekday: null,
          start_time: null,
        },
      ],
      special: [
        { pooja_id: "s1", date: "2027-01-14", start_time: null, notes: null },
      ],
    });
    expect(empty.days.every((d) => d.panchangam.length === 0)).toBe(true);
    expect(empty.days.every((d) => d.recurring.length === 1)).toBe(true);
    expect(day(empty, "2027-01-14").special).toHaveLength(1);
  });
  it("is not confused by pooja_days.labels (labels play no part in scheduling)", () => {
    const withLabel = build({
      panchang: new Map([
        [
          "2027-01-05",
          { ...pj("Dwadashi", "Shukla", "Rohini"), labels: ["Pradosham"] },
        ],
      ]),
    });
    expect(slugs(day(withLabel, "2027-01-05").panchangam)).toEqual([]);
  });
  it("a rule-less Panchangam pooja never appears", () => {
    const none = build({ panchang, panchangamRules: [] });
    expect(none.days.every((d) => d.panchangam.length === 0)).toBe(true);
  });
});

describe("C. special poojas", () => {
  it("appear only on their scheduled dates", () => {
    const r = build({
      special: [
        {
          pooja_id: "s1",
          date: "2027-01-14",
          start_time: "10:00:00",
          notes: "Pongal",
        },
      ],
    });
    expect(day(r, "2027-01-14").special).toEqual([
      { slug: "lord-shiva", startTime: "10:00:00", notes: "Pongal" },
    ]);
    expect(r.days.filter((d) => d.special.length)).toHaveLength(1);
  });
  it("ignore rows that point at a daily pooja, and dedupe repeats", () => {
    const r = build({
      special: [
        { pooja_id: "d1", date: "2027-01-14", start_time: null, notes: null },
        { pooja_id: "s1", date: "2027-01-15", start_time: null, notes: null },
        { pooja_id: "s1", date: "2027-01-15", start_time: null, notes: null },
      ],
    });
    expect(day(r, "2027-01-14").special).toEqual([]);
    expect(day(r, "2027-01-15").special).toHaveLength(1);
  });
});

describe("prices and public pages", () => {
  const all = build({
    panchang: new Map([["2027-01-05", pj("Trayodashi", "Shukla", "Swathi")]]),
    recurring: [
      { pooja_id: "d2", recurrence: "daily", weekday: null, start_time: null },
    ],
    special: [
      { pooja_id: "s1", date: "2027-01-14", start_time: null, notes: null },
      { pooja_id: "s2", date: "2027-01-15", start_time: null, notes: null },
      { pooja_id: "x1", date: "2027-01-16", start_time: null, notes: null },
    ],
  });
  it("a pooja without an approved price is never bookable and has no amount", () => {
    expect(all.poojas["tamil-month-first-saturday"]).toMatchObject({
      amount: null,
      bookable: false,
    });
    expect(all.poojas["homam-for-world-peace"]).toMatchObject({
      amount: null,
      bookable: false,
    });
  });
  it("priced poojas with a page are bookable at their exact fixed amount (numeric strings coerced)", () => {
    expect(all.poojas["lord-shiva"]).toMatchObject({
      amount: 1500,
      bookable: true,
      destination: "/poojas/special/lord-shiva",
    });
    expect(all.poojas["pradosham"]).toMatchObject({
      amount: 300,
      bookable: true,
      destination: "/poojas/regular/pradosham",
    });
  });
  it("a priced pooja with NO public page is not bookable", () => {
    expect(all.poojas["no-such-page"]).toMatchObject({
      amount: 500,
      destination: null,
      bookable: false,
    });
  });
  it("lists only poojas actually scheduled this month", () => {
    const r = build({
      recurring: [
        {
          pooja_id: "d1",
          recurrence: "daily",
          weekday: null,
          start_time: null,
        },
      ],
    });
    expect(Object.keys(r.poojas)).toEqual([
      "prathiyankara-sarabha-sulini-homam",
    ]);
  });
});

describe("missing data", () => {
  it("returns an honest empty month when nothing is seeded", () => {
    const r = build({ poojas: [], panchangamRules: [] });
    expect(r.hasScheduledPoojas).toBe(false);
    expect(r.poojas).toEqual({});
    expect(
      r.days.every(
        (d) => !d.recurring.length && !d.panchangam.length && !d.special.length,
      ),
    ).toBe(true);
  });
  it("leaves panchang null for dates without data (never fabricated)", () => {
    const r = build({
      panchang: new Map([["2027-01-05", pj("Panchami", "Shukla", "Rohini")]]),
    });
    expect(day(r, "2027-01-05").panchang).toMatchObject({
      nakshatra: "Rohini",
      source: "pooja_days",
    });
    expect(day(r, "2027-01-06").panchang).toBeNull();
  });
  it("passes pending and degraded flags through", () => {
    const r = build({ panchangPending: 7, degraded: true });
    expect([r.panchangPending, r.degraded]).toEqual([7, true]);
  });
});
