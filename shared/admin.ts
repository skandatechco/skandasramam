/**
 * Admin API contracts: validation schemas, response types, and the booking
 * transition rules. The database function public.admin_booking_action() is the
 * authority; the copy here lets the UI show only valid buttons and lets the
 * server reject obviously invalid requests early (tests keep both in sync).
 */
import { z } from "zod";
import {
  isoDateSchema,
  type BookingStatus,
  type PaymentStatus,
} from "./booking";

// ---- Booking actions ---------------------------------------------------------
export const BOOKING_ACTIONS = [
  "verify_payment",
  "reject_payment",
  "confirm_booking",
  "cancel_booking",
  "add_note",
] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];

/** Actions that must carry a written reason / note (kept in the audit log). */
export const NOTE_REQUIRED: ReadonlySet<BookingAction> = new Set([
  "reject_payment",
  "cancel_booking",
  "add_note",
]);

export function allowedActions(
  status: BookingStatus,
  paymentStatus: PaymentStatus,
): BookingAction[] {
  const out: BookingAction[] = ["add_note"];
  if (status !== "cancelled" && paymentStatus === "awaiting_verification") {
    out.push("verify_payment", "reject_payment");
  }
  if (status === "pending" && paymentStatus === "verified") {
    out.push("confirm_booking");
  }
  if (status === "pending" || status === "confirmed") {
    out.push("cancel_booking");
  }
  return out;
}

export const bookingActionSchema = z
  .object({
    action: z.enum(BOOKING_ACTIONS),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (NOTE_REQUIRED.has(v.action) && !v.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "A note explaining this action is required.",
      });
    }
  });
export type BookingActionInput = z.infer<typeof bookingActionSchema>;

// ---- Query / body schemas ----------------------------------------------------
export const uuidSchema = z.string().uuid();

export const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  // Limited charset keeps the value safe inside a PostgREST filter expression.
  q: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9 @.+-]*$/, "Unsupported characters in search")
    .optional(),
  status: z.enum(["pending", "confirmed", "cancelled"]).optional(),
  paymentStatus: z
    .enum(["unpaid", "awaiting_verification", "verified", "rejected"])
    .optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  /** only the bookings of one catalogue entry (e.g. a festival offering) */
  poojaId: z.string().uuid().optional(),
});

const startTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24 hour)")
  .nullable();

/** How to treat existing live bookings when a schedule change affects them. */
export const BOOKING_HANDLING = ["keep", "cancel", "move"] as const;
export type BookingHandling = (typeof BOOKING_HANDLING)[number];

const reason = z
  .string()
  .trim()
  .min(3, "Please give a reason (at least 3 characters).")
  .max(500);

export const specialCreateSchema = z
  .object({
    poojaId: uuidSchema,
    date: isoDateSchema,
    startTime: startTime.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    reason: reason.optional(),
  })
  .strict();

export const specialPatchSchema = z
  .object({
    date: isoDateSchema.optional(),
    startTime: startTime.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    active: z.boolean().optional(),
    /** required (with a reason) when live bookings exist on the date being moved/disabled */
    handling: z.enum(BOOKING_HANDLING).optional(),
    reason: reason.optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.date !== undefined ||
      v.startTime !== undefined ||
      v.notes !== undefined ||
      v.active !== undefined,
    { message: "Nothing to update." },
  );

/** Enable/disable a recurring (daily) schedule or a Panchangam rule. */
export const ruleToggleSchema = z
  .object({
    active: z.boolean(),
    /** only "keep" is accepted for rule changes: bookings are never changed by a rule edit */
    handling: z.enum(["keep"]).optional(),
    reason: reason.optional(),
  })
  .strict();

/** One fixed INR amount per pooja. null withdraws the price (booking closes). */
export const priceChangeSchema = z
  .object({
    amount: z
      .number()
      .positive("Enter an amount greater than zero.")
      .max(1_000_000, "Amount is too large.")
      .multipleOf(0.01, "Use at most two decimal places.")
      .nullable(),
    reason,
  })
  .strict();

export const specialListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

// ---- Response types ----------------------------------------------------------
export interface AdminMe {
  id: string;
  email: string | null;
}

export interface AdminStats {
  totalBookings: number;
  awaitingVerification: number;
  confirmed: number;
  /** active special pooja dates from today onward */
  upcomingSpecialPoojas: number;
  /** active recurring daily pooja rules */
  activeRecurringRules: number;
  nextSpecialPoojas: {
    id: string;
    date: string;
    poojaName: string;
    startTime: string | null;
    liveBookings: number;
  }[];
}

export interface AdminBookingRow {
  id: string;
  orderNo: string;
  devotee: string;
  phone: string;
  poojaName: string;
  date: string;
  amount: number;
  upiRef: string | null;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  createdAt: string;
}

/** Booking history also records changes made by a schedule edit. */
export type AuditAction = BookingAction | "schedule_cancel" | "schedule_move";

export interface AdminAuditEntry {
  id: string;
  action: AuditAction;
  adminEmail: string | null;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  fromPaymentStatus: PaymentStatus;
  toPaymentStatus: PaymentStatus;
  note: string | null;
  createdAt: string;
}

export interface AdminBookingDetail extends AdminBookingRow {
  email: string;
  nakshatra: string | null;
  gotra: string | null;
  sankalpam: string | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  updatedAt: string;
  allowedActions: BookingAction[];
  history: AdminAuditEntry[];
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminPooja {
  id: string;
  slug: string;
  name: string;
  type: "daily" | "panchangam" | "special" | "festival";
  /** the one fixed participation amount in INR; null = not approved (cannot be booked) */
  amount: number | null;
  active: boolean;
  /** public booking page, or null when the pooja has none (it cannot be booked) */
  destination: string | null;
  /** active schedule rows backing this pooja */
  scheduleCount: number;
}

export interface AdminPriceHistoryEntry {
  id: string;
  oldAmount: number | null;
  newAmount: number | null;
  adminEmail: string | null; // null = changed outside the admin interface
  reason: string | null;
  createdAt: string;
}

export interface AdminPanchangamRule {
  id: string;
  poojaId: string;
  poojaName: string;
  tithis: string[];
  paksha: "shukla" | "krishna" | null;
  nakshatras: string[];
  startTime: string | null;
  notes: string | null;
  active: boolean;
}

export interface AdminScheduleAuditEntry {
  id: string;
  table:
    | "special_pooja_schedule"
    | "recurring_pooja_schedule"
    | "panchangam_pooja_rules"
    | "festival_offerings";
  action: "insert" | "update" | "delete";
  poojaName: string | null;
  adminEmail: string | null; // null = system / SQL operator
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  affectedHandling: BookingHandling | null;
  affectedBookings: string[] | null;
  createdAt: string;
}

export interface AdminRecurringRule {
  id: string;
  poojaId: string;
  poojaName: string;
  recurrence: "daily" | "weekly";
  weekday: number | null;
  startTime: string | null;
  active: boolean;
}

export interface AdminSpecialDate {
  id: string;
  poojaId: string;
  poojaName: string;
  date: string;
  startTime: string | null;
  notes: string | null;
  active: boolean;
  liveBookings: number;
}

// ---- Festival-day pooja offerings -----------------------------------------------
const optionalDate = isoDateSchema.nullable().optional();
const festivalAmount = z
  .number({ invalid_type_error: "Enter the fixed amount in INR." })
  .positive("Enter an amount greater than zero.")
  .max(1_000_000, "Amount is too large.")
  .multipleOf(0.01, "Use at most two decimal places.");
const maxBookings = z
  .number()
  .int("Use a whole number.")
  .min(1, "At least 1.")
  .max(100000)
  .nullable()
  .optional();

/**
 * A festival offering always has its OWN fixed amount (never derived from the
 * template pooja, whose standard rate is left unchanged).
 */
export const festivalCreateSchema = z
  .object({
    festivalName: z
      .string()
      .trim()
      .min(1, "Enter the festival or occasion.")
      .max(120),
    poojaName: z.string().trim().min(1, "Enter the pooja name.").max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    date: isoDateSchema,
    startTime: startTime.optional(),
    amount: festivalAmount,
    bookingOpensOn: optionalDate,
    bookingClosesOn: optionalDate,
    maxBookings,
    active: z.boolean().optional(),
    /** an existing pooja this offering is based on (only remembered; nothing is copied or changed) */
    templatePoojaId: uuidSchema.nullable().optional(),
    reason: reason.optional(),
  })
  .strict();

export const festivalPatchSchema = z
  .object({
    festivalName: z.string().trim().min(1).max(120).optional(),
    poojaName: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    date: isoDateSchema.optional(),
    startTime: startTime.optional(),
    amount: festivalAmount.optional(),
    bookingOpensOn: optionalDate,
    bookingClosesOn: optionalDate,
    maxBookings,
    active: z.boolean().optional(),
    /** required when live bookings exist on a festival whose date moves or that is deactivated */
    handling: z.enum(BOOKING_HANDLING).optional(),
    /** every festival change is recorded with a reason */
    reason,
  })
  .strict()
  .refine(
    (v) => Object.keys(v).some((k) => k !== "reason" && k !== "handling"),
    { message: "Nothing to update." },
  );

export interface AdminFestival {
  id: string;
  poojaId: string;
  slug: string;
  festivalName: string;
  poojaName: string;
  description: string | null;
  date: string;
  startTime: string | null; // HH:MM
  /** this offering's own fixed amount */
  amount: number | null;
  bookingOpensOn: string | null;
  bookingClosesOn: string | null;
  maxBookings: number | null;
  active: boolean;
  templatePoojaId: string | null;
  liveBookings: number;
  state: "open" | "not_open_yet" | "closed" | "full" | "inactive";
  /** public booking page */
  destination: string | null;
}

export interface AdminFestivalHistory {
  changes: AdminScheduleAuditEntry[];
  prices: AdminPriceHistoryEntry[];
}
