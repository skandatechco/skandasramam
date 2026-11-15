import {
  monthDates,
  type CalendarDay,
  type CalendarMonthResponse,
  type CalendarOccurrence,
  type CalendarPanchang,
  type CalendarPooja,
} from "../../shared/calendar";
import {
  festivalBookingState,
  type FestivalBookingState,
} from "../../shared/festival";
import { resolveDestination } from "../../shared/poojaPages";
import { todayIST } from "./schedule";
import {
  occurrenceOn,
  type PoojaScheduleInput,
  type PoojaType,
} from "../../shared/scheduling";

export interface PoojaRow {
  id: string;
  slug: string;
  name: string;
  type: PoojaType;
  amount_inr: number | string | null;
}
export interface RecurringRow {
  pooja_id: string;
  recurrence: "daily" | "weekly";
  weekday: number | null;
  start_time: string | null;
}
export interface PanchangamRuleRow {
  pooja_id: string;
  tithis: string[] | null;
  paksha: "shukla" | "krishna" | null;
  nakshatras: string[] | null;
  start_time: string | null;
}
export interface SpecialRow {
  pooja_id: string;
  date: string;
  start_time: string | null;
  notes: string | null;
}

/** An ACTIVE festival offering (public.festival_offerings). */
export interface FestivalRow {
  pooja_id: string;
  festival_name: string;
  date: string;
  start_time: string | null;
  booking_opens_on: string | null;
  booking_closes_on: string | null;
  max_bookings: number | null;
  active?: boolean;
}

/** Row shapes -> the input of the shared scheduling function (used by booking validation too). */
export function toScheduleInput(
  pooja: { type: PoojaType },
  recurring: RecurringRow[],
  rules: PanchangamRuleRow[],
  special: SpecialRow[],
): PoojaScheduleInput {
  return {
    type: pooja.type,
    recurring: recurring.map((r) => ({
      recurrence: r.recurrence,
      weekday: r.weekday,
      startTime: r.start_time,
    })),
    panchangamRules: rules.map((r) => ({
      tithis: r.tithis,
      paksha: r.paksha,
      nakshatras: r.nakshatras,
      startTime: r.start_time,
    })),
    special: special.map((s) => ({
      date: s.date,
      startTime: s.start_time,
      notes: s.notes,
    })),
  };
}

const byTimeThenName =
  (names: Map<string, string>) =>
  (a: CalendarOccurrence, b: CalendarOccurrence) => {
    if (a.startTime !== b.startTime) {
      if (a.startTime === null) return 1;
      if (b.startTime === null) return -1;
      return a.startTime < b.startTime ? -1 : 1;
    }
    return (names.get(a.slug) ?? "").localeCompare(names.get(b.slug) ?? "");
  };

const group = <T extends { pooja_id: string }>(rows: T[]) => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.pooja_id) ?? [];
    list.push(r);
    m.set(r.pooja_id, list);
  }
  return m;
};

/**
 * Assembles one month from already-fetched ACTIVE rows (no I/O, nothing
 * invented). Every "does it occur?" decision is made by the same shared
 * scheduling function that server-side booking validation uses:
 *  - daily poojas: recurring rules;
 *  - Panchangam poojas: structured rules against that date's Panchangam. If the
 *    Panchangam is missing or ambiguous, the pooja is simply not listed;
 *  - special poojas: only their scheduled dates.
 */
export function buildCalendarMonth(input: {
  year: number;
  month: number;
  panchang: Map<string, CalendarPanchang>;
  poojas: PoojaRow[];
  recurring: RecurringRow[];
  panchangamRules?: PanchangamRuleRow[];
  special: SpecialRow[];
  /** active festival offerings (each carries its own price on its poojas row) */
  festivals?: FestivalRow[];
  /** live (non-cancelled) bookings per festival pooja id, for the capacity check */
  festivalLive?: Map<string, number>;
  /** today in IST (injectable for tests) */
  today?: string;
  panchangPending?: number;
  degraded?: boolean;
}): CalendarMonthResponse {
  const { year, month } = input;
  const names = new Map(input.poojas.map((p) => [p.slug, p.name]));
  const recurringBy = group(input.recurring);
  const rulesBy = group(input.panchangamRules ?? []);
  const today = input.today ?? todayIST();
  // Inactive festivals are never shown. A festival is scheduled on its one date,
  // which the shared scheduling function reads from the same "special dates" shape.
  const festivals = (input.festivals ?? []).filter((f) => f.active !== false);
  const festivalBy = new Map(festivals.map((f) => [f.pooja_id, f]));
  const festivalState = (f: FestivalRow): FestivalBookingState =>
    festivalBookingState(
      {
        active: true,
        date: f.date,
        opensOn: f.booking_opens_on,
        closesOn: f.booking_closes_on,
        maxBookings: f.max_bookings,
        liveBookings: input.festivalLive?.get(f.pooja_id) ?? 0,
      },
      today,
    );
  const specialBy = group([
    ...input.special,
    ...festivals.map((f) => ({
      pooja_id: f.pooja_id,
      date: f.date,
      start_time: f.start_time,
      notes: null,
    })),
  ]);

  const schedules = input.poojas.map((p) => ({
    pooja: p,
    input: toScheduleInput(
      p,
      recurringBy.get(p.id) ?? [],
      rulesBy.get(p.id) ?? [],
      specialBy.get(p.id) ?? [],
    ),
  }));

  const sort = byTimeThenName(names);
  const used = new Set<string>();
  let any = false;

  const days: CalendarDay[] = monthDates(year, month).map((date) => {
    const pj = input.panchang.get(date) ?? null;
    const recurring: CalendarOccurrence[] = [];
    const panchangam: CalendarOccurrence[] = [];
    const special: CalendarOccurrence[] = [];
    const festival: CalendarOccurrence[] = [];

    for (const { pooja, input: sched } of schedules) {
      const occ = occurrenceOn(
        sched,
        date,
        pj
          ? { tithi: pj.tithi, paksha: pj.paksha, nakshatra: pj.nakshatra }
          : null,
      );
      if (!occ.scheduled) continue;
      const entry: CalendarOccurrence = {
        slug: pooja.slug,
        startTime: occ.startTime,
      };
      if (pooja.type === "festival") {
        festival.push(entry);
      } else if (pooja.type === "special") {
        entry.notes = occ.notes ?? null;
        special.push(entry);
      } else if (pooja.type === "panchangam") {
        panchangam.push(entry);
      } else {
        recurring.push(entry);
      }
      used.add(pooja.slug);
      any = true;
    }

    recurring.sort(sort);
    panchangam.sort(sort);
    special.sort(sort);
    festival.sort(sort);
    return { date, panchang: pj, recurring, panchangam, special, festival };
  });

  const poojas: Record<string, CalendarPooja> = {};
  for (const p of input.poojas) {
    if (!used.has(p.slug)) continue;
    const amount = p.amount_inr == null ? null : Number(p.amount_inr);
    const destination = resolveDestination(p.slug);
    const fest = p.type === "festival" ? festivalBy.get(p.id) : undefined;
    const state = fest ? festivalState(fest) : null;
    poojas[p.slug] = {
      slug: p.slug,
      name: p.name,
      type: p.type,
      amount,
      destination,
      ...(fest
        ? {
            festivalName: fest.festival_name,
            closedReason: state === "open" ? null : state,
          }
        : {}),
      // never offered for booking without BOTH an approved price and a real page
      // (and, for a festival, while its booking window is open and places remain)
      bookable:
        amount !== null &&
        destination !== null &&
        (state === null || state === "open"),
    };
  }

  return {
    ok: true,
    year,
    month,
    days,
    poojas,
    hasScheduledPoojas: any,
    panchangPending: input.panchangPending ?? 0,
    degraded: input.degraded ?? false,
  };
}
