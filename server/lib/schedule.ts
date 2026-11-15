/** Pure date/schedule rules for bookings (kept separate so they are unit-testable). */

/** Today's date in the temple's timezone (IST) as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const MAX_ADVANCE_DAYS = 365;

/** Returns an error message if the date is outside the bookable window, else null. */
export function checkBookingWindow(
  date: string,
  today = todayIST(),
): string | null {
  if (date < today) return "That date has already passed.";
  if (date > addDays(today, MAX_ADVANCE_DAYS))
    return "Bookings open up to one year in advance.";
  return null;
}
