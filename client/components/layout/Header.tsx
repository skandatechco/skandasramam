import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const nav = [
  { to: "/", label: "Home" },
  { to: "/events", label: "Events" },
  { to: "/gallery", label: "Gallery" },
  { to: "/resources", label: "Resources" },
  { to: "/charity", label: "Charity" },
  { to: "/contact", label: "Contact" },
];

export function Header() {
  return (
    <header
      role="banner"
      className="sticky top-0 z-50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b"
    >
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute left-4 top-4 z-[60] rounded-md bg-background px-3 py-2 text-sm font-medium border shadow"
      >
        Skip to content
      </a>
      <div className="container flex h-16 items-center justify-between">
        <NavLink
          to="/"
          className="flex items-center gap-2"
          aria-label="Chennai Om Sri Skandashramam home"
        >
          <div className="h-8 w-8 rounded-full grid place-items-center overflow-hidden border">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2F982c525ed71b4aecb07284a69278ef3d%2Ffaf8ca55fc2c469baf03a19ca1b05c19?format=webp&width=800"
              alt="Ashram logo"
              className="h-8 w-8 object-cover"
            />
          </div>
          <span className="font-extrabold tracking-tight text-lg whitespace-nowrap hidden sm:block">
            Chennai Om Sri Skandashramam
          </span>
        </NavLink>
        <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
          {/* Poojas dropdown */}
          <PoojasDropdown />
          {/* About dropdown */}
          <AboutDropdown />
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

function AboutDropdown() {
  const location = useLocation();
  const active = location.pathname.startsWith("/about");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-secondary transition-colors ${active ? "text-primary" : "text-foreground/80"}`}
        >
          About
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <NavLink to="/about/asramam">Asramam</NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/about/history">History</NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/about/swamiji">Swamiji</NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/about/deities">Deities</NavLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PoojasDropdown() {
  const location = useLocation();
  const active = location.pathname.startsWith("/poojas");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-secondary transition-colors ${active ? "text-primary" : "text-foreground/80"}`}
        >
          Poojas
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <NavLink to="/poojas/regular">Regular Pooja</NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/poojas/special">Special Poojas</NavLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
