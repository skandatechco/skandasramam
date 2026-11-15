import { NavLink } from "react-router-dom";
import type {
  CalendarDay,
  CalendarOccurrence,
  CalendarPooja,
} from "@shared/calendar";
import { Button } from "@/components/ui/button";
import {
  CLOSED_TEXT,
  bookingAvailability,
  bookingLink,
} from "@/lib/calendarLinks";
import { formatFullDate, formatINR, formatTime } from "@/lib/format";

function PoojaRow({
  occurrence,
  pooja,
  date,
  today,
}: {
  occurrence: CalendarOccurrence;
  pooja: CalendarPooja | undefined;
  date: string;
  today: string;
}) {
  if (!pooja) return null;
  const availability = bookingAvailability(pooja, date, today);
  const time = formatTime(occurrence.startTime);
  return (
    <li
      className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
      data-pooja={pooja.slug}
    >
      <div className="min-w-0">
        {pooja.type === "festival" && pooja.festivalName && (
          <p
            className="text-xs font-semibold uppercase tracking-wide text-rose-700"
            data-testid="festival-name"
          >
            {pooja.festivalName}
          </p>
        )}
        <p className="font-medium leading-snug">{pooja.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {time && <span>{time} · </span>}
          {pooja.amount !== null ? (
            <span data-testid="amount">{formatINR(pooja.amount)}</span>
          ) : (
            <span>Amount to be announced</span>
          )}
        </p>
        {occurrence.notes && (
          <p className="mt-1 text-xs text-muted-foreground">
            {occurrence.notes}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {availability === "available" && bookingLink(pooja, date) && (
          <Button asChild size="sm">
            <NavLink to={bookingLink(pooja, date)!}>Book Pooja</NavLink>
          </Button>
        )}
        {availability === "no-price" && (
          <span
            className="inline-block rounded-md border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground"
            data-testid="booking-soon"
          >
            Booking opens soon
          </span>
        )}
        {availability === "closed" && pooja.closedReason && (
          <span
            className="inline-block rounded-md border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground"
            data-testid="booking-closed"
          >
            {CLOSED_TEXT[pooja.closedReason]}
          </span>
        )}
        {availability === "past" && (
          <span className="text-xs text-muted-foreground">Date has passed</span>
        )}
      </div>
    </li>
  );
}

export interface DayPanelProps {
  date: string | null;
  day?: CalendarDay;
  poojas?: Record<string, CalendarPooja>;
  today: string;
  loading?: boolean;
  /** month data failed to load */
  error?: boolean;
  /** false when nothing at all is scheduled this month (e.g. not seeded yet) */
  hasScheduledPoojas?: boolean;
}

export function DayPanel({
  date,
  day,
  poojas = {},
  today,
  loading = false,
  error = false,
  hasScheduledPoojas = true,
}: DayPanelProps) {
  if (!date) {
    return (
      <aside
        className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Select a date to see its nakshatram and poojas.
      </aside>
    );
  }

  const pj = day?.panchang;
  const empty =
    !day?.recurring.length &&
    !day?.panchangam.length &&
    !day?.special.length &&
    !day?.festival?.length;

  return (
    <aside
      className="rounded-2xl border bg-card p-5 shadow-sm"
      aria-live="polite"
      data-testid="day-panel"
    >
      <h3 className="text-lg font-bold leading-snug" data-testid="panel-date">
        {formatFullDate(date)}
      </h3>

      <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Nakshatram</dt>
        <dd className="font-medium" data-testid="panel-nakshatra">
          {pj ? pj.nakshatra : loading ? "Loading…" : "Not yet available"}
        </dd>
        {pj && (
          <>
            <dt className="text-muted-foreground">Tithi</dt>
            <dd className="font-medium" data-testid="panel-tithi">
              {pj.tithi}
              {pj.paksha ? ` · ${pj.paksha}` : ""}
            </dd>
          </>
        )}
      </dl>

      {pj && pj.labels.length > 0 && (
        <ul
          className="mt-3 flex flex-wrap gap-1.5"
          aria-label="Auspicious observances"
        >
          {pj.labels.map((l) => (
            <li
              key={l}
              className="rounded-full bg-accent/25 px-2.5 py-0.5 text-xs font-medium"
            >
              {l}
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The pooja schedule could not be loaded right now.
        </p>
      ) : (
        <>
          {!!day?.festival?.length && (
            <section className="mt-5" data-testid="festival-section">
              <h4 className="text-sm font-semibold">Festival poojas</h4>
              <ul className="mt-2 space-y-2">
                {day.festival.map((o) => (
                  <PoojaRow
                    key={o.slug}
                    occurrence={o}
                    pooja={poojas[o.slug]}
                    date={date}
                    today={today}
                  />
                ))}
              </ul>
            </section>
          )}

          {!!day?.special.length && (
            <section className="mt-5">
              <h4 className="text-sm font-semibold">Special poojas</h4>
              <ul className="mt-2 space-y-2">
                {day.special.map((o) => (
                  <PoojaRow
                    key={o.slug}
                    occurrence={o}
                    pooja={poojas[o.slug]}
                    date={date}
                    today={today}
                  />
                ))}
              </ul>
            </section>
          )}

          {!!day?.panchangam.length && (
            <section className="mt-5">
              <h4 className="text-sm font-semibold">
                Poojas for this day&apos;s Panchangam
              </h4>
              <ul className="mt-2 space-y-2">
                {day.panchangam.map((o) => (
                  <PoojaRow
                    key={o.slug}
                    occurrence={o}
                    pooja={poojas[o.slug]}
                    date={date}
                    today={today}
                  />
                ))}
              </ul>
            </section>
          )}

          {!!day?.recurring.length && (
            <section className="mt-5">
              <h4 className="text-sm font-semibold">Daily poojas</h4>
              <ul className="mt-2 space-y-2">
                {day.recurring.map((o) => (
                  <PoojaRow
                    key={o.slug}
                    occurrence={o}
                    pooja={poojas[o.slug]}
                    date={date}
                    today={today}
                  />
                ))}
              </ul>
            </section>
          )}

          {empty && !loading && (
            <p
              className="mt-5 text-sm text-muted-foreground"
              data-testid="panel-empty"
            >
              {hasScheduledPoojas
                ? "No poojas are scheduled on this date."
                : "The temple's pooja schedule for this month is being prepared. Please check back soon."}
            </p>
          )}
        </>
      )}
    </aside>
  );
}
