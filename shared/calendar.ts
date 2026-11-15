/**
 * Temple calendar contracts and pure date helpers shared by client and server.
 * All dates are plain "YYYY-MM-DD" strings (no timezone arithmetic on local time).
 */

export const MIN_YEAR = 2020;
export const MAX_YEAR = 2100;

// ---- Response types --------------------------------------------------------
export interface CalendarPooja {
  slug: string;
  name: string;
  type: "daily" | "panchangam" | "special" | "festival";
  /** festival offerings only: the festival or occasion this pooja is offered for */
  festivalName?: string | null;
  /** festival offerings only: why booking is not open (null/absent when open) */
  closedReason?: "not_open_yet" | "closed" | "full" | "inactive" | null;
  /** null = no approved price: show "Booking opens soon", never allow booking. */
  amount: number | null;
  /** The public page to book on (without ?date=), or null when none exists. */
  destination: string | null;
  /** true only with an approved price AND a valid destination page */
  bookable: boolean;
}

export interface CalendarPanchang {
  tithi: string;
  paksha: string | null;
  nakshatra: string;
  labels: string[];
  /** where the values came from: the pooja_days table, or the Prokerala fallback */
  source: "pooja_days" | "prokerala";
}

export interface CalendarOccurrence {
  slug: string;
  startTime: string | null; // "HH:MM:SS" from the schedule, never invented
  notes?: string | null;
}

export interface CalendarDay {
  date: string;
  panchang: CalendarPanchang | null; // null = not available (yet)
  /** daily poojas (fixed recurring schedule) */
  recurring: CalendarOccurrence[];
  /** poojas whose date follows the Panchangam (tithi / paksha / nakshatra rules) */
  panchangam: CalendarOccurrence[];
  /** poojas the temple scheduled for this specific date */
  special: CalendarOccurrence[];
  /** festival-day offerings scheduled for this date (each with its own price) */
  festival: CalendarOccurrence[];
}

export interface CalendarMonthResponse {
  ok: true;
  year: number;
  month: number;
  days: CalendarDay[];
  /** catalogue entries referenced by `days`, keyed by slug */
  poojas: Record<string, CalendarPooja>;
  /** false when no pooja is scheduled in this month (e.g. schedules not seeded yet) */
  hasScheduledPoojas: boolean;
  /** days with no Panchangam yet that the server may still fill in the background */
  panchangPending: number;
  /** true when the Panchangam table could not be read (fallback data only) */
  degraded: boolean;
}

// ---- Pure date helpers -----------------------------------------------------
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const isoDate = (y: number, m: number, d: number) =>
  `${y}-${pad2(m)}-${pad2(d)}`;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** m is 1-12 */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** 0 = Sunday */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function monthDates(y: number, m: number): string[] {
  return Array.from({ length: daysInMonth(y, m) }, (_, i) =>
    isoDate(y, m, i + 1),
  );
}

export function shiftMonth(y: number, m: number, delta: number) {
  const idx = y * 12 + (m - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export interface GridCell {
  date: string;
  inMonth: boolean;
}

/**
 * Sunday-first grid of whole weeks covering the month, padded with the
 * neighbouring months' dates so every row has seven cells.
 */
export function buildMonthGrid(y: number, m: number): GridCell[][] {
  const first = isoDate(y, m, 1);
  const lead = weekdayOf(first);
  const total = daysInMonth(y, m);
  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  const prevDays = daysInMonth(prev.year, prev.month);

  const cells: GridCell[] = [];
  for (let i = lead; i > 0; i--) {
    cells.push({
      date: isoDate(prev.year, prev.month, prevDays - i + 1),
      inMonth: false,
    });
  }
  for (let d = 1; d <= total; d++)
    cells.push({ date: isoDate(y, m, d), inMonth: true });
  let n = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: isoDate(next.year, next.month, n++), inMonth: false });
  }
  const weeks: GridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
