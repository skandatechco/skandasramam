import { createHash, randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type { ZodError } from "zod";
import {
  accessTokenSchema,
  createBookingSchema,
  orderNoSchema,
  submitPaymentSchema,
  type PublicBooking,
  type PublicPooja,
} from "../../shared/booking";
import { paymentsEnabled } from "../lib/paymentConfig";
import { getServiceClient } from "../lib/supabase";
import { checkBookingWindow } from "../lib/schedule";
import { checkPoojaScheduledOn } from "../lib/bookingSchedule";
import { isDonationSlug, resolveDestination } from "../../shared/poojaPages";

function fail(
  res: Response,
  status: number,
  code: string,
  error: string,
  fieldErrors?: Record<string, string[]>,
) {
  return res.status(status).json({ ok: false, code, error, fieldErrors });
}

function validationFail(res: Response, err: ZodError) {
  return fail(
    res,
    400,
    "VALIDATION_ERROR",
    "Please check the highlighted fields.",
    err.flatten().fieldErrors as Record<string, string[]>,
  );
}

function toPublicBooking(row: any): PublicBooking {
  return {
    orderNo: row.order_no,
    poojaName: row.pooja_name,
    date: row.booking_date,
    amount: Number(row.amount_inr),
    status: row.status,
    paymentStatus: row.payment_status,
  };
}

const PUBLIC_BOOKING_COLUMNS =
  "order_no, pooja_name, booking_date, amount_inr, status, payment_status";

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const newAccessToken = () => randomBytes(32).toString("base64url"); // 43 chars, 256 bits

/** Which unique constraint a Postgres 23505 error refers to. */
const violated = (err: any, constraint: string) =>
  err?.code === "23505" && String(err?.message ?? "").includes(constraint);

/**
 * Extracts the booking token from `Authorization: Bearer <token>`.
 * Returns null (caller responds 401) when absent or malformed. The token is the
 * ONLY proof of booking ownership; the order number alone grants nothing.
 */
function bearerToken(req: Request): string | null {
  const m = /^Bearer (\S+)$/.exec(req.get("authorization") ?? "");
  if (!m) return null;
  const parsed = accessTokenSchema.safeParse(m[1]);
  return parsed.success ? parsed.data : null;
}

const unauthorized = (res: Response) =>
  fail(res, 401, "UNAUTHORIZED", "A valid booking token is required.");

/** GET /api/poojas: active catalogue. Unpriced poojas are listed but not bookable. */
export const listPoojas: RequestHandler = async (_req, res) => {
  const { data, error } = await getServiceClient()
    .from("poojas")
    .select("slug, name, type, description, amount_inr")
    .eq("active", true)
    .neq("type", "festival") // festival offerings have their own endpoint and page
    .order("name");
  if (error) throw error;
  const poojas: PublicPooja[] = (data ?? []).map((p: any) => ({
    slug: p.slug,
    name: p.name,
    type: p.type,
    description: p.description,
    amount: p.amount_inr == null ? null : Number(p.amount_inr),
    destination: resolveDestination(p.slug),
    bookable: p.amount_inr != null && resolveDestination(p.slug) !== null,
  }));
  res.json({ ok: true, poojas });
};

/** POST /api/bookings: validate, check pooja/date/price, insert, return order number. */
export const createBooking: RequestHandler = async (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) return validationFail(res, parsed.error);
  const input = parsed.data;

  const windowError = checkBookingWindow(input.date);
  if (windowError)
    return fail(res, 400, "DATE_OUT_OF_RANGE", windowError, {
      date: [windowError],
    });

  const db = getServiceClient();

  const { data: pooja, error: poojaErr } = await db
    .from("poojas")
    .select("id, name, type, amount_inr")
    .eq("slug", input.poojaSlug)
    .eq("active", true)
    .maybeSingle();
  if (poojaErr) throw poojaErr;
  if (!pooja)
    return fail(res, 404, "POOJA_NOT_FOUND", "This pooja is not available.");

  // Donations (e.g. Annadanam) are a separate flow with no fixed pooja amount.
  if (isDonationSlug(input.poojaSlug)) {
    return fail(
      res,
      409,
      "DONATION_NOT_BOOKABLE",
      "This is a donation, not a pooja booking. Please use the donation page.",
    );
  }

  // Never invent or default a price: no approved price => no booking/payment.
  if (pooja.amount_inr == null) {
    return fail(
      res,
      409,
      "PRICE_NOT_APPROVED",
      "Online booking for this pooja is not open yet. Please contact the temple office.",
    );
  }

  // A pooja with no public page cannot be booked (nothing to book it from).
  if (resolveDestination(input.poojaSlug) === null) {
    return fail(
      res,
      409,
      "NOT_BOOKABLE_ONLINE",
      "Online booking for this pooja is not open yet. Please contact the temple office.",
    );
  }

  // The date must be a real occurrence of this pooja, decided by the SAME rules
  // the homepage calendar uses (daily / Panchangam / special).
  const check = await checkPoojaScheduledOn(db, pooja, input.date);
  if (!check.ok) {
    return fail(res, 409, check.code, check.message, {
      date: [check.message],
    });
  }

  // order_no is generated by the database (random, unique). Retry on a collision.
  // The raw token is returned once; only its hash is stored.
  const accessToken = newAccessToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db
      .from("bookings")
      .insert({
        pooja_id: pooja.id,
        // snapshot: for a festival offering the festival is part of the name
        pooja_name: check.festivalName
          ? `${pooja.name} (${check.festivalName})`
          : pooja.name,
        booking_date: input.date,
        devotee_name: input.name,
        phone: input.phone,
        email: input.email,
        nakshatra: input.nakshatra ?? null,
        gotra: input.gotra ?? null,
        sankalpam: input.sankalpam ?? null,
        amount_inr: pooja.amount_inr,
        access_token_hash: hashToken(accessToken),
      })
      .select(PUBLIC_BOOKING_COLUMNS)
      .single();
    if (!error) {
      return res
        .status(201)
        .json({ ok: true, booking: toPublicBooking(data), accessToken });
    }
    if (violated(error, "bookings_active_dedupe_key")) {
      return fail(
        res,
        409,
        "DUPLICATE_BOOKING",
        "A booking for this pooja and date already exists for this devotee. Please contact the temple office if you need help.",
      );
    }
    // Race-free festival rules enforced by the database trigger.
    const festivalRule = /festival_(full|closed|not_open|wrong_date)/.exec(
      String(error.message ?? ""),
    );
    if (festivalRule) {
      const map = {
        full: ["FESTIVAL_FULL", "This festival pooja is fully booked."],
        closed: [
          "FESTIVAL_CLOSED",
          "Booking for this festival pooja has closed.",
        ],
        not_open: [
          "FESTIVAL_NOT_OPEN",
          "Booking for this festival pooja has not opened yet.",
        ],
        wrong_date: [
          "NOT_SCHEDULED",
          "This festival pooja is not scheduled on the selected date.",
        ],
      } as const;
      const [code, message] = map[festivalRule[1] as keyof typeof map];
      return fail(res, 409, code, message);
    }
    if (!violated(error, "bookings_order_no_key")) throw error;
  }
  return fail(
    res,
    503,
    "ORDER_NO_COLLISION",
    "Could not create the booking. Please try again.",
  );
};

/** GET /api/bookings/:orderNo: a devotee views their own booking (order number + token). */
export const getBooking: RequestHandler = async (req, res) => {
  const order = orderNoSchema.safeParse(req.params.orderNo);
  const token = bearerToken(req);
  if (!token) return unauthorized(res);
  if (!order.success)
    return fail(res, 404, "BOOKING_NOT_FOUND", "Booking not found.");

  const { data, error } = await getServiceClient()
    .from("bookings")
    .select(PUBLIC_BOOKING_COLUMNS)
    .eq("order_no", order.data)
    .eq("access_token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) return fail(res, 404, "BOOKING_NOT_FOUND", "Booking not found.");
  res.json({ ok: true, booking: toPublicBooking(data) });
};

/**
 * POST /api/bookings/:orderNo/payment  (Authorization: Bearer <booking token>)
 * Records the devotee-supplied UPI reference and moves the payment to
 * 'awaiting_verification'. It can NEVER mark a payment verified: only an admin can.
 */
export const submitPayment: RequestHandler = async (req, res) => {
  const order = orderNoSchema.safeParse(req.params.orderNo);
  const token = bearerToken(req);
  if (!token) return unauthorized(res);
  if (!order.success)
    return fail(res, 404, "BOOKING_NOT_FOUND", "Booking not found.");
  // Production payments stay off until the real QR/config is approved at launch.
  if (!paymentsEnabled()) {
    return fail(
      res,
      503,
      "PAYMENTS_UNAVAILABLE",
      "Online payment instructions are temporarily unavailable. Please contact the temple office.",
    );
  }
  const parsed = submitPaymentSchema.safeParse(req.body);
  if (!parsed.success) return validationFail(res, parsed.error);

  const db = getServiceClient();
  const tokenHash = hashToken(token);
  const { data: existing, error: findErr } = await db
    .from("bookings")
    .select(PUBLIC_BOOKING_COLUMNS)
    .eq("order_no", order.data)
    .eq("access_token_hash", tokenHash)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!existing)
    return fail(res, 404, "BOOKING_NOT_FOUND", "Booking not found.");

  if (existing.status === "cancelled") {
    return fail(
      res,
      409,
      "BOOKING_CANCELLED",
      "This booking has been cancelled.",
    );
  }
  if (!["unpaid", "rejected"].includes(existing.payment_status)) {
    return fail(
      res,
      409,
      "PAYMENT_ALREADY_SUBMITTED",
      existing.payment_status === "verified"
        ? "Payment for this booking is already verified."
        : "A payment reference has already been submitted and is awaiting verification.",
    );
  }

  // Conditional update guards against concurrent submissions / state changes.
  const { data: updated, error: updErr } = await db
    .from("bookings")
    .update({
      upi_ref: parsed.data.upiRef,
      payment_status: "awaiting_verification",
      payment_submitted_at: new Date().toISOString(),
    })
    .eq("order_no", order.data)
    .eq("access_token_hash", tokenHash)
    .in("payment_status", ["unpaid", "rejected"])
    .neq("status", "cancelled")
    .select(PUBLIC_BOOKING_COLUMNS)
    .maybeSingle();
  if (violated(updErr, "bookings_upi_ref_active_key")) {
    return fail(
      res,
      409,
      "DUPLICATE_PAYMENT_REF",
      "This UPI reference has already been used for another booking. Please check it, or contact the temple office.",
      { upiRef: ["Reference already used"] },
    );
  }
  if (updErr) throw updErr;
  if (!updated) {
    return fail(
      res,
      409,
      "PAYMENT_STATE_CHANGED",
      "This booking changed. Please reload and try again.",
    );
  }

  res.json({
    ok: true,
    message:
      "Payment reference received. Your payment is awaiting verification by the temple.",
    booking: toPublicBooking(updated),
  });
};
