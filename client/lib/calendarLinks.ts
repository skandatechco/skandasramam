import type { CalendarPooja } from "@shared/calendar";

/**
 * Booking page for a pooja on a given date. The destination is decided by the
 * server from the real public detail pages (regular or special), so a link can
 * never point at a page that does not exist. The selected date is passed as
 * ?date= and prefilled by the booking form.
 *
 * Returns null when the pooja has no public page: the UI then shows
 * "Booking opens soon" instead of a link.
 */
export function bookingLink(pooja: CalendarPooja, date: string): string | null {
  if (!pooja.destination) return null;
  return `${pooja.destination}?date=${date}`;
}

export type BookingAvailability = "available" | "no-price" | "past" | "closed";

export const CLOSED_TEXT = {
  not_open_yet: "Booking not open yet",
  closed: "Booking closed",
  full: "Fully booked",
  inactive: "Not available",
} as const;

/**
 * Why (or whether) a pooja can be booked on a date. Never allows a pooja without
 * an approved price or without a public page.
 */
export function bookingAvailability(
  pooja: CalendarPooja,
  date: string,
  today: string,
): BookingAvailability {
  // A festival offering whose booking window is shut (or is full) is shown with
  // the reason rather than as "opens soon".
  if (pooja.closedReason) return date < today ? "past" : "closed";
  if (!pooja.bookable || pooja.amount === null || !pooja.destination) {
    return "no-price";
  }
  if (date < today) return "past";
  return "available";
}
