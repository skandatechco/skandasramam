// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingForm } from "@/components/booking/BookingForm";
import Index from "./Index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const wrap = (ui: React.ReactNode, route = "/") => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
  </QueryClientProvider>
);

describe("homepage", () => {
  it("keeps the hero and both CTA buttons unchanged, with the calendar immediately below", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    ); // nothing loads: page must still render
    const { container } = render(wrap(<Index />));
    const main = container.querySelector("main")!;
    const [hero, next] = [main.children[0], main.children[1]];

    const special = hero.querySelector('a[href="/poojas/special"]')!;
    const regular = hero.querySelector('a[href="/poojas/regular"]')!;
    expect(special.textContent).toContain("Book Pariharam Pooja");
    expect(regular.textContent).toContain("Book Regular Pooja");
    expect(
      hero.querySelector('img[alt^="Chennai Om Sri Skandashramam"]'),
    ).not.toBeNull();

    // the calendar is the very next section after the hero
    expect(next.id).toBe("calendar");
    expect(
      next.querySelectorAll("button[data-date]").length,
    ).toBeGreaterThanOrEqual(28);
    // the calendar is not inside the hero
    expect(hero.querySelector("#calendar")).toBeNull();
  });
});

describe("booking form date prefill from the calendar link", () => {
  const catalogue = {
    ok: true,
    poojas: [
      {
        slug: "pradosham",
        name: "Pradosham",
        type: "daily",
        description: null,
        amount: 500,
        bookable: true,
      },
    ],
  };
  async function dateFor(query: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(catalogue)),
    );
    render(
      wrap(
        <BookingForm poojaTitle="Pradosham" />,
        `/poojas/regular/pradosham${query}`,
      ),
    );
    await waitFor(() => expect(screen.getByText(/Pooja amount/)).toBeTruthy());
    return (document.getElementById("date") as HTMLInputElement).value;
  }

  it("prefills a valid future date", async () => {
    expect(await dateFor("?date=2099-01-10")).toBe("2099-01-10");
  });
  it("ignores past dates and malformed values", async () => {
    expect(await dateFor("?date=2000-01-10")).toBe("");
    cleanup();
    expect(await dateFor("?date=<script>")).toBe("");
    cleanup();
    expect(await dateFor("")).toBe("");
  });
});
