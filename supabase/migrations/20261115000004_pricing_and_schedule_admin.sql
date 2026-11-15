-- Skandashram: administrator-only price management and schedule changes, with
-- append-only audit trails and explicit handling of affected bookings.
-- Do not apply to production without approval.
--
-- Every function below is SECURITY DEFINER (administrators have no direct write
-- access to these tables). Safety properties shared by all of them:
--   * search_path is pinned and every object is schema-qualified;
--   * the first thing each does is reject anyone who is not public.is_admin();
--   * the acting identity is auth.uid() from the verified session, never a
--     caller-supplied value;
--   * audit rows are written by triggers on the tables themselves, so changes
--     made any other way (e.g. the SQL editor) are recorded too (as "system").

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public._require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return v_uid;
end;
$$;

-- Transaction-local context that the audit triggers read.
create or replace function public._set_audit_context(
  p_reason text, p_handling text, p_orders jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.change_reason',     coalesce(p_reason, ''), true);
  perform set_config('app.affected_handling', coalesce(p_handling, ''), true);
  perform set_config('app.affected_bookings', coalesce(p_orders::text, ''), true);
end;
$$;

revoke all on function public._require_admin() from public, anon, authenticated;
revoke all on function public._set_audit_context(text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Price audit trail (append-only)
-- ---------------------------------------------------------------------------
create table public.pooja_price_audit_log (
  id          uuid primary key default gen_random_uuid(),
  pooja_id    uuid not null references public.poojas (id) on delete restrict,
  pooja_name  text not null,
  admin_id    uuid references auth.users (id),   -- NULL = changed outside the API (system / SQL operator)
  admin_email text,
  old_amount  numeric(10, 2),
  new_amount  numeric(10, 2),
  reason      text check (reason is null or char_length(reason) <= 500),
  created_at  timestamptz not null default now()
);

create index pooja_price_audit_log_pooja_idx
  on public.pooja_price_audit_log (pooja_id, created_at desc);

create trigger pooja_price_audit_log_append_only
  before update or delete on public.pooja_price_audit_log
  for each row execute function public.forbid_audit_change();
create trigger pooja_price_audit_log_no_truncate
  before truncate on public.pooja_price_audit_log
  for each statement execute function public.forbid_audit_change();

alter table public.pooja_price_audit_log enable row level security;

create policy "pooja_price_audit_log: admin read"
  on public.pooja_price_audit_log for select
  to authenticated
  using (public.is_admin());

revoke all on public.pooja_price_audit_log from anon, authenticated;
grant select on public.pooja_price_audit_log to authenticated;

create or replace function public.log_pooja_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.amount_inr is null then
      return new;
    end if;
  elsif new.amount_inr is not distinct from old.amount_inr then
    return new;
  end if;

  insert into public.pooja_price_audit_log
    (pooja_id, pooja_name, admin_id, admin_email, old_amount, new_amount, reason)
  values
    (new.id, new.name, (select auth.uid()), (select auth.jwt() ->> 'email'),
     case when tg_op = 'UPDATE' then old.amount_inr end,
     new.amount_inr,
     nullif(current_setting('app.change_reason', true), ''));
  return new;
end;
$$;

create trigger poojas_price_audit
  after insert or update of amount_inr on public.poojas
  for each row execute function public.log_pooja_price_change();

-- ---------------------------------------------------------------------------
-- Schedule audit trail (append-only): who, when, old values, new values, and how
-- affected bookings were handled.
-- ---------------------------------------------------------------------------
create table public.schedule_audit_log (
  id                uuid primary key default gen_random_uuid(),
  schedule_table    text not null
                      check (schedule_table in ('special_pooja_schedule', 'recurring_pooja_schedule', 'panchangam_pooja_rules')),
  record_id         uuid not null,
  pooja_id          uuid not null references public.poojas (id) on delete restrict,
  pooja_name        text,
  action            text not null check (action in ('insert', 'update', 'delete')),
  admin_id          uuid references auth.users (id),   -- NULL = system / SQL operator
  admin_email       text,
  old_values        jsonb,
  new_values        jsonb,
  reason            text check (reason is null or char_length(reason) <= 500),
  affected_handling text check (affected_handling is null or affected_handling in ('keep', 'cancel', 'move')),
  affected_bookings jsonb,                              -- order numbers affected at the time
  created_at        timestamptz not null default now()
);

create index schedule_audit_log_pooja_idx on public.schedule_audit_log (pooja_id, created_at desc);
create index schedule_audit_log_created_idx on public.schedule_audit_log (created_at desc);

create trigger schedule_audit_log_append_only
  before update or delete on public.schedule_audit_log
  for each row execute function public.forbid_audit_change();
create trigger schedule_audit_log_no_truncate
  before truncate on public.schedule_audit_log
  for each statement execute function public.forbid_audit_change();

alter table public.schedule_audit_log enable row level security;

create policy "schedule_audit_log: admin read"
  on public.schedule_audit_log for select
  to authenticated
  using (public.is_admin());

revoke all on public.schedule_audit_log from anon, authenticated;
grant select on public.schedule_audit_log to authenticated;

create or replace function public.log_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'updated_at' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'updated_at' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_pooja uuid := (v_row ->> 'pooja_id')::uuid;
  v_orders text := nullif(current_setting('app.affected_bookings', true), '');
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new; -- nothing but updated_at changed
  end if;

  insert into public.schedule_audit_log
    (schedule_table, record_id, pooja_id, pooja_name, action, admin_id, admin_email,
     old_values, new_values, reason, affected_handling, affected_bookings)
  values
    (tg_table_name, (v_row ->> 'id')::uuid, v_pooja,
     (select p.name from public.poojas p where p.id = v_pooja),
     lower(tg_op), (select auth.uid()), (select auth.jwt() ->> 'email'),
     v_old, v_new,
     nullif(current_setting('app.change_reason', true), ''),
     nullif(current_setting('app.affected_handling', true), ''),
     case when v_orders is null then null else v_orders::jsonb end);

  return coalesce(new, old);
end;
$$;

create trigger special_pooja_schedule_audit
  after insert or update or delete on public.special_pooja_schedule
  for each row execute function public.log_schedule_change();
create trigger recurring_pooja_schedule_audit
  after insert or update or delete on public.recurring_pooja_schedule
  for each row execute function public.log_schedule_change();
create trigger panchangam_pooja_rules_audit
  after insert or update or delete on public.panchangam_pooja_rules
  for each row execute function public.log_schedule_change();

-- ---------------------------------------------------------------------------
-- admin_set_pooja_price: the ONLY way an administrator changes a price.
-- One fixed INR amount per pooja (max 2 decimals, > 0). NULL withdraws the price
-- (the pooja immediately stops being bookable). A written reason is required.
-- Existing bookings keep the amount they were made at (bookings.amount_inr is a
-- snapshot protected by a trigger).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_pooja_price(
  p_pooja_id uuid,
  p_amount   numeric,
  p_reason   text
)
returns table (old_amount numeric, new_amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    numeric;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public._require_admin();

  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'reason_required';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;
  if p_amount is not null
     and (p_amount <= 0 or p_amount > 1000000 or scale(p_amount) > 2) then
    raise exception 'invalid_amount';
  end if;

  select p.amount_inr into v_old
    from public.poojas p
   where p.id = p_pooja_id
   for update;
  if not found then
    raise exception 'pooja_not_found';
  end if;
  if v_old is not distinct from p_amount then
    raise exception 'no_change';
  end if;

  perform public._set_audit_context(v_reason, null, null);
  update public.poojas set amount_inr = p_amount where id = p_pooja_id;

  return query select v_old, p_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_special_schedule_create
-- ---------------------------------------------------------------------------
create or replace function public.admin_special_schedule_create(
  p_pooja_id   uuid,
  p_date       date,
  p_start_time time default null,
  p_notes      text default null,
  p_reason     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_id   uuid;
begin
  perform public._require_admin();

  select p.type into v_type from public.poojas p where p.id = p_pooja_id;
  if not found then
    raise exception 'pooja_not_found';
  end if;
  if v_type <> 'special' then
    raise exception 'not_a_special_pooja';
  end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'date_in_past';
  end if;

  perform public._set_audit_context(nullif(btrim(coalesce(p_reason, '')), ''), null, null);
  insert into public.special_pooja_schedule (pooja_id, date, start_time, notes)
  values (p_pooja_id, p_date, p_start_time, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_special_schedule_update
--
-- p_patch may contain: date, start_time, notes, active.
-- Moving a date or disabling it never silently touches bookings. If live
-- (non-cancelled) bookings exist on the date, the caller MUST choose how to handle
-- them in p_handling, with a written reason:
--   keep   leave them as they are (the admin acknowledges and will contact devotees)
--   cancel cancel them (each one gets an audit entry)
--   move   move them to the new date (only when the date changes; each audited)
-- Without a choice the call fails with affected_bookings_unresolved (the
-- exception detail carries the count and order numbers).
-- ---------------------------------------------------------------------------
create or replace function public.admin_special_schedule_update(
  p_id       uuid,
  p_patch    jsonb,
  p_handling text default null,
  p_reason   text default null
)
returns table (affected_count integer, cancelled_count integer, moved_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := public._require_admin();
  v_email     text := (select auth.jwt() ->> 'email');
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  s           public.special_pooja_schedule%rowtype;
  v_date      date;
  v_time      time;
  v_notes     text;
  v_active    boolean;
  v_changes_date boolean;
  v_disables  boolean;
  v_orders    jsonb := '[]'::jsonb;
  v_count     integer := 0;
  v_cancelled integer := 0;
  v_moved     integer := 0;
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  r           record;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_patch) k
                where k not in ('date', 'start_time', 'notes', 'active')) then
    raise exception 'invalid_patch';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;

  select * into s from public.special_pooja_schedule where id = p_id for update;
  if not found then
    raise exception 'schedule_not_found';
  end if;

  v_date   := case when p_patch ? 'date' then (p_patch ->> 'date')::date else s.date end;
  v_time   := case when p_patch ? 'start_time' then (p_patch ->> 'start_time')::time else s.start_time end;
  v_notes  := case when p_patch ? 'notes' then nullif(btrim(p_patch ->> 'notes'), '') else s.notes end;
  v_active := case when p_patch ? 'active' then (p_patch ->> 'active')::boolean else s.active end;
  if v_date is null or v_active is null then
    raise exception 'invalid_patch';
  end if;

  v_changes_date := v_date <> s.date;
  v_disables     := s.active and not v_active;

  if v_changes_date and v_date < v_today then
    raise exception 'date_in_past';
  end if;
  if (v_changes_date or v_disables) and s.date < v_today then
    raise exception 'schedule_in_past';
  end if;

  if v_changes_date or v_disables then
    select count(*), coalesce(jsonb_agg(b.order_no order by b.order_no), '[]'::jsonb)
      into v_count, v_orders
      from public.bookings b
     where b.pooja_id = s.pooja_id
       and b.booking_date = s.date
       and b.status <> 'cancelled';

    if v_count > 0 then
      if p_handling is null then
        raise exception 'affected_bookings_unresolved'
          using detail = jsonb_build_object('count', v_count, 'orders', v_orders)::text;
      end if;
      if p_handling not in ('keep', 'cancel', 'move')
         or (p_handling = 'move' and (not v_changes_date or not v_active)) then
        raise exception 'invalid_handling';
      end if;
      if v_reason is null or char_length(v_reason) < 3 then
        raise exception 'reason_required';
      end if;

      if p_handling = 'cancel' then
        for r in
          select b.id, b.status as st, b.payment_status as ps
            from public.bookings b
           where b.pooja_id = s.pooja_id and b.booking_date = s.date and b.status <> 'cancelled'
           for update
        loop
          update public.bookings set status = 'cancelled' where id = r.id;
          insert into public.booking_audit_log
            (booking_id, admin_id, admin_email, action, from_status, to_status,
             from_payment_status, to_payment_status, note)
          values
            (r.id, v_uid, v_email, 'schedule_cancel', r.st, 'cancelled', r.ps, r.ps,
             'Schedule change: ' || v_reason);
          v_cancelled := v_cancelled + 1;
        end loop;

      elsif p_handling = 'move' then
        for r in
          select b.id, b.status as st, b.payment_status as ps
            from public.bookings b
           where b.pooja_id = s.pooja_id and b.booking_date = s.date and b.status <> 'cancelled'
           for update
        loop
          update public.bookings set booking_date = v_date where id = r.id;
          insert into public.booking_audit_log
            (booking_id, admin_id, admin_email, action, from_status, to_status,
             from_payment_status, to_payment_status, note)
          values
            (r.id, v_uid, v_email, 'schedule_move', r.st, r.st, r.ps, r.ps,
             'Moved from ' || s.date::text || ' to ' || v_date::text || ': ' || v_reason);
          v_moved := v_moved + 1;
        end loop;
      end if;
    end if;
  end if;

  perform public._set_audit_context(
    v_reason,
    case when v_count > 0 then p_handling end,
    case when v_count > 0 then v_orders end
  );
  update public.special_pooja_schedule
     set date = v_date, start_time = v_time, notes = v_notes, active = v_active
   where id = p_id;

  return query select v_count, v_cancelled, v_moved;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_schedule_rule_set_active: enable/disable a recurring (daily/weekly)
-- schedule or a Panchangam rule. Disabling is refused while the pooja has live
-- future bookings unless the caller explicitly acknowledges them with
-- p_handling = 'keep' (bookings are never cancelled or moved by a rule change;
-- handle individual bookings through the booking actions).
-- ---------------------------------------------------------------------------
create or replace function public.admin_schedule_rule_set_active(
  p_kind     text,
  p_id       uuid,
  p_active   boolean,
  p_handling text default null,
  p_reason   text default null
)
returns table (affected_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_pooja  uuid;
  v_was    boolean;
  v_count  integer := 0;
  v_orders jsonb := '[]'::jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public._require_admin();
  if p_active is null then
    raise exception 'invalid_patch';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;

  if p_kind = 'recurring' then
    select t.pooja_id, t.active into v_pooja, v_was
      from public.recurring_pooja_schedule t where t.id = p_id for update;
  elsif p_kind = 'panchangam' then
    select t.pooja_id, t.active into v_pooja, v_was
      from public.panchangam_pooja_rules t where t.id = p_id for update;
  else
    raise exception 'invalid_kind';
  end if;
  if not found then
    raise exception 'schedule_not_found';
  end if;
  if v_was = p_active then
    raise exception 'no_change';
  end if;

  if v_was and not p_active then
    select count(*), coalesce(jsonb_agg(b.order_no order by b.order_no), '[]'::jsonb)
      into v_count, v_orders
      from public.bookings b
     where b.pooja_id = v_pooja
       and b.booking_date >= v_today
       and b.status <> 'cancelled';

    if v_count > 0 then
      if p_handling is null then
        raise exception 'affected_bookings_unresolved'
          using detail = jsonb_build_object('count', v_count, 'orders', v_orders)::text;
      end if;
      if p_handling <> 'keep' then
        raise exception 'invalid_handling';
      end if;
      if v_reason is null or char_length(v_reason) < 3 then
        raise exception 'reason_required';
      end if;
    end if;
  end if;

  perform public._set_audit_context(
    v_reason,
    case when v_count > 0 then p_handling end,
    case when v_count > 0 then v_orders end
  );
  if p_kind = 'recurring' then
    update public.recurring_pooja_schedule set active = p_active where id = p_id;
  else
    update public.panchangam_pooja_rules set active = p_active where id = p_id;
  end if;

  return query select v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
revoke all on function public.admin_set_pooja_price(uuid, numeric, text) from public, anon;
revoke all on function public.admin_special_schedule_create(uuid, date, time, text, text) from public, anon;
revoke all on function public.admin_special_schedule_update(uuid, jsonb, text, text) from public, anon;
revoke all on function public.admin_schedule_rule_set_active(text, uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_set_pooja_price(uuid, numeric, text) to authenticated;
grant execute on function public.admin_special_schedule_create(uuid, date, time, text, text) to authenticated;
grant execute on function public.admin_special_schedule_update(uuid, jsonb, text, text) to authenticated;
grant execute on function public.admin_schedule_rule_set_active(text, uuid, boolean, text, text) to authenticated;
