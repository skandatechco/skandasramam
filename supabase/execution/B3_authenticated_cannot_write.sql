-- ============================================================================
-- STEP B3: a signed-in user CANNOT write
-- Expect an ERROR: permission denied for table pooja_days.  (The error is the PASS.)
-- ============================================================================
begin;
set local role authenticated;
update public.pooja_days set tithi = tithi where false;
rollback;
