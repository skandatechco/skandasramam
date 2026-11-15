-- ============================================================================
-- STEP B5 (after A): READ-ONLY verification
-- Run it. Every column ending in _ok must be TRUE, and data_md5 must equal the md5 you
-- saved in step 0. Anything else: STOP and report.
-- ============================================================================
select
  (select count(*) from public.pooja_days) = 7 as pooja_days_7_rows_ok,
  (select md5(string_agg(t::text, '|' order by date)) from public.pooja_days t) as data_md5,
  (select relrowsecurity from pg_class where oid = 'public.pooja_days'::regclass) as pooja_days_rls_on_ok,
  (select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), '')
       from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'pooja_days'
        and grantee in ('anon', 'authenticated')) = 'SELECT' as pooja_days_public_read_only_ok,
  has_table_privilege('service_role', 'public.pooja_days', 'INSERT')
      and has_table_privilege('service_role', 'public.pooja_days', 'UPDATE') as service_role_can_still_write_ok;
