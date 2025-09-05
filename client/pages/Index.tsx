import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  Users,
  BookMarked,
  Download,
  Mic,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 transition hover:shadow-sm">
      <div className="h-10 w-10 rounded-md bg-secondary grid place-items-center text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function useChennaiDefaults() {
  return useMemo(
    () => ({ lat: 13.0827, lon: 80.2707, tz: "Asia/Kolkata" }),
    [],
  );
}

function PanchangStrip() {
  const { lat, lon, tz } = useChennaiDefaults();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10);
    setLoading(true);
    fetch(
      `/api/panchangam/today?date=${date}&lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}`,
    )
      .then(async (r) => {
        const clone = r.clone();
        try {
          const j = await r.json();
          if (!r.ok || !j.ok) throw new Error(j?.error || `Status ${r.status}`);
          return j.data;
        } catch {
          const raw = await clone.text();
          throw new Error(raw || `Status ${r.status}`);
        }
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [lat, lon, tz]);

  if (loading)
    return (
      <div className="text-sm text-muted-foreground">
        Loading today’s panchangam…
      </div>
    );
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  const tithi = data?.tithi?.name ?? data?.tithi ?? "—";
  const nakshatra = data?.nakshatra?.name ?? data?.nakshatra ?? "—";
  const yoga = data?.yoga?.name ?? data?.yoga ?? "—";
  const karana = data?.karana?.name ?? data?.karana ?? "—";

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="font-semibold">Today’s Panchangam</span>
      <span className="text-muted-foreground">Tithi: {tithi}</span>
      <span className="text-muted-foreground">Nakshatra: {nakshatra}</span>
      <span className="text-muted-foreground">Yoga: {yoga}</span>
      <span className="text-muted-foreground">Karana: {karana}</span>
    </div>
  );
}

const NAKSHATRAS = [
  "Ashwini",
  "Bharani",
  "Krittika",
  "Rohini",
  "Mrigashirsha",
  "Ardra",
  "Punarvasu",
  "Pushya",
  "Ashlesha",
  "Magha",
  "Purva Phalguni",
  "Uttara Phalguni",
  "Hasta",
  "Chitra",
  "Swati",
  "Vishakha",
  "Anuradha",
  "Jyeshtha",
  "Mula",
  "Purva Ashadha",
  "Uttara Ashadha",
  "Shravana",
  "Dhanishta",
  "Shatabhisha",
  "Purva Bhadrapada",
  "Uttara Bhadrapada",
  "Revati",
];

function NakshatraFinder() {
  const { lat, lon, tz } = useChennaiDefaults();
  const [n, setN] = useState(NAKSHATRAS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const onFind = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const start = new Date().toISOString().slice(0, 10);
      const r = await fetch(
        `/api/nakshatra/next?n=${encodeURIComponent(n)}&lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}&start=${start}`,
      );
      const clone = r.clone();
      try {
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j?.error || `Status ${r.status}`);
        setResult(j.data?.date);
      } catch {
        const raw = await clone.text();
        if (raw.includes("rate limit") || raw.includes("429")) setCooldown(60);
        throw new Error(raw || `Status ${r.status}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-muted-foreground">Next Nakshatra:</label>
      <select
        value={n}
        onChange={(e) => setN(e.target.value)}
        className="px-2 py-1 rounded-md border bg-background"
      >
        {NAKSHATRAS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <button
        onClick={onFind}
        disabled={loading || cooldown > 0}
        className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        style={{ background: "linear-gradient(90deg,#2F6C8A,#5A8F5F)" }}
      >
        {loading
          ? "Finding…"
          : cooldown > 0
            ? `Wait ${cooldown}s`
            : "Find Date"}
      </button>
      {result && (
        <span className="ml-2">
          Next {n}: <span className="font-semibold">{result}</span>{" "}
          <a href="/bookings" className="underline ml-2">
            Book Ayush Homam
          </a>
        </span>
      )}
      {error && (
        <span className="text-destructive ml-2">
          {error.includes("rate limit") || error.includes("429")
            ? "Rate limited, please try again in a minute."
            : error}
        </span>
      )}
    </div>
  );
}

export default function Index() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <img
          src="https://cdn.builder.io/api/v1/image/assets%2F982c525ed71b4aecb07284a69278ef3d%2Fc74d0651ea67426c9ba104ad091acd9a?format=webp&width=1600"
          alt="Chennai Om Sri Skandashramam temple banner"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-black/20" />
        <div className="container min-h-[70vh] md:min-h-[80vh] flex items-end py-10 pb-8 md:pb-12">
          <div className="w-full flex flex-col items-center gap-3 md:flex-row md:justify-center">
            {/* CTA 1 - Pariharam */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="rounded-2xl border px-3 py-2 backdrop-blur bg-white/40 shadow-md w-max text-center"
                style={{ borderColor: "#C04A3A" }}
              >
                <div className="text-[11px] md:text-xs text-foreground/90 leading-none">
                  Remedial pooja to remove obstacles and doshas.
                </div>
                <div className="mt-1 flex items-center justify-center">
                  <a
                    href="/poojas/special"
                    className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white"
                    style={{
                      background: "linear-gradient(90deg,#C04A3A,#D4A017)",
                    }}
                  >
                    👉 Book Pariharam Pooja
                  </a>
                </div>
              </div>
            </div>

            {/* CTA 2 - Regular */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="rounded-2xl border px-3 py-2 backdrop-blur bg-white/40 shadow-md w-max text-center"
                style={{ borderColor: "#2F6C8A" }}
              >
                <div className="text-[11px] md:text-xs text-foreground/90 leading-none">
                  Schedule recurring poojas on your auspicious dates.
                </div>
                <div className="mt-1 flex items-center justify-center">
                  <a
                    href="/poojas/regular"
                    className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white"
                    style={{
                      background: "linear-gradient(90deg,#2F6C8A,#5A8F5F)",
                    }}
                  >
                    🙏 Book Regular Pooja
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Panchangam strip */}
      <section className="bg-background/80 border-t border-b">
        <div className="container py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <PanchangStrip />
          <NakshatraFinder />
        </div>
      </section>

      {/* Feature grid */}
      <section className="container py-10 md:py-16">
        <div className="grid gap-6 md:grid-cols-3">
          <Feature
            icon={CalendarDays}
            title="Personalized Spiritual Calendar"
            desc="AI-driven guidance based on Vedic astrology and life milestones. Sync to Google/Apple Calendar."
          />
          <Feature
            icon={Users}
            title="Family Heritage Management"
            desc="Multi-generational practice tracking, role-based permissions for elders and children."
          />
          <Feature
            icon={BookMarked}
            title="Automated Devotee Care"
            desc="Birthstar poojas, anniversaries, and observances with smart reminders and follow-ups."
          />
        </div>
      </section>


      {/* Accessibility & Offline */}
      <section className="container py-12 md:py-16">
        <div className="rounded-2xl border bg-card p-8 md:p-12 grid gap-8 md:grid-cols-2 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">
              Accessible, Offline-first, and Inclusive
            </h2>
            <p className="mt-3 text-muted-foreground">
              Large fonts, voice navigation, regional languages, and cached
              daily reminders. Downloadable chants and mantras for uninterrupted
              practice.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="secondary">
                <Download className="mr-2 h-4 w-4" /> Download Chants
              </Button>
              <Button variant="outline">
                <Mic className="mr-2 h-4 w-4" /> Enable Voice
              </Button>
            </div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-primary/15 via-accent/10 to-transparent p-6 border">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg bg-background p-4 border">
                <p className="font-semibold">Today</p>
                <p className="text-muted-foreground">
                  Chaturthi • Sandhya 6:12 PM
                </p>
              </div>
              <div className="rounded-lg bg-background p-4 border">
                <p className="font-semibold">Birthstar</p>
                <p className="text-muted-foreground">
                  Pushya in 3 days • Auto-reminder
                </p>
              </div>
              <div className="rounded-lg bg-background p-4 border">
                <p className="font-semibold">Streak</p>
                <p className="text-muted-foreground">Morning japa • 18 days</p>
              </div>
              <div className="rounded-lg bg-background p-4 border">
                <p className="font-semibold">Legacy Points</p>
                <p className="text-muted-foreground">Family: 1,240</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative">
        <div className="absolute inset-0 -z-10 opacity-30 bg-[radial-gradient(600px_circle_at_20%_0%,hsl(var(--primary)/.25),transparent_60%)]" />
        <div className="container py-16 text-center">
          <h2 className="text-3xl font-extrabold">
            Begin your holistic spiritual journey
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Join thousands of devotee families preserving culture with modern
            care. Book your first pooja and set up your heritage vault today.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Button asChild>
              <NavLink to="/bookings">Book a Pooja</NavLink>
            </Button>
            <Button asChild variant="outline">
              <NavLink to="/devotees">Create Family Profile</NavLink>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
