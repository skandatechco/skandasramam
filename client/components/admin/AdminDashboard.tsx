import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { formatDate, formatTime } from "@/lib/format";

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: number | string;
  hint?: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-3xl font-extrabold tracking-tight"
        data-testid={testId}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AdminDashboard({
  onOpenAwaiting,
}: {
  onOpenAwaiting?: () => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: adminApi.stats,
    refetchInterval: 60_000,
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  if (isError || !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load the dashboard.{" "}
        <button className="underline" onClick={() => refetch()}>
          Try again
        </button>
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total bookings"
          value={data.totalBookings}
          testId="stat-total"
        />
        <Stat
          label="Awaiting payment verification"
          value={data.awaitingVerification}
          testId="stat-awaiting"
          hint={
            data.awaitingVerification > 0 ? "Needs your attention" : undefined
          }
        />
        <Stat
          label="Confirmed bookings"
          value={data.confirmed}
          testId="stat-confirmed"
        />
        <Stat
          label="Upcoming special poojas"
          value={data.upcomingSpecialPoojas}
          testId="stat-upcoming"
          hint={`${data.activeRecurringRules} active daily schedule${data.activeRecurringRules === 1 ? "" : "s"}`}
        />
      </div>

      {data.awaitingVerification > 0 && onOpenAwaiting && (
        <button
          type="button"
          onClick={onOpenAwaiting}
          className="mt-4 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Review payments awaiting verification →
        </button>
      )}

      <h3 className="mt-8 text-lg font-semibold">Next special poojas</h3>
      {data.nextSpecialPoojas.length === 0 ? (
        <p
          className="mt-2 text-sm text-muted-foreground"
          data-testid="no-upcoming"
        >
          No special poojas are scheduled yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-xl border bg-card">
          {data.nextSpecialPoojas.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span className="font-medium">{s.poojaName}</span>
              <span className="text-muted-foreground">
                {formatDate(s.date)}
                {formatTime(s.startTime) ? ` · ${formatTime(s.startTime)}` : ""}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                {s.liveBookings} booking{s.liveBookings === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
