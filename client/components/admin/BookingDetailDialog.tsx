import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  NOTE_REQUIRED,
  type AuditAction,
  type BookingAction,
} from "@shared/admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError, adminApi } from "@/lib/adminApi";
import { formatDate, formatINR } from "@/lib/format";
import {
  PAYMENT_LABEL,
  PaymentBadge,
  STATUS_LABEL,
  StatusBadge,
} from "./badges";

const ACTION_LABEL: Record<BookingAction, string> = {
  verify_payment: "Verify payment",
  reject_payment: "Reject payment",
  confirm_booking: "Confirm booking",
  cancel_booking: "Cancel booking",
  add_note: "Add note",
};
/** History labels, including changes made by a schedule edit. */
const HISTORY_LABEL: Record<AuditAction, string> = {
  ...ACTION_LABEL,
  schedule_cancel: "Cancelled by a schedule change",
  schedule_move: "Moved by a schedule change",
};
const ACTION_DONE: Record<BookingAction, string> = {
  verify_payment: "Payment verified",
  reject_payment: "Payment rejected",
  confirm_booking: "Booking confirmed",
  cancel_booking: "Booking cancelled",
  add_note: "Note added",
};
const DESTRUCTIVE: ReadonlySet<BookingAction> = new Set([
  "reject_payment",
  "cancel_booking",
]);

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">
        {children || "—"}
      </dd>
    </div>
  );
}

export function BookingDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<BookingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const query = useQuery({
    queryKey: ["admin", "booking", id],
    queryFn: () => adminApi.booking(id!),
    enabled: !!id,
  });
  const b = query.data;

  const act = useMutation({
    mutationFn: ({ action, note }: { action: BookingAction; note?: string }) =>
      adminApi.bookingAction(id!, action, note),
    onSuccess: (booking, { action }) => {
      qc.setQueryData(["admin", "booking", id], booking);
      qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      toast.success(ACTION_DONE[action]);
      setNote("");
      setConfirming(null);
      setError(null);
    },
    onError: (err) => {
      setConfirming(null);
      if (err instanceof AdminApiError) {
        setError(err.message);
        // Someone else changed it (or this view is stale): show the latest state.
        if (err.code === "INVALID_TRANSITION") {
          qc.invalidateQueries({ queryKey: ["admin", "booking", id] });
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
    onSettled: () => {
      busy.current = false;
    },
  });

  function run(action: BookingAction) {
    if (busy.current || act.isPending) return; // no double submission
    busy.current = true;
    setError(null);
    act.mutate({ action, note: note.trim() || undefined });
  }

  function close() {
    setNote("");
    setConfirming(null);
    setError(null);
    onClose();
  }

  const noteMissing = (a: BookingAction) =>
    NOTE_REQUIRED.has(a) && !note.trim();
  const stateActions = (b?.allowedActions ?? []).filter(
    (a) => a !== "add_note",
  );

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">
            {b?.orderNo ?? "Booking"}
          </DialogTitle>
          <DialogDescription>
            Booking details, payment verification and history.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {query.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load this booking.
          </p>
        )}

        {b && (
          <div className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              <PaymentBadge value={b.paymentStatus} />
              <StatusBadge value={b.status} />
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Devotee">{b.devotee}</Field>
              <Field label="Phone">{b.phone}</Field>
              <Field label="Email">{b.email}</Field>
              <Field label="Pooja">{b.poojaName}</Field>
              <Field label="Pooja date">{formatDate(b.date)}</Field>
              <Field label="Amount">{formatINR(b.amount)}</Field>
              <Field label="Nakshatra">{b.nakshatra}</Field>
              <Field label="Gotra">{b.gotra}</Field>
              <div className="sm:col-span-2">
                <Field label="Sankalpam">{b.sankalpam}</Field>
              </div>
              <Field label="UPI reference">
                <span className="font-mono" data-testid="detail-upi-ref">
                  {b.upiRef}
                </span>
              </Field>
              <Field label="Payment submitted">
                {b.paymentSubmittedAt && fmtDateTime(b.paymentSubmittedAt)}
              </Field>
              <Field label="Payment verified">
                {b.paymentVerifiedAt && fmtDateTime(b.paymentVerifiedAt)}
              </Field>
              <Field label="Booked">{fmtDateTime(b.createdAt)}</Field>
            </dl>

            <section aria-label="Actions" className="rounded-lg border p-4">
              <Label htmlFor="admin-note">
                Internal note (not shown to the devotee)
              </Label>
              <Textarea
                id="admin-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Required for reject, cancel and notes"
                disabled={act.isPending}
              />

              {error && (
                <Alert variant="destructive" className="mt-3" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {confirming ? (
                <div
                  className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-secondary p-3 text-sm"
                  role="group"
                  aria-label="Confirm action"
                >
                  <span className="mr-auto">
                    {confirming === "verify_payment"
                      ? `Verify ${formatINR(b.amount)} paid with reference ${b.upiRef}?`
                      : `${ACTION_LABEL[confirming]}? This is recorded in the audit history.`}
                  </span>
                  <Button
                    size="sm"
                    variant={
                      DESTRUCTIVE.has(confirming) ? "destructive" : "default"
                    }
                    disabled={act.isPending}
                    onClick={() => run(confirming)}
                  >
                    {act.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `Yes, ${ACTION_LABEL[confirming].toLowerCase()}`
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={act.isPending}
                    onClick={() => setConfirming(null)}
                  >
                    Back
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {stateActions.map((a) => (
                    <Button
                      key={a}
                      size="sm"
                      variant={DESTRUCTIVE.has(a) ? "outline" : "default"}
                      disabled={noteMissing(a) || act.isPending}
                      onClick={() => setConfirming(a)}
                    >
                      {ACTION_LABEL[a]}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={noteMissing("add_note") || act.isPending}
                    onClick={() => run("add_note")}
                  >
                    Add note
                  </Button>
                </div>
              )}
              {b.status === "cancelled" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  This booking is cancelled; only notes can be added.
                </p>
              )}
            </section>

            <section aria-label="History">
              <h3 className="text-sm font-semibold">History</h3>
              {b.history.length === 0 ? (
                <p
                  className="mt-1 text-sm text-muted-foreground"
                  data-testid="no-history"
                >
                  No admin actions yet.
                </p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {b.history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-md border p-3 text-sm"
                      data-testid="history-item"
                    >
                      <p className="font-medium">
                        {HISTORY_LABEL[h.action]}
                        {h.action !== "add_note" &&
                          h.action !== "schedule_move" && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              ({STATUS_LABEL[h.fromStatus]}/
                              {PAYMENT_LABEL[h.fromPaymentStatus]} →{" "}
                              {STATUS_LABEL[h.toStatus]}/
                              {PAYMENT_LABEL[h.toPaymentStatus]})
                            </span>
                          )}
                      </p>
                      {h.note && (
                        <p className="mt-1 whitespace-pre-wrap">{h.note}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {h.adminEmail ?? "Unknown admin"} ·{" "}
                        {fmtDateTime(h.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
