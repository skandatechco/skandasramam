import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Menu, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

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
          <span className="font-extrabold tracking-tight text-lg whitespace-nowrap block">
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
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline">
            <NavLink to="/calendar">View Calendar</NavLink>
          </Button>
        </div>
        <div className="md:hidden">
          <MobileMenu />
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

function MobileMenu() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          aria-label="Open menu"
          className="inline-flex items-center justify-center rounded-md p-2 border"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0">
        <div className="p-4 border-b">
          <NavLink to="/" className="font-bold" aria-label="Home">
            Chennai Om Sri Skandashramam
          </NavLink>
        </div>
        <nav className="p-2 grid gap-1 text-sm">
          <NavLink
            to="/calendar"
            className="px-3 py-2 rounded-md hover:bg-secondary"
          >
            View Calendar
          </NavLink>
          <div className="mt-2 px-3 pt-3 text-xs uppercase text-muted-foreground">
            Poojas
          </div>
          <NavLink
            to="/poojas/regular"
            className="px-3 py-2 rounded-md hover:bg-secondary"
          >
            Regular Pooja
          </NavLink>
          <NavLink
            to="/poojas/special"
            className="px-3 py-2 rounded-md hover:bg-secondary"
          >
            Special Poojas
          </NavLink>
          <div className="mt-2 px-3 pt-3 text-xs uppercase text-muted-foreground">
            About
          </div>
          <NavLink
            to="/about/asramam"
            className="px-3 py-2 rounded-md hover:bg-secondary"
          >
            Asramam
          </NavLink>
          <NavLink
            to="/about/history"
            className="px-3 py-2 rounded-md hover:bg-secondary"
          >
            History
          </NavLink>
          <NavLink
            to="/about/swamiji"
            className="px-3 py-2 rounded-md hover:bg-secondary"
          >
            Swamiji
          </NavLink>
          <NavLink
            to="/about/deities"
            className="px-3 py-2 rounded-md hover:bg-secondary"
          >
            Deities
          </NavLink>
          <div className="mt-2 px-3 pt-3 text-xs uppercase text-muted-foreground">
            More
          </div>
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className="px-3 py-2 rounded-md hover:bg-secondary"
            >
              {n.label}
            </NavLink>
          ))}
          <div className="p-3">
            <SheetClose asChild>
              <button className="w-full mt-2 rounded-md border px-3 py-2">
                Close
              </button>
            </SheetClose>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
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
