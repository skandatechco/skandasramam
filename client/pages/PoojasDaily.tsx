import { BadgeCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

type Item = {
  title: string;
  details?: string;
  time?: string;
  action?: "book" | "donate";
};

const intro =
  "Regular Puja’s such as Raghu Kalam, Amavasya, Pournami, Chaturthi, Pradosam, Ashtami, Karthigai, Chithirai, Vishagam & Swathi Nakshatram are conducted on a daily and monthly basis. Annadhanam is provided every day and all devotees are requested to participate.";

const items: Item[] = [
  {
    title: "Sankata Hara Chaturthi",
    details:
      "Special abhishekam to Lord Pancha Mukha Heramba Maha Ganapathy and Kamala Siddhi Vinayakar.",
    time: "10:30 AM",
  },
  {
    title: "Krishna Paksha Ashtami",
    details:
      "Special abhishekam to Goddess Asta Dasa Bhuja Durga Parameswari followed by alankaram and deeparadanai. Navavarna puja to Sri Chakra Poorna Maha Meru in the evening.",
    time: "Abhishekam 10:30 AM • Navavarna 6:00 PM",
  },
  {
    title: "Maha Pradosham",
    details:
      "Grand celebration for Sri Mahasahasralingamurthy and Lord Nandikeswarar with Mahanyasam and special abhishekam; deeparadanai and prasad distribution.",
    time: "Mahanyasam 5:00 PM • Abhishekam 5:30 PM • Deeparadanai 6:30 PM",
  },
  {
    title: "Amavasya (New Moon)",
    details:
      "Special abhishekam to Goddess Prathiyankara Devi and Lord Pancha Mukha Anjaneyar followed by alankaram and deeparadanai.",
    time: "10:00 AM",
  },
  { title: "Krithigai", details: "Special abhishekam to Lord Swaminatha Swami.", time: "10:00 AM" },
  { title: "Tamil Month First Saturday", details: "Special abhishekam to Lord Saniswara Bhagawan.", time: "10:00 AM" },
  { title: "Annadanam", details: "Daily prasadam service for all devotees.", time: "12:00 Noon", action: "donate" },
  {
    title: "Pournami / Full moon",
    details:
      "Special abhishekam to Goddess Matha Bhuvaneswari and Lord Dattatreya.",
    time: "10:00 AM",
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
              <div className="flex-1">
                <h3 className="font-semibold">{it.title}</h3>
                {it.details ? (
                  <p className="mt-1 text-sm text-muted-foreground">{it.details}</p>
                ) : null}
                {it.time ? (
                  <p className="mt-2 text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-4 w-4" /> {it.time}
                  </p>
                ) : null}
                <div className="mt-4">
                  {it.action === "donate" ? (
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
            </div>
          </div>
        ))}
      </div>

      {/* Annadanam Schemes */}
      <div className="mt-12">
        <h2 className="text-xl font-bold">Annadanam Schemes</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">Lifetime Deposit</h3>
            <p className="mt-1 text-muted-foreground">INR 20,001</p>
            <div className="mt-3">
              <Button asChild variant="secondary">
                <NavLink to="/donations">Donate</NavLink>
              </Button>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">One Day Sponsor</h3>
            <p className="mt-1 text-muted-foreground">INR 1,001</p>
            <div className="mt-3">
              <Button asChild variant="secondary">
                <NavLink to="/donations">Donate</NavLink>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
