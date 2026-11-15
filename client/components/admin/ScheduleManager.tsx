import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AdminScheduleAuditEntry,
  AdminSpecialDate,
  BookingHandling,
} from "@shared/admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminApiError, adminApi } from "@/lib/adminApi";
import { formatDate, formatTime, todayIST } from "@/lib/format";
import { AffectedBookingsDialog } from "./AffectedBookingsDialog";
import { PriceManager } from "./PriceManager";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const selectCls = "h-10 w-full rounded-md border bg-background px-2 text-sm";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
/** "purva_phalguni" -> "Purva Phalguni" */
const label = (id: string) =>
  id
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

type Patch = Parameters<typeof adminApi.patchSpecial>[1];

interface PendingAffected {
  count: number;
  orders: string[];
  allowed: BookingHandling[];
  run: (handling: BookingHandling, reason: string) => void;
}

function SectionTitle({
  id,
  children,
  hint,
}: {
  id: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h3 id={id} className="text-lg font-semibold">
        {children}
      </h3>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

const affectedFrom = (e: unknown) =>
  e instanceof AdminApiError && e.code === "AFFECTED_BOOKINGS"
    ? {
        count: Number(e.extra.liveBookings ?? 0),
        orders: (e.extra.orders as string[]) ?? [],
      }
    : null;

// ---- Special pooja dates (type C) ------------------------------------------------
function SpecialDates() {
  const qc = useQueryClient();
  const special = useQuery({
    queryKey: ["admin", "special"],
    queryFn: adminApi.special,
  });
  const poojas = useQuery({
    queryKey: ["admin", "poojas"],
    queryFn: adminApi.poojas,
  });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminSpecialDate | null>(null);
  const [affected, setAffected] = useState<PendingAffected | null>(null);
  const inFlight = useRef(false); // synchronous guard: isPending updates a tick late

  const specialPoojas = (poojas.data ?? []).filter(
    (p) => p.type === "special" && p.active,
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "special"] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    qc.invalidateQueries({ queryKey: ["admin", "schedule-audit"] });
    qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
  };

  const create = useMutation({
    mutationFn: adminApi.createSpecial,
    onSuccess: () => {
      toast.success("Date added");
      setError(null);
      refresh();
    },
    onError: (e) =>
      setError(
        e instanceof AdminApiError ? e.message : "Something went wrong.",
      ),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Patch }) =>
      adminApi.patchSpecial(id, body),
    onSuccess: () => {
      toast.success("Schedule updated");
      setError(null);
      setEditing(null);
      setAffected(null);
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
            patch.mutate({ id, body: { ...body, handling, reason } }),
        });
      } else {
        setAffected(null);
        setError(
          e instanceof AdminApiError ? e.message : "Something went wrong.",
        );
      }
    },
  });

  /** Starts a change unless one is already running (isPending updates a tick late). */
  const patchOnce = (v: { id: string; body: Patch }) => {
    if (inFlight.current) return;
    inFlight.current = true;
    patch.mutate(v);
  };

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (create.isPending) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const time = String(f.get("time") ?? "");
    create.mutate(
      {
        poojaId: String(f.get("poojaId") ?? ""),
        date: String(f.get("date") ?? ""),
        startTime: time || null,
        notes: String(f.get("notes") ?? "").trim() || null,
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <section aria-labelledby="special-heading">
      <SectionTitle
        id="special-heading"
        hint="Special poojas happen only on the dates listed here. Disabled dates disappear from the public calendar."
      >
        Special pooja dates
      </SectionTitle>

      {error && (
        <Alert variant="destructive" className="mb-3" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={onCreate}
        className="grid items-end gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="Add a special pooja date"
      >
        <div className="lg:col-span-2">
          <Label htmlFor="sp-pooja">Pooja</Label>
          <select
            id="sp-pooja"
            name="poojaId"
            required
            className={selectCls}
            defaultValue=""
          >
            <option value="" disabled>
              {specialPoojas.length
                ? "Select a special pooja"
                : "No special poojas in the catalogue"}
            </option>
            {specialPoojas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="sp-date">Date</Label>
          <Input
            id="sp-date"
            name="date"
            type="date"
            required
            min={todayIST()}
          />
        </div>
        <div>
          <Label htmlFor="sp-time">Start time (optional)</Label>
          <Input id="sp-time" name="time" type="time" />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Label htmlFor="sp-notes">Notes (optional)</Label>
          <Input id="sp-notes" name="notes" maxLength={500} />
        </div>
        <Button
          type="submit"
          disabled={create.isPending || specialPoojas.length === 0}
        >
          {create.isPending ? "Adding…" : "Add date"}
        </Button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Pooja</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Live bookings</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {special.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {special.isError && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-destructive"
                  role="alert"
                >
                  Could not load special pooja dates.
                </TableCell>
              </TableRow>
            )}
            {special.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                  data-testid="no-special"
                >
                  No special pooja dates scheduled yet.
                </TableCell>
              </TableRow>
            )}
            {special.data?.map((d) => (
              <TableRow key={d.id} data-testid="special-row">
                <TableCell className="whitespace-nowrap">
                  {formatDate(d.date)}
                </TableCell>
                <TableCell>{d.poojaName}</TableCell>
                <TableCell>{formatTime(d.startTime) ?? "—"}</TableCell>
                <TableCell className="max-w-[16rem] truncate">
                  {d.notes ?? "—"}
                </TableCell>
                <TableCell>{d.liveBookings}</TableCell>
                <TableCell>
                  <Switch
                    checked={d.active}
                    aria-label={`${d.active ? "Disable" : "Enable"} ${d.poojaName} on ${d.date}`}
                    disabled={patch.isPending}
                    onCheckedChange={(active) =>
                      patch.mutate({ id: d.id, body: { active } })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(d)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EditSpecialDialog
        item={editing}
        error={editing ? error : null}
        busy={patch.isPending}
        onClose={() => {
          setEditing(null);
          setError(null);
        }}
        onSave={(body) => editing && patchOnce({ id: editing.id, body })}
      />

      <AffectedBookingsDialog
        open={!!affected}
        count={affected?.count ?? 0}
        orders={affected?.orders ?? []}
        allowed={affected?.allowed ?? ["keep"]}
        busy={patch.isPending}
        onClose={() => setAffected(null)}
        onConfirm={(h, r) => affected?.run(h, r)}
      />
    </section>
  );
}

function EditSpecialDialog({
  item,
  error,
  busy,
  onClose,
  onSave,
}: {
  item: AdminSpecialDate | null;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Patch) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit special pooja date</DialogTitle>
          <DialogDescription>{item?.poojaName}</DialogDescription>
        </DialogHeader>
        {item && (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const date = String(f.get("date") ?? "");
              const time = String(f.get("time") ?? "");
              const notes = String(f.get("notes") ?? "").trim();
              const body: Patch = {};
              if (date && date !== item.date) body.date = date;
              if ((time || null) !== item.startTime)
                body.startTime = time || null;
              if ((notes || null) !== item.notes) body.notes = notes || null;
              if (Object.keys(body).length === 0) return onClose();
              onSave(body);
            }}
          >
            <div>
              <Label htmlFor="ed-date">Date</Label>
              <Input
                id="ed-date"
                name="date"
                type="date"
                required
                defaultValue={item.date}
                min={todayIST()}
              />
              {item.liveBookings > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.liveBookings} live booking
                  {item.liveBookings === 1 ? "" : "s"} on this date: if you move
                  it, you will be asked what should happen to them.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="ed-time">Start time</Label>
              <Input
                id="ed-time"
                name="time"
                type="time"
                defaultValue={item.startTime ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="ed-notes">Notes</Label>
              <Input
                id="ed-notes"
                name="notes"
                maxLength={500}
                defaultValue={item.notes ?? ""}
              />
            </div>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Recurring daily schedules (A) and Panchangam rules (B) -------------------------
function useRuleToggle(kind: "recurring" | "panchangam", listKey: string) {
  const qc = useQueryClient();
  const [affected, setAffected] = useState<PendingAffected | null>(null);
  const call = (
    id: string,
    active: boolean,
    extra?: { handling?: "keep"; reason?: string },
  ) =>
    kind === "recurring"
      ? adminApi.setRecurringActive(id, active, extra)
      : adminApi.setPanchangamRuleActive(id, active, extra);

  const m = useMutation({
    mutationFn: (v: {
      id: string;
      active: boolean;
      extra?: { handling?: "keep"; reason?: string };
    }) => call(v.id, v.active, v.extra),
    onSuccess: () => {
      toast.success("Schedule updated");
      setAffected(null);
      qc.invalidateQueries({ queryKey: ["admin", listKey] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "schedule-audit"] });
    },
    onError: (e, v) => {
      const a = affectedFrom(e);
      if (a) {
        // A rule change never touches bookings; the admin acknowledges them explicitly.
        setAffected({
          ...a,
          allowed: ["keep"],
          run: (_h, reason) =>
            m.mutate({ ...v, extra: { handling: "keep", reason } }),
        });
      } else {
        toast.error(
          e instanceof AdminApiError ? e.message : "Something went wrong.",
        );
      }
    },
  });

  const dialog = (
    <AffectedBookingsDialog
      open={!!affected}
      count={affected?.count ?? 0}
      orders={affected?.orders ?? []}
      allowed={affected?.allowed ?? ["keep"]}
      busy={m.isPending}
      onClose={() => setAffected(null)}
      onConfirm={(h, r) => affected?.run(h, r)}
    />
  );
  return {
    toggle: (id: string, active: boolean) => m.mutate({ id, active }),
    pending: m.isPending,
    dialog,
  };
}

function RecurringRules() {
  const rules = useQuery({
    queryKey: ["admin", "recurring"],
    queryFn: adminApi.recurring,
  });
  const { toggle, pending, dialog } = useRuleToggle("recurring", "recurring");
  return (
    <section aria-labelledby="recurring-heading">
      <SectionTitle
        id="recurring-heading"
        hint="Daily poojas follow these fixed recurring schedules. Disable a rule to hide it from the calendar."
      >
        Daily recurring schedules
      </SectionTitle>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pooja</TableHead>
              <TableHead>Repeats</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {rules.isError && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-destructive"
                  role="alert"
                >
                  Could not load recurring schedules.
                </TableCell>
              </TableRow>
            )}
            {rules.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                  data-testid="no-recurring"
                >
                  No recurring schedules have been set up yet.
                </TableCell>
              </TableRow>
            )}
            {rules.data?.map((r) => (
              <TableRow key={r.id} data-testid="recurring-row">
                <TableCell>{r.poojaName}</TableCell>
                <TableCell>
                  {r.recurrence === "daily"
                    ? "Every day"
                    : `Every ${WEEKDAYS[r.weekday ?? 0]}`}
                </TableCell>
                <TableCell>{formatTime(r.startTime) ?? "—"}</TableCell>
                <TableCell>
                  <Switch
                    checked={r.active}
                    aria-label={`${r.active ? "Disable" : "Enable"} ${r.poojaName} schedule`}
                    disabled={pending}
                    onCheckedChange={(active) => toggle(r.id, active)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {dialog}
    </section>
  );
}

function describeRule(r: {
  tithis: string[];
  paksha: string | null;
  nakshatras: string[];
}) {
  const parts: string[] = [];
  if (r.tithis.length) parts.push(`Tithi: ${r.tithis.map(label).join(", ")}`);
  if (r.paksha) parts.push(`${label(r.paksha)} paksha`);
  if (r.nakshatras.length)
    parts.push(`Nakshatra: ${r.nakshatras.map(label).join(", ")}`);
  return parts.join(" · ");
}

function PanchangamRules() {
  const rules = useQuery({
    queryKey: ["admin", "panchangam-rules"],
    queryFn: adminApi.panchangamRules,
  });
  const { toggle, pending, dialog } = useRuleToggle(
    "panchangam",
    "panchangam-rules",
  );
  return (
    <section aria-labelledby="panchangam-heading">
      <SectionTitle
        id="panchangam-heading"
        hint="These poojas fall on days chosen by the Panchangam (tithi, paksha, nakshatra). The calendar and booking both use these rules. If a day's Panchangam is missing or unclear, the pooja is not offered that day."
      >
        Panchangam-based poojas
      </SectionTitle>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pooja</TableHead>
              <TableHead>Occurs when</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {rules.isError && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-destructive"
                  role="alert"
                >
                  Could not load Panchangam rules.
                </TableCell>
              </TableRow>
            )}
            {rules.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                  data-testid="no-panchangam"
                >
                  No Panchangam-based poojas have been set up yet.
                </TableCell>
              </TableRow>
            )}
            {rules.data?.map((r) => (
              <TableRow key={r.id} data-testid="panchangam-row">
                <TableCell>{r.poojaName}</TableCell>
                <TableCell className="text-sm">{describeRule(r)}</TableCell>
                <TableCell>{formatTime(r.startTime) ?? "—"}</TableCell>
                <TableCell>
                  <Switch
                    checked={r.active}
                    aria-label={`${r.active ? "Disable" : "Enable"} ${r.poojaName} rule`}
                    disabled={pending}
                    onCheckedChange={(active) => toggle(r.id, active)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {dialog}
    </section>
  );
}

// ---- Schedule change history ------------------------------------------------------------
const TABLE_LABEL = {
  special_pooja_schedule: "Special date",
  recurring_pooja_schedule: "Daily schedule",
  panchangam_pooja_rules: "Panchangam rule",
} as const;
const SKIP = new Set(["id", "pooja_id", "created_at", "updated_at"]);

export function summarizeChange(e: AdminScheduleAuditEntry): string {
  const show = (v: unknown) =>
    v === null || v === undefined
      ? "—"
      : Array.isArray(v)
        ? v.join(", ")
        : String(v);
  if (e.action === "insert") {
    const n = e.newValues ?? {};
    return Object.entries(n)
      .filter(([k, v]) => !SKIP.has(k) && v !== null && k !== "active")
      .map(([k, v]) => `${k}: ${show(v)}`)
      .join(" · ");
  }
  const o = e.oldValues ?? {};
  const n = e.newValues ?? {};
  return Object.keys({ ...o, ...n })
    .filter(
      (k) => !SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]),
    )
    .map((k) => `${k}: ${show(o[k])} → ${show(n[k])}`)
    .join(" · ");
}

function ScheduleHistory() {
  const q = useQuery({
    queryKey: ["admin", "schedule-audit"],
    queryFn: () => adminApi.scheduleAudit(30),
  });
  return (
    <section aria-labelledby="history-heading">
      <SectionTitle
        id="history-heading"
        hint="Every schedule change, with who made it and what it replaced."
      >
        Recent schedule changes
      </SectionTitle>
      {q.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load the history.
        </p>
      )}
      {q.data?.length === 0 && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="no-schedule-history"
        >
          No schedule changes yet.
        </p>
      )}
      <ol className="space-y-2">
        {q.data?.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border bg-card p-3 text-sm"
            data-testid="schedule-history-item"
          >
            <p className="font-medium">
              {TABLE_LABEL[e.table]} · {e.poojaName ?? "—"} ·{" "}
              <span className="capitalize">{e.action}</span>
            </p>
            <p className="mt-1 break-words text-muted-foreground">
              {summarizeChange(e)}
            </p>
            {e.reason && <p className="mt-1">Reason: {e.reason}</p>}
            {e.affectedHandling && (
              <p className="mt-1 text-xs">
                {e.affectedBookings?.length ?? 0} booking
                {(e.affectedBookings?.length ?? 0) === 1 ? "" : "s"} affected —
                handled as: <strong>{e.affectedHandling}</strong>
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {e.adminEmail ?? "System (outside the admin page)"} ·{" "}
              {fmtDateTime(e.createdAt)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ScheduleManager() {
  return (
    <div className="grid gap-10">
      <PriceManager />
      <SpecialDates />
      <PanchangamRules />
      <RecurringRules />
      <ScheduleHistory />
    </div>
  );
}
