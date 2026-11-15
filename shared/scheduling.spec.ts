import { describe, expect, it } from "vitest";
import { occurrenceOn, type PoojaScheduleInput } from "./scheduling";

const none = { recurring: [], panchangamRules: [], special: [] };
const p = (over: Partial<PoojaScheduleInput>): PoojaScheduleInput => ({
  type: "panchangam",
  ...none,
  ...over,
});
const day = (tithi: string, paksha: string | null, nakshatra: string) => ({
  tithi,
  paksha,
  nakshatra,
});

describe("A. daily recurring poojas", () => {
  it("occur on every date", () => {
    const pooja = p({
      type: "daily",
      recurring: [
        { recurrence: "daily", weekday: null, startTime: "09:15:00" },
      ],
    });
    for (const d of ["2027-01-01", "2027-02-28", "2028-02-29", "2027-12-31"]) {
      expect(occurrenceOn(pooja, d, null)).toMatchObject({
        scheduled: true,
        basis: "daily",
        startTime: "09:15:00",
      });
    }
  });
  it("need no Panchangam data at all", () => {
    const pooja = p({
      type: "daily",
      recurring: [{ recurrence: "daily", weekday: null, startTime: null }],
    });
    expect(occurrenceOn(pooja, "2027-01-01", null).undetermined).toBe(false);
  });
  it("a weekly rule occurs only on its weekday (Saturday = 6)", () => {
    const pooja = p({
      type: "daily",
      recurring: [{ recurrence: "weekly", weekday: 6, startTime: null }],
    });
    expect(occurrenceOn(pooja, "2027-01-02", null)).toMatchObject({
      scheduled: true,
      basis: "weekly",
    });
    expect(occurrenceOn(pooja, "2027-01-03", null).scheduled).toBe(false);
  });
  it("a daily pooja with no active rule never occurs", () => {
    expect(
      occurrenceOn(p({ type: "daily" }), "2027-01-01", null).scheduled,
    ).toBe(false);
  });
});

describe("B. Panchangam-based poojas", () => {
  const rules = (
    ...r: Partial<PoojaScheduleInput["panchangamRules"][number]>[]
  ) =>
    r.map((x) => ({
      tithis: null,
      paksha: null,
      nakshatras: null,
      startTime: null,
      ...x,
    }));

  describe("Pradosham (Trayodashi, either paksha)", () => {
    const pooja = p({
      panchangamRules: rules({ tithis: ["trayodashi"], startTime: "17:30:00" }),
    });
    it("occurs on Trayodashi in both pakshas", () => {
      expect(
        occurrenceOn(
          pooja,
          "2027-03-02",
          day("Trayodashi", "Shukla Paksha", "Rohini"),
        ),
      ).toMatchObject({
        scheduled: true,
        basis: "panchangam",
        startTime: "17:30:00",
      });
      expect(
        occurrenceOn(
          pooja,
          "2027-03-17",
          day("Trayodashi", "Krishna Paksha", "Hasta"),
        ).scheduled,
      ).toBe(true);
    });
    it("does not occur on other tithis", () => {
      for (const t of ["Dwadashi", "Chaturdashi", "Pratipada", "Amavasya"]) {
        expect(
          occurrenceOn(pooja, "2027-03-02", day(t, null, "Rohini")).scheduled,
        ).toBe(false);
      }
    });
    it("accepts the spelling variants found in the data", () => {
      for (const t of ["trayodasi", "Thirayodasi", "TRAYODASHI"]) {
        expect(
          occurrenceOn(pooja, "2027-03-02", day(t, null, "Rohini")).scheduled,
        ).toBe(true);
      }
    });
  });

  describe("Pournami and Amavasya", () => {
    const pournami = p({ panchangamRules: rules({ tithis: ["purnima"] }) });
    const amavasya = p({ panchangamRules: rules({ tithis: ["amavasya"] }) });
    it("Pournami occurs on Purnima/Pournami/Full Moon only", () => {
      for (const t of ["Purnima", "Pournami", "Full Moon"]) {
        expect(
          occurrenceOn(pournami, "2027-03-22", day(t, null, "Hasta")).scheduled,
        ).toBe(true);
      }
      expect(
        occurrenceOn(pournami, "2027-03-22", day("Amavasya", null, "Hasta"))
          .scheduled,
      ).toBe(false);
    });
    it("Amavasya occurs on Amavasya/Amavasai/New Moon only", () => {
      for (const t of ["Amavasya", "Amavasai", "New Moon"]) {
        expect(
          occurrenceOn(amavasya, "2027-04-06", day(t, "Krishna", "Revati"))
            .scheduled,
        ).toBe(true);
      }
      expect(
        occurrenceOn(amavasya, "2027-04-06", day("Purnima", "Shukla", "Revati"))
          .scheduled,
      ).toBe(false);
    });
    it("a Purnima row that claims Krishna paksha is treated as corrupt, not scheduled", () => {
      const r = occurrenceOn(
        pournami,
        "2027-03-22",
        day("Purnima", "Krishna", "Hasta"),
      );
      expect(r.scheduled).toBe(false);
      expect(r.undetermined).toBe(true);
    });
  });

  describe("nakshatra-based poojas", () => {
    const krithigai = p({
      panchangamRules: rules({ nakshatras: ["krittika"] }),
    });
    it("occurs on the nakshatra, whatever the tithi or spelling", () => {
      for (const n of ["Krittika", "Karthigai", "Krithigai"]) {
        expect(
          occurrenceOn(krithigai, "2027-05-10", day("Ashtami", "Shukla", n))
            .scheduled,
        ).toBe(true);
      }
      expect(
        occurrenceOn(
          krithigai,
          "2027-05-10",
          day("Ashtami", "Shukla", "Rohini"),
        ).scheduled,
      ).toBe(false);
    });
    it("is undetermined (not scheduled) when two nakshatras share the day", () => {
      const r = occurrenceOn(
        krithigai,
        "2027-05-10",
        day("Ashtami", "Shukla", "Bharani / Krittika"),
      );
      expect(r).toMatchObject({ scheduled: false, undetermined: true });
    });
  });

  describe("paksha-sensitive scheduling (Sankata Hara Chaturthi = Krishna Chaturthi)", () => {
    const sankata = p({
      panchangamRules: rules({ tithis: ["chaturthi"], paksha: "krishna" }),
    });
    it("occurs on Chaturthi of Krishna paksha only", () => {
      expect(
        occurrenceOn(
          sankata,
          "2027-06-01",
          day("Chaturthi", "Krishna Paksha", "Hasta"),
        ).scheduled,
      ).toBe(true);
      expect(
        occurrenceOn(
          sankata,
          "2027-06-15",
          day("Chaturthi", "Shukla Paksha", "Hasta"),
        ),
      ).toMatchObject({ scheduled: false, undetermined: false });
    });
    it("reads the paksha from the tithi text when the column is empty", () => {
      expect(
        occurrenceOn(
          sankata,
          "2027-06-01",
          day("Krishna Chaturthi", null, "Hasta"),
        ).scheduled,
      ).toBe(true);
    });
    it("does not guess the paksha: unknown paksha means not scheduled", () => {
      expect(
        occurrenceOn(sankata, "2027-06-01", day("Chaturthi", null, "Hasta")),
      ).toMatchObject({ scheduled: false, undetermined: true });
    });
    it("a conflicting paksha (column vs tithi text) is not scheduled", () => {
      expect(
        occurrenceOn(
          sankata,
          "2027-06-01",
          day("Shukla Chaturthi", "Krishna", "Hasta"),
        ).scheduled,
      ).toBe(false);
    });
  });

  describe("combined rules", () => {
    it("several rules are OR-ed (Navavarna: Panchami, Ashtami, Chaturdashi, Amavasya, Purnima)", () => {
      const nav = p({
        panchangamRules: rules({
          tithis: ["panchami", "ashtami", "chaturdashi", "amavasya", "purnima"],
        }),
      });
      for (const t of [
        "Panchami",
        "Ashtami",
        "Chaturdasi",
        "Amavasai",
        "Pournami",
      ]) {
        expect(
          occurrenceOn(nav, "2027-07-01", day(t, null, "Hasta")).scheduled,
        ).toBe(true);
      }
      expect(
        occurrenceOn(nav, "2027-07-01", day("Saptami", null, "Hasta"))
          .scheduled,
      ).toBe(false);
    });
    it("tithi + nakshatra in one rule must both hold", () => {
      const both = p({
        panchangamRules: rules({ tithis: ["ashtami"], nakshatras: ["rohini"] }),
      });
      expect(
        occurrenceOn(both, "2027-07-01", day("Ashtami", null, "Rohini"))
          .scheduled,
      ).toBe(true);
      expect(
        occurrenceOn(both, "2027-07-01", day("Ashtami", null, "Hasta"))
          .scheduled,
      ).toBe(false);
      expect(
        occurrenceOn(both, "2027-07-01", day("Navami", null, "Rohini"))
          .scheduled,
      ).toBe(false);
    });
    it("uses the earliest start time among matching rules", () => {
      const two = p({
        panchangamRules: rules(
          { tithis: ["ashtami"], startTime: "18:00:00" },
          { nakshatras: ["rohini"], startTime: "10:30:00" },
        ),
      });
      expect(
        occurrenceOn(two, "2027-07-01", day("Ashtami", null, "Rohini"))
          .startTime,
      ).toBe("10:30:00");
    });
  });

  describe("missing or ambiguous Panchangam data", () => {
    const pooja = p({ panchangamRules: rules({ tithis: ["trayodashi"] }) });
    it("no data for the date: not scheduled, flagged undetermined (no invented date)", () => {
      expect(occurrenceOn(pooja, "2027-03-02", null)).toMatchObject({
        scheduled: false,
        undetermined: true,
        basis: null,
      });
    });
    it("unrecognisable text: not scheduled", () => {
      for (const t of ["", "???", "Tuesday", "Chaturthi / Panchami"]) {
        expect(
          occurrenceOn(pooja, "2027-03-02", day(t, null, "Rohini")).scheduled,
        ).toBe(false);
      }
    });
    it("a Panchangam pooja with no active rules never occurs (and is not 'undetermined')", () => {
      expect(occurrenceOn(p({}), "2027-03-02", null)).toMatchObject({
        scheduled: false,
        undetermined: false,
      });
    });
    it("daily and special poojas are unaffected by missing Panchangam data", () => {
      const daily = p({
        type: "daily",
        recurring: [{ recurrence: "daily", weekday: null, startTime: null }],
      });
      const special = p({
        type: "special",
        special: [{ date: "2027-03-02", startTime: null }],
      });
      expect(occurrenceOn(daily, "2027-03-02", null).scheduled).toBe(true);
      expect(occurrenceOn(special, "2027-03-02", null).scheduled).toBe(true);
    });
  });
});

describe("C. special poojas", () => {
  const pooja = p({
    type: "special",
    special: [
      { date: "2027-01-14", startTime: "10:00:00", notes: "Bring flowers" },
    ],
  });
  it("occur only on their scheduled dates", () => {
    expect(occurrenceOn(pooja, "2027-01-14", null)).toMatchObject({
      scheduled: true,
      basis: "special",
      startTime: "10:00:00",
      notes: "Bring flowers",
    });
    expect(occurrenceOn(pooja, "2027-01-15", null).scheduled).toBe(false);
  });
  it("ignore recurring and Panchangam rules (a special pooja is never 'daily')", () => {
    const odd = p({
      type: "special",
      recurring: [{ recurrence: "daily", weekday: null, startTime: null }],
      panchangamRules: [
        {
          tithis: ["purnima"],
          paksha: null,
          nakshatras: null,
          startTime: null,
        },
      ],
    });
    expect(
      occurrenceOn(odd, "2027-01-14", day("Purnima", null, "Hasta")).scheduled,
    ).toBe(false);
  });
});
