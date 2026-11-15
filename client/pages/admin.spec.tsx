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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedActions, type BookingAction } from "@shared/admin";

// ---- fake Supabase auth (browser) -------------------------------------------------
const auth = vi.hoisted(() => {
  const s: any = {
    configured: true,
    session: null as any,
    listeners: [] as ((e: string, session: any) => void)[],
    signInError: null as any,
    signOut: undefined as any,
    signIn: undefined as any,
  };
  const emit = (e: string) => s.listeners.forEach((l: any) => l(e, s.session));
  s.signIn = vi.fn(async () => {
    if (s.signInError) return { error: s.signInError };
    s.session = {
      access_token: "tok-" + "x".repeat(30),
      user: { id: "u1", email: "admin@example.com" },
    };
    emit("SIGNED_IN");
    return { error: null };
  });
  s.signOut = vi.fn(async () => {
    s.session = null;
    emit("SIGNED_OUT");
    return { error: null };
  });
  s.emit = emit;
  return s;
});

vi.mock("@/lib/supabaseClient", () => ({
  get authConfigured() {
    return auth.configured;
  },
  get supabase() {
    return auth.configured
      ? {
          auth: {
            getSession: async () => ({ data: { session: auth.session } }),
            onAuthStateChange: (cb: any) => {
              auth.listeners.push(cb);
              return {
                data: {
                  subscription: {
                    unsubscribe: () =>
                      (auth.listeners = auth.listeners.filter(
                        (l: any) => l !== cb,
                      )),
                  },
                },
              };
            },
            signInWithPassword: auth.signIn,
            signOut: auth.signOut,
          },
        }
      : null;
  },
}));

const { default: Admin } = await import("./Admin");

// ---- fake admin API ---------------------------------------------------------------
const stats = {
  totalBookings: 42,
  awaitingVerification: 5,
  confirmed: 11,
  upcomingSpecialPoojas: 3,
  activeRecurringRules: 2,
  nextSpecialPoojas: [
    {
      id: "s1",
      date: "2099-01-14",
      poojaName: "Homam",
      startTime: "10:00",
      liveBookings: 2,
    },
  ],
};
const row = (n: number, over: any = {}) => ({
  id: `b${n}`,
  orderNo: `SKD-261115-A1B2C${n}`,
  devotee: `Devotee ${n}`,
  phone: `98765432${n}0`,
  poojaName: "Pradosham",
  date: "2099-01-10",
  amount: 500,
  upiRef: `UTR00000000${n}`,
  paymentStatus: "awaiting_verification",
  status: "pending",
  createdAt: "2026-11-15T10:00:00Z",
  ...over,
});
const detail = (over: any = {}) => {
  const base = {
    ...row(1),
    email: "d@example.com",
    nakshatra: "Rohini",
    gotra: "Kashyapa",
    sankalpam: "Peace",
    paymentSubmittedAt: "2026-11-15T10:05:00Z",
    paymentVerifiedAt: null,
    updatedAt: "2026-11-15T10:05:00Z",
    history: [],
    ...over,
  };
  return {
    ...base,
    allowedActions: allowedActions(base.status, base.paymentStatus),
  };
};

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
let handlers: Record<string, Handler> = {};
let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function installFetch() {
  fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, "http://localhost");
    const key = `${init.method ?? "GET"} ${url.pathname}`;
    const h = handlers[key];
    return h
      ? h(url, init)
      : json({ ok: false, code: "NOT_FOUND", error: "nf" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
}
const calls = (key: string) =>
  fetchMock.mock.calls.filter(
    ([u, i]) =>
      `${(i as any)?.method ?? "GET"} ${new URL(u, "http://localhost").pathname}` ===
      key,
  );
const bodyOf = (c: any[]) => JSON.parse(c[1].body);

function baseHandlers(): Record<string, Handler> {
  return {
    "GET /api/admin/me": () =>
      json({ ok: true, admin: { id: "u1", email: "admin@example.com" } }),
    "GET /api/admin/stats": () => json({ ok: true, stats }),
    "GET /api/admin/bookings": (u) => {
      const page = Number(u.searchParams.get("page") ?? 1);
      return json({
        ok: true,
        items: [row(page * 2 - 1), row(page * 2)],
        page,
        pageSize: 20,
        total: 45,
        totalPages: 3,
      });
    },
    "GET /api/admin/poojas": () =>
      json({
        ok: true,
        poojas: [
          {
            id: "p1",
            slug: "lord-shiva",
            name: "Lord Shiva",
            type: "special",
            amount: 1500,
            active: true,
            destination: "/poojas/special/lord-shiva",
            scheduleCount: 2,
          },
          {
            id: "p2",
            slug: "new-pooja",
            name: "New Pooja",
            type: "special",
            amount: null,
            active: true,
            destination: "/poojas/special/new-pooja",
            scheduleCount: 0,
          },
          {
            id: "p3",
            slug: "pradosham",
            name: "Pradosham",
            type: "panchangam",
            amount: 300,
            active: true,
            destination: "/poojas/regular/pradosham",
            scheduleCount: 1,
          },
          {
            id: "p4",
            slug: "no-such-page",
            name: "Pageless Pooja",
            type: "special",
            amount: 900,
            active: true,
            destination: null,
            scheduleCount: 0,
          },
        ],
      }),
    "GET /api/admin/panchangam-rules": () =>
      json({
        ok: true,
        rules: [
          {
            id: "pr1",
            poojaId: "p3",
            poojaName: "Pradosham",
            tithis: ["trayodashi"],
            paksha: null,
            nakshatras: [],
            startTime: "17:00",
            notes: null,
            active: true,
          },
          {
            id: "pr2",
            poojaId: "p5",
            poojaName: "Sankata Hara Chaturthi",
            tithis: ["chaturthi"],
            paksha: "krishna",
            nakshatras: [],
            startTime: "10:30",
            notes: null,
            active: true,
          },
          {
            id: "pr3",
            poojaId: "p6",
            poojaName: "Uthiram",
            tithis: [],
            paksha: null,
            nakshatras: ["uttara_phalguni"],
            startTime: null,
            notes: null,
            active: false,
          },
        ],
      }),
    "GET /api/admin/schedule-audit": () =>
      json({
        ok: true,
        entries: [
          {
            id: "e1",
            table: "special_pooja_schedule",
            action: "update",
            poojaName: "Lord Shiva",
            adminEmail: "admin@example.com",
            oldValues: { id: "s1", date: "2099-01-14", start_time: "10:00:00" },
            newValues: { id: "s1", date: "2099-01-20", start_time: "10:00:00" },
            reason: "Festival date changed",
            affectedHandling: "move",
            affectedBookings: ["SKD-A", "SKD-B"],
            createdAt: "2026-11-15T12:00:00Z",
          },
          {
            id: "e2",
            table: "panchangam_pooja_rules",
            action: "update",
            poojaName: "Uthiram",
            adminEmail: null,
            oldValues: { active: true },
            newValues: { active: false },
            reason: null,
            affectedHandling: null,
            affectedBookings: null,
            createdAt: "2026-11-14T08:00:00Z",
          },
        ],
      }),
    "GET /api/admin/recurring-schedules": () =>
      json({
        ok: true,
        rules: [
          {
            id: "r1",
            poojaId: "p3",
            poojaName: "Abhishekam",
            recurrence: "weekly",
            weekday: 6,
            startTime: "06:30",
            active: true,
          },
        ],
      }),
    "GET /api/admin/special-schedules": () =>
      json({
        ok: true,
        dates: [
          {
            id: "s1",
            poojaId: "p1",
            poojaName: "Lord Shiva",
            date: "2099-01-14",
            startTime: "10:00",
            notes: "Bring flowers",
            active: true,
            liveBookings: 2,
          },
        ],
      }),
  };
}

function renderAdmin() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Admin />
    </QueryClientProvider>,
  );
}
const signedIn = () =>
  (auth.session = {
    access_token: "tok-" + "x".repeat(30),
    user: { id: "u1", email: "admin@example.com" },
  });
const openTab = (name: string) =>
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

beforeEach(() => {
  auth.configured = true;
  auth.session = null;
  auth.listeners = [];
  auth.signInError = null;
  auth.signIn.mockClear();
  auth.signOut.mockClear();
  handlers = baseHandlers();
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---- authentication ------------------------------------------------------------------
describe("/admin access", () => {
  it("shows a sign-in form, and makes no admin API calls, when signed out", async () => {
    renderAdmin();
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains when sign-in is not configured instead of showing a broken form", async () => {
    auth.configured = false;
    renderAdmin();
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /not configured/,
    );
  });

  it("gives a generic message for a wrong password (no account hints)", async () => {
    auth.signInError = { message: "Invalid login credentials" };
    renderAdmin();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "x@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Invalid email or password.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs in, then asks the SERVER who this is (with the session token) before showing anything", async () => {
    renderAdmin();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText(/Signed in as admin@example.com/);
    const [, init] = calls("GET /api/admin/me")[0];
    expect((init as any).headers.Authorization).toMatch(/^Bearer tok-/);
  });

  it("does not show the console to a signed-in account the server says is not an admin", async () => {
    signedIn();
    handlers["GET /api/admin/me"] = () =>
      json({ ok: false, code: "FORBIDDEN", error: "no" }, 403);
    renderAdmin();
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /not authorised/,
    );
    expect(screen.queryByRole("tab", { name: "Bookings" })).toBeNull();
    expect(calls("GET /api/admin/stats")).toHaveLength(0);
    expect(calls("GET /api/admin/bookings")).toHaveLength(0);
  });

  it("ignores any client-side flag: access follows the server answer only", async () => {
    signedIn();
    localStorage.setItem("role", "admin");
    handlers["GET /api/admin/me"] = () =>
      json({ ok: false, code: "FORBIDDEN", error: "no" }, 403);
    renderAdmin();
    await screen.findByText(/not authorised/);
    localStorage.clear();
  });

  it("signs out and shows 'session ended' when the API reports an expired session", async () => {
    signedIn();
    renderAdmin();
    await screen.findByText(/Signed in as/);
    handlers["GET /api/admin/bookings"] = () =>
      json({ ok: false, code: "SESSION_EXPIRED", error: "expired" }, 401);
    openTab("Bookings");
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect((await screen.findByRole("status")).textContent).toMatch(
      /session has ended/i,
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("signs out on request", async () => {
    signedIn();
    renderAdmin();
    await screen.findByText(/Signed in as/);
    fireEvent.click(screen.getByRole("button", { name: /Sign out/ }));
    await screen.findByRole("button", { name: "Sign in" });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("asks search engines not to index the page", async () => {
    renderAdmin();
    await screen.findByRole("button", { name: "Sign in" });
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toMatch(/noindex/);
  });
});

// ---- dashboard -------------------------------------------------------------------------
describe("dashboard", () => {
  it("shows the real counts from the API", async () => {
    signedIn();
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByTestId("stat-total").textContent).toBe("42"),
    );
    expect(screen.getByTestId("stat-awaiting").textContent).toBe("5");
    expect(screen.getByTestId("stat-confirmed").textContent).toBe("11");
    expect(screen.getByTestId("stat-upcoming").textContent).toBe("3");
    expect(screen.getByText("Homam")).toBeTruthy();
    expect(screen.getByText("2 bookings")).toBeTruthy();
  });

  it("links straight to the bookings awaiting verification", async () => {
    signedIn();
    renderAdmin();
    fireEvent.click(
      await screen.findByText(/Review payments awaiting verification/),
    );
    await waitFor(() =>
      expect(calls("GET /api/admin/bookings").length).toBeGreaterThan(0),
    );
    expect(calls("GET /api/admin/bookings")[0][0]).toContain(
      "paymentStatus=awaiting_verification",
    );
  });

  it("shows an empty state, not invented numbers, when nothing is scheduled", async () => {
    signedIn();
    handlers["GET /api/admin/stats"] = () =>
      json({
        ok: true,
        stats: {
          ...stats,
          totalBookings: 0,
          awaitingVerification: 0,
          nextSpecialPoojas: [],
        },
      });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByTestId("stat-total").textContent).toBe("0"),
    );
    expect(screen.getByTestId("no-upcoming")).toBeTruthy();
  });

  it("reports an error with retry when stats fail", async () => {
    signedIn();
    handlers["GET /api/admin/stats"] = () =>
      json({ ok: false, code: "SERVER_ERROR", error: "x" }, 500);
    renderAdmin();
    expect(
      (await screen.findByText(/Could not load the dashboard/)).textContent,
    ).toBeTruthy();
  });
});

// ---- bookings table: search, filter, paginate ------------------------------------------------
describe("bookings table", () => {
  async function openBookings() {
    signedIn();
    renderAdmin();
    await screen.findByText(/Signed in as/);
    openTab("Bookings");
    await waitFor(() =>
      expect(screen.getAllByTestId("booking-row")).toHaveLength(2),
    );
  }

  it("lists the required columns", async () => {
    await openBookings();
    for (const h of [
      "Order no.",
      "Devotee",
      "Phone",
      "Pooja",
      "Date",
      "Amount",
      "UPI reference",
      "Payment",
      "Booking",
    ]) {
      expect(screen.getByRole("columnheader", { name: h })).toBeTruthy();
    }
    const first = screen.getAllByTestId("booking-row")[0];
    expect(first.textContent).toContain("SKD-261115-A1B2C1");
    expect(first.textContent).toContain("UTR000000001");
    expect(first.textContent).toContain("₹500");
    expect(first.textContent).toContain("Awaiting verification");
    expect(screen.getByTestId("booking-count").textContent).toContain(
      "45 bookings · page 1 of 3",
    );
  });

  it("paginates through the API", async () => {
    await openBookings();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getAllByTestId("booking-row")[0].textContent).toContain(
        "SKD-261115-A1B2C3",
      ),
    );
    expect(
      calls("GET /api/admin/bookings").some(([u]) =>
        String(u).includes("page=2"),
      ),
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("searches server-side after a short pause, returning to page 1", async () => {
    await openBookings();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByTestId("booking-count").textContent).toContain(
        "page 2",
      ),
    );
    fireEvent.change(screen.getByLabelText("Search bookings"), {
      target: { value: "UTR000000007" },
    });
    await waitFor(() =>
      expect(
        calls("GET /api/admin/bookings").some(([u]) =>
          String(u).includes("q=UTR000000007"),
        ),
      ).toBe(true),
    );
    const last = (() => {
      const all = calls("GET /api/admin/bookings");
      return all[all.length - 1][0];
    })() as string;
    expect(last).toContain("page=1");
  });

  it("filters by payment status and booking status", async () => {
    await openBookings();
    fireEvent.change(screen.getByLabelText("Filter by payment status"), {
      target: { value: "verified" },
    });
    fireEvent.change(screen.getByLabelText("Filter by booking status"), {
      target: { value: "confirmed" },
    });
    await waitFor(() => {
      const u = String(
        (() => {
          const all = calls("GET /api/admin/bookings");
          return all[all.length - 1][0];
        })(),
      );
      expect(u).toContain("paymentStatus=verified");
      expect(u).toContain("status=confirmed");
    });
  });

  it("shows an empty state", async () => {
    handlers["GET /api/admin/bookings"] = () =>
      json({
        ok: true,
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      });
    signedIn();
    renderAdmin();
    await screen.findByText(/Signed in as/);
    openTab("Bookings");
    expect((await screen.findByTestId("no-bookings")).textContent).toBe(
      "No bookings found.",
    );
  });
});

// ---- booking detail & actions ---------------------------------------------------------------
describe("booking actions", () => {
  let current: any;
  async function openDetail(over: any = {}) {
    current = detail(over);
    handlers["GET /api/admin/bookings/b1"] = () =>
      json({ ok: true, booking: current });
    signedIn();
    renderAdmin();
    await screen.findByText(/Signed in as/);
    openTab("Bookings");
    fireEvent.click((await screen.findAllByText("SKD-261115-A1B2C1"))[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await dialog.findByTestId("detail-upi-ref"); // wait for the detail to load
    return dialog;
  }
  const respondWith = (over: any) => {
    handlers["POST /api/admin/bookings/b1/actions"] = () => {
      current = detail({ ...current, ...over });
      return json({ ok: true, booking: current });
    };
  };

  it("shows the devotee details and the UPI reference to verify", async () => {
    const d = await openDetail();
    expect(d.getByTestId("detail-upi-ref").textContent).toBe("UTR000000001");
    expect(d.getByText("d@example.com")).toBeTruthy();
    expect(d.getByText("Peace")).toBeTruthy();
    expect(d.getByTestId("no-history")).toBeTruthy();
  });

  it("offers only the actions valid for the state", async () => {
    const awaiting = await openDetail();
    for (const name of [
      "Verify payment",
      "Reject payment",
      "Cancel booking",
      "Add note",
    ]) {
      expect(awaiting.getByRole("button", { name })).toBeTruthy();
    }
    expect(
      awaiting.queryByRole("button", { name: "Confirm booking" }),
    ).toBeNull();
    cleanup();

    const cancelled = await openDetail({
      status: "cancelled",
      paymentStatus: "rejected",
    });
    for (const name of [
      "Verify payment",
      "Reject payment",
      "Confirm booking",
      "Cancel booking",
    ]) {
      expect(cancelled.queryByRole("button", { name })).toBeNull();
    }
    expect(cancelled.getByRole("button", { name: "Add note" })).toBeTruthy();
  });

  it("verifying needs an explicit confirmation, then posts exactly one action", async () => {
    const d = await openDetail();
    respondWith({ paymentStatus: "verified" });
    fireEvent.click(d.getByRole("button", { name: "Verify payment" }));
    expect(
      d.getByRole("group", { name: "Confirm action" }).textContent,
    ).toContain("Verify ₹500 paid with reference UTR000000001?");
    expect(calls("POST /api/admin/bookings/b1/actions")).toHaveLength(0); // nothing sent yet
    const yes = d.getByRole("button", { name: /Yes, verify payment/ });
    fireEvent.click(yes);
    fireEvent.click(yes); // double click
    await waitFor(() =>
      expect(d.getByRole("button", { name: "Confirm booking" })).toBeTruthy(),
    );
    const posts = calls("POST /api/admin/bookings/b1/actions");
    expect(posts).toHaveLength(1);
    expect(bodyOf(posts[0])).toEqual({ action: "verify_payment" });
    expect(d.queryByRole("button", { name: "Verify payment" })).toBeNull(); // cannot verify twice
  });

  it("will not reject or cancel without a written reason, then sends it", async () => {
    const d = await openDetail();
    for (const name of ["Reject payment", "Cancel booking", "Add note"]) {
      expect(
        (d.getByRole("button", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
    fireEvent.change(d.getByLabelText(/Internal note/), {
      target: { value: "Reference not in bank statement" },
    });
    respondWith({ paymentStatus: "rejected" });
    fireEvent.click(d.getByRole("button", { name: "Reject payment" }));
    fireEvent.click(d.getByRole("button", { name: /Yes, reject payment/ }));
    await waitFor(() =>
      expect(calls("POST /api/admin/bookings/b1/actions")).toHaveLength(1),
    );
    expect(bodyOf(calls("POST /api/admin/bookings/b1/actions")[0])).toEqual({
      action: "reject_payment",
      note: "Reference not in bank statement",
    });
  });

  it("confirms a booking once its payment is verified", async () => {
    const d = await openDetail({ paymentStatus: "verified" });
    respondWith({ status: "confirmed" });
    fireEvent.click(d.getByRole("button", { name: "Confirm booking" }));
    fireEvent.click(d.getByRole("button", { name: /Yes, confirm booking/ }));
    await waitFor(() =>
      expect(
        bodyOf(calls("POST /api/admin/bookings/b1/actions")[0]).action,
      ).toBe("confirm_booking"),
    );
    await waitFor(() =>
      expect(d.queryByRole("button", { name: "Confirm booking" })).toBeNull(),
    );
  });

  it("adds an internal note and shows it in the history with the admin's identity", async () => {
    const d = await openDetail();
    respondWith({
      history: [
        {
          id: "h1",
          action: "add_note",
          adminEmail: "admin@example.com",
          fromStatus: "pending",
          toStatus: "pending",
          fromPaymentStatus: "awaiting_verification",
          toPaymentStatus: "awaiting_verification",
          note: "Called the devotee",
          createdAt: "2026-11-15T11:00:00Z",
        },
      ],
    });
    fireEvent.change(d.getByLabelText(/Internal note/), {
      target: { value: "Called the devotee" },
    });
    fireEvent.click(d.getByRole("button", { name: "Add note" }));
    const item = await d.findByTestId("history-item");
    expect(item.textContent).toContain("Called the devotee");
    expect(item.textContent).toContain("admin@example.com");
  });

  it("shows the server's message and reloads when the state changed underneath (invalid transition)", async () => {
    const d = await openDetail();
    handlers["POST /api/admin/bookings/b1/actions"] = () =>
      json(
        {
          ok: false,
          code: "INVALID_TRANSITION",
          error:
            "That action is not allowed for the booking's current state. Reload to see its latest status.",
        },
        409,
      );
    const before = calls("GET /api/admin/bookings/b1").length;
    fireEvent.click(d.getByRole("button", { name: "Verify payment" }));
    fireEvent.click(d.getByRole("button", { name: /Yes, verify payment/ }));
    expect((await d.findByRole("alert")).textContent).toMatch(/not allowed/);
    await waitFor(() =>
      expect(calls("GET /api/admin/bookings/b1").length).toBeGreaterThan(
        before,
      ),
    );
  });

  it("shows a generic message for server errors", async () => {
    const d = await openDetail();
    handlers["POST /api/admin/bookings/b1/actions"] = () =>
      json(
        {
          ok: false,
          code: "SERVER_ERROR",
          error: "Something went wrong. Please try again.",
        },
        500,
      );
    fireEvent.click(d.getByRole("button", { name: "Verify payment" }));
    fireEvent.click(d.getByRole("button", { name: /Yes, verify payment/ }));
    expect((await d.findByRole("alert")).textContent).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("shows bookings moved or cancelled by a schedule change in the history, with the reason", async () => {
    const entry = (id: string, action: string, note: string) => ({
      id,
      action,
      adminEmail: "admin@example.com",
      fromStatus: "pending",
      toStatus: action === "schedule_cancel" ? "cancelled" : "pending",
      fromPaymentStatus: "verified",
      toPaymentStatus: "verified",
      note,
      createdAt: "2026-11-15T11:00:00Z",
    });
    const d = await openDetail({
      history: [
        entry(
          "h2",
          "schedule_move",
          "Moved from 2099-01-14 to 2099-01-20: Festival date changed",
        ),
        entry(
          "h1",
          "schedule_cancel",
          "Schedule change: Pooja cancelled this month",
        ),
      ],
    });
    const items = await d.findAllByTestId("history-item");
    expect(items[0].textContent).toContain("Moved by a schedule change");
    expect(items[0].textContent).toContain("Festival date changed");
    expect(items[1].textContent).toContain("Cancelled by a schedule change");
    expect(items[1].textContent).toContain("admin@example.com");
  });

  it("never auto-verifies: opening or viewing a booking sends no write", async () => {
    await openDetail();
    expect(
      fetchMock.mock.calls.filter(([, i]) =>
        ["POST", "PATCH", "PUT", "DELETE"].includes((i as any)?.method),
      ),
    ).toHaveLength(0);
  });
});

// ---- schedules -----------------------------------------------------------------------------------
describe("pooja catalogue, prices and schedules", () => {
  async function openSchedules() {
    signedIn();
    renderAdmin();
    await screen.findByText(/Signed in as/);
    openTab("Poojas & schedules");
    await screen.findAllByTestId("special-row");
  }
  const affected409 = (n = 2) =>
    json(
      {
        ok: false,
        code: "AFFECTED_BOOKINGS",
        error: "affected",
        liveBookings: n,
        orders: ["SKD-A", "SKD-B"].slice(0, n),
      },
      409,
    );

  // ---- catalogue and prices -------------------------------------------------------------
  describe("catalogue and fixed prices", () => {
    it("shows each pooja's approved amount, type, and whether booking is open", async () => {
      await openSchedules();
      const rows = await screen.findAllByTestId("pooja-row");
      expect(rows.map((r) => r.textContent)).toEqual([
        expect.stringMatching(/Lord Shiva.*Special.*₹1,500.*Open/),
        expect.stringMatching(/New Pooja.*Special.*Not approved.*Closed/),
        expect.stringMatching(/Pradosham.*Panchangam.*₹300.*Open/),
        expect.stringMatching(/Pageless Pooja.*No public page.*₹900.*Closed/), // priced, but no page: closed
      ]);
      expect(within(rows[3]).getByTestId("no-page")).toBeTruthy();
    });

    it("sets a price only with a valid amount and a reason, sending exactly one request", async () => {
      await openSchedules();
      handlers["POST /api/admin/poojas/p2/price"] = () =>
        json({ ok: true, oldAmount: null, newAmount: 501 });
      fireEvent.click(
        within((await screen.findAllByTestId("pooja-row"))[1]).getByRole(
          "button",
          { name: "Set amount" },
        ),
      );
      const dlg = within(await screen.findByRole("dialog"));
      const save = dlg.getByRole("button", {
        name: "Save amount",
      }) as HTMLButtonElement;
      expect(save.disabled).toBe(true); // nothing entered
      for (const bad of ["abc", "0", "-5", "10.123", "1000001", ""]) {
        fireEvent.change(dlg.getByLabelText("New amount (₹)"), {
          target: { value: bad },
        });
        fireEvent.change(dlg.getByLabelText(/Reason/), {
          target: { value: "Approved by trustees" },
        });
        expect([bad, save.disabled]).toEqual([bad, true]);
      }
      fireEvent.change(dlg.getByLabelText("New amount (₹)"), {
        target: { value: "501" },
      });
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "ab" },
      });
      expect(save.disabled).toBe(true); // reason too short
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Approved by trustees" },
      });
      expect(save.disabled).toBe(false);
      fireEvent.click(save);
      fireEvent.click(save); // double click
      await waitFor(() =>
        expect(calls("POST /api/admin/poojas/p2/price")).toHaveLength(1),
      );
      expect(bodyOf(calls("POST /api/admin/poojas/p2/price")[0])).toEqual({
        amount: 501,
        reason: "Approved by trustees",
      });
    });

    it("accepts paise (two decimals) and sends a number, never a string", async () => {
      await openSchedules();
      handlers["POST /api/admin/poojas/p2/price"] = () =>
        json({ ok: true, oldAmount: null, newAmount: 1250.5 });
      fireEvent.click(
        within((await screen.findAllByTestId("pooja-row"))[1]).getByRole(
          "button",
          { name: "Set amount" },
        ),
      );
      const dlg = within(await screen.findByRole("dialog"));
      fireEvent.change(dlg.getByLabelText("New amount (₹)"), {
        target: { value: "1250.50" },
      });
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Revised rate" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Save amount" }));
      await waitFor(() =>
        expect(calls("POST /api/admin/poojas/p2/price")).toHaveLength(1),
      );
      expect(bodyOf(calls("POST /api/admin/poojas/p2/price")[0]).amount).toBe(
        1250.5,
      );
    });

    it("can withdraw an approved price (closing booking) with a reason", async () => {
      await openSchedules();
      handlers["POST /api/admin/poojas/p1/price"] = () =>
        json({ ok: true, oldAmount: 1500, newAmount: null });
      fireEvent.click(
        within((await screen.findAllByTestId("pooja-row"))[0]).getByRole(
          "button",
          { name: "Change amount" },
        ),
      );
      const dlg = within(await screen.findByRole("dialog"));
      fireEvent.click(dlg.getByLabelText(/Withdraw the price/));
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Re-approval pending" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Withdraw price" }));
      await waitFor(() =>
        expect(calls("POST /api/admin/poojas/p1/price")).toHaveLength(1),
      );
      expect(bodyOf(calls("POST /api/admin/poojas/p1/price")[0])).toEqual({
        amount: null,
        reason: "Re-approval pending",
      });
    });

    it("shows the server's message when a price change is refused", async () => {
      await openSchedules();
      handlers["POST /api/admin/poojas/p2/price"] = () =>
        json(
          {
            ok: false,
            code: "FORBIDDEN",
            error: "This account is not authorised for temple administration.",
          },
          403,
        );
      fireEvent.click(
        within((await screen.findAllByTestId("pooja-row"))[1]).getByRole(
          "button",
          { name: "Set amount" },
        ),
      );
      const dlg = within(await screen.findByRole("dialog"));
      fireEvent.change(dlg.getByLabelText("New amount (₹)"), {
        target: { value: "200" },
      });
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Testing refusal" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Save amount" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(
        /not authorised/,
      );
    });

    it("shows the price history: old to new, who and why", async () => {
      handlers["GET /api/admin/poojas/p1/price-history"] = () =>
        json({
          ok: true,
          history: [
            {
              id: "h2",
              oldAmount: 1200,
              newAmount: 1500,
              adminEmail: "admin@example.com",
              reason: "Annual revision",
              createdAt: "2026-11-15T12:00:00Z",
            },
            {
              id: "h1",
              oldAmount: null,
              newAmount: 1200,
              adminEmail: null,
              reason: null,
              createdAt: "2026-11-01T09:00:00Z",
            },
          ],
        });
      await openSchedules();
      fireEvent.click(
        within((await screen.findAllByTestId("pooja-row"))[0]).getByRole(
          "button",
          { name: "History" },
        ),
      );
      const items = await screen.findAllByTestId("price-history-item");
      expect(items[0].textContent).toContain("₹1,200 → ₹1,500");
      expect(items[0].textContent).toContain("Annual revision");
      expect(items[0].textContent).toContain("admin@example.com");
      expect(items[1].textContent).toContain("not approved → ₹1,200");
      expect(items[1].textContent).toContain("Changed outside the admin page");
    });

    it("never prices a pooja by itself: opening the page or the dialog sends no write", async () => {
      await openSchedules();
      fireEvent.click(
        within((await screen.findAllByTestId("pooja-row"))[1]).getByRole(
          "button",
          { name: "Set amount" },
        ),
      );
      await screen.findByRole("dialog");
      expect(
        fetchMock.mock.calls.filter(([, i]) =>
          ["POST", "PATCH", "PUT", "DELETE"].includes((i as any)?.method),
        ),
      ).toHaveLength(0);
    });
  });

  // ---- daily + Panchangam rules ---------------------------------------------------------------
  describe("recurring schedules and Panchangam rules", () => {
    it("shows daily recurring schedules and can disable one", async () => {
      await openSchedules();
      const row = await screen.findByTestId("recurring-row");
      expect(row.textContent).toContain("Every Saturday");
      expect(row.textContent).toContain("6:30 AM");
      handlers["PATCH /api/admin/recurring-schedules/r1"] = () =>
        json({ ok: true, id: "r1", active: false, affected: 0 });
      fireEvent.click(within(row).getByRole("switch"));
      await waitFor(() =>
        expect(
          bodyOf(calls("PATCH /api/admin/recurring-schedules/r1")[0]),
        ).toEqual({ active: false }),
      );
    });

    it("describes each Panchangam rule in plain words from its structured values", async () => {
      await openSchedules();
      const rows = await screen.findAllByTestId("panchangam-row");
      expect(rows.map((r) => r.textContent)).toEqual([
        expect.stringContaining("Pradosham"),
        expect.stringContaining("Tithi: Chaturthi · Krishna paksha"),
        expect.stringContaining("Nakshatra: Uttara Phalguni"),
      ]);
      expect(rows[0].textContent).toContain("Tithi: Trayodashi");
      expect(rows[0].textContent).toContain("5:00 PM");
      expect(
        within(rows[2]).getByRole("switch").getAttribute("aria-checked"),
      ).toBe("false"); // disabled rule
    });

    it("disables a Panchangam rule through the audited endpoint", async () => {
      await openSchedules();
      handlers["PATCH /api/admin/panchangam-rules/pr1"] = () =>
        json({ ok: true, id: "pr1", active: false, affected: 0 });
      fireEvent.click(
        within((await screen.findAllByTestId("panchangam-row"))[0]).getByRole(
          "switch",
        ),
      );
      await waitFor(() =>
        expect(
          bodyOf(calls("PATCH /api/admin/panchangam-rules/pr1")[0]),
        ).toEqual({ active: false }),
      );
    });

    it("a rule change that touches live bookings only offers 'keep', and needs a reason", async () => {
      await openSchedules();
      let n = 0;
      handlers["PATCH /api/admin/panchangam-rules/pr1"] = (_u, init) => {
        n++;
        return JSON.parse(String(init.body)).handling
          ? json({ ok: true, id: "pr1", active: false, affected: 2 })
          : affected409();
      };
      fireEvent.click(
        within((await screen.findAllByTestId("panchangam-row"))[0]).getByRole(
          "switch",
        ),
      );
      const dlg = within(await screen.findByRole("dialog"));
      expect(dlg.getByText(/2 live bookings exist/)).toBeTruthy();
      expect(dlg.getByTestId("affected-orders").textContent).toBe(
        "SKD-A, SKD-B",
      );
      expect(dlg.getAllByRole("radio")).toHaveLength(1); // keep only: no cancel, no move
      const apply = dlg.getByRole("button", {
        name: "Apply change",
      }) as HTMLButtonElement;
      expect(apply.disabled).toBe(true);
      fireEvent.click(dlg.getByRole("radio"));
      expect(apply.disabled).toBe(true); // still needs a reason
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Rewriting the rule" },
      });
      fireEvent.click(apply);
      await waitFor(() => expect(n).toBe(2));
      expect(bodyOf(calls("PATCH /api/admin/panchangam-rules/pr1")[1])).toEqual(
        { active: false, handling: "keep", reason: "Rewriting the rule" },
      );
    });
  });

  // ---- special dates ------------------------------------------------------------------------------
  describe("special pooja dates", () => {
    it("adds a special pooja date (special poojas only)", async () => {
      await openSchedules();
      const select = screen.getByLabelText("Pooja") as HTMLSelectElement;
      expect([...select.options].map((o) => o.textContent)).toEqual([
        "Select a special pooja",
        "Lord Shiva",
        "New Pooja",
        "Pageless Pooja",
      ]); // no daily or Panchangam poojas
      handlers["POST /api/admin/special-schedules"] = () =>
        json({ ok: true, date: {} }, 201);
      fireEvent.change(select, { target: { value: "p1" } });
      fireEvent.change(screen.getByLabelText("Date"), {
        target: { value: "2099-03-01" },
      });
      fireEvent.change(screen.getByLabelText(/Start time/), {
        target: { value: "09:30" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add date" }));
      await waitFor(() =>
        expect(calls("POST /api/admin/special-schedules")).toHaveLength(1),
      );
      expect(bodyOf(calls("POST /api/admin/special-schedules")[0])).toEqual({
        poojaId: "p1",
        date: "2099-03-01",
        startTime: "09:30",
        notes: null,
      });
    });

    it("surfaces server errors when adding a date (e.g. duplicate)", async () => {
      await openSchedules();
      handlers["POST /api/admin/special-schedules"] = () =>
        json(
          {
            ok: false,
            code: "DUPLICATE_DATE",
            error: "This pooja is already scheduled on that date.",
          },
          409,
        );
      fireEvent.change(screen.getByLabelText("Pooja"), {
        target: { value: "p1" },
      });
      fireEvent.change(screen.getByLabelText("Date"), {
        target: { value: "2099-01-14" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add date" }));
      expect((await screen.findByRole("alert")).textContent).toMatch(
        /already scheduled/,
      );
    });

    it("edits a date and sends only what changed (no booking decision needed when none are affected)", async () => {
      await openSchedules();
      handlers["PATCH /api/admin/special-schedules/s1"] = () =>
        json({
          ok: true,
          date: {},
          affected: { bookings: 0, cancelled: 0, moved: 0 },
        });
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      const dlg = within(await screen.findByRole("dialog"));
      fireEvent.change(dlg.getByLabelText("Notes"), {
        target: { value: "Moved to the main hall" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(calls("PATCH /api/admin/special-schedules/s1")).toHaveLength(1),
      );
      expect(bodyOf(calls("PATCH /api/admin/special-schedules/s1")[0])).toEqual(
        { notes: "Moved to the main hall" },
      );
    });

    it("disabling a booked date asks what to do with the bookings: keep or cancel, never move", async () => {
      await openSchedules();
      let attempts = 0;
      handlers["PATCH /api/admin/special-schedules/s1"] = (_u, init) => {
        attempts++;
        return JSON.parse(String(init.body)).handling
          ? json({
              ok: true,
              date: {},
              affected: { bookings: 2, cancelled: 2, moved: 0 },
            })
          : affected409();
      };
      fireEvent.click(
        within(screen.getByTestId("special-row")).getByRole("switch"),
      );
      const dlg = within(await screen.findByRole("dialog"));
      expect(dlg.getByText(/2 live bookings exist/)).toBeTruthy();
      expect(
        dlg.getAllByRole("radio").map((r) => (r as HTMLInputElement).value),
      ).toEqual(["keep", "cancel"]);
      expect(attempts).toBe(1); // nothing was applied silently
      const apply = dlg.getByRole("button", {
        name: "Apply change",
      }) as HTMLButtonElement;
      fireEvent.click(dlg.getByLabelText(/Cancel the bookings/));
      expect(apply.disabled).toBe(true); // a reason is still required
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Pooja cancelled this month" },
      });
      fireEvent.click(apply);
      await waitFor(() => expect(attempts).toBe(2));
      expect(bodyOf(calls("PATCH /api/admin/special-schedules/s1")[1])).toEqual(
        {
          active: false,
          handling: "cancel",
          reason: "Pooja cancelled this month",
        },
      );
    });

    it("moving a booked date also offers 'move', and sends the explicit choice", async () => {
      await openSchedules();
      let attempts = 0;
      handlers["PATCH /api/admin/special-schedules/s1"] = (_u, init) => {
        attempts++;
        return JSON.parse(String(init.body)).handling
          ? json({
              ok: true,
              date: {},
              affected: { bookings: 2, cancelled: 0, moved: 2 },
            })
          : affected409();
      };
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      const edit = within(await screen.findByRole("dialog"));
      expect(edit.getByText(/2 live bookings on this date/)).toBeTruthy(); // warned up front
      fireEvent.change(edit.getByLabelText("Date"), {
        target: { value: "2099-01-20" },
      });
      fireEvent.click(edit.getByRole("button", { name: "Save changes" }));
      const dlg = within(
        await screen.findByRole("dialog", {
          name: /affects existing bookings/i,
        }),
      );
      expect(
        dlg.getAllByRole("radio").map((r) => (r as HTMLInputElement).value),
      ).toEqual(["keep", "cancel", "move"]);
      fireEvent.click(dlg.getByLabelText(/Move the bookings to the new date/));
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Festival date changed" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Apply change" }));
      await waitFor(() => expect(attempts).toBe(2));
      expect(bodyOf(calls("PATCH /api/admin/special-schedules/s1")[1])).toEqual(
        {
          date: "2099-01-20",
          handling: "move",
          reason: "Festival date changed",
        },
      );
    });

    it("going back from the decision leaves everything untouched", async () => {
      await openSchedules();
      handlers["PATCH /api/admin/special-schedules/s1"] = () => affected409();
      fireEvent.click(
        within(screen.getByTestId("special-row")).getByRole("switch"),
      );
      const dlg = within(await screen.findByRole("dialog"));
      fireEvent.click(dlg.getByRole("button", { name: "Go back" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(calls("PATCH /api/admin/special-schedules/s1")).toHaveLength(1); // only the first, refused attempt
    });

    it("explains a move that conflicts with a devotee's existing booking", async () => {
      await openSchedules();
      handlers["PATCH /api/admin/special-schedules/s1"] = (_u, init) =>
        JSON.parse(String(init.body)).handling
          ? json(
              {
                ok: false,
                code: "MOVE_CONFLICT",
                error:
                  "A devotee already has a booking on the new date, so the bookings cannot be moved. Nothing was changed.",
              },
              409,
            )
          : affected409();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      const edit = within(await screen.findByRole("dialog"));
      fireEvent.change(edit.getByLabelText("Date"), {
        target: { value: "2099-01-20" },
      });
      fireEvent.click(edit.getByRole("button", { name: "Save changes" }));
      const dlg = within(
        await screen.findByRole("dialog", {
          name: /affects existing bookings/i,
        }),
      );
      fireEvent.click(dlg.getByLabelText(/Move the bookings/));
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Festival date changed" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Apply change" }));
      expect((await screen.findByRole("alert")).textContent).toMatch(
        /Nothing was changed/,
      );
    });
  });

  // ---- history ----------------------------------------------------------------------------------------
  it("lists recent schedule changes with who, what changed, why and how bookings were handled", async () => {
    await openSchedules();
    const items = await screen.findAllByTestId("schedule-history-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Lord Shiva");
    expect(items[0].textContent).toContain("date: 2099-01-14 → 2099-01-20");
    expect(items[0].textContent).not.toContain("start_time"); // unchanged values are not listed
    expect(items[0].textContent).toContain("Reason: Festival date changed");
    expect(items[0].textContent).toMatch(
      /2 bookings affected — handled as: move/,
    );
    expect(items[0].textContent).toContain("admin@example.com");
    expect(items[1].textContent).toContain("active: true → false");
    expect(items[1].textContent).toContain("System (outside the admin page)");
  });

  it("shows empty states instead of fabricated schedules", async () => {
    handlers["GET /api/admin/special-schedules"] = () =>
      json({ ok: true, dates: [] });
    handlers["GET /api/admin/recurring-schedules"] = () =>
      json({ ok: true, rules: [] });
    handlers["GET /api/admin/panchangam-rules"] = () =>
      json({ ok: true, rules: [] });
    handlers["GET /api/admin/schedule-audit"] = () =>
      json({ ok: true, entries: [] });
    handlers["GET /api/admin/poojas"] = () => json({ ok: true, poojas: [] });
    signedIn();
    renderAdmin();
    await screen.findByText(/Signed in as/);
    openTab("Poojas & schedules");
    expect((await screen.findByTestId("no-special")).textContent).toMatch(
      /No special pooja dates/,
    );
    expect((await screen.findByTestId("no-recurring")).textContent).toMatch(
      /No recurring schedules/,
    );
    expect((await screen.findByTestId("no-panchangam")).textContent).toMatch(
      /No Panchangam-based poojas/,
    );
    expect((await screen.findByTestId("no-poojas")).textContent).toMatch(
      /catalogue is empty/,
    );
    expect(
      (await screen.findByTestId("no-schedule-history")).textContent,
    ).toMatch(/No schedule changes yet/);
  });
});

// type-level guard: the UI's action labels cover every server action
const _all: BookingAction[] = [
  "verify_payment",
  "reject_payment",
  "confirm_booking",
  "cancel_booking",
  "add_note",
];
void _all;
