import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { shiftMonth } from "@shared/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getTempleMonth } from "@/lib/api";
import { todayIST } from "@/lib/format";
import { DayPanel } from "./DayPanel";
import { MonthCalendar } from "./MonthCalendar";

const MAX_MONTHS_AWAY = 12;
/** Gentle polling while the server is still filling gaps from Prokerala. */
export const PENDING_POLL_MS = 20_000;

const ym = (iso: string) => ({
  year: Number(iso.slice(0, 4)),
  month: Number(iso.slice(5, 7)),
});

/**
 * Homepage temple calendar. The grid renders immediately (dates need no data);
 * Panchangam and pooja details stream in from one month request and never block
 * the rest of the page.
 */
export function HomeCalendar() {
  const [today] = useState(() => todayIST());
  const current = useMemo(() => ym(today), [today]);
  const [view, setView] = useState(current);
  const [selected, setSelected] = useState<string | null>(today);
  const panelRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ["temple-month", view.year, view.month],
    queryFn: () => getTempleMonth(view.year, view.month),
    staleTime: 60_000,
    retry: 1,
    // Poll only while gaps remain; the server enforces the Prokerala budget.
    refetchInterval: (q) =>
      (q.state.data?.panchangPending ?? 0) > 0 ? PENDING_POLL_MS : false,
  });

  const data = query.data;
  const days = useMemo(
    () =>
      data ? Object.fromEntries(data.days.map((d) => [d.date, d])) : undefined,
    [data],
  );

  const monthsAway = (v: { year: number; month: number }) =>
    (v.year - current.year) * 12 + (v.month - current.month);

  function go(delta: number) {
    const next = shiftMonth(view.year, view.month, delta);
    if (Math.abs(monthsAway(next)) > MAX_MONTHS_AWAY) return;
    setView(next);
    // Keep "today" selected when returning to the current month; otherwise ask the user to pick.
    setSelected(
      next.year === current.year && next.month === current.month ? today : null,
    );
  }

  function select(date: string) {
    setSelected(date);
    // On small screens the panel sits below the grid: bring it into view.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      panelRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  return (
    <section
      id="calendar"
      aria-labelledby="temple-calendar-heading"
      className="container py-10 md:py-14"
    >
      <div className="mb-6 text-center">
        <h2
          id="temple-calendar-heading"
          className="text-2xl font-extrabold tracking-tight md:text-3xl"
        >
          Temple Calendar
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nakshatram, auspicious days and scheduled poojas. Select a date to
          book.
        </p>
      </div>

      {query.isError && (
        <Alert variant="destructive" className="mb-4" role="alert">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>The calendar details could not be loaded right now.</span>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {data?.degraded && (
        <p
          className="mb-3 text-center text-xs text-muted-foreground"
          role="status"
        >
          Some nakshatram details are temporarily unavailable.
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <MonthCalendar
          year={view.year}
          month={view.month}
          days={days}
          poojas={data?.poojas}
          today={today}
          selectedDate={selected}
          onSelect={select}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onToday={() => {
            setView(current);
            setSelected(today);
          }}
          canPrev={
            monthsAway(shiftMonth(view.year, view.month, -1)) >=
            -MAX_MONTHS_AWAY
          }
          canNext={
            monthsAway(shiftMonth(view.year, view.month, 1)) <= MAX_MONTHS_AWAY
          }
          loading={query.isLoading || (data?.panchangPending ?? 0) > 0}
        />
        <div ref={panelRef} className="lg:sticky lg:top-4">
          <DayPanel
            date={selected}
            day={selected ? days?.[selected] : undefined}
            poojas={data?.poojas}
            today={today}
            loading={query.isLoading}
            error={query.isError && !data}
            hasScheduledPoojas={data ? data.hasScheduledPoojas : true}
          />
        </div>
      </div>
    </section>
  );
}
