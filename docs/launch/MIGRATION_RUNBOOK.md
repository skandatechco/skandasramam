# Migration readiness and staging runbook

Nothing here has been applied anywhere. Verified so far on an in-process PostgreSQL (PGlite) that
reproduces Supabase's roles, `auth.uid()/auth.jwt()` and its default grants: **not** on real Supabase.

## 1. Review result

| Area                | Result                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order               | 1 admin_users + catalogue + schedules, 2 bookings, 3 audit + booking actions, 4 pricing + schedule admin, 5 festival offerings. Each depends only on earlier ones (applies cleanly from empty, and again after the rollback script).                                                                                      |
| `pooja_days`        | No migration touches it; a test proves its rows, policies and triggers are unchanged. The server reads it with the service role.                                                                                                                                                                                          |
| Supabase Auth       | `admin_users.user_id` references `auth.users`; identity comes from `auth.uid()` / `auth.jwt()`. Browser uses the anon key only.                                                                                                                                                                                           |
| Permissions         | All tables revoked from `anon`/`authenticated`, then only the intended `SELECT`s granted. Nobody can write tables through the API, including admins. Under Supabase's default grants, anon can execute **no** function; signed-in users only the 7 admin functions + `is_admin()` (new hardening in migration 5, tested). |
| RLS                 | Enabled on every new table; public read of active catalogue/schedule rows; admin read-all; bookings admin-only; `access_token_hash` column not readable.                                                                                                                                                                  |
| Security definer    | Every such function with pinned `search_path`, `_require_admin()` first, identity from the session (tested).                                                                                                                                                                                                              |
| Admin access        | Only rows in `admin_users` (inserted by you in the SQL editor).                                                                                                                                                                                                                                                           |
| Audit               | `booking_audit_log`, `pooja_price_audit_log`, `schedule_audit_log`: append-only (update/delete/truncate blocked, even for the owner).                                                                                                                                                                                     |
| Booking constraints | Unique order number, unique active (pooja, date, phone, name), unique live UPI reference, payment/verification consistency, festival date/window/capacity trigger.                                                                                                                                                        |
| Price immutability  | `bookings.amount_inr`, pooja, name, order number and token hash cannot change after insert (trigger).                                                                                                                                                                                                                     |

**Known limits of the evidence:** real concurrency (row locks), PostgREST error shapes, and Supabase-managed
objects (e.g. `auth` schema details) are untested until the staging run below.

## 2. Staging procedure (nothing touches production)

1. **Create staging**: a Supabase **branch** or a second free project. Copy `pooja_days` into it
   (`pg_dump -t public.pooja_days` from production, restore to staging) so the same data shape is tested.
2. **Back up production anyway** (even though staging is separate): Dashboard > Database > Backups (take a manual
   backup / confirm the latest daily one) and `pg_dump --schema-only` + `pg_dump -t public.pooja_days` to a file
   kept outside the repo. Record the date.
3. **Apply to staging only**, in order: `supabase db push` (linked to staging) or paste migrations 1 to 5 in the SQL
   editor one at a time, stopping at the first error.
4. Create two Auth users on staging (an admin and an ordinary user); `insert into public.admin_users` for the admin.
5. Run `supabase/seed/poojas.seed.sql` (reviewed first with the temple); then `supabase/verification/post_migration_checks.sql`.
6. Run the end-to-end plan (`E2E_TEST_PLAN.md`) against staging.
7. Only after your explicit approval, repeat steps 3 and 5 on production.

## 3. Rollback

- **Staging:** run `supabase/rollback/rollback_all.sql` (drops everything the migrations created, never `pooja_days`;
  proven by test), then re-apply.
- **Production before any real booking:** the same script is safe (no booking data yet).
- **Production after bookings exist:** do NOT run it (it would delete bookings and audit logs). Instead disable the
  feature (set `PAYMENTS_LIVE` unset, deactivate poojas) and fix forward with a new migration, or restore the backup.
- `pooja_days` is never modified, so the existing site and calendar keep working in every case.

## 4. Things to confirm on first run

- `select` on every table as `anon` returns only what is intended (`post_migration_checks.sql` does this).
- The admin can call `admin_set_pooja_price` and a non-admin gets `forbidden`.
- `supabase db lint` reports no security warnings.
