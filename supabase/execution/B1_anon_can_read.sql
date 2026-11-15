-- ============================================================================
-- STEP B1: the public can still READ pooja_days
-- Expect: one row, rows_visible_to_anon = 7.
-- ============================================================================
begin;
set local role anon;
select count(*) as rows_visible_to_anon from public.pooja_days;
rollback;
