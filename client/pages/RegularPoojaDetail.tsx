import { Button } from "@/components/ui/button";
import { NavLink, useParams } from "react-router-dom";
import { BookingForm } from "@/components/booking/BookingForm";

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
  /**
   * Used when the temple has not published benefits for this pooja: shows only
   * the temple's own listing text (from the Regular Poojas page). Nothing else is
   * invented.
   */
  about?: string;
  time?: string;
};

export const DETAILS: Detail[] = [
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
  // The two entries below use ONLY the temple's own listing text (Regular Poojas
  // page). The temple has not supplied benefits for them, so none are shown.
  {
    title: "Prathiyankara Sarabha Sulini Homam",
    benefits: [],
    about: "Daily homam for protection and blessings.",
    time: "9:15 AM – 11:00 AM",
  },
  {
    title: "Navavarna Pooja",
    benefits: [],
    about:
      "Performed on Panchami, Ashtami, Chaturdasi, New Moon, and Full Moon.",
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
              src={detail.image || "/placeholder.svg"}
              alt={detail.title}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        <div className="md:col-span-1">
          {detail.benefits.length > 0 ? (
            <>
              <h2 className="text-xl font-semibold">Benefits</h2>
              <ul className="mt-3 space-y-2 list-disc pl-5 text-sm">
                {detail.benefits.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">About this pooja</h2>
              {detail.about && <p className="mt-3 text-sm">{detail.about}</p>}
              {detail.time && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Time: {detail.time}
                </p>
              )}
            </>
          )}
        </div>

        <div className="md:col-span-1" id="form">
          <BookingForm poojaTitle={detail.title} />
        </div>
      </div>
    </main>
  );
}
