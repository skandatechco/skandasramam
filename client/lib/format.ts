/** Formats a rupee amount, e.g. 1500 -> "₹1,500.00" (fractional paise shown only when present). */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

/** "2027-01-10" -> "10 January 2027" (no timezone shifts). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2027-01-10" -> "Sunday, 10 January 2027" */
export function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "06:00:00" -> "6:00 AM"; returns null for a missing time (never invents one). */
export function formatTime(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Today's date in IST (the temple's timezone) as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
