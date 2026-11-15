import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  createBooking,
  getBooking,
  getPoojas,
  submitPaymentRef,
} from "./api";
import { loadBookingToken, saveBookingToken } from "./bookingToken";
import { formatDate, formatINR } from "./format";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const mockFetch = (
  impl: (url: string, init?: RequestInit) => Promise<Response>,
) => vi.stubGlobal("fetch", vi.fn(impl));
afterEach(() => vi.unstubAllGlobals());

const body = {
  poojaSlug: "pradosham",
  date: "2027-01-10",
  name: "Test",
  phone: "9876543210",
  email: "t@example.com",
};
const booking = {
  orderNo: "SKD-261115-A1B2C3",
  poojaName: "Pradosham",
  date: "2027-01-10",
  amount: 500,
  status: "pending",
  paymentStatus: "unpaid",
};

describe("api client", () => {
  it("returns the order number and token on a successful booking", async () => {
    mockFetch(async () =>
      json(201, { ok: true, booking, accessToken: "T".repeat(43) }),
    );
    const r = await createBooking(body);
    expect(r.booking.orderNo).toBe("SKD-261115-A1B2C3");
    expect(r.accessToken).toHaveLength(43);
  });

  it("maps server validation errors, keeping field errors", async () => {
    mockFetch(async () =>
      json(400, {
        ok: false,
        code: "VALIDATION_ERROR",
        error: "Please check the highlighted fields.",
        fieldErrors: { email: ["Enter a valid email"] },
      }),
    );
    const err = await createBooking(body).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.fieldErrors.email[0]).toBe("Enter a valid email");
  });

  it("surfaces PRICE_NOT_APPROVED and duplicate errors by code", async () => {
    mockFetch(async () =>
      json(409, {
        ok: false,
        code: "PRICE_NOT_APPROVED",
        error: "not open yet",
      }),
    );
    expect(
      ((await createBooking(body).catch((e) => e)) as ApiRequestError).code,
    ).toBe("PRICE_NOT_APPROVED");
    mockFetch(async () =>
      json(409, { ok: false, code: "DUPLICATE_BOOKING", error: "exists" }),
    );
    expect(
      ((await createBooking(body).catch((e) => e)) as ApiRequestError).status,
    ).toBe(409);
  });

  it("handles server errors and non-JSON responses with a generic message", async () => {
    mockFetch(
      async () => new Response("<html>Bad Gateway</html>", { status: 502 }),
    );
    const err = await getPoojas().catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(502);
    expect(err.message).not.toContain("html");
  });

  it("reports network failures distinctly", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await getPoojas().catch((e) => e);
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("sends the booking token as a Bearer header — never in the URL or body", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    mockFetch(async (url, init) => {
      calls.push({ url, init });
      return json(200, { ok: true, booking, message: "ok" });
    });
    const token = "Z".repeat(43);
    await getBooking("SKD-261115-A1B2C3", token);
    await submitPaymentRef("SKD-261115-A1B2C3", token, "123456789012");
    for (const c of calls) {
      expect((c.init!.headers as any).Authorization).toBe(`Bearer ${token}`);
      expect(c.url).not.toContain(token);
    }
    // the payment body contains the reference only: no status, amount or phone
    expect(JSON.parse(calls[1].init!.body as string)).toEqual({
      upiRef: "123456789012",
    });
  });

  it("rejects an unauthorised payment update with the server's error", async () => {
    mockFetch(async () =>
      json(404, {
        ok: false,
        code: "BOOKING_NOT_FOUND",
        error: "Booking not found.",
      }),
    );
    const err = await submitPaymentRef(
      "SKD-261115-A1B2C3",
      "X".repeat(43),
      "123456789012",
    ).catch((e) => e);
    expect(err.status).toBe(404);
  });
});

describe("booking token storage", () => {
  it("round-trips per order and tolerates unavailable storage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    saveBookingToken("SKD-1", "tok");
    expect(loadBookingToken("SKD-1")).toBe("tok");
    expect(loadBookingToken("SKD-2")).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => saveBookingToken("SKD-1", "tok")).not.toThrow();
    expect(loadBookingToken("SKD-1")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats rupees and dates without timezone drift", () => {
    expect(formatINR(1500)).toBe("₹1,500");
    expect(formatINR(1500.5)).toBe("₹1,500.50");
    expect(formatDate("2027-01-10")).toBe("10 January 2027");
  });
});
