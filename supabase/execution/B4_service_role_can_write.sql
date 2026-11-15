-- ============================================================================
-- STEP B4: the server-side updater (service role) is NOT blocked
-- Expect: Success, 0 rows affected (no error). Changes nothing.
-- ============================================================================
begin;
set local role service_role;
update public.pooja_days set tithi = tithi where false;
rollback;
select 'service role can still write' as result;
