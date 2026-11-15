// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CalendarDay,
  CalendarMonthResponse,
  CalendarPooja,
} from "@shared/calendar";
import { bookingAvailability, bookingLink } from "@/lib/calendarLinks";
import { DayPanel } from "./DayPanel";
import { HomeCalendar } from "./HomeCalendar";
import { MonthCalendar } from "./MonthCalendar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---- fixtures ----------------------------------------------------------------
const daily: CalendarPooja = {
  slug: "abhishekam",
  name: "Abhishekam",
  type: "daily",
  amount: 100,
  destination: "/poojas/regular/abhishekam",
  bookable: true,
};
const special: CalendarPooja = {
  slug: "homam",
  name: "Maha Homam",
  type: "special",
  amount: 1500,
  destination: "/poojas/special/homam",
  bookable: true,
};
const pradosham: CalendarPooja = {
  slug: "pradosham",
  name: "Pradosham",
  type: "panchangam",
  amount: 300,
  destination: "/poojas/regular/pradosham",
  bookable: true,
};
// priced, but no public page exists for it: must never be offered for booking
const pageless: CalendarPooja = {
  slug: "no-such-page",
  name: "Pageless Pooja",
  type: "special",
  amount: 900,
  destination: null,
  bookable: false,
};
const unpriced: CalendarPooja = {
  slug: "new-pooja",
  name: "New Pooja",
  type: "special",
  amount: null,
  destination: "/poojas/special/new-pooja",
  bookable: false,
};
const poojas = {
  abhishekam: daily,
  homam: special,
  pradosham,
  "no-such-page": pageless,
  "new-pooja": unpriced,
};

const day = (date: string, over: Partial<CalendarDay> = {}): CalendarDay => ({
  date,
  panchang: null,
  recurring: [],
  panchangam: [],
  special: [],
  festival: [],
  ...over,
});
const withPanchang = (nakshatra: string, labels: string[] = []) => ({
  tithi: "Trayodashi",
  paksha: "Shukla Paksha",
  nakshatra,
  labels,
  source: "pooja_days" as const,
});

const noop = () => {};
const calProps = {
  today: "2027-01-10",
  selectedDate: null,
  onSelect: noop,
  onPrev: noop,
  onNext: noop,
  onToday: noop,
};

// ---- MonthCalendar -----------------------------------------------------------
describe("MonthCalendar", () => {
  it("renders every date of the month, including 29 days in a leap February", () => {
    const { container, rerender } = render(
      <MonthCalendar {...calProps} year={2028} month={2} />,
    );
    expect(screen.getByTestId("calendar-title").textContent).toBe(
      "February 2028",
    );
    expect(container.querySelectorAll("button[data-date]")).toHaveLength(29);
    expect(container.querySelector('[data-date="2028-02-29"]')).not.toBeNull();
    rerender(<MonthCalendar {...calProps} year={2027} month={2} />);
    expect(container.querySelectorAll("button[data-date]")).toHaveLength(28);
    expect(container.querySelector('[data-date="2027-02-29"]')).toBeNull();
  });

  it("lays out month boundaries: leading blanks, Sunday-first (Jan 2027 starts on Friday)", () => {
    const { container } = render(
      <MonthCalendar {...calProps} year={2027} month={1} />,
    );
    const firstRow = container.querySelectorAll('[role="row"]')[1]; // [0] is the weekday header
    const cells = [...firstRow.children];
    expect(
      cells.slice(0, 5).every((c) => c.getAttribute("aria-hidden") === "true"),
    ).toBe(true);
    expect(cells[5].querySelector("button")?.getAttribute("data-date")).toBe(
      "2027-01-01",
    );
  });

  it("shows nakshatram per date and a dash where data is missing (never a made-up value)", () => {
    const days = {
      "2027-01-05": day("2027-01-05", { panchang: withPanchang("Rohini") }),
    };
    const { container } = render(
      <MonthCalendar {...calProps} year={2027} month={1} days={days} />,
    );
    const nak = (d: string) =>
      container.querySelector(`[data-date="${d}"] [data-testid="nakshatra"]`)!
        .textContent;
    expect(nak("2027-01-05")).toBe("Rohini");
    expect(nak("2027-01-06")).toBe("—");
  });

  it("flags auspicious dates only from real data (labels or a special pooja)", () => {
    const days = {
      "2027-01-05": day("2027-01-05", {
        panchang: withPanchang("Rohini", ["Pradosham"]),
      }),
      "2027-01-14": day("2027-01-14", {
        special: [{ slug: "homam", startTime: null }],
      }),
      "2027-01-15": day("2027-01-15", {
        panchang: withPanchang("Hasta"),
        recurring: [{ slug: "abhishekam", startTime: null }],
      }),
    };
    const { container } = render(
      <MonthCalendar
        {...calProps}
        year={2027}
        month={1}
        days={days}
        poojas={poojas}
      />,
    );
    const aus = (d: string) =>
      container
        .querySelector(`[data-date="${d}"]`)!
        .hasAttribute("data-auspicious");
    expect(aus("2027-01-05")).toBe(true);
    expect(aus("2027-01-14")).toBe(true);
    expect(aus("2027-01-15")).toBe(false); // daily poojas alone are not "auspicious"
    expect(aus("2027-01-20")).toBe(false);
  });

  it("marks today and the selected date for assistive tech", () => {
    const { container } = render(
      <MonthCalendar
        {...calProps}
        year={2027}
        month={1}
        selectedDate="2027-01-14"
      />,
    );
    expect(
      container
        .querySelector('[data-date="2027-01-10"]')!
        .getAttribute("aria-current"),
    ).toBe("date");
    expect(
      container
        .querySelector('[data-date="2027-01-14"]')!
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-date="2027-01-15"]')!
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("selects a date on click and describes it in the accessible label", () => {
    const onSelect = vi.fn();
    const days = {
      "2027-01-05": day("2027-01-05", {
        panchang: withPanchang("Rohini"),
        recurring: [{ slug: "abhishekam", startTime: null }],
      }),
    };
    const { container } = render(
      <MonthCalendar
        {...calProps}
        year={2027}
        month={1}
        days={days}
        poojas={poojas}
        onSelect={onSelect}
      />,
    );
    const btn = container.querySelector(
      '[data-date="2027-01-05"]',
    ) as HTMLElement;
    expect(btn.getAttribute("aria-label")).toMatch(
      /Tuesday, 5 January 2027, Nakshatram Rohini, 1 daily pooja/,
    );
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith("2027-01-05");
  });

  it("wires month navigation and disables it at the limits", () => {
    const onPrev = vi.fn(),
      onNext = vi.fn(),
      onToday = vi.fn();
    const { rerender } = render(
      <MonthCalendar
        {...calProps}
        year={2027}
        month={1}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
      />,
    );
    fireEvent.click(screen.getByLabelText("Previous month"));
    fireEvent.click(screen.getByLabelText("Next month"));
    fireEvent.click(screen.getByText("Go to today"));
    expect([onPrev, onNext, onToday].map((f) => f.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);
    rerender(
      <MonthCalendar
        {...calProps}
        year={2027}
        month={1}
        canPrev={false}
        canNext={false}
      />,
    );
    expect(
      (screen.getByLabelText("Previous month") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Next month") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("is responsive: compact dots on mobile, named chips from the sm breakpoint up", () => {
    const days = {
      "2027-01-14": day("2027-01-14", {
        special: [{ slug: "homam", startTime: null }],
        recurring: [{ slug: "abhishekam", startTime: null }],
      }),
    };
    const { container } = render(
      <MonthCalendar
        {...calProps}
        year={2027}
        month={1}
        days={days}
        poojas={poojas}
      />,
    );
    const cell = container.querySelector('[data-date="2027-01-14"]')!;
    // mobile-only dots
    const dots = cell.querySelector("[data-dot]")!.parentElement!;
    expect(dots.className).toContain("sm:hidden");
    // desktop-only chips (hidden below sm, flex from sm)
    const chip = cell.querySelector('[data-chip="special"]')!;
    expect(chip.textContent).toBe("Maha Homam");
    expect(chip.parentElement!.className).toMatch(/\bhidden\b.*\bsm:flex\b/);
    // single-letter weekday on mobile, full short name from sm up
    const header = container.querySelector('[role="columnheader"]')!;
    expect(header.querySelector(".sm\\:hidden")!.textContent).toBe("S");
    expect(header.querySelector(".hidden.sm\\:inline")!.textContent).toBe(
      "Sun",
    );
    // 7-column grid regardless of width
    expect(container.querySelector('[role="row"]')!.className).toContain(
      "grid-cols-7",
    );
  });
});

// ---- booking links -----------------------------------------------------------
describe("booking links and availability", () => {
  it("routes daily poojas to /poojas/regular and special poojas to /poojas/special with the date", () => {
    expect(bookingLink(daily, "2027-01-10")).toBe(
      "/poojas/regular/abhishekam?date=2027-01-10",
    );
    expect(bookingLink(special, "2027-01-14")).toBe(
      "/poojas/special/homam?date=2027-01-14",
    );
  });
  it("never allows an unpriced pooja, and not a past date", () => {
    expect(bookingAvailability(unpriced, "2099-01-01", "2027-01-10")).toBe(
      "no-price",
    );
    expect(
      bookingAvailability(
        { ...daily, bookable: true, amount: null },
        "2099-01-01",
        "2027-01-10",
      ),
    ).toBe("no-price");
    expect(bookingAvailability(daily, "2027-01-09", "2027-01-10")).toBe("past");
    expect(bookingAvailability(daily, "2027-01-10", "2027-01-10")).toBe(
      "available",
    );
  });
});

describe("Panchangam-based poojas in the calendar", () => {
  const days = {
    "2027-01-19": day("2027-01-19", {
      panchang: withPanchang("Rohini"),
      panchangam: [{ slug: "pradosham", startTime: "17:00:00" }],
    }),
  };

  it("shows Panchangam poojas as named chips on larger screens and a distinct dot on mobile", () => {
    const { container } = render(
      <MonthCalendar
        {...calProps}
        year={2027}
        month={1}
        days={days}
        poojas={poojas}
      />,
    );
    const cell = container.querySelector('[data-date="2027-01-19"]')!;
    expect(cell.querySelector('[data-chip="panchangam"]')!.textContent).toBe(
      "Pradosham",
    );
    expect(cell.querySelector('[data-dot="panchangam"]')).not.toBeNull();
    expect(cell.querySelector('[data-dot="daily"]')).toBeNull();
    expect(cell.getAttribute("aria-label")).toMatch(/1 Panchangam pooja/);
    expect(cell.hasAttribute("data-auspicious")).toBe(true); // a Panchangam pooja marks the day
  });

  it("lists them in their own panel section with the approved amount and a booking link", () => {
    renderPanel({ date: "2027-01-19", day: days["2027-01-19"] });
    expect(screen.getByText(/Poojas for this day.s Panchangam/)).toBeTruthy();
    const row = document.querySelector(
      '[data-pooja="pradosham"]',
    ) as HTMLElement;
    expect(row.textContent).toContain("5:00 PM");
    expect(within(row).getByTestId("amount").textContent).toBe("₹300");
    expect(
      within(row)
        .getByRole("link", { name: "Book Pooja" })
        .getAttribute("href"),
    ).toBe("/poojas/regular/pradosham?date=2027-01-19");
  });

  it("never lets a Panchangam pooja be booked without a price", () => {
    const unpricedPanch = { ...pradosham, amount: null, bookable: false };
    render(
      <MemoryRouter>
        <DayPanel
          date="2027-01-19"
          today="2027-01-10"
          day={days["2027-01-19"]}
          poojas={{ pradosham: unpricedPanch }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("booking-soon").textContent).toBe(
      "Booking opens soon",
    );
    expect(screen.queryByRole("link", { name: "Book Pooja" })).toBeNull();
  });
});

describe("a priced pooja with no public page", () => {
  it("has no booking link; the panel says 'Booking opens soon'", () => {
    expect(bookingLink(pageless, "2027-01-14")).toBeNull();
    expect(bookingAvailability(pageless, "2027-01-14", "2027-01-10")).toBe(
      "no-price",
    );
    renderPanel({
      date: "2027-01-14",
      day: day("2027-01-14", {
        special: [{ slug: "no-such-page", startTime: null }],
      }),
    });
    const row = document.querySelector(
      '[data-pooja="no-such-page"]',
    ) as HTMLElement;
    expect(within(row).getByTestId("booking-soon").textContent).toBe(
      "Booking opens soon",
    );
    expect(within(row).queryByRole("link")).toBeNull();
  });
});

// ---- DayPanel ----------------------------------------------------------------
const renderPanel = (
  props: Partial<React.ComponentProps<typeof DayPanel>> & {
    date: string | null;
  },
) =>
  render(
    <MemoryRouter>
      <DayPanel today="2027-01-10" poojas={poojas} {...props} />
    </MemoryRouter>,
  );

describe("DayPanel", () => {
  const richDay = day("2027-01-14", {
    panchang: withPanchang("Rohini", ["Pradosham"]),
    recurring: [{ slug: "abhishekam", startTime: "06:00:00" }],
    special: [
      { slug: "homam", startTime: "10:00:00", notes: "Bring flowers" },
      { slug: "new-pooja", startTime: null },
    ],
  });

  it("shows the full date, nakshatram, tithi, labels, schedules and approved amounts", () => {
    renderPanel({ date: "2027-01-14", day: richDay });
    expect(screen.getByTestId("panel-date").textContent).toBe(
      "Thursday, 14 January 2027",
    );
    expect(screen.getByTestId("panel-nakshatra").textContent).toBe("Rohini");
    expect(screen.getByTestId("panel-tithi").textContent).toContain(
      "Trayodashi",
    );
    expect(screen.getByText("Pradosham")).toBeTruthy();
    const dailyRow = document.querySelector(
      '[data-pooja="abhishekam"]',
    ) as HTMLElement;
    expect(dailyRow.textContent).toContain("6:00 AM");
    expect(within(dailyRow).getByTestId("amount").textContent).toBe("₹100");
    expect(
      document.querySelector('[data-pooja="homam"]')!.textContent,
    ).toContain("₹1,500");
    expect(screen.getByText("Bring flowers")).toBeTruthy();
  });

  it("offers Book Pooja links with the selected date prefilled", () => {
    renderPanel({ date: "2027-01-14", day: richDay });
    const links = screen.getAllByRole("link", {
      name: "Book Pooja",
    }) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute("href")).sort()).toEqual([
      "/poojas/regular/abhishekam?date=2027-01-14",
      "/poojas/special/homam?date=2027-01-14",
    ]);
  });

  it("shows 'Booking opens soon' with no link for an unpriced pooja", () => {
    renderPanel({ date: "2027-01-14", day: richDay });
    const row = document.querySelector(
      '[data-pooja="new-pooja"]',
    ) as HTMLElement;
    expect(within(row).getByTestId("booking-soon").textContent).toBe(
      "Booking opens soon",
    );
    expect(within(row).queryByRole("link")).toBeNull();
    expect(row.textContent).not.toMatch(/₹/);
  });

  it("does not offer booking for dates that have passed", () => {
    renderPanel({
      date: "2027-01-05",
      day: day("2027-01-05", {
        recurring: [{ slug: "abhishekam", startTime: null }],
      }),
    });
    expect(screen.queryByRole("link", { name: "Book Pooja" })).toBeNull();
    expect(screen.getByText("Date has passed")).toBeTruthy();
  });

  it("handles missing Panchangam gracefully", () => {
    renderPanel({ date: "2027-01-14", day: day("2027-01-14") });
    expect(screen.getByTestId("panel-nakshatra").textContent).toBe(
      "Not yet available",
    );
    expect(screen.queryByTestId("panel-tithi")).toBeNull();
  });

  it("shows helpful empty states instead of invented events", () => {
    const { unmount } = renderPanel({
      date: "2027-01-14",
      day: day("2027-01-14"),
      hasScheduledPoojas: true,
    });
    expect(screen.getByTestId("panel-empty").textContent).toBe(
      "No poojas are scheduled on this date.",
    );
    unmount();
    renderPanel({
      date: "2027-01-14",
      day: day("2027-01-14"),
      hasScheduledPoojas: false,
    });
    expect(screen.getByTestId("panel-empty").textContent).toMatch(
      /schedule for this month is being prepared/,
    );
  });

  it("prompts for a selection, and reports a load failure", () => {
    const { unmount } = renderPanel({ date: null });
    expect(
      screen.getByText(/Select a date to see its nakshatram/),
    ).toBeTruthy();
    unmount();
    renderPanel({ date: "2027-01-14", error: true });
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
  });
});

// ---- HomeCalendar (container: fetching, selection, navigation, errors) ---------
function monthResponse(
  year: number,
  month: number,
  over: Partial<CalendarMonthResponse> = {},
): CalendarMonthResponse {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array.from({ length: n }, (_, i) => {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return day(date, {
      panchang: withPanchang(i % 2 ? "Hasta" : "Rohini"),
      recurring: [{ slug: "abhishekam", startTime: "06:00:00" }],
      special: date.endsWith("-20") ? [{ slug: "homam", startTime: null }] : [],
    });
  });
  return {
    ok: true,
    year,
    month,
    days,
    poojas: { abhishekam: daily, homam: special },
    hasScheduledPoojas: true,
    panchangPending: 0,
    degraded: false,
    ...over,
  };
}

function renderHome(fetchImpl: (url: string) => Promise<Response>) {
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HomeCalendar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const monthFrom = (url: string) => {
  const q = new URL(url, "http://x").searchParams;
  return monthResponse(Number(q.get("year")), Number(q.get("month")));
};

describe("HomeCalendar", () => {
  beforeEach(() => {
    // Freeze only the clock so promises/timers still run. 15 Dec 2026, 10:00 IST.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-15T04:30:00Z"));
  });

  it("renders the month grid immediately without waiting for data", () => {
    renderHome(() => new Promise(() => {})); // request never resolves
    expect(screen.getByTestId("calendar-title").textContent).toBe(
      "December 2026",
    );
    expect(document.querySelectorAll("button[data-date]")).toHaveLength(31);
    expect(screen.getByTestId("panel-date").textContent).toBe(
      "Tuesday, 15 December 2026",
    ); // today preselected
  });

  it("fetches one month, fills nakshatram, and updates the panel when a date is selected", async () => {
    const fetchMock = renderHome(async (u) => ok(monthFrom(u)));
    await waitFor(() =>
      expect(screen.getByTestId("panel-nakshatra").textContent).toBe("Rohini"),
    ); // 15th is odd index 14 -> Rohini? see below
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/temple-calendar?year=2026&month=12",
    );
    fireEvent.click(document.querySelector('[data-date="2026-12-20"]')!);
    expect(screen.getByTestId("panel-date").textContent).toBe(
      "Sunday, 20 December 2026",
    );
    expect(
      within(screen.getByTestId("day-panel")).getByText("Maha Homam"),
    ).toBeTruthy();
    const hrefs = screen
      .getAllByRole("link", { name: "Book Pooja" })
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/poojas/special/homam?date=2026-12-20");
    expect(hrefs).toContain("/poojas/regular/abhishekam?date=2026-12-20");
  });

  it("navigates across the year boundary and requests the new month once", async () => {
    const fetchMock = renderHome(async (u) => ok(monthFrom(u)));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText("Next month"));
    expect(screen.getByTestId("calendar-title").textContent).toBe(
      "January 2027",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/temple-calendar?year=2027&month=1",
    );
    expect(
      screen.getByText(/Select a date to see its nakshatram/),
    ).toBeTruthy(); // selection resets outside the current month
    fireEvent.click(screen.getByText("Go to today"));
    expect(screen.getByTestId("calendar-title").textContent).toBe(
      "December 2026",
    );
  });

  it("limits navigation to 12 months either way", async () => {
    renderHome(async (u) => ok(monthFrom(u)));
    for (let i = 0; i < 12; i++)
      fireEvent.click(screen.getByLabelText("Next month"));
    expect(screen.getByTestId("calendar-title").textContent).toBe(
      "December 2027",
    );
    expect(
      (screen.getByLabelText("Next month") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps the calendar usable and offers a retry when the API fails", async () => {
    let fail = true;
    const fetchMock = renderHome(async (u) =>
      fail ? new Response("{}", { status: 500 }) : ok(monthFrom(u)),
    );
    await waitFor(
      () =>
        expect(screen.getByRole("alert").textContent).toMatch(
          /could not be loaded/,
        ),
      { timeout: 4000 }, // the query retries once (1s back-off) before failing
    );
    expect(document.querySelectorAll("button[data-date]")).toHaveLength(31); // grid still there
    expect(screen.queryByRole("link", { name: "Book Pooja" })).toBeNull(); // nothing fabricated
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Abhishekam")).toBeTruthy());
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("shows an empty state when the schedule has not been seeded", async () => {
    renderHome(async (u) => {
      const m = monthFrom(u);
      return ok({
        ...m,
        poojas: {},
        hasScheduledPoojas: false,
        days: m.days.map((d) => ({ ...d, recurring: [], special: [] })),
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId("panel-empty").textContent).toMatch(
        /being prepared/,
      ),
    );
  });

  it("notes when Panchangam details are degraded", async () => {
    renderHome(async (u) => ok({ ...monthFrom(u), degraded: true }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /temporarily unavailable/,
      ),
    );
  });
});

// ---- Festival-day poojas -----------------------------------------------------------
describe("festival poojas in the calendar", () => {
  const SLUG = "festival-diwali-lakshmi-pooja-20270114";
  const fest: CalendarPooja = {
    slug: SLUG,
    name: "Lakshmi Pooja",
    type: "festival",
    festivalName: "Diwali",
    amount: 1501,
    destination: `/poojas/festival/${SLUG}`,
    bookable: true,
    closedReason: null,
  };
  const withFest = (p: Partial<CalendarPooja> = {}) => ({
    ...poojas,
    [SLUG]: { ...fest, ...p },
  });
  const festDay = day("2027-01-14", {
    festival: [{ slug: SLUG, startTime: "18:00:00" }],
  });

  it("shows the festival name, pooja name, time and its own fixed price", () => {
    renderPanel({
      date: "2027-01-14",
      day: festDay,
      poojas: withFest(),
    });
    const section = screen.getByTestId("festival-section");
    expect(within(section).getByText("Festival poojas")).toBeTruthy();
    const row = document.querySelector(`[data-pooja="${SLUG}"]`) as HTMLElement;
    expect(within(row).getByTestId("festival-name").textContent).toBe("Diwali");
    expect(row.textContent).toContain("Lakshmi Pooja");
    expect(row.textContent).toContain("6:00 PM");
    expect(within(row).getByTestId("amount").textContent).toBe("₹1,501");
  });

  it("Book Pooja opens the festival's own booking page with the date", () => {
    renderPanel({ date: "2027-01-14", day: festDay, poojas: withFest() });
    const link = screen.getByRole("link", {
      name: "Book Pooja",
    }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/poojas/festival/${SLUG}?date=2027-01-14`,
    );
  });

  it.each([
    ["not_open_yet", "Booking not open yet"],
    ["closed", "Booking closed"],
    ["full", "Fully booked"],
  ] as const)("when %s: no booking link, and it says why", (reason, text) => {
    renderPanel({
      date: "2027-01-14",
      day: festDay,
      poojas: withFest({ bookable: false, closedReason: reason }),
    });
    const row = document.querySelector(`[data-pooja="${SLUG}"]`) as HTMLElement;
    expect(within(row).getByTestId("booking-closed").textContent).toBe(text);
    expect(within(row).queryByRole("link")).toBeNull();
  });

  it("an offering with no approved price is shown without a link", () => {
    renderPanel({
      date: "2027-01-14",
      day: festDay,
      poojas: withFest({ amount: null, bookable: false }),
    });
    const row = document.querySelector(`[data-pooja="${SLUG}"]`) as HTMLElement;
    expect(within(row).getByTestId("booking-soon")).toBeTruthy();
    expect(within(row).queryByRole("link")).toBeNull();
  });

  it("is not offered for a date that has passed", () => {
    renderPanel({
      date: "2027-01-14",
      day: festDay,
      poojas: withFest(),
      today: "2027-01-20",
    });
    expect(screen.queryByRole("link", { name: "Book Pooja" })).toBeNull();
    expect(screen.getByText("Date has passed")).toBeTruthy();
  });

  it("a day with only a festival pooja is not 'empty'", () => {
    renderPanel({ date: "2027-01-14", day: festDay, poojas: withFest() });
    expect(screen.queryByTestId("panel-empty")).toBeNull();
  });

  it("the month grid marks the date with a festival dot and names it in the chip and label", () => {
    render(
      <MemoryRouter>
        <MonthCalendar
          {...calProps}
          year={2027}
          month={1}
          days={{ "2027-01-14": festDay }}
          poojas={withFest()}
        />
      </MemoryRouter>,
    );
    const cell = document.querySelector('[data-date="2027-01-14"]')!;
    expect(cell.querySelector('[data-dot="festival"]')).toBeTruthy();
    expect(cell.querySelector('[data-chip="festival"]')!.textContent).toBe(
      "Diwali: Lakshmi Pooja",
    );
    expect(cell.getAttribute("aria-label")).toContain("1 festival pooja");
    expect(cell.getAttribute("data-auspicious")).toBe("true");
  });
});
