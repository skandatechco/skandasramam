import "dotenv/config";

const BASE_URL = process.env.PROKERALA_BASE_URL?.replace(/\/$/, "") || "https://api.prokerala.com/v2/astrology";
const TOKEN_URL = (process.env.PROKERALA_TOKEN_URL || "https://api.prokerala.com/token").replace(/\/$/, "");
const CLIENT_ID = process.env.PROKERALA_CLIENT_ID || process.env.PROKERALA_ID || "";
const CLIENT_SECRET = process.env.PROKERALA_CLIENT_SECRET || process.env.PROKERALA_SECRET || "";

let tokenCache: { accessToken: string; expiresAt: number } | null = null;
const panchangCache = new Map<string, { data: PanchangResult; expiresAt: number }>();
const nextNakshatraCache = new Map<string, { date: string; expiresAt: number }>();
const nextNakshatraProgress = new Map<string, { lastIndex: number; updatedAt: number }>();

function getStaticToken() {
  return process.env.PROKERALA_API_TOKEN || process.env.PROKERALA_TOKEN || "";
}

async function getAccessToken(): Promise<string> {
  const staticToken = getStaticToken();
  if (staticToken) return staticToken;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing PROKERALA_CLIENT_ID/PROKERALA_CLIENT_SECRET or PROKERALA_API_TOKEN.");
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed ${res.status}: ${text}`);
  }
  const json: any = await res.json();
  const accessToken = json.access_token as string;
  const expiresIn = Number(json.expires_in || 3600);
  tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

export interface PanchangResult {
  date: string;
  sunrise?: string;
  sunset?: string;
  tithi?: { name: string } | null;
  nakshatra?: { name: string } | null;
  yoga?: { name: string } | null;
  karana?: { name: string } | null;
  raw: any;
}

export async function getPanchang({ date, latitude, longitude, timezone }: { date: string; latitude: number; longitude: number; timezone: string; }): Promise<PanchangResult> {
  ensureToken();
  const cacheKey = `${date}|${latitude}|${longitude}|${timezone}`;
  const now = Date.now();
  const cached = panchangCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  const url = new URL(`${BASE_URL}/panchang`);
  const dt = buildDateTime(date, timezone);
  url.searchParams.set("ayanamsa", "1"); // Lahiri
  url.searchParams.set("coordinates", `${latitude},${longitude}`);
  url.searchParams.set("datetime", dt);
  url.searchParams.set("la", "en");

  const token = await getAccessToken();
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Prokerala error ${res.status}: ${text}`);
  }
  const data = await res.json();

  // Normalize fields defensively
  const d = data?.data || data;
  const tithi = toNamed(d?.tithi);
  const nakshatra = toNamed(d?.nakshatra);
  const yoga = toNamed(d?.yoga);
  const karana = toNamed(d?.karana);
  const sunrise = d?.sunrise;
  const sunset = d?.sunset;

  const result: PanchangResult = { date, sunrise, sunset, tithi, nakshatra, yoga, karana, raw: data };
  // Cache for 5 minutes
  panchangCache.set(cacheKey, { data: result, expiresAt: now + 5 * 60 * 1000 });
  return result;
}

export async function findNextNakshatra({ targetNakshatra, startDate, latitude, longitude, timezone, maxDays = 60 }: { targetNakshatra: string; startDate: string; latitude: number; longitude: number; timezone: string; maxDays?: number; }): Promise<{ date: string; name: string } | null> {
  ensureToken();
  const cacheKey = `${normalize(targetNakshatra)}|${startDate}|${latitude}|${longitude}|${timezone}`;
  const now = Date.now();
  const cached = nextNakshatraCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return { date: cached.date, name: targetNakshatra };

  const progress = nextNakshatraProgress.get(cacheKey) || { lastIndex: 0, updatedAt: 0 };
  const start = new Date(startDate + "T00:00:00");
  const MAX_CALLS_PER_REQ = 4; // respect 5/min limit
  const begin = progress.lastIndex;
  const end = Math.min(begin + MAX_CALLS_PER_REQ, maxDays);
  for (let i = begin; i < end; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const p = await getPanchang({ date: dateStr, latitude, longitude, timezone });
      const name: string | undefined = (p.nakshatra as any)?.name;
      if (name && equalsNakshatra(name, targetNakshatra)) {
        // cache for a day
        nextNakshatraCache.set(cacheKey, { date: dateStr, expiresAt: now + 24 * 60 * 60 * 1000 });
        nextNakshatraProgress.delete(cacheKey);
        return { date: dateStr, name };
      }
    } catch (_e) {
      // continue on error
    }
  }
  // update progress for next attempt
  nextNakshatraProgress.set(cacheKey, { lastIndex: end, updatedAt: now });
  return null;
}

function equalsNakshatra(a: string, b: string) {
  return normalize(a) === normalize(b);
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function buildDateTime(dateStr: string, timeZone: string) {
  // Use 12:00:00 local to avoid edge cases
  const base = new Date(`${dateStr}T12:00:00Z`);
  const offset = getOffsetForTimeZone(base, timeZone);
  return `${dateStr}T12:00:00${offset}`;
}

function getOffsetForTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "UTC";
    // tzName like GMT+5:30 or UTC+5:30
    const m = tzName.match(/([+-])(\d{1,2}):(\d{2})/);
    if (m) {
      const sign = m[1];
      const hh = m[2].padStart(2, "0");
      const mm = m[3];
      return `${sign}${hh}:${mm}`;
    }
  } catch {}
  if (timeZone === "Asia/Kolkata") return "+05:30";
  return "+00:00";
}

function ensureToken() {
  if (!getStaticToken() && (!CLIENT_ID || !CLIENT_SECRET)) {
    throw new Error("Missing Prokerala credentials. Set PROKERALA_API_TOKEN or PROKERALA_CLIENT_ID/PROKERALA_CLIENT_SECRET in env.");
  }
}

function toNamed(x: any): { name: string } | null {
  if (!x) return null;
  const name = x.name || x?.details?.name || x?.details?.tithi?.name || x?.details?.nakshatra?.name || x?.details?.yoga?.name || x?.details?.karana?.name || x?.tithi?.name || x?.nakshatra?.name || x?.yoga?.name || x?.karana?.name;
  return name ? { name } : null;
}
