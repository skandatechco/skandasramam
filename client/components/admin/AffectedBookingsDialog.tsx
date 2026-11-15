import { useEffect, useState } from "react";
import type { BookingHandling } from "@shared/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CHOICES: Record<BookingHandling, { label: string; help: string }> = {
  keep: {
    label: "Keep the bookings as they are",
    help: "Nothing is moved or cancelled. I will contact the affected devotees myself.",
  },
  cancel: {
    label: "Cancel the bookings",
    help: "Each booking is cancelled and recorded in its history. Refunds are handled separately.",
  },
  move: {
    label: "Move the bookings to the new date",
    help: "Each booking moves to the new date and is recorded in its history.",
  },
};

export interface AffectedBookingsDialogProps {
  open: boolean;
  count: number;
  orders: string[];
  /** which ways of handling are valid for this particular change */
  allowed: BookingHandling[];
  busy?: boolean;
  onConfirm: (handling: BookingHandling, reason: string) => void;
  onClose: () => void;
}

/**
 * Shown whenever a schedule change affects bookings that already exist. The admin
 * must choose what happens to them and give a reason; nothing is moved or
 * cancelled unless they do.
 */
export function AffectedBookingsDialog({
  open,
  count,
  orders,
  allowed,
  busy = false,
  onConfirm,
  onClose,
}: AffectedBookingsDialogProps) {
  const [handling, setHandling] = useState<BookingHandling | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setHandling(null);
      setReason("");
    }
  }, [open]);

  const valid = handling !== null && reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This change affects existing bookings</DialogTitle>
          <DialogDescription>
            {count} live booking{count === 1 ? "" : "s"} exist for this
            schedule. Decide what happens to {count === 1 ? "it" : "them"};
            nothing changes until you choose.
          </DialogDescription>
        </DialogHeader>

        {orders.length > 0 && (
          <p
            className="break-words font-mono text-xs text-muted-foreground"
            data-testid="affected-orders"
          >
            {orders.slice(0, 20).join(", ")}
            {orders.length > 20 ? ` … and ${orders.length - 20} more` : ""}
          </p>
        )}

        <fieldset className="grid gap-2" disabled={busy}>
          <legend className="sr-only">
            How should the bookings be handled?
          </legend>
          {allowed.map((h) => (
            <label
              key={h}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary"
            >
              <input
                type="radio"
                name="handling"
                value={h}
                checked={handling === h}
                onChange={() => setHandling(h)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">{CHOICES[h].label}</span>
                <span className="block text-muted-foreground">
                  {CHOICES[h].help}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <Label htmlFor="affected-reason">
            Reason (kept in the audit history)
          </Label>
          <Textarea
            id="affected-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Go back
          </Button>
          <Button
            disabled={!valid || busy}
            onClick={() => handling && onConfirm(handling, reason.trim())}
          >
            {busy ? "Saving…" : "Apply change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
