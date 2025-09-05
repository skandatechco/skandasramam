import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { getPanchang, findNextNakshatra } from "./integrations/prokerala";

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
