import type { RequestHandler } from "express";
import {
  daysInMonth,
  isoDate,
  monthDates,
  type CalendarPanchang,
} from "../../shared/calendar";
import { monthQuerySchema } from "../../shared/calendarQuery";
import { buildCalendarMonth } from "../lib/calendarMonth";
import { panchangFallback } from "../lib/panchangFallback";
import { todayIST } from "../lib/schedule";
import { getServiceClient } from "../lib/supabase";

/**
 * GET /api/temple-calendar?year=YYYY&month=M
 *
 * One request returns a whole month: Panchangam, recurring, Panchangam-based,
 * special and festival pooja occurrences. Six database reads run in parallel,
 * regardless of the number of days (no N+1):
 *   pooja_days (month range), poojas, recurring_pooja_schedule,
 *   panchangam_pooja_rules, special_pooja_schedule (month range),
 *   festival_offerings (month range). Only when a festival has a capacity limit
 *   is one more read made, to count its live bookings (nothing else about bookings
 *   leaves the server).
 * Dates absent from pooja_days (today onward only) are filled from Prokerala
 * within strict budgets (see panchangFallback); the response reports how many
 * are still pending so the client can poll gently.
 */
export const getTempleCalendar: RequestHandler = async (req, res) => {
  const q = monthQuerySchema.safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Provide a valid year and month.",
    });
  }
  const { year, month } = q.data;
  const first = isoDate(year, month, 1);
  const last = isoDate(year, month, daysInMonth(year, month));
  const db = getServiceClient();

  const [days, poojas, recurring, rules, special, festivals] =
    await Promise.all([
      db
        .from("pooja_days")
        .select("date, tithi, paksha, nakshatra, labels")
        .gte("date", first)
        .lte("date", last),
      db
        .from("poojas")
        .select("id, slug, name, type, amount_inr")
        .eq("active", true),
      db
        .from("recurring_pooja_schedule")
        .select("pooja_id, recurrence, weekday, start_time")
        .eq("active", true),
      db
        .from("panchangam_pooja_rules")
        .select("pooja_id, tithis, paksha, nakshatras, start_time")
        .eq("active", true),
      db
        .from("special_pooja_schedule")
        .select("pooja_id, date, start_time, notes")
        .eq("active", true)
        .gte("date", first)
        .lte("date", last),
      db
        .from("festival_offerings")
        .select(
          "pooja_id, festival_name, date, start_time, booking_opens_on, booking_closes_on, max_bookings, active",
        )
        .eq("active", true)
        .gte("date", first)
        .lte("date", last),
    ]);

  // Schedules/catalogue are essential: without them there is nothing truthful to show.
  const fatal =
    poojas.error ||
    recurring.error ||
    rules.error ||
    special.error ||
    festivals.error;
  if (fatal) throw fatal;

  // Capacity: count live bookings only for festivals that have a limit.
  const festivalLive = new Map<string, number>();
  const limited = (festivals.data ?? []).filter(
    (f: any) => f.max_bookings != null,
  );
  if (limited.length) {
    const live = await db
      .from("bookings")
      .select("pooja_id")
      .in(
        "pooja_id",
        limited.map((f: any) => f.pooja_id),
      )
      .neq("status", "cancelled");
    if (live.error) throw live.error;
    for (const b of live.data ?? [])
      festivalLive.set(b.pooja_id, (festivalLive.get(b.pooja_id) ?? 0) + 1);
  }

  // The Panchangam table is degradable: fall back to Prokerala-only data.
  const degraded = Boolean(days.error);
  if (days.error) {
    console.error("[calendar] pooja_days read failed:", days.error.message);
  }

  const panchang = new Map<string, CalendarPanchang>();
  for (const r of days.data ?? []) {
    panchang.set(String(r.date), {
      tithi: r.tithi,
      paksha: r.paksha ?? null,
      nakshatra: r.nakshatra,
      labels: Array.isArray(r.labels) ? r.labels : [],
      source: "pooja_days",
    });
  }

  // Fallback only for today-onward dates that pooja_days does not have.
  const today = todayIST();
  const missing = monthDates(year, month).filter(
    (d) => d >= today && !panchang.has(d),
  );
  const pending = await panchangFallback.fill(missing);
  for (const d of missing) {
    const fb = panchangFallback.get(d);
    if (fb) panchang.set(d, fb);
  }

  const body = buildCalendarMonth({
    year,
    month,
    panchang,
    poojas: (poojas.data ?? []) as any[],
    recurring: (recurring.data ?? []) as any[],
    panchangamRules: (rules.data ?? []) as any[],
    special: (special.data ?? []) as any[],
    festivals: (festivals.data ?? []) as any[],
    festivalLive,
    panchangPending: pending,
    degraded,
  });

  // Short CDN/browser caching: schedule edits show up within a minute, with no
  // server restart and no in-process copy of the database rows.
  res.setHeader(
    "Cache-Control",
    pending > 0 || degraded
      ? "public, max-age=0, s-maxage=10, stale-while-revalidate=20"
      : "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  );
  res.json(body);
};
