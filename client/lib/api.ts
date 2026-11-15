import type { CalendarMonthResponse } from "@shared/calendar";
import type { PublicFestival } from "@shared/festival";
import type {
  ApiError,
  CreateBookingInput,
  CreateBookingResponse,
  PublicBooking,
  PublicPooja,
} from "@shared/booking";

/** Error raised for any failed API call, carrying the server's stable error code. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(
      "Could not reach the temple server. Please check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok || !json?.ok) {
    const e = (json ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(
      e.error || "Something went wrong. Please try again.",
      res.status,
      e.code || "SERVER_ERROR",
      e.fieldErrors,
    );
  }
  return json as T;
}

export const getTempleMonth = (year: number, month: number) =>
  request<CalendarMonthResponse>(
    `/api/temple-calendar?year=${year}&month=${month}`,
  );

export const getPoojas = () =>
  request<{ ok: true; poojas: PublicPooja[] }>("/api/poojas").then(
    (r) => r.poojas,
  );

export type CreateBookingBody = {
  poojaSlug: string;
  date: string;
  name: string;
  phone: string;
  email: string;
  nakshatra?: string;
  gotra?: string;
  sankalpam?: string;
};
export const createBooking = (body: CreateBookingBody) =>
  request<CreateBookingResponse>("/api/bookings", { method: "POST", body });

export const getBooking = (orderNo: string, token: string) =>
  request<{ ok: true; booking: PublicBooking }>(
    `/api/bookings/${encodeURIComponent(orderNo)}`,
    { token },
  ).then((r) => r.booking);

export const submitPaymentRef = (
  orderNo: string,
  token: string,
  upiRef: string,
) =>
  request<{ ok: true; message: string; booking: PublicBooking }>(
    `/api/bookings/${encodeURIComponent(orderNo)}/payment`,
    { method: "POST", body: { upiRef }, token },
  );

export type { CreateBookingInput };

export const getFestival = (slug: string) =>
  request<{ ok: true; festival: PublicFestival }>(
    `/api/festivals/${encodeURIComponent(slug)}`,
  ).then((r) => r.festival);
