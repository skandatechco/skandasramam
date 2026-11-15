-- ============================================================================
-- STEP A: pooja_days hardening (public read; no public/authenticated writes)
-- Changes ONLY grants and the RLS flag on public.pooja_days. No row is touched.
-- The service role (the trusted server-side updater) bypasses RLS and keeps its privileges.
-- Reverse (only if needed): alter table public.pooja_days disable row level security;
--   drop policy "pooja_days: public read" on public.pooja_days;  then: grant all on public.pooja_days to anon, authenticated;  (restores the original ACL).
-- ============================================================================
begin;
alter table public.pooja_days enable row level security;

create policy "pooja_days: public read"
  on public.pooja_days for select
  to anon, authenticated
  using (true);

-- Remove EVERYTHING anon/authenticated hold (insert, update, delete, truncate, references, trigger and,
-- on Postgres 17+, maintain), then give back read access only. Nothing is left over.
revoke all on public.pooja_days from anon, authenticated;
grant select on public.pooja_days to anon, authenticated;
commit;
