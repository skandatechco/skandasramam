import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";
import { Landmark, Flame, Sparkles, BookText, Shrine } from "lucide-react";

const HERO_IMG = ""; // Optional: background image URL for hero (full-width)
const SWAMI_PORTRAIT = ""; // Optional: portrait URL for Sri Santhananda Swamigal

const HIGHLIGHTS: { icon: JSX.Element; text: string }[] = [
  { icon: <Shrine className="h-5 w-5" />, text: "First temple in India devoted to Ugraprathyangira Devi and a modern shrine for Sarabheswara." },
  { icon: <Landmark className="h-5 w-5" />, text: "Grand shrines for Bhuvaneswari, Ganapathy, Durga Parameswari, Siddhars, and Mahasahasralingamurthy (1008 lingams)." },
  { icon: <Flame className="h-5 w-5" />, text: "Installation of Purna Maha Meru and regular yagnas, aligned with Swamigal’s teachings." },
  { icon: <BookText className="h-5 w-5" />, text: "Serves as a spiritual hub for Vedic learning, worship, and large-scale community rituals." },
  { icon: <Sparkles className="h-5 w-5" />, text: "A living expression of Swamigal’s mission — ancient mantras and rituals for collective welfare." },
];

const TIMELINE: { year: string; text: string }[] = [
  { year: "1990s", text: "Vision and planning of Skandasramam by Sri Santhananda Swamigal." },
  { year: "1999", text: "Consecration of the Chennai Om Skandasramam." },
  { year: "2000s", text: "Establishment of shrines for Devi and Siddhars." },
  { year: "Today", text: "Continues as a center of Vedic learning and public worship." },
];

const QUICK_FACTS: { aspect: string; details: string }[] = [
  { aspect: "Founder", details: "Sri Santhananda Swamigal" },
  { aspect: "Chennai Temple", details: "Om Skandasramam, Selaiyur" },
  { aspect: "Consecration", details: "24 June 1999" },
  { aspect: "Main Deities", details: "Ugraprathyangira Devi, Sarabheswara, Bhuvaneswari, Ganapathy, Siddhars" },
  { aspect: "Legacy", details: "Pioneer of public Vedic yagnas, Shakti temples, spiritual democratization" },
];

const GALLERY_IMAGES: string[] = [];

export default function AboutHistory() {
  return (
    <main>
      {/* Hero Section with optional background image */}
      <section
        className="relative border-b"
        style={HERO_IMG ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,.45)), url(${HERO_IMG})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
      >
        <div className={`container py-16 text-center ${HERO_IMG ? "text-white" : ""}`}>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">The Sacred History of Skandasramam</h1>
          <p className={`mt-3 max-w-2xl mx-auto ${HERO_IMG ? "text-white/90" : "text-muted-foreground"}`}>
            A journey of vision, devotion, and divine grace.
          </p>
        </div>
      </section>

      {/* Introduction / Founding */}
      <section className="container py-10 md:py-14">
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {SWAMI_PORTRAIT && (
            <div className="md:col-span-1">
              <div className="rounded-xl overflow-hidden border bg-muted aspect-[4/5]">
                <img src={SWAMI_PORTRAIT} alt="Sri Santhananda Swamigal" className="w-full h-full object-cover" />
              </div>
            </div>
          )}
          <div className={SWAMI_PORTRAIT ? "md:col-span-2" : "md:col-span-3"}>
            <h2 className="text-2xl font-bold">The Vision</h2>
            <div className="mt-3 space-y-4 text-muted-foreground max-w-prose">
              <p>
                The Chennai Om Skandasramam
              </p>
              <p>
                Consecrated on 24 June 1999 by Sri Santhananda Swamigal, the Chennai Om Skandasramam at Selaiyur is a unique temple complex dedicated to rare but powerful forms of divinity: Goddess Ugraprathyangira Devi and Lord Sarabheswara.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Temple Highlights */}
      <section className="container py-6">
        <h2 className="text-2xl font-bold">Temple Highlights</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {HIGHLIGHTS.map((h, i) => (
            <div key={i} className="rounded-xl border p-4 bg-card">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-md bg-primary/10 p-2 text-primary">{h.icon}</div>
                <p className="text-sm text-muted-foreground">{h.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="container py-8">
        <h2 className="text-2xl font-bold">Milestones</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {TIMELINE.map((t, i) => (
            <div key={i} className="rounded-xl border p-4 bg-card">
              <div className="text-sm text-muted-foreground">{t.year}</div>
              <div className="font-medium mt-1">{t.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Facts */}
      <section className="container py-8">
        <h2 className="text-2xl font-bold">Quick Facts</h2>
        <div className="mt-4 rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {QUICK_FACTS.map((q, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="p-3 font-medium w-40 align-top">{q.aspect}</td>
                  <td className="p-3 text-muted-foreground">{q.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Spiritual Significance */}
      <section className="py-12 bg-muted/40 border-y">
        <div className="container text-center max-w-3xl">
          <blockquote className="text-lg italic text-muted-foreground">
            “The Chennai Om Skandasramam stands as a beacon of divine energy, uniting ancient traditions with modern devotion for the welfare of society.”
          </blockquote>
        </div>
      </section>

      {/* Gallery */}
      {GALLERY_IMAGES.length > 0 && (
        <section className="container py-10">
          <h2 className="text-2xl font-bold">Image Gallery</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {GALLERY_IMAGES.map((src, i) => (
              <div key={i} className="rounded-xl overflow-hidden border bg-muted aspect-video">
                <img src={src} alt="Historical event" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Call to Action */}
      <section className="container py-12">
        <div className="rounded-xl border p-8 grid gap-4 place-items-center text-center">
          <h2 className="text-2xl font-bold">Be Part of the Living History</h2>
          <div className="flex gap-3 flex-wrap justify-center mt-2">
            <Button asChild variant="secondary">
              <NavLink to="/contact">Visit Skandasramam</NavLink>
            </Button>
            <Button asChild>
              <NavLink to="/bookings">Book a Pooja</NavLink>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
