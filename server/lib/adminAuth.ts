import type { Request, RequestHandler, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserClient } from "./supabase";

export interface AdminContext {
  id: string;
  email: string | null;
  /** acts as this admin (anon key + their JWT): RLS applies to every query */
  db: SupabaseClient;
}

export const adminOf = (res: Response) => res.locals.admin as AdminContext;

const reject = (res: Response, status: number, code: string, error: string) =>
  res.status(status).json({ ok: false, code, error });

function bearer(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(
    req.get("authorization") ?? "",
  );
  return m ? m[1] : null;
}

/**
 * Runs on EVERY /api/admin request. Nothing from the client other than the JWT
 * is trusted (no role flags, no user ids):
 *  1. the JWT is verified by Supabase Auth (signature, expiry, revocation);
 *  2. the database function public.is_admin() must return true for that user.
 */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const token = bearer(req);
  if (!token) {
    return reject(res, 401, "UNAUTHENTICATED", "Please sign in.");
  }

  const db = getUserClient(token);

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) {
    return reject(
      res,
      401,
      "SESSION_EXPIRED",
      "Your session has expired. Please sign in again.",
    );
  }

  const { data: isAdmin, error: adminErr } = await db.rpc("is_admin");
  if (adminErr) throw adminErr;
  if (isAdmin !== true) {
    return reject(
      res,
      403,
      "FORBIDDEN",
      "This account is not authorised for temple administration.",
    );
  }

  res.locals.admin = {
    id: data.user.id,
    email: data.user.email ?? null,
    db,
  } satisfies AdminContext;
  next();
};
