import { describe, expect, it } from "vitest";
import type { PoojaScheduleInput } from "../../shared/scheduling";
import { reviewPanchangam, type DayRow } from "./panchangamReview";

const rule = (over: object): PoojaScheduleInput => ({
  type: "panchangam",
  recurring: [],
  special: [],
  panchangamRules: [
    {
      tithis: null,
      paksha: null,
      nakshatras: null,
      startTime: "17:00:00",
      ...over,
    },
  ],
});
const pradosham = {
  slug: "pradosham",
  name: "Pradosham",
  input: rule({ tithis: ["trayodashi"] }),
};
const uthiram = {
  slug: "uthiram-nakshatram",
  name: "Uthiram",
  input: rule({ nakshatras: ["uttara_phalguni"] }),
};
const d = (date: string, tithi: string, nakshatra = "Rohini"): DayRow => ({
  date,
  tithi,
  paksha: "Shukla Paksha",
  nakshatra,
});

describe("panchangam review", () => {
  it("lists the dates each observance would be offered on, and marks Pradosham time-specific", () => {
    const r = reviewPanchangam(
      [
        d("2099-01-01", "Dwadashi"),
        d("2099-01-02", "Trayodashi"),
        d("2099-01-03", "Chaturdashi"),
      ],
      [pradosham],
    );
    expect(r.scheduled.pradosham).toEqual(["2099-01-02"]);
    const f = r.findings.find((x) => x.date === "2099-01-02")!;
    expect(f.reasons.join(" ")).toMatch(/Pradosha kala/);
  });

  it("flags adjacent dates that are both scheduled", () => {
    const r = reviewPanchangam(
      [d("2099-01-02", "Trayodashi"), d("2099-01-03", "Thirayodasi")],
      [pradosham],
    );
    expect(r.scheduled.pradosham).toEqual(["2099-01-02", "2099-01-03"]);
    expect(
      r.findings.every((f) => f.reasons.some((x) => /adjacent/.test(x))),
    ).toBe(true);
  });

  it("reports missing dates and never schedules a Panchangam pooja on them", () => {
    const r = reviewPanchangam(
      [d("2099-01-01", "Trayodashi"), d("2099-01-04", "Trayodashi")],
      [pradosham],
    );
    expect(r.missingDates).toEqual(["2099-01-02", "2099-01-03"]);
    expect(r.scheduled.pradosham).toEqual(["2099-01-01", "2099-01-04"]);
    expect(
      r.findings.filter((f) =>
        f.reasons.some((x) => /no Panchangam row/.test(x)),
      ),
    ).toHaveLength(2);
  });

  it("flags a two-nakshatra day as ambiguous and not bookable", () => {
    const r = reviewPanchangam(
      [
        d("2099-01-01", "Panchami", "Hasta"),
        d("2099-01-02", "Panchami", "Uttara Phalguni / Hasta"),
      ],
      [uthiram],
    );
    expect(r.scheduled["uthiram-nakshatram"]).toEqual([]);
    expect(
      r.findings.some(
        (f) => f.date === "2099-01-02" && /ambiguous/.test(f.reasons[0]),
      ),
    ).toBe(true);
  });

  it("flags a suspicious gap between Pradosham dates", () => {
    const rows: DayRow[] = [];
    for (let i = 1; i <= 28; i++)
      rows.push(
        d(
          `2099-02-${String(i).padStart(2, "0")}`,
          i === 1 || i === 28 ? "Trayodashi" : "Panchami",
        ),
      );
    const r = reviewPanchangam(rows, [pradosham]);
    expect(
      r.findings.some((f) =>
        /may be missing or mislabelled/.test(f.reasons[0]),
      ),
    ).toBe(true);
  });

  it("handles an empty export", () => {
    expect(reviewPanchangam([], [pradosham]).range).toBeNull();
  });
});
