import { BadgeCheck, Clock } from "lucide-react";

const intro =
  "Regular Puja’s such as Raghu Kalam, Amavasya, Pournami, Chaturthi, Pradosam, Ashtami, Karthigai, Chithirai, Vishagam & Swathi Nakshatram are conducted on a daily and monthly basis. Annadhanam is provided every day and all devotees are requested to participate.";

const items: { title: string; note?: string }[] = [
  {
    title: "Sankata Hara Chaturthi",
    note:
      "Special abhishekam to Lord Pancha Mukha Heramba Maha Ganapathy and Kamala Siddhi Vinayakar at 10:30 AM.",
  },
  { title: "Krishna Paksha Astami" },
  { title: "Maha Pradosham" },
  { title: "Amavasya" },
  { title: "Krithigai" },
  { title: "Tamil Month First Saturday" },
  { title: "Annadanam" , note: "Daily at 12:00 Noon"},
  {
    title: "Pournami / Full moon",
    note:
      "Special abhishekam to Goddess Matha Bhuvaneswari and Lord Dattatreya at 10:00 AM.",
  },
  { title: "Uthiram Nakshatram" },
  { title: "Chitirai Nakshatram" },
  { title: "Swathi Nakshatram" },
  { title: "Vishakam (Vishagam) Nakshatram" },
  { title: "Prathiyankara Sarabha Sulini Homam" },
  { title: "Navavarna Pooja" },
];

export default function PoojasDaily() {
  return (
    <section className="container py-10 md:py-14">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Daily Poojas</h1>
        <p className="mt-3 text-muted-foreground">{intro}</p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div key={it.title} className="rounded-xl border bg-card p-5">
            <div className="flex items-start gap-3">
              <BadgeCheck className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-semibold">{it.title}</h3>
                {it.note ? (
                  <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-4 w-4" /> {it.note}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
