import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { getPanchang, findNextNakshatra } from "./integrations/prokerala";

// In-memory month cache for highlighted events (rate-limit aware)
const monthCache = new Map<
  string,
  {
    eventsByDate: Record<string, { title: string; details: string; time?: string }[]>;
    progress: number; // processed days count
    days: number;
    expiresAt: number;
  }
>();

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
}

function deriveRegularEventsFromPanchang(en: any) {
  const events: { title: string; details: string; time?: string }[] = [];
  const tithi = norm(en?.tithi?.name || "");
  const star = norm(en?.nakshatra?.name || "");
  const add = (title: string, details: string, time?: string) =>
    events.push({ title, details, time });
  if (/purnima|pournami|fullmoon/.test(tithi)) {
    add(
      "Pournami / Full Moon",
      "Special abhishekam to Goddess Matha Bhuvaneswari and Lord Dattatreya.",
      "10:00 AM",
    );
  }
  if (/amavasya|amavasai|newmoon/.test(tithi)) {
    add(
      "Amavasya (New Moon)",
      "Special abhishekam to Goddess Prathiyankara Devi and Lord Pancha Mukha Anjaneyar.",
      "10:00 AM",
    );
  }
  if (/chaturthi/.test(tithi)) {
    add(
      "Sankata Hara Chaturthi",
      "Special abhishekam to Lord Pancha Mukha Heramba Maha Ganapathy and Kamala Siddhi Vinayakar.",
      "10:30 AM",
    );
  }
  if (/ashtami/.test(tithi)) {
    add(
      "Krishna Paksha Ashtami",
      "Special abhishekam to Goddess Asta Dasa Bhuja Durga Parameswari; Navavarna puja in evening.",
      "Abhishekam 10:30 AM • Navavarna 6:00 PM",
    );
  }
  if (/trayodashi/.test(tithi)) {
    add(
      "Maha Pradosham",
      "Grand celebration for Sri Mahasahasralingamurthy and Lord Nandikeswarar with Mahanyasam and special abhishekam; deeparadanai and prasad.",
      "Mahanyasam 5:00 PM • Abhishekam 5:30 PM • Deeparadanai 6:30 PM",
    );
  }
  if (/krittika|krithika|krithigai/.test(star)) {
    add("Krithigai", "Special abhishekam to Lord Swaminatha Swami.", "10:00 AM");
  }
  if (/uttaraphalguni|uttaraphalgun|uthiram/.test(star)) {
    add(
      "Uthiram Nakshatram",
      "Special abhishekam to Lord Ayyapan followed by alankaram and deeparadanai.",
      "10:30 AM",
    );
  }
  if (/chitra|chithirai/.test(star)) {
    add(
      "Chitirai Nakshatram",
      "Special abhishekam and alankaram to Lord Mahasudarshana Murthy followed by deeparadanai.",
      "10:30 AM",
    );
  }
  if (/swati|swathi/.test(star)) {
    add(
      "Swathi Nakshatram",
      "Special abhishekam and alankaram to Lord Lakshmi Narasimhar followed by deeparadanai.",
      "10:30 AM",
    );
  }
  if (/vishakha|vishaka|visakam|vishagam/.test(star)) {
    add(
      "Vishakam (Vishagam) Nakshatram",
      "Birth star of Sathguru Shrimath Santhananda Swamigal; special abhishekam and alankaram to Sathguru at the Ashram.",
      "10:30 AM",
    );
  }
  // Exclude Navavarna and Annadanam from highlighting
  return events.filter((e) => !/navavarna/i.test(e.title) && !/annadanam/i.test(e.title));
}

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Panchangam for any date
  app.get("/api/panchangam", async (req, res) => {
    try {
      const latitude = Number(req.query.lat ?? 13.0827);
      const longitude = Number(req.query.lon ?? 80.2707);
      const timezone = String(req.query.tz ?? "Asia/Kolkata");
      const date = String(
        req.query.date ?? new Date().toISOString().slice(0, 10),
      );
      const lang = String(req.query.la ?? req.query.lang ?? "en");
      const data = await getPanchang({
        date,
        latitude,
        longitude,
        timezone,
        lang,
      });
      res.json({ ok: true, data });
    } catch (e: any) {
      res
        .status(500)
        .json({ ok: false, error: e?.message || "Failed to fetch panchangam" });
    }
  });

  // Panchangam for today
  app.get("/api/panchangam/today", async (req, res) => {
    try {
      const latitude = Number(req.query.lat ?? 13.0827);
      const longitude = Number(req.query.lon ?? 80.2707);
      const timezone = String(req.query.tz ?? "Asia/Kolkata");
      const date = String(
        req.query.date ?? new Date().toISOString().slice(0, 10),
      );
      const data = await getPanchang({
        date,
        latitude,
        longitude,
        timezone,
        lang: "en",
      });
      res.json({ ok: true, data });
    } catch (e: any) {
      res
        .status(500)
        .json({ ok: false, error: e?.message || "Failed to fetch panchangam" });
    }
  });

  // Month events (progressive, rate-limit aware)
  app.get("/api/calendar/month", async (req, res) => {
    try {
      const year = Number(req.query.year);
      const month = Number(req.query.month); // 1-12
      if (!year || !month)
        return res.status(400).json({ ok: false, error: "Missing year/month" });
      const latitude = Number(req.query.lat ?? 13.0827);
      const longitude = Number(req.query.lon ?? 80.2707);
      const timezone = String(req.query.tz ?? "Asia/Kolkata");
      const key = `${year}-${month}|${latitude}|${longitude}|${timezone}`;
      const now = Date.now();
      let entry = monthCache.get(key);
      const days = new Date(year, month, 0).getDate();
      if (!entry || entry.expiresAt < now) {
        entry = {
          eventsByDate: {},
          progress: 0,
          days,
          expiresAt: now + 6 * 60 * 60 * 1000,
        };
        monthCache.set(key, entry);
      }

      const MAX_PER_REQ = 4; // keep under 5/minute with client polling
      let processed = 0;
      while (entry.progress < entry.days && processed < MAX_PER_REQ) {
        const day = entry.progress + 1; // 1-based day
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        try {
          const p = await getPanchang({
            date,
            latitude,
            longitude,
            timezone,
            lang: "en",
          });
          const events = deriveRegularEventsFromPanchang(p);
          if (events.length) entry.eventsByDate[date] = events;
        } catch (_) {
          // ignore individual day failures
        }
        entry.progress++;
        processed++;
      }

      const complete = entry.progress >= entry.days;
      res.json({ ok: true, complete, progress: entry.progress, eventsByDate: entry.eventsByDate });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "Failed to build month events" });
    }
  });

  // Next occurrence of a given nakshatra within next N days
  app.get("/api/nakshatra/next", async (req, res) => {
    try {
      const target = String(req.query.n ?? req.query.nakshatra ?? "");
      if (!target)
        return res
          .status(400)
          .json({ ok: false, error: "Missing nakshatra (n) query" });
      const latitude = Number(req.query.lat ?? 13.0827);
      const longitude = Number(req.query.lon ?? 80.2707);
      const timezone = String(req.query.tz ?? "Asia/Kolkata");
      const startDate = String(
        req.query.start ?? new Date().toISOString().slice(0, 10),
      );
      const maxDays = Number(req.query.max ?? 60);
      const next = await findNextNakshatra({
        targetNakshatra: target,
        startDate,
        latitude,
        longitude,
        timezone,
        maxDays,
      });
      if (!next)
        return res
          .status(404)
          .json({ ok: false, error: "Not found within range" });
      res.json({ ok: true, data: next });
    } catch (e: any) {
      res.status(500).json({
        ok: false,
        error: e?.message || "Failed to compute next nakshatra",
      });
    }
  });

  return app;
}
