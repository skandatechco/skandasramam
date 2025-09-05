import "dotenv/config";

const BASE_URL = process.env.PROKERALA_BASE_URL?.replace(/\/$/, "") || "https://api.prokerala.com/astrology";
const TOKEN_URL = (process.env.PROKERALA_TOKEN_URL || "https://api.prokerala.com/token").replace(/\/$/, "");
const CLIENT_ID = process.env.PROKERALA_CLIENT_ID || process.env.PROKERALA_ID || "";
const CLIENT_SECRET = process.env.PROKERALA_CLIENT_SECRET || process.env.PROKERALA_SECRET || "";

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

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
  const url = new URL(`${BASE_URL}/panchang`);
  url.searchParams.set("date", date);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", timezone);

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
  const tithi = data?.data?.tithi || data?.tithi || null;
  const nakshatra = data?.data?.nakshatra || data?.nakshatra || null;
  const yoga = data?.data?.yoga || data?.yoga || null;
  const karana = data?.data?.karana || data?.karana || null;
  const sunrise = data?.data?.sunrise || data?.sunrise;
  const sunset = data?.data?.sunset || data?.sunset;

  return { date, sunrise, sunset, tithi, nakshatra, yoga, karana, raw: data };
}

export async function findNextNakshatra({ targetNakshatra, startDate, latitude, longitude, timezone, maxDays = 60 }: { targetNakshatra: string; startDate: string; latitude: number; longitude: number; timezone: string; maxDays?: number; }): Promise<{ date: string; name: string } | null> {
  ensureToken();
  const start = new Date(startDate + "T00:00:00");
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const p = await getPanchang({ date: dateStr, latitude, longitude, timezone });
      const name: string | undefined = (p.nakshatra as any)?.name || (p.nakshatra as any)?.nakshatra || (p.raw?.nakshatra?.name);
      if (name && equalsNakshatra(name, targetNakshatra)) {
        return { date: dateStr, name };
      }
    } catch (_e) {
      // continue on error
    }
  }
  return null;
}

function equalsNakshatra(a: string, b: string) {
  return normalize(a) === normalize(b);
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function ensureToken() {
  if (!getStaticToken() && (!CLIENT_ID || !CLIENT_SECRET)) {
    throw new Error("Missing Prokerala credentials. Set PROKERALA_API_TOKEN or PROKERALA_CLIENT_ID/PROKERALA_CLIENT_SECRET in env.");
  }
}
