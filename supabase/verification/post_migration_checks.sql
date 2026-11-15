-- Skandashram: READ-ONLY checks to run on STAGING after migrations 1-5 (and again on
-- production after approval). Every statement is a SELECT. Expected results in comments.

-- 1. Every new table has RLS on.                          expect: 0 rows
select relname from pg_class
 where relnamespace = 'public'::regnamespace and relkind = 'r'
   and relname <> 'pooja_days' and not relrowsecurity;

-- 2. API roles can write nothing, anywhere.               expect: 0 rows
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
   and table_name <> 'pooja_days' and privilege_type <> 'SELECT';

-- 3. Functions callable by anon.                          expect: 0 rows
select p.proname from pg_proc p
 where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute');

-- 4. Functions callable by signed-in users.               expect: the 7 admin_* functions and is_admin only
select p.proname from pg_proc p
 where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
 order by 1;

-- 5. Security-definer functions without a pinned search_path.   expect: 0 rows
select proname from pg_proc
 where pronamespace = 'public'::regnamespace and prosecdef
   and not coalesce(proconfig::text, '') like '%search_path%';

-- 6. Audit logs are append-only (triggers present).       expect: 6 rows
select event_object_table, trigger_name from information_schema.triggers
 where trigger_schema = 'public' and (trigger_name like '%append_only%' or trigger_name like '%no_truncate%')
 order by 1;

-- 7. pooja_days is untouched.                             expect: same row count as before the migration
select count(*) from public.pooja_days;

-- 8. After the seed: 30 poojas, regular 100 / special 1000, none for Annadanam.
select type, amount_inr, count(*) from public.poojas group by 1, 2 order by 1, 2;
select count(*) as annadanam_rows from public.poojas where slug ilike '%annad%';

-- 9. Admin users are who you expect (emails are yours; shown only to you in the dashboard).
select count(*) as admin_count from public.admin_users;
