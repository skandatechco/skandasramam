import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

const VISION_IMAGE = ""; // Optional: set an archival image URL to show the left column image
const TIMELINE: { year: string; text: string }[] = [
  { year: "1990", text: "Ashram consecration" },
  { year: "1995", text: "First Maha Kumbhabhishekam" },
  { year: "2005", text: "Establishment of Prathyangira Devi sanctum" },
  { year: "Today", text: "A center for spiritual growth and global devotees" },
];
const GALLERY_IMAGES: string[] = [];

export default function AboutHistory() {
  return (
    <main>
      {/* Hero Section (no image) */}
      <section className="bg-gradient-to-b from-muted/60 to-background border-b">
        <div className="container py-12 md:py-16 text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">The Sacred History of Skandasramam</h1>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            A journey of devotion, tradition, and spiritual service.
          </p>
        </div>
      </section>

      {/* Founding Story */}
      <section className="container py-10 md:py-14">
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {VISION_IMAGE && (
            <div className="md:col-span-1">
              <div className="rounded-xl overflow-hidden border bg-muted aspect-[4/5]">
                <img src={VISION_IMAGE} alt="Founding archival" className="w-full h-full object-cover" />
              </div>
            </div>
          )}
          <div className={VISION_IMAGE ? "md:col-span-2" : "md:col-span-3"}>
            <h2 className="text-2xl font-bold">The Vision</h2>
            <div className="mt-3 space-y-4 text-muted-foreground max-w-prose">
              <p>
                Adi Shankarar, Thiruvalluvar the servitors of Siva, Vishnu and thousands of spiritual masters were born in this country and served the people.  They still live with us in the hymns sung and teachings taught by them. The service they rendered to humanity with their words and deeds is indeed immeasurable.
              </p>
              <p>
                In this glorious lineage of sages has come Srimath Satguru Santhananda Swamigal. Our Swamigal is of Avadhuta tradition of Dattatreya.
              </p>
              <p>
                Bharat is a very ancient country vitalized by spirituality from the time that is immemorial.  Innumerable sages and saints have fostered its spiritual culture and civilization.
              </p>
              <p>Thus sings the great Tamil Poet Subramanya Bharati.</p>
              <p>The country that is called Bharat is ours</p>
              <p>It is great in knowledge and spiritual joy.</p>
              <p>In keeping its honor and dignity in giving alms.</p>
              <p>In music.</p>
              <p>In nectar-like poetry.</p>
              <p>Indeed, this country imparts spiritual knowledge to the entire world.</p>
              <p>Upanishads are the unique scriptural books, that are our own.</p>
              <p>Is there any other in this world that is equivalent to our Upanishads?</p>
              <p>
                This is how Bharathi praises the philosophical works bequeathed to us by the sages of ancient times. This country alone has found out the true meaning of human life and the ethical way by which the entire humanity must live.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="container py-8">
        <h2 className="text-2xl font-bold">Milestones</h2>
        <ol className="mt-4 relative border-l pl-6">
          {TIMELINE.map((t, i) => (
            <li key={i} className="mb-6">
              <div className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-primary" />
              <div className="text-sm text-muted-foreground">{t.year}</div>
              <div className="font-medium">{t.text}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* Spiritual Significance */}
      <section className="py-12 bg-muted/30 border-y">
        <div className="container text-center max-w-3xl">
          <h2 className="text-2xl font-bold">Spiritual Significance</h2>
          <blockquote className="mt-4 italic text-muted-foreground">
            “This sacred ground stands as a beacon of divine grace, guiding devotees on their spiritual journey.”
          </blockquote>
        </div>
      </section>

      {/* Gallery */}
      {GALLERY_IMAGES.length > 0 && (
        <section className="container py-10">
          <h2 className="text-2xl font-bold">Gallery</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
