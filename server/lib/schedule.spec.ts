import { describe, expect, it } from "vitest";
import { addDays, checkBookingWindow, todayIST } from "./schedule";

describe("schedule rules", () => {
  it("computes IST today across the UTC date boundary", () => {
    // 20:00 UTC on Jan 1 is already Jan 2 in IST
    expect(todayIST(new Date("2027-01-01T20:00:00Z"))).toBe("2027-01-02");
  });
  it("enforces the booking window", () => {
    expect(checkBookingWindow("2027-01-09", "2027-01-10")).toMatch(/passed/);
    expect(checkBookingWindow("2027-01-10", "2027-01-10")).toBeNull();
    expect(
      checkBookingWindow(addDays("2027-01-10", 365), "2027-01-10"),
    ).toBeNull();
    expect(
      checkBookingWindow(addDays("2027-01-10", 366), "2027-01-10"),
    ).toMatch(/year/);
  });
});
