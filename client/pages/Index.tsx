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
          src="https://cdn.builder.io/api/v1/image/assets%2F982c525ed71b4aecb07284a69278ef3d%2Fc74d0651ea67426c9ba104ad091acd9a?format=webp&width=800"
          alt="Chennai Om Sri Skandashramam temple banner"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-black/40" />
        <div className="container py-16 md:py-28">
          <div className="mx-auto max-w-3xl text-center text-white">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              <ShieldCheck className="h-4 w-4 text-white" /> V3.1 • Draft PRD
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight text-white">
              Preserving tradition, empowering devotion through technology
            </h1>
            <p className="mt-5 text-white/90 text-lg">
              A comprehensive spiritual ecosystem blending devotee lifecycle
              management, Vedic intelligence, and family heritage preservation.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild>
                <NavLink to="/bookings">Start Your Spiritual Journey</NavLink>
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-white/40 text-white hover:bg-white/10"
              >
                <NavLink to="/calendar">View Spiritual Calendar</NavLink>
              </Button>
            </div>
            <div className="mt-6 text-xs text-white/80">
              MVP Pilot: Launch with one ashram • Offline pathways: SMS & IVR
              for elders
            </div>
          </div>
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
