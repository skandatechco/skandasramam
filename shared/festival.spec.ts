import { describe, expect, it } from "vitest";
import {
  FESTIVAL_STATE_MESSAGE,
  festivalBookingState,
  festivalPath,
  isFestivalSlug,
} from "./festival";
import { resolveDestination } from "./poojaPages";
import { occurrenceOn } from "./scheduling";

const base = {
  active: true,
  date: "2027-03-10",
  opensOn: null,
  closesOn: null,
  maxBookings: null,
  liveBookings: 0,
};

describe("festivalBookingState", () => {
  it("is open from now until the festival date (inclusive) by default", () => {
    expect(festivalBookingState(base, "2027-01-01")).toBe("open");
    expect(festivalBookingState(base, "2027-03-10")).toBe("open");
    expect(festivalBookingState(base, "2027-03-11")).toBe("closed");
  });
  it("honours the booking window", () => {
    const w = { ...base, opensOn: "2027-03-01", closesOn: "2027-03-08" };
    expect(festivalBookingState(w, "2027-02-28")).toBe("not_open_yet");
    expect(festivalBookingState(w, "2027-03-01")).toBe("open");
    expect(festivalBookingState(w, "2027-03-08")).toBe("open");
    expect(festivalBookingState(w, "2027-03-09")).toBe("closed");
  });
  it("is full at the maximum number of live bookings", () => {
    const c = { ...base, maxBookings: 3 };
    expect(festivalBookingState({ ...c, liveBookings: 2 }, "2027-03-01")).toBe(
      "open",
    );
    expect(festivalBookingState({ ...c, liveBookings: 3 }, "2027-03-01")).toBe(
      "full",
    );
    expect(festivalBookingState({ ...c, liveBookings: 9 }, "2027-03-01")).toBe(
      "full",
    );
  });
  it("an inactive offering is never open", () => {
    expect(festivalBookingState({ ...base, active: false }, "2027-03-01")).toBe(
      "inactive",
    );
  });
  it("has a message for every reason it can be closed", () => {
    for (const k of ["inactive", "not_open_yet", "closed", "full"] as const)
      expect(FESTIVAL_STATE_MESSAGE[k].length).toBeGreaterThan(5);
  });
});

describe("festival slugs and booking links", () => {
  it("a festival slug always resolves to its own booking page", () => {
    const slug = "festival-maha-shivaratri-rudra-abhishekam-20270306";
    expect(isFestivalSlug(slug)).toBe(true);
    expect(resolveDestination(slug)).toBe(festivalPath(slug));
    expect(resolveDestination(slug)).toBe(`/poojas/festival/${slug}`);
  });
  it("other slugs are not festival slugs", () => {
    for (const s of [
      "pradosham",
      "festival",
      "festival-",
      "Festival-x",
      "festival--x",
      "annadanam",
    ])
      expect([s, isFestivalSlug(s)]).toEqual([s, false]);
    expect(resolveDestination("annadanam")).toBeNull();
  });
});

describe("a festival offering is scheduled on its own date only", () => {
  const input = {
    type: "festival" as const,
    recurring: [],
    panchangamRules: [],
    special: [{ date: "2027-03-06", startTime: "18:00:00", notes: null }],
  };
  it("occurs on its date with its time", () => {
    expect(occurrenceOn(input, "2027-03-06", null)).toMatchObject({
      scheduled: true,
      basis: "festival",
      startTime: "18:00:00",
    });
  });
  it("does not occur on any other date, with or without a Panchangam", () => {
    const day = {
      tithi: "Pradosham",
      paksha: "Krishna Paksha",
      nakshatra: "Rohini",
    };
    expect(occurrenceOn(input, "2027-03-07", day).scheduled).toBe(false);
    expect(occurrenceOn(input, "2027-03-05", null).scheduled).toBe(false);
  });
});
