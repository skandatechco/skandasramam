/**
 * Payment-instructions configuration (client side).
 *
 * To replace the QR before launch: drop the temple's real QR image at
 * `public/images/temple-upi-qr.png` (served at PAYMENT_QR_IMAGE_URL). No code
 * change is needed.
 *
 * Modes
 * - "test"     Development only. Shows a clearly labelled "TEST QR — DO NOT PAY"
 *              placeholder (or a dummy image, badged as test). Payment references
 *              may be submitted so the flow can be developed end to end.
 * - "live"     Real payment instructions. Only reachable when
 *              VITE_PAYMENT_QR_CONFIGURED === "true" (set deliberately at launch,
 *              after the real QR image is in place and approved).
 * - "disabled" Anything else in a production build. No instructions, and the
 *              payment-reference form is not rendered.
 *
 * A production build can NEVER be in "test" mode, whatever the env says. The
 * server enforces the same rule independently (see server/lib/paymentConfig.ts),
 * so bypassing this UI does not enable payments.
 */
export const PAYMENT_QR_IMAGE_URL = "/images/temple-upi-qr.png";

export type PaymentMode = "test" | "live" | "disabled";

export interface PaymentEnv {
  PROD: boolean;
  VITE_PAYMENT_QR_CONFIGURED?: string;
}

export function resolvePaymentMode(env: PaymentEnv): PaymentMode {
  if (env.VITE_PAYMENT_QR_CONFIGURED === "true") return "live";
  return env.PROD ? "disabled" : "test";
}

export const PAYMENT_MODE: PaymentMode = resolvePaymentMode({
  PROD: import.meta.env.PROD,
  VITE_PAYMENT_QR_CONFIGURED: import.meta.env.VITE_PAYMENT_QR_CONFIGURED,
});

/** Optional, supplied by the temple. Shown only in live mode; never invented. */
export const UPI_ID: string = import.meta.env.VITE_UPI_ID ?? "";

export type QrState =
  | "checking" // image load still in flight
  | "live" // real QR loaded, live mode
  | "test-image" // dummy image loaded, test mode
  | "test-placeholder" // no image, test mode: show "TEST QR — DO NOT PAY"
  | "unavailable"; // production not configured, or live QR image missing

/**
 * @param imageLoaded true = loaded, false = failed/missing, null = still loading
 */
export function deriveQrState(
  mode: PaymentMode,
  imageLoaded: boolean | null,
): QrState {
  if (mode === "disabled") return "unavailable";
  if (imageLoaded === null) return "checking";
  if (mode === "live") return imageLoaded ? "live" : "unavailable";
  return imageLoaded ? "test-image" : "test-placeholder";
}

/** Whether the payment-reference form may be shown/submitted. */
export function paymentsAllowed(state: QrState): boolean {
  return (
    state === "live" || state === "test-image" || state === "test-placeholder"
  );
}
