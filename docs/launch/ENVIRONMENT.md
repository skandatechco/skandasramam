# Environment variables (names verified against the code)

Never paste values into chat, commits or screenshots. Values come from Supabase Dashboard > Project Settings >
API (URL, `anon` key, `service_role` key) and from your Prokerala account.

| Name                                                                                          | Where               | Secret?          | Used by                                    | Notes                                                              |
| --------------------------------------------------------------------------------------------- | ------------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `SUPABASE_URL`                                                                                | server              | no               | `server/lib/supabase.ts`                   | `https://<project>.supabase.co`                                    |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                   | server only         | **YES**          | public booking + calendar routes           | bypasses RLS; never `VITE_`-prefixed; **not** used by `/api/admin` |
| `SUPABASE_ANON_KEY`                                                                           | server              | no (public)      | `/api/admin` (acts as the signed-in admin) | falls back to `VITE_SUPABASE_ANON_KEY`                             |
| `VITE_SUPABASE_URL`                                                                           | browser, build time | no               | admin sign-in                              | same URL                                                           |
| `VITE_SUPABASE_ANON_KEY`                                                                      | browser, build time | no (public)      | admin sign-in                              | **anon** key only; never the service-role key                      |
| `PROKERALA_CLIENT_ID` / `PROKERALA_CLIENT_SECRET` (aliases `PROKERALA_ID`/`PROKERALA_SECRET`) | server              | **YES** (secret) | `server/integrations/prokerala.ts`         | existing                                                           |
| `PROKERALA_API_TOKEN` (alias `PROKERALA_TOKEN`), `PROKERALA_BASE_URL`, `PROKERALA_TOKEN_URL`  | server              | token: YES       | same                                       | existing; optional overrides                                       |
| `PAYMENTS_LIVE`                                                                               | server              | no               | `server/lib/paymentConfig.ts`              | **leave UNSET**                                                    |
| `VITE_PAYMENT_QR_CONFIGURED`                                                                  | browser, build time | no               | `PaymentQR`                                | **leave UNSET**                                                    |
| `VITE_UPI_ID`                                                                                 | browser             | no               | `PaymentQR`                                | optional, supplied by the temple; leave unset                      |

## Vercel

Project > Settings > Environment Variables. Add the server and `VITE_` names above for **Preview** (point them at
the _staging_ Supabase project) and, later and only after approval, **Production**. Mark the service-role key and
Prokerala secrets _Sensitive_. Changing a `VITE_` variable needs a new build. Do **not** add `PAYMENTS_LIVE` or
`VITE_PAYMENT_QR_CONFIGURED` anywhere.

**Important:** Vercel builds run with `NODE_ENV=production`, so on a preview the payment-reference step is
refused (`PAYMENTS_UNAVAILABLE`), which is the safe behaviour. Test-mode payments (E2E steps 5 to 8) must therefore
be run **locally** against staging Supabase, not on the preview.

## Local development

1. Copy `.env.example` to `.env.local` (git-ignored via `*.local`; do not put secrets in `.env`).
2. Fill in the variables above using **staging** project values.
3. `pnpm dev` (port 8080). NODE_ENV is not production, so the test QR and test payment flow work, labelled
   "TEST QR: DO NOT PAY".

## Checks done

- Every name read by the code appears above; no other Supabase variable is expected.
- The service-role key is read only in `server/lib/supabase.ts`; a scan of the built client assets finds none (re-run after each build: `grep -rl service_role dist/spa`).
- `.env.example` documents names only.
