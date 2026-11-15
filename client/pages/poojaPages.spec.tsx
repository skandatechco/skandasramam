// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DONATION_SLUGS,
  REGULAR_PAGE_TITLES,
  SPECIAL_PAGE_TITLES,
  regularPageSlugs,
  resolveDestination,
  slugify,
  specialPageSlugs,
} from "@shared/poojaPages";
import PoojasDaily from "./PoojasDaily";
import RegularPoojaDetail, {
  DETAILS as REGULAR_DETAILS,
} from "./RegularPoojaDetail";
import SpecialPoojaDetail, {
  DETAILS as SPECIAL_DETAILS,
} from "./SpecialPoojaDetail";
import SpecialPoojas from "./SpecialPoojas";

beforeEach(() => {
  window.scrollTo = vi.fn() as any;
  // the booking form asks the API which poojas are bookable; none needed here
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, poojas: [] }), { status: 200 }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/poojas/regular/:slug"
            element={<RegularPoojaDetail />}
          />
          <Route
            path="/poojas/special/:slug"
            element={<SpecialPoojaDetail />}
          />
          <Route path="/poojas/regular" element={<PoojasDaily />} />
          <Route path="/poojas/special" element={<SpecialPoojas />} />
          <Route path="/donations" element={<p>donations page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the page registry matches the real detail pages", () => {
  it("regular page titles are exactly the titles of RegularPoojaDetail", () => {
    expect([...REGULAR_PAGE_TITLES].sort()).toEqual(
      REGULAR_DETAILS.map((d) => d.title).sort(),
    );
  });
  it("special page titles are the SpecialPoojaDetail titles, minus the donation entry", () => {
    const bookable = SPECIAL_DETAILS.filter((d: any) => !d.donate).map(
      (d) => d.title,
    );
    expect([...SPECIAL_PAGE_TITLES].sort()).toEqual(bookable.sort());
    expect(
      SPECIAL_DETAILS.filter((d: any) => d.donate).map((d) => slugify(d.title)),
    ).toEqual(["daily-annadhanam"]);
  });
  it("no slug belongs to both sections, and donation slugs have no destination", () => {
    expect(
      regularPageSlugs().filter((s) => specialPageSlugs().includes(s)),
    ).toEqual([]);
    for (const s of DONATION_SLUGS) expect(resolveDestination(s)).toBeNull();
  });
});

describe("every bookable destination renders a real page", () => {
  const all = [...regularPageSlugs(), ...specialPageSlugs()];
  it("covers every regular and special pooja page", () => {
    expect(all.length).toBe(
      REGULAR_PAGE_TITLES.length + SPECIAL_PAGE_TITLES.length,
    );
  });

  it.each(all)("%s", async (slug) => {
    const dest = resolveDestination(slug)!;
    expect(dest).toBeTruthy();
    renderAt(`${dest}?date=2099-01-10`);
    // a real page: a heading with the pooja's title, never the "not found" fallback
    expect(screen.queryByText("Pooja not found")).toBeNull();
    const details = dest.includes("/regular/")
      ? REGULAR_DETAILS
      : SPECIAL_DETAILS;
    const title = details.find((d) => slugify(d.title) === slug)!.title;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    // and the booking form is there, bound to this pooja
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Booking Request" }),
      ).toBeTruthy(),
    );
  });

  it("an unknown slug shows the not-found page instead of a booking form", () => {
    renderAt("/poojas/regular/no-such-pooja");
    expect(screen.getByText("Pooja not found")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Booking Request" }),
    ).toBeNull();
  });
});

describe("the two previously missing regular pages", () => {
  it("Prathiyankara Sarabha Sulini Homam shows only the temple's own listing text", () => {
    renderAt("/poojas/regular/prathiyankara-sarabha-sulini-homam");
    expect(screen.getByText("About this pooja")).toBeTruthy();
    expect(
      screen.getByText("Daily homam for protection and blessings."),
    ).toBeTruthy();
    expect(screen.getByText(/9:15 AM – 11:00 AM/)).toBeTruthy();
    expect(screen.queryByText("Benefits")).toBeNull();
  });
  it("Navavarna Pooja shows only its listed schedule text, and none of the special Nava Varna Pooja's benefits", () => {
    renderAt("/poojas/regular/navavarna-pooja");
    expect(
      screen.getByText(
        /Performed on Panchami, Ashtami, Chaturdasi, New Moon, and Full Moon/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Navakshari/)).toBeNull();
    expect(screen.queryByText("Benefits")).toBeNull();
  });
  it("neither is an alias of a special pooja: they are separate pages", () => {
    expect(resolveDestination("prathiyankara-sarabha-sulini-homam")).toBe(
      "/poojas/regular/prathiyankara-sarabha-sulini-homam",
    );
    expect(resolveDestination("navavarna-pooja")).toBe(
      "/poojas/regular/navavarna-pooja",
    );
    expect(resolveDestination("prathyangira-sarabha-soolini-koti-homam")).toBe(
      "/poojas/special/prathyangira-sarabha-soolini-koti-homam",
    );
    expect(resolveDestination("nava-varna-pooja")).toBe(
      "/poojas/special/nava-varna-pooja",
    );
  });
  it("pooja pages that DO have benefits still show them", () => {
    renderAt("/poojas/regular/pradosham");
    expect(screen.getByText("Benefits")).toBeTruthy();
    expect(screen.queryByText("About this pooja")).toBeNull();
  });
});

describe("links on the Regular and Special pooja listings all resolve", () => {
  const hrefs = () =>
    [...document.querySelectorAll("a")].map(
      (a) => a.getAttribute("href") ?? "",
    );

  it("every booking link on the Regular Poojas listing goes to a real page (Annadanam goes to donations)", () => {
    renderAt("/poojas/regular");
    const poojaLinks = hrefs().filter((h) => h.startsWith("/poojas/regular/"));
    // 14 listed entries minus the Annadanam donation = exactly the 13 regular pages
    expect(poojaLinks.length).toBe(REGULAR_PAGE_TITLES.length);
    for (const h of poojaLinks) {
      const slug = h.split("/").pop()!;
      expect([h, resolveDestination(slug)]).toEqual([h, h]);
    }
    // Annadanam stays a donation flow: no booking link at all
    expect(hrefs().some((h) => h.includes("annadanam"))).toBe(false);
    expect(hrefs()).toContain("/donations");
  });

  it("every link on the Special Poojas listing goes to a real page", () => {
    renderAt("/poojas/special");
    const poojaLinks = [
      ...new Set(hrefs().filter((h) => h.startsWith("/poojas/special/"))),
    ];
    expect(poojaLinks.length).toBeGreaterThan(10);
    for (const h of poojaLinks) {
      const slug = h.split("/").pop()!;
      const expected = resolveDestination(slug);
      // the listing may link the donation entry to its own (donation) page
      if (expected === null) expect(DONATION_SLUGS).toContain(slug);
      else expect(expected).toBe(h);
    }
  });
});

describe("fallback image", () => {
  it("points at a file that exists in public/ and never at /public/...", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    for (const f of ["RegularPoojaDetail.tsx", "SpecialPoojaDetail.tsx"]) {
      const src = readFileSync(`client/pages/${f}`, "utf8");
      expect(src).not.toContain("/public/placeholder.svg");
      expect(src).toContain('"/placeholder.svg"');
    }
    expect(existsSync("public/placeholder.svg")).toBe(true);
  });
});
