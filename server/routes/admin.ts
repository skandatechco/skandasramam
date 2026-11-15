import type { RequestHandler, Response } from "express";
import type { ZodError } from "zod";
import {
  allowedActions,
  bookingActionSchema,
  listBookingsQuerySchema,
  priceChangeSchema,
  ruleToggleSchema,
  specialCreateSchema,
  specialListQuerySchema,
  specialPatchSchema,
  festivalCreateSchema,
  festivalPatchSchema,
  uuidSchema,
  type AdminFestival,
  type AdminFestivalHistory,
  type AdminAuditEntry,
  type AdminPanchangamRule,
  type AdminPriceHistoryEntry,
  type AdminScheduleAuditEntry,
  type AdminBookingDetail,
  type AdminBookingRow,
  type AdminPooja,
  type AdminRecurringRule,
  type AdminSpecialDate,
  type AdminStats,
} from "../../shared/admin";
import { adminOf } from "../lib/adminAuth";
import { todayIST } from "../lib/schedule";
import { resolveDestination } from "../../shared/poojaPages";
import { festivalBookingState } from "../../shared/festival";

// ---- helpers -----------------------------------------------------------------
function fail(
  res: Response,
  status: number,
  code: string,
  error: string,
  extra: Record<string, unknown> = {},
) {
  return res.status(status).json({ ok: false, code, error, ...extra });
}

function validationFail(res: Response, err: ZodError) {
  return fail(res, 400, "VALIDATION_ERROR", "Please check the request.", {
    fieldErrors: err.flatten().fieldErrors,
  });
}

const isJwtProblem = (e: any) =>
  e?.code === "PGRST301" || /jwt/i.test(String(e?.message ?? ""));

/** Maps database-level admin errors to API responses; rethrows anything unexpected. */
function dbFail(res: Response, e: any) {
  if (isJwtProblem(e)) {
    return fail(
      res,
      401,
      "SESSION_EXPIRED",
      "Your session has expired. Please sign in again.",
    );
  }
  const msg = String(e?.message ?? "");

  if (msg === "affected_bookings_unresolved") {
    let detail: { count?: number; orders?: string[] } = {};
    try {
      detail = JSON.parse(String(e?.details ?? "{}"));
    } catch {
      /* keep defaults */
    }
    return fail(
      res,
      409,
      "AFFECTED_BOOKINGS",
      `${detail.count ?? "Some"} live booking(s) are affected by this change. Choose how to handle them, with a reason.`,
      { liveBookings: detail.count ?? null, orders: detail.orders ?? [] },
    );
  }
  if (e?.code === "23505") {
    return msg.includes("bookings_active_dedupe_key")
      ? fail(
          res,
          409,
          "MOVE_CONFLICT",
          "A devotee already has a booking on the new date, so the bookings cannot be moved. Nothing was changed.",
        )
      : fail(
          res,
          409,
          "DUPLICATE_DATE",
          "This pooja is already scheduled on that date.",
        );
  }

  const map: Record<string, [number, string, string]> = {
    forbidden: [
      403,
      "FORBIDDEN",
      "This account is not authorised for temple administration.",
    ],
    booking_not_found: [404, "BOOKING_NOT_FOUND", "Booking not found."],
    pooja_not_found: [404, "POOJA_NOT_FOUND", "Pooja not found."],
    schedule_not_found: [404, "NOT_FOUND", "Schedule not found."],
    invalid_transition: [
      409,
      "INVALID_TRANSITION",
      "That action is not allowed for the booking's current state. Reload to see its latest status.",
    ],
    no_change: [409, "NO_CHANGE", "That is already the current value."],
    schedule_in_past: [
      409,
      "SCHEDULE_IN_PAST",
      "A date in the past cannot be moved or disabled.",
    ],
    date_in_past: [400, "DATE_IN_PAST", "Choose today or a future date."],
    not_a_special_pooja: [
      400,
      "NOT_A_SPECIAL_POOJA",
      "Only special poojas can be scheduled on specific dates.",
    ],
    invalid_amount: [
      400,
      "VALIDATION_ERROR",
      "Enter a positive INR amount with at most two decimals.",
    ],
    reason_required: [
      400,
      "REASON_REQUIRED",
      "A written reason is required for this change.",
    ],
    note_required: [
      400,
      "VALIDATION_ERROR",
      "A note explaining this action is required.",
    ],
    invalid_handling: [
      400,
      "INVALID_HANDLING",
      "That way of handling the affected bookings is not allowed for this change.",
    ],
    invalid_festival: [
      400,
      "VALIDATION_ERROR",
      "Check the festival name, pooja name and description.",
    ],
    invalid_window: [
      400,
      "INVALID_WINDOW",
      "The booking window must open on or before it closes, and neither may be after the festival date.",
    ],
    invalid_capacity: [
      400,
      "VALIDATION_ERROR",
      "The maximum number of bookings must be at least 1.",
    ],
    duplicate_festival: [
      409,
      "DUPLICATE_FESTIVAL",
      "That festival pooja already exists for this date.",
    ],
    template_not_allowed: [
      400,
      "TEMPLATE_NOT_ALLOWED",
      "Donations cannot be used as a pooja template.",
    ],
    note_too_long: [400, "VALIDATION_ERROR", "Invalid request."],
    reason_too_long: [400, "VALIDATION_ERROR", "Invalid request."],
    invalid_action: [400, "VALIDATION_ERROR", "Invalid request."],
    invalid_patch: [400, "VALIDATION_ERROR", "Invalid request."],
    invalid_kind: [400, "VALIDATION_ERROR", "Invalid request."],
  };
  const hit = map[msg];
  if (hit) return fail(res, hit[0], hit[1], hit[2]);
  throw e;
}

const uniqueViolation = (e: any) => e?.code === "23505";

// Explicit column lists: access_token_hash is not readable by admins.
const LIST_COLS =
  "id, order_no, devotee_name, phone, pooja_name, booking_date, amount_inr, upi_ref, payment_status, status, created_at";
const DETAIL_COLS = `${LIST_COLS}, email, nakshatra, gotra, sankalpam, payment_submitted_at, payment_verified_at, updated_at`;

const toRow = (r: any): AdminBookingRow => ({
  id: r.id,
  orderNo: r.order_no,
  devotee: r.devotee_name,
  phone: r.phone,
  poojaName: r.pooja_name,
  date: r.booking_date,
  amount: Number(r.amount_inr),
  upiRef: r.upi_ref ?? null,
  paymentStatus: r.payment_status,
  status: r.status,
  createdAt: r.created_at,
});

const toAudit = (a: any): AdminAuditEntry => ({
  id: a.id,
  action: a.action,
  adminEmail: a.admin_email ?? null,
  fromStatus: a.from_status,
  toStatus: a.to_status,
  fromPaymentStatus: a.from_payment_status,
  toPaymentStatus: a.to_payment_status,
  note: a.note ?? null,
  createdAt: a.created_at,
});

async function loadDetail(
  res: Response,
  id: string,
): Promise<AdminBookingDetail | null> {
  const { db } = adminOf(res);
  const [b, h] = await Promise.all([
    db.from("bookings").select(DETAIL_COLS).eq("id", id).maybeSingle(),
    db
      .from("booking_audit_log")
      .select(
        "id, action, admin_email, from_status, to_status, from_payment_status, to_payment_status, note, created_at",
      )
      .eq("booking_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (b.error) throw b.error;
  if (h.error) throw h.error;
  if (!b.data) return null;
  const row = toRow(b.data);
  return {
    ...row,
    email: b.data.email,
    nakshatra: b.data.nakshatra ?? null,
    gotra: b.data.gotra ?? null,
    sankalpam: b.data.sankalpam ?? null,
    paymentSubmittedAt: b.data.payment_submitted_at ?? null,
    paymentVerifiedAt: b.data.payment_verified_at ?? null,
    updatedAt: b.data.updated_at,
    allowedActions: allowedActions(row.status, row.paymentStatus),
    history: (h.data ?? []).map(toAudit),
  };
}

/** Live (non-cancelled) bookings per `${poojaId}|${date}`; one query, no N+1. */
async function liveBookingCounts(
  res: Response,
  pairs: { poojaId: string; date: string }[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!pairs.length) return counts;
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("bookings")
    .select("pooja_id, booking_date")
    .in("pooja_id", [...new Set(pairs.map((p) => p.poojaId))])
    .in("booking_date", [...new Set(pairs.map((p) => p.date))])
    .neq("status", "cancelled");
  if (error) throw error;
  const wanted = new Set(pairs.map((p) => `${p.poojaId}|${p.date}`));
  for (const r of data ?? []) {
    const k = `${r.pooja_id}|${r.booking_date}`;
    if (wanted.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

const SPECIAL_COLS =
  "id, pooja_id, date, start_time, notes, active, poojas(name)";
const toSpecial = (r: any, live = 0): AdminSpecialDate => ({
  id: r.id,
  poojaId: r.pooja_id,
  poojaName: r.poojas?.name ?? "",
  date: r.date,
  startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
  notes: r.notes ?? null,
  active: r.active,
  liveBookings: live,
});

// ---- identity & dashboard -----------------------------------------------------
export const getMe: RequestHandler = (_req, res) => {
  const a = adminOf(res);
  res.json({ ok: true, admin: { id: a.id, email: a.email } });
};

export const getStats: RequestHandler = async (_req, res) => {
  const { db } = adminOf(res);
  const today = todayIST();
  const head = { count: "exact" as const, head: true };

  const [total, awaiting, confirmed, upcoming, rules, next] = await Promise.all(
    [
      db.from("bookings").select("id", head),
      db
        .from("bookings")
        .select("id", head)
        .eq("payment_status", "awaiting_verification")
        .neq("status", "cancelled"),
      db.from("bookings").select("id", head).eq("status", "confirmed"),
      db
        .from("special_pooja_schedule")
        .select("id", head)
        .eq("active", true)
        .gte("date", today),
      db.from("recurring_pooja_schedule").select("id", head).eq("active", true),
      db
        .from("special_pooja_schedule")
        .select(SPECIAL_COLS)
        .eq("active", true)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(5),
    ],
  );
  for (const r of [total, awaiting, confirmed, upcoming, rules, next]) {
    if (r.error) return dbFail(res, r.error);
  }

  const nextRows = next.data ?? [];
  const live = await liveBookingCounts(
    res,
    nextRows.map((r: any) => ({ poojaId: r.pooja_id, date: r.date })),
  );

  const body: AdminStats = {
    totalBookings: total.count ?? 0,
    awaitingVerification: awaiting.count ?? 0,
    confirmed: confirmed.count ?? 0,
    upcomingSpecialPoojas: upcoming.count ?? 0,
    activeRecurringRules: rules.count ?? 0,
    nextSpecialPoojas: nextRows.map((r: any) => {
      const s = toSpecial(r, live.get(`${r.pooja_id}|${r.date}`) ?? 0);
      return {
        id: s.id,
        date: s.date,
        poojaName: s.poojaName,
        startTime: s.startTime,
        liveBookings: s.liveBookings,
      };
    }),
  };
  res.json({ ok: true, stats: body });
};

// ---- bookings -----------------------------------------------------------------
export const listBookings: RequestHandler = async (req, res) => {
  const parsed = listBookingsQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationFail(res, parsed.error);
  const { page, pageSize, q, status, paymentStatus, from, to, poojaId } =
    parsed.data;
  const { db } = adminOf(res);

  let query = db
    .from("bookings")
    .select(LIST_COLS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (poojaId) query = query.eq("pooja_id", poojaId);
  if (status) query = query.eq("status", status);
  if (paymentStatus) query = query.eq("payment_status", paymentStatus);
  if (from) query = query.gte("booking_date", from);
  if (to) query = query.lte("booking_date", to);
  if (q) {
    const t = `%${q}%`;
    query = query.or(
      ["order_no", "devotee_name", "phone", "upi_ref", "email", "pooja_name"]
        .map((c) => `${c}.ilike.${t}`)
        .join(","),
    );
  }

  const { data, count, error } = await query;
  if (error) return dbFail(res, error);
  const total = count ?? 0;
  res.json({
    ok: true,
    items: (data ?? []).map(toRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
};

export const getBookingDetail: RequestHandler = async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success)
    return fail(res, 404, "BOOKING_NOT_FOUND", "Booking not found.");
  const detail = await loadDetail(res, id.data);
  if (!detail) return fail(res, 404, "BOOKING_NOT_FOUND", "Booking not found.");
  res.json({ ok: true, booking: detail });
};

/**
 * POST /api/admin/bookings/:id/actions
 * The transition itself (validation, row lock, update, audit entry) happens in
 * ONE database transaction inside admin_booking_action(); the admin identity is
 * the caller's own JWT, never a value from the request body.
 */
export const performBookingAction: RequestHandler = async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success)
    return fail(res, 404, "BOOKING_NOT_FOUND", "Booking not found.");
  const body = bookingActionSchema.safeParse(req.body);
  if (!body.success) return validationFail(res, body.error);

  const { db } = adminOf(res);
  const { error } = await db.rpc("admin_booking_action", {
    p_booking_id: id.data,
    p_action: body.data.action,
    p_note: body.data.note ?? null,
  });
  if (error) return dbFail(res, error);

  const detail = await loadDetail(res, id.data);
  if (!detail) return fail(res, 404, "BOOKING_NOT_FOUND", "Booking not found.");
  res.json({ ok: true, booking: detail });
};

// ---- pooja catalogue, prices & schedules ------------------------------------------

export const listPoojasAdmin: RequestHandler = async (_req, res) => {
  const { db } = adminOf(res);
  const [poojas, rec, rules, special] = await Promise.all([
    db
      .from("poojas")
      .select("id, slug, name, type, amount_inr, active")
      .neq("type", "festival") // festival offerings are managed under Festival poojas
      .order("type")
      .order("name"),
    db.from("recurring_pooja_schedule").select("pooja_id").eq("active", true),
    db.from("panchangam_pooja_rules").select("pooja_id").eq("active", true),
    db
      .from("special_pooja_schedule")
      .select("pooja_id")
      .eq("active", true)
      .gte("date", todayIST()),
  ]);
  for (const r of [poojas, rec, rules, special]) {
    if (r.error) return dbFail(res, r.error);
  }

  const counts = new Map<string, number>();
  for (const r of [
    ...(rec.data ?? []),
    ...(rules.data ?? []),
    ...(special.data ?? []),
  ]) {
    counts.set(r.pooja_id, (counts.get(r.pooja_id) ?? 0) + 1);
  }
  const out: AdminPooja[] = (poojas.data ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    amount: p.amount_inr == null ? null : Number(p.amount_inr),
    active: p.active,
    destination: resolveDestination(p.slug),
    scheduleCount: counts.get(p.id) ?? 0,
  }));
  res.json({ ok: true, poojas: out });
};

/**
 * POST /api/admin/poojas/:id/price  { amount, reason }
 * The only way a price changes. One fixed INR amount; null withdraws it. The
 * database function checks admin rights and validates; the change is recorded in
 * the append-only price audit trail. Existing bookings keep their original amount.
 */
export const setPoojaPrice: RequestHandler = async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success) return fail(res, 404, "POOJA_NOT_FOUND", "Pooja not found.");
  const body = priceChangeSchema.safeParse(req.body);
  if (!body.success) return validationFail(res, body.error);
  const { db } = adminOf(res);
  const { data, error } = await db.rpc("admin_set_pooja_price", {
    p_pooja_id: id.data,
    p_amount: body.data.amount,
    p_reason: body.data.reason,
  });
  if (error) return dbFail(res, error);
  const row = Array.isArray(data) ? data[0] : data;
  res.json({
    ok: true,
    oldAmount: row?.old_amount == null ? null : Number(row.old_amount),
    newAmount: row?.new_amount == null ? null : Number(row.new_amount),
  });
};

export const getPriceHistory: RequestHandler = async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success) return fail(res, 404, "POOJA_NOT_FOUND", "Pooja not found.");
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("pooja_price_audit_log")
    .select("id, old_amount, new_amount, admin_email, reason, created_at")
    .eq("pooja_id", id.data)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return dbFail(res, error);
  const history: AdminPriceHistoryEntry[] = (data ?? []).map((r: any) => ({
    id: r.id,
    oldAmount: r.old_amount == null ? null : Number(r.old_amount),
    newAmount: r.new_amount == null ? null : Number(r.new_amount),
    adminEmail: r.admin_email ?? null,
    reason: r.reason ?? null,
    createdAt: r.created_at,
  }));
  res.json({ ok: true, history });
};

export const listRecurring: RequestHandler = async (_req, res) => {
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("recurring_pooja_schedule")
    .select(
      "id, pooja_id, recurrence, weekday, start_time, active, poojas(name)",
    )
    .order("created_at");
  if (error) return dbFail(res, error);
  const rules: AdminRecurringRule[] = (data ?? []).map((r: any) => ({
    id: r.id,
    poojaId: r.pooja_id,
    poojaName: r.poojas?.name ?? "",
    recurrence: r.recurrence,
    weekday: r.weekday ?? null,
    startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
    active: r.active,
  }));
  res.json({ ok: true, rules });
};

export const listPanchangamRules: RequestHandler = async (_req, res) => {
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("panchangam_pooja_rules")
    .select(
      "id, pooja_id, tithis, paksha, nakshatras, start_time, notes, active, poojas(name)",
    )
    .order("created_at");
  if (error) return dbFail(res, error);
  const rules: AdminPanchangamRule[] = (data ?? []).map((r: any) => ({
    id: r.id,
    poojaId: r.pooja_id,
    poojaName: r.poojas?.name ?? "",
    tithis: r.tithis ?? [],
    paksha: r.paksha ?? null,
    nakshatras: r.nakshatras ?? [],
    startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
    notes: r.notes ?? null,
    active: r.active,
  }));
  res.json({ ok: true, rules });
};

/** Enable/disable a recurring schedule or a Panchangam rule (audited; never changes bookings). */
const toggleRule =
  (kind: "recurring" | "panchangam"): RequestHandler =>
  async (req, res) => {
    const id = uuidSchema.safeParse(req.params.id);
    if (!id.success) return fail(res, 404, "NOT_FOUND", "Schedule not found.");
    const body = ruleToggleSchema.safeParse(req.body);
    if (!body.success) return validationFail(res, body.error);
    const { db } = adminOf(res);
    const { data, error } = await db.rpc("admin_schedule_rule_set_active", {
      p_kind: kind,
      p_id: id.data,
      p_active: body.data.active,
      p_handling: body.data.handling ?? null,
      p_reason: body.data.reason ?? null,
    });
    if (error) return dbFail(res, error);
    const row = Array.isArray(data) ? data[0] : data;
    res.json({
      ok: true,
      id: id.data,
      active: body.data.active,
      affected: row?.affected_count ?? 0,
    });
  };
export const patchRecurring = toggleRule("recurring");
export const patchPanchangamRule = toggleRule("panchangam");

export const listSpecial: RequestHandler = async (req, res) => {
  const q = specialListQuerySchema.safeParse(req.query);
  if (!q.success) return validationFail(res, q.error);
  const { db } = adminOf(res);
  let query = db
    .from("special_pooja_schedule")
    .select(SPECIAL_COLS)
    .gte("date", q.data.from ?? todayIST())
    .order("date", { ascending: true })
    .limit(500);
  if (q.data.to) query = query.lte("date", q.data.to);
  if (!q.data.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return dbFail(res, error);
  const rows = data ?? [];
  const live = await liveBookingCounts(
    res,
    rows.map((r: any) => ({ poojaId: r.pooja_id, date: r.date })),
  );
  res.json({
    ok: true,
    dates: rows.map((r: any) =>
      toSpecial(r, live.get(`${r.pooja_id}|${r.date}`) ?? 0),
    ),
  });
};

async function loadSpecial(res: Response, id: string) {
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("special_pooja_schedule")
    .select(SPECIAL_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toSpecial(data) : null;
}

export const createSpecial: RequestHandler = async (req, res) => {
  const body = specialCreateSchema.safeParse(req.body);
  if (!body.success) return validationFail(res, body.error);
  const { poojaId, date, startTime, notes, reason } = body.data;
  const { db } = adminOf(res);
  const { data, error } = await db.rpc("admin_special_schedule_create", {
    p_pooja_id: poojaId,
    p_date: date,
    p_start_time: startTime ?? null,
    p_notes: notes ?? null,
    p_reason: reason ?? null,
  });
  if (error) return dbFail(res, error);
  const created = await loadSpecial(res, String(data));
  res.status(201).json({ ok: true, date: created });
};

/**
 * PATCH /api/admin/special-schedules/:id
 * Applied by one database function that audits old/new values and REFUSES to move
 * or disable a date with live bookings unless the caller chooses how to handle
 * them (keep / cancel / move) and gives a reason. Nothing is moved or cancelled
 * silently.
 */
export const patchSpecial: RequestHandler = async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success)
    return fail(res, 404, "NOT_FOUND", "Scheduled date not found.");
  const body = specialPatchSchema.safeParse(req.body);
  if (!body.success) return validationFail(res, body.error);
  const { date, startTime, notes, active, handling, reason } = body.data;

  const patch: Record<string, unknown> = {};
  if (date !== undefined) patch.date = date;
  if (startTime !== undefined) patch.start_time = startTime;
  if (notes !== undefined) patch.notes = notes;
  if (active !== undefined) patch.active = active;

  const { db } = adminOf(res);
  const { data, error } = await db.rpc("admin_special_schedule_update", {
    p_id: id.data,
    p_patch: patch,
    p_handling: handling ?? null,
    p_reason: reason ?? null,
  });
  if (error) return dbFail(res, error);
  const outcome = Array.isArray(data) ? data[0] : data;
  const updated = await loadSpecial(res, id.data);
  if (!updated) return fail(res, 404, "NOT_FOUND", "Scheduled date not found.");
  res.json({
    ok: true,
    date: updated,
    affected: {
      bookings: outcome?.affected_count ?? 0,
      cancelled: outcome?.cancelled_count ?? 0,
      moved: outcome?.moved_count ?? 0,
    },
  });
};

export const getScheduleAudit: RequestHandler = async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("schedule_audit_log")
    .select(
      "id, schedule_table, action, pooja_name, admin_email, old_values, new_values, reason, affected_handling, affected_bookings, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return dbFail(res, error);
  const entries: AdminScheduleAuditEntry[] = (data ?? []).map((r: any) => ({
    id: r.id,
    table: r.schedule_table,
    action: r.action,
    poojaName: r.pooja_name ?? null,
    adminEmail: r.admin_email ?? null,
    oldValues: r.old_values ?? null,
    newValues: r.new_values ?? null,
    reason: r.reason ?? null,
    affectedHandling: r.affected_handling ?? null,
    affectedBookings: r.affected_bookings ?? null,
    createdAt: r.created_at,
  }));
  res.json({ ok: true, entries });
};

// ---- festival-day pooja offerings ----------------------------------------------------
const FESTIVAL_COLS =
  "id, pooja_id, template_pooja_id, festival_name, pooja_name, description, date, start_time, booking_opens_on, booking_closes_on, max_bookings, active, poojas(slug, amount_inr)";

const toFestival = (r: any, live: number, today: string): AdminFestival => {
  const slug: string = r.poojas?.slug ?? "";
  return {
    id: r.id,
    poojaId: r.pooja_id,
    slug,
    festivalName: r.festival_name,
    poojaName: r.pooja_name,
    description: r.description ?? null,
    date: r.date,
    startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
    amount: r.poojas?.amount_inr == null ? null : Number(r.poojas.amount_inr),
    bookingOpensOn: r.booking_opens_on ?? null,
    bookingClosesOn: r.booking_closes_on ?? null,
    maxBookings: r.max_bookings ?? null,
    active: r.active,
    templatePoojaId: r.template_pooja_id ?? null,
    liveBookings: live,
    state: festivalBookingState(
      {
        active: r.active,
        date: r.date,
        opensOn: r.booking_opens_on ?? null,
        closesOn: r.booking_closes_on ?? null,
        maxBookings: r.max_bookings ?? null,
        liveBookings: live,
      },
      today,
    ),
    destination: resolveDestination(slug),
  };
};

async function liveByPooja(res: Response, poojaIds: string[]) {
  const counts = new Map<string, number>();
  if (!poojaIds.length) return counts;
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("bookings")
    .select("pooja_id")
    .in("pooja_id", poojaIds)
    .neq("status", "cancelled");
  if (error) throw error;
  for (const r of data ?? [])
    counts.set(r.pooja_id, (counts.get(r.pooja_id) ?? 0) + 1);
  return counts;
}

async function loadFestival(res: Response, id: string) {
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("festival_offerings")
    .select(FESTIVAL_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const live = await liveByPooja(res, [data.pooja_id]);
  return toFestival(data, live.get(data.pooja_id) ?? 0, todayIST());
}

export const listFestivals: RequestHandler = async (_req, res) => {
  const { db } = adminOf(res);
  const { data, error } = await db
    .from("festival_offerings")
    .select(FESTIVAL_COLS)
    .order("date", { ascending: false })
    .limit(200);
  if (error) return dbFail(res, error);
  const rows = data ?? [];
  const live = await liveByPooja(
    res,
    rows.map((r: any) => r.pooja_id),
  );
  const today = todayIST();
  const festivals = rows.map((r: any) =>
    toFestival(r, live.get(r.pooja_id) ?? 0, today),
  );
  res.json({ ok: true, festivals });
};

/**
 * POST /api/admin/festivals
 * Creates a festival offering: its own catalogue entry with its own fixed price.
 * A template pooja is only remembered; its standard rate is neither copied nor changed.
 */
export const createFestival: RequestHandler = async (req, res) => {
  const body = festivalCreateSchema.safeParse(req.body);
  if (!body.success) return validationFail(res, body.error);
  const b = body.data;
  const { db } = adminOf(res);
  const { data, error } = await db.rpc("admin_festival_create", {
    p_festival_name: b.festivalName,
    p_pooja_name: b.poojaName,
    p_description: b.description ?? null,
    p_date: b.date,
    p_start_time: b.startTime ?? null,
    p_amount: b.amount,
    p_opens_on: b.bookingOpensOn ?? null,
    p_closes_on: b.bookingClosesOn ?? null,
    p_max_bookings: b.maxBookings ?? null,
    p_active: b.active ?? true,
    p_template_pooja_id: b.templatePoojaId ?? null,
    p_reason: b.reason ?? null,
  });
  if (error) return dbFail(res, error);
  const row = Array.isArray(data) ? data[0] : data;
  const created = await loadFestival(res, String(row?.o_festival_id));
  res.status(201).json({ ok: true, festival: created });
};

/**
 * PATCH /api/admin/festivals/:id
 * Edits description, schedule, window, capacity, active flag and price in one
 * audited database call. Existing bookings keep their amount. Moving the date or
 * deactivating an offering that has live bookings is refused until the admin
 * chooses keep / cancel / move and gives a reason: nothing is changed silently.
 */
export const patchFestival: RequestHandler = async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success)
    return fail(res, 404, "NOT_FOUND", "Festival pooja not found.");
  const body = festivalPatchSchema.safeParse(req.body);
  if (!body.success) return validationFail(res, body.error);
  const b = body.data;

  const patch: Record<string, unknown> = {};
  if (b.festivalName !== undefined) patch.festival_name = b.festivalName;
  if (b.poojaName !== undefined) patch.pooja_name = b.poojaName;
  if (b.description !== undefined) patch.description = b.description;
  if (b.date !== undefined) patch.date = b.date;
  if (b.startTime !== undefined) patch.start_time = b.startTime;
  if (b.bookingOpensOn !== undefined) patch.booking_opens_on = b.bookingOpensOn;
  if (b.bookingClosesOn !== undefined)
    patch.booking_closes_on = b.bookingClosesOn;
  if (b.maxBookings !== undefined) patch.max_bookings = b.maxBookings;
  if (b.active !== undefined) patch.active = b.active;
  if (b.amount !== undefined) patch.amount = b.amount;

  const { db } = adminOf(res);
  const { data, error } = await db.rpc("admin_festival_update", {
    p_id: id.data,
    p_patch: patch,
    p_handling: b.handling ?? null,
    p_reason: b.reason,
  });
  if (error) return dbFail(res, error);
  const outcome = Array.isArray(data) ? data[0] : data;
  const updated = await loadFestival(res, id.data);
  if (!updated) return fail(res, 404, "NOT_FOUND", "Festival pooja not found.");
  res.json({
    ok: true,
    festival: updated,
    affected: {
      bookings: outcome?.affected_count ?? 0,
      cancelled: outcome?.cancelled_count ?? 0,
      moved: outcome?.moved_count ?? 0,
    },
  });
};

/** GET /api/admin/festivals/:id/history: schedule/detail changes and price changes. */
export const getFestivalHistory: RequestHandler = async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success)
    return fail(res, 404, "NOT_FOUND", "Festival pooja not found.");
  const { db } = adminOf(res);
  const f = await db
    .from("festival_offerings")
    .select("pooja_id")
    .eq("id", id.data)
    .maybeSingle();
  if (f.error) return dbFail(res, f.error);
  if (!f.data) return fail(res, 404, "NOT_FOUND", "Festival pooja not found.");

  const [changes, prices] = await Promise.all([
    db
      .from("schedule_audit_log")
      .select(
        "id, schedule_table, action, pooja_name, admin_email, old_values, new_values, reason, affected_handling, affected_bookings, created_at",
      )
      .eq("schedule_table", "festival_offerings")
      .eq("record_id", id.data)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("pooja_price_audit_log")
      .select("id, old_amount, new_amount, admin_email, reason, created_at")
      .eq("pooja_id", f.data.pooja_id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (changes.error) return dbFail(res, changes.error);
  if (prices.error) return dbFail(res, prices.error);

  const body: AdminFestivalHistory = {
    changes: (changes.data ?? []).map((r: any) => ({
      id: r.id,
      table: r.schedule_table,
      action: r.action,
      poojaName: r.pooja_name ?? null,
      adminEmail: r.admin_email ?? null,
      oldValues: r.old_values ?? null,
      newValues: r.new_values ?? null,
      reason: r.reason ?? null,
      affectedHandling: r.affected_handling ?? null,
      affectedBookings: r.affected_bookings ?? null,
      createdAt: r.created_at,
    })),
    prices: (prices.data ?? []).map((r: any) => ({
      id: r.id,
      oldAmount: r.old_amount == null ? null : Number(r.old_amount),
      newAmount: r.new_amount == null ? null : Number(r.new_amount),
      adminEmail: r.admin_email ?? null,
      reason: r.reason ?? null,
      createdAt: r.created_at,
    })),
  };
  res.json({ ok: true, ...body });
};
