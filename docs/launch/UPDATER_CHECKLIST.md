# Is there an external Panchangam updater? (read-only checklist)

Goal: find whatever wrote the 7 `pooja_days` rows, and the key it uses. Step A is safe for a service-role or `postgres` updater and
would block an anon-key or authenticated-user updater. This repo contains **no** writer (it only reads `pooja_days`).

Tick each; note "none" where nothing exists.

1. **Edge Functions**: Dashboard > Edge Functions. Any function whose name or code mentions panchang, pooja, prokerala, nakshatra?
   Open its code: look for `createClient(`; which key does it use? `SUPABASE_SERVICE_ROLE_KEY` = fine; `SUPABASE_ANON_KEY` = must change first.
2. **Cron**: Dashboard > Integrations > Cron (or Database > Extensions: is `pg_cron` enabled?). List jobs; open any that call an Edge Function or
   an HTTP URL. SQL (read-only): `select jobid, jobname, schedule, left(command, 300) from cron.job;` (an error "relation cron.job does not exist" = no pg_cron).
3. **Database Webhooks / Triggers**: Dashboard > Database > Webhooks and > Triggers. Anything on `pooja_days`? (Expected: nothing; inspection showed no functions.)
4. **Extensions**: `select extname from pg_extension order by 1;` Note `pg_net` / `http` (outbound calls) and `pg_cron`.
5. **What the rows say**: `select source_provider, count(*), min(fetched_at), max(fetched_at) from public.pooja_days group by 1;`
   The `fetched_at` range shows when the updater last ran (rows only run to 2026-01-01, so it may have stopped or was a one-off import).
6. **Outside Supabase**: Vercel (this project or another) > Settings > Cron Jobs and Environment Variables: any `SUPABASE_*`/`PROKERALA_*` variables
   on a project other than the website? GitHub Actions / scheduled workflows in the repository (`.github/workflows` - none in the clone) or another repository?
   A laptop script, a Builder.io integration, or a manual CSV import via the dashboard?
7. **Dashboard logs**: Logs > API Edge Logs, filter path `/rest/v1/pooja_days`, method POST/PATCH: which role (`apikey` role claim shows `anon` / `service_role`)
   made the last writes? (Log retention is limited; an empty result is itself informative.)
8. **Decide**:
   - Nothing found / manual imports from the dashboard (these use the `postgres` role): proceed with step A.
   - Updater uses the service-role key: proceed with step A.
   - Updater uses the anon key or a user JWT: do **not** run step A. Move it to the service-role key (server side only) first.

Tell me the result of each item (one line each) before running step A.
