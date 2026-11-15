-- ============================================================================
-- OPTIONAL, SEPARATE FROM MIGRATIONS 1-5: protect the existing public.pooja_days.   *** NOT A MIGRATION ***
--
-- Today pooja_days has RLS disabled. On Supabase, new tables are granted to the API roles by
-- default, so anyone holding the public anon key (it ships in the website) may be able to
-- INSERT / UPDATE / DELETE the Panchangam rows over the REST API. Run query 9 of
-- supabase/verification/inspect_existing_project.sql to see whether that is the case.
--
-- This script keeps the data readable and removes the write path:
--   * the website's server reads pooja_days with the service role, which bypasses RLS: unaffected;
--   * anon / authenticated may still SELECT (public calendar data), nothing else.
-- It changes grants and RLS on pooja_days, so it needs its own explicit approval. It is reversible:
--   alter table public.pooja_days disable row level security;
--   drop policy "pooja_days: public read" on public.pooja_days;
--   grant insert, update, delete on public.pooja_days to anon, authenticated;   -- only if it was granted before
-- ============================================================================
begin;
alter table public.pooja_days enable row level security;

create policy "pooja_days: public read"
  on public.pooja_days for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate, references, trigger on public.pooja_days from anon, authenticated;
commit;
