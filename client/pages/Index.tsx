import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  HeartHandshake,
  Stars,
  Users,
  BookMarked,
  ShieldCheck,
  Trophy,
  Download,
  Mic,
} from "lucide-react";
import { NavLink } from "react-router-dom";

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
                    href="/bookings"
                    className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white"
                    style={{ background: "linear-gradient(90deg,#C04A3A,#D4A017)" }}
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
                    style={{ background: "linear-gradient(90deg,#2F6C8A,#5A8F5F)" }}
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
          <Feature
            icon={HeartHandshake}
            title="Mentorship & Community"
            desc="Mentor matching, progress tracking, and community engagement."
          />
          <Feature
            icon={Stars}
            title="Operational Excellence"
            desc="Modern booking, donations, and admin tools optimized for festivals and peak load."
          />
          <Feature
            icon={Trophy}
            title="Gamification"
            desc="Daily streaks, badges, and Family Legacy Points to nurture consistent practice."
          />
        </div>
      </section>

      {/* KPI band */}
      <section className="bg-secondary">
        <div className="container py-12 grid gap-6 text-center md:grid-cols-4">
          <div>
            <p className="text-3xl font-extrabold">90%</p>
            <p className="text-sm text-muted-foreground">Practice continuity</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold">300%</p>
            <p className="text-sm text-muted-foreground">
              Community engagement
            </p>
          </div>
          <div>
            <p className="text-3xl font-extrabold">70%</p>
            <p className="text-sm text-muted-foreground">
              Admin overhead reduced
            </p>
          </div>
          <div>
            <p className="text-3xl font-extrabold">250%</p>
            <p className="text-sm text-muted-foreground">
              Recurring bookings growth
            </p>
          </div>
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
