// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicFestival } from "@shared/festival";
import { resolveDestination } from "@shared/poojaPages";
import FestivalPoojaDetail from "./FestivalPoojaDetail";

const SLUG = "festival-diwali-lakshmi-pooja-20991101";
const festival: PublicFestival = {
  slug: SLUG,
  festivalName: "Diwali",
  poojaName: "Lakshmi Pooja",
  description: "Evening pooja with deepa aradhana",
  date: "2099-11-01",
  startTime: "18:00:00",
  amount: 1501,
  bookingOpensOn: null,
  bookingClosesOn: "2099-10-30",
  state: "open",
  bookable: true,
};

let fetchMock: ReturnType<typeof vi.fn>;
let festivalResponse: () => Response;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  window.scrollTo = vi.fn() as any;
  festivalResponse = () => json({ ok: true, festival });
  fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = new URL(input, "http://localhost").pathname;
    if (path === `/api/festivals/${SLUG}`) return festivalResponse();
    if (path === "/api/bookings" && init.method === "POST")
      return json(
        {
          ok: true,
          booking: {
            orderNo: "SKD-991101-ABCDEF",
            poojaName: "Lakshmi Pooja (Diwali)",
            date: "2099-11-01",
            amount: 1501,
            status: "pending",
            paymentStatus: "unpaid",
          },
          accessToken: "A".repeat(43),
        },
        201,
      );
    return json({ ok: false, code: "NOT_FOUND", error: "nf" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage(slug = SLUG, search = "") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[`/poojas/festival/${slug}${search}`]}>
        <Routes>
          <Route
            path="/poojas/festival/:slug"
            element={<FestivalPoojaDetail />}
          />
          <Route path="/booking/:orderNo" element={<p>booking created</p>} />
          <Route path="/calendar" element={<p>calendar page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const posts = () =>
  fetchMock.mock.calls.filter(([, i]) => (i as any)?.method === "POST");
const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("Full Name"), {
    target: { value: "Test Devotee" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "t@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Phone"), {
    target: { value: "9876543210" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Book Pooja" }));
};

describe("the festival booking page", () => {
  it("the calendar's booking link resolves to this page", () => {
    expect(resolveDestination(SLUG)).toBe(`/poojas/festival/${SLUG}`);
  });

  it("shows the festival, pooja, date, time and the offering's own fixed amount", async () => {
    renderPage();
    expect(await screen.findByText("Lakshmi Pooja")).toBeTruthy();
    expect(screen.getAllByText("Diwali").length).toBeGreaterThan(0);
    expect(screen.getByTestId("festival-date").textContent).toMatch(/2099/);
    expect(screen.getByText("6:00 PM")).toBeTruthy();
    expect(screen.getByTestId("festival-amount").textContent).toBe("₹1,501");
    expect(screen.getByText("Evening pooja with deepa aradhana")).toBeTruthy();
  });

  it("gives devotees no way to enter or change an amount", async () => {
    renderPage();
    await screen.findByText("Lakshmi Pooja");
    const form = screen
      .getByRole("button", { name: "Book Pooja" })
      .closest("form")!;
    const names = [...form.querySelectorAll("input,textarea,select")].map(
      (e) => (e as HTMLInputElement).name,
    );
    expect(names).not.toContain("amount");
    expect(names).not.toContain("price");
    expect(names).not.toContain("donation");
  });

  it("fixes the date to the festival date, whatever the link says", async () => {
    renderPage(SLUG, "?date=2099-12-25");
    await screen.findByText("Lakshmi Pooja");
    const date = screen.getByLabelText("Pooja Date") as HTMLInputElement;
    expect(date.value).toBe("2099-11-01");
    expect(date.readOnly).toBe(true);
  });

  it("books the offering by its own slug with the festival date, sending no amount", async () => {
    renderPage(SLUG, "?date=2099-11-01");
    await screen.findByText("Lakshmi Pooja");
    fillAndSubmit();
    await screen.findByText("booking created");
    expect(posts()).toHaveLength(1);
    const body = JSON.parse(String((posts()[0][1] as any).body));
    expect(body).toMatchObject({
      poojaSlug: SLUG,
      date: "2099-11-01",
      name: "Test Devotee",
    });
    expect(Object.keys(body)).not.toContain("amount");
  });

  it("does not submit twice on a double click", async () => {
    renderPage();
    await screen.findByText("Lakshmi Pooja");
    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Test Devotee" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "t@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "9876543210" },
    });
    const btn = screen.getByRole("button", { name: "Book Pooja" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByText("booking created");
    expect(posts()).toHaveLength(1);
  });

  it.each([
    ["full", "fully booked"],
    ["closed", "has closed"],
    ["not_open_yet", "not opened yet"],
  ] as const)(
    "when booking is %s: says so and cannot be submitted",
    async (state, text) => {
      festivalResponse = () =>
        json({ ok: true, festival: { ...festival, state, bookable: false } });
      renderPage();
      expect(await screen.findByText(new RegExp(text, "i"))).toBeTruthy();
      expect(
        (
          screen.getByRole("button", {
            name: "Book Pooja",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(posts()).toHaveLength(0);
    },
  );

  it("shows a server refusal (e.g. it just filled up) and keeps the form", async () => {
    fetchMock.mockImplementation(
      async (input: string, init: RequestInit = {}) => {
        const path = new URL(input, "http://localhost").pathname;
        if (path === `/api/festivals/${SLUG}`) return festivalResponse();
        return json(
          {
            ok: false,
            code: "FESTIVAL_FULL",
            error: "This festival pooja is fully booked.",
          },
          409,
        );
      },
    );
    renderPage();
    await screen.findByText("Lakshmi Pooja");
    fillAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /fully booked/,
    );
    expect((screen.getByLabelText("Full Name") as HTMLInputElement).value).toBe(
      "Test Devotee",
    );
  });

  it("an unknown or inactive festival gives a clear not-found page and no form", async () => {
    festivalResponse = () =>
      json({ ok: false, code: "FESTIVAL_NOT_FOUND", error: "gone" }, 404);
    renderPage();
    expect(await screen.findByText("Festival pooja not found")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Book Pooja" })).toBeNull();
    await waitFor(() => expect(posts()).toHaveLength(0));
  });
});
