-- ============================================================================
-- STEP C: apply migration 1 (admin_users_and_poojas)
-- Paste and run once. It is one transaction: if any statement fails NOTHING from this file is kept.
-- Expect: Success. On any error: STOP and send me the exact message.
-- ============================================================================
begin;

-- Skandashram: admin users, pooja catalogue and the three kinds of schedule.
-- NOTE: public.pooja_days (the Panchangam table) is intentionally NOT touched by any migration.
-- Do not apply to production without approval.
--
-- Pooja types / schedules
--   daily       performed every day (or on a fixed weekday)  -> recurring_pooja_schedule
--   panchangam  dates depend on tithi / paksha / nakshatra     -> panchangam_pooja_rules
--   special     scheduled by the temple for specific dates     -> special_pooja_schedule
--
-- WRITE MODEL: nobody has direct write access through the API roles. Prices and
-- schedules change only through the audited SECURITY DEFINER functions in
-- migration 4 (administrators), or via SQL by the database operator (seeding).

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_users: Supabase Auth users allowed to administer the temple site.
-- Rows are inserted manually (SQL editor) after creating the auth user.
-- ---------------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- SECURITY DEFINER so policies and functions can check admin status without
-- granting anyone read access to the whole admin_users table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

create policy "admin_users: read own row"
  on public.admin_users for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

-- ---------------------------------------------------------------------------
-- poojas: catalogue. amount_inr is the ONE fixed participation amount in INR.
-- NULL = no approved price => the pooja cannot be booked.
-- ---------------------------------------------------------------------------
create table public.poojas (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 1 and 200),
  type        text not null check (type in ('daily', 'panchangam', 'special')),
  description text,
  amount_inr  numeric(10, 2) check (amount_inr is null or (amount_inr > 0 and amount_inr <= 1000000)),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger poojas_set_updated_at
  before update on public.poojas
  for each row execute function public.set_updated_at();

alter table public.poojas enable row level security;

create policy "poojas: public read active"
  on public.poojas for select
  to anon, authenticated
  using (active);

create policy "poojas: admin read all"
  on public.poojas for select
  to authenticated
  using (public.is_admin());

revoke all on public.poojas from anon, authenticated;
grant select on public.poojas to anon, authenticated;

-- ---------------------------------------------------------------------------
-- recurring_pooja_schedule (type A): 'daily' = every day; 'weekly' = on `weekday` (0 = Sunday).
-- ---------------------------------------------------------------------------
create table public.recurring_pooja_schedule (
  id         uuid primary key default gen_random_uuid(),
  pooja_id   uuid not null references public.poojas (id) on delete cascade,
  recurrence text not null check (recurrence in ('daily', 'weekly')),
  weekday    smallint check (weekday between 0 and 6),
  start_time time,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_weekday_matches_recurrence check (
    (recurrence = 'weekly' and weekday is not null)
    or (recurrence = 'daily' and weekday is null)
  )
);

create index recurring_pooja_schedule_pooja_id_idx
  on public.recurring_pooja_schedule (pooja_id);

create trigger recurring_pooja_schedule_set_updated_at
  before update on public.recurring_pooja_schedule
  for each row execute function public.set_updated_at();

alter table public.recurring_pooja_schedule enable row level security;

create policy "recurring_pooja_schedule: public read active"
  on public.recurring_pooja_schedule for select
  to anon, authenticated
  using (active);

create policy "recurring_pooja_schedule: admin read all"
  on public.recurring_pooja_schedule for select
  to authenticated
  using (public.is_admin());

revoke all on public.recurring_pooja_schedule from anon, authenticated;
grant select on public.recurring_pooja_schedule to anon, authenticated;

-- ---------------------------------------------------------------------------
-- panchangam_pooja_rules (type B): structured rules evaluated against
-- public.pooja_days. A rule is a conjunction (AND) of the conditions it sets:
--   tithis      any of these tithis            (NULL = any)
--   paksha      'shukla' | 'krishna'           (NULL = either)
--   nakshatras  any of these nakshatras        (NULL = any)
-- Several rows for one pooja are alternatives (OR). Values are canonical ids, not
-- free text; scheduling never depends on pooja_days.labels. If a day's Panchangam
-- is missing or ambiguous the pooja is simply not scheduled that day.
-- ---------------------------------------------------------------------------
create table public.panchangam_pooja_rules (
  id         uuid primary key default gen_random_uuid(),
  pooja_id   uuid not null references public.poojas (id) on delete cascade,
  tithis     text[],
  paksha     text check (paksha is null or paksha in ('shukla', 'krishna')),
  nakshatras text[],
  start_time time,
  notes      text check (notes is null or char_length(notes) <= 500),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint panchangam_rule_has_condition check (
    coalesce(cardinality(tithis), 0) > 0 or coalesce(cardinality(nakshatras), 0) > 0
  ),
  constraint panchangam_rule_valid_tithis check (
    tithis is null or tithis <@ array[
      'pratipada','dwitiya','tritiya','chaturthi','panchami','shashthi','saptami','ashtami',
      'navami','dashami','ekadashi','dwadashi','trayodashi','chaturdashi','purnima','amavasya'
    ]::text[]
  ),
  constraint panchangam_rule_valid_nakshatras check (
    nakshatras is null or nakshatras <@ array[
      'ashwini','bharani','krittika','rohini','mrigashira','ardra','punarvasu','pushya','ashlesha',
      'magha','purva_phalguni','uttara_phalguni','hasta','chitra','swati','vishakha','anuradha',
      'jyeshtha','mula','purva_ashadha','uttara_ashadha','shravana','dhanishta','shatabhisha',
      'purva_bhadrapada','uttara_bhadrapada','revati'
    ]::text[]
  ),
  -- Purnima is always Shukla and Amavasya always Krishna: reject contradictory rules.
  constraint panchangam_rule_consistent_paksha check (
    not ('purnima' = any (coalesce(tithis, '{}')) and paksha = 'krishna')
    and not ('amavasya' = any (coalesce(tithis, '{}')) and paksha = 'shukla')
  )
);

create index panchangam_pooja_rules_pooja_id_idx
  on public.panchangam_pooja_rules (pooja_id);

create trigger panchangam_pooja_rules_set_updated_at
  before update on public.panchangam_pooja_rules
  for each row execute function public.set_updated_at();

alter table public.panchangam_pooja_rules enable row level security;

create policy "panchangam_pooja_rules: public read active"
  on public.panchangam_pooja_rules for select
  to anon, authenticated
  using (active);

create policy "panchangam_pooja_rules: admin read all"
  on public.panchangam_pooja_rules for select
  to authenticated
  using (public.is_admin());

revoke all on public.panchangam_pooja_rules from anon, authenticated;
grant select on public.panchangam_pooja_rules to anon, authenticated;

-- ---------------------------------------------------------------------------
-- special_pooja_schedule (type C): special poojas on specific dates.
-- ---------------------------------------------------------------------------
create table public.special_pooja_schedule (
  id         uuid primary key default gen_random_uuid(),
  pooja_id   uuid not null references public.poojas (id) on delete cascade,
  date       date not null,
  start_time time,
  notes      text check (notes is null or char_length(notes) <= 500),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pooja_id, date)
);

create index special_pooja_schedule_date_idx
  on public.special_pooja_schedule (date);

create trigger special_pooja_schedule_set_updated_at
  before update on public.special_pooja_schedule
  for each row execute function public.set_updated_at();

alter table public.special_pooja_schedule enable row level security;

create policy "special_pooja_schedule: public read active"
  on public.special_pooja_schedule for select
  to anon, authenticated
  using (active);

create policy "special_pooja_schedule: admin read all"
  on public.special_pooja_schedule for select
  to authenticated
  using (public.is_admin());

revoke all on public.special_pooja_schedule from anon, authenticated;
grant select on public.special_pooja_schedule to anon, authenticated;

commit;
