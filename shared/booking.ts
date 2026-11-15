/**
 * Booking contracts shared by the client and the server.
 * The server is the authority: it re-validates everything with these schemas.
 */
import { z } from "zod";

/** Normalise a phone number to digits only (drops +, spaces, dashes, India prefix). */
export function normalizePhone(input: string): string {
  let d = String(input ?? "").replace(/[^0-9]/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date");

const phone = z
  .string()
  .trim()
  .max(20)
  .transform(normalizePhone)
  .refine((p) => /^[0-9]{10,13}$/.test(p), "Enter a valid phone number");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const orderNoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^SKD-\d{6}-[0-9A-F]{6}$/, "Invalid order number");

export const createBookingSchema = z
  .object({
    poojaSlug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid pooja"),
    date: isoDateSchema,
    name: z.string().trim().min(2, "Enter your name").max(120),
    phone,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email")
      .max(254),
    nakshatra: optionalText(60),
    gotra: optionalText(60),
    sankalpam: optionalText(1000),
  })
  .strict();
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * Per-booking secret issued once when the booking is created (256 random bits,
 * base64url). Sent as `Authorization: Bearer <token>`. Possessing the order
 * number alone grants nothing.
 */
export const accessTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Invalid booking token");

export const submitPaymentSchema = z
  .object({
    // UPI transaction reference / UTR: alphanumeric, typically 12 digits.
    upiRef: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{10,22}$/, "Enter the 10-22 character UPI reference"),
  })
  .strict();
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;

export type BookingStatus = "pending" | "confirmed" | "cancelled";
export type PaymentStatus =
  | "unpaid"
  | "awaiting_verification"
  | "verified"
  | "rejected";

/** Response to POST /api/bookings. `accessToken` is returned exactly once. */
export interface CreateBookingResponse {
  ok: true;
  booking: PublicBooking;
  accessToken: string;
}

/** What a devotee may see about their own booking. No contact details echoed. */
export interface PublicBooking {
  orderNo: string;
  poojaName: string;
  date: string;
  amount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}

export interface PublicPooja {
  slug: string;
  name: string;
  type: "daily" | "panchangam" | "special" | "festival";
  description: string | null;
  /** null until the temple approves a price; such poojas cannot be booked. */
  amount: number | null;
  /** public booking page for this pooja, or null if it has none */
  destination: string | null;
  bookable: boolean;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
}
