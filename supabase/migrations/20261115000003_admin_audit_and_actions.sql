-- Skandashram: admin booking actions + append-only audit log.
-- Do not apply to production without approval.
--
-- Design: administrators have READ-only access to bookings. Every change goes
-- through public.admin_booking_action(), which (in ONE transaction) checks the
-- caller is an admin, locks the booking row, validates the state transition,
-- applies it, and writes an audit entry attributed to the caller's own Supabase
-- Auth identity. Nobody can write audit rows directly, edit them, or delete them.

-- ---------------------------------------------------------------------------
-- booking_audit_log
-- ---------------------------------------------------------------------------
create table public.booking_audit_log (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete restrict,
  admin_id            uuid not null references auth.users (id),
  admin_email         text,                       -- snapshot at action time
  action              text not null
                        check (action in ('verify_payment', 'reject_payment', 'confirm_booking', 'cancel_booking', 'add_note',
                          'schedule_cancel', 'schedule_move')),
  from_status         text not null,
  to_status           text not null,
  from_payment_status text not null,
  to_payment_status   text not null,
  note                text check (note is null or char_length(note) <= 1000),
  created_at          timestamptz not null default now()
);

create index booking_audit_log_booking_idx
  on public.booking_audit_log (booking_id, created_at desc);

-- Append-only guard shared by every audit table: nobody (including the service
-- role and the table owner) can edit, delete or truncate audit history.
create or replace function public.forbid_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_is_append_only';
end;
$$;

create trigger booking_audit_log_append_only
  before update or delete on public.booking_audit_log
  for each row execute function public.forbid_audit_change();
create trigger booking_audit_log_no_truncate
  before truncate on public.booking_audit_log
  for each statement execute function public.forbid_audit_change();

alter table public.booking_audit_log enable row level security;

create policy "booking_audit_log: admin read"
  on public.booking_audit_log for select
  to authenticated
  using (public.is_admin());

-- No insert/update/delete policies or grants: rows are written only by the
-- SECURITY DEFINER function below, and are immutable afterwards.
revoke all on public.booking_audit_log from anon, authenticated;
grant select on public.booking_audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- admin_booking_action
--
-- Transition rules (authoritative; mirrored in shared/admin.ts for the UI):
--   verify_payment : payment awaiting_verification -> verified   (booking not cancelled)
--   reject_payment : payment awaiting_verification -> rejected   (booking not cancelled; note required)
--   confirm_booking: status pending -> confirmed                 (payment must be verified)
--   cancel_booking : status pending|confirmed -> cancelled       (note required)
--   add_note       : no state change                              (note required)
-- A verified payment can never be re-verified or flipped back; a cancelled
-- booking is terminal.
--
-- SECURITY DEFINER because admins have no direct write access. It is safe
-- because: search_path is pinned, every object is schema-qualified, and the
-- first statement rejects anyone who is not public.is_admin(). The identity
-- recorded is auth.uid(), never a caller-supplied value.
-- ---------------------------------------------------------------------------
create or replace function public.admin_booking_action(
  p_booking_id uuid,
  p_action     text,
  p_note       text default null
)
returns table (new_status text, new_payment_status text, audit_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_status     text;
  v_pay        text;
  v_new_status text;
  v_new_pay    text;
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_audit      uuid;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_action is null or p_action not in
     ('verify_payment', 'reject_payment', 'confirm_booking', 'cancel_booking', 'add_note') then
    raise exception 'invalid_action';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note_too_long';
  end if;

  if p_action in ('reject_payment', 'cancel_booking', 'add_note') and v_note is null then
    raise exception 'note_required';
  end if;

  -- Row lock: concurrent actions on the same booking queue up and then see the
  -- committed state, so a payment can't be verified twice or verify/reject race.
  select b.status, b.payment_status
    into v_status, v_pay
    from public.bookings b
   where b.id = p_booking_id
   for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  v_new_status := v_status;
  v_new_pay    := v_pay;

  if p_action = 'verify_payment' then
    if v_status = 'cancelled' or v_pay <> 'awaiting_verification' then
      raise exception 'invalid_transition';
    end if;
    v_new_pay := 'verified';

  elsif p_action = 'reject_payment' then
    if v_status = 'cancelled' or v_pay <> 'awaiting_verification' then
      raise exception 'invalid_transition';
    end if;
    v_new_pay := 'rejected';

  elsif p_action = 'confirm_booking' then
    if v_status <> 'pending' or v_pay <> 'verified' then
      raise exception 'invalid_transition';
    end if;
    v_new_status := 'confirmed';

  elsif p_action = 'cancel_booking' then
    if v_status not in ('pending', 'confirmed') then
      raise exception 'invalid_transition';
    end if;
    v_new_status := 'cancelled';
  end if;

  if p_action <> 'add_note' then
    -- bookings_stamp_payment_verification stamps verified_by/at from auth.uid().
    update public.bookings
       set status = v_new_status,
           payment_status = v_new_pay
     where id = p_booking_id;
  end if;

  insert into public.booking_audit_log
    (booking_id, admin_id, admin_email, action,
     from_status, to_status, from_payment_status, to_payment_status, note)
  values
    (p_booking_id, v_uid, (select auth.jwt() ->> 'email'), p_action,
     v_status, v_new_status, v_pay, v_new_pay, v_note)
  returning id into v_audit;

  return query select v_new_status, v_new_pay, v_audit;
end;
$$;

revoke all on function public.admin_booking_action(uuid, text, text) from public, anon;
grant execute on function public.admin_booking_action(uuid, text, text) to authenticated;
