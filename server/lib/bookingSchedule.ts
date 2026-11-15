import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FESTIVAL_STATE_MESSAGE,
  festivalBookingState,
} from "../../shared/festival";
import { occurrenceOn, type PoojaType } from "../../shared/scheduling";
import { toScheduleInput } from "./calendarMonth";
import { panchangFallback } from "./panchangFallback";
import { todayIST } from "./schedule";

export interface ScheduleCheck {
  ok: boolean;
  code?:
    | "NOT_SCHEDULED"
    | "PANCHANGAM_UNAVAILABLE"
    | "FESTIVAL_UNAVAILABLE"
    | "FESTIVAL_NOT_OPEN"
    | "FESTIVAL_CLOSED"
    | "FESTIVAL_FULL";
  message?: string;
  /** festival offerings: the festival the booking is for (used in the booking snapshot) */
  festivalName?: string;
}

/**
 * Is this pooja really performed on this date? Uses the SAME scheduling function
 * as the homepage calendar (shared/scheduling.ts), fed with the same data
 * (active rules, pooja_days, and the cached Prokerala fallback), so a date the
 * calendar does not show can never be booked and vice versa.
 *
 * For Panchangam-based poojas, if the date's Panchangam is missing or ambiguous
 * the booking is refused rather than guessed.
 */
export async function checkPoojaScheduledOn(
  db: SupabaseClient,
  pooja: { id: string; type: PoojaType },
  date: string,
): Promise<ScheduleCheck> {
  const NOT_SCHEDULED: ScheduleCheck = {
    ok: false,
    code: "NOT_SCHEDULED",
    message: "This pooja is not scheduled on the selected date.",
  };

  if (pooja.type === "festival") return checkFestival(db, pooja, date);

  if (pooja.type === "special") {
    const { data, error } = await db
      .from("special_pooja_schedule")
      .select("pooja_id, date, start_time, notes")
      .eq("pooja_id", pooja.id)
      .eq("date", date)
      .eq("active", true);
    if (error) throw error;
    const input = toScheduleInput(pooja, [], [], (data ?? []) as any[]);
    return occurrenceOn(input, date, null).scheduled
      ? { ok: true }
      : NOT_SCHEDULED;
  }

  if (pooja.type === "daily") {
    const { data, error } = await db
      .from("recurring_pooja_schedule")
      .select("pooja_id, recurrence, weekday, start_time")
      .eq("pooja_id", pooja.id)
      .eq("active", true);
    if (error) throw error;
    const input = toScheduleInput(pooja, (data ?? []) as any[], [], []);
    return occurrenceOn(input, date, null).scheduled
      ? { ok: true }
      : NOT_SCHEDULED;
  }

  // ---- Panchangam-based ----
  const { data: rules, error: rulesErr } = await db
    .from("panchangam_pooja_rules")
    .select("pooja_id, tithis, paksha, nakshatras, start_time")
    .eq("pooja_id", pooja.id)
    .eq("active", true);
  if (rulesErr) throw rulesErr;
  const input = toScheduleInput(pooja, [], (rules ?? []) as any[], []);
  if (input.panchangamRules.length === 0) return NOT_SCHEDULED;

  // Primary source: public.pooja_days.
  let day: { tithi: string; paksha: string | null; nakshatra: string } | null =
    null;
  const { data: row, error: dayErr } = await db
    .from("pooja_days")
    .select("tithi, paksha, nakshatra")
    .eq("date", date)
    .maybeSingle();
  if (dayErr) {
    console.error("[booking] pooja_days read failed:", dayErr.message);
  } else if (row) {
    day = {
      tithi: row.tithi,
      paksha: row.paksha ?? null,
      nakshatra: row.nakshatra,
    };
  }

  // Fallback (only for today onward): cached Prokerala value, filling within its budget.
  if (!day && date >= todayIST()) {
    let fb = panchangFallback.get(date);
    if (!fb) {
      await panchangFallback.fill([date]);
      fb = panchangFallback.get(date);
    }
    if (fb)
      day = { tithi: fb.tithi, paksha: fb.paksha, nakshatra: fb.nakshatra };
  }

  const occ = occurrenceOn(input, date, day);
  if (occ.scheduled) return { ok: true };
  if (occ.undetermined) {
    return {
      ok: false,
      code: "PANCHANGAM_UNAVAILABLE",
      message:
        "We cannot confirm this pooja's date from the Panchangam yet. Please choose another date or contact the temple office.",
    };
  }
  return NOT_SCHEDULED;
}

/**
 * A festival offering is bookable only on its own date, while it is active, inside
 * its booking window and while places remain. The same window rule
 * (shared/festivalBookingState) drives the homepage calendar, so the two agree.
 * The database trigger public.enforce_festival_booking() re-checks all of it
 * atomically on insert.
 */
async function checkFestival(
  db: SupabaseClient,
  pooja: { id: string; type: PoojaType },
  date: string,
): Promise<ScheduleCheck> {
  const { data: f, error } = await db
    .from("festival_offerings")
    .select(
      "pooja_id, festival_name, date, start_time, booking_opens_on, booking_closes_on, max_bookings, active",
    )
    .eq("pooja_id", pooja.id)
    .maybeSingle();
  if (error) throw error;
  if (!f || !f.active) {
    return {
      ok: false,
      code: "FESTIVAL_UNAVAILABLE",
      message: FESTIVAL_STATE_MESSAGE.inactive,
    };
  }
  const input = toScheduleInput(
    pooja,
    [],
    [],
    [
      {
        pooja_id: f.pooja_id,
        date: f.date,
        start_time: f.start_time,
        notes: null,
      },
    ],
  );
  if (!occurrenceOn(input, date, null).scheduled) {
    return {
      ok: false,
      code: "NOT_SCHEDULED",
      message: "This festival pooja is not scheduled on the selected date.",
    };
  }

  let live = 0;
  if (f.max_bookings != null) {
    const { data: rows, error: bErr } = await db
      .from("bookings")
      .select("pooja_id")
      .eq("pooja_id", pooja.id)
      .neq("status", "cancelled");
    if (bErr) throw bErr;
    live = (rows ?? []).length;
  }
  const state = festivalBookingState(
    {
      active: true,
      date: f.date,
      opensOn: f.booking_opens_on,
      closesOn: f.booking_closes_on,
      maxBookings: f.max_bookings,
      liveBookings: live,
    },
    todayIST(),
  );
  if (state !== "open") {
    const code = {
      inactive: "FESTIVAL_UNAVAILABLE",
      not_open_yet: "FESTIVAL_NOT_OPEN",
      closed: "FESTIVAL_CLOSED",
      full: "FESTIVAL_FULL",
    } as const;
    return {
      ok: false,
      code: code[state],
      message: FESTIVAL_STATE_MESSAGE[state],
    };
  }
  return { ok: true, festivalName: f.festival_name };
}
