import { useRef, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import type { PublicBooking } from "@shared/booking";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError, getBooking, submitPaymentRef } from "@/lib/api";
import { loadBookingToken } from "@/lib/bookingToken";
import { formatDate, formatINR } from "@/lib/format";
import { paymentsAllowed } from "@/config/payment";
import { PaymentQR, usePaymentQr } from "@/components/booking/PaymentQR";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function PaymentStatusBanner({ booking }: { booking: PublicBooking }) {
  if (booking.status === "cancelled") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Booking cancelled</AlertTitle>
        <AlertDescription>
          This booking has been cancelled. Please contact the temple office if
          this is unexpected.
        </AlertDescription>
      </Alert>
    );
  }
  switch (booking.paymentStatus) {
    case "awaiting_verification":
      return (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertTitle>
            Payment submitted — awaiting temple verification
          </AlertTitle>
          <AlertDescription>
            The temple will verify your UPI payment manually and confirm your
            booking. Please keep your order number for reference.
          </AlertDescription>
        </Alert>
      );
    case "verified":
      return (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Payment verified</AlertTitle>
          <AlertDescription>
            {booking.status === "confirmed"
              ? "Your booking is confirmed. Thank you for your offering."
              : "Your payment has been verified. The temple will confirm your booking shortly."}
          </AlertDescription>
        </Alert>
      );
    case "rejected":
      return (
        <Alert variant="destructive">
          <AlertTitle>Payment could not be verified</AlertTitle>
          <AlertDescription>
            The temple could not match the reference you submitted. Please check
            it and submit again, or contact the temple office.
          </AlertDescription>
        </Alert>
      );
    default:
      return null;
  }
}

export default function BookingPayment() {
  const { orderNo = "" } = useParams();
  const token = loadBookingToken(orderNo);
  const qc = useQueryClient();
  const submitting = useRef(false);
  const qrState = usePaymentQr();
  const [upiRef, setUpiRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | null>(null);

  const bookingQuery = useQuery({
    queryKey: ["booking", orderNo],
    queryFn: () => getBooking(orderNo, token!),
    enabled: !!token,
    retry: (count, err) =>
      !(
        err instanceof ApiRequestError &&
        err.status >= 400 &&
        err.status < 500
      ) && count < 1,
  });

  const pay = useMutation({
    mutationFn: (ref: string) => submitPaymentRef(orderNo, token!, ref),
    onSuccess: ({ booking }) => {
      qc.setQueryData(["booking", orderNo], booking);
    },
    onError: (err) => {
      submitting.current = false;
      if (err instanceof ApiRequestError) {
        setRefError(err.fieldErrors?.upiRef?.[0] ?? null);
        // Server refused because payments are not live: nothing was saved.
        setError(err.message);
        // The booking changed under us (e.g. already submitted): show the real state.
        if (
          err.code === "PAYMENT_ALREADY_SUBMITTED" ||
          err.code === "PAYMENT_STATE_CHANGED"
        ) {
          qc.invalidateQueries({ queryKey: ["booking", orderNo] });
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current || pay.isPending || !paymentsAllowed(qrState))
      return;
    const ref = upiRef.trim();
    setError(null);
    setRefError(null);
    if (!/^[A-Za-z0-9]{10,22}$/.test(ref)) {
      setRefError(
        "Enter the 10–22 character UPI transaction reference (UTR), letters and digits only.",
      );
      return;
    }
    submitting.current = true;
    pay.mutate(ref);
  }

  const wrap = (children: React.ReactNode) => (
    <main className="container max-w-2xl py-10 md:py-14">{children}</main>
  );

  if (!token) {
    return wrap(
      <Alert>
        <AlertTitle>We can't open this booking on this device</AlertTitle>
        <AlertDescription>
          For your privacy, bookings can only be viewed on the device where they
          were made. Please contact the temple office with your order number
          {orderNo ? ` (${orderNo})` : ""}.
        </AlertDescription>
      </Alert>,
    );
  }
  if (bookingQuery.isLoading) {
    return wrap(
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your booking…
      </p>,
    );
  }
  if (bookingQuery.isError || !bookingQuery.data) {
    const notFound =
      bookingQuery.error instanceof ApiRequestError &&
      [401, 404].includes(bookingQuery.error.status);
    return wrap(
      <Alert variant="destructive">
        <AlertTitle>
          {notFound ? "Booking not found" : "Could not load your booking"}
        </AlertTitle>
        <AlertDescription>
          {notFound
            ? "We couldn't find this booking. Please contact the temple office with your order number."
            : "Please check your connection and reload the page."}
        </AlertDescription>
      </Alert>,
    );
  }

  const booking = bookingQuery.data;
  const canPay =
    booking.status !== "cancelled" &&
    ["unpaid", "rejected"].includes(booking.paymentStatus) &&
    booking.amount > 0;
  const allowed = paymentsAllowed(qrState);

  return wrap(
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">
        Booking received
      </h1>
      <p className="mt-2 text-muted-foreground">
        Your order number is{" "}
        <span
          className="font-mono text-lg font-bold text-foreground"
          data-testid="order-no"
        >
          {booking.orderNo}
        </span>
        . Please note it down.
      </p>

      <dl className="mt-6 divide-y rounded-xl border px-5">
        <Row label="Pooja">{booking.poojaName}</Row>
        <Row label="Date">{formatDate(booking.date)}</Row>
        <Row label="Amount payable">{formatINR(booking.amount)}</Row>
        <Row label="Booking status">
          <span className="capitalize">{booking.status}</span>
        </Row>
      </dl>

      <div className="mt-6">
        <PaymentStatusBanner booking={booking} />
      </div>

      {canPay && (
        <section className="mt-8 rounded-xl border p-6">
          <h2 className="text-lg font-semibold">Pay by UPI</h2>
          {allowed && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Scan the temple QR code with any UPI app and pay{" "}
                <strong className="text-foreground">
                  {formatINR(booking.amount)}
                </strong>
                .
              </li>
              <li>
                Copy the UPI transaction reference (UTR) from the payment
                confirmation.
              </li>
              <li>
                Enter it below. The temple will verify your payment manually.
              </li>
            </ol>
          )}

          <div className="mt-5">
            <PaymentQR state={qrState} />
          </div>

          {/* The reference form exists only when payment instructions are live
              (or in dev test mode). Otherwise nothing can be submitted. */}
          {allowed && (
            <form className="mt-6 grid gap-3" onSubmit={onSubmit}>
              <div>
                <Label htmlFor="upiRef">UPI transaction reference (UTR)</Label>
                <Input
                  id="upiRef"
                  value={upiRef}
                  onChange={(e) => setUpiRef(e.target.value)}
                  inputMode="text"
                  autoComplete="off"
                  maxLength={22}
                  disabled={pay.isPending}
                  aria-invalid={!!refError}
                  placeholder="e.g. 412345678901"
                />
                {refError && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {refError}
                  </p>
                )}
              </div>
              {error && !refError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={pay.isPending}>
                {pay.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                    Submitting…
                  </>
                ) : (
                  "I have paid — submit reference"
                )}
              </Button>
            </form>
          )}
        </section>
      )}

      <div className="mt-8">
        <Button asChild variant="outline">
          <NavLink to="/">Back to Home</NavLink>
        </Button>
      </div>
    </>,
  );
}
