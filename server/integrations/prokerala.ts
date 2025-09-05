import "dotenv/config";

const BASE_URL = process.env.PROKERALA_BASE_URL?.replace(/\/$/, "") || "https://api.prokerala.com/astrology";
function getToken() {
  return process.env.PROKERALA_API_TOKEN || process.env.PROKERALA_TOKEN || "";
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

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getToken()}` },
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
  if (!getToken()) {
    throw new Error("Missing PROKERALA_API_TOKEN. Set it in your environment (Vercel/Netlify env vars).");
  }
}
