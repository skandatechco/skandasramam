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

// =================================================================================
// Festival poojas (administrator interface)
// =================================================================================
const FEST = {
  id: "f1",
  poojaId: "pf1",
  slug: "festival-diwali-lakshmi-pooja-20991101",
  festivalName: "Diwali",
  poojaName: "Lakshmi Pooja",
  description: "Evening pooja",
  date: "2099-11-01",
  startTime: "18:00",
  amount: 1501,
  bookingOpensOn: null,
  bookingClosesOn: null,
  maxBookings: 10,
  active: true,
  templatePoojaId: null,
  liveBookings: 2,
  state: "open",
  destination: "/poojas/festival/festival-diwali-lakshmi-pooja-20991101",
};

const affected409 = () =>
  json(
    {
      ok: false,
      code: "AFFECTED_BOOKINGS",
      error: "affected",
      liveBookings: 2,
      orders: ["SKD-A", "SKD-B"],
    },
    409,
  );

async function openFestivals() {
  signedIn();
  renderAdmin();
  await screen.findByText(/Signed in as/);
  openTab("Festival poojas");
  await screen.findAllByTestId("festival-row");
}

beforeEach(() => {
  handlers["GET /api/admin/festivals"] = () =>
    json({ ok: true, festivals: [FEST] });
  handlers["GET /api/admin/festivals/f1/history"] = () =>
    json({
      ok: true,
      changes: [
        {
          id: "c1",
          table: "festival_offerings",
          action: "update",
          poojaName: "Lakshmi Pooja",
          adminEmail: "admin@example.com",
          oldValues: { start_time: "17:00:00", max_bookings: 10 },
          newValues: { start_time: "18:00:00", max_bookings: 10 },
          reason: "Later start",
          affectedHandling: null,
          affectedBookings: null,
          createdAt: "2026-11-15T12:00:00Z",
        },
      ],
      prices: [
        {
          id: "pr1",
          oldAmount: 1200,
          newAmount: 1501,
          adminEmail: "admin@example.com",
          reason: "Costs rose",
          createdAt: "2026-11-16T12:00:00Z",
        },
      ],
    });
});

describe("festival poojas", () => {
  it("lists offerings with the festival, pooja, date, time, own fixed amount, bookings and status", async () => {
    await openFestivals();
    const row = screen.getByTestId("festival-row");
    expect(row.textContent).toMatch(/Diwali/);
    expect(row.textContent).toMatch(/Lakshmi Pooja/);
    expect(row.textContent).toMatch(/6:00 PM|18:00/);
    expect(within(row).getByTestId("festival-amount").textContent).toBe(
      "₹1,501",
    );
    expect(row.textContent).toMatch(/2 \/ 10/);
    expect(within(row).getByTestId("festival-state").textContent).toBe(
      "Booking open",
    );
  });

  it("shows an empty state, not invented offerings", async () => {
    handlers["GET /api/admin/festivals"] = () =>
      json({ ok: true, festivals: [] });
    signedIn();
    renderAdmin();
    await screen.findByText(/Signed in as/);
    openTab("Festival poojas");
    expect(await screen.findByTestId("no-festivals")).toBeTruthy();
  });

  describe("Add Festival Pooja", () => {
    async function openForm() {
      await openFestivals();
      fireEvent.click(
        screen.getByRole("button", { name: "Add Festival Pooja" }),
      );
      return within(await screen.findByRole("dialog"));
    }
    const fill = (
      dlg: ReturnType<typeof within>,
      over: Record<string, string>,
    ) => {
      const v: Record<string, string> = {
        "Festival or occasion": "Maha Shivaratri",
        "Pooja name": "Rudra Abhishekam",
        Description: "Abhishekam through the night",
        Date: "2099-03-06",
        "Start time": "18:00",
        "Fixed amount (₹)": "1501",
        ...over,
      };
      for (const [label, value] of Object.entries(v))
        fireEvent.change(dlg.getByLabelText(label), { target: { value } });
    };

    it("offers every field the temple asked for", async () => {
      const dlg = await openForm();
      for (const label of [
        "Festival or occasion",
        "Pooja name",
        "Description",
        "Date",
        "Start time",
        "Fixed amount (₹)",
        "Booking opens (optional)",
        "Booking closes (optional)",
        "Maximum bookings (optional)",
      ])
        expect(dlg.getByLabelText(label)).toBeTruthy();
      expect(dlg.getByLabelText(/^Active/)).toBeTruthy();
      expect(dlg.getByLabelText(/Start from an existing pooja/)).toBeTruthy();
    });

    it("creates an offering with its own amount: exactly one request, a number, nothing else priced", async () => {
      handlers["POST /api/admin/festivals"] = () =>
        json({ ok: true, festival: FEST }, 201);
      const dlg = await openForm();
      fill(dlg, {});
      fireEvent.change(dlg.getByLabelText("Booking opens (optional)"), {
        target: { value: "2099-02-01" },
      });
      fireEvent.change(dlg.getByLabelText("Booking closes (optional)"), {
        target: { value: "2099-03-04" },
      });
      fireEvent.change(dlg.getByLabelText("Maximum bookings (optional)"), {
        target: { value: "40" },
      });
      const add = dlg.getByRole("button", { name: "Add festival pooja" });
      fireEvent.click(add);
      fireEvent.click(add); // a double click must not create twice
      await waitFor(() =>
        expect(calls("POST /api/admin/festivals")).toHaveLength(1),
      );
      expect(bodyOf(calls("POST /api/admin/festivals")[0])).toEqual({
        festivalName: "Maha Shivaratri",
        poojaName: "Rudra Abhishekam",
        description: "Abhishekam through the night",
        date: "2099-03-06",
        startTime: "18:00",
        amount: 1501,
        bookingOpensOn: "2099-02-01",
        bookingClosesOn: "2099-03-04",
        maxBookings: 40,
        active: true,
        templatePoojaId: null,
      });
      expect(calls("POST /api/admin/poojas/p1/price")).toHaveLength(0);
    });

    it("a template pre-fills the pooja name, is sent by id, and its standard rate is shown as unchanged", async () => {
      handlers["POST /api/admin/festivals"] = () =>
        json({ ok: true, festival: FEST }, 201);
      const dlg = await openForm();
      fireEvent.change(dlg.getByLabelText(/Start from an existing pooja/), {
        target: { value: "p3" },
      });
      expect((dlg.getByLabelText("Pooja name") as HTMLInputElement).value).toBe(
        "Pradosham",
      );
      expect(dlg.getByTestId("template-note").textContent).toMatch(
        /Pradosham keeps its standard rate of ₹300/,
      );
      fill(dlg, {
        "Pooja name": "Pradosham Maha Abhishekam",
        "Fixed amount (₹)": "900",
      });
      fireEvent.click(dlg.getByRole("button", { name: "Add festival pooja" }));
      await waitFor(() =>
        expect(calls("POST /api/admin/festivals")).toHaveLength(1),
      );
      const sent = bodyOf(calls("POST /api/admin/festivals")[0]);
      expect(sent).toMatchObject({ templatePoojaId: "p3", amount: 900 });
      // the template pooja's own rate is never written
      expect(calls("POST /api/admin/poojas/p3/price")).toHaveLength(0);
      expect(
        fetchMock.mock.calls.filter(([, i]) => (i as any)?.method === "PATCH"),
      ).toHaveLength(0);
    });

    it("will not submit without a valid fixed amount, date or names, and sends nothing", async () => {
      const dlg = await openForm();
      fireEvent.click(dlg.getByRole("button", { name: "Add festival pooja" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(
        /festival or occasion/i,
      );
      fill(dlg, { "Fixed amount (₹)": "" });
      fireEvent.click(dlg.getByRole("button", { name: "Add festival pooja" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(
        /fixed amount/i,
      );
      for (const bad of ["0", "-5", "12.345", "abc", "1e3"]) {
        fill(dlg, { "Fixed amount (₹)": bad });
        fireEvent.click(
          dlg.getByRole("button", { name: "Add festival pooja" }),
        );
        expect([bad, (await dlg.findByRole("alert")).textContent]).toEqual([
          bad,
          expect.stringMatching(/fixed amount/i),
        ]);
      }
      fill(dlg, { "Fixed amount (₹)": "500", Date: "" });
      fireEvent.click(dlg.getByRole("button", { name: "Add festival pooja" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(/date/i);
      expect(calls("POST /api/admin/festivals")).toHaveLength(0);
    });

    it("checks the booking window before sending", async () => {
      const dlg = await openForm();
      fill(dlg, {});
      fireEvent.change(dlg.getByLabelText("Booking opens (optional)"), {
        target: { value: "2099-03-05" },
      });
      fireEvent.change(dlg.getByLabelText("Booking closes (optional)"), {
        target: { value: "2099-03-01" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Add festival pooja" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(
        /cannot open after/i,
      );
      fireEvent.change(dlg.getByLabelText("Booking opens (optional)"), {
        target: { value: "" },
      });
      fireEvent.change(dlg.getByLabelText("Booking closes (optional)"), {
        target: { value: "2099-03-09" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Add festival pooja" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(
        /on or before the festival date/i,
      );
      expect(calls("POST /api/admin/festivals")).toHaveLength(0);
    });

    it("shows the server's refusal inside the dialog and keeps what was typed", async () => {
      handlers["POST /api/admin/festivals"] = () =>
        json(
          {
            ok: false,
            code: "DUPLICATE_FESTIVAL",
            error: "That festival pooja already exists for this date.",
          },
          409,
        );
      const dlg = await openForm();
      fill(dlg, {});
      fireEvent.click(dlg.getByRole("button", { name: "Add festival pooja" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(
        /already exists/,
      );
      expect((dlg.getByLabelText("Pooja name") as HTMLInputElement).value).toBe(
        "Rudra Abhishekam",
      );
    });
  });

  describe("editing, activating and deactivating", () => {
    it("edits only what changed, with a required reason; the amount is sent as the festival's own", async () => {
      handlers["PATCH /api/admin/festivals/f1"] = () =>
        json({
          ok: true,
          festival: FEST,
          affected: { bookings: 0, cancelled: 0, moved: 0 },
        });
      await openFestivals();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      const dlg = within(await screen.findByRole("dialog"));
      expect(dlg.queryByLabelText(/Start from an existing pooja/)).toBeNull();
      fireEvent.change(dlg.getByLabelText("Fixed amount (₹)"), {
        target: { value: "1800" },
      });
      fireEvent.change(dlg.getByLabelText("Description"), {
        target: { value: "Updated text" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Save changes" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(/reason/i);
      expect(calls("PATCH /api/admin/festivals/f1")).toHaveLength(0);

      fireEvent.change(dlg.getByLabelText(/Reason for the change/), {
        target: { value: "Costs rose" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(calls("PATCH /api/admin/festivals/f1")).toHaveLength(1),
      );
      expect(bodyOf(calls("PATCH /api/admin/festivals/f1")[0])).toEqual({
        amount: 1800,
        description: "Updated text",
        reason: "Costs rose",
      });
    });

    it("says so when nothing has changed", async () => {
      await openFestivals();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      const dlg = within(await screen.findByRole("dialog"));
      fireEvent.change(dlg.getByLabelText(/Reason for the change/), {
        target: { value: "No change at all" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Save changes" }));
      expect((await dlg.findByRole("alert")).textContent).toMatch(
        /nothing has changed/i,
      );
      expect(calls("PATCH /api/admin/festivals/f1")).toHaveLength(0);
    });

    it("moving a booked festival asks what to do with the bookings and sends the explicit choice", async () => {
      let attempts = 0;
      handlers["PATCH /api/admin/festivals/f1"] = (_u, init) => {
        attempts++;
        return JSON.parse(String(init.body)).handling
          ? json({
              ok: true,
              festival: FEST,
              affected: { bookings: 2, cancelled: 0, moved: 2 },
            })
          : affected409();
      };
      await openFestivals();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      const form = within(await screen.findByRole("dialog"));
      fireEvent.change(form.getByLabelText("Date"), {
        target: { value: "2099-11-05" },
      });
      fireEvent.change(form.getByLabelText(/Reason for the change/), {
        target: { value: "Date changed" },
      });
      fireEvent.click(form.getByRole("button", { name: "Save changes" }));

      const choice = within(
        (
          await screen.findByText(/This change affects existing bookings/)
        ).closest('[role="dialog"]') as HTMLElement,
      );
      expect(
        choice.getAllByRole("radio").map((r) => (r as HTMLInputElement).value),
      ).toEqual(["keep", "cancel", "move"]);
      expect(attempts).toBe(1); // nothing was applied silently
      fireEvent.click(choice.getByLabelText(/Move the bookings/));
      fireEvent.change(choice.getByLabelText(/Reason/), {
        target: { value: "Moved with the festival" },
      });
      fireEvent.click(choice.getByRole("button", { name: "Apply change" }));
      await waitFor(() => expect(attempts).toBe(2));
      expect(bodyOf(calls("PATCH /api/admin/festivals/f1")[1])).toEqual({
        date: "2099-11-05",
        handling: "move",
        reason: "Moved with the festival",
      });
    });

    it("deactivating a booked festival offers keep or cancel, never move", async () => {
      let attempts = 0;
      handlers["PATCH /api/admin/festivals/f1"] = (_u, init) => {
        attempts++;
        return JSON.parse(String(init.body)).handling
          ? json({
              ok: true,
              festival: { ...FEST, active: false },
              affected: { bookings: 2, cancelled: 2, moved: 0 },
            })
          : affected409();
      };
      await openFestivals();
      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      const dlg = within(await screen.findByRole("dialog"));
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Festival cancelled" },
      });
      fireEvent.click(dlg.getByRole("button", { name: "Deactivate" }));

      const choice = within(
        (
          await screen.findByText(/This change affects existing bookings/)
        ).closest('[role="dialog"]') as HTMLElement,
      );
      expect(
        choice.getAllByRole("radio").map((r) => (r as HTMLInputElement).value),
      ).toEqual(["keep", "cancel"]);
      fireEvent.click(choice.getByLabelText(/Keep the bookings/));
      fireEvent.change(choice.getByLabelText(/Reason/), {
        target: { value: "I will call everyone" },
      });
      fireEvent.click(choice.getByRole("button", { name: "Apply change" }));
      await waitFor(() => expect(attempts).toBe(2));
      expect(bodyOf(calls("PATCH /api/admin/festivals/f1")[1])).toEqual({
        active: false,
        handling: "keep",
        reason: "I will call everyone",
      });
    });

    it("activating an inactive offering needs a reason and sends one request", async () => {
      handlers["GET /api/admin/festivals"] = () =>
        json({
          ok: true,
          festivals: [{ ...FEST, active: false, state: "inactive" }],
        });
      handlers["PATCH /api/admin/festivals/f1"] = () =>
        json({
          ok: true,
          festival: FEST,
          affected: { bookings: 0, cancelled: 0, moved: 0 },
        });
      await openFestivals();
      expect(screen.getByTestId("festival-state").textContent).toBe("Inactive");
      fireEvent.click(screen.getByRole("button", { name: "Activate" }));
      const dlg = within(await screen.findByRole("dialog"));
      const go = dlg.getByRole("button", {
        name: "Activate",
      }) as HTMLButtonElement;
      expect(go.disabled).toBe(true); // reason first
      fireEvent.change(dlg.getByLabelText(/Reason/), {
        target: { value: "Dates confirmed" },
      });
      fireEvent.click(go);
      await waitFor(() =>
        expect(calls("PATCH /api/admin/festivals/f1")).toHaveLength(1),
      );
      expect(bodyOf(calls("PATCH /api/admin/festivals/f1")[0])).toEqual({
        active: true,
        reason: "Dates confirmed",
      });
    });
  });

  describe("bookings and history", () => {
    it("shows the bookings of this festival only, with their original amounts", async () => {
      handlers["GET /api/admin/bookings"] = (u) => {
        expect(u.searchParams.get("poojaId")).toBe("pf1");
        return json({
          ok: true,
          items: [row(1, { amount: 1200 }), row(2, { amount: 1501 })],
          page: 1,
          pageSize: 50,
          total: 2,
          totalPages: 1,
        });
      };
      await openFestivals();
      fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
      const rows = await screen.findAllByTestId("festival-booking-row");
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toMatch(/₹1,200/); // an earlier booking keeps its amount
      expect(rows[1].textContent).toMatch(/₹1,501/);
    });

    it("says when there are no bookings yet", async () => {
      handlers["GET /api/admin/bookings"] = () =>
        json({
          ok: true,
          items: [],
          page: 1,
          pageSize: 50,
          total: 0,
          totalPages: 0,
        });
      await openFestivals();
      fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
      expect(await screen.findByTestId("no-festival-bookings")).toBeTruthy();
    });

    it("shows the audit history: who, when, what changed, old and new price, and why", async () => {
      await openFestivals();
      fireEvent.click(screen.getByRole("button", { name: "History" }));
      const items = await screen.findAllByTestId("festival-history-item");
      expect(items).toHaveLength(2);
      const text = items.map((i) => i.textContent).join(" | ");
      expect(text).toMatch(/Price ₹1,200 → ₹1,501/);
      expect(text).toMatch(/Costs rose/);
      expect(text).toMatch(/Start time: 17:00:00 → 18:00:00/);
      expect(text).toMatch(/Later start/);
      expect(text).toMatch(/admin@example\.com/);
    });

    it("opening bookings or history sends no write", async () => {
      handlers["GET /api/admin/bookings"] = () =>
        json({
          ok: true,
          items: [],
          page: 1,
          pageSize: 50,
          total: 0,
          totalPages: 0,
        });
      await openFestivals();
      fireEvent.click(screen.getByRole("button", { name: "History" }));
      await screen.findAllByTestId("festival-history-item");
      expect(
        fetchMock.mock.calls.filter(
          ([, i]) => ((i as any)?.method ?? "GET") !== "GET",
        ),
      ).toHaveLength(0);
    });
  });
});
