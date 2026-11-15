import { useEffect, useState } from "react";
import {
  PAYMENT_MODE,
  PAYMENT_QR_IMAGE_URL,
  UPI_ID,
  deriveQrState,
  type PaymentMode,
  type QrState,
} from "@/config/payment";

/**
 * Preloads the QR image and derives what may be shown. The image path and mode
 * come from config, so replacing the QR never requires touching this component.
 */
export function usePaymentQr(
  mode: PaymentMode = PAYMENT_MODE,
  src: string = PAYMENT_QR_IMAGE_URL,
): QrState {
  const [loaded, setLoaded] = useState<boolean | null>(null);

  useEffect(() => {
    if (mode === "disabled") return; // never even request the image
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setLoaded(true);
    img.onerror = () => !cancelled && setLoaded(false);
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [mode, src]);

  return deriveQrState(mode, loaded);
}

const TEST_LABEL = "TEST QR — DO NOT PAY";
export const UNAVAILABLE_TEXT =
  "Online payment instructions are temporarily unavailable";

/**
 * Presentational QR block. It never generates a QR or a UPI ID: it shows the
 * temple-supplied image, a labelled test placeholder, or an "unavailable" notice.
 */
export function PaymentQR({
  state,
  src = PAYMENT_QR_IMAGE_URL,
  upiId = UPI_ID,
}: {
  state: QrState;
  src?: string;
  upiId?: string;
}) {
  if (state === "checking") {
    return (
      <p className="text-center text-sm text-muted-foreground" role="status">
        Loading payment instructions…
      </p>
    );
  }

  if (state === "unavailable") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground"
      >
        <p className="font-medium text-foreground">{UNAVAILABLE_TEXT}.</p>
        <p className="mt-1">
          Please contact the temple office to complete your payment.
        </p>
      </div>
    );
  }

  const isTest = state === "test-image" || state === "test-placeholder";
  return (
    <div className="flex flex-col items-center gap-3">
      {isTest && (
        <p
          role="alert"
          className="rounded-md border-2 border-destructive px-3 py-1 text-sm font-bold uppercase tracking-wide text-destructive"
        >
          {TEST_LABEL}
        </p>
      )}
      {state === "test-placeholder" ? (
        <div
          data-testid="test-qr-placeholder"
          className="grid h-56 w-56 place-items-center rounded-lg border-2 border-dashed border-destructive p-4 text-center text-lg font-bold text-destructive"
        >
          {TEST_LABEL}
        </div>
      ) : (
        <img
          src={src}
          alt={isTest ? `${TEST_LABEL} (test image)` : "Temple UPI QR code"}
          className="h-56 w-56 rounded-lg border bg-white object-contain p-2"
        />
      )}
      {state === "live" && upiId && (
        <p className="text-sm">
          UPI ID: <span className="font-mono font-semibold">{upiId}</span>
        </p>
      )}
    </div>
  );
}
