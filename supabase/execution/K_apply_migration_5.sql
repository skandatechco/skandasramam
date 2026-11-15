-- ============================================================================
-- STEP K: apply migration 5 (festival_offerings)
-- Paste and run once. It is one transaction: if any statement fails NOTHING from this file is kept.
-- Expect: Success. On any error: STOP and send me the exact message.
-- ============================================================================
begin;

-- Skandashram: festival-day pooja offerings.
-- Do not apply to production without approval.
--
-- A festival offering is a SEPARATE catalogue entry with its own fixed price. It is
-- never a price bump on an existing pooja: creating one (even from a template)
-- leaves the template pooja's standard rate untouched.
--
-- Model
--   public.poojas (type = 'festival')  the offering's catalogue row: slug, name, and
--                                      the ONE fixed amount (so the existing price audit,
--                                      booking snapshot and booking flow all apply as-is).
--   public.festival_offerings          festival name, description, date, start time,
--                                      booking window, capacity and active flag.
--
-- Write model (same as migrations 1-4): nobody writes these tables through the API
-- roles. Administrators use the SECURITY DEFINER functions below, which check
-- public.is_admin(), take the identity from auth.uid() and are audited by triggers.

-- ---------------------------------------------------------------------------
-- Catalogue: allow the 'festival' type. Festival slugs are always 'festival-...'
-- and no other pooja may use that prefix, so a slug alone says where to link.
-- ---------------------------------------------------------------------------
alter table public.poojas drop constraint poojas_type_check;
alter table public.poojas
  add constraint poojas_type_check
  check (type in ('daily', 'panchangam', 'special', 'festival'));
alter table public.poojas
  add constraint poojas_festival_slug_check
  check ((type = 'festival') = (slug like 'festival-%'));

alter table public.schedule_audit_log drop constraint schedule_audit_log_schedule_table_check;
alter table public.schedule_audit_log
  add constraint schedule_audit_log_schedule_table_check
  check (schedule_table in (
    'special_pooja_schedule', 'recurring_pooja_schedule', 'panchangam_pooja_rules', 'festival_offerings'
  ));

-- ---------------------------------------------------------------------------
-- festival_offerings
-- ---------------------------------------------------------------------------
create table public.festival_offerings (
  id                 uuid primary key default gen_random_uuid(),
  pooja_id           uuid not null unique references public.poojas (id) on delete restrict,
  template_pooja_id  uuid references public.poojas (id) on delete set null,
  festival_name      text not null check (char_length(festival_name) between 1 and 120),
  pooja_name         text not null check (char_length(pooja_name) between 1 and 200),
  description        text check (description is null or char_length(description) <= 2000),
  date               date not null,
  start_time         time,
  booking_opens_on   date,   -- NULL = open as soon as the offering is active
  booking_closes_on  date,   -- NULL = open until the festival date (inclusive)
  max_bookings       integer check (max_bookings is null or max_bookings between 1 and 100000),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint festival_window_order check (
    booking_opens_on is null or booking_closes_on is null or booking_opens_on <= booking_closes_on
  ),
  constraint festival_opens_by_date check (booking_opens_on is null or booking_opens_on <= date),
  constraint festival_closes_by_date check (booking_closes_on is null or booking_closes_on <= date)
);

create index festival_offerings_date_idx on public.festival_offerings (date);

create trigger festival_offerings_set_updated_at
  before update on public.festival_offerings
  for each row execute function public.set_updated_at();

-- The catalogue row mirrors the offering's pooja name and description (single input,
-- one audited place to change them).
create or replace function public.sync_festival_to_pooja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.poojas p
     set name = new.pooja_name, description = new.description
   where p.id = new.pooja_id
     and (p.name is distinct from new.pooja_name
          or p.description is distinct from new.description);
  return new;
end;
$$;

create trigger festival_offerings_sync_pooja
  after insert or update on public.festival_offerings
  for each row execute function public.sync_festival_to_pooja();

create trigger festival_offerings_audit
  after insert or update or delete on public.festival_offerings
  for each row execute function public.log_schedule_change();

alter table public.festival_offerings enable row level security;

create policy "festival_offerings: public read active"
  on public.festival_offerings for select
  to anon, authenticated
  using (active);

create policy "festival_offerings: admin read all"
  on public.festival_offerings for select
  to authenticated
  using (public.is_admin());

revoke all on public.festival_offerings from anon, authenticated;
grant select on public.festival_offerings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Booking guard (defence in depth, and the only race-free capacity check).
-- The API validates first; this trigger makes the rules hold for every writer.
-- The festival row is locked, so two concurrent bookings cannot both take the
-- last place. Cancelled bookings do not count.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_festival_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f      public.festival_offerings%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_live integer;
begin
  select * into f from public.festival_offerings where pooja_id = new.pooja_id for update;
  if not found then
    return new;                      -- not a festival offering
  end if;
  if not f.active then
    raise exception 'festival_not_open';
  end if;
  if new.booking_date <> f.date then
    raise exception 'festival_wrong_date';
  end if;
  if f.booking_opens_on is not null and v_today < f.booking_opens_on then
    raise exception 'festival_not_open';
  end if;
  if v_today > coalesce(f.booking_closes_on, f.date) then
    raise exception 'festival_closed';
  end if;
  if f.max_bookings is not null then
    select count(*) into v_live
      from public.bookings b
     where b.pooja_id = new.pooja_id and b.status <> 'cancelled';
    if v_live >= f.max_bookings then
      raise exception 'festival_full';
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_enforce_festival
  before insert on public.bookings
  for each row execute function public.enforce_festival_booking();

-- ---------------------------------------------------------------------------
-- admin_festival_create
--   p_template_pooja_id  optional existing pooja the admin started from. Only its id
--                        is remembered; its name/description may pre-fill the form in
--                        the UI, and its price is NEVER copied or changed.
--   p_amount             the offering's own fixed INR amount (required).
-- ---------------------------------------------------------------------------
create or replace function public.admin_festival_create(
  p_festival_name     text,
  p_pooja_name        text,
  p_description       text,
  p_date              date,
  p_start_time        time,
  p_amount            numeric,
  p_opens_on          date,
  p_closes_on         date,
  p_max_bookings      integer,
  p_active            boolean,
  p_template_pooja_id uuid default null,
  p_reason            text default null
)
returns table (o_festival_id uuid, o_pooja_id uuid, o_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today    date := (now() at time zone 'Asia/Kolkata')::date;
  v_festival text := btrim(coalesce(p_festival_name, ''));
  v_pooja    text := btrim(coalesce(p_pooja_name, ''));
  v_desc     text := nullif(btrim(coalesce(p_description, '')), '');
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_tslug    text;
  v_base     text;
  v_slug     text;
  v_n        integer := 1;
  v_pid      uuid;
  v_fid      uuid;
begin
  perform public._require_admin();

  if char_length(v_festival) not between 1 and 120
     or char_length(v_pooja) not between 1 and 200
     or char_length(coalesce(v_desc, '')) > 2000 then
    raise exception 'invalid_festival';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 or scale(p_amount) > 2 then
    raise exception 'invalid_amount';
  end if;
  if p_date is null or p_date < v_today then
    raise exception 'date_in_past';
  end if;
  if (p_opens_on is not null and p_opens_on > p_date)
     or (p_closes_on is not null and p_closes_on > p_date)
     or (p_opens_on is not null and p_closes_on is not null and p_opens_on > p_closes_on) then
    raise exception 'invalid_window';
  end if;
  if p_max_bookings is not null and p_max_bookings < 1 then
    raise exception 'invalid_capacity';
  end if;

  if p_template_pooja_id is not null then
    select p.slug into v_tslug from public.poojas p where p.id = p_template_pooja_id;
    if not found then
      raise exception 'pooja_not_found';
    end if;
    if v_tslug in ('annadanam', 'daily-annadhanam') then
      raise exception 'template_not_allowed';   -- donations are not poojas
    end if;
  end if;

  if exists (
    select 1 from public.festival_offerings f
     where f.date = p_date
       and lower(f.festival_name) = lower(v_festival)
       and lower(f.pooja_name) = lower(v_pooja)
  ) then
    raise exception 'duplicate_festival';
  end if;

  v_base := regexp_replace(lower(v_festival || ' ' || v_pooja), '[^a-z0-9]+', '-', 'g');
  v_base := btrim(left(btrim(v_base, '-'), 70), '-');
  if v_base = '' then
    v_base := 'offering';
  end if;
  v_slug := 'festival-' || v_base || '-' || to_char(p_date, 'YYYYMMDD');
  while exists (select 1 from public.poojas p where p.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := 'festival-' || v_base || '-' || to_char(p_date, 'YYYYMMDD') || '-' || v_n;
  end loop;

  perform public._set_audit_context(coalesce(v_reason, 'Festival offering created'), null, null);

  insert into public.poojas (slug, name, type, description, amount_inr, active)
  values (v_slug, v_pooja, 'festival', v_desc, p_amount, true)
  returning id into v_pid;

  insert into public.festival_offerings
    (pooja_id, template_pooja_id, festival_name, pooja_name, description, date, start_time,
     booking_opens_on, booking_closes_on, max_bookings, active)
  values
    (v_pid, p_template_pooja_id, v_festival, v_pooja, v_desc, p_date, p_start_time,
     p_opens_on, p_closes_on, p_max_bookings, coalesce(p_active, true))
  returning id into v_fid;

  return query select v_fid, v_pid, v_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_festival_update
--
-- p_patch may contain: festival_name, pooja_name, description, date, start_time,
-- booking_opens_on, booking_closes_on, max_bookings, active, amount.
-- A written reason is always required. Existing bookings keep the amount they were
-- made at (bookings.amount_inr is immutable). Moving the date or deactivating the
-- offering never silently touches bookings: with live bookings the caller MUST
-- choose keep / cancel / move (move only when the date changes and the offering
-- stays active). Without a choice: affected_bookings_unresolved.
-- ---------------------------------------------------------------------------
create or replace function public.admin_festival_update(
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
  v_uid      uuid := public._require_admin();
  v_email    text := (select auth.jwt() ->> 'email');
  v_today    date := (now() at time zone 'Asia/Kolkata')::date;
  f          public.festival_offerings%rowtype;
  v_old_amt  numeric;
  v_festival text;
  v_pooja    text;
  v_desc     text;
  v_date     date;
  v_time     time;
  v_opens    date;
  v_closes   date;
  v_max      integer;
  v_active   boolean;
  v_amount   numeric;
  v_changes_date boolean;
  v_disables boolean;
  v_other_change boolean;
  v_orders   jsonb := '[]'::jsonb;
  v_count    integer := 0;
  v_cancelled integer := 0;
  v_moved    integer := 0;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  r          record;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_patch) k
                where k not in ('festival_name', 'pooja_name', 'description', 'date', 'start_time',
                                'booking_opens_on', 'booking_closes_on', 'max_bookings',
                                'active', 'amount')) then
    raise exception 'invalid_patch';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'reason_required';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;

  select * into f from public.festival_offerings where id = p_id for update;
  if not found then
    raise exception 'schedule_not_found';
  end if;
  select p.amount_inr into v_old_amt from public.poojas p where p.id = f.pooja_id for update;

  v_festival := case when p_patch ? 'festival_name' then btrim(coalesce(p_patch ->> 'festival_name', '')) else f.festival_name end;
  v_pooja    := case when p_patch ? 'pooja_name'    then btrim(coalesce(p_patch ->> 'pooja_name', ''))    else f.pooja_name end;
  v_desc     := case when p_patch ? 'description'   then nullif(btrim(coalesce(p_patch ->> 'description', '')), '') else f.description end;
  v_date     := case when p_patch ? 'date'          then (p_patch ->> 'date')::date else f.date end;
  v_time     := case when p_patch ? 'start_time'    then (p_patch ->> 'start_time')::time else f.start_time end;
  v_opens    := case when p_patch ? 'booking_opens_on'  then (p_patch ->> 'booking_opens_on')::date  else f.booking_opens_on end;
  v_closes   := case when p_patch ? 'booking_closes_on' then (p_patch ->> 'booking_closes_on')::date else f.booking_closes_on end;
  v_max      := case when p_patch ? 'max_bookings'  then (p_patch ->> 'max_bookings')::integer else f.max_bookings end;
  v_active   := case when p_patch ? 'active'        then (p_patch ->> 'active')::boolean else f.active end;
  v_amount   := case when p_patch ? 'amount'        then (p_patch ->> 'amount')::numeric else v_old_amt end;

  if v_date is null or v_active is null then
    raise exception 'invalid_patch';
  end if;
  if char_length(v_festival) not between 1 and 120
     or char_length(v_pooja) not between 1 and 200
     or char_length(coalesce(v_desc, '')) > 2000 then
    raise exception 'invalid_festival';
  end if;
  if v_amount is null or v_amount <= 0 or v_amount > 1000000 or scale(v_amount) > 2 then
    raise exception 'invalid_amount';   -- a festival offering always has its own fixed price
  end if;
  if (v_opens is not null and v_opens > v_date)
     or (v_closes is not null and v_closes > v_date)
     or (v_opens is not null and v_closes is not null and v_opens > v_closes) then
    raise exception 'invalid_window';
  end if;
  if v_max is not null and v_max < 1 then
    raise exception 'invalid_capacity';
  end if;

  v_changes_date := v_date <> f.date;
  v_disables     := f.active and not v_active;
  v_other_change :=
       v_festival is distinct from f.festival_name or v_pooja is distinct from f.pooja_name
    or v_desc is distinct from f.description       or v_time is distinct from f.start_time
    or v_opens is distinct from f.booking_opens_on or v_closes is distinct from f.booking_closes_on
    or v_max is distinct from f.max_bookings       or v_active is distinct from f.active
    or v_changes_date;
  if not v_other_change and v_amount is not distinct from v_old_amt then
    raise exception 'no_change';
  end if;

  if v_changes_date and v_date < v_today then
    raise exception 'date_in_past';
  end if;
  if (v_changes_date or v_disables) and f.date < v_today then
    raise exception 'schedule_in_past';
  end if;

  if v_changes_date or v_disables then
    select count(*), coalesce(jsonb_agg(b.order_no order by b.order_no), '[]'::jsonb)
      into v_count, v_orders
      from public.bookings b
     where b.pooja_id = f.pooja_id and b.status <> 'cancelled';

    if v_count > 0 then
      if p_handling is null then
        raise exception 'affected_bookings_unresolved'
          using detail = jsonb_build_object('count', v_count, 'orders', v_orders)::text;
      end if;
      if p_handling not in ('keep', 'cancel', 'move')
         or (p_handling = 'move' and (not v_changes_date or not v_active)) then
        raise exception 'invalid_handling';
      end if;

      if p_handling = 'cancel' then
        for r in
          select b.id, b.status as st, b.payment_status as ps
            from public.bookings b
           where b.pooja_id = f.pooja_id and b.status <> 'cancelled'
           for update
        loop
          update public.bookings set status = 'cancelled' where id = r.id;
          insert into public.booking_audit_log
            (booking_id, admin_id, admin_email, action, from_status, to_status,
             from_payment_status, to_payment_status, note)
          values
            (r.id, v_uid, v_email, 'schedule_cancel', r.st, 'cancelled', r.ps, r.ps,
             'Festival change: ' || v_reason);
          v_cancelled := v_cancelled + 1;
        end loop;

      elsif p_handling = 'move' then
        for r in
          select b.id, b.status as st, b.payment_status as ps
            from public.bookings b
           where b.pooja_id = f.pooja_id and b.status <> 'cancelled'
           for update
        loop
          update public.bookings set booking_date = v_date where id = r.id;
          insert into public.booking_audit_log
            (booking_id, admin_id, admin_email, action, from_status, to_status,
             from_payment_status, to_payment_status, note)
          values
            (r.id, v_uid, v_email, 'schedule_move', r.st, r.st, r.ps, r.ps,
             'Moved from ' || f.date::text || ' to ' || v_date::text || ': ' || v_reason);
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
  update public.festival_offerings
     set festival_name = v_festival, pooja_name = v_pooja, description = v_desc,
         date = v_date, start_time = v_time, booking_opens_on = v_opens,
         booking_closes_on = v_closes, max_bookings = v_max, active = v_active
   where id = p_id;
  if v_amount is distinct from v_old_amt then
    update public.poojas set amount_inr = v_amount where id = f.pooja_id;   -- price audit trigger
  end if;

  return query select v_count, v_cancelled, v_moved;
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
revoke all on function public.admin_festival_create(text, text, text, date, time, numeric, date, date, integer, boolean, uuid, text) from public, anon;
revoke all on function public.admin_festival_update(uuid, jsonb, text, text) from public, anon;
grant execute on function public.admin_festival_create(text, text, text, date, time, numeric, date, date, integer, boolean, uuid, text) to authenticated;
grant execute on function public.admin_festival_update(uuid, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Hardening: Supabase grants EXECUTE on every new public function to anon and
-- authenticated by default (and PostgREST would list it as an RPC). Internal
-- trigger and helper functions must not be part of the public API surface.
-- (Trigger functions are permission-checked when the trigger is created, not when
-- it fires, so this does not affect them. generate_order_no() is a column default
-- run by the server's service_role, which keeps access.)
-- ---------------------------------------------------------------------------
revoke all on function public.set_updated_at()               from public, anon, authenticated;
revoke all on function public.forbid_audit_change()          from public, anon, authenticated;
revoke all on function public.generate_order_no()            from public, anon, authenticated;
revoke all on function public.stamp_payment_verification()   from public, anon, authenticated;
revoke all on function public.protect_booking_snapshot()     from public, anon, authenticated;
revoke all on function public.log_pooja_price_change()       from public, anon, authenticated;
revoke all on function public.log_schedule_change()          from public, anon, authenticated;
revoke all on function public.enforce_festival_booking()     from public, anon, authenticated;
revoke all on function public.sync_festival_to_pooja()       from public, anon, authenticated;

commit;
