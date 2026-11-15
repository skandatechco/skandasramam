/**
 * Builds supabase/execution/*.sql: the exact, paste-ready SQL Editor pack for applying
 * the hardening, migrations 1-5 and the seed to the existing project, each step followed
 * by a verification that returns ONE row of true/false checks.
 *
 *   npx tsx supabase/scripts/build-execution-pack.ts
 *
 * supabase/execution-pack.spec.ts regenerates the pack in memory, compares it with the
 * files on disk (so they cannot drift from the migrations) and RUNS the whole sequence
 * on a database in the project's current state.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

export const TABLES_AFTER: Record<number, string[]> = {
  1: ["admin_users", "panchangam_pooja_rules", "pooja_days", "poojas", "recurring_pooja_schedule", "special_pooja_schedule"],
  2: ["bookings"],
  3: ["booking_audit_log"],
  4: ["pooja_price_audit_log", "schedule_audit_log"],
  5: ["festival_offerings"],
};
export const FUNCTIONS_ADDED: Record<number, string[]> = {
  1: ["is_admin", "set_updated_at"],
  2: ["generate_order_no", "protect_booking_snapshot", "stamp_payment_verification"],
  3: ["admin_booking_action", "forbid_audit_change"],
  4: [
    "_require_admin", "_set_audit_context", "admin_schedule_rule_set_active", "admin_set_pooja_price",
    "admin_special_schedule_create", "admin_special_schedule_update", "log_pooja_price_change", "log_schedule_change",
  ],
  5: ["admin_festival_create", "admin_festival_update", "enforce_festival_booking", "sync_festival_to_pooja"],
};
const MIGRATION_FILES = [
  "20261115000001_admin_users_and_poojas.sql",
  "20261115000002_bookings.sql",
  "20261115000003_admin_audit_and_actions.sql",
  "20261115000004_pricing_and_schedule_admin.sql",
  "20261115000005_festival_offerings.sql",
];

const upTo = (m: Record<number, string[]>, n: number) =>
  Object.entries(m)
    .filter(([k]) => Number(k) <= n)
    .flatMap(([, v]) => v)
    .sort();
const arr = (xs: string[]) =>
  `array[${xs.map((x) => `'${x}'`).join(", ")}]::text[]`;

const banner = (title: string, lines: string[]) =>
  [
    "-- ============================================================================",
    `-- ${title}`,
    ...lines.map((l) => `-- ${l}`),
    "-- ============================================================================",
    "",
  ].join("\n");

/** One-row verification; every column ending in _ok must be true. migrations = 0: pooja_days only. */
function verify(step: string, migrations: number, extra = ""): string {
  const tables = upTo(TABLES_AFTER, migrations);
  const funcs = upTo(FUNCTIONS_ADDED, migrations);
  const cols: string[] = [
    `(select count(*) from public.pooja_days) = 7 as pooja_days_7_rows_ok`,
    `(select md5(string_agg(t::text, '|' order by date)) from public.pooja_days t) as data_md5`,
    `(select relrowsecurity from pg_class where oid = 'public.pooja_days'::regclass) as pooja_days_rls_on_ok`,
    `(select coalesce(string_agg(distinct a.privilege_type, ',' order by a.privilege_type), '')
       from pg_class c, aclexplode(c.relacl) a
      where c.oid = 'public.pooja_days'::regclass
        and a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))) = 'SELECT' as pooja_days_public_read_only_ok`,
    `has_table_privilege('service_role', 'public.pooja_days', 'INSERT')
      and has_table_privilege('service_role', 'public.pooja_days', 'UPDATE') as service_role_can_still_write_ok`,
  ];
  if (migrations > 0)
    cols.push(
      `(select array_agg(relname::text order by relname) from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r') = ${arr(tables)} as tables_exact_ok`,
      `(select coalesce(array_agg(proname::text order by proname), '{}'::text[]) from pg_proc
        where pronamespace = 'public'::regnamespace) = ${arr(funcs)} as functions_exact_ok`,
      `(select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
         and relname <> 'pooja_days' and not relrowsecurity) = 0 as new_tables_have_rls_ok`,
      `(select count(*) from information_schema.role_table_grants
        where table_schema = 'public' and table_name <> 'pooja_days'
          and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT') = 0 as no_api_writes_ok`,
    );
  return (
    banner(`${step}: READ-ONLY verification`, [
      "Run it. Every column ending in _ok must be TRUE, and data_md5 must equal the md5 you",
      "saved in step 0. Anything else: STOP and report.",
    ]) +
    "select\n  " +
    cols.join(",\n  ") +
    extra +
    ";\n"
  );
}

const FINAL_EXTRA = `,
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
     and (trigger_name like '%append_only%' or trigger_name like '%no_truncate%')) = 6          as audit_triggers_ok`;

export function buildPack(): Record<string, string> {
  const pack: Record<string, string> = {};

  pack["00_before_fingerprint.sql"] =
    banner("STEP 0: fingerprint of public.pooja_days BEFORE anything changes (read-only)", [
      "Run it and SAVE the whole result row (screenshot or copy) next to the CSV export.",
      "data_md5 is what every later verification must reproduce.",
    ]) +
    `select
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
`;

  pack["A_apply_pooja_days_hardening.sql"] =
    banner("STEP A: pooja_days hardening (public read; no public/authenticated writes)", [
      "Changes ONLY grants and the RLS flag on public.pooja_days. No row is touched.",
      "The service role (the trusted server-side updater) bypasses RLS and keeps its privileges.",
      "Reverse (only if needed): alter table public.pooja_days disable row level security;",
      "  drop policy \"pooja_days: public read\" on public.pooja_days;  then: grant all on public.pooja_days to anon, authenticated;  (restores the original ACL).",
    ]) + read("optional", "harden_pooja_days.sql").replace(/^--[\s\S]*?\n(?=begin;)/, "");

  pack["B1_anon_can_read.sql"] =
    banner("STEP B1: the public can still READ pooja_days", ["Expect: one row, rows_visible_to_anon = 7."]) +
    `begin;
set local role anon;
select count(*) as rows_visible_to_anon from public.pooja_days;
rollback;
`;
  pack["B2_anon_cannot_write.sql"] =
    banner("STEP B2: the public CANNOT write", [
      "Expect an ERROR: permission denied for table pooja_days.  (The error is the PASS.)",
      "If it says 'Success. No rows returned' the hardening did NOT work: STOP.",
      "'where false' guarantees that even a wrong result changes no row.",
    ]) +
    `begin;
set local role anon;
delete from public.pooja_days where false;
rollback;
`;
  pack["B3_authenticated_cannot_write.sql"] =
    banner("STEP B3: a signed-in user CANNOT write", ["Expect an ERROR: permission denied for table pooja_days.  (The error is the PASS.)"]) +
    `begin;
set local role authenticated;
update public.pooja_days set tithi = tithi where false;
rollback;
`;
  pack["B4_service_role_can_write.sql"] =
    banner("STEP B4: the server-side updater (service role) is NOT blocked", [
      "Expect: Success, 0 rows affected (no error). Changes nothing.",
    ]) +
    `begin;
set local role service_role;
update public.pooja_days set tithi = tithi where false;
rollback;
select 'service role can still write' as result;
`;
  pack["B5_verify_hardening.sql"] = verify("STEP B5 (after A)", 0);

  const names = ["admin_users_and_poojas", "bookings", "admin_audit_and_actions", "pricing_and_schedule_admin", "festival_offerings"];
  const letters: [string, string][] = [["C", "D"], ["E", "F"], ["G", "H"], ["I", "J"], ["K", "L"]];
  MIGRATION_FILES.forEach((file, i) => {
    const n = i + 1;
    const [apply, check] = letters[i];
    pack[`${apply}_apply_migration_${n}.sql`] =
      banner(`STEP ${apply}: apply migration ${n} (${names[i]})`, [
        "Paste and run once. It is one transaction: if any statement fails NOTHING from this file is kept.",
        "Expect: Success. On any error: STOP and send me the exact message.",
      ]) + `begin;\n\n${read("migrations", file).trimEnd()}\n\ncommit;\n`;
    pack[`${check}_verify_after_migration_${n}.sql`] = verify(`STEP ${check} (after migration ${n})`, n);
  });

  pack["M_run_catalogue_seed.sql"] =
    banner("STEP M: catalogue seed (poojas, standard rates, schedules; Panchangam rules DISABLED)", [
      "It has its own begin/commit. Safe to re-run. Expect: Success.",
    ]) + read("seed", "poojas.seed.sql");
  pack["N_final_verification.sql"] = verify("STEP N (final)", 5, FINAL_EXTRA);
  return pack;
}

if (process.argv[1] && process.argv[1].endsWith("build-execution-pack.ts")) {
  const dir = join(root, "execution");
  mkdirSync(dir, { recursive: true });
  const pack = buildPack();
  for (const [name, sql] of Object.entries(pack)) writeFileSync(join(dir, name), sql);
  console.log(`wrote ${Object.keys(pack).length} files to supabase/execution`);
}
