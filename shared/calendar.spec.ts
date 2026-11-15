import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  daysInMonth,
  isLeapYear,
  monthDates,
  shiftMonth,
  weekdayOf,
} from "./calendar";
import { monthQuerySchema } from "./calendarQuery";

describe("leap years and month lengths", () => {
  it("handles the Gregorian leap rules", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2100)).toBe(false); // divisible by 100, not 400
    expect(isLeapYear(2000)).toBe(true); // divisible by 400
    expect(isLeapYear(2027)).toBe(false);
  });
  it("gives 29 days to February only in leap years", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(monthDates(2028, 2)[28]).toBe("2028-02-29");
    expect(monthDates(2028, 2)).toHaveLength(29);
  });
  it("has the right length for every other month", () => {
    expect(
      [1, 3, 5, 7, 8, 10, 12].every((m) => daysInMonth(2027, m) === 31),
    ).toBe(true);
    expect([4, 6, 9, 11].every((m) => daysInMonth(2027, m) === 30)).toBe(true);
  });
});

describe("month navigation across year boundaries", () => {
  it("rolls December -> January and January -> December", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2027, 1, -1)).toEqual({ year: 2026, month: 12 });
    expect(shiftMonth(2027, 3, 14)).toEqual({ year: 2028, month: 5 });
    expect(shiftMonth(2027, 3, -15)).toEqual({ year: 2025, month: 12 });
  });
});

describe("buildMonthGrid", () => {
  it("is Sunday-first, whole weeks, and covers each date exactly once in-month", () => {
    for (const [y, m] of [
      [2027, 1],
      [2028, 2],
      [2027, 2],
      [2026, 11],
      [2027, 8],
    ]) {
      const grid = buildMonthGrid(y, m);
      expect(grid.every((w) => w.length === 7)).toBe(true);
      const inMonth = grid
        .flat()
        .filter((c) => c.inMonth)
        .map((c) => c.date);
      expect(inMonth).toEqual(monthDates(y, m));
      expect(weekdayOf(grid[0][0].date)).toBe(0); // starts on Sunday
    }
  });
  it("pads with the neighbouring months' real dates (year boundary)", () => {
    // 1 Jan 2027 is a Friday: 5 leading cells from Dec 2026
    const jan = buildMonthGrid(2027, 1);
    expect(jan[0].slice(0, 5).map((c) => c.date)).toEqual([
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
    ]);
    expect(jan[0][5]).toEqual({ date: "2027-01-01", inMonth: true });
    // Jan 31 is a Sunday -> the last row pads into February
    const last = jan[jan.length - 1];
    expect(last[0]).toEqual({ date: "2027-01-31", inMonth: true });
    expect(last[1]).toEqual({ date: "2027-02-01", inMonth: false });
  });
  it("needs no padding for a Feb 1 Sunday, 28-day month (Feb 2026)", () => {
    const feb = buildMonthGrid(2026, 2);
    expect(feb).toHaveLength(4);
    expect(feb.flat().every((c) => c.inMonth)).toBe(true);
  });
  it("can need six rows", () => {
    expect(buildMonthGrid(2027, 1)).toHaveLength(6); // Fri 1 Jan + 31 days spills into a sixth row
    expect(buildMonthGrid(2027, 8)).toHaveLength(5); // Sun 1 Aug + 31 days fits in five
  });
});

describe("monthQuerySchema", () => {
  it("accepts valid values and coerces strings", () => {
    expect(monthQuerySchema.parse({ year: "2027", month: "1" })).toEqual({
      year: 2027,
      month: 1,
    });
  });
  it("rejects bad input", () => {
    for (const bad of [
      { year: "2027", month: "0" },
      { year: "2027", month: "13" },
      { year: "1999", month: "5" },
      { year: "abc", month: "1" },
      {},
    ]) {
      expect(monthQuerySchema.safeParse(bad).success).toBe(false);
    }
  });
});
