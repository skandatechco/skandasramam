import { PlaceholderPage } from "@/components/common/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

export default function PoojasOverview() {
  return (
    <main className="container py-10 md:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight">Poojas & Homams</h1>
        <p className="mt-3 text-muted-foreground">
          At Om Skandasramam, every ritual is an offering of devotion and a channel for divine blessings. Through regular poojas and special homams, devotees are given an opportunity to connect deeply with the deities, seek protection, and invite peace, prosperity, and harmony into their lives.
        </p>
      </header>

      <section className="mt-10 grid gap-6 md:grid-cols-2 items-start">
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-xl font-bold">Regular Poojas</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Daily and periodic poojas are performed with Vedic chants, abhishekams, and archanas to the presiding deities. These poojas maintain the sanctity of the temple and keep the flow of divine energy vibrant.
          </p>
          <h3 className="mt-4 font-semibold">Benefits of Regular Poojas</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>Removes obstacles and negative influences</li>
            <li>Brings peace of mind, health, and prosperity</li>
            <li>Creates a protective spiritual atmosphere for family and home</li>
            <li>Strengthens one’s bond with the divine through disciplined worship</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Examples include Abhishekam, Alankaram, Deeparadanai, Navavarna Puja, and other offerings to Lord Ganapathy, Goddess Durga Parameswari, Lord Sarabheswara, and Goddess Prathyangira Devi.
          </p>
          <div className="mt-4">
            <Button asChild>
              <NavLink to="/poojas/regular">👉 Book a Regular Pooja</NavLink>
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-xl font-bold">Special Homams</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Homams are powerful fire rituals where sacred offerings are made to invoke the blessings of specific deities. Performed on auspicious days or for special intentions, these homams bring profound spiritual and material benefits.
          </p>
          <h3 className="mt-4 font-semibold">Benefits of Special Homams</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>Removes karmic blocks and purifies the mind and environment</li>
            <li>Grants courage, protection, and spiritual upliftment</li>
            <li>Fulfills prayers for health, wealth, education, and harmony</li>
            <li>Ensures collective welfare and blessings for families and communities</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Examples include: Prathyangira Devi Homam (protection), Sudarshana Homam (peace and obstacle removal), Chandi Homam (strength, prosperity, courage), Maha Rudra Homam (universal harmony and spiritual growth).
          </p>
          <div className="mt-4">
            <Button asChild variant="secondary">
              <NavLink to="/poojas/special">👉 Book a Special Homam</NavLink>
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-xl border p-6 bg-muted/40">
        <p className="text-sm text-muted-foreground">
          🌸 In essence, regular poojas sustain daily spiritual harmony, while special homams act as transformative rituals for specific blessings. Together, they help devotees walk the path of dharma with divine grace.
        </p>
      </section>
    </main>
  );
}
