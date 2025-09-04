import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

export default function SpecialPoojas() {
  return (
    <main>
      <section className="border-b bg-secondary/40">
        <div className="container py-8">
          <h1 className="text-3xl font-extrabold tracking-tight">Special Poojas</h1>
          <p className="mt-2 text-muted-foreground max-w-3xl">
            Festival and sankalpa-based poojas performed on auspicious days with
            elaborate rituals and Vedic procedures.
          </p>
          <div className="mt-4">
            <Button asChild>
              <NavLink to="/bookings">Book Special Pooja</NavLink>
            </Button>
          </div>
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
            conducted according to strict Vedic practices becomes a multiplier of
            divine power. The Devathai so satisfied with the sincerity and
            conduct of the Devotees has no alternative but to meet every wish and
            command.
          </p>
        </article>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {specials.map((s) => (
            <div key={s.title} className="rounded-xl border bg-card p-6 flex flex-col gap-3">
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
              <div className="mt-2">
                {s.action === "donate" ? (
                  <Button asChild variant="secondary">
                    <NavLink to="/donations">Donate</NavLink>
                  </Button>
                ) : (
                  <Button asChild>
                    <NavLink to="/bookings">Book Pooja</NavLink>
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
