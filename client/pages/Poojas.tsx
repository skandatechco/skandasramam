import { NavLink, Outlet } from "react-router-dom";

const subnav = [
  { to: "/poojas", label: "Overview", end: true },
  { to: "/poojas/daily", label: "Daily Poojas" },
];

export default function Poojas() {
  return (
    <div className="">
      <section className="border-b bg-secondary/40">
        <div className="container py-8">
          <h1 className="text-2xl font-extrabold tracking-tight">Poojas</h1>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Poojas submenu">
            {subnav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end as boolean | undefined}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    isActive ? "bg-background text-primary border-primary" : "bg-background/60 hover:bg-background"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </section>

      <Outlet />
    </div>
  );
}
