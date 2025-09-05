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

function normalize(s: string) {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
}

function deriveEvents(en: any) {
  const events: { title: string; details: string; time?: string }[] = [];
  const tithi = normalize(en?.tithi?.name || "");
  const star = normalize(en?.nakshatra?.name || "");

  const add = (title: string, details: string, time?: string) =>
    events.push({ title, details, time });

  if (/purnima|pournami|fullmoon/.test(tithi)) {
    add(
      "Pournami / Full Moon",
      "Special abhishekam to Goddess Matha Bhuvaneswari and Lord Dattatreya.",
      "10:00 AM",
    );
  }
  if (/amavasya|amavasai|newmoon/.test(tithi)) {
    add(
      "Amavasya (New Moon)",
      "Special abhishekam to Goddess Prathiyankara Devi and Lord Pancha Mukha Anjaneyar.",
      "10:00 AM",
    );
  }
  if (/chaturthi/.test(tithi)) {
    add(
      "Sankata Hara Chaturthi",
      "Special abhishekam to Lord Pancha Mukha Heramba Maha Ganapathy and Kamala Siddhi Vinayakar.",
      "10:30 AM",
    );
  }
  if (/ashtami/.test(tithi)) {
    add(
      "Krishna Paksha Ashtami",
      "Special abhishekam to Goddess Asta Dasa Bhuja Durga Parameswari; Navavarna puja in evening.",
      "Abhishekam 10:30 AM • Navavarna 6:00 PM",
    );
  }
  if (/trayodashi/.test(tithi)) {
    add(
      "Pradosham",
      "Grand celebration for Sri Mahasahasralingamurthy and Lord Nandikeswarar with Mahanyasam and special abhishekam; deeparadanai and prasad.",
      "Mahanyasam 5:00 PM • Abhishekam 5:30 PM • Deeparadanai 6:30 PM",
    );
  }

  if (/krittika|krithika|krithigai/.test(star)) {
    add("Krithigai", "Special abhishekam to Lord Swaminatha Swami.", "10:00 AM");
  }
  if (/uttaraphalguni|uttaraphalgun|uthiram/.test(star)) {
    add(
      "Uthiram Nakshatram",
      "Special abhishekam to Lord Ayyapan followed by alankaram and deeparadanai.",
      "10:30 AM",
    );
  }
  if (/chitra|chithirai/.test(star)) {
    add(
      "Chitirai Nakshatram",
      "Special abhishekam and alankaram to Lord Mahasudarshana Murthy followed by deeparadanai.",
      "10:30 AM",
    );
  }
  if (/swati|swathi/.test(star)) {
    add(
      "Swathi Nakshatram",
      "Special abhishekam and alankaram to Lord Lakshmi Narasimhar followed by deeparadanai.",
      "10:30 AM",
    );
  }
  if (/vishakha|vishaka|visakam|vishagam/.test(star)) {
    add(
      "Vishakam (Vishagam) Nakshatram",
      "Birth star of Sathguru Shrimath Santhananda Swamigal; special abhishekam and alankaram to Sathguru at the Ashram.",
      "10:30 AM",
    );
  }

  // Navavarna Pooja additional note
  if (/(panchami|ashtami|chaturdashi|amavasya|purnima)/.test(tithi)) {
    add(
      "Navavarna Pooja",
      "Performed on Panchami, Ashtami, Chaturdasi, New Moon, and Full Moon.",
    );
  }

  // Daily Annadanam
  add("Annadanam", "Daily prasadam service for all devotees.", "12:00 Noon");

  return events;
}

export default function Calendar() {
  const { lat, lon, tz } = useChennaiDefaults();
  const [selected, setSelected] = useState<Date>(new Date());
  const [viewMonth, setViewMonth] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataTa, setDataTa] = useState<any | null>(null);
  const [dataEn, setDataEn] = useState<any | null>(null);
  const [eventDates, setEventDates] = useState<string[]>([]);
  const [monthComplete, setMonthComplete] = useState(false);

  const dateStr = format(selected, "yyyy-MM-dd");

  // Fetch selected day details
  useEffect(() => {
    const fetchDay = async () => {
      setLoading(true);
      setError(null);
      try {
        const [rTa, rEn] = await Promise.all([
          fetch(`/api/panchangam?date=${dateStr}&lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}&la=ta`),
          fetch(`/api/panchangam?date=${dateStr}&lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}&la=en`),
        ]);
        const parse = async (r: Response) => {
          const raw = await r.text();
          let j: any = null;
          try { j = JSON.parse(raw); } catch {}
          if (!r.ok || !j?.ok) {
            const msg = (j && (j.error || j.message)) || raw || `Status ${r.status}`;
            throw new Error(msg);
          }
          return j.data;
        };
        const [ta, en] = await Promise.all([parse(rTa), parse(rEn)]);
        setDataTa(ta);
        setDataEn(en);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDay();
  }, [dateStr, lat, lon, tz]);

  // Progressive month events fetch for highlighting
  useEffect(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth() + 1;
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch(`/api/calendar/month?year=${year}&month=${month}&lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}`);
        const raw = await r.text();
        let j: any = null;
        try { j = JSON.parse(raw); } catch {}
        if (!r.ok || !j?.ok) return;
        const keys = Object.keys(j.eventsByDate || {});
        if (!cancelled) {
          setEventDates(keys);
          setMonthComplete(Boolean(j.complete));
        }
      } catch {}
    }
    tick();
    if (!monthComplete) {
      const id = setInterval(tick, 15000); // poll every 15s to respect API rate limit
      return () => { cancelled = true; clearInterval(id); };
    }
    return () => { cancelled = true; };
  }, [viewMonth, lat, lon, tz, monthComplete]);

  const tamilNak = dataTa?.nakshatra?.name || "—";
  const tithiTa = dataTa?.tithi?.name || "—";
  const events = dataEn ? deriveEvents(dataEn) : [];

  // Build modifiers for DayPicker
  const eventDays = eventDates.map((ds) => new Date(ds + "T00:00:00"));

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
            onMonthChange={(m) => setViewMonth(m)}
            showOutsideDays
            ISOWeek
            className="rdp-tailwind"
            modifiers={{ event: eventDays }}
            modifiersClassNames={{ event: "bg-amber-200 text-amber-900 font-semibold rounded-full" }}
          />
          {!monthComplete && (
            <p className="mt-2 text-xs text-muted-foreground">Filling events for this month…</p>
          )}
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
                <span className="text-muted-foreground">{tithiTa}</span>
              </div>
            </div>
          )}

          <div className="mt-4">
            <h2 className="text-base font-semibold">Events for {format(selected, "PPP")}</h2>
            {loading ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
            ) : events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No special events today.</p>
            ) : (
              <div className="mt-3 grid gap-3">
                {events.map((e, i) => (
                  <div key={i} className="rounded-lg border p-4 bg-background">
                    <h3 className="font-medium">{e.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{e.details}</p>
                    {e.time && (
                      <p className="text-sm text-muted-foreground mt-2">Time: {e.time}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
