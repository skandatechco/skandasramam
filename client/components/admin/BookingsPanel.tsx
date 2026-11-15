import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { BookingStatus, PaymentStatus } from "@shared/booking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi } from "@/lib/adminApi";
import { formatDate, formatINR } from "@/lib/format";
import { BookingDetailDialog } from "./BookingDetailDialog";
import {
  PAYMENT_LABEL,
  PaymentBadge,
  STATUS_LABEL,
  StatusBadge,
} from "./badges";

const PAGE_SIZE = 20;
const selectCls = "h-10 rounded-md border bg-background px-2 text-sm";

export function BookingsPanel({
  initialPaymentStatus = "",
}: {
  initialPaymentStatus?: PaymentStatus | "";
}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [paymentStatus, setPaymentStatus] =
    useState<string>(initialPaymentStatus);
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  // Debounce typing; any filter change returns to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ((prev) => {
        const next = search.trim();
        if (next !== prev) setPage(1);
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["admin", "bookings", { page, q, paymentStatus, status }],
    queryFn: () =>
      adminApi.bookings({
        page,
        pageSize: PAGE_SIZE,
        q,
        paymentStatus,
        status,
      }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search bookings"
            placeholder="Search order no., name, phone, UPI reference…"
            className="pl-9"
            maxLength={60}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by payment status"
          className={selectCls}
          value={paymentStatus}
          onChange={(e) => {
            setPaymentStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All payments</option>
          {Object.entries(PAYMENT_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by booking status"
          className={selectCls}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All bookings</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {query.isError && !data && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Could not load bookings.{" "}
          <button className="underline" onClick={() => query.refetch()}>
            Try again
          </button>
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order no.</TableHead>
              <TableHead>Devotee</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Pooja</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>UPI reference</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Booking</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground"
                  data-testid="no-bookings"
                >
                  No bookings found.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((b) => (
              <TableRow
                key={b.id}
                className="cursor-pointer"
                onClick={() => setOpenId(b.id)}
                data-testid="booking-row"
              >
                <TableCell>
                  <button
                    type="button"
                    className="font-mono text-xs font-semibold underline-offset-2 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenId(b.id);
                    }}
                  >
                    {b.orderNo}
                  </button>
                </TableCell>
                <TableCell>{b.devotee}</TableCell>
                <TableCell className="whitespace-nowrap">{b.phone}</TableCell>
                <TableCell>{b.poojaName}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(b.date)}
                </TableCell>
                <TableCell className="text-right">
                  {formatINR(b.amount)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {b.upiRef ?? "—"}
                </TableCell>
                <TableCell>
                  <PaymentBadge value={b.paymentStatus} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={b.status as BookingStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground" data-testid="booking-count">
            {data.total} booking{data.total === 1 ? "" : "s"} · page {data.page}{" "}
            of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <BookingDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
