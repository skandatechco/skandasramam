import type { RequestHandler } from "express";

/**
 * Minimal in-memory fixed-window rate limiter.
 * Caveat: on Vercel each function instance has its own memory, so this is a
 * best-effort brake against casual abuse, not a hard guarantee. Pair it with
 * Vercel Firewall rate limiting for production.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
}): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    const key = req.ip || "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > opts.max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        ok: false,
        code: "RATE_LIMITED",
        error: "Too many requests. Please try again shortly.",
      });
    }
    next();
  };
}
