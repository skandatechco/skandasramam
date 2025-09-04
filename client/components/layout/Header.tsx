import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Sparkles } from "lucide-react";

const nav = [
  { to: "/calendar", label: "Spiritual Calendar" },
  { to: "/devotees", label: "Devotees" },
  { to: "/bookings", label: "Bookings" },
  { to: "/donations", label: "Donations" },
  { to: "/admin", label: "Admin" },
];

export function Header() {
  return (
    <header role="banner" className="sticky top-0 z-50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute left-4 top-4 z-[60] rounded-md bg-background px-3 py-2 text-sm font-medium border shadow">Skip to content</a>
      <div className="container flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2" aria-label="Ashram Fullstack home">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="font-extrabold tracking-tight text-lg">Ashram Fullstack</span>
        </NavLink>
        <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm font-medium hover:bg-secondary transition-colors ${
                  isActive ? "text-primary" : "text-foreground/80"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline">
            <NavLink to="/calendar">View Calendar</NavLink>
          </Button>
          <Button asChild>
            <NavLink to="/bookings">Book a Pooja</NavLink>
          </Button>
        </div>
      </div>
    </header>
  );
}
