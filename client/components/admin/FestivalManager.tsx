import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AdminFestival,
  AdminFestivalHistory,
  AdminPooja,
  BookingHandling,
} from "@shared/admin";
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
import {
  AdminApiError,
  adminApi,
  type FestivalCreateBody,
  type FestivalPatchBody,
} from "@/lib/adminApi";
import { formatDate, formatINR, formatTime, todayIST } from "@/lib/format";
import { AffectedBookingsDialog } from "./AffectedBookingsDialog";
import { BookingDetailDialog } from "./BookingDetailDialog";
import { PaymentBadge, StatusBadge } from "./badges";
import { parseAmount } from "./PriceManager";

const selectCls = "h-10 w-full rounded-md border bg-background px-2 text-sm";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

const STATE_LABEL: Record<AdminFestival["state"], string> = {
  open: "Booking open",
  not_open_yet: "Opens later",
  closed: "Booking closed",
  full: "Fully booked",
  inactive: "Inactive",
};

interface PendingAffected {
  count: number;
  orders: string[];
  allowed: BookingHandling[];
  run: (handling: BookingHandling, reason: string) => void;
}

// ---- create / edit form ---------------------------------------------------------------
interface FormValues {
  festivalName: string;
  templateId: string;
  poojaName: string;
  description: string;
  date: string;
  startTime: string;
  amount: string;
  opensOn: string;
  closesOn: string;
  maxBookings: string;
  active: boolean;
  reason: string;
}

const blank: FormValues = {
  festivalName: "",
  templateId: "",
  poojaName: "",
  description: "",
  date: "",
  startTime: "",
  amount: "",
  opensOn: "",
  closesOn: "",
  maxBookings: "",
  active: true,
  reason: "",
};

const fromFestival = (f: AdminFestival): FormValues => ({
  festivalName: f.festivalName,
  templateId: "",
  poojaName: f.poojaName,
  description: f.description ?? "",
  date: f.date,
  startTime: f.startTime ?? "",
  amount: f.amount === null ? "" : String(f.amount),
  opensOn: f.bookingOpensOn ?? "",
  closesOn: f.bookingClosesOn ?? "",
  maxBookings: f.maxBookings === null ? "" : String(f.maxBookings),
  active: f.active,
  reason: "",
});

/** Why the form cannot be submitted yet (null = valid). */
function validate(v: FormValues, editing: boolean): string | null {
  if (!v.festivalName.trim()) return "Enter the festival or occasion name.";
  if (!v.poojaName.trim()) return "Enter the pooja name.";
  if (!v.date) return "Choose the festival date.";
  if (parseAmount(v.amount) === null)
    return "Enter the fixed amount in INR (above zero, at most two decimals).";
  if (v.maxBookings.trim() !== "") {
    const n = Number(v.maxBookings);
    if (!Number.isInteger(n) || n < 1)
      return "Maximum bookings must be a whole number of at least 1.";
  }
  if (v.opensOn && v.closesOn && v.opensOn > v.closesOn)
    return "Booking cannot open after it closes.";
  if ((v.opensOn && v.opensOn > v.date) || (v.closesOn && v.closesOn > v.date))
    return "The booking window must end on or before the festival date.";
  if (editing && v.reason.trim().length < 3)
    return "Give a reason for the change (at least 3 characters).";
  return null;
}

function FestivalFormDialog({
  open,
  festival,
  templates,
  busy,
  error,
  onCreate,
  onEdit,
  onClose,
}: {
  open: boolean;
  /** null = create a new offering */
  festival: AdminFestival | null;
  templates: AdminPooja[];
  busy: boolean;
  error: string | null;
  onCreate: (b: FestivalCreateBody) => void;
  onEdit: (id: string, b: FestivalPatchBody) => void;
  onClose: () => void;
}) {
  const editing = festival !== null;
  const [v, setV] = useState<FormValues>(
    festival ? fromFestival(festival) : blank,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const template = templates.find((t) => t.id === v.templateId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = validate(v, editing);
    setLocalError(problem);
    if (problem) return;

    const amount = parseAmount(v.amount)!;
    const max = v.maxBookings.trim() === "" ? null : Number(v.maxBookings);
    if (!festival) {
      onCreate({
        festivalName: v.festivalName.trim(),
        poojaName: v.poojaName.trim(),
        description: v.description.trim() || null,
        date: v.date,
        startTime: v.startTime || null,
        amount,
        bookingOpensOn: v.opensOn || null,
        bookingClosesOn: v.closesOn || null,
        maxBookings: max,
        active: v.active,
        templatePoojaId: v.templateId || null,
        reason: v.reason.trim() || undefined,
      });
      return;
    }
    // Edit: send only what changed.
    const body: FestivalPatchBody = { reason: v.reason.trim() };
    if (v.festivalName.trim() !== festival.festivalName)
      body.festivalName = v.festivalName.trim();
    if (v.poojaName.trim() !== festival.poojaName)
      body.poojaName = v.poojaName.trim();
    if ((v.description.trim() || null) !== festival.description)
      body.description = v.description.trim() || null;
    if (v.date !== festival.date) body.date = v.date;
    if ((v.startTime || null) !== festival.startTime)
      body.startTime = v.startTime || null;
    if (amount !== festival.amount) body.amount = amount;
    if ((v.opensOn || null) !== festival.bookingOpensOn)
      body.bookingOpensOn = v.opensOn || null;
    if ((v.closesOn || null) !== festival.bookingClosesOn)
      body.bookingClosesOn = v.closesOn || null;
    if (max !== festival.maxBookings) body.maxBookings = max;
    if (v.active !== festival.active) body.active = v.active;
    if (Object.keys(body).length === 1) {
      setLocalError("Nothing has changed.");
      return;
    }
    onEdit(festival.id, body);
  }

  const shownError = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit festival pooja" : "Add Festival Pooja"}
          </DialogTitle>
          <DialogDescription>
            A festival offering has its own fixed amount. It never changes the
            standard rate of any existing pooja.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3" noValidate>
          <div>
            <Label htmlFor="ff-festival">Festival or occasion</Label>
            <Input
              id="ff-festival"
              maxLength={120}
              value={v.festivalName}
              onChange={(e) => set("festivalName", e.target.value)}
              disabled={busy}
            />
          </div>

          {!editing && (
            <div>
              <Label htmlFor="ff-template">
                Start from an existing pooja (optional)
              </Label>
              <select
                id="ff-template"
                className={selectCls}
                value={v.templateId}
                disabled={busy}
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value);
                  setV((p) => ({
                    ...p,
                    templateId: e.target.value,
                    poojaName: t && !p.poojaName.trim() ? t.name : p.poojaName,
                  }));
                }}
              >
                <option value="">None: create a new offering</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {template && (
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  data-testid="template-note"
                >
                  {template.name} keeps its standard rate
                  {template.amount !== null
                    ? ` of ${formatINR(template.amount)}`
                    : ""}
                  . The amount below is only for this festival offering.
                </p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="ff-pooja">Pooja name</Label>
            <Input
              id="ff-pooja"
              maxLength={200}
              value={v.poojaName}
              onChange={(e) => set("poojaName", e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="ff-desc">Description</Label>
            <Textarea
              id="ff-desc"
              rows={3}
              maxLength={2000}
              value={v.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="ff-date">Date</Label>
              <Input
                id="ff-date"
                type="date"
                min={editing ? undefined : todayIST()}
                value={v.date}
                onChange={(e) => set("date", e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="ff-time">Start time</Label>
              <Input
                id="ff-time"
                type="time"
                value={v.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="ff-amount">Fixed amount (₹)</Label>
              <Input
                id="ff-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 501"
                value={v.amount}
                onChange={(e) => set("amount", e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="ff-opens">Booking opens (optional)</Label>
              <Input
                id="ff-opens"
                type="date"
                value={v.opensOn}
                onChange={(e) => set("opensOn", e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="ff-closes">Booking closes (optional)</Label>
              <Input
                id="ff-closes"
                type="date"
                value={v.closesOn}
                onChange={(e) => set("closesOn", e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="ff-max">Maximum bookings (optional)</Label>
              <Input
                id="ff-max"
                inputMode="numeric"
                value={v.maxBookings}
                onChange={(e) => set("maxBookings", e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.active}
              onChange={(e) => set("active", e.target.checked)}
              disabled={busy}
            />
            Active (shown on the calendar and open for booking)
          </label>

          <div>
            <Label htmlFor="ff-reason">
              {editing
                ? "Reason for the change (kept in the audit history)"
                : "Note (optional, kept in the audit history)"}
            </Label>
            <Textarea
              id="ff-reason"
              rows={2}
              maxLength={500}
              value={v.reason}
              onChange={(e) => set("reason", e.target.value)}
              disabled={busy}
            />
          </div>

          {shownError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{shownError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Add festival pooja"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- activate / deactivate (needs a reason) ----------------------------------------------
function ActiveDialog({
  festival,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  festival: AdminFestival | null;
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const turningOff = festival?.active;
  return (
    <Dialog open={!!festival} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {turningOff ? "Deactivate" : "Activate"} festival pooja
          </DialogTitle>
          <DialogDescription>
            {festival?.festivalName}: {festival?.poojaName}.{" "}
            {turningOff
              ? "It disappears from the calendar and cannot be booked. Existing bookings are not changed unless you choose so."
              : "It appears on the calendar again and can be booked within its window."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="active-reason">
            Reason (kept in the audit history)
          </Label>
          <Textarea
            id="active-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </div>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || reason.trim().length < 3}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Saving…" : turningOff ? "Deactivate" : "Activate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- bookings of one festival ------------------------------------------------------------
function FestivalBookingsDialog({
  festival,
  onClose,
}: {
  festival: AdminFestival | null;
  onClose: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["admin", "bookings", { festival: festival?.poojaId }],
    queryFn: () =>
      adminApi.bookings({
        page: 1,
        pageSize: 50,
        poojaId: festival!.poojaId,
      }),
    enabled: !!festival,
  });
  return (
    <>
      <Dialog open={!!festival} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bookings</DialogTitle>
            <DialogDescription>
              {festival?.festivalName}: {festival?.poojaName}
              {festival ? ` · ${formatDate(festival.date)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {q.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {q.isError && (
            <p role="alert" className="text-sm text-destructive">
              Could not load the bookings.
            </p>
          )}
          {q.data?.items.length === 0 && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="no-festival-bookings"
            >
              No bookings yet.
            </p>
          )}
          {!!q.data?.items.length && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Devotee</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.items.map((b) => (
                    <TableRow
                      key={b.id}
                      data-testid="festival-booking-row"
                      className="cursor-pointer"
                      onClick={() => setOpenId(b.id)}
                    >
                      <TableCell className="font-mono text-xs">
                        {b.orderNo}
                      </TableCell>
                      <TableCell>{b.devotee}</TableCell>
                      <TableCell className="text-right">
                        {formatINR(b.amount)}
                      </TableCell>
                      <TableCell>
                        <PaymentBadge value={b.paymentStatus} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={b.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {q.data.total > q.data.items.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing {q.data.items.length} of {q.data.total}. Use the
                  Bookings tab to search all of them.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <BookingDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

// ---- audit history -------------------------------------------------------------------------
const FIELD_LABEL: Record<string, string> = {
  festival_name: "Festival",
  pooja_name: "Pooja",
  description: "Description",
  date: "Date",
  start_time: "Start time",
  booking_opens_on: "Booking opens",
  booking_closes_on: "Booking closes",
  max_bookings: "Maximum bookings",
  active: "Active",
};

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "none" : String(v);

function changedFields(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): string[] {
  const out: string[] = [];
  for (const [k, name] of Object.entries(FIELD_LABEL)) {
    const before = a?.[k];
    const after = b?.[k];
    if (a && b && before !== after)
      out.push(`${name}: ${show(before)} → ${show(after)}`);
  }
  return out;
}

type Entry =
  | { kind: "change"; at: string; c: AdminFestivalHistory["changes"][number] }
  | { kind: "price"; at: string; p: AdminFestivalHistory["prices"][number] };

function FestivalHistoryDialog({
  festival,
  onClose,
}: {
  festival: AdminFestival | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["admin", "festival-history", festival?.id],
    queryFn: () => adminApi.festivalHistory(festival!.id),
    enabled: !!festival,
  });
  const entries: Entry[] = q.data
    ? [
        ...q.data.changes.map(
          (c) => ({ kind: "change", at: c.createdAt, c }) as Entry,
        ),
        ...q.data.prices.map(
          (p) => ({ kind: "price", at: p.createdAt, p }) as Entry,
        ),
      ].sort((a, b) => (a.at < b.at ? 1 : -1))
    : [];
  const money = (n: number | null) => (n === null ? "none" : formatINR(n));

  return (
    <Dialog open={!!festival} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change history</DialogTitle>
          <DialogDescription>
            {festival?.festivalName}: {festival?.poojaName}
          </DialogDescription>
        </DialogHeader>
        {q.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {q.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load the history.
          </p>
        )}
        <ol className="space-y-2">
          {entries.map((e) => (
            <li
              key={`${e.kind}-${e.kind === "change" ? e.c.id : e.p.id}`}
              className="rounded-md border p-3 text-sm"
              data-testid="festival-history-item"
            >
              {e.kind === "price" ? (
                <>
                  <p className="font-medium">
                    Price {money(e.p.oldAmount)} → {money(e.p.newAmount)}
                  </p>
                  {e.p.reason && <p className="mt-1">{e.p.reason}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.p.adminEmail ?? "Changed outside the admin page"} ·{" "}
                    {fmtDateTime(e.p.createdAt)}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium capitalize">
                    {e.c.action === "insert" ? "Created" : e.c.action}
                  </p>
                  {changedFields(e.c.oldValues, e.c.newValues).map((l) => (
                    <p key={l} className="mt-0.5">
                      {l}
                    </p>
                  ))}
                  {e.c.reason && <p className="mt-1">{e.c.reason}</p>}
                  {e.c.affectedHandling && (
                    <p className="mt-1 text-xs">
                      Existing bookings ({e.c.affectedBookings?.length ?? 0}):{" "}
                      {e.c.affectedHandling}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.c.adminEmail ?? "Changed outside the admin page"} ·{" "}
                    {fmtDateTime(e.c.createdAt)}
                  </p>
                </>
              )}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

// ---- manager -----------------------------------------------------------------------------------
const affectedFrom = (e: unknown) =>
  e instanceof AdminApiError && e.code === "AFFECTED_BOOKINGS"
    ? {
        count: Number(e.extra.liveBookings ?? 0),
        orders: (e.extra.orders as string[]) ?? [],
      }
    : null;

/**
 * Festival-day pooja offerings. Each has its own fixed price, date, time, booking
 * window and optional capacity; creating one never changes an existing pooja's rate.
 */
export function FestivalManager() {
  const qc = useQueryClient();
  const festivals = useQuery({
    queryKey: ["admin", "festivals"],
    queryFn: adminApi.festivals,
  });
  const poojas = useQuery({
    queryKey: ["admin", "poojas"],
    queryFn: adminApi.poojas,
  });
  const templates = (poojas.data ?? []).filter((p) => p.active);

  const [form, setForm] = useState<
    { mode: "create" } | { mode: "edit"; festival: AdminFestival } | null
  >(null);
  const [toggle, setToggle] = useState<AdminFestival | null>(null);
  const [bookingsOf, setBookingsOf] = useState<AdminFestival | null>(null);
  const [historyOf, setHistoryOf] = useState<AdminFestival | null>(null);
  const [affected, setAffected] = useState<PendingAffected | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false); // synchronous guard: isPending updates a tick late

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "festivals"] });
    qc.invalidateQueries({ queryKey: ["admin", "festival-history"] });
    qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
    qc.invalidateQueries({ queryKey: ["admin", "schedule-audit"] });
  };
  const errText = (e: unknown) =>
    e instanceof AdminApiError ? e.message : "Something went wrong.";

  const create = useMutation({
    mutationFn: adminApi.createFestival,
    onSuccess: () => {
      toast.success("Festival pooja added");
      setForm(null);
      setError(null);
      refresh();
    },
    onSettled: () => {
      inFlight.current = false;
    },
    onError: (e) => setError(errText(e)),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: FestivalPatchBody }) =>
      adminApi.patchFestival(id, body),
    onSuccess: () => {
      toast.success("Festival pooja updated");
      setForm(null);
      setToggle(null);
      setAffected(null);
      setError(null);
      refresh();
    },
    onSettled: () => {
      inFlight.current = false;
    },
    onError: (e, { id, body }) => {
      const a = affectedFrom(e);
      if (a) {
        // Existing bookings are affected: the admin must decide what happens to them.
        const canMove = body.date !== undefined && body.active !== false;
        setAffected({
          ...a,
          allowed: canMove ? ["keep", "cancel", "move"] : ["keep", "cancel"],
          run: (handling, reason) =>
            patchOnce({ id, body: { ...body, handling, reason } }),
        });
      } else {
        setAffected(null);
        setError(errText(e));
      }
    },
  });

  function patchOnce(v: { id: string; body: FestivalPatchBody }) {
    if (inFlight.current) return;
    inFlight.current = true;
    patch.mutate(v);
  }
  function createOnce(b: FestivalCreateBody) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    create.mutate(b);
  }

  const busy = create.isPending || patch.isPending;
  const closeForm = () => {
    setForm(null);
    setError(null);
  };

  return (
    <section aria-labelledby="festival-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="festival-heading" className="text-lg font-semibold">
            Festival poojas
          </h3>
          <p className="text-sm text-muted-foreground">
            One-off offerings for a festival or occasion, each with its own
            fixed amount. They appear on the homepage calendar on their date.
          </p>
        </div>
        <Button
          onClick={() => {
            setError(null);
            setForm({ mode: "create" });
          }}
        >
          Add Festival Pooja
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Festival / pooja</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Bookings</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {festivals.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {festivals.isError && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-destructive"
                  role="alert"
                >
                  Could not load the festival poojas.
                </TableCell>
              </TableRow>
            )}
            {festivals.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                  data-testid="no-festivals"
                >
                  No festival poojas yet.
                </TableCell>
              </TableRow>
            )}
            {festivals.data?.map((f) => (
              <TableRow key={f.id} data-testid="festival-row">
                <TableCell className="whitespace-nowrap">
                  {formatDate(f.date)}
                </TableCell>
                <TableCell>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-rose-700">
                    {f.festivalName}
                  </span>
                  {f.poojaName}
                </TableCell>
                <TableCell>{formatTime(f.startTime) ?? "—"}</TableCell>
                <TableCell className="text-right" data-testid="festival-amount">
                  {f.amount === null ? "—" : formatINR(f.amount)}
                </TableCell>
                <TableCell>
                  {f.liveBookings}
                  {f.maxBookings !== null ? ` / ${f.maxBookings}` : ""}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={f.state === "open" ? "secondary" : "outline"}
                    data-testid="festival-state"
                  >
                    {STATE_LABEL[f.state]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setError(null);
                        setForm({ mode: "edit", festival: f });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBookingsOf(f)}
                    >
                      Bookings
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setHistoryOf(f)}
                    >
                      History
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setError(null);
                        setToggle(f);
                      }}
                    >
                      {f.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {form && (
        <FestivalFormDialog
          key={form.mode === "edit" ? form.festival.id : "create"}
          open
          festival={form.mode === "edit" ? form.festival : null}
          templates={templates}
          busy={busy}
          error={error}
          onCreate={createOnce}
          onEdit={(id, body) => {
            setError(null);
            patchOnce({ id, body });
          }}
          onClose={closeForm}
        />
      )}
      <ActiveDialog
        key={toggle?.id ?? "none"}
        festival={toggle}
        busy={busy}
        error={error}
        onConfirm={(reason) =>
          toggle &&
          patchOnce({
            id: toggle.id,
            body: { active: !toggle.active, reason },
          })
        }
        onClose={() => {
          setToggle(null);
          setError(null);
        }}
      />
      <AffectedBookingsDialog
        open={!!affected}
        count={affected?.count ?? 0}
        orders={affected?.orders ?? []}
        allowed={affected?.allowed ?? ["keep", "cancel"]}
        busy={patch.isPending}
        onConfirm={(handling, reason) => affected?.run(handling, reason)}
        onClose={() => setAffected(null)}
      />
      <FestivalBookingsDialog
        festival={bookingsOf}
        onClose={() => setBookingsOf(null)}
      />
      <FestivalHistoryDialog
        festival={historyOf}
        onClose={() => setHistoryOf(null)}
      />
    </section>
  );
}
