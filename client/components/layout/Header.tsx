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
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="container flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-extrabold tracking-tight text-lg">Ashram Fullstack</span>
        </NavLink>
        <nav className="hidden md:flex items-center gap-1">
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
