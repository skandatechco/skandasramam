import { PlaceholderPage } from "@/components/common/PlaceholderPage";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function About() {
  const items = [
    { id: "asramam", label: "Asramam" },
    { id: "history", label: "History" },
    { id: "swamiji", label: "Swamiji" },
    { id: "deities", label: "Deities" },
  ];

  return (
    <main className="container py-10 md:py-14">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            About the Ashram
          </h1>
          <p className="mt-2 text-muted-foreground max-w-3xl">
            Our lineage, mission, and sacred traditions that guide daily worship
            and service.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">About Sections</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {items.map((it) => (
              <DropdownMenuItem key={it.id} asChild>
                <a href={`#${it.id}`}>{it.label}</a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-8 grid gap-12">
        <section id="asramam" aria-labelledby="asramam-title">
          <h2 id="asramam-title" className="text-2xl font-bold">
            Asramam
          </h2>
          <p className="mt-2 text-muted-foreground max-w-3xl">
            Om Sri Skandasramam serves devotees with daily poojas, homams, and
            spiritual guidance, upholding scriptural procedures with care and
            devotion.
          </p>
        </section>

        <section id="history" aria-labelledby="history-title">
          <h2 id="history-title" className="text-2xl font-bold">
            History
          </h2>
          <p className="mt-2 text-muted-foreground max-w-3xl">
            Established to preserve dharma and temple traditions, the ashram
            nurtures community through regular observances, charitable
            initiatives, and education.
          </p>
        </section>

        <section id="swamiji" aria-labelledby="swamiji-title">
          <h2 id="swamiji-title" className="text-2xl font-bold">
            Swamiji
          </h2>
          <p className="mt-2 text-muted-foreground max-w-3xl">
            Guided by our revered Swamiji, devotees receive blessings,
            teachings, and leadership rooted in compassion, discipline, and
            service.
          </p>
        </section>

        <section id="deities" aria-labelledby="deities-title">
          <h2 id="deities-title" className="text-2xl font-bold">
            Deities
          </h2>
          <p className="mt-2 text-muted-foreground max-w-3xl">
            The sanctum houses presiding deities including Sri Subrahmanya
            Swami, Sri Mahasahasralingamurthy, Sri Prathiyankara Devi, and Sri
            Maha Sudarshana Murthy, with regular abhishekams and alankarams.
          </p>
        </section>
      </div>
    </main>
  );
}
