import { useParams, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

type Detail = { title: string; benefits: string[]; image?: string; donate?: boolean };

const DETAILS: Detail[] = [
  {
    title: "Lord Kamala Siddhi Vinayaka, Panchamukha Heramba Ganapathy",
    benefits: [
      "Removes obstacles in life, career, education, and marriage.",
      "Bestows siddhi (success), buddhi (wisdom), and prosperity.",
      "Protects devotees from accidents and unforeseen dangers.",
    ],
  },
  {
    title: "Goddess Prathyangira Devi",
    benefits: [
      "Neutralises black magic, evil eye, and negative energies.",
      "Grants inner strength and courage during adversities.",
      "Brings peace and stability to family life.",
    ],
  },
  {
    title: "Lord Veera Sarabeswara",
    benefits: [
      "Pacifies planetary afflictions, especially Sarpa dosha and Pitru dosha.",
      "Removes destructive anger and cures chronic ailments.",
      "Provides relief from court cases and enmity.",
    ],
  },
  {
    title: "Goddess Matha Bhuvaneshwari",
    benefits: [
      "Grants spiritual elevation and inner peace.",
      "Removes poverty, bestows abundance and family harmony.",
      "Protects from misfortune and grants stability in life.",
    ],
  },
  {
    title: "Lord Skanda (Murugan)",
    benefits: [
      "Removes debts and delays in marriage.",
      "Brings victory over enemies and obstacles.",
      "Protects children and ensures progeny blessings.",
    ],
  },
  {
    title: "Lord Shiva",
    benefits: [
      "Cleanses past karmas and sins.",
      "Grants health, longevity, and spiritual upliftment.",
      "Removes fear of death and ensures liberation (moksha).",
    ],
  },
  {
    title: "Lord Saniswarar",
    benefits: [
      "Reduces malefic effects of Saturn (Sade Sati, Ashtama Shani, etc.).",
      "Brings relief from struggles, delays, and financial problems.",
      "Ensures steady career, patience, and discipline in life.",
    ],
  },
  {
    title: "Lord Panchamukha Hanuman",
    benefits: [
      "Removes fear, evil influences, and graha doshas.",
      "Grants courage, confidence, and victory in ventures.",
      "Protects from nightmares and spirits.",
    ],
  },
  {
    title: "Lord Iyyapan",
    benefits: [
      "Bestows discipline, devotion, and simplicity.",
      "Grants protection during travels and journeys.",
      "Brings unity, brotherhood, and family peace.",
    ],
  },
  {
    title: "Asta Dasa Bhuja Durga Parameswari",
    benefits: [
      "Removes powerful obstacles and enemies.",
      "Protects women and children from misfortune.",
      "Grants strength, prosperity, and divine grace.",
    ],
  },
  {
    title: "Lord Dattatreya",
    benefits: [
      "Removes confusion, mental stress, and karmic burdens.",
      "Brings knowledge, wisdom, and spiritual growth.",
      "Ensures harmony in joint families and guru’s blessings.",
    ],
  },
  {
    title: "Sadguru Shantananda Swamigal",
    benefits: [
      "Invokes guru’s grace for spiritual progress.",
      "Removes inner doubts and obstacles in sadhana.",
      "Bestows peace, clarity, and divine guidance.",
    ],
  },
  {
    title: "Prathyangira Sarabha Soolini Koti Homam",
    benefits: [
      "One of the most powerful remedies against intense karmic afflictions.",
      "Protects nations, families, and individuals from disasters.",
      "Grants collective peace, health, and prosperity.",
    ],
  },
  {
    title: "Durga Saptha Sathi Parayanam",
    benefits: [
      "Daily recitation brings protection from negative forces.",
      "Grants wealth, courage, and success in endeavors.",
      "Strengthens devotion and removes inner fears.",
    ],
  },
  {
    title: "Nava Varna Pooja",
    benefits: [
      "Invokes the Navakshari Mantra Shakti.",
      "Grants holistic benefits – health, wealth, knowledge, and liberation.",
      "Removes deep-rooted karmic obstacles.",
    ],
  },
  {
    title: "Guru Paaduka Pooja",
    benefits: [
      "Brings guru’s blessings for wisdom and enlightenment.",
      "Removes ignorance and guides one on the spiritual path.",
      "Grants clarity in decisions and protection in life.",
    ],
  },
  {
    title: "Homam for World Peace",
    benefits: [
      "Reduces collective suffering and unrest.",
      "Invokes divine harmony in society and nature.",
      "Promotes compassion, brotherhood, and global well-being.",
    ],
  },
  {
    title: "Daily Annadhanam",
    benefits: [
      "Removes sins related to hunger and neglect of others.",
      "Brings blessings of ancestors and divine grace.",
      "Ensures abundance, prosperity, and happiness in family.",
    ],
    donate: true,
  },
];

function getDetailBySlug(slug: string | undefined): Detail | undefined {
  if (!slug) return undefined;
  return DETAILS.find((d) => slugify(d.title) === slug);
}

export default function SpecialPoojaDetail() {
  const { slug } = useParams();
  const detail = getDetailBySlug(slug);

  if (!detail) {
    return (
      <section className="container py-16 text-center">
        <h1 className="text-2xl font-bold">Pooja not found</h1>
        <p className="mt-2 text-muted-foreground">The requested special pooja does not exist.</p>
        <div className="mt-6">
          <Button asChild>
            <NavLink to="/poojas/special">Back to Special Poojas</NavLink>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <main className="container py-10 md:py-14">
      <nav className="text-sm text-muted-foreground">
        <NavLink to="/poojas">Poojas</NavLink> / <NavLink to="/poojas/special">Special</NavLink> /
        <span className="text-foreground"> {detail.title}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{detail.title}</h1>

      <div className="mt-8 grid gap-6 md:grid-cols-3 items-start">
        {/* Image (approx 30%) */}
        <div className="md:col-span-1">
          <div className="aspect-[4/5] w-full overflow-hidden rounded-xl border bg-muted">
            <img
              src={detail.image || "/public/placeholder.svg"}
              alt={detail.title}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* Benefits */}
        <div className="md:col-span-1">
          <h2 className="text-xl font-semibold">Benefits</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5 text-sm">
            {detail.benefits.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        {/* Intake form */}
        <div className="md:col-span-1" id="form">
          <div className="rounded-xl border p-6">
            <h2 className="text-lg font-semibold">{detail.donate ? "Donation" : "Booking"} Request</h2>
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
                <Textarea id="intent" name="intent" rows={4} placeholder="Describe your intent or sankalpam" />
              </div>
              <Button type="submit" className="mt-2">
                {detail.donate ? "Proceed to Donate" : "Book Pooja"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
