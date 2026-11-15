-- ============================================================================
-- STEP B2: the public CANNOT write
-- Expect an ERROR: permission denied for table pooja_days.  (The error is the PASS.)
-- If it says 'Success. No rows returned' the hardening did NOT work: STOP.
-- 'where false' guarantees that even a wrong result changes no row.
-- ============================================================================
begin;
set local role anon;
delete from public.pooja_days where false;
rollback;
