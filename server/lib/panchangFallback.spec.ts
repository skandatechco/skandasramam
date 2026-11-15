import { describe, expect, it, vi } from "vitest";
import type { CalendarPanchang } from "../../shared/calendar";
import { createPanchangFallback } from "./panchangFallback";

const value = (n = "Rohini"): CalendarPanchang => ({
  tithi: "Trayodashi",
  paksha: null,
  nakshatra: n,
  labels: [],
  source: "prokerala",
});
const dates = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `2027-01-${String(i + 1).padStart(2, "0")}`,
  );

function setup(
  opts: Parameters<typeof createPanchangFallback>[1] = {},
  impl?: (d: string) => Promise<CalendarPanchang>,
) {
  let t = 1_000_000;
  const fetchDay = vi.fn(impl ?? (async () => value()));
  const fb = createPanchangFallback(
    { configured: () => true, fetchDay, now: () => t },
    { deadlineMs: 50, ...opts },
  );
  return { fb, fetchDay, advance: (ms: number) => (t += ms) };
}

describe("Prokerala fallback limits", () => {
  it("does nothing when Prokerala is not configured", async () => {
    const fetchDay = vi.fn();
    const fb = createPanchangFallback({
      configured: () => false,
      fetchDay,
      now: Date.now,
    });
    expect(await fb.fill(dates(5))).toBe(0);
    expect(fetchDay).not.toHaveBeenCalled();
  });

  it("never fetches one call per calendar cell: at most maxPerRequest per request", async () => {
    const { fb, fetchDay } = setup({ maxPerRequest: 2 });
    const pending = await fb.fill(dates(31));
    expect(fetchDay).toHaveBeenCalledTimes(2);
    expect(pending).toBe(29);
  });

  it("enforces the global per-minute budget across requests, then refills", async () => {
    const { fb, fetchDay, advance } = setup({
      maxPerRequest: 2,
      maxPerWindow: 3,
    });
    const all = dates(31);
    await fb.fill(all); // 2
    await fb.fill(all); // 1 (budget 3)
    await fb.fill(all); // 0
    await fb.fill(all); // 0
    expect(fetchDay).toHaveBeenCalledTimes(3);
    advance(60_001);
    await fb.fill(all);
    expect(fetchDay).toHaveBeenCalledTimes(5);
  });

  it("fetches in the priority order it is given (nearest dates first)", async () => {
    const { fb, fetchDay } = setup({ maxPerRequest: 2 });
    await fb.fill(["2027-01-20", "2027-01-05", "2027-01-31"]);
    expect(fetchDay.mock.calls.map((c) => c[0])).toEqual([
      "2027-01-20",
      "2027-01-05",
    ]);
  });

  it("caches successes: a filled date is never fetched again", async () => {
    const { fb, fetchDay } = setup();
    await fb.fill(["2027-01-05"]);
    expect(fb.get("2027-01-05")).toMatchObject({
      nakshatra: "Rohini",
      source: "prokerala",
    });
    expect(await fb.fill(["2027-01-05"])).toBe(0);
    expect(fetchDay).toHaveBeenCalledTimes(1);
  });

  it("caches failures briefly so errors do not cause a retry storm", async () => {
    const { fb, fetchDay, advance } = setup(
      { maxPerWindow: 100, failTtlMs: 300_000 },
      async () => {
        throw new Error("boom");
      },
    );
    expect(await fb.fill(["2027-01-05"])).toBe(0); // failed -> no longer "pending"
    await fb.fill(["2027-01-05"]);
    expect(fetchDay).toHaveBeenCalledTimes(1);
    expect(fb.get("2027-01-05")).toBeNull(); // nothing fabricated
    advance(300_001);
    await fb.fill(["2027-01-05"]);
    expect(fetchDay).toHaveBeenCalledTimes(2);
  });

  it("pauses all calls after a rate-limit response", async () => {
    const { fb, fetchDay, advance } = setup(
      { maxPerWindow: 100, maxPerRequest: 1, pauseMs: 60_000 },
      async () => {
        throw new Error("Prokerala error 429: rate limit exceeded");
      },
    );
    await fb.fill(["2027-01-05"]);
    await fb.fill(["2027-01-06"]);
    expect(fetchDay).toHaveBeenCalledTimes(1); // second call blocked by the pause
    advance(60_001);
    await fb.fill(["2027-01-06"]);
    expect(fetchDay).toHaveBeenCalledTimes(2);
  });

  it("shares one call between concurrent requests for the same date", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { fb, fetchDay } = setup(
      { maxPerWindow: 100, deadlineMs: 1000 },
      async () => {
        await gate;
        return value();
      },
    );
    const a = fb.fill(["2027-01-05"]);
    const b = fb.fill(["2027-01-05"]);
    release();
    await Promise.all([a, b]);
    expect(fetchDay).toHaveBeenCalledTimes(1);
  });

  it("does not hold the response past the deadline, and still caches the late result", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { fb } = setup({ deadlineMs: 20 }, async () => {
      await gate;
      return value("Hasta");
    });
    const started = Date.now();
    const pending = await fb.fill(["2027-01-05"]);
    expect(Date.now() - started).toBeLessThan(500);
    expect(pending).toBe(1);
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(fb.get("2027-01-05")?.nakshatra).toBe("Hasta");
  });
});
