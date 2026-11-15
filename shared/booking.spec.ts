import { describe, expect, it } from "vitest";
import {
  accessTokenSchema,
  createBookingSchema,
  normalizePhone,
  orderNoSchema,
  submitPaymentSchema,
} from "./booking";

const valid = {
  poojaSlug: "pradosham",
  date: "2027-01-10",
  name: "Test Devotee",
  phone: "+91 98765-43210",
  email: "Test@Example.com",
};

describe("normalizePhone", () => {
  it("strips formatting and the India prefix", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizePhone("09876543210")).toBe("9876543210");
  });
});

describe("createBookingSchema", () => {
  it("accepts a valid booking and normalises fields", () => {
    const r = createBookingSchema.parse({
      ...valid,
      gotra: "  Kashyapa ",
      sankalpam: "",
    });
    expect(r.phone).toBe("9876543210");
    expect(r.email).toBe("test@example.com");
    expect(r.gotra).toBe("Kashyapa");
    expect(r.sankalpam).toBeUndefined();
  });
  it("rejects bad dates, phones, emails and unknown fields", () => {
    expect(
      createBookingSchema.safeParse({ ...valid, date: "2027-02-30" }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({ ...valid, phone: "123" }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({ ...valid, email: "nope" }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({ ...valid, poojaSlug: "../x" }).success,
    ).toBe(false);
    // clients must not be able to set price / status
    expect(createBookingSchema.safeParse({ ...valid, amount: 1 }).success).toBe(
      false,
    );
    expect(
      createBookingSchema.safeParse({ ...valid, paymentStatus: "verified" })
        .success,
    ).toBe(false);
  });
  it("caps sankalpam length", () => {
    expect(
      createBookingSchema.safeParse({ ...valid, sankalpam: "a".repeat(1001) })
        .success,
    ).toBe(false);
  });
});

describe("order numbers and payments", () => {
  it("validates order number format (case-insensitive)", () => {
    expect(orderNoSchema.parse("skd-261115-a1b2c3")).toBe("SKD-261115-A1B2C3");
    expect(orderNoSchema.safeParse("SKD-1-2").success).toBe(false);
  });
  it("accepts only well-formed 43-char booking tokens", () => {
    expect(accessTokenSchema.safeParse("A".repeat(43)).success).toBe(true);
    expect(accessTokenSchema.safeParse("A".repeat(42)).success).toBe(false);
    expect(accessTokenSchema.safeParse("A".repeat(42) + "=").success).toBe(
      false,
    );
  });
  it("validates the UPI reference and refuses extra fields such as a verified status", () => {
    expect(
      submitPaymentSchema.safeParse({ upiRef: "123456789012" }).success,
    ).toBe(true);
    expect(submitPaymentSchema.safeParse({ upiRef: "12 34" }).success).toBe(
      false,
    );
    expect(
      submitPaymentSchema.safeParse({
        upiRef: "123456789012",
        paymentStatus: "verified",
      }).success,
    ).toBe(false);
  });
});
