import { describe, expect, it } from "vitest";
import {
  PAYMENT_MODE,
  deriveQrState,
  paymentsAllowed,
  resolvePaymentMode,
} from "./payment";

describe("resolvePaymentMode", () => {
  it("development defaults to test mode", () => {
    expect(resolvePaymentMode({ PROD: false })).toBe("test");
  });
  it("production is disabled unless the real QR is explicitly configured", () => {
    expect(resolvePaymentMode({ PROD: true })).toBe("disabled");
    expect(
      resolvePaymentMode({ PROD: true, VITE_PAYMENT_QR_CONFIGURED: "false" }),
    ).toBe("disabled");
    expect(
      resolvePaymentMode({ PROD: true, VITE_PAYMENT_QR_CONFIGURED: "TRUE" }),
    ).toBe("disabled");
    expect(
      resolvePaymentMode({ PROD: true, VITE_PAYMENT_QR_CONFIGURED: "true" }),
    ).toBe("live");
  });
  it("a production build can never be in test mode", () => {
    for (const flag of [undefined, "", "test", "false", "true"]) {
      expect(
        resolvePaymentMode({ PROD: true, VITE_PAYMENT_QR_CONFIGURED: flag }),
      ).not.toBe("test");
    }
  });
  it("the module-level mode in this (non-production) run is test", () => {
    expect(PAYMENT_MODE).toBe("test");
  });
});

describe("deriveQrState / paymentsAllowed", () => {
  it("disabled never allows payments, even if an image exists", () => {
    for (const loaded of [null, true, false]) {
      const s = deriveQrState("disabled", loaded);
      expect(s).toBe("unavailable");
      expect(paymentsAllowed(s)).toBe(false);
    }
  });
  it("waits while the image is loading", () => {
    expect(deriveQrState("live", null)).toBe("checking");
    expect(paymentsAllowed("checking")).toBe(false);
  });
  it("live requires the real image: missing image => unavailable, never a placeholder", () => {
    expect(deriveQrState("live", true)).toBe("live");
    expect(deriveQrState("live", false)).toBe("unavailable");
    expect(paymentsAllowed(deriveQrState("live", false))).toBe(false);
  });
  it("test mode shows a dummy image or the labelled placeholder", () => {
    expect(deriveQrState("test", true)).toBe("test-image");
    expect(deriveQrState("test", false)).toBe("test-placeholder");
    expect(paymentsAllowed("test-placeholder")).toBe(true);
  });
});
