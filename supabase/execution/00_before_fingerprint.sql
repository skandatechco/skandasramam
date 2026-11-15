-- ============================================================================
-- STEP 0: fingerprint of public.pooja_days BEFORE anything changes (read-only)
-- Run it and SAVE the whole result row (screenshot or copy) next to the CSV export.
-- data_md5 is what every later verification must reproduce.
-- ============================================================================
select
  (select count(*) from public.pooja_days)                                         as rows_in_pooja_days,
  (select min(date) from public.pooja_days)                                        as earliest,
  (select max(date) from public.pooja_days)                                        as latest,
  (select md5(string_agg(t::text, '|' order by date)) from public.pooja_days t)    as data_md5,
  (select relrowsecurity from pg_class where oid = 'public.pooja_days'::regclass)  as rls_enabled,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pooja_days') as policies,
  (select relacl::text from pg_class where oid = 'public.pooja_days'::regclass)    as acl,
  (select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'pooja_days')                   as grants,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r') as public_tables,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace)       as public_functions;
