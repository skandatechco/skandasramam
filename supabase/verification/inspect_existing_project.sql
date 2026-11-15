-- ============================================================================
-- Skandashram: READ-ONLY inspection of the EXISTING Supabase project.
-- Paste into the Supabase dashboard > SQL Editor and run each block. Every statement
-- is a SELECT: nothing is created, changed or deleted. No personal data is read
-- (Auth users are only counted). Send the results back; do not send any keys.
-- ============================================================================

-- 1. Tables in public, approximate row counts, and whether RLS is on
select c.relname as table_name, c.relkind, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced, c.reltuples::bigint as approx_rows
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
 order by 1;

-- 2. pooja_days: columns
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pooja_days'
 order by ordinal_position;

-- 3. pooja_days: size, date range, duplicates, gaps
select count(*) as row_count, min(date) as earliest, max(date) as latest,
       count(distinct date) as distinct_dates,
       (max(date) - min(date) + 1) - count(distinct date) as missing_days_in_range
  from public.pooja_days;

-- 4. pooja_days: coverage from today onward (what the calendar and booking rely on)
select count(*) filter (where date >= current_date) as rows_from_today,
       max(date) as latest, max(date) - current_date as days_ahead
  from public.pooja_days;

-- 5. pooja_days: data quality (blank / null values)
select count(*) filter (where coalesce(btrim(tithi), '') = '')      as blank_tithi,
       count(*) filter (where coalesce(btrim(nakshatra), '') = '')  as blank_nakshatra,
       count(*) filter (where coalesce(btrim(paksha), '') = '')     as blank_paksha
  from public.pooja_days;

-- 6. Distinct tithi / paksha / nakshatra spellings and how often each occurs
--    (the application normalises variants; unknown spellings make a date "undetermined")
select 'tithi' as kind, tithi as value, count(*) from public.pooja_days group by 2
union all select 'paksha', paksha, count(*) from public.pooja_days group by 2
union all select 'nakshatra', nakshatra, count(*) from public.pooja_days group by 2
 order by 1, 3 desc;

-- 7. Rows that are ambiguous for booking: more than one nakshatra or tithi in one cell
select date, tithi, paksha, nakshatra
  from public.pooja_days
 where nakshatra ~ '[/,&;]|\sand\s' or tithi ~ '[/,&;]|\sand\s'
 order by date
 limit 200;

-- 8. Other columns worth knowing about (labels, source)
select source_provider, count(*), min(fetched_at), max(fetched_at)
  from public.pooja_days group by 1;

-- 9. RLS policies and table privileges on pooja_days
select policyname, cmd, roles, qual
  from pg_policies where schemaname = 'public' and tablename = 'pooja_days';
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'pooja_days'
   and grantee in ('anon', 'authenticated', 'service_role')
 order by 1, 2;

-- 10. Every policy in public
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1, 2;

-- 11. Functions, triggers and extensions already present (to spot name clashes)
select p.proname, p.prosecdef as security_definer
  from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;
select event_object_table, trigger_name from information_schema.triggers
 where trigger_schema = 'public' order by 1, 2;
select extname, extversion from pg_extension order by 1;

-- 12. Auth: counts only (no emails, ids or other personal data)
select count(*) as auth_users,
       count(*) filter (where email_confirmed_at is not null) as confirmed,
       count(*) filter (where last_sign_in_at is not null) as ever_signed_in
  from auth.users;

-- 13. Migration history (may not exist if migrations were never run through the CLI)
select version, name from supabase_migrations.schema_migrations order by version;

-- 14. Name clashes: any existing object the new migrations would try to create
select relname from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('admin_users','poojas','recurring_pooja_schedule','panchangam_pooja_rules',
                   'special_pooja_schedule','bookings','booking_audit_log','pooja_price_audit_log',
                   'schedule_audit_log','festival_offerings');

-- 15. Function-name clashes. IMPORTANT: the migrations use CREATE OR REPLACE for these, which would
--     silently REPLACE an existing function of the same name and signature.   expect: 0 rows
select p.oid::regprocedure as existing_function
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('set_updated_at','is_admin','_require_admin','_set_audit_context','generate_order_no',
                     'forbid_audit_change','stamp_payment_verification','protect_booking_snapshot',
                     'log_pooja_price_change','log_schedule_change','enforce_festival_booking',
                     'sync_festival_to_pooja','admin_booking_action','admin_set_pooja_price',
                     'admin_special_schedule_create','admin_special_schedule_update',
                     'admin_schedule_rule_set_active','admin_festival_create','admin_festival_update');

-- 16. Who uses an existing set_updated_at() (if query 15 shows one): replacing it affects these triggers.
select event_object_table, trigger_name, action_statement from information_schema.triggers
 where trigger_schema = 'public' and action_statement ilike '%set_updated_at%';
