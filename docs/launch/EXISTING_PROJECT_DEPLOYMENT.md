# Applying the migrations to the EXISTING Supabase project

Project: `gtopilroirkphwmfuovv`. Decision: no staging project; the original project is used. Nothing below has been run.
Everything marked **(you)** needs your hands or approval; I will not run any of it without an explicit go-ahead.

## 0. Status of the inspection

I could not inspect the database: this machine has no Supabase credentials, no `.env.local`, no `psql`/`supabase` CLI,
and the Supabase connector is not signed in. Access options, least to most powerful (choose one):

1. **(you) Dashboard SQL Editor**: run `supabase/verification/inspect_existing_project.sql` (16 read-only `SELECT` blocks)
   and paste the results to me. Needs no credentials shared. **Recommended.**
2. **(you)** Create a read-only Postgres role and give me its connection string through a local, git-ignored file.
3. **(you)** Sign in to the Supabase connector; it is not read-only, so I would only run the `SELECT`s in that file.

Nothing in this document requires me to see a secret.

## 1. What the migrations can and cannot touch (reviewed)

- They **create** 10 new tables and 19 functions. They never `ALTER`, `DROP`, `DELETE` or `UPDATE` any existing table.
  `public.pooja_days` is never referenced. They never write to the `auth` schema (existing Auth accounts untouched).
- A **table** name clash makes `CREATE TABLE` fail and apply nothing of that file (safe).
- **Function risk (the one real hazard):** the migrations use `CREATE OR REPLACE FUNCTION` for 19 names, including
  `set_updated_at()` and `is_admin()`. If the project already has a function with the same name and arguments,
  it would be silently replaced. Query 15 of the inspection file must return **0 rows** before applying.
  If it returns rows, stop: I will rename ours (small change) rather than replace yours.
- Migration 5 also revokes execute on `set_updated_at` and others from `anon`/`authenticated`. Triggers keep working
  (permissions are checked when a trigger is created), but if an existing app calls such a function as an RPC it would break:
  query 15/16 reveal that too.
- Existing RLS on `pooja_days` is not changed. If it has none, that is a pre-existing exposure: report it, decide separately.

## 2. Backup (before anything is applied) (you)

1. Dashboard > Database > Backups: note whether daily backups / PITR exist (paid plans). If so, press **Backup now / confirm the
   latest** and write down the time. If the plan has no backups, do step 2 and 3 instead.
2. Export `pooja_days`: Table Editor > pooja_days > Export > CSV; keep the file **outside** the repo.
3. Schema + data dump from your machine (the connection string comes from Dashboard > Connect; keep the password out of chat):
   `pg_dump "<connection string>" --schema=public -f skandashram-before.sql`
4. Because the migrations only add objects, the data-loss risk is low; the backup is for the function-replacement case and for peace of mind.

## 3. Pre-flight (you, read-only)

Inspection file queries must show: `pooja_days` exists with rows from today onward; none of the 10 new table names exist (query 14);
no clashing function (query 15 = 0 rows); the migration-history table state (query 13).

## 4. Apply (only after my report is reviewed and you approve) (you run, I prepare)

Use one of:

- **A. Supabase CLI** (preferred): `supabase link --project-ref gtopilroirkphwmfuovv` (asks for the DB password; type it yourself), then
  `supabase db push --dry-run`, review the list (exactly the five files), then `supabase db push`. Each file runs in a transaction.
- **B. SQL Editor:** open each file in order 1 to 5; wrap it as `begin; <file> commit;`, run, and stop at the first error
  (nothing from that file is kept). Do not run the seed in the same step.

After each file: `select count(*) from public.pooja_days;` must equal the pre-migration count.

## 5. Seed (you run, after migrations and after the temple has reviewed `docs/launch/CATALOGUE_REPORT.md`)

Run `supabase/seed/poojas.seed.sql` once in the SQL Editor (it has its own transaction; re-running is safe).
Result: 30 poojas (13 regular at ₹100, 17 special at ₹1,000), no Annadanam, one schedule per pooja where the website publishes one.
**Panchangam poojas are held:** their rules are inserted _disabled_, so none is shown or bookable until an admin enables
the rule after verifying dates (this satisfies "no bookings on unverified Panchangam-sensitive dates"). Daily homam
(every day, 09:15) is live; special poojas and Tamil Month First Saturday have no dates until the temple adds them.

## 6. Verify (you run, read-only)

`supabase/verification/post_migration_checks.sql`: expect the stated results in its comments (RLS on, no writes for API roles,
anon can call no function, signed-in users only the 7 admin functions + `is_admin`, 6 audit triggers, same `pooja_days` count,
30 poojas, 0 Annadanam rows).

## 7. Admin account (you)

Do not change existing Auth users. Either use an existing user you own, or create a new one in Authentication > Users (an addition,
not a modification), then in the SQL Editor:
`insert into public.admin_users (user_id, email) select id, email from auth.users where email = '<admin email>';`

## 8. Environment (no values in chat or git) - see `ENVIRONMENT.md`

Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, Prokerala variables.
Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Keep `PAYMENTS_LIVE` and `VITE_PAYMENT_QR_CONFIGURED` unset.
Local testing against this real project uses `.env.local`; until the first test bookings are cleaned up, treat every booking as real data.

## 9. If something goes wrong

- Failure during a file: nothing from that file remains (transaction); report the error and stop.
- After success but before real bookings: `supabase/rollback/rollback_all.sql` (drops only our objects, never `pooja_days`).
- If a function was replaced: restore it from the backup dump (`skandashram-before.sql`).
- After real bookings exist: do **not** roll back; fix forward or restore the backup.

## 10. Test bookings on a live project

The only data-bearing tests (end-to-end plan steps 3 to 9) create real rows. Use obviously fake devotees ("TEST DO NOT PROCESS"),
price-checked on a ₹100 pooja, and remove them afterwards with a reviewed `delete` written at that time (audit logs are append-only by
design and will remain). Payments stay disabled in production mode; test-mode payment only runs locally with `NODE_ENV` not production.
