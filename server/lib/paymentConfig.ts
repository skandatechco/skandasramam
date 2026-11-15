/**
 * Server-side gate for payment-reference submission. Independent of the UI, so
 * calling the API directly cannot bypass it.
 *
 * - Non-production (local dev / tests): allowed, so the flow can be built.
 * - Production: allowed only when PAYMENTS_LIVE === "true". Set it at launch,
 *   together with VITE_PAYMENT_QR_CONFIGURED=true, after the real temple QR
 *   image is in place and approved. (Vercel preview deployments also run with
 *   NODE_ENV=production, so test payments are off there too.)
 */
export function paymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.PAYMENTS_LIVE === "true";
}
