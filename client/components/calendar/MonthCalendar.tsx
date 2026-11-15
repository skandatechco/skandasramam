import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import {
  MONTH_NAMES,
  buildMonthGrid,
  type CalendarDay,
  type CalendarPooja,
} from "@shared/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatFullDate } from "@/lib/format";

const WEEKDAYS = [
  ["Sun", "Sunday"],
  ["Mon", "Monday"],
  ["Tue", "Tuesday"],
  ["Wed", "Wednesday"],
  ["Thu", "Thursday"],
  ["Fri", "Friday"],
  ["Sat", "Saturday"],
];

/**
 * A day is "auspicious" only when the data says so: a Panchangam label, or a
 * Panchangam-based or special pooja is scheduled on it.
 */
export function isAuspicious(day: CalendarDay | undefined): boolean {
  return Boolean(
    day &&
      (day.panchang?.labels.length ||
        day.special.length ||
        day.festival?.length ||
        day.panchangam.length),
  );
}

export interface MonthCalendarProps {
  year: number;
  month: number; // 1-12
  /** keyed by YYYY-MM-DD; undefined while the month is loading or failed */
  days?: Record<string, CalendarDay>;
  poojas?: Record<string, CalendarPooja>;
  today: string;
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  /** true while the month request is in flight */
  loading?: boolean;
}

export function MonthCalendar({
  year,
  month,
  days,
  poojas = {},
  today,
  selectedDate,
  onSelect,
  onPrev,
  onNext,
  onToday,
  canPrev = true,
  canNext = true,
  loading = false,
}: MonthCalendarProps) {
  const weeks = buildMonthGrid(year, month);
  const title = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col items-center gap-1">
          <h3
            className="text-lg font-bold tracking-tight sm:text-2xl"
            aria-live="polite"
            data-testid="calendar-title"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onToday}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Go to today
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div role="grid" aria-label={title} aria-busy={loading} className="mt-4">
        <div role="row" className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map(([short, long]) => (
            <div
              key={short}
              role="columnheader"
              aria-label={long}
              className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs"
            >
              <span className="sm:hidden">{short[0]}</span>
              <span className="hidden sm:inline">{short}</span>
            </div>
          ))}
        </div>

        {weeks.map((week) => (
          <div
            key={week[0].date}
            role="row"
            className="mt-1 grid grid-cols-7 gap-1 sm:mt-1.5 sm:gap-1.5"
          >
            {week.map((cell) => {
              if (!cell.inMonth) {
                return (
                  <div key={cell.date} role="gridcell" aria-hidden="true" />
                );
              }
              const day = days?.[cell.date];
              const dayNum = Number(cell.date.slice(8));
              const nakshatra = day?.panchang?.nakshatra;
              const auspicious = isAuspicious(day);
              const selected = cell.date === selectedDate;
              const isToday = cell.date === today;
              const dailyCount = day?.recurring.length ?? 0;
              const specials = day?.special ?? [];
              const panchangam = day?.panchangam ?? [];
              const festivals = day?.festival ?? [];
              const named = [...festivals, ...specials, ...panchangam];
              const label = [
                formatFullDate(cell.date),
                nakshatra
                  ? `Nakshatram ${nakshatra}`
                  : "Nakshatram not available",
                auspicious ? "auspicious day" : "",
                festivals.length
                  ? `${festivals.length} festival pooja${festivals.length > 1 ? "s" : ""}`
                  : "",
                specials.length
                  ? `${specials.length} special pooja${specials.length > 1 ? "s" : ""}`
                  : "",
                panchangam.length
                  ? `${panchangam.length} Panchangam pooja${panchangam.length > 1 ? "s" : ""}`
                  : "",
                dailyCount
                  ? `${dailyCount} daily pooja${dailyCount > 1 ? "s" : ""}`
                  : "",
              ]
                .filter(Boolean)
                .join(", ");

              return (
                <div key={cell.date} role="gridcell" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => onSelect(cell.date)}
                    aria-label={label}
                    aria-pressed={selected}
                    aria-current={isToday ? "date" : undefined}
                    data-date={cell.date}
                    data-auspicious={auspicious || undefined}
                    className={cn(
                      "flex h-full min-h-[3.75rem] w-full flex-col items-stretch rounded-lg border p-1 text-left transition sm:min-h-[6.5rem] sm:p-2",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      auspicious
                        ? "border-accent/60 bg-accent/10 hover:bg-accent/20"
                        : "bg-background hover:bg-secondary",
                      isToday && "ring-1 ring-primary",
                      selected &&
                        "border-primary bg-primary/10 ring-2 ring-primary",
                    )}
                  >
                    <span className="flex items-start justify-between">
                      <span
                        className={cn(
                          "text-sm font-bold sm:text-base",
                          isToday && "text-primary",
                        )}
                      >
                        {dayNum}
                      </span>
                      {auspicious && (
                        <Sparkles
                          className="h-3 w-3 text-accent sm:h-3.5 sm:w-3.5"
                          aria-hidden="true"
                        />
                      )}
                    </span>

                    <span
                      className={cn(
                        "mt-0.5 truncate text-[9px] leading-tight text-muted-foreground sm:text-xs",
                        !nakshatra && loading && "animate-pulse",
                      )}
                      data-testid="nakshatra"
                    >
                      {nakshatra ?? (loading ? "…" : "—")}
                    </span>

                    {/* Mobile: compact dots. */}
                    <span
                      className="mt-auto flex gap-0.5 pt-1 sm:hidden"
                      aria-hidden="true"
                    >
                      {dailyCount > 0 && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-primary/70"
                          data-dot="daily"
                        />
                      )}
                      {panchangam.length > 0 && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-primary"
                          data-dot="panchangam"
                        />
                      )}
                      {specials.length > 0 && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-accent"
                          data-dot="special"
                        />
                      )}
                      {festivals.length > 0 && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-rose-500"
                          data-dot="festival"
                        />
                      )}
                    </span>

                    {/* Tablet/desktop: named special / Panchangam poojas + a daily summary. */}
                    <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                      {named.slice(0, 2).map((o) => {
                        const kind = festivals.includes(o)
                          ? "festival"
                          : specials.includes(o)
                            ? "special"
                            : "panchangam";
                        const p = poojas[o.slug];
                        return (
                          <span
                            key={o.slug}
                            className={cn(
                              "truncate rounded px-1 text-[11px] font-medium",
                              kind === "festival" && "bg-rose-500/20",
                              kind === "special" && "bg-accent/25",
                              kind === "panchangam" && "bg-primary/15",
                            )}
                            data-chip={kind}
                          >
                            {kind === "festival" && p?.festivalName
                              ? `${p.festivalName}: ${p.name}`
                              : (p?.name ?? o.slug)}
                          </span>
                        );
                      })}
                      {named.length > 2 && (
                        <span className="text-[11px] text-muted-foreground">
                          +{named.length - 2} more
                        </span>
                      )}
                      {dailyCount > 0 && (
                        <span
                          className="truncate text-[11px] text-muted-foreground"
                          data-chip="daily"
                        >
                          {dailyCount} daily pooja{dailyCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />{" "}
          Auspicious day
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full bg-rose-500"
            aria-hidden="true"
          />{" "}
          Festival pooja
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />{" "}
          Special pooja
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full bg-primary"
            aria-hidden="true"
          />{" "}
          Panchangam pooja
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full bg-primary/70"
            aria-hidden="true"
          />{" "}
          Daily poojas
        </li>
      </ul>
    </div>
  );
}
