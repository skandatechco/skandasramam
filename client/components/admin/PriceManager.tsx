import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AdminPooja } from "@shared/admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminApiError, adminApi } from "@/lib/adminApi";
import { formatINR } from "@/lib/format";

const TYPE_LABEL = {
  daily: "Daily",
  panchangam: "Panchangam",
  special: "Special",
} as const;
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

/** At most two decimals, positive, within the database limit. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 1_000_000 ? n : null;
}

function PriceDialog({
  pooja,
  onClose,
}: {
  pooja: AdminPooja | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false); // synchronous guard: isPending updates a tick late

  const save = useMutation({
    mutationFn: (b: { amount: number | null; reason: string }) =>
      adminApi.setPrice(pooja!.id, b),
    onSuccess: ({ newAmount }) => {
      toast.success(
        newAmount === null
          ? "Price withdrawn; booking is closed"
          : `Price set to ${formatINR(newAmount)}`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "poojas"] });
      qc.invalidateQueries({ queryKey: ["admin", "price-history", pooja!.id] });
      close();
    },
    onError: (e) =>
      setError(
        e instanceof AdminApiError ? e.message : "Something went wrong.",
      ),
  });

  function close() {
    setAmount("");
    setWithdraw(false);
    setReason("");
    setError(null);
    onClose();
  }

  const parsed = withdraw ? null : parseAmount(amount);
  const amountOk = withdraw || parsed !== null;
  const reasonOk = reason.trim().length >= 3;

  return (
    <Dialog
      open={!!pooja}
      onOpenChange={(o) => !o && !save.isPending && close()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set the participation amount</DialogTitle>
          <DialogDescription>
            {pooja?.name}. One fixed amount in INR. Existing bookings keep the
            amount they were made at.
          </DialogDescription>
        </DialogHeader>
        {pooja && (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (inFlight.current || save.isPending || !amountOk || !reasonOk)
                return;
              inFlight.current = true;
              setError(null);
              save.mutate({
                amount: withdraw ? null : parsed,
                reason: reason.trim(),
              });
            }}
          >
            <p className="text-sm text-muted-foreground">
              Current amount:{" "}
              <strong>
                {pooja.amount === null
                  ? "not approved"
                  : formatINR(pooja.amount)}
              </strong>
            </p>
            <div>
              <Label htmlFor="price-amount">New amount (₹)</Label>
              <Input
                id="price-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 501"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={withdraw || save.isPending}
                aria-invalid={!withdraw && amount !== "" && parsed === null}
              />
              {!withdraw && amount !== "" && parsed === null && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  Enter an amount above zero with at most two decimals.
                </p>
              )}
            </div>
            {pooja.amount !== null && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withdraw}
                  onChange={(e) => setWithdraw(e.target.checked)}
                />
                Withdraw the price (booking closes until a new amount is
                approved)
              </label>
            )}
            <div>
              <Label htmlFor="price-reason">
                Reason (kept in the audit history)
              </Label>
              <Textarea
                id="price-reason"
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={save.isPending}
              />
            </div>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!amountOk || !reasonOk || save.isPending}
              >
                {save.isPending
                  ? "Saving…"
                  : withdraw
                    ? "Withdraw price"
                    : "Save amount"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  pooja,
  onClose,
}: {
  pooja: AdminPooja | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["admin", "price-history", pooja?.id],
    queryFn: () => adminApi.priceHistory(pooja!.id),
    enabled: !!pooja,
  });
  const show = (n: number | null) =>
    n === null ? "not approved" : formatINR(n);
  return (
    <Dialog open={!!pooja} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Price history</DialogTitle>
          <DialogDescription>{pooja?.name}</DialogDescription>
        </DialogHeader>
        {q.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {q.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load the history.
          </p>
        )}
        {q.data?.length === 0 && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="no-price-history"
          >
            No price has been recorded yet.
          </p>
        )}
        <ol className="space-y-2">
          {q.data?.map((h) => (
            <li
              key={h.id}
              className="rounded-md border p-3 text-sm"
              data-testid="price-history-item"
            >
              <p className="font-medium">
                {show(h.oldAmount)} → {show(h.newAmount)}
              </p>
              {h.reason && <p className="mt-1">{h.reason}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {h.adminEmail ?? "Changed outside the admin page"} ·{" "}
                {fmtDateTime(h.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

/** Catalogue with the ONE fixed amount per pooja. Prices change only here, with a reason. */
export function PriceManager() {
  const poojas = useQuery({
    queryKey: ["admin", "poojas"],
    queryFn: adminApi.poojas,
  });
  const [editing, setEditing] = useState<AdminPooja | null>(null);
  const [history, setHistory] = useState<AdminPooja | null>(null);

  return (
    <section aria-labelledby="catalogue-heading">
      <div className="mb-3">
        <h3 id="catalogue-heading" className="text-lg font-semibold">
          Pooja catalogue and participation amounts
        </h3>
        <p className="text-sm text-muted-foreground">
          Each pooja has one fixed amount in INR. A pooja without an approved
          amount, or without a public page, cannot be booked. Every change is
          recorded with your name and a reason.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pooja</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Approved amount</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {poojas.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {poojas.isError && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-destructive"
                  role="alert"
                >
                  Could not load the catalogue.
                </TableCell>
              </TableRow>
            )}
            {poojas.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                  data-testid="no-poojas"
                >
                  The pooja catalogue is empty.
                </TableCell>
              </TableRow>
            )}
            {poojas.data?.map((p) => {
              const bookable =
                p.amount !== null && p.destination !== null && p.active;
              return (
                <TableRow key={p.id} data-testid="pooja-row">
                  <TableCell>
                    {p.name}
                    {!p.destination && (
                      <span
                        className="ml-2 text-xs text-destructive"
                        data-testid="no-page"
                      >
                        No public page
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{TYPE_LABEL[p.type]}</TableCell>
                  <TableCell className="text-right">
                    {p.amount === null ? (
                      <span className="text-muted-foreground">
                        Not approved
                      </span>
                    ) : (
                      <span data-testid="amount">{formatINR(p.amount)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={bookable ? "secondary" : "outline"}>
                      {bookable ? "Open" : "Closed"}
                    </Badge>
                    {bookable && p.scheduleCount === 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        nothing scheduled
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(p)}
                      >
                        {p.amount === null ? "Set amount" : "Change amount"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHistory(p)}
                      >
                        History
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <PriceDialog pooja={editing} onClose={() => setEditing(null)} />
      <HistoryDialog pooja={history} onClose={() => setHistory(null)} />
    </section>
  );
}
