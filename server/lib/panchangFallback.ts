import type { CalendarPanchang } from "../../shared/calendar";
import { getPanchang, isProkeralaConfigured } from "../integrations/prokerala";

/**
 * Rate-limit-aware Prokerala fallback for dates missing from public.pooja_days.
 *
 * Guarantees:
 *  - never called for dates already in pooja_days (the caller only passes gaps);
 *  - results are cached for days (a date's Panchangam does not change);
 *  - failures are cached briefly so a broken/limited API is not hammered;
 *  - a global budget (default 3 calls/minute, below Prokerala's 5/min) and a
 *    per-request cap bound total traffic regardless of how many users load the page;
 *  - a 429/rate-limit response pauses all fallback calls for a minute;
 *  - concurrent requests for the same date share one call;
 *  - nothing is ever written to the database and nothing is invented: an
 *    incomplete Prokerala answer is treated as a failure.
 *
 * Caches are per server instance (memory). On serverless this is best effort.
 */
export interface FallbackDeps {
  configured: () => boolean;
  fetchDay: (date: string) => Promise<CalendarPanchang>;
  now: () => number;
}

export interface FallbackOptions {
  maxPerWindow: number;
  windowMs: number;
  maxPerRequest: number;
  ttlMs: number;
  failTtlMs: number;
  pauseMs: number;
  deadlineMs: number;
}

const DEFAULT_OPTIONS: FallbackOptions = {
  maxPerWindow: 3,
  windowMs: 60_000,
  maxPerRequest: 2,
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  failTtlMs: 5 * 60 * 1000,
  pauseMs: 60_000,
  deadlineMs: 3_000,
};

const CHENNAI = { lat: 13.0827, lon: 80.2707, tz: "Asia/Kolkata" };

export function prokeralaFetchDay(date: string): Promise<CalendarPanchang> {
  return getPanchang({
    date,
    latitude: CHENNAI.lat,
    longitude: CHENNAI.lon,
    timezone: CHENNAI.tz,
    lang: "en",
  }).then((p) => {
    const tithi = p.tithi?.name;
    const nakshatra = p.nakshatra?.name;
    if (!tithi || !nakshatra)
      throw new Error("Incomplete Panchangam from provider");
    // Prokerala exposes paksha on the tithi entry when available; otherwise unknown.
    const raw: any = (p.raw as any)?.data ?? p.raw;
    const t0 = Array.isArray(raw?.tithi) ? raw.tithi[0] : raw?.tithi;
    const paksha = typeof t0?.paksha === "string" ? t0.paksha : null;
    return {
      tithi,
      paksha,
      nakshatra,
      labels: [],
      source: "prokerala" as const,
    };
  });
}

export function createPanchangFallback(
  deps: FallbackDeps = {
    configured: isProkeralaConfigured,
    fetchDay: prokeralaFetchDay,
    now: Date.now,
  },
  options: Partial<FallbackOptions> = {},
) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const ok = new Map<string, { value: CalendarPanchang; expiresAt: number }>();
  const failed = new Map<string, number>(); // date -> retry-after timestamp
  const inflight = new Map<string, Promise<void>>();
  let windowStart = 0;
  let windowCalls = 0;
  let pausedUntil = 0;

  const isFailed = (d: string, now: number) => (failed.get(d) ?? 0) > now;

  function budgetLeft(now: number) {
    if (now >= pausedUntil && now - windowStart >= o.windowMs) {
      windowStart = now;
      windowCalls = 0;
    }
    return now < pausedUntil ? 0 : Math.max(0, o.maxPerWindow - windowCalls);
  }

  async function fetchOne(date: string) {
    const existing = inflight.get(date);
    if (existing) return existing;
    windowCalls++;
    const p = deps
      .fetchDay(date)
      .then((value) => {
        ok.set(date, { value, expiresAt: deps.now() + o.ttlMs });
        failed.delete(date);
      })
      .catch((err) => {
        const now = deps.now();
        failed.set(date, now + o.failTtlMs);
        if (/429|rate.?limit|too many/i.test(String(err?.message ?? err))) {
          pausedUntil = now + o.pauseMs;
        }
      })
      .finally(() => inflight.delete(date));
    inflight.set(date, p);
    return p;
  }

  return {
    /** Cached value only. Never triggers a network call. */
    get(date: string): CalendarPanchang | null {
      const hit = ok.get(date);
      if (!hit) return null;
      if (hit.expiresAt <= deps.now()) {
        ok.delete(date);
        return null;
      }
      return hit.value;
    },

    /**
     * Try to fill some of `dates` (already ordered by priority) within the
     * budget. Returns how many of them are still fillable later (not cached,
     * not in failure back-off). Returns 0 when Prokerala isn't configured.
     */
    async fill(dates: string[]): Promise<number> {
      if (!deps.configured()) return 0;
      const now = deps.now();
      const todo = dates.filter(
        (d) => this.get(d) === null && !isFailed(d, now),
      );
      const allowed = Math.min(o.maxPerRequest, budgetLeft(now), todo.length);
      const batch = todo.slice(0, allowed);
      if (batch.length) {
        // Sequential (Prokerala is rate limited) but bounded by a deadline so the
        // API response is never held up for long; unfinished calls still cache.
        const run = (async () => {
          for (const d of batch) await fetchOne(d);
        })();
        await Promise.race([
          run,
          new Promise((r) => setTimeout(r, o.deadlineMs)),
        ]);
      }
      const after = deps.now();
      return dates.filter((d) => this.get(d) === null && !isFailed(d, after))
        .length;
    },
  };
}

/** Process-wide instance used by the calendar route. */
export const panchangFallback = createPanchangFallback();
