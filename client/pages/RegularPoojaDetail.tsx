import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NavLink, useParams } from "react-router-dom";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

type Detail = {
  title: string;
  benefits: string[];
  image?: string;
};

const DETAILS: Detail[] = [
  {
    title: "Sankata Hara Chaturthi",
    benefits: [
      "Removes obstacles and ensures success in endeavours.",
      "Grants wisdom, prosperity, and family harmony.",
      "Blessings of Lord Ganesha for new beginnings.",
    ],
  },
  {
    title: "Krishna Paksha Ashtami",
    benefits: [
      "Protection from enemies and negative forces.",
      "Goddess Durga's grace for courage and strength.",
      "Progress in spiritual practices and discipline.",
    ],
  },
  {
    title: "Pradosham",
    benefits: [
      "Cleanses past karmas and grants Shiva's grace.",
      "Health, longevity, and peace of mind.",
      "Relief from debts, delays, and obstacles.",
    ],
  },
  {
    title: "Amavasya (New Moon)",
    benefits: [
      "Pitru blessings and relief from ancestral doshas.",
      "Protection from negativity and inner fears.",
      "Stability at home and prosperity.",
    ],
  },
  {
    title: "Pournami / Full Moon",
    benefits: [
      "Divine grace for abundance and harmony.",
      "Powerful time for mantra sadhana and meditation.",
      "Blessings for prosperity and family wellbeing.",
    ],
  },
  {
    title: "Krithigai",
    benefits: [
      "Victory over enemies and removal of debts.",
      "Marriage prospects and progeny blessings.",
      "Courage, success, and protection for children.",
    ],
  },
  {
    title: "Uthiram Nakshatram",
    benefits: [
      "Discipline, devotion, and protection in journeys.",
      "Unity and peace in family life.",
      "Removal of obstacles and divine support.",
    ],
  },
  {
    title: "Chitirai Nakshatram",
    benefits: [
      "Protection from evil eye and misfortune.",
      "Success in competitive exams and endeavours.",
      "Blessings for clarity and righteous action.",
    ],
  },
  {
    title: "Swathi Nakshatram",
    benefits: [
      "Relief from fear, anxiety, and graha doshas.",
      "Courage, confidence, and victory in tasks.",
      "Removal of obstacles and divine protection.",
    ],
  },
  {
    title: "Vishakam (Vishagam) Nakshatram",
    benefits: [
      "Guru's blessings for spiritual growth.",
      "Peace, clarity, and guidance in life.",
      "Overall prosperity and protection.",
    ],
  },
  {
    title: "Tamil Month First Saturday",
    benefits: [
      "Relief from Saturn-related hardships.",
      "Stability in career and finances.",
      "Patience, discipline, and steady progress.",
    ],
  },
];

function getDetailBySlug(slug: string | undefined): Detail | undefined {
  if (!slug) return undefined;
  return DETAILS.find((d) => slugify(d.title) === slug);
}

export default function RegularPoojaDetail() {
  const { slug } = useParams();
  const detail = getDetailBySlug(slug);

  try {
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch {}

  if (!detail) {
    return (
      <section className="container py-16 text-center">
        <h1 className="text-2xl font-bold">Pooja not found</h1>
        <p className="mt-2 text-muted-foreground">
          The requested regular pooja does not exist.
        </p>
        <div className="mt-6">
          <Button asChild>
            <NavLink to="/poojas/regular">Back to Regular Poojas</NavLink>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <main className="container py-10 md:py-14">
      <nav className="text-sm text-muted-foreground">
        <NavLink to="/poojas">Poojas</NavLink> /{" "}
        <NavLink to="/poojas/regular">Regular</NavLink> /{" "}
        <span className="text-foreground"> {detail.title}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
        {detail.title}
      </h1>

      <div className="mt-8 grid gap-6 md:grid-cols-3 items-start">
        <div className="md:col-span-1">
          <div className="aspect-[4/5] w-full overflow-hidden rounded-xl border bg-muted">
            <img
              src={detail.image || "/public/placeholder.svg"}
              alt={detail.title}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        <div className="md:col-span-1">
          <h2 className="text-xl font-semibold">Benefits</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5 text-sm">
            {detail.benefits.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-1" id="form">
          <div className="rounded-xl border p-6">
            <h2 className="text-lg font-semibold">Booking Request</h2>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                alert("Submitted. We will contact you shortly.");
              }}
            >
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="nakshatra">Nakshatra</Label>
                  <Input id="nakshatra" name="nakshatra" />
                </div>
                <div>
                  <Label htmlFor="gotra">Gotra</Label>
                  <Input id="gotra" name="gotra" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="date">Preferred Date</Label>
                  <Input id="date" name="date" type="date" />
                </div>
                <div>
                  <Label htmlFor="time">Preferred Time</Label>
                  <Input id="time" name="time" type="time" />
                </div>
              </div>
              <div>
                <Label htmlFor="intent">Intent / Sankalpam</Label>
                <Textarea
                  id="intent"
                  name="intent"
                  rows={4}
                  placeholder="Describe your intent or sankalpam"
                />
              </div>
              <Button type="submit" className="mt-2">
                Book Pooja
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
