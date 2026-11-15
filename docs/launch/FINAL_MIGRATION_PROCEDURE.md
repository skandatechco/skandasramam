# Final migration procedure: project `gtopilroirkphwmfuovv`

Known state (from your inspection): public tables = `pooja_days` only; no public functions; remote migration history =
`20250906113314_create_pooja_days_table`; `pooja_days` = 7 rows, 2025-10-05 to 2026-01-01, **RLS disabled**; daily backups on.
**Nothing below has been run.** Steps marked (you) need your hands.

## A. Before executing (all read-only)

1. **Confirm the latest recoverable backup (you).** Dashboard > Database > Backups: write down the timestamp of the newest _completed_
   daily backup (it must be after today's date minus 24 h). If it is older, use "Create backup now" if offered, or take the dump in step 3.
   Confirm a **Restore** button is available for it. Do not restore anything.
2. **Export `pooja_days` to CSV (you).** Table Editor > `pooja_days` > Export > CSV, saved **outside** the repo
   (e.g. `D:\skandashram-backups\pooja_days-2026-11-15.csv`). It must have 7 data rows.
3. **Optional but recommended (you):** `pg_dump "<connection string from Dashboard > Connect>" --schema=public -f D:\skandashram-backups\public-before.sql`.
4. **Record the "before" fingerprint of `pooja_days` (you).** Run and save the output:
   ```sql
   select count(*), min(date), max(date) from public.pooja_days;
   select md5(string_agg(t::text, '|' order by date)) as data_md5 from public.pooja_days t;
   select relrowsecurity, relforcerowsecurity, relacl::text, pg_get_userbyid(relowner) from pg_class where oid = 'public.pooja_days'::regclass;
   select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='pooja_days' order by 1,2;
   ```
5. **Pre-flight clash check (you):** queries 14 and 15 of `supabase/verification/inspect_existing_project.sql` must return 0 rows
   (already implied by "no other tables, no functions", re-run just before applying).

## B. What was verified (automated, on PGlite with Supabase's default grants and your table's exact state)

- `supabase/pooja-days-invariance.spec.ts`: after migrations 1-5 **and** the seed, `pooja_days` has identical rows, columns, constraints,
  indexes, RLS flag (still disabled), policies, triggers, owner, table grants, column grants, and the project's default privileges are unchanged.
  No migration or seed statement even names the table outside comments.
- Destructive operations: none. The migrations contain no `DROP TABLE`, `TRUNCATE`, `DELETE FROM`, `DROP SCHEMA`, `ALTER DEFAULT PRIVILEGES`
  or `CREATE EXTENSION`. The only `DROP CONSTRAINT`s act on tables created by the same sequence (migration 5 on `poojas` and `schedule_audit_log`).
- Function permissions: anon can execute no function; signed-in users only the 7 `admin_*` functions and `is_admin()`; internal
  trigger/helper functions revoked (migration 5). Each of the 13 security-definer functions pins `search_path = ''`, schema-qualifies every object,
  and the admin ones call `_require_admin()` first and read the identity from `auth.uid()`, never from a parameter.
- Seed: 30 poojas = **13 regular at ₹100** (12 listed regular + Tamil Month First Saturday) and **17 special at ₹1,000**; no Annadanam.
- **All 11 Panchangam rules are inserted disabled**; public cannot see them until an admin enables each.
- Payments: `PAYMENTS_LIVE` and `VITE_PAYMENT_QR_CONFIGURED` are not set in any committed file (`.env`, `.env.example` comment-only, `vercel.json`);
  without both, production refuses payment references (tested).

## C. Execution order (you run; I will not run any of it)

Use the **SQL Editor**, not `supabase db push`. Reason: the remote history contains `20250906113314` which is not a file in this repo, so
`db push` stops with "remote migration versions not found locally". (To record the new versions afterwards:
`supabase migration repair --status applied 20261115000001 20261115000002 20261115000003 20261115000004 20261115000005`.)

For each file in this order, paste it between `begin;` and `commit;`, run, and **stop at the first error** (a failed file leaves nothing behind):

1. `supabase/migrations/20261115000001_admin_users_and_poojas.sql`
2. `supabase/migrations/20261115000002_bookings.sql`
3. `supabase/migrations/20261115000003_admin_audit_and_actions.sql`
4. `supabase/migrations/20261115000004_pricing_and_schedule_admin.sql`
5. `supabase/migrations/20261115000005_festival_offerings.sql`

After **each** file run `select count(*) from public.pooja_days;` -> **7**.

Then the catalogue: `supabase/seed/poojas.seed.sql` (once; re-running is safe).

## D. Post-migration verification and expected results (run all; every statement is read-only)

| #   | Query                                                                                                     | Expected                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `select count(*), min(date), max(date) from public.pooja_days;` and the md5 and ACL queries from A4       | 7, 2025-10-05, 2026-01-01; md5/ACL/grants **identical** to A4                                                          |
| 2   | `supabase/verification/post_migration_checks.sql`                                                         | 1: 0 rows; 2: 0 rows; 3: 0 rows; 4: the 7 admin functions + `is_admin`; 5: 0 rows; 6: 6 rows; 7: 7; 8: see below; 9: 0 |
| 3   | `select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';` | 11 (10 new + `pooja_days`)                                                                                             |
| 4   | `select type, amount_inr, count(*) from public.poojas group by 1,2 order by 1,2;`                         | daily 100: 1; panchangam 100: 11; special 100: 1; special 1000: 17 (**regular = 13 at 100, special = 17 at 1000**)     |
| 5   | `select count(*) from public.poojas where slug ilike '%annad%' or name ilike '%annad%';`                  | 0                                                                                                                      |
| 6   | `select count(*), count(*) filter (where active) from public.panchangam_pooja_rules;`                     | 11, **0**                                                                                                              |
| 7   | `select count(*) from public.recurring_pooja_schedule;` / `special_pooja_schedule`                        | 1 / 0                                                                                                                  |
| 8   | `select count(*), count(admin_id) from public.pooja_price_audit_log;`                                     | 30, 0 (all "system": the seed)                                                                                         |
| 9   | `select count(*) from public.bookings;` and `public.admin_users`                                          | 0 and 0 (until you add the admin)                                                                                      |
| 10  | As in A4, the grants on `pooja_days`                                                                      | unchanged                                                                                                              |
| 11  | `select tablename, policyname from pg_policies where schemaname='public' order by 1,2;`                   | only policies on the 10 new tables; none on `pooja_days`                                                               |

Then (you): add the admin (`insert into public.admin_users (user_id, email) select id, email from auth.users where email = '<admin email>';`),
sign in at `/admin`, confirm the catalogue shows 30 poojas with the amounts above and all 11 Panchangam rules disabled.

## E. Rollback

Before any booking exists: `supabase/rollback/rollback_all.sql` (drops only our 10 tables and 19 functions; never `pooja_days`; tested), then re-apply.
After bookings exist: do not roll back; restore the backup from A1 or fix forward.

## F. Findings that need your decision (do not block the migration itself)

1. **`pooja_days` has RLS disabled.** On Supabase this normally means anyone with the public anon key can read **and write or delete** it over the REST API.
   Confirm with query 9 (inspection file). The optional, separately approved script `supabase/optional/harden_pooja_days.sql` enables RLS, keeps public
   read, and removes write grants (tested: data unchanged, service role unaffected). It is **not** part of migrations 1-5; I will not run it without your approval.
2. **No Panchangam data from today onward.** `pooja_days` ends 2026-01-01 and today is 2026-11-15, so the calendar's nakshatram for every upcoming day
   comes from the Prokerala fallback (needs working Prokerala credentials; rate-limited) or shows "not available". Panchangam poojas stay disabled
   regardless. Plan a backfill of `pooja_days` for the next 12 months before enabling any Panchangam rule.
3. Migration history will not list our five versions unless you run the `migration repair` command in section C (cosmetic).
