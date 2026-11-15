import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentQR } from "./PaymentQR";

const html = (state: any, extra: object = {}) =>
  renderToStaticMarkup(<PaymentQR state={state} {...extra} />);

describe("PaymentQR", () => {
  it("shows the labelled test placeholder, with no image and no UPI ID, in test mode", () => {
    const h = html("test-placeholder", { upiId: "someone@bank" });
    expect(h).toContain("TEST QR — DO NOT PAY");
    expect(h).not.toContain("<img");
    expect(h).not.toContain("someone@bank");
  });
  it("labels a dummy image as a test", () => {
    const h = html("test-image");
    expect(h).toContain("TEST QR — DO NOT PAY");
    expect(h).toContain('src="/images/temple-upi-qr.png"');
  });
  it("shows the unavailable notice and no image when payments are not available", () => {
    const h = html("unavailable");
    expect(h).toContain(
      "Online payment instructions are temporarily unavailable",
    );
    expect(h).not.toContain("<img");
    expect(h).not.toContain("TEST QR");
  });
  it("renders the real QR (replaceable via src) with no test label", () => {
    const h = html("live", { src: "/images/other.png" });
    expect(h).toContain('src="/images/other.png"');
    expect(h).toContain("Temple UPI QR code");
    expect(h).not.toContain("TEST QR");
  });
  it("shows a supplied UPI ID only in live mode", () => {
    expect(html("live", { upiId: "temple@bank" })).toContain("temple@bank");
    expect(html("test-image", { upiId: "temple@bank" })).not.toContain(
      "temple@bank",
    );
  });
  it("renders nothing payable while checking", () => {
    const h = html("checking");
    expect(h).not.toContain("<img");
    expect(h).toContain("Loading");
  });
});
