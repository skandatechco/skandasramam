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

type Result = { data: any; error: any };
const state: {
  results: Record<string, Result>;
  tablesRead: string[];
  filters: { table: string; op: string; col: string; val: any }[];
} = { results: {}, tablesRead: [], filters: [] };

function builder(table: string) {
  state.tablesRead.push(table);
  const f = (op: string) => (col: string, val: any) => (
    state.filters.push({ table, op, col, val }),
    b
  );
  const b: any = {
    select: () => b,
    eq: f("eq"),
    gte: f("gte"),
    lte: f("lte"),
    then: (res: any, rej: any) =>
      Promise.resolve(state.results[table] ?? { data: [], error: null }).then(
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
  fill: vi.fn(async (_d: string[]) => 0),
  get: vi.fn((_d: string) => null as any),
};
vi.mock("../lib/panchangFallback", () => ({ panchangFallback: fallback }));

const { createServer } = await import("../index");

let server: Server;
let base: string;
beforeAll(() => {
  server = createServer({ rateLimiting: false }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  state.results = {};
  state.tablesRead = [];
  state.filters = [];
  fallback.fill.mockClear().mockImplementation(async () => 0);
  fallback.get.mockClear().mockImplementation(() => null);
});

const get = (qs: string) => fetch(`${base}/api/temple-calendar${qs}`);

const seed = () => {
  state.results["poojas"] = {
    data: [
      {
        id: "d1",
        slug: "prathiyankara-sarabha-sulini-homam",
        name: "Abhishekam",
        type: "daily",
        amount_inr: 100,
      },
      {
        id: "s1",
        slug: "homam-for-world-peace",
        name: "Homam",
        type: "special",
        amount_inr: null,
      },
    ],
    error: null,
  };
  state.results["recurring_pooja_schedule"] = {
    data: [
      {
        pooja_id: "d1",
        recurrence: "daily",
        weekday: null,
        start_time: "06:00:00",
      },
    ],
    error: null,
  };
  state.results["special_pooja_schedule"] = {
    data: [
      { pooja_id: "s1", date: "2099-01-14", start_time: null, notes: null },
    ],
    error: null,
  };
  state.results["pooja_days"] = {
    data: [
      {
        date: "2099-01-05",
        tithi: "Pournami",
        paksha: "Shukla",
        nakshatra: "Rohini",
        labels: ["Pournami"],
      },
    ],
    error: null,
  };
};

describe("GET /api/temple-calendar", () => {
  it("returns a whole month from exactly six reads (no N+1)", async () => {
    seed();
    const r = await get("?year=2099&month=1");
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.days).toHaveLength(31);
    expect([...state.tablesRead].sort()).toEqual(
      [
        "festival_offerings",
        "pooja_days",
        "panchangam_pooja_rules",
        "poojas",
        "recurring_pooja_schedule",
        "special_pooja_schedule",
      ].sort(),
    );
    // month-range filters are applied in SQL for the date-bearing tables
    const ranges = state.filters.filter((f) => f.col === "date");
    expect(ranges).toContainEqual({
      table: "pooja_days",
      op: "gte",
      col: "date",
      val: "2099-01-01",
    });
    expect(ranges).toContainEqual({
      table: "special_pooja_schedule",
      op: "lte",
      col: "date",
      val: "2099-01-31",
    });
  });

  it("schedules Panchangam poojas from structured rules over pooja_days (tithi / paksha / nakshatra)", async () => {
    state.results["poojas"] = {
      data: [
        {
          id: "p1",
          slug: "pradosham",
          name: "Pradosham",
          type: "panchangam",
          amount_inr: 300,
        },
        {
          id: "p2",
          slug: "sankata-hara-chaturthi",
          name: "Sankata Hara Chaturthi",
          type: "panchangam",
          amount_inr: 200,
        },
        {
          id: "p3",
          slug: "krithigai",
          name: "Krithigai",
          type: "panchangam",
          amount_inr: null,
        },
      ],
      error: null,
    };
    state.results["panchangam_pooja_rules"] = {
      data: [
        {
          pooja_id: "p1",
          tithis: ["trayodashi"],
          paksha: null,
          nakshatras: null,
          start_time: "17:30:00",
        },
        {
          pooja_id: "p2",
          tithis: ["chaturthi"],
          paksha: "krishna",
          nakshatras: null,
          start_time: null,
        },
        {
          pooja_id: "p3",
          tithis: null,
          paksha: null,
          nakshatras: ["krittika"],
          start_time: null,
        },
      ],
      error: null,
    };
    state.results["pooja_days"] = {
      data: [
        {
          date: "2099-01-05",
          tithi: "Trayodasi",
          paksha: "Shukla Paksha",
          nakshatra: "Rohini",
          labels: [],
        },
        {
          date: "2099-01-06",
          tithi: "Chaturthi",
          paksha: "Krishna Paksha",
          nakshatra: "Karthigai",
          labels: [],
        },
        {
          date: "2099-01-07",
          tithi: "Chaturthi",
          paksha: "Shukla Paksha",
          nakshatra: "Hasta",
          labels: [],
        },
        {
          date: "2099-01-08",
          tithi: "Chaturthi",
          paksha: "",
          nakshatra: "Hasta",
          labels: [],
        },
        {
          date: "2099-01-09",
          tithi: "Dashami",
          paksha: "Shukla",
          nakshatra: "Bharani / Krittika",
          labels: ["Pradosham"],
        },
      ],
      error: null,
    };
    const body = await (await get("?year=2099&month=1")).json();
    const on = (d: string) =>
      body.days
        .find((x: any) => x.date === d)
        .panchangam.map((o: any) => o.slug);
    expect(on("2099-01-05")).toEqual(["pradosham"]);
    expect(on("2099-01-06")).toEqual(
      ["krithigai", "sankata-hara-chaturthi"].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
    expect(on("2099-01-07")).toEqual([]); // Shukla Chaturthi
    expect(on("2099-01-08")).toEqual([]); // paksha unknown: not invented
    expect(on("2099-01-09")).toEqual([]); // ambiguous nakshatra; the 'Pradosham' LABEL is ignored
    expect(on("2099-01-20")).toEqual([]); // no Panchangam at all
    expect(body.poojas["krithigai"]).toMatchObject({
      amount: null,
      bookable: false,
    });
    expect(body.poojas["pradosham"]).toMatchObject({
      amount: 300,
      bookable: true,
      destination: "/poojas/regular/pradosham",
    });
  });

  it("merges Panchangam, recurring and special occurrences", async () => {
    seed();
    const body = await (await get("?year=2099&month=1")).json();
    const d5 = body.days.find((d: any) => d.date === "2099-01-05");
    expect(d5.panchang).toMatchObject({
      nakshatra: "Rohini",
      source: "pooja_days",
      labels: ["Pournami"],
    });
    expect(d5.recurring).toEqual([
      { slug: "prathiyankara-sarabha-sulini-homam", startTime: "06:00:00" },
    ]);
    const d14 = body.days.find((d: any) => d.date === "2099-01-14");
    expect(d14.special.map((o: any) => o.slug)).toEqual([
      "homam-for-world-peace",
    ]);
    expect(body.poojas["homam-for-world-peace"]).toMatchObject({
      amount: null,
      bookable: false,
    });
    expect(body.poojas["prathiyankara-sarabha-sulini-homam"]).toMatchObject({
      amount: 100,
      bookable: true,
    });
  });

  it("handles leap-year February", async () => {
    seed();
    const body = await (await get("?year=2028&month=2")).json();
    expect(body.days).toHaveLength(29);
  });

  it("returns an honest empty state when schedules are not seeded", async () => {
    const body = await (await get("?year=2099&month=1")).json();
    expect(body.hasScheduledPoojas).toBe(false);
    expect(body.poojas).toEqual({});
    expect(
      body.days.every(
        (d: any) => !d.recurring.length && !d.special.length && !d.panchang,
      ),
    ).toBe(true);
  });

  it("asks the Prokerala fallback only for today-onward dates missing from pooja_days", async () => {
    seed();
    await get("?year=2099&month=1");
    const asked: string[] = fallback.fill.mock.calls[0][0];
    expect(asked).not.toContain("2099-01-05"); // present in pooja_days
    expect(asked).toHaveLength(30);
    // past months never trigger fallback traffic
    fallback.fill.mockClear();
    await get("?year=2020&month=3");
    expect(fallback.fill.mock.calls[0][0]).toEqual([]);
  });

  it("uses fallback data for missing dates and reports what is still pending", async () => {
    seed();
    fallback.fill.mockImplementation(async () => 12);
    fallback.get.mockImplementation((d: string) =>
      d === "2099-01-06"
        ? {
            tithi: "Pratipada",
            paksha: null,
            nakshatra: "Hasta",
            labels: [],
            source: "prokerala",
          }
        : null,
    );
    const r = await get("?year=2099&month=1");
    const body = await r.json();
    expect(
      body.days.find((d: any) => d.date === "2099-01-06").panchang,
    ).toMatchObject({ nakshatra: "Hasta", source: "prokerala" });
    expect(
      body.days.find((d: any) => d.date === "2099-01-07").panchang,
    ).toBeNull();
    expect(body.panchangPending).toBe(12);
    expect(r.headers.get("cache-control")).toContain("s-maxage=10"); // short while incomplete
  });

  it("pooja_days wins over the fallback", async () => {
    seed();
    fallback.get.mockImplementation(() => ({
      tithi: "X",
      paksha: null,
      nakshatra: "Wrong",
      labels: [],
      source: "prokerala",
    }));
    const body = await (await get("?year=2099&month=1")).json();
    expect(
      body.days.find((d: any) => d.date === "2099-01-05").panchang.nakshatra,
    ).toBe("Rohini");
  });

  it("caches briefly at the CDN so schedule edits appear without a restart", async () => {
    seed();
    const r = await get("?year=2099&month=1");
    expect(r.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
  });

  it("degrades gracefully when pooja_days cannot be read", async () => {
    seed();
    state.results["pooja_days"] = {
      data: null,
      error: { message: "relation does not exist" },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await get("?year=2099&month=1");
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.degraded).toBe(true);
    expect(body.hasScheduledPoojas).toBe(true); // schedules still shown
    spy.mockRestore();
  });

  it("returns a generic 500 (no leaks, not cached) when schedules cannot be read", async () => {
    seed();
    state.results["recurring_pooja_schedule"] = {
      data: null,
      error: { message: "secret db detail" },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await get("?year=2099&month=1");
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
    expect(r.headers.get("cache-control") ?? "").not.toContain("s-maxage");
    spy.mockRestore();
  });

  it("validates year and month", async () => {
    for (const qs of [
      "",
      "?year=2027",
      "?year=2027&month=13",
      "?year=1900&month=1",
      "?year=x&month=1",
    ]) {
      const r = await get(qs);
      expect(r.status).toBe(400);
    }
    expect(state.tablesRead).toHaveLength(0);
  });
});
