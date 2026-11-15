import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---- Minimal chainable fake of the supabase-js query builder -----------------
type Result = { data: any; error: any };
const state: {
  results: Record<string, Result | Result[]>;
  inserts: any[];
  updates: any[];
  filters: { table: string; op: string; col: string; val: any }[];
  calls: number;
} = { results: {}, inserts: [], updates: [], filters: [], calls: 0 };

function next(key: string, fallback: Result): Result {
  const r = state.results[key];
  if (Array.isArray(r)) return r.length > 1 ? r.shift()! : r[0];
  return r ?? fallback;
}

function builder(table: string) {
  state.calls++;
  let mode: "select" | "insert" | "update" = "select";
  const eq = (op: string) => (col: string, val: any) => (
    state.filters.push({ table, op, col, val }),
    b
  );
  const b: any = {
    select: () => b,
    eq: eq("eq"),
    neq: eq("neq"),
    in: eq("in"),
    order: () => b,
    limit: () => b,
    insert: (row: any) => (
      (mode = "insert"),
      state.inserts.push({ table, row }),
      b
    ),
    update: (row: any) => (
      (mode = "update"),
      state.updates.push({ table, row }),
      b
    ),
    single: () =>
      Promise.resolve(next(`${table}:${mode}`, { data: null, error: null })),
    maybeSingle: () =>
      Promise.resolve(next(`${table}:${mode}`, { data: null, error: null })),
    then: (res: any, rej: any) =>
      Promise.resolve(next(`${table}:${mode}`, { data: [], error: null })).then(
        res,
        rej,
      ),
  };
  return b;
}

vi.mock("../lib/supabase", () => ({
  getServiceClient: () => ({ from: builder }),
}));

const fallback = {
  get: vi.fn((_d: string) => null as any),
  fill: vi.fn(async (_d: string[]) => 0),
};
vi.mock("../lib/panchangFallback", () => ({ panchangFallback: fallback }));

const { createServer } = await import("../index");

let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer({ rateLimiting: false }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  state.results = {};
  state.inserts = [];
  state.updates = [];
  state.filters = [];
  state.calls = 0;
});

const call = (method: string, path: string, body?: any, token?: string) =>
  fetch(base + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const post = (path: string, body: any, token?: string) =>
  call("POST", path, body, token);

const future = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 10);
  return d.toISOString().slice(0, 10);
})();
const input = {
  poojaSlug: "pradosham",
  date: future,
  name: "Test Devotee",
  phone: "9876543210",
  email: "t@example.com",
};
const ORDER = "SKD-261115-A1B2C3";
const TOKEN = "A".repeat(43);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const row = {
  order_no: ORDER,
  pooja_name: "Pradosham",
  booking_date: future,
  amount_inr: 500,
  status: "pending",
  payment_status: "unpaid",
};
const pricedDaily = {
  data: { id: "p1", name: "Pradosham", type: "daily", amount_inr: 500 },
  error: null,
};
const dailyRule = {
  data: [{ recurrence: "daily", weekday: null }],
  error: null,
};

describe("POST /api/bookings", () => {
  it("creates a booking: returns the DB order number, server price, and a one-time token", async () => {
    state.results["poojas:select"] = pricedDaily;
    state.results["recurring_pooja_schedule:select"] = dailyRule;
    state.results["bookings:insert"] = { data: row, error: null };
    const r = await post("/api/bookings", {
      ...input,
      sankalpam: "For family wellbeing",
    });
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body.booking).toEqual({
      orderNo: ORDER,
      poojaName: "Pradosham",
      date: future,
      amount: 500,
      status: "pending",
      paymentStatus: "unpaid",
    });
    expect(body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.booking.phone).toBeUndefined(); // contact details are never echoed
    const ins = state.inserts[0].row;
    expect(ins.amount_inr).toBe(500); // price comes from the server
    expect(ins.sankalpam).toBe("For family wellbeing");
    expect(ins.access_token_hash).toBe(sha(body.accessToken)); // only the hash is stored
    expect(JSON.stringify(ins)).not.toContain(body.accessToken);
    expect(ins.payment_status).toBeUndefined(); // DB default 'unpaid'
  });

  it("400s on validation errors without touching the database", async () => {
    for (const bad of [
      { ...input, email: "bad" },
      { ...input, phone: "123" },
      { ...input, name: "" },
      { ...input, date: "2027-02-30" },
      { ...input, amount: 1 }, // clients cannot set a price
      { ...input, paymentStatus: "verified" },
    ]) {
      const r = await post("/api/bookings", bad);
      expect(r.status).toBe(400);
      expect((await r.json()).code).toBe("VALIDATION_ERROR");
    }
    expect(state.calls).toBe(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects past dates", async () => {
    const r = await post("/api/bookings", { ...input, date: "2020-01-01" });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("DATE_OUT_OF_RANGE");
  });

  it("refuses to book a pooja with no approved price", async () => {
    state.results["poojas:select"] = {
      data: { id: "p1", name: "Pradosham", type: "daily", amount_inr: null },
      error: null,
    };
    const r = await post("/api/bookings", input);
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("PRICE_NOT_APPROVED");
    expect(state.inserts).toHaveLength(0);
  });

  it("404s for an unknown pooja and refuses unscheduled dates", async () => {
    expect((await post("/api/bookings", input)).status).toBe(404);
    state.results["poojas:select"] = {
      data: { id: "p1", name: "Homam", type: "special", amount_inr: 1000 },
      error: null,
    };
    state.results["special_pooja_schedule:select"] = { data: [], error: null };
    const r = await post("/api/bookings", input);
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("NOT_SCHEDULED");
  });

  it("409s on a duplicate booking (double submit)", async () => {
    state.results["poojas:select"] = pricedDaily;
    state.results["recurring_pooja_schedule:select"] = dailyRule;
    state.results["bookings:insert"] = {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "bookings_active_dedupe_key"',
      },
    };
    const r = await post("/api/bookings", input);
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("DUPLICATE_BOOKING");
    expect(state.inserts).toHaveLength(1); // not retried
  });

  it("retries on an order-number collision", async () => {
    state.results["poojas:select"] = pricedDaily;
    state.results["recurring_pooja_schedule:select"] = dailyRule;
    state.results["bookings:insert"] = [
      {
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "bookings_order_no_key"',
        },
      },
      { data: row, error: null },
    ];
    const r = await post("/api/bookings", input);
    expect(r.status).toBe(201);
    expect(state.inserts).toHaveLength(2);
  });

  it("returns a generic 500 without leaking database details", async () => {
    state.results["poojas:select"] = {
      data: null,
      error: { message: "secret db detail" },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await post("/api/bookings", input);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
    spy.mockRestore();
  });
});

describe("payment submission requires the booking token", () => {
  const pay = { upiRef: "123456789012" };
  const url = `/api/bookings/${ORDER}/payment`;

  it("order number alone (no token) is rejected before any database access", async () => {
    const r = await post(url, pay);
    expect(r.status).toBe(401);
    expect(state.calls).toBe(0);
  });

  it("a malformed token is rejected before any database access", async () => {
    for (const t of [
      "short",
      "A".repeat(42),
      "A".repeat(44),
      "A".repeat(42) + "!",
    ]) {
      expect((await post(url, pay, t)).status).toBe(401);
    }
    expect(state.calls).toBe(0);
  });

  it("a well-formed but wrong token cannot see or update the booking", async () => {
    // DB finds no row for (order_no, hash(token))
    const r = await post(url, pay, "B".repeat(43));
    expect(r.status).toBe(404);
    expect(state.updates).toHaveLength(0);
    expect(state.filters).toContainEqual({
      table: "bookings",
      op: "eq",
      col: "access_token_hash",
      val: sha("B".repeat(43)),
    });
  });

  it("phone number is no substitute for the token (extra fields rejected)", async () => {
    const r = await post(url, { ...pay, phone: "9876543210" }, TOKEN);
    expect(r.status).toBe(400);
  });

  it("with the right token sets awaiting_verification — never verified — and scopes the update by token", async () => {
    state.results["bookings:select"] = { data: row, error: null };
    state.results["bookings:update"] = {
      data: { ...row, payment_status: "awaiting_verification" },
      error: null,
    };
    const r = await post(url, pay, TOKEN);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.booking.paymentStatus).toBe("awaiting_verification");
    expect(body.message).toMatch(/awaiting verification/i);
    expect(state.updates[0].row.payment_status).toBe("awaiting_verification");
    expect(state.updates[0].row.amount_inr).toBeUndefined();
    const hashFilters = state.filters.filter(
      (f) => f.col === "access_token_hash",
    );
    expect(hashFilters).toHaveLength(2); // lookup AND update
    expect(hashFilters.every((f) => f.val === sha(TOKEN))).toBe(true);
  });

  it("rejects attempts to pass a payment status or amount", async () => {
    for (const extra of [
      { paymentStatus: "verified" },
      { amount: 1 },
      { status: "confirmed" },
    ]) {
      expect((await post(url, { ...pay, ...extra }, TOKEN)).status).toBe(400);
    }
  });

  it("blocks resubmission once awaiting verification or verified", async () => {
    for (const ps of ["awaiting_verification", "verified"]) {
      state.updates = [];
      state.results["bookings:select"] = {
        data: { ...row, payment_status: ps },
        error: null,
      };
      const r = await post(url, pay, TOKEN);
      expect(r.status).toBe(409);
      expect((await r.json()).code).toBe("PAYMENT_ALREADY_SUBMITTED");
      expect(state.updates).toHaveLength(0);
    }
  });

  it("blocks payment on a cancelled booking", async () => {
    state.results["bookings:select"] = {
      data: { ...row, status: "cancelled" },
      error: null,
    };
    const r = await post(url, pay, TOKEN);
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("BOOKING_CANCELLED");
  });

  it("409s when the UPI reference is already used by another booking", async () => {
    state.results["bookings:select"] = { data: row, error: null };
    state.results["bookings:update"] = {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "bookings_upi_ref_active_key"',
      },
    };
    const r = await post(url, pay, TOKEN);
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("DUPLICATE_PAYMENT_REF");
  });

  it("409s when the booking state changed concurrently", async () => {
    state.results["bookings:select"] = { data: row, error: null };
    state.results["bookings:update"] = { data: null, error: null };
    expect((await post(url, pay, TOKEN)).status).toBe(409);
  });

  it("validates the UPI reference format", async () => {
    expect((await post(url, { upiRef: "12 34" }, TOKEN)).status).toBe(400);
  });

  it("returns a generic 500 on a database failure", async () => {
    state.results["bookings:select"] = {
      data: null,
      error: { message: "connection string leak" },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await post(url, pay, TOKEN);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("leak");
    spy.mockRestore();
  });
});

describe("payments gate (production safety)", () => {
  const url = `/api/bookings/${ORDER}/payment`;
  const pay = { upiRef: "123456789012" };
  afterEach(() => vi.unstubAllEnvs());

  it("production without PAYMENTS_LIVE refuses payment references and writes nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_LIVE", "");
    state.results["bookings:select"] = { data: row, error: null };
    const r = await post(url, pay, TOKEN);
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("PAYMENTS_UNAVAILABLE");
    expect(state.calls).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it("production with anything other than PAYMENTS_LIVE=true stays closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_LIVE", "yes");
    expect((await post(url, pay, TOKEN)).status).toBe(503);
  });

  it("still requires the token before revealing anything", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await post(url, pay)).status).toBe(401);
  });

  it("production with PAYMENTS_LIVE=true accepts the reference (awaiting verification only)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_LIVE", "true");
    state.results["bookings:select"] = { data: row, error: null };
    state.results["bookings:update"] = {
      data: { ...row, payment_status: "awaiting_verification" },
      error: null,
    };
    const r = await post(url, pay, TOKEN);
    expect(r.status).toBe(200);
    expect(state.updates[0].row.payment_status).toBe("awaiting_verification");
  });

  it("non-production (dev/test) allows the flow to be built", async () => {
    state.results["bookings:select"] = { data: row, error: null };
    state.results["bookings:update"] = {
      data: { ...row, payment_status: "awaiting_verification" },
      error: null,
    };
    expect((await post(url, pay, TOKEN)).status).toBe(200);
  });
});

describe("GET /api/bookings/:orderNo", () => {
  it("requires the token, and returns only public fields", async () => {
    expect((await call("GET", `/api/bookings/${ORDER}`)).status).toBe(401);
    expect(state.calls).toBe(0);
    state.results["bookings:select"] = {
      data: { ...row, phone: "9876543210", email: "x@y.z" },
      error: null,
    };
    const r = await call("GET", `/api/bookings/${ORDER}`, undefined, TOKEN);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain("9876543210");
    expect(text).not.toContain("x@y.z");
    expect(state.filters).toContainEqual({
      table: "bookings",
      op: "eq",
      col: "access_token_hash",
      val: sha(TOKEN),
    });
  });
  it("404s for the wrong token", async () => {
    expect(
      (await call("GET", `/api/bookings/${ORDER}`, undefined, "C".repeat(43)))
        .status,
    ).toBe(404);
  });
});

describe("GET /api/poojas", () => {
  it("lists a destination, and only priced poojas that have a public page are bookable", async () => {
    state.results["poojas:select"] = {
      data: [
        {
          slug: "pradosham",
          name: "Pradosham",
          type: "panchangam",
          description: null,
          amount_inr: 500,
        },
        {
          slug: "lord-shiva",
          name: "Lord Shiva",
          type: "special",
          description: null,
          amount_inr: null,
        },
        {
          slug: "no-such-page",
          name: "Pageless",
          type: "special",
          description: null,
          amount_inr: 900,
        },
        {
          slug: "annadanam",
          name: "Annadanam",
          type: "daily",
          description: null,
          amount_inr: 50,
        },
      ],
      error: null,
    };
    const body = await (await call("GET", "/api/poojas")).json();
    expect(
      body.poojas.map((p: any) => [
        p.slug,
        p.amount,
        p.destination,
        p.bookable,
      ]),
    ).toEqual([
      ["pradosham", 500, "/poojas/regular/pradosham", true],
      ["lord-shiva", null, "/poojas/special/lord-shiva", false], // no approved price
      ["no-such-page", 900, null, false], // priced but no page
      ["annadanam", 50, null, false], // donation flow, never a booking
    ]);
  });
});

describe("booking validation uses the same scheduling rules as the calendar", () => {
  const panch = (slug: string, amount = 500) => {
    state.results["poojas:select"] = {
      data: { id: "p1", name: slug, type: "panchangam", amount_inr: amount },
      error: null,
    };
    state.results["bookings:insert"] = { data: row, error: null };
  };
  const rules = (...r: object[]) => {
    state.results["panchangam_pooja_rules:select"] = {
      data: r.map((x) => ({
        pooja_id: "p1",
        tithis: null,
        paksha: null,
        nakshatras: null,
        start_time: null,
        ...x,
      })),
      error: null,
    };
  };
  const day = (tithi: string, paksha: string, nakshatra: string) => {
    state.results["pooja_days:select"] = {
      data: { tithi, paksha, nakshatra },
      error: null,
    };
  };
  const book = (slug: string) =>
    post("/api/bookings", { ...input, poojaSlug: slug });

  beforeEach(() => {
    fallback.get.mockReset().mockReturnValue(null);
    fallback.fill.mockReset().mockResolvedValue(0);
  });

  it("accepts a Pradosham booking on a Trayodashi (either paksha)", async () => {
    panch("pradosham");
    rules({ tithis: ["trayodashi"] });
    day("Trayodasi", "Krishna Paksha", "Hasta");
    expect((await book("pradosham")).status).toBe(201);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].row.amount_inr).toBe(500); // server price
  });

  it("refuses Pradosham on any other tithi", async () => {
    panch("pradosham");
    rules({ tithis: ["trayodashi"] });
    day("Dwadashi", "Shukla Paksha", "Hasta");
    const r = await book("pradosham");
    expect([r.status, (await r.json()).code]).toEqual([409, "NOT_SCHEDULED"]);
    expect(state.inserts).toHaveLength(0);
  });

  it("Pournami and Amavasya follow their tithis", async () => {
    panch("pournami-full-moon");
    rules({ tithis: ["purnima"] });
    day("Pournami", "", "Hasta");
    expect((await book("pournami-full-moon")).status).toBe(201);
    state.inserts = [];
    panch("amavasya-new-moon");
    rules({ tithis: ["amavasya"] });
    day("Pournami", "", "Hasta");
    expect((await book("amavasya-new-moon")).status).toBe(409);
  });

  it("nakshatra-based poojas follow the nakshatra", async () => {
    panch("krithigai");
    rules({ nakshatras: ["krittika"] });
    day("Panchami", "Shukla", "Karthigai");
    expect((await book("krithigai")).status).toBe(201);
    day("Panchami", "Shukla", "Rohini");
    expect((await book("krithigai")).status).toBe(409);
  });

  it("is paksha-sensitive (Sankata Hara Chaturthi = Krishna paksha)", async () => {
    panch("sankata-hara-chaturthi");
    rules({ tithis: ["chaturthi"], paksha: "krishna" });
    day("Chaturthi", "Krishna Paksha", "Hasta");
    expect((await book("sankata-hara-chaturthi")).status).toBe(201);
    day("Chaturthi", "Shukla Paksha", "Hasta");
    const r = await book("sankata-hara-chaturthi");
    expect([r.status, (await r.json()).code]).toEqual([409, "NOT_SCHEDULED"]);
  });

  it("will not invent a date when the Panchangam is missing: PANCHANGAM_UNAVAILABLE", async () => {
    panch("pradosham");
    rules({ tithis: ["trayodashi"] }); // no pooja_days row, fallback returns nothing
    const r = await book("pradosham");
    const j = await r.json();
    expect([r.status, j.code]).toEqual([409, "PANCHANGAM_UNAVAILABLE"]);
    expect(j.error).toMatch(/cannot confirm/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("will not guess when the Panchangam is ambiguous (two nakshatras / unknown paksha)", async () => {
    panch("krithigai");
    rules({ nakshatras: ["krittika"] });
    day("Panchami", "Shukla", "Bharani / Krittika");
    expect((await book("krithigai")).status).toBe(409);
    panch("sankata-hara-chaturthi");
    rules({ tithis: ["chaturthi"], paksha: "krishna" });
    day("Chaturthi", "", "Hasta");
    const r = await book("sankata-hara-chaturthi");
    expect((await r.json()).code).toBe("PANCHANGAM_UNAVAILABLE");
  });

  it("treats a pooja_days read error as 'unavailable', never as a valid date", async () => {
    panch("pradosham");
    rules({ tithis: ["trayodashi"] });
    state.results["pooja_days:select"] = {
      data: null,
      error: { message: "boom" },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await (await book("pradosham")).json()).code).toBe(
      "PANCHANGAM_UNAVAILABLE",
    );
    spy.mockRestore();
  });

  it("falls back to the cached Prokerala value only when pooja_days has no row", async () => {
    panch("pradosham");
    rules({ tithis: ["trayodashi"] });
    fallback.get.mockReturnValue({
      tithi: "Trayodashi",
      paksha: "Shukla Paksha",
      nakshatra: "Rohini",
      labels: [],
      source: "prokerala",
    });
    expect((await book("pradosham")).status).toBe(201);
    // pooja_days wins over the fallback when both exist
    state.inserts = [];
    day("Dwadashi", "Shukla Paksha", "Hasta");
    expect((await book("pradosham")).status).toBe(409);
  });

  it("a Panchangam pooja with no active rules cannot be booked", async () => {
    panch("pradosham");
    rules();
    day("Trayodashi", "Shukla", "Rohini");
    expect((await (await book("pradosham")).json()).code).toBe("NOT_SCHEDULED");
  });

  it("daily and special poojas are unaffected by missing Panchangam data", async () => {
    state.results["poojas:select"] = {
      data: { id: "p1", name: "Daily", type: "daily", amount_inr: 100 },
      error: null,
    };
    state.results["recurring_pooja_schedule:select"] = {
      data: [
        {
          pooja_id: "p1",
          recurrence: "daily",
          weekday: null,
          start_time: null,
        },
      ],
      error: null,
    };
    state.results["bookings:insert"] = { data: row, error: null };
    expect((await book("prathiyankara-sarabha-sulini-homam")).status).toBe(201);
  });
});

describe("pricing and donation guards on booking", () => {
  it("never accepts an amount from the browser, and uses the stored fixed price", async () => {
    state.results["poojas:select"] = {
      data: { id: "p1", name: "Lord Shiva", type: "special", amount_inr: 1500 },
      error: null,
    };
    state.results["special_pooja_schedule:select"] = {
      data: [
        { pooja_id: "p1", date: input.date, start_time: null, notes: null },
      ],
      error: null,
    };
    state.results["bookings:insert"] = { data: row, error: null };
    expect(
      (
        await post("/api/bookings", {
          ...input,
          poojaSlug: "lord-shiva",
          amount: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post("/api/bookings", {
          ...input,
          poojaSlug: "lord-shiva",
          donation: 5000,
        })
      ).status,
    ).toBe(400);
    expect(
      (await post("/api/bookings", { ...input, poojaSlug: "lord-shiva" }))
        .status,
    ).toBe(201);
    expect(state.inserts[0].row.amount_inr).toBe(1500);
  });

  it("Annadanam is a donation flow and can never be booked as a pooja", async () => {
    for (const slug of ["annadanam", "daily-annadhanam"]) {
      state.results["poojas:select"] = {
        data: { id: "p1", name: "Annadanam", type: "daily", amount_inr: 100 },
        error: null,
      };
      const r = await post("/api/bookings", { ...input, poojaSlug: slug });
      expect([r.status, (await r.json()).code]).toEqual([
        409,
        "DONATION_NOT_BOOKABLE",
      ]);
    }
    expect(state.inserts).toHaveLength(0);
  });

  it("a priced pooja that has no public page cannot be booked", async () => {
    state.results["poojas:select"] = {
      data: { id: "p1", name: "Pageless", type: "special", amount_inr: 900 },
      error: null,
    };
    const r = await post("/api/bookings", {
      ...input,
      poojaSlug: "no-such-page",
    });
    expect([r.status, (await r.json()).code]).toEqual([
      409,
      "NOT_BOOKABLE_ONLINE",
    ]);
    expect(state.inserts).toHaveLength(0);
  });
});

describe("rate limiting (enabled by default)", () => {
  it("returns 429 after too many write attempts from one IP", async () => {
    const s = createServer().listen(0);
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/bookings/${ORDER}/payment`;
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) {
      codes.push(
        (
          await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          })
        ).status,
      );
    }
    s.close();
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(codes.slice(20)).toEqual([429, 429]);
  });
});

// =================================================================================
describe("festival offerings: server-side validation of offering, date, window and price", () => {
  const plus = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const SLUG = "festival-diwali-lakshmi-pooja-20270101";
  const festPooja = {
    data: {
      id: "f1",
      name: "Lakshmi Pooja",
      type: "festival",
      amount_inr: 1501,
    },
    error: null,
  };
  const festRow = (over: Record<string, unknown> = {}) => ({
    data: {
      pooja_id: "f1",
      festival_name: "Diwali",
      date: future,
      start_time: "18:00:00",
      booking_opens_on: null,
      booking_closes_on: null,
      max_bookings: null,
      active: true,
      ...over,
    },
    error: null,
  });
  const festBook = () => post("/api/bookings", { ...input, poojaSlug: SLUG });
  const setup = (over: Record<string, unknown> = {}, pooja = festPooja) => {
    state.results["poojas:select"] = pooja;
    state.results["festival_offerings:select"] = festRow(over);
    state.results["bookings:insert"] = {
      data: { ...row, pooja_name: "Lakshmi Pooja (Diwali)", amount_inr: 1501 },
      error: null,
    };
  };
  const codeOf = async (r: Response) => [r.status, (await r.json()).code];

  it("books the festival offering at ITS OWN price read from the database, with the festival in the snapshot", async () => {
    setup();
    const r = await festBook();
    expect(r.status).toBe(201);
    const ins = state.inserts[0].row;
    expect(ins.amount_inr).toBe(1501);
    expect(ins.pooja_id).toBe("f1");
    expect(ins.pooja_name).toBe("Lakshmi Pooja (Diwali)");
    expect(ins.booking_date).toBe(future);
  });

  it("never accepts an amount from the browser", async () => {
    setup();
    for (const extra of [
      { amount: 1 },
      { festivalPrice: 1 },
      { donation: 9 },
    ]) {
      const r = await post("/api/bookings", {
        ...input,
        poojaSlug: SLUG,
        ...extra,
      });
      expect(r.status).toBe(400);
    }
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses any date other than the festival date", async () => {
    setup({ date: plus(12) });
    expect(await codeOf(await festBook())).toEqual([409, "NOT_SCHEDULED"]);
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses an offering without an approved price", async () => {
    setup({}, { ...festPooja, data: { ...festPooja.data, amount_inr: null } });
    expect(await codeOf(await festBook())).toEqual([409, "PRICE_NOT_APPROVED"]);
  });

  it("refuses an inactive or missing festival offering", async () => {
    setup({ active: false });
    expect(await codeOf(await festBook())).toEqual([
      409,
      "FESTIVAL_UNAVAILABLE",
    ]);
    state.results["festival_offerings:select"] = { data: null, error: null };
    expect(await codeOf(await festBook())).toEqual([
      409,
      "FESTIVAL_UNAVAILABLE",
    ]);
    expect(state.inserts).toHaveLength(0);
  });

  it("honours the booking window", async () => {
    setup({ booking_opens_on: plus(3) });
    expect(await codeOf(await festBook())).toEqual([409, "FESTIVAL_NOT_OPEN"]);
    setup({ booking_closes_on: plus(-1), booking_opens_on: plus(-5) });
    expect(await codeOf(await festBook())).toEqual([409, "FESTIVAL_CLOSED"]);
    expect(state.inserts).toHaveLength(0);
    setup({ booking_opens_on: plus(-1), booking_closes_on: plus(5) });
    expect((await festBook()).status).toBe(201);
  });

  it("honours the maximum number of bookings", async () => {
    setup({ max_bookings: 2 });
    state.results["bookings:select"] = {
      data: [{ pooja_id: "f1" }, { pooja_id: "f1" }],
      error: null,
    };
    expect(await codeOf(await festBook())).toEqual([409, "FESTIVAL_FULL"]);
    expect(state.inserts).toHaveLength(0);
    state.results["bookings:select"] = {
      data: [{ pooja_id: "f1" }],
      error: null,
    };
    expect((await festBook()).status).toBe(201);
  });

  it("maps the database's race-free capacity/window errors to the same responses", async () => {
    setup();
    state.results["bookings:insert"] = {
      data: null,
      error: { code: "P0001", message: "festival_full" },
    };
    expect(await codeOf(await festBook())).toEqual([409, "FESTIVAL_FULL"]);
    state.results["bookings:insert"] = {
      data: null,
      error: { code: "P0001", message: "festival_closed" },
    };
    expect(await codeOf(await festBook())).toEqual([409, "FESTIVAL_CLOSED"]);
  });
});

describe("GET /api/festivals/:slug", () => {
  const SLUG = "festival-diwali-lakshmi-pooja-20270101";
  const get = (slug: string) => call("GET", `/api/festivals/${slug}`);
  const seedFestival = (over: Record<string, unknown> = {}) => {
    state.results["poojas:select"] = {
      data: {
        id: "f1",
        slug: SLUG,
        name: "Lakshmi Pooja",
        description: "d",
        amount_inr: "1501.00",
      },
      error: null,
    };
    state.results["festival_offerings:select"] = {
      data: {
        festival_name: "Diwali",
        pooja_name: "Lakshmi Pooja",
        description: "Evening pooja",
        date: future,
        start_time: "18:00:00",
        booking_opens_on: null,
        booking_closes_on: null,
        max_bookings: null,
        active: true,
        ...over,
      },
      error: null,
    };
  };

  it("returns the offering with its own fixed price and an open state", async () => {
    seedFestival();
    const r = await get(SLUG);
    expect(r.status).toBe(200);
    const { festival } = await r.json();
    expect(festival).toMatchObject({
      slug: SLUG,
      festivalName: "Diwali",
      poojaName: "Lakshmi Pooja",
      date: future,
      amount: 1501,
      state: "open",
      bookable: true,
    });
  });

  it("is not bookable when full, and exposes no booking data", async () => {
    seedFestival({ max_bookings: 1 });
    state.results["bookings:select"] = {
      data: [{ pooja_id: "f1", devotee_name: "Secret" }],
      error: null,
    };
    const body = await (await get(SLUG)).json();
    expect(body.festival).toMatchObject({ state: "full", bookable: false });
    expect(JSON.stringify(body)).not.toContain("Secret");
  });

  it("404s for non-festival slugs without touching the database", async () => {
    for (const s of ["pradosham", "annadanam", "festival-"]) {
      const r = await get(s);
      expect([s, r.status]).toEqual([s, 404]);
    }
    expect(state.calls).toBe(0);
  });

  it("404s when the offering is inactive or missing", async () => {
    seedFestival();
    state.results["festival_offerings:select"] = { data: null, error: null };
    expect((await get(SLUG)).status).toBe(404);
    state.results["poojas:select"] = { data: null, error: null };
    expect((await get(SLUG)).status).toBe(404);
  });
});

describe("GET /api/poojas does not list festival offerings", () => {
  it("excludes the festival type (they have their own endpoint and page)", async () => {
    state.results["poojas:select"] = { data: [], error: null };
    await call("GET", "/api/poojas");
    expect(state.filters).toContainEqual({
      table: "poojas",
      op: "neq",
      col: "type",
      val: "festival",
    });
  });
});
