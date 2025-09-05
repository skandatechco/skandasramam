import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

function useChennaiDefaults() {
  return useMemo(() => ({ lat: 13.0827, lon: 80.2707, tz: "Asia/Kolkata" }), []);
}

export default function Calendar() {
  const { lat, lon, tz } = useChennaiDefaults();
  const [selected, setSelected] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  const dateStr = format(selected, "yyyy-MM-dd");

  useEffect(() => {
    const fetchDay = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/panchangam?date=${dateStr}&lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}&la=ta`);
        const clone = r.clone();
        try {
          const j = await r.json();
          if (!r.ok || !j.ok) throw new Error(j?.error || `Status ${r.status}`);
          setData(j.data);
        } catch {
          const raw = await clone.text();
          throw new Error(raw || `Status ${r.status}`);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDay();
  }, [dateStr, lat, lon, tz]);

  const tamilNak = data?.nakshatra?.name || "—";
  const tithi = data?.tithi?.name || "—";

  return (
    <section className="container py-8 md:py-12">
      <div className="mb-6 flex items-center gap-2">
        <CalendarIcon className="h-5 w-5 text-primary" />
        <h1 className="text-2xl md:text-3xl font-bold">Tamil Panchangam Calendar</h1>
      </div>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="rounded-xl border bg-card p-4">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => d && setSelected(d)}
            showOutsideDays
            ISOWeek
            className="rdp-tailwind"
          />
        </div>
        <div className="rounded-xl border bg-card p-6 grid gap-4 content-start">
          <div>
            <p className="text-sm text-muted-foreground">Selected Date</p>
            <p className="text-xl font-semibold">{format(selected, "PPP")}</p>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading panchangam…</p>
          ) : error ? (
            <p className="text-sm text-destructive break-all">{error}</p>
          ) : (
            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Nakshatra (தமிழ்): </span>
                <span className="text-muted-foreground">{tamilNak}</span>
              </div>
              <div>
                <span className="font-medium">Tithi: </span>
                <span className="text-muted-foreground">{tithi}</span>
              </div>
            </div>
          )}

          <div className="mt-2 grid sm:grid-cols-2 gap-3">
            <Button asChild>
              <NavLink to="/poojas/regular">Book Regular Pooja</NavLink>
            </Button>
            <Button asChild variant="outline">
              <NavLink to="/bookings">Book One-time Pooja</NavLink>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
