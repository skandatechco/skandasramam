import type {
  AdminBookingDetail,
  AdminFestival,
  AdminFestivalHistory,
  AdminBookingRow,
  AdminMe,
  AdminPanchangamRule,
  AdminPooja,
  AdminPriceHistoryEntry,
  AdminRecurringRule,
  AdminScheduleAuditEntry,
  AdminSpecialDate,
  AdminStats,
  BookingAction,
  BookingHandling,
  Paged,
} from "@shared/admin";
import { supabase } from "./supabaseClient";

export class AdminApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public extra: Record<string, any> = {},
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

let onUnauthorized: (() => void) | null = null;
/** The admin gate registers a handler that signs out and shows "session expired". */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession(); // refreshes if near expiry
  return data.session?.access_token ?? null;
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await accessToken();
  if (!token) {
    onUnauthorized?.();
    throw new AdminApiError("Please sign in.", 401, "UNAUTHENTICATED");
  }
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new AdminApiError(
      "Could not reach the server. Check your connection.",
      0,
      "NETWORK_ERROR",
    );
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 401) onUnauthorized?.();
  if (!res.ok || !json?.ok) {
    const { error, code, ...extra } = json ?? {};
    throw new AdminApiError(
      error || "Something went wrong. Please try again.",
      res.status,
      code || "SERVER_ERROR",
      extra,
    );
  }
  return json as T;
}

export interface BookingQuery {
  page: number;
  pageSize?: number;
  q?: string;
  status?: string;
  paymentStatus?: string;
  /** bookings of one catalogue entry, e.g. a festival offering's poojaId */
  poojaId?: string;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o))
    if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Create a festival offering: its own fixed amount, never taken from the template. */
export interface FestivalCreateBody {
  festivalName: string;
  poojaName: string;
  description?: string | null;
  date: string;
  startTime?: string | null;
  amount: number;
  bookingOpensOn?: string | null;
  bookingClosesOn?: string | null;
  maxBookings?: number | null;
  active?: boolean;
  templatePoojaId?: string | null;
  reason?: string;
}
export interface FestivalPatchBody
  extends Partial<Omit<FestivalCreateBody, "templatePoojaId" | "reason">> {
  /** required, with a reason, when live bookings exist and the date moves or the offering is deactivated */
  handling?: BookingHandling;
  reason: string;
}

/** Rule changes accept only 'keep' (bookings are never cancelled or moved by a rule edit). */
export interface RuleExtra {
  handling?: "keep";
  reason?: string;
}

export const adminApi = {
  me: () => request<{ ok: true; admin: AdminMe }>("/me").then((r) => r.admin),
  stats: () =>
    request<{ ok: true; stats: AdminStats }>("/stats").then((r) => r.stats),
  bookings: (q: BookingQuery) =>
    request<{ ok: true } & Paged<AdminBookingRow>>(`/bookings${qs({ ...q })}`),
  booking: (id: string) =>
    request<{ ok: true; booking: AdminBookingDetail }>(`/bookings/${id}`).then(
      (r) => r.booking,
    ),
  bookingAction: (id: string, action: BookingAction, note?: string) =>
    request<{ ok: true; booking: AdminBookingDetail }>(
      `/bookings/${id}/actions`,
      {
        method: "POST",
        body: { action, ...(note ? { note } : {}) },
      },
    ).then((r) => r.booking),
  poojas: () =>
    request<{ ok: true; poojas: AdminPooja[] }>("/poojas").then(
      (r) => r.poojas,
    ),
  recurring: () =>
    request<{ ok: true; rules: AdminRecurringRule[] }>(
      "/recurring-schedules",
    ).then((r) => r.rules),
  setRecurringActive: (id: string, active: boolean, extra: RuleExtra = {}) =>
    request<{ ok: true }>(`/recurring-schedules/${id}`, {
      method: "PATCH",
      body: { active, ...extra },
    }),
  panchangamRules: () =>
    request<{ ok: true; rules: AdminPanchangamRule[] }>(
      "/panchangam-rules",
    ).then((r) => r.rules),
  setPanchangamRuleActive: (
    id: string,
    active: boolean,
    extra: RuleExtra = {},
  ) =>
    request<{ ok: true }>(`/panchangam-rules/${id}`, {
      method: "PATCH",
      body: { active, ...extra },
    }),
  special: () =>
    request<{ ok: true; dates: AdminSpecialDate[] }>(
      "/special-schedules?includeInactive=true",
    ).then((r) => r.dates),
  createSpecial: (b: {
    poojaId: string;
    date: string;
    startTime?: string | null;
    notes?: string | null;
    reason?: string;
  }) =>
    request<{ ok: true; date: AdminSpecialDate }>("/special-schedules", {
      method: "POST",
      body: b,
    }),
  patchSpecial: (
    id: string,
    b: {
      date?: string;
      startTime?: string | null;
      notes?: string | null;
      active?: boolean;
      /** required, with a reason, when live bookings exist on the date */
      handling?: BookingHandling;
      reason?: string;
    },
  ) =>
    request<{ ok: true; date: AdminSpecialDate }>(`/special-schedules/${id}`, {
      method: "PATCH",
      body: b,
    }),
  setPrice: (id: string, b: { amount: number | null; reason: string }) =>
    request<{ ok: true; oldAmount: number | null; newAmount: number | null }>(
      `/poojas/${id}/price`,
      { method: "POST", body: b },
    ),
  priceHistory: (id: string) =>
    request<{ ok: true; history: AdminPriceHistoryEntry[] }>(
      `/poojas/${id}/price-history`,
    ).then((r) => r.history),
  festivals: () =>
    request<{ ok: true; festivals: AdminFestival[] }>("/festivals").then(
      (r) => r.festivals,
    ),
  createFestival: (b: FestivalCreateBody) =>
    request<{ ok: true; festival: AdminFestival }>("/festivals", {
      method: "POST",
      body: b,
    }),
  patchFestival: (id: string, b: FestivalPatchBody) =>
    request<{ ok: true; festival: AdminFestival }>(`/festivals/${id}`, {
      method: "PATCH",
      body: b,
    }),
  festivalHistory: (id: string) =>
    request<{ ok: true } & AdminFestivalHistory>(`/festivals/${id}/history`),
  scheduleAudit: (limit = 50) =>
    request<{ ok: true; entries: AdminScheduleAuditEntry[] }>(
      `/schedule-audit?limit=${limit}`,
    ).then((r) => r.entries),
};
