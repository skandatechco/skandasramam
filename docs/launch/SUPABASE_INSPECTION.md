# Inspecting the existing Supabase project (read-only)

**Status:** I could not inspect it. The Supabase connector in this session requires an OAuth sign-in that has
not been completed, and I did not start it: that connector can also write, so I would rather you choose
when to grant access (a read-only token is possible, see option B). No credentials were requested or used.

## Option A: dashboard (no access for me needed)

1. Supabase dashboard > project `gtopilroirkphwmfuovv` > **SQL Editor** > New query.
2. Paste each block of `supabase/verification/inspect_existing_project.sql` (every statement is a `SELECT`)
   and run it. It reports tables and RLS, `pooja_days` columns, row count, earliest/latest date, missing days,
   blank values, every distinct tithi/paksha/nakshatra spelling, ambiguous rows, policies and privileges,
   existing functions/triggers/extensions, the **count** of Auth users (no emails or ids), migration history,
   and any name that would clash with the new tables.
3. Send back the results. Do not send API keys.
4. For the Panchangam review also export the table: **Table Editor > pooja_days > Export > CSV**, then run
   `npx tsx supabase/scripts/panchangam-review.ts pooja_days.csv review.md` on your machine (it reads the file
   only) and send `review.md`.
5. Check **Database > Backups** (daily backups on paid plans, Point-in-Time Recovery as an add-on) and
   **Authentication > Users** (see whether the administrators already have accounts).

## Option B: let me inspect it

Create a **read-only** access path and tell me; do not paste secrets in chat:

- Supabase connector: run the OAuth sign-in and choose a _read-only_ project scope, or
- create a Postgres role `inspector` with `grant select` on `public.pooja_days` and `pg_catalog` views only,
  and put its connection string in a local `.env.inspect` (git-ignored). I will only run `SELECT`s.

## What I need to learn

- Is `pooja_days` row-level-secured? (If RLS is off and `anon` has SELECT it is publicly readable: harmless
  for calendar data, but unexpected writes would be serious: check `anon`/`authenticated` have no INSERT/UPDATE.)
- Date coverage from today (the calendar and booking depend on it) and the spellings in use.
- Whether any table in the migration name-clash list already exists (query 14).
- Whether the supabase migration history table exists (decides how the migrations are applied).
