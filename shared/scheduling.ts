/**
 * ONE definition of "does this pooja occur on this date?", used by both the
 * homepage calendar builder and server-side booking validation, so the two can
 * never disagree.
 *
 * Pooja types:
 *  A. daily        performed every day (or on a fixed weekday): recurring rules
 *  B. panchangam   dates depend on tithi / paksha / nakshatra: structured rules
 *                  evaluated against public.pooja_days (never free-text labels)
 *  C. special      scheduled by the temple for specific dates
 *
 * If the Panchangam for a date is missing or ambiguous, a Panchangam-based
 * pooja is NOT scheduled on it (we never invent a valid date).
 */
import {
  evaluateRules,
  normalisePanchangam,
  type PanchangamRule,
  type PanchangamText,
} from "./panchangam";
import { weekdayOf } from "./calendar";

export type PoojaType = "daily" | "panchangam" | "special" | "festival";

export interface RecurringRuleInput {
  recurrence: "daily" | "weekly";
  weekday: number | null;
  startTime: string | null;
}
export interface PanchangamRuleInput extends PanchangamRule {
  startTime: string | null;
}
export interface SpecialDateInput {
  date: string;
  startTime: string | null;
  notes?: string | null;
}

export interface PoojaScheduleInput {
  type: PoojaType;
  /** active rows only */
  recurring: readonly RecurringRuleInput[];
  panchangamRules: readonly PanchangamRuleInput[];
  special: readonly SpecialDateInput[];
}

export type OccurrenceBasis =
  | "daily"
  | "weekly"
  | "panchangam"
  | "special"
  | "festival";

export interface Occurrence {
  scheduled: boolean;
  basis: OccurrenceBasis | null;
  startTime: string | null;
  notes?: string | null;
  /**
   * true when a Panchangam-based pooja could not be decided because the
   * Panchangam for the date is missing or ambiguous (so it is NOT scheduled).
   */
  undetermined: boolean;
}

const NONE: Occurrence = {
  scheduled: false,
  basis: null,
  startTime: null,
  undetermined: false,
};

const earliest = (times: (string | null)[]) => {
  const t = times.filter((x): x is string => !!x).sort();
  return t[0] ?? null;
};

export function occurrenceOn(
  pooja: PoojaScheduleInput,
  date: string,
  panchangam: PanchangamText | null,
): Occurrence {
  switch (pooja.type) {
    case "daily": {
      const wd = weekdayOf(date);
      const hits = pooja.recurring.filter(
        (r) =>
          r.recurrence === "daily" ||
          (r.recurrence === "weekly" && r.weekday === wd),
      );
      if (!hits.length) return NONE;
      return {
        scheduled: true,
        basis: hits.some((h) => h.recurrence === "daily") ? "daily" : "weekly",
        startTime: earliest(hits.map((h) => h.startTime)),
        undetermined: false,
      };
    }

    // A festival offering occurs on its one festival date (carried in `special`).
    case "festival":
    case "special": {
      const hits = pooja.special.filter((s) => s.date === date);
      if (!hits.length) return NONE;
      return {
        scheduled: true,
        basis: pooja.type === "festival" ? "festival" : "special",
        startTime: earliest(hits.map((h) => h.startTime)),
        notes: hits[0].notes ?? null,
        undetermined: false,
      };
    }

    case "panchangam": {
      if (!pooja.panchangamRules.length) return NONE;
      if (!panchangam) return { ...NONE, undetermined: true }; // no data for this date
      const day = normalisePanchangam(panchangam);
      const matching = pooja.panchangamRules.filter(
        (r) => evaluateRules([r], day) === "match",
      );
      if (matching.length) {
        return {
          scheduled: true,
          basis: "panchangam",
          startTime: earliest(matching.map((m) => m.startTime)),
          undetermined: false,
        };
      }
      return {
        ...NONE,
        undetermined: evaluateRules(pooja.panchangamRules, day) === "unknown",
      };
    }
  }
}
