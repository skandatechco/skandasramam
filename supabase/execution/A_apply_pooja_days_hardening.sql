-- ============================================================================
-- STEP A: pooja_days hardening (public read; no public/authenticated writes)
-- Changes ONLY grants and the RLS flag on public.pooja_days. No row is touched.
-- The service role (the trusted server-side updater) bypasses RLS and keeps its privileges.
-- Reverse (only if needed): alter table public.pooja_days disable row level security;
--   drop policy "pooja_days: public read" on public.pooja_days;  then re-grant what step 0 showed.
-- ============================================================================
begin;
alter table public.pooja_days enable row level security;

create policy "pooja_days: public read"
  on public.pooja_days for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate, references, trigger on public.pooja_days from anon, authenticated;
commit;
