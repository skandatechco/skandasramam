/**
 * Festival offerings on the homepage calendar: they appear on their date only,
 * with festival name, pooja name, time and their OWN price; the booking link goes
 * to the festival's page; and a closed/full/inactive offering is never bookable.
 */
import { describe, expect, it } from "vitest";
import { resolveDestination } from "../../shared/poojaPages";
import {
  bookingAvailability,
  bookingLink,
} from "../../client/lib/calendarLinks";
import {
  buildCalendarMonth,
  type FestivalRow,
  type PoojaRow,
} from "./calendarMonth";

const SLUG = "festival-maha-shivaratri-rudra-abhishekam-20270306";
const pooja: PoojaRow = {
  id: "f1",
  slug: SLUG,
  name: "Rudra Abhishekam",
  type: "festival",
  amount_inr: "1501.00",
};
// An ordinary pooja with the SAME name keeps its own standard rate.
const standard: PoojaRow = {
  id: "s1",
  slug: "pradosham",
  name: "Pradosham",
  type: "panchangam",
  amount_inr: 100,
};
const festival: FestivalRow = {
  pooja_id: "f1",
  festival_name: "Maha Shivaratri",
  date: "2027-03-06",
  start_time: "18:00:00",
  booking_opens_on: null,
  booking_closes_on: null,
  max_bookings: null,
  active: true,
};

const build = (over: Partial<Parameters<typeof buildCalendarMonth>[0]> = {}) =>
  buildCalendarMonth({
    year: 2027,
    month: 3,
    panchang: new Map(),
    poojas: [pooja, standard],
    recurring: [],
    special: [],
    festivals: [festival],
    today: "2027-03-01",
    ...over,
  });

const dayOf = (r: ReturnType<typeof build>, date: string) =>
  r.days.find((d) => d.date === date)!;

describe("festival poojas on the calendar", () => {
  it("appear on their scheduled date, and only then", () => {
    const r = build();
    expect(dayOf(r, "2027-03-06").festival).toEqual([
      { slug: SLUG, startTime: "18:00:00" },
    ]);
    const others = r.days.filter((d) => d.date !== "2027-03-06");
    expect(others.every((d) => d.festival.length === 0)).toBe(true);
    expect(r.hasScheduledPoojas).toBe(true);
  });

  it("carry the festival name, pooja name, time and their own fixed price", () => {
    const p = build().poojas[SLUG];
    expect(p).toMatchObject({
      name: "Rudra Abhishekam",
      festivalName: "Maha Shivaratri",
      type: "festival",
      amount: 1501,
      bookable: true,
      closedReason: null,
    });
  });

  it("the festival price is independent of any standard pooja's price", () => {
    const r = build({
      panchang: new Map([
        [
          "2027-03-06",
          {
            tithi: "Trayodashi",
            paksha: "Krishna Paksha",
            nakshatra: "Rohini",
            labels: [],
            source: "pooja_days" as const,
          },
        ],
      ]),
      panchangamRules: [
        {
          pooja_id: "s1",
          tithis: ["trayodashi"],
          paksha: null,
          nakshatras: null,
          start_time: "17:00:00",
        },
      ],
    });
    expect(r.poojas["pradosham"].amount).toBe(100);
    expect(r.poojas[SLUG].amount).toBe(1501);
    expect(dayOf(r, "2027-03-06").panchangam.map((o) => o.slug)).toEqual([
      "pradosham",
    ]);
    expect(dayOf(r, "2027-03-06").festival.map((o) => o.slug)).toEqual([SLUG]);
  });

  it("the Book Pooja link opens the festival's own booking page for that date", () => {
    const r = build();
    const p = r.poojas[SLUG];
    expect(p.destination).toBe(`/poojas/festival/${SLUG}`);
    expect(bookingAvailability(p, "2027-03-06", "2027-03-01")).toBe(
      "available",
    );
    expect(bookingLink(p, "2027-03-06")).toBe(
      `/poojas/festival/${SLUG}?date=2027-03-06`,
    );
    expect(resolveDestination(SLUG)).toBe(p.destination);
  });

  it("an inactive festival is not shown at all", () => {
    const r = build({ festivals: [{ ...festival, active: false }] });
    expect(r.days.every((d) => d.festival.length === 0)).toBe(true);
    expect(r.poojas[SLUG]).toBeUndefined();
  });

  it("a festival without an approved price is shown but not bookable", () => {
    const r = build({ poojas: [{ ...pooja, amount_inr: null }, standard] });
    expect(r.poojas[SLUG].bookable).toBe(false);
    expect(
      bookingAvailability(r.poojas[SLUG], "2027-03-06", "2027-03-01"),
    ).toBe("no-price");
  });

  it("is not bookable before the window opens or after it closes, and says why", () => {
    const early = build({
      festivals: [{ ...festival, booking_opens_on: "2027-03-03" }],
    }).poojas[SLUG];
    expect(early).toMatchObject({
      bookable: false,
      closedReason: "not_open_yet",
    });
    expect(bookingAvailability(early, "2027-03-06", "2027-03-01")).toBe(
      "closed",
    );

    const late = build({
      festivals: [{ ...festival, booking_closes_on: "2027-03-04" }],
      today: "2027-03-05",
    }).poojas[SLUG];
    expect(late).toMatchObject({ bookable: false, closedReason: "closed" });
    expect(bookingLink(late, "2027-03-06")).not.toBeNull(); // still shown, button replaced by the reason
  });

  it("is not bookable once the maximum number of bookings is reached", () => {
    const full = build({
      festivals: [{ ...festival, max_bookings: 2 }],
      festivalLive: new Map([["f1", 2]]),
    }).poojas[SLUG];
    expect(full).toMatchObject({ bookable: false, closedReason: "full" });
    const free = build({
      festivals: [{ ...festival, max_bookings: 2 }],
      festivalLive: new Map([["f1", 1]]),
    }).poojas[SLUG];
    expect(free.bookable).toBe(true);
  });

  it("two festivals on one date both appear, ordered by time", () => {
    const second: PoojaRow = {
      ...pooja,
      id: "f2",
      slug: "festival-maha-shivaratri-laksharchana-20270306",
      name: "Laksharchana",
    };
    const r = build({
      poojas: [pooja, second],
      festivals: [
        festival,
        { ...festival, pooja_id: "f2", start_time: "06:00:00" },
      ],
    });
    expect(dayOf(r, "2027-03-06").festival.map((o) => o.slug)).toEqual([
      second.slug,
      SLUG,
    ]);
  });
});
