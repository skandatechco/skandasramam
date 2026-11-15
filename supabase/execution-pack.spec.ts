/**
 * Runs the paste-ready SQL Editor pack (supabase/execution) step by step on a database in
 * the existing project's state (public.pooja_days only, 7 rows, RLS off, Supabase default
 * grants) and checks that every verification passes, that the denied-write checks really
 * fail, and that the files on disk are exactly what the generator produces.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPack } from "./scripts/build-execution-pack";

const dir = join(__dirname, "execution");
const file = (n: string) => readFileSync(join(dir, n), "utf8");
const db = new PGlite();

/** rows of the last statement that returned any */
async function run(name: string) {
  const res = await db.exec(file(name));
  const withRows = res.filter((r) => r.rows.length);
  return withRows[withRows.length - 1]?.rows[0] as
    | Record<string, any>
    | undefined;
}
async function mustFail(name: string, re: RegExp) {
  let err: any;
  try {
    await db.exec(file(name));
  } catch (e) {
    err = e;
  } finally {
    await db.exec("rollback").catch(() => undefined);
    await db.exec("reset role");
  }
  expect(err, `${name} should fail`).toBeTruthy();
  expect(String(err.message)).toMatch(re);
}
const allOk = (row: Record<string, any>) =>
  Object.entries(row)
    .filter(([k]) => k.endsWith("_ok") && row[k] !== true)
    .map(([k]) => k);

let md5: string;

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create table public.pooja_days (id bigserial primary key, date date not null unique, tithi text not null,
      paksha text not null, nakshatra text not null, labels text[] not null default '{}',
      source_provider text not null, fetched_at timestamptz not null default now());
    insert into public.pooja_days (date, tithi, paksha, nakshatra, source_provider) values
      ('2025-10-05','Dashami','Shukla','Rohini','x'),('2025-10-20','Trayodashi','Krishna','Hasta','x'),
      ('2025-11-01','Panchami','Shukla','Swati','x'),('2025-12-01','Ashtami','Krishna','Chitra','x'),
      ('2025-12-15','Purnima','Shukla','Pushya','x'),('2025-12-25','Dwadashi','Shukla','Mula','x'),
      ('2026-01-01','Chaturthi','Krishna','Magha','x');
  `);
});

describe("the execution pack", () => {
  it("is exactly what the generator produces from the current migrations and seed (no drift)", () => {
    const pack = buildPack();
    expect(readdirSync(dir).sort()).toEqual(Object.keys(pack).sort());
    for (const [name, sql] of Object.entries(pack))
      expect([name, file(name)]).toEqual([name, sql]);
  });

  it("step 0 records the fingerprint of the existing table", async () => {
    const r = (await run("00_before_fingerprint.sql"))!;
    expect(r).toMatchObject({
      rows_in_pooja_days: 7,
      rls_enabled: false,
      policies: 0,
      public_tables: 1,
      public_functions: 0,
    });
    md5 = r.data_md5;
    expect(md5).toMatch(/^[0-9a-f]{32}$/);
  });

  it("the hardening verification FAILS before step A (so a skipped step cannot pass unnoticed)", async () => {
    const r = (await run("B5_verify_hardening.sql"))!;
    expect(allOk(r)).toEqual(
      expect.arrayContaining([
        "pooja_days_rls_on_ok",
        "pooja_days_public_read_only_ok",
      ]),
    );
  });

  it("step A + B: public read works, public and signed-in writes are denied, the service role is not blocked", async () => {
    const acl = async () =>
      (
        await db.query<any>(
          "select relacl::text a from pg_class where oid = 'public.pooja_days'::regclass",
        )
      ).rows[0].a;
    // the real project's ACL: every API role holds ALL privileges (arwdDxtm on Postgres 17)
    const aclBefore = await acl();
    expect(aclBefore).toMatch(/anon=[a-zA-Z]*r[a-zA-Z]*d[a-zA-Z]*[/]postgres/);
    expect(aclBefore).toMatch(
      /authenticated=[a-zA-Z]*r[a-zA-Z]*d[a-zA-Z]*[/]postgres/,
    );
    await db.exec(file("A_apply_pooja_days_hardening.sql"));
    const aclAfter = await acl();
    // exactly SELECT for the public roles: no write, no truncate, no references/trigger/maintain left behind
    expect(aclAfter).toContain("anon=r/postgres");
    expect(aclAfter).toContain("authenticated=r/postgres");
    // the service role (server-side updater) and the owner keep everything they had
    expect(aclAfter).toContain(
      aclBefore.match(/service_role=[a-zA-Z]+[/]postgres/)![0],
    );
    expect(aclAfter).toContain(
      aclBefore.match(/(?<=[{,])postgres=[a-zA-Z]+[/]postgres/)![0],
    );
    expect((await run("B1_anon_can_read.sql"))!.rows_visible_to_anon).toBe(7);
    await mustFail(
      "B2_anon_cannot_write.sql",
      /permission denied for table pooja_days/,
    );
    await mustFail(
      "B3_authenticated_cannot_write.sql",
      /permission denied for table pooja_days/,
    );
    expect((await run("B4_service_role_can_write.sql"))!.result).toBe(
      "service role can still write",
    );
    const r = (await run("B5_verify_hardening.sql"))!;
    expect(allOk(r)).toEqual([]);
    expect(r.data_md5).toBe(md5);
  });

  const steps: [string, string][] = [
    ["C_apply_migration_1.sql", "D_verify_after_migration_1.sql"],
    ["E_apply_migration_2.sql", "F_verify_after_migration_2.sql"],
    ["G_apply_migration_3.sql", "H_verify_after_migration_3.sql"],
    ["I_apply_migration_4.sql", "J_verify_after_migration_4.sql"],
    ["K_apply_migration_5.sql", "L_verify_after_migration_5.sql"],
  ];
  for (const [apply, verify] of steps) {
    it(`${apply} then ${verify}: every check passes and the 7 rows are unchanged`, async () => {
      await db.exec(file(apply));
      const r = (await run(verify))!;
      expect([verify, allOk(r)]).toEqual([verify, []]);
      expect(r.data_md5).toBe(md5);
    });
  }

  it("step M (seed) then step N: 30 poojas, ₹100 x13, ₹1,000 x17, 11 rules disabled, nothing else", async () => {
    await db.exec(file("M_run_catalogue_seed.sql"));
    const r = (await run("N_final_verification.sql"))!;
    expect(allOk(r)).toEqual([]);
    expect(r.data_md5).toBe(md5);
    expect(
      Object.keys(r).filter((k) => k.endsWith("_ok")).length,
    ).toBeGreaterThanOrEqual(24);
  });

  it("re-running the seed changes nothing (still all checks passing)", async () => {
    await db.exec(file("M_run_catalogue_seed.sql"));
    expect(allOk((await run("N_final_verification.sql"))!)).toEqual([]);
  });

  it("the final verification FAILS if a Panchangam rule is enabled or a price is missing", async () => {
    await db.exec(
      "update public.panchangam_pooja_rules set active = true where id = (select id from public.panchangam_pooja_rules limit 1)",
    );
    expect(allOk((await run("N_final_verification.sql"))!)).toContain(
      "panchangam_rules_all_disabled_ok",
    );
    await db.exec("update public.panchangam_pooja_rules set active = false");
    expect(allOk((await run("N_final_verification.sql"))!)).toEqual([]);
  });

  it("a failing migration leaves nothing behind (each file is one transaction)", async () => {
    const bad = new PGlite();
    await bad.exec("create table public.poojas (id int)");
    let failed = false;
    try {
      await bad.exec(file("C_apply_migration_1.sql"));
    } catch {
      failed = true;
      await bad.exec("rollback");
    }
    expect(failed).toBe(true);
    const t = await bad.query<any>(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1",
    );
    expect(t.rows.map((x) => x.relname)).toEqual(["poojas"]);
  });
});
