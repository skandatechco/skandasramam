import { NavLink, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookingForm } from "@/components/booking/BookingForm";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getFestival } from "@/lib/api";
import { formatFullDate, formatINR, formatTime } from "@/lib/format";

/**
 * Booking page for ONE festival-day offering (/poojas/festival/:slug).
 * Everything shown (name, date, time, price, window) comes from the server; the
 * description is the temple's own text entered by an administrator, and nothing
 * else is invented.
 */
export default function FestivalPoojaDetail() {
  const { slug = "" } = useParams();
  const q = useQuery({
    queryKey: ["festival", slug],
    queryFn: () => getFestival(slug),
    retry: (n, e) =>
      !(e instanceof ApiRequestError && e.status === 404) && n < 1,
  });

  if (q.isLoading) {
    return (
      <p className="container py-16 text-sm text-muted-foreground">Loading…</p>
    );
  }
  if (q.isError || !q.data) {
    const gone = q.error instanceof ApiRequestError && q.error.status === 404;
    return (
      <section className="container py-16 text-center">
        <h1 className="text-2xl font-bold">
          {gone ? "Festival pooja not found" : "Could not load this pooja"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {gone
            ? "This festival pooja is not available."
            : "Please try again later or contact the temple office."}
        </p>
        <div className="mt-6">
          <Button asChild>
            <NavLink to="/calendar">Back to the calendar</NavLink>
          </Button>
        </div>
      </section>
    );
  }

  const f = q.data;
  const time = formatTime(f.startTime);
  return (
    <main className="container py-10 md:py-14">
      <nav className="text-sm text-muted-foreground">
        <NavLink to="/poojas">Poojas</NavLink> /{" "}
        <span className="text-foreground">{f.festivalName}</span>
      </nav>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-rose-700">
        {f.festivalName}
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight">{f.poojaName}</h1>

      <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
        <div>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Date</dt>
            <dd className="font-medium" data-testid="festival-date">
              {formatFullDate(f.date)}
            </dd>
            {time && (
              <>
                <dt className="text-muted-foreground">Time</dt>
                <dd className="font-medium">{time}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Participation amount</dt>
            <dd className="font-medium" data-testid="festival-amount">
              {f.amount !== null ? formatINR(f.amount) : "To be announced"}
            </dd>
            {f.bookingOpensOn && (
              <>
                <dt className="text-muted-foreground">Booking opens</dt>
                <dd>{formatFullDate(f.bookingOpensOn)}</dd>
              </>
            )}
            {f.bookingClosesOn && (
              <>
                <dt className="text-muted-foreground">Booking closes</dt>
                <dd>{formatFullDate(f.bookingClosesOn)}</dd>
              </>
            )}
          </dl>
          {f.description && (
            <p className="mt-5 whitespace-pre-line text-sm">{f.description}</p>
          )}
        </div>
        <div id="form">
          <BookingForm poojaTitle={f.poojaName} festival={f} />
        </div>
      </div>
    </main>
  );
}
