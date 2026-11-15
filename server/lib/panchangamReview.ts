/**
 * Offline review of the Panchangam data (an export of public.pooja_days) against
 * the pooja rules: which observance falls on which date, and which dates cannot be
 * trusted without a manual check. Pure: no database, no network.
 *
 * It uses the SAME scheduling function as the calendar and booking validation, so
 * the dates it lists are exactly the dates the site would offer.
 */
import { addDays } from "./schedule";
import { occurrenceOn, type PoojaScheduleInput } from "../../shared/scheduling";

export interface DayRow {
  date: string;
  tithi: string;
  paksha: string | null;
  nakshatra: string;
}

export interface ReviewPooja {
  slug: string;
  name: string;
  input: PoojaScheduleInput;
}

/** Why an observance cannot be fully decided from one tithi/nakshatra per date. */
export const TIME_SPECIFIC: Record<string, string> = {
  pradosham:
    "Trayodashi must prevail in Pradosha kala (about 1.5 hours either side of local sunset). A date labelled with its sunrise tithi can be wrong when Trayodashi starts or ends during the day.",
  "sankata-hara-chaturthi":
    "Observed on the Chaturthi that prevails at moonrise, which is not the sunrise tithi.",
  "krishna-paksha-ashtami":
    "The temple must say at which time of day Ashtami has to prevail.",
  "amavasya-new-moon":
    "The tithi at the time of the pooja decides the day; Amavasya often spans two dates.",
  "pournami-full-moon":
    "The tithi at the time of the pooja decides the day; Purnima often spans two dates.",
  krithigai:
    "A nakshatra can span two civil dates; the one at pooja time counts.",
  "uthiram-nakshatram": "A nakshatra can span two civil dates.",
  "chitirai-nakshatram": "A nakshatra can span two civil dates.",
  "swathi-nakshatram": "A nakshatra can span two civil dates.",
  "vishakam-vishagam-nakshatram": "A nakshatra can span two civil dates.",
  "navavarna-pooja": "Several tithis; the tithi at pooja time decides.",
};

export interface Finding {
  date: string;
  slug: string;
  name: string;
  reasons: string[];
}

export interface Review {
  range: { from: string; to: string; days: number } | null;
  missingDates: string[];
  findings: Finding[];
  /** every date each Panchangam pooja would currently be offered on */
  scheduled: Record<string, string[]>;
}

export function reviewPanchangam(
  days: DayRow[],
  poojas: ReviewPooja[],
): Review {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const sorted = [...byDate.keys()].sort();
  if (!sorted.length)
    return { range: null, missingDates: [], findings: [], scheduled: {} };

  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const missingDates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1))
    if (!byDate.has(d)) missingDates.push(d);

  const findings: Finding[] = [];
  const scheduled: Record<string, string[]> = {};

  for (const p of poojas) {
    const hit = new Map<string, boolean>(); // date -> scheduled?
    const undetermined = new Set<string>();
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const row = byDate.get(d);
      const o = occurrenceOn(
        p.input,
        d,
        row
          ? { tithi: row.tithi, paksha: row.paksha, nakshatra: row.nakshatra }
          : null,
      );
      hit.set(d, o.scheduled);
      if (o.undetermined && row) undetermined.add(d);
    }
    const dates = [...hit].filter(([, v]) => v).map(([d]) => d);
    scheduled[p.slug] = dates;

    for (const d of dates) {
      const reasons: string[] = [];
      if (TIME_SPECIFIC[p.slug])
        reasons.push(`time-specific: ${TIME_SPECIFIC[p.slug]}`);
      if (hit.get(addDays(d, -1)) || hit.get(addDays(d, 1)))
        reasons.push(
          "adjacent date is also scheduled: only one is usually correct",
        );
      findings.push({ date: d, slug: p.slug, name: p.name, reasons });
    }
    for (const d of undetermined)
      findings.push({
        date: d,
        slug: p.slug,
        name: p.name,
        reasons: [
          "ambiguous or unreadable Panchangam for this date: NOT bookable until corrected",
        ],
      });
    for (const d of missingDates)
      if (p.input.type === "panchangam")
        findings.push({
          date: d,
          slug: p.slug,
          name: p.name,
          reasons: ["no Panchangam row: NOT bookable"],
        });

    // a long gap with no occurrence suggests a skipped tithi in the data
    const gap =
      p.slug === "pradosham"
        ? 17
        : p.slug.endsWith("nakshatram") || p.slug === "krithigai"
          ? 31
          : 0;
    if (gap && dates.length) {
      for (let i = 1; i < dates.length; i++) {
        const span =
          (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000;
        if (span > gap)
          findings.push({
            date: addDays(dates[i - 1], 1),
            slug: p.slug,
            name: p.name,
            reasons: [
              `no ${p.name} for ${span} days (${dates[i - 1]} to ${dates[i]}): a tithi or nakshatra may be missing or mislabelled in the data`,
            ],
          });
      }
    }
  }
  findings.sort((a, b) =>
    a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? -1 : 1,
  );
  return {
    range: { from, to, days: sorted.length },
    missingDates,
    findings,
    scheduled,
  };
}
