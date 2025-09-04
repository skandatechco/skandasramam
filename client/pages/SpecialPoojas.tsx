import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

type Special = { title: string; desc: string; action?: "book" | "donate" };

const specials: Special[] = [
  {
    title: "Lord Kamala Siddhi Vinayaka, Panchamukha Heramba Ganapathy",
    desc: "Removes obstacles and grants success in all endeavors.",
  },
  {
    title: "Goddess Prathyangira Devi",
    desc: "Protects against black magic, evil eye, and negative energies.",
  },
  {
    title: "Lord Veera Sarabeswara",
    desc: "Pacifies doshas, cures ailments, and removes enmity.",
  },
  {
    title: "Goddess Matha Bhuvaneshwari",
    desc: "Bestows abundance, harmony, and spiritual elevation.",
  },
  {
    title: "Lord Skanda (Murugan)",
    desc: "Brings victory, clears debts, and ensures progeny blessings.",
  },
  {
    title: "Lord Shiva",
    desc: "Cleanses karmas and grants health, peace, and liberation.",
  },
  {
    title: "Lord Saniswarar",
    desc: "Reduces Saturn’s malefic effects and brings steady progress.",
  },
  {
    title: "Lord Panchamukha Hanuman",
    desc: "Grants courage, protection, and victory over negativity.",
  },
  {
    title: "Lord Iyyapan",
    desc: "Blesses with discipline, devotion, and family peace.",
  },
  {
    title: "Asta Dasa Bhuja Durga Parameswari",
    desc: "Destroys obstacles and ensures strength and prosperity.",
  },
  {
    title: "Lord Dattatreya",
    desc: "Removes stress, balances karma, and grants wisdom.",
  },
  {
    title: "Sadguru Shantananda Swamigal",
    desc: "Bestows guru’s grace for clarity and spiritual growth.",
  },
  {
    title: "Prathyangira Sarabha Soolini Koti Homam",
    desc: "Powerful remedy for karmic afflictions and universal protection.",
  },
  {
    title: "Durga Saptha Sathi Parayanam",
    desc: "Grants courage, wealth, and protection from negativity.",
  },
  {
    title: "Nava Varna Pooja",
    desc: "Invokes divine energies for health, prosperity, and liberation.",
  },
  {
    title: "Guru Paaduka Pooja",
    desc: "Receives guru’s blessings for wisdom and guidance.",
  },
  {
    title: "Homam for World Peace",
    desc: "Promotes harmony, compassion, and collective well-being.",
  },
  {
    title: "Daily Annadhanam",
    desc: "Removes hunger-related sins and ensures abundance and blessings.",
    action: "donate",
  },
];

export default function SpecialPoojas() {
  return (
    <main>
      <section className="border-b bg-secondary/40">
        <div className="container py-8">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Special Poojas
          </h1>
          <p className="mt-2 text-muted-foreground max-w-3xl">
            Festival and sankalpa-based poojas performed on auspicious days with
            elaborate rituals and Vedic procedures.
          </p>
        </div>
      </section>

      <section className="container py-10 md:py-14">
        <article className="prose prose-neutral dark:prose-invert max-w-4xl">
          <p>
            According to Hindu shastras, there is a Moolamantra for every
            Devathai. By reciting this as a japam, the journey of a Devotee
            towards merging with his Ishta-Devathai begins.
          </p>
          <p>
            A Homam is the avahanam of the Devathai in Agni when all auspicious
            articles are offered while simultaneously reciting the Mantra. The
            Mantra’s effect is at once multiplied a hundred times. The offerings
            to the Devathai during a Homam are multiplied infinitely. A single
            grain of rice that is offered in the Homam is multiplied by infinity
            and immediately reached the Devathai.
          </p>
          <p>
            Imagine every granary in all the worlds beginning to overflow at the
            offering of just one grain of rice. Similarly, a single flower
            offered in the Homam is equal to covering the cosmic form of the
            deity with the fragrance and beauty of that flower. Thus, a Homam
            conducted according to strict Vedic practices becomes a multiplier
            of divine power. The Devathai so satisfied with the sincerity and
            conduct of the Devotees has no alternative but to meet every wish
            and command.
          </p>
        </article>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {specials.map((s) => (
            <div
              key={s.title}
              className="rounded-xl border bg-card p-6 flex flex-col gap-3"
            >
              <NavLink
                to={`/poojas/special/${slugify(s.title)}`}
                className="text-lg font-semibold hover:underline"
              >
                {s.title}
              </NavLink>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
              <div className="mt-2">
                {s.action === "donate" ? (
                  <Button asChild variant="secondary">
                    <NavLink to={`/poojas/special/${slugify(s.title)}`}>
                      Donate
                    </NavLink>
                  </Button>
                ) : (
                  <Button asChild>
                    <NavLink to={`/poojas/special/${slugify(s.title)}`}>
                      Book Pooja
                    </NavLink>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
