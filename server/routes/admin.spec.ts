import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---- Fake Supabase "user client" ------------------------------------------------
type Result = { data?: any; error?: any; count?: number | null };
type Call = {
  table: string;
  op: string;
  args: any[];
  filters: [string, any[]][];
};

const state: {
  user: { id: string; email: string } | null;
  authError: boolean;
  isAdmin: boolean | "error";
  tokensSeen: string[];
  calls: Call[];
  rpcCalls: { name: string; args: any }[];
  rpcResult: Result;
  rpcResults: Record<string, Result>;
  results: Record<string, Result | ((c: Call) => Result)>;
} = {
  user: null,
  authError: false,
  isAdmin: false,
  tokensSeen: [],
  calls: [],
  rpcCalls: [],
  rpcResult: { data: null, error: null },
  rpcResults: {},
  results: {},
};

const serviceClientUsed = vi.fn();

function from(table: string) {
  const call: Call = { table, op: "select", args: [], filters: [] };
  const rec =
    (name: string) =>
    (...args: any[]) => (call.filters.push([name, args]), b);
  const b: any = {
    select: (...args: any[]) => {
      if (call.op === "select") call.args = args; // keep the payload of insert/update
      return b;
    },
    insert: (row: any) => ((call.op = "insert"), (call.args = [row]), b),
    update: (row: any) => ((call.op = "update"), (call.args = [row]), b),
    eq: rec("eq"),
    neq: rec("neq"),
    gte: rec("gte"),
    lte: rec("lte"),
    in: rec("in"),
    or: rec("or"),
    order: rec("order"),
    range: rec("range"),
    limit: rec("limit"),
    single: () => (call.filters.push(["single", []]), b.then((r: any) => r)),
    maybeSingle: () => (
      call.filters.push(["maybeSingle", []]),
      b.then((r: any) => r)
    ),
    then: (res: any, rej: any) => {
      state.calls.push(call);
      const r = state.results[`${table}:${call.op}`];
      const out = typeof r === "function" ? r(call) : r;
      return Promise.resolve({
        data: null,
        error: null,
        count: null,
        ...(out ?? {}),
      }).then(res, rej);
    },
  };
  return b;
}

vi.mock("../lib/supabase", () => ({
  getServiceClient: () => {
    serviceClientUsed();
    throw new Error("service-role client must not be used by /api/admin");
  },
  getUserClient: (jwt: string) => {
    state.tokensSeen.push(jwt);
    return {
      auth: {
        getUser: async () =>
          state.authError || !state.user
            ? { data: { user: null }, error: { message: "invalid JWT" } }
            : { data: { user: state.user }, error: null },
      },
      rpc: async (name: string, args?: any) => {
        if (name === "is_admin") {
          return state.isAdmin === "error"
            ? { data: null, error: { message: "db down" } }
            : { data: state.isAdmin, error: null };
        }
        state.rpcCalls.push({ name, args });
        return state.rpcResults[name] ?? state.rpcResult;
      },
      from,
    };
  },
}));

const { createServer } = await import("../index");

let server: Server;
let base: string;
beforeAll(() => {
  server = createServer({ rateLimiting: false }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const TOKEN = "t".repeat(40);
const ADMIN = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@example.com",
};
const BID = "22222222-2222-4222-8222-222222222222";
const PID = "33333333-3333-4333-8333-333333333333";
const SID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  state.user = ADMIN;
  state.authError = false;
  state.isAdmin = true;
  state.tokensSeen = [];
  state.calls = [];
  state.rpcCalls = [];
  state.rpcResults = {};
  state.rpcResult = {
    data: [
      { new_status: "pending", new_payment_status: "verified", audit_id: "a" },
    ],
    error: null,
  };
  state.results = {};
  serviceClientUsed.mockClear();
});

const call = (
  method: string,
  path: string,
  body?: any,
  token: string | null = TOKEN,
) =>
  fetch(`${base}/api/admin${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

const ROUTES: [string, string, any?][] = [
  ["GET", "/me"],
  ["GET", "/stats"],
  ["GET", "/bookings"],
  ["GET", `/bookings/${BID}`],
  ["POST", `/bookings/${BID}/actions`, { action: "add_note", note: "x" }],
  ["GET", "/poojas"],
  ["POST", `/poojas/${PID}/price`, { amount: 500, reason: "Approved" }],
  ["GET", `/poojas/${PID}/price-history`],
  ["GET", "/recurring-schedules"],
  ["PATCH", `/recurring-schedules/${SID}`, { active: false }],
  ["GET", "/panchangam-rules"],
  ["PATCH", `/panchangam-rules/${SID}`, { active: false }],
  ["GET", "/special-schedules"],
  ["POST", "/special-schedules", { poojaId: PID, date: "2099-01-01" }],
  ["PATCH", `/special-schedules/${SID}`, { active: false }],
  ["GET", "/schedule-audit"],
  ["GET", "/festivals"],
  [
    "POST",
    "/festivals",
    {
      festivalName: "Diwali",
      poojaName: "Lakshmi Pooja",
      date: "2099-11-01",
      amount: 1501,
    },
  ],
  ["PATCH", `/festivals/${SID}`, { active: false, reason: "Cancelled" }],
  ["GET", `/festivals/${SID}/history`],
];

const bookingRow = {
  id: BID,
  order_no: "SKD-261115-A1B2C3",
  devotee_name: "Test Devotee",
  phone: "9876543210",
  pooja_name: "Pradosham",
  booking_date: "2099-01-10",
  amount_inr: "500.00",
  upi_ref: "123456789012",
  payment_status: "awaiting_verification",
  status: "pending",
  created_at: "2026-11-15T10:00:00Z",
  email: "d@example.com",
  nakshatra: "Rohini",
  gotra: null,
  sankalpam: "Peace",
  payment_submitted_at: "2026-11-15T10:05:00Z",
  payment_verified_at: null,
  updated_at: "2026-11-15T10:05:00Z",
};

// ---- authentication & authorisation -------------------------------------------------
describe("authentication", () => {
  it.each(ROUTES)(
    "%s %s requires a token: 401 with no database access",
    async (method, path, body) => {
      const r = await call(method, path, body, null);
      expect(r.status).toBe(401);
      expect((await r.json()).code).toBe("UNAUTHENTICATED");
      expect(state.tokensSeen).toHaveLength(0);
      expect(state.calls).toHaveLength(0);
    },
  );

  it("rejects malformed Authorization headers", async () => {
    for (const h of [
      "Basic abc",
      "Bearer",
      "Bearer short",
      `Bearer ${"a b".repeat(20)}`,
      `bearer ${TOKEN}`,
    ]) {
      const r = await fetch(`${base}/api/admin/me`, {
        headers: { authorization: h },
      });
      expect(r.status).toBe(401);
    }
    expect(state.tokensSeen).toHaveLength(0);
  });

  it("rejects an invalid or expired token (verified by Supabase Auth) and never checks admin rights", async () => {
    state.authError = true;
    const r = await call("GET", "/stats");
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe("SESSION_EXPIRED");
    expect(state.calls).toHaveLength(0);
  });

  it("forwards the caller's own JWT (RLS applies) and never touches the service-role client", async () => {
    await call("GET", "/me");
    expect(state.tokensSeen).toEqual([TOKEN]);
    for (const [m, p, b] of ROUTES) await call(m, p, b);
    expect(serviceClientUsed).not.toHaveBeenCalled();
  });

  it("returns the identity from the verified token", async () => {
    const r = await call("GET", "/me");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, admin: ADMIN });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("non-administrators", () => {
  beforeEach(() => (state.isAdmin = false));

  it.each(ROUTES)(
    "%s %s is forbidden for a signed-in non-admin",
    async (method, path, body) => {
      const r = await call(method, path, body);
      expect(r.status).toBe(403);
      expect((await r.json()).code).toBe("FORBIDDEN");
      expect(state.calls).toHaveLength(0); // no table was touched
      expect(state.rpcCalls).toHaveLength(0); // no action was attempted
    },
  );

  it("a failure of the admin check is a generic 500, never access", async () => {
    state.isAdmin = "error";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call("GET", "/stats");
    expect(r.status).toBe(500);
    expect(state.calls).toHaveLength(0);
    spy.mockRestore();
  });
});

// ---- dashboard ----------------------------------------------------------------------
describe("GET /stats", () => {
  it("reports real counts and the next special poojas with live bookings", async () => {
    state.results["bookings:select"] = (c) => {
      const f = JSON.stringify(c.filters);
      if (c.args[1]?.head) {
        if (f.includes("awaiting_verification")) return { count: 3 };
        if (f.includes('"confirmed"')) return { count: 7 };
        return { count: 25 };
      }
      // live-bookings lookup for the upcoming specials
      return {
        data: [
          { pooja_id: PID, booking_date: "2099-01-14" },
          { pooja_id: PID, booking_date: "2099-01-14" },
          { pooja_id: PID, booking_date: "2099-02-02" },
        ],
      };
    };
    state.results["special_pooja_schedule:select"] = (c) =>
      c.args[1]?.head
        ? { count: 4 }
        : {
            data: [
              {
                id: SID,
                pooja_id: PID,
                date: "2099-01-14",
                start_time: "10:00:00",
                notes: null,
                active: true,
                poojas: { name: "Homam" },
              },
            ],
          };
    state.results["recurring_pooja_schedule:select"] = { count: 2 };

    const body = await (await call("GET", "/stats")).json();
    expect(body.stats).toEqual({
      totalBookings: 25,
      awaitingVerification: 3,
      confirmed: 7,
      upcomingSpecialPoojas: 4,
      activeRecurringRules: 2,
      nextSpecialPoojas: [
        {
          id: SID,
          date: "2099-01-14",
          poojaName: "Homam",
          startTime: "10:00",
          liveBookings: 2,
        },
      ],
    });
  });

  it("awaiting-verification count excludes cancelled bookings", async () => {
    await call("GET", "/stats");
    const awaiting = state.calls.find((c) =>
      JSON.stringify(c.filters).includes("awaiting_verification"),
    )!;
    expect(awaiting.filters).toContainEqual(["neq", ["status", "cancelled"]]);
  });
});

// ---- bookings: list, filter, paginate --------------------------------------------------
describe("GET /bookings", () => {
  const list = () => state.calls.find((c) => c.table === "bookings")!;
  const range = () => list().filters.find(([n]) => n === "range")![1];

  beforeEach(() => {
    state.results["bookings:select"] = { data: [bookingRow], count: 45 };
  });

  it("returns mapped rows with pagination metadata (default 20 per page)", async () => {
    const body = await (await call("GET", "/bookings")).json();
    expect(body).toMatchObject({
      ok: true,
      page: 1,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
    expect(body.items[0]).toEqual({
      id: BID,
      orderNo: "SKD-261115-A1B2C3",
      devotee: "Test Devotee",
      phone: "9876543210",
      poojaName: "Pradosham",
      date: "2099-01-10",
      amount: 500,
      upiRef: "123456789012",
      paymentStatus: "awaiting_verification",
      status: "pending",
      createdAt: "2026-11-15T10:00:00Z",
    });
    expect(range()).toEqual([0, 19]);
  });

  it("applies page and pageSize as a database range", async () => {
    await call("GET", "/bookings?page=3&pageSize=10");
    expect(range()).toEqual([20, 29]);
  });

  it("caps page size and rejects nonsense", async () => {
    for (const qs of [
      "?pageSize=51",
      "?pageSize=0",
      "?page=0",
      "?page=abc",
      "?status=bogus",
      "?from=2099-13-01",
    ]) {
      const r = await call("GET", `/bookings${qs}`);
      expect(r.status).toBe(400);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("filters by status, payment status and date range in the database", async () => {
    await call(
      "GET",
      "/bookings?status=pending&paymentStatus=awaiting_verification&from=2099-01-01&to=2099-01-31",
    );
    const f = list().filters;
    expect(f).toContainEqual(["eq", ["status", "pending"]]);
    expect(f).toContainEqual([
      "eq",
      ["payment_status", "awaiting_verification"],
    ]);
    expect(f).toContainEqual(["gte", ["booking_date", "2099-01-01"]]);
    expect(f).toContainEqual(["lte", ["booking_date", "2099-01-31"]]);
  });

  it("searches order number, name, phone, UPI reference, email and pooja", async () => {
    await call("GET", "/bookings?q=Test%20Devotee");
    const [, [expr]] = list().filters.find(([n]) => n === "or")!;
    for (const col of [
      "order_no",
      "devotee_name",
      "phone",
      "upi_ref",
      "email",
      "pooja_name",
    ]) {
      expect(expr).toContain(`${col}.ilike.%Test Devotee%`);
    }
  });

  it("refuses search text that could alter the filter expression", async () => {
    for (const q of ["a,b", "x)or(y", "50%", "a'b", "a*"]) {
      const r = await call("GET", `/bookings?q=${encodeURIComponent(q)}`);
      expect(r.status).toBe(400);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("selects explicit columns and never the token hash", async () => {
    await call("GET", "/bookings");
    expect(list().args[0]).not.toContain("access_token_hash");
    expect(list().args[0]).not.toContain("*");
  });

  it("returns an empty first page cleanly", async () => {
    state.results["bookings:select"] = { data: [], count: 0 };
    const body = await (await call("GET", "/bookings?q=nobody")).json();
    expect(body).toMatchObject({ items: [], total: 0, totalPages: 1 });
  });

  it("returns a generic 500 on database failure", async () => {
    state.results["bookings:select"] = {
      error: { message: "secret db detail" },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call("GET", "/bookings");
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
    spy.mockRestore();
  });
});

describe("GET /bookings/:id", () => {
  it("returns details, history and only the actions valid for the state", async () => {
    state.results["bookings:select"] = { data: bookingRow };
    state.results["booking_audit_log:select"] = {
      data: [
        {
          id: "h1",
          action: "add_note",
          admin_email: "a@example.com",
          from_status: "pending",
          to_status: "pending",
          from_payment_status: "awaiting_verification",
          to_payment_status: "awaiting_verification",
          note: "Called",
          created_at: "2026-11-15T11:00:00Z",
        },
      ],
    };
    const body = await (await call("GET", `/bookings/${BID}`)).json();
    expect(body.booking).toMatchObject({
      email: "d@example.com",
      sankalpam: "Peace",
      nakshatra: "Rohini",
    });
    expect(body.booking.allowedActions).toEqual([
      "add_note",
      "verify_payment",
      "reject_payment",
      "cancel_booking",
    ]);
    expect(body.booking.history[0]).toMatchObject({
      action: "add_note",
      adminEmail: "a@example.com",
      note: "Called",
    });
    expect(JSON.stringify(body)).not.toContain("access_token");
  });
  it("404s for a malformed id or a missing booking", async () => {
    expect((await call("GET", "/bookings/not-a-uuid")).status).toBe(404);
    expect((await call("GET", `/bookings/${BID}`)).status).toBe(404);
  });
});

// ---- booking actions ----------------------------------------------------------------------
describe("POST /bookings/:id/actions", () => {
  beforeEach(() => {
    state.results["bookings:select"] = { data: bookingRow };
    state.results["booking_audit_log:select"] = { data: [] };
  });
  const act = (body: any) => call("POST", `/bookings/${BID}/actions`, body);

  it.each([
    ["verify_payment", undefined],
    ["verify_payment", "Matched bank statement"],
    ["reject_payment", "Reference not found"],
    ["confirm_booking", undefined],
    ["cancel_booking", "Devotee requested"],
    ["add_note", "Called the devotee"],
  ])(
    "%s calls the database function with the caller's session",
    async (action, note) => {
      const r = await act({ action, ...(note ? { note } : {}) });
      expect(r.status).toBe(200);
      expect(state.rpcCalls).toEqual([
        {
          name: "admin_booking_action",
          args: { p_booking_id: BID, p_action: action, p_note: note ?? null },
        },
      ]);
      expect((await r.json()).booking.orderNo).toBe("SKD-261115-A1B2C3");
    },
  );

  it("requires a note for reject, cancel and add_note before touching the database", async () => {
    for (const action of ["reject_payment", "cancel_booking", "add_note"]) {
      expect((await act({ action })).status).toBe(400);
      expect((await act({ action, note: "   " })).status).toBe(400);
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("cannot be told who the admin is, or to set arbitrary state", async () => {
    for (const body of [
      { action: "verify_payment", adminId: "someone-else" },
      { action: "verify_payment", paymentStatus: "verified" },
      { action: "verify_payment", status: "confirmed" },
      { action: "mark_paid" },
      { action: "verify_payment; drop table bookings" },
      {},
    ]) {
      expect((await act(body)).status).toBe(400);
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("maps database refusals to the right HTTP errors", async () => {
    const cases: [string, number, string][] = [
      ["invalid_transition", 409, "INVALID_TRANSITION"],
      ["forbidden", 403, "FORBIDDEN"],
      ["booking_not_found", 404, "BOOKING_NOT_FOUND"],
      ["note_required", 400, "VALIDATION_ERROR"],
    ];
    for (const [message, status, code] of cases) {
      state.rpcResult = { data: null, error: { message } };
      const r = await act({ action: "verify_payment" });
      expect([r.status, (await r.json()).code]).toEqual([status, code]);
    }
  });

  it("reports an expired JWT during the action as a 401", async () => {
    state.rpcResult = {
      data: null,
      error: { code: "PGRST301", message: "JWT expired" },
    };
    const r = await act({ action: "verify_payment" });
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe("SESSION_EXPIRED");
  });

  it("returns a generic 500 for unexpected database errors", async () => {
    state.rpcResult = {
      data: null,
      error: { message: "relation secret_table missing" },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await act({ action: "verify_payment" });
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secret_table");
    spy.mockRestore();
  });

  it("404s for a malformed booking id without calling the database", async () => {
    const r = await call("POST", "/bookings/zzz/actions", {
      action: "add_note",
      note: "x",
    });
    expect(r.status).toBe(404);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

// ---- catalogue & schedules ------------------------------------------------------------------
describe("catalogue and price administration", () => {
  const price = (body: any, id = PID) =>
    call("POST", `/poojas/${id}/price`, body);

  it("lists poojas with their fixed amount, public page and schedule count", async () => {
    state.results["poojas:select"] = {
      data: [
        {
          id: PID,
          slug: "pradosham",
          name: "Pradosham",
          type: "panchangam",
          amount_inr: "300.00",
          active: true,
        },
        {
          id: "p2",
          slug: "lord-shiva",
          name: "Lord Shiva",
          type: "special",
          amount_inr: null,
          active: true,
        },
        {
          id: "p3",
          slug: "no-such-page",
          name: "Pageless",
          type: "special",
          amount_inr: 900,
          active: true,
        },
      ],
    };
    state.results["panchangam_pooja_rules:select"] = {
      data: [{ pooja_id: PID }, { pooja_id: PID }],
    };
    state.results["special_pooja_schedule:select"] = {
      data: [{ pooja_id: "p2" }],
    };
    const body = await (await call("GET", "/poojas")).json();
    expect(
      body.poojas.map((p: any) => [
        p.slug,
        p.amount,
        p.destination,
        p.scheduleCount,
      ]),
    ).toEqual([
      ["pradosham", 300, "/poojas/regular/pradosham", 2],
      ["lord-shiva", null, "/poojas/special/lord-shiva", 1],
      ["no-such-page", 900, null, 0], // priced but no page, and nothing scheduled
    ]);
  });

  it("sets a price through the audited database function, never by writing the table", async () => {
    state.rpcResults["admin_set_pooja_price"] = {
      data: [{ old_amount: null, new_amount: "1250.50" }],
      error: null,
    };
    const r = await price({ amount: 1250.5, reason: "Approved by trustees" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true,
      oldAmount: null,
      newAmount: 1250.5,
    });
    expect(state.rpcCalls).toEqual([
      {
        name: "admin_set_pooja_price",
        args: {
          p_pooja_id: PID,
          p_amount: 1250.5,
          p_reason: "Approved by trustees",
        },
      },
    ]);
    expect(state.calls.filter((c) => c.op !== "select")).toHaveLength(0); // no direct table write
  });

  it("can withdraw a price (null) with a reason", async () => {
    state.rpcResults["admin_set_pooja_price"] = {
      data: [{ old_amount: "500.00", new_amount: null }],
      error: null,
    };
    const r = await price({ amount: null, reason: "Pending re-approval" });
    expect(await r.json()).toEqual({
      ok: true,
      oldAmount: 500,
      newAmount: null,
    });
  });

  it("validates the amount and requires a reason before touching the database", async () => {
    for (const bad of [
      { reason: "x valid" },
      { amount: 0, reason: "valid reason" },
      { amount: -5, reason: "valid reason" },
      { amount: 1000000.5, reason: "valid reason" },
      { amount: 10.123, reason: "valid reason" },
      { amount: "500", reason: "valid reason" },
      { amount: 500 },
      { amount: 500, reason: "" },
      { amount: 500, reason: "ab" },
      { amount: 500, reason: "valid reason", poojaId: PID },
      { amount: 500, reason: "valid reason", active: false },
    ]) {
      const r = await price(bad);
      expect([bad, r.status]).toEqual([bad, 400]);
    }
    expect(
      (await price({ amount: 500, reason: "valid" }, "not-a-uuid")).status,
    ).toBe(404);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("maps database refusals", async () => {
    const cases: [string, number, string][] = [
      ["forbidden", 403, "FORBIDDEN"],
      ["pooja_not_found", 404, "POOJA_NOT_FOUND"],
      ["no_change", 409, "NO_CHANGE"],
      ["invalid_amount", 400, "VALIDATION_ERROR"],
      ["reason_required", 400, "REASON_REQUIRED"],
    ];
    for (const [message, status, code] of cases) {
      state.rpcResults["admin_set_pooja_price"] = {
        data: null,
        error: { message },
      };
      const r = await price({ amount: 500, reason: "valid reason" });
      expect([r.status, (await r.json()).code]).toEqual([status, code]);
    }
  });

  it("there is no way to edit anything else about a pooja", async () => {
    for (const m of ["PATCH", "PUT", "DELETE"]) {
      expect((await call(m, `/poojas/${PID}`, { amount: 1 })).status).toBe(404);
    }
    expect(
      (
        await call("POST", "/poojas", {
          slug: "x",
          name: "x",
          type: "daily",
          amount: 1,
        })
      ).status,
    ).toBe(404);
    expect(state.calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("returns the price history, newest first, with who changed it", async () => {
    state.results["pooja_price_audit_log:select"] = {
      data: [
        {
          id: "a2",
          old_amount: "300.00",
          new_amount: "350.00",
          admin_email: "admin@example.com",
          reason: "Revision",
          created_at: "2026-11-15T12:00:00Z",
        },
        {
          id: "a1",
          old_amount: null,
          new_amount: "300.00",
          admin_email: null,
          reason: null,
          created_at: "2026-11-01T09:00:00Z",
        },
      ],
    };
    const body = await (
      await call("GET", `/poojas/${PID}/price-history`)
    ).json();
    expect(body.history).toEqual([
      {
        id: "a2",
        oldAmount: 300,
        newAmount: 350,
        adminEmail: "admin@example.com",
        reason: "Revision",
        createdAt: "2026-11-15T12:00:00Z",
      },
      {
        id: "a1",
        oldAmount: null,
        newAmount: 300,
        adminEmail: null,
        reason: null,
        createdAt: "2026-11-01T09:00:00Z",
      },
    ]);
    const c = state.calls.find((x) => x.table === "pooja_price_audit_log")!;
    expect(c.filters).toContainEqual(["eq", ["pooja_id", PID]]);
  });
});

describe("recurring schedules and Panchangam rules", () => {
  it("lists recurring schedules with pooja names", async () => {
    state.results["recurring_pooja_schedule:select"] = {
      data: [
        {
          id: SID,
          pooja_id: PID,
          recurrence: "weekly",
          weekday: 6,
          start_time: "06:30:00",
          active: true,
          poojas: { name: "Sani Pooja" },
        },
      ],
    };
    const body = await (await call("GET", "/recurring-schedules")).json();
    expect(body.rules).toEqual([
      {
        id: SID,
        poojaId: PID,
        poojaName: "Sani Pooja",
        recurrence: "weekly",
        weekday: 6,
        startTime: "06:30",
        active: true,
      },
    ]);
  });

  it("lists structured Panchangam rules (canonical values, not free text)", async () => {
    state.results["panchangam_pooja_rules:select"] = {
      data: [
        {
          id: SID,
          pooja_id: PID,
          tithis: ["chaturthi"],
          paksha: "krishna",
          nakshatras: null,
          start_time: "17:30:00",
          notes: null,
          active: true,
          poojas: { name: "Sankata Hara Chaturthi" },
        },
      ],
    };
    const body = await (await call("GET", "/panchangam-rules")).json();
    expect(body.rules).toEqual([
      {
        id: SID,
        poojaId: PID,
        poojaName: "Sankata Hara Chaturthi",
        tithis: ["chaturthi"],
        paksha: "krishna",
        nakshatras: [],
        startTime: "17:30",
        notes: null,
        active: true,
      },
    ]);
  });

  it.each([
    ["recurring-schedules", "recurring"],
    ["panchangam-rules", "panchangam"],
  ])(
    "%s: enable/disable goes through the audited function",
    async (path, kind) => {
      state.rpcResults["admin_schedule_rule_set_active"] = {
        data: [{ affected_count: 0 }],
        error: null,
      };
      const r = await call("PATCH", `/${path}/${SID}`, {
        active: false,
        reason: "Seasonal pause",
      });
      expect(r.status).toBe(200);
      expect(state.rpcCalls).toEqual([
        {
          name: "admin_schedule_rule_set_active",
          args: {
            p_kind: kind,
            p_id: SID,
            p_active: false,
            p_handling: null,
            p_reason: "Seasonal pause",
          },
        },
      ]);
      expect(state.calls.filter((c) => c.op !== "select")).toHaveLength(0);
    },
  );

  it("refuses to disable while live bookings exist, until the admin acknowledges them with a reason", async () => {
    state.rpcResults["admin_schedule_rule_set_active"] = {
      data: null,
      error: {
        message: "affected_bookings_unresolved",
        details: JSON.stringify({
          count: 3,
          orders: ["SKD-1", "SKD-2", "SKD-3"],
        }),
      },
    };
    const r = await call("PATCH", `/panchangam-rules/${SID}`, {
      active: false,
    });
    const j = await r.json();
    expect([r.status, j.code, j.liveBookings, j.orders]).toEqual([
      409,
      "AFFECTED_BOOKINGS",
      3,
      ["SKD-1", "SKD-2", "SKD-3"],
    ]);
    state.rpcResults["admin_schedule_rule_set_active"] = {
      data: [{ affected_count: 3 }],
      error: null,
    };
    const ok = await call("PATCH", `/panchangam-rules/${SID}`, {
      active: false,
      handling: "keep",
      reason: "Rewriting the rule",
    });
    expect(ok.status).toBe(200);
    expect(state.rpcCalls[state.rpcCalls.length - 1].args).toMatchObject({
      p_handling: "keep",
      p_reason: "Rewriting the rule",
    });
  });

  it("a rule change can never cancel or move bookings (only 'keep' is accepted)", async () => {
    for (const handling of ["cancel", "move", "delete"]) {
      const r = await call("PATCH", `/recurring-schedules/${SID}`, {
        active: false,
        handling,
        reason: "valid reason",
      });
      expect(r.status).toBe(400);
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("validates input and maps database refusals", async () => {
    for (const body of [
      {},
      { active: "no" },
      { active: false, weekday: 3 },
      { active: false, reason: "ab" },
    ]) {
      expect(
        (await call("PATCH", `/recurring-schedules/${SID}`, body)).status,
      ).toBe(400);
    }
    expect(
      (await call("PATCH", "/recurring-schedules/not-a-uuid", { active: true }))
        .status,
    ).toBe(404);
    state.rpcResults["admin_schedule_rule_set_active"] = {
      data: null,
      error: { message: "schedule_not_found" },
    };
    expect(
      (await call("PATCH", `/recurring-schedules/${SID}`, { active: true }))
        .status,
    ).toBe(404);
    state.rpcResults["admin_schedule_rule_set_active"] = {
      data: null,
      error: { message: "no_change" },
    };
    expect(
      (await call("PATCH", `/recurring-schedules/${SID}`, { active: true }))
        .status,
    ).toBe(409);
  });
});

describe("special schedules", () => {
  const special = {
    id: SID,
    pooja_id: PID,
    date: "2099-01-14",
    start_time: "10:00:00",
    notes: null,
    active: true,
    poojas: { name: "Homam" },
  };

  it("lists dates with live booking counts (one booking query, not one per date)", async () => {
    state.results["special_pooja_schedule:select"] = {
      data: [special, { ...special, id: "s2", date: "2099-02-01" }],
    };
    state.results["bookings:select"] = {
      data: [{ pooja_id: PID, booking_date: "2099-01-14" }],
    };
    const body = await (await call("GET", "/special-schedules")).json();
    expect(body.dates.map((d: any) => [d.date, d.liveBookings])).toEqual([
      ["2099-01-14", 1],
      ["2099-02-01", 0],
    ]);
    expect(state.calls.filter((c) => c.table === "bookings")).toHaveLength(1);
  });

  describe("create", () => {
    const create = (body: any) => call("POST", "/special-schedules", body);
    beforeEach(() => {
      state.rpcResults["admin_special_schedule_create"] = {
        data: SID,
        error: null,
      };
      state.results["special_pooja_schedule:select"] = { data: special };
    });

    it("schedules a special pooja on a date through the audited function", async () => {
      const r = await create({
        poojaId: PID,
        date: "2099-01-14",
        startTime: "10:00",
        notes: "Bring flowers",
        reason: "Trustee request",
      });
      expect(r.status).toBe(201);
      expect(state.rpcCalls).toEqual([
        {
          name: "admin_special_schedule_create",
          args: {
            p_pooja_id: PID,
            p_date: "2099-01-14",
            p_start_time: "10:00",
            p_notes: "Bring flowers",
            p_reason: "Trustee request",
          },
        },
      ]);
      expect((await r.json()).date).toMatchObject({
        date: "2099-01-14",
        poojaName: "Homam",
        startTime: "10:00",
      });
      expect(state.calls.filter((c) => c.op !== "select")).toHaveLength(0);
    });
    it("validates input; clients cannot supply prices, active flags or ids", async () => {
      for (const body of [
        { date: "2099-01-14" },
        { poojaId: "nope", date: "2099-01-14" },
        { poojaId: PID, date: "2099-02-30" },
        { poojaId: PID, date: "2099-01-14", startTime: "25:99" },
        { poojaId: PID, date: "2099-01-14", amount: 100 },
        { poojaId: PID, date: "2099-01-14", active: false },
        { poojaId: PID, date: "2099-01-14", notes: "x".repeat(501) },
        { poojaId: PID, date: "2099-01-14", reason: "ab" },
      ]) {
        expect((await create(body)).status).toBe(400);
      }
      expect(state.rpcCalls).toHaveLength(0);
    });
    it("maps database refusals (past date, wrong pooja type, unknown pooja, duplicate)", async () => {
      const cases: [any, number, string][] = [
        [{ message: "date_in_past" }, 400, "DATE_IN_PAST"],
        [{ message: "not_a_special_pooja" }, 400, "NOT_A_SPECIAL_POOJA"],
        [{ message: "pooja_not_found" }, 404, "POOJA_NOT_FOUND"],
        [{ code: "23505", message: "duplicate key" }, 409, "DUPLICATE_DATE"],
        [{ message: "forbidden" }, 403, "FORBIDDEN"],
      ];
      for (const [error, status, code] of cases) {
        state.rpcResults["admin_special_schedule_create"] = {
          data: null,
          error,
        };
        const r = await create({ poojaId: PID, date: "2099-01-14" });
        expect([r.status, (await r.json()).code]).toEqual([status, code]);
      }
    });
  });

  describe("edit / disable / enable", () => {
    const patch = (body: any) =>
      call("PATCH", `/special-schedules/${SID}`, body);
    beforeEach(() => {
      state.rpcResults["admin_special_schedule_update"] = {
        data: [{ affected_count: 0, cancelled_count: 0, moved_count: 0 }],
        error: null,
      };
      state.results["special_pooja_schedule:select"] = { data: special };
    });

    it("edits time and notes through the audited function", async () => {
      const r = await patch({
        startTime: "11:30",
        notes: "Moved to the hall",
        reason: "Hall booked",
      });
      expect(r.status).toBe(200);
      expect(state.rpcCalls[0]).toEqual({
        name: "admin_special_schedule_update",
        args: {
          p_id: SID,
          p_patch: { start_time: "11:30", notes: "Moved to the hall" },
          p_handling: null,
          p_reason: "Hall booked",
        },
      });
      expect(state.calls.filter((c) => c.op !== "select")).toHaveLength(0);
    });
    it("disables and re-enables a date", async () => {
      await patch({ active: false });
      await patch({ active: true });
      expect(state.rpcCalls.map((c) => c.args.p_patch)).toEqual([
        { active: false },
        { active: true },
      ]);
    });

    it("never moves or disables a booked date silently: the database refuses until the admin chooses", async () => {
      state.rpcResults["admin_special_schedule_update"] = {
        data: null,
        error: {
          message: "affected_bookings_unresolved",
          details: JSON.stringify({ count: 2, orders: ["SKD-A", "SKD-B"] }),
        },
      };
      for (const body of [{ active: false }, { date: "2099-01-20" }]) {
        const r = await patch(body);
        const j = await r.json();
        expect([r.status, j.code, j.liveBookings, j.orders]).toEqual([
          409,
          "AFFECTED_BOOKINGS",
          2,
          ["SKD-A", "SKD-B"],
        ]);
      }
    });

    it.each(["keep", "cancel", "move"])(
      "passes the explicit '%s' choice and reason to the database, and reports the outcome",
      async (handling) => {
        state.rpcResults["admin_special_schedule_update"] = {
          data: [
            {
              affected_count: 2,
              cancelled_count: handling === "cancel" ? 2 : 0,
              moved_count: handling === "move" ? 2 : 0,
            },
          ],
          error: null,
        };
        const r = await patch({
          date: "2099-01-20",
          handling,
          reason: "Festival date changed",
        });
        expect(r.status).toBe(200);
        expect(state.rpcCalls[0].args).toEqual({
          p_id: SID,
          p_patch: { date: "2099-01-20" },
          p_handling: handling,
          p_reason: "Festival date changed",
        });
        expect((await r.json()).affected).toEqual({
          bookings: 2,
          cancelled: handling === "cancel" ? 2 : 0,
          moved: handling === "move" ? 2 : 0,
        });
      },
    );

    it("rejects invalid handling, empty patches, unknown fields and short reasons without touching the database", async () => {
      for (const body of [
        {},
        { poojaId: PID },
        { amount: 5 },
        { startTime: "9am" },
        { active: false, handling: "delete" },
        { active: false, handling: "keep", reason: "ab" },
        { active: false, confirmAffectedBookings: true }, // the old silent-confirm flag no longer exists
      ]) {
        expect([body, (await patch(body)).status]).toEqual([body, 400]);
      }
      expect(
        (
          await call("PATCH", "/special-schedules/not-a-uuid", {
            active: false,
          })
        ).status,
      ).toBe(404);
      expect(state.rpcCalls).toHaveLength(0);
    });

    it("maps database refusals", async () => {
      const cases: [any, number, string][] = [
        [{ message: "schedule_not_found" }, 404, "NOT_FOUND"],
        [{ message: "date_in_past" }, 400, "DATE_IN_PAST"],
        [{ message: "schedule_in_past" }, 409, "SCHEDULE_IN_PAST"],
        [{ message: "reason_required" }, 400, "REASON_REQUIRED"],
        [{ message: "invalid_handling" }, 400, "INVALID_HANDLING"],
        [
          {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "special_pooja_schedule_pooja_id_date_key"',
          },
          409,
          "DUPLICATE_DATE",
        ],
        [
          {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "bookings_active_dedupe_key"',
          },
          409,
          "MOVE_CONFLICT",
        ],
      ];
      for (const [error, status, code] of cases) {
        state.rpcResults["admin_special_schedule_update"] = {
          data: null,
          error,
        };
        const r = await patch({
          date: "2099-03-01",
          handling: "move",
          reason: "valid reason",
        });
        expect([r.status, (await r.json()).code]).toEqual([status, code]);
      }
    });

    it("returns a generic 500 on unexpected database failure", async () => {
      state.rpcResults["admin_special_schedule_update"] = {
        data: null,
        error: { message: "secret db detail" },
      };
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await patch({ notes: "x" });
      expect(r.status).toBe(500);
      expect(JSON.stringify(await r.json())).not.toContain("secret");
      spy.mockRestore();
    });
  });
});

describe("GET /schedule-audit", () => {
  it("returns recent schedule changes with who, when, old and new values", async () => {
    state.results["schedule_audit_log:select"] = {
      data: [
        {
          id: "e1",
          schedule_table: "special_pooja_schedule",
          action: "update",
          pooja_name: "Homam",
          admin_email: "admin@example.com",
          old_values: { date: "2099-01-14" },
          new_values: { date: "2099-01-20" },
          reason: "Festival date changed",
          affected_handling: "move",
          affected_bookings: ["SKD-A"],
          created_at: "2026-11-15T12:00:00Z",
        },
      ],
    };
    const body = await (await call("GET", "/schedule-audit?limit=500")).json();
    expect(body.entries).toEqual([
      {
        id: "e1",
        table: "special_pooja_schedule",
        action: "update",
        poojaName: "Homam",
        adminEmail: "admin@example.com",
        oldValues: { date: "2099-01-14" },
        newValues: { date: "2099-01-20" },
        reason: "Festival date changed",
        affectedHandling: "move",
        affectedBookings: ["SKD-A"],
        createdAt: "2026-11-15T12:00:00Z",
      },
    ]);
    const c = state.calls.find((x) => x.table === "schedule_audit_log")!;
    expect(c.filters).toContainEqual(["limit", [100]]); // capped
  });
});

describe("rate limiting stays on by default for the admin API", () => {
  it("throttles repeated unauthenticated requests", async () => {
    const s = createServer().listen(0);
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/admin/me`;
    const codes: number[] = [];
    for (let i = 0; i < 245; i++) codes.push((await fetch(url)).status);
    s.close();
    expect(codes.slice(0, 240).every((c) => c === 401)).toBe(true);
    expect(codes.slice(240).every((c) => c === 429)).toBe(true);
  });
});

// =================================================================================
describe("festival offerings", () => {
  const FID = "55555555-5555-4555-8555-555555555555";
  const TEMPLATE = "66666666-6666-4666-8666-666666666666";
  const festivalRow = {
    id: FID,
    pooja_id: PID,
    template_pooja_id: TEMPLATE,
    festival_name: "Diwali",
    pooja_name: "Lakshmi Pooja",
    description: "Evening pooja",
    date: "2099-11-01",
    start_time: "18:00:00",
    booking_opens_on: null,
    booking_closes_on: null,
    max_bookings: 10,
    active: true,
    poojas: {
      slug: "festival-diwali-lakshmi-pooja-20991101",
      amount_inr: "1501.00",
    },
  };
  const valid = {
    festivalName: "Diwali",
    poojaName: "Lakshmi Pooja",
    description: "Evening pooja",
    date: "2099-11-01",
    startTime: "18:00",
    amount: 1501,
    bookingOpensOn: "2099-10-01",
    bookingClosesOn: "2099-10-30",
    maxBookings: 10,
    active: true,
    templatePoojaId: TEMPLATE,
  };
  const noWrites = () =>
    expect(state.calls.filter((c) => c.op !== "select")).toHaveLength(0);

  beforeEach(() => {
    state.rpcResults["admin_festival_create"] = {
      data: [{ o_festival_id: FID, o_pooja_id: PID, o_slug: "x" }],
      error: null,
    };
    state.rpcResults["admin_festival_update"] = {
      data: [{ affected_count: 0, cancelled_count: 0, moved_count: 0 }],
      error: null,
    };
    state.results["festival_offerings:select"] = { data: festivalRow };
    state.results["bookings:select"] = { data: [{ pooja_id: PID }] };
  });

  describe("creating", () => {
    it("creates through the audited function with the offering's own fixed amount", async () => {
      const r = await call("POST", "/festivals", valid);
      expect(r.status).toBe(201);
      expect(state.rpcCalls[0]).toEqual({
        name: "admin_festival_create",
        args: {
          p_festival_name: "Diwali",
          p_pooja_name: "Lakshmi Pooja",
          p_description: "Evening pooja",
          p_date: "2099-11-01",
          p_start_time: "18:00",
          p_amount: 1501,
          p_opens_on: "2099-10-01",
          p_closes_on: "2099-10-30",
          p_max_bookings: 10,
          p_active: true,
          p_template_pooja_id: TEMPLATE,
          p_reason: null,
        },
      });
      const j = await r.json();
      expect(j.festival).toMatchObject({
        festivalName: "Diwali",
        amount: 1501,
        startTime: "18:00",
        liveBookings: 1,
        maxBookings: 10,
        destination: "/poojas/festival/festival-diwali-lakshmi-pooja-20991101",
      });
      noWrites();
      expect(serviceClientUsed).not.toHaveBeenCalled();
    });

    it("using a template never touches the template's price", async () => {
      await call("POST", "/festivals", valid);
      expect(state.rpcCalls.map((c) => c.name)).toEqual([
        "admin_festival_create",
      ]);
      noWrites();
    });

    it("applies defaults for optional fields", async () => {
      await call("POST", "/festivals", {
        festivalName: "Pongal",
        poojaName: "Sooriya Pooja",
        date: "2099-01-14",
        amount: 250.5,
      });
      expect(state.rpcCalls[0].args).toMatchObject({
        p_description: null,
        p_start_time: null,
        p_opens_on: null,
        p_closes_on: null,
        p_max_bookings: null,
        p_active: true,
        p_template_pooja_id: null,
        p_amount: 250.5,
      });
    });

    it.each([
      ["no amount", { amount: undefined }],
      ["zero", { amount: 0 }],
      ["negative", { amount: -10 }],
      ["three decimals", { amount: 10.123 }],
      ["too large", { amount: 1000001 }],
      ["a string", { amount: "500" }],
      ["empty festival", { festivalName: "  " }],
      ["empty pooja", { poojaName: "" }],
      ["bad date", { date: "2099-13-45" }],
      ["bad time", { startTime: "25:00" }],
      ["zero capacity", { maxBookings: 0 }],
      ["fractional capacity", { maxBookings: 2.5 }],
      ["unknown field", { price: 5 }],
      ["a non-uuid template", { templatePoojaId: "nope" }],
    ])("rejects %s before the database", async (_n, over) => {
      const r = await call("POST", "/festivals", { ...valid, ...over });
      expect(r.status).toBe(400);
      expect(state.rpcCalls).toHaveLength(0);
    });

    it.each([
      ["date_in_past", 400, "DATE_IN_PAST"],
      ["invalid_window", 400, "INVALID_WINDOW"],
      ["duplicate_festival", 409, "DUPLICATE_FESTIVAL"],
      ["template_not_allowed", 400, "TEMPLATE_NOT_ALLOWED"],
      ["invalid_amount", 400, "VALIDATION_ERROR"],
      ["forbidden", 403, "FORBIDDEN"],
    ])("maps the database error %s to %i %s", async (msg, status, code) => {
      state.rpcResults["admin_festival_create"] = {
        data: null,
        error: { message: msg },
      };
      const r = await call("POST", "/festivals", valid);
      expect([r.status, (await r.json()).code]).toEqual([status, code]);
    });
  });

  describe("editing", () => {
    const patch = (body: any) => call("PATCH", `/festivals/${FID}`, body);

    it("sends only the changed fields, with the reason, to the audited function", async () => {
      const r = await patch({
        description: "New text",
        amount: 1800,
        startTime: "19:00",
        maxBookings: null,
        reason: "Price and time revised",
      });
      expect(r.status).toBe(200);
      expect(state.rpcCalls[0]).toEqual({
        name: "admin_festival_update",
        args: {
          p_id: FID,
          p_patch: {
            description: "New text",
            amount: 1800,
            start_time: "19:00",
            max_bookings: null,
          },
          p_handling: null,
          p_reason: "Price and time revised",
        },
      });
      noWrites();
    });

    it("requires a reason, and something to change", async () => {
      expect((await patch({ amount: 5 })).status).toBe(400);
      expect((await patch({ reason: "Just because" })).status).toBe(400);
      expect(
        (await patch({ amount: null, reason: "Remove price" })).status,
      ).toBe(400);
      expect(state.rpcCalls).toHaveLength(0);
    });

    it("never moves or deactivates a booked festival silently: the admin must choose", async () => {
      state.rpcResults["admin_festival_update"] = {
        data: null,
        error: {
          message: "affected_bookings_unresolved",
          details: JSON.stringify({
            count: 3,
            orders: ["SKD-A", "SKD-B", "SKD-C"],
          }),
        },
      };
      for (const body of [
        { active: false, reason: "Cancelled" },
        { date: "2099-11-05", reason: "Moved" },
      ]) {
        const r = await patch(body);
        const j = await r.json();
        expect([r.status, j.code, j.liveBookings, j.orders]).toEqual([
          409,
          "AFFECTED_BOOKINGS",
          3,
          ["SKD-A", "SKD-B", "SKD-C"],
        ]);
      }
    });

    it.each(["keep", "cancel", "move"])(
      "passes the explicit '%s' choice to the database and reports the outcome",
      async (handling) => {
        state.rpcResults["admin_festival_update"] = {
          data: [{ affected_count: 3, cancelled_count: 3, moved_count: 0 }],
          error: null,
        };
        const r = await patch({
          date: "2099-11-05",
          handling,
          reason: "Date changed",
        });
        expect(r.status).toBe(200);
        expect(state.rpcCalls[0].args).toMatchObject({
          p_handling: handling,
          p_reason: "Date changed",
          p_patch: { date: "2099-11-05" },
        });
        expect((await r.json()).affected).toEqual({
          bookings: 3,
          cancelled: 3,
          moved: 0,
        });
      },
    );

    it("rejects an unknown handling choice, and a non-uuid id", async () => {
      expect(
        (await patch({ active: false, handling: "delete", reason: "x yz" }))
          .status,
      ).toBe(400);
      expect(
        (
          await call("PATCH", "/festivals/not-a-uuid", {
            active: false,
            reason: "Reason",
          })
        ).status,
      ).toBe(404);
      expect(state.rpcCalls).toHaveLength(0);
    });

    it("activates and deactivates through the same audited path", async () => {
      await patch({ active: false, reason: "Paused" });
      await patch({ active: true, reason: "Resumed" });
      expect(state.rpcCalls.map((c) => c.args.p_patch)).toEqual([
        { active: false },
        { active: true },
      ]);
    });
  });

  describe("listing, bookings and history", () => {
    it("lists offerings with their own price, window state and live booking count", async () => {
      state.results["festival_offerings:select"] = { data: [festivalRow] };
      const j = await (await call("GET", "/festivals")).json();
      expect(j.festivals).toHaveLength(1);
      expect(j.festivals[0]).toMatchObject({
        id: FID,
        amount: 1501,
        liveBookings: 1,
        maxBookings: 10,
        state: "open",
      });
    });

    it("shows a full offering as full", async () => {
      state.results["festival_offerings:select"] = {
        data: [{ ...festivalRow, max_bookings: 1 }],
      };
      const j = await (await call("GET", "/festivals")).json();
      expect(j.festivals[0].state).toBe("full");
    });

    it("lists the bookings of one festival by its pooja id", async () => {
      state.results["bookings:select"] = { data: [bookingRow], count: 1 };
      const r = await call("GET", `/bookings?poojaId=${PID}`);
      expect(r.status).toBe(200);
      const c = state.calls.find((x) => x.table === "bookings")!;
      expect(c.filters).toContainEqual(["eq", ["pooja_id", PID]]);
      expect((await call("GET", "/bookings?poojaId=nope")).status).toBe(400);
    });

    it("returns schedule changes and price changes for the audit history", async () => {
      state.results["festival_offerings:select"] = { data: { pooja_id: PID } };
      state.results["schedule_audit_log:select"] = {
        data: [
          {
            id: "a1",
            schedule_table: "festival_offerings",
            action: "update",
            pooja_name: "Lakshmi Pooja",
            admin_email: "admin@example.com",
            old_values: { start_time: "18:00:00" },
            new_values: { start_time: "19:00:00" },
            reason: "Later start",
            affected_handling: null,
            affected_bookings: null,
            created_at: "2099-01-01T00:00:00Z",
          },
        ],
      };
      state.results["pooja_price_audit_log:select"] = {
        data: [
          {
            id: "p1",
            old_amount: "1500.00",
            new_amount: "1501.00",
            admin_email: "admin@example.com",
            reason: "Rounded",
            created_at: "2099-01-02T00:00:00Z",
          },
        ],
      };
      const j = await (await call("GET", `/festivals/${FID}/history`)).json();
      expect(j.changes[0]).toMatchObject({
        table: "festival_offerings",
        adminEmail: "admin@example.com",
        reason: "Later start",
        oldValues: { start_time: "18:00:00" },
        newValues: { start_time: "19:00:00" },
      });
      expect(j.prices[0]).toMatchObject({
        oldAmount: 1500,
        newAmount: 1501,
        reason: "Rounded",
      });
      const audit = state.calls.find((c) => c.table === "schedule_audit_log")!;
      expect(audit.filters).toContainEqual(["eq", ["record_id", FID]]);
    });

    it("404s the history of an unknown festival", async () => {
      state.results["festival_offerings:select"] = { data: null };
      expect((await call("GET", `/festivals/${FID}/history`)).status).toBe(404);
    });

    it("the standard catalogue list leaves festival offerings out", async () => {
      await call("GET", "/poojas");
      const c = state.calls.find((x) => x.table === "poojas")!;
      expect(c.filters).toContainEqual(["neq", ["type", "festival"]]);
    });
  });

  describe("permissions", () => {
    it("a signed-in user who is not an administrator is refused on every festival route", async () => {
      state.isAdmin = false;
      for (const [m, p, b] of ROUTES.filter(([, path]) =>
        path.includes("festival"),
      )) {
        const r = await call(m, p, b);
        expect([m, p, r.status]).toEqual([m, p, 403]);
      }
      expect(state.rpcCalls).toHaveLength(0);
      expect(state.calls).toHaveLength(0);
    });
  });
});
