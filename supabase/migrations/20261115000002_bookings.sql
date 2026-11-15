-- Skandashram: devotee bookings.
-- Public (anon) users have NO direct access to this table. All devotee reads and
-- writes go through the Express API, which validates input and uses the
-- service-role key (server-side only). Devotees prove ownership of a booking with
-- a per-booking secret token (only its SHA-256 hash is stored here). Admins
-- (public.admin_users) can READ bookings through RLS with their own Supabase Auth
-- session; they change them only via public.admin_booking_action().
-- Do not apply to production without approval.

-- Order numbers look like SKD-261115-A1B2C3: date (IST) + 6 random hex chars.
-- Random (not sequential) so order numbers cannot be enumerated. The unique
-- constraint guarantees uniqueness; the API retries on the rare collision.
-- An order number alone grants NO access; see access_token_hash below.
create or replace function public.generate_order_no()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'SKD-'
    || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create table public.bookings (
  id                   uuid primary key default gen_random_uuid(),
  order_no             text not null,

  -- SHA-256 hex of the secret token issued to the devotee at booking time.
  -- The raw token is never stored. Required to view/pay for the booking via the API.
  access_token_hash    text not null check (access_token_hash ~ '^[0-9a-f]{64}$'),

  pooja_id             uuid not null references public.poojas (id) on delete restrict,
  pooja_name           text not null,                       -- snapshot at booking time
  booking_date         date not null,

  devotee_name         text not null check (char_length(devotee_name) between 1 and 120),
  phone                text not null check (phone ~ '^[0-9]{10,13}$'),
  email                text not null check (char_length(email) between 3 and 254),
  nakshatra            text check (nakshatra is null or char_length(nakshatra) <= 60),
  gotra                text check (gotra is null or char_length(gotra) <= 60),
  sankalpam            text check (sankalpam is null or char_length(sankalpam) <= 1000),

  amount_inr           numeric(10, 2) not null check (amount_inr > 0),  -- snapshot of approved price

  status               text not null default 'pending'
                         check (status in ('pending', 'confirmed', 'cancelled')),
  payment_status       text not null default 'unpaid'
                         check (payment_status in ('unpaid', 'awaiting_verification', 'verified', 'rejected')),
  upi_ref              text check (upi_ref is null or upi_ref ~ '^[A-Za-z0-9]{10,22}$'),
  payment_submitted_at timestamptz,
  payment_verified_at  timestamptz,
  payment_verified_by  uuid references auth.users (id),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint bookings_order_no_key unique (order_no),

  -- A payment can never be 'awaiting_verification' or 'verified' without a reference.
  constraint bookings_payment_needs_reference check (
    payment_status in ('unpaid', 'rejected') or upi_ref is not null
  ),
  -- Verification must record who/when.
  constraint bookings_verified_has_audit check (
    payment_status <> 'verified'
    or (payment_verified_at is not null and payment_verified_by is not null)
  )
);

alter table public.bookings
  alter column order_no set default public.generate_order_no();

-- One UPI reference can back only one live payment. Rejected payments release
-- their reference. Case-insensitive so "abc..." and "ABC..." collide.
create unique index bookings_upi_ref_active_key
  on public.bookings (lower(upi_ref))
  where payment_status in ('awaiting_verification', 'verified');

-- Blocks accidental/double submissions: the same devotee (name + phone) cannot hold
-- two live bookings for the same pooja and date.
create unique index bookings_active_dedupe_key
  on public.bookings (pooja_id, booking_date, phone, lower(devotee_name))
  where status <> 'cancelled';

create index bookings_pooja_date_idx     on public.bookings (pooja_id, booking_date);
create index bookings_payment_status_idx on public.bookings (payment_status, created_at desc);
create index bookings_phone_idx          on public.bookings (phone);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- Verification audit: whoever flips a payment to 'verified' is stamped from their
-- own session. An admin cannot attribute a verification to someone else or backdate it.
create or replace function public.stamp_payment_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_status = 'verified' and old.payment_status is distinct from 'verified' then
    if (select auth.uid()) is not null then
      new.payment_verified_by := (select auth.uid());
      new.payment_verified_at := now();
    end if;
  elsif new.payment_status <> 'verified' then
    new.payment_verified_by := null;
    new.payment_verified_at := null;
  end if;
  return new;
end;
$$;

create trigger bookings_stamp_payment_verification
  before update on public.bookings
  for each row execute function public.stamp_payment_verification();

-- The price a devotee agreed to, and which pooja it was for, never change after
-- booking: later price changes affect new bookings only. (booking_date may
-- change only through the audited schedule-move function; status/payment through
-- admin_booking_action.)
create or replace function public.protect_booking_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount_inr        is distinct from old.amount_inr
     or new.pooja_id       is distinct from old.pooja_id
     or new.pooja_name     is distinct from old.pooja_name
     or new.order_no       is distinct from old.order_no
     or new.access_token_hash is distinct from old.access_token_hash then
    raise exception 'booking_snapshot_is_immutable';
  end if;
  return new;
end;
$$;

create trigger bookings_protect_snapshot
  before update on public.bookings
  for each row execute function public.protect_booking_snapshot();

alter table public.bookings enable row level security;

-- Deliberately NO policies for anon. No public select/insert/update/delete.
-- Devotees interact only via the API (service role bypasses RLS).

create policy "bookings: admin read"
  on public.bookings for select
  to authenticated
  using (public.is_admin());

revoke all on public.bookings from anon, authenticated;

-- Column-level privileges. Admins can read everything EXCEPT access_token_hash
-- (so `select *` is denied for them: list columns explicitly).
grant select (
  id, order_no, pooja_id, pooja_name, booking_date, devotee_name, phone, email,
  nakshatra, gotra, sankalpam, amount_inr, status, payment_status, upi_ref,
  payment_submitted_at, payment_verified_at, payment_verified_by,
  created_at, updated_at
) on public.bookings to authenticated;

-- Admins have NO direct UPDATE/INSERT/DELETE on bookings. Every admin change goes
-- through public.admin_booking_action() (migration 3): validated transitions,
-- row locking, and an append-only audit entry in one transaction.
