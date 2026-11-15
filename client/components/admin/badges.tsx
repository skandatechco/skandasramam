import type { BookingStatus, PaymentStatus } from "@shared/booking";
import { Badge } from "@/components/ui/badge";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  awaiting_verification: "Awaiting verification",
  verified: "Verified",
  rejected: "Rejected",
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

export function PaymentBadge({ value }: { value: PaymentStatus }) {
  const variant =
    value === "awaiting_verification"
      ? "default"
      : value === "rejected"
        ? "destructive"
        : value === "verified"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{PAYMENT_LABEL[value]}</Badge>;
}

export function StatusBadge({ value }: { value: BookingStatus }) {
  const variant =
    value === "cancelled"
      ? "destructive"
      : value === "confirmed"
        ? "secondary"
        : "outline";
  return <Badge variant={variant}>{STATUS_LABEL[value]}</Badge>;
}
