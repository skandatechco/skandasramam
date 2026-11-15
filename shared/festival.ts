/**
 * Festival-day pooja offerings: pure rules shared by the calendar builder, server
 * booking validation, the public festival page and the tests.
 *
 * A festival offering is its own catalogue entry (type "festival") with its own
 * fixed price. Its slug always starts with "festival-", which is how a slug alone
 * says which page serves it.
 */
export const FESTIVAL_SLUG = /^festival-[a-z0-9]+(-[a-z0-9]+)*$/;
export const isFestivalSlug = (slug: string) => FESTIVAL_SLUG.test(slug);
export const festivalPath = (slug: string) => `/poojas/festival/${slug}`;

export type FestivalBookingState =
  | "open"
  | "not_open_yet"
  | "closed"
  | "full"
  | "inactive";

export interface FestivalWindowInput {
  active: boolean;
  /** festival date, YYYY-MM-DD */
  date: string;
  opensOn: string | null;
  closesOn: string | null;
  maxBookings: number | null;
  /** live (non-cancelled) bookings */
  liveBookings: number;
}

/**
 * Can this offering be booked today (IST date)? Booking is open from `opensOn`
 * (default: as soon as it is active) until `closesOn` (default: the festival
 * date itself, inclusive), while places remain. Mirrors the database trigger
 * public.enforce_festival_booking().
 */
export function festivalBookingState(
  f: FestivalWindowInput,
  today: string,
): FestivalBookingState {
  if (!f.active) return "inactive";
  if (f.opensOn && today < f.opensOn) return "not_open_yet";
  if (today > (f.closesOn ?? f.date)) return "closed";
  if (f.maxBookings !== null && f.liveBookings >= f.maxBookings) return "full";
  return "open";
}

export const FESTIVAL_STATE_MESSAGE: Record<
  Exclude<FestivalBookingState, "open">,
  string
> = {
  inactive: "This festival pooja is not available.",
  not_open_yet: "Booking for this festival pooja has not opened yet.",
  closed: "Booking for this festival pooja has closed.",
  full: "This festival pooja is fully booked.",
};

/** Public festival page payload (GET /api/festivals/:slug). */
export interface PublicFestival {
  slug: string;
  festivalName: string;
  poojaName: string;
  description: string | null;
  date: string;
  startTime: string | null; // "HH:MM:SS"
  /** the offering's own fixed INR amount, read from the database */
  amount: number | null;
  bookingOpensOn: string | null;
  bookingClosesOn: string | null;
  state: FestivalBookingState;
  bookable: boolean;
}
