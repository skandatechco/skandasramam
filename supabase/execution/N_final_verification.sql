-- ============================================================================
-- STEP N (final): READ-ONLY verification
-- Run it. Every column ending in _ok must be TRUE, and data_md5 must equal the md5 you
-- saved in step 0. Anything else: STOP and report.
-- ============================================================================
select
  (select count(*) from public.pooja_days) = 7 as pooja_days_7_rows_ok,
  (select md5(string_agg(t::text, '|' order by date)) from public.pooja_days t) as data_md5,
  (select relrowsecurity from pg_class where oid = 'public.pooja_days'::regclass) as pooja_days_rls_on_ok,
  (select coalesce(string_agg(distinct a.privilege_type, ',' order by a.privilege_type), '')
       from pg_class c, aclexplode(c.relacl) a
      where c.oid = 'public.pooja_days'::regclass
        and a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))) = 'SELECT' as pooja_days_public_read_only_ok,
  has_table_privilege('service_role', 'public.pooja_days', 'INSERT')
      and has_table_privilege('service_role', 'public.pooja_days', 'UPDATE') as service_role_can_still_write_ok,
  (select array_agg(relname::text order by relname) from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r') = array['admin_users', 'booking_audit_log', 'bookings', 'festival_offerings', 'panchangam_pooja_rules', 'pooja_days', 'pooja_price_audit_log', 'poojas', 'recurring_pooja_schedule', 'schedule_audit_log', 'special_pooja_schedule']::text[] as tables_exact_ok,
  (select coalesce(array_agg(proname::text order by proname), '{}'::text[]) from pg_proc
        where pronamespace = 'public'::regnamespace) = array['_require_admin', '_set_audit_context', 'admin_booking_action', 'admin_festival_create', 'admin_festival_update', 'admin_schedule_rule_set_active', 'admin_set_pooja_price', 'admin_special_schedule_create', 'admin_special_schedule_update', 'enforce_festival_booking', 'forbid_audit_change', 'generate_order_no', 'is_admin', 'log_pooja_price_change', 'log_schedule_change', 'protect_booking_snapshot', 'set_updated_at', 'stamp_payment_verification', 'sync_festival_to_pooja']::text[] as functions_exact_ok,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
         and relname <> 'pooja_days' and not relrowsecurity) = 0 as new_tables_have_rls_ok,
  (select count(*) from information_schema.role_table_grants
        where table_schema = 'public' and table_name <> 'pooja_days'
          and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT') = 0 as no_api_writes_ok,
  (select count(*) from public.poojas) = 30                                                     as poojas_30_ok,
  (select count(*) from public.poojas where amount_inr = 100) = 13                              as regular_13_at_100_ok,
  (select count(*) from public.poojas where amount_inr = 1000) = 17                            as special_17_at_1000_ok,
  (select count(*) from public.poojas where amount_inr is null) = 0                             as none_unpriced_ok,
  (select count(*) from public.poojas where slug ilike '%annad%' or name ilike '%annad%') = 0   as no_annadanam_ok,
  (select count(*) from public.panchangam_pooja_rules) = 11                                     as panchangam_rules_11_ok,
  (select count(*) from public.panchangam_pooja_rules where active) = 0                         as panchangam_rules_all_disabled_ok,
  (select count(*) from public.recurring_pooja_schedule) = 1                                    as one_daily_schedule_ok,
  (select count(*) from public.special_pooja_schedule) = 0                                      as no_invented_special_dates_ok,
  (select count(*) from public.pooja_price_audit_log where admin_id is null) = 30               as seed_rates_audited_ok,
  (select count(*) from public.bookings) = 0                                                    as no_bookings_ok,
  (select count(*) from public.admin_users) = 0                                                 as no_admin_accounts_yet_ok,
  (select count(*) from public.festival_offerings) = 0                                          as no_festivals_ok,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('anon', p.oid, 'execute')) = 0                                  as anon_runs_no_function_ok,
  (select array_agg(p.proname::text order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'execute'))
     = array['admin_booking_action','admin_festival_create','admin_festival_update','admin_schedule_rule_set_active',
             'admin_set_pooja_price','admin_special_schedule_create','admin_special_schedule_update','is_admin']::text[]
                                                                                                as signed_in_functions_ok,
  (select count(*) from information_schema.triggers where trigger_schema = 'public'
     and (trigger_name like '%append_only%' or trigger_name like '%no_truncate%')) = 6          as audit_triggers_ok;
