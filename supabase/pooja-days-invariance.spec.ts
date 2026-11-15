/**
 * The existing production table must come out of migrations 1-5 AND the seed exactly as
 * it went in: same rows, columns, constraints, indexes, triggers, policies, RLS
 * setting, owner and grants. Reproduces the real project's state: RLS disabled, the
 * Supabase default grants on a table created before our migrations, 7 rows.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, migrationFiles } from "./testDb";

const db = new PGlite();
const q = (sql: string) => db.query<any>(sql);

async function snapshot() {
  const one = async (sql: string) => (await q(sql)).rows;
  return {
    rows: await one("select * from public.pooja_days order by date"),
    columns: await one(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'pooja_days' order by ordinal_position`,
    ),
    rel: await one(
      `select relacl::text acl, relrowsecurity rls, relforcerowsecurity forced,
              pg_get_userbyid(relowner) owner, relkind
         from pg_class where oid = 'public.pooja_days'::regclass`,
    ),
    grants: await one(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'pooja_days' order by 1, 2`,
    ),
    columnGrants: await one(
      `select grantee, column_name, privilege_type from information_schema.column_privileges
        where table_schema = 'public' and table_name = 'pooja_days' order by 1, 2, 3`,
    ),
    policies: await one(
      "select policyname from pg_policies where tablename = 'pooja_days'",
    ),
    triggers: await one(
      "select tgname from pg_trigger where tgrelid = 'public.pooja_days'::regclass and not tgisinternal",
    ),
    constraints: await one(
      "select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.pooja_days'::regclass order by 1",
    ),
    indexes: await one(
      "select indexname, indexdef from pg_indexes where tablename = 'pooja_days' order by 1",
    ),
    defaultAcl: await one(
      "select defaclobjtype, defaclacl::text from pg_default_acl order by 1",
    ),
  };
}

let before: Awaited<ReturnType<typeof snapshot>>;
let after: Awaited<ReturnType<typeof snapshot>>;
let afterSeed: Awaited<ReturnType<typeof snapshot>>;

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    -- the real table: created BEFORE our migrations, RLS disabled, 7 rows (2025-10-05 .. 2026-01-01)
    create table public.pooja_days (id bigserial primary key, date date not null unique, tithi text not null,
      paksha text not null, nakshatra text not null, labels text[] not null default '{}',
      source_provider text not null, fetched_at timestamptz not null default now());
    insert into public.pooja_days (date, tithi, paksha, nakshatra, source_provider) values
      ('2025-10-05','Dashami','Shukla','Rohini','x'),('2025-10-20','Trayodashi','Krishna','Hasta','x'),
      ('2025-11-01','Panchami','Shukla','Swati','x'),('2025-12-01','Ashtami','Krishna','Chitra','x'),
      ('2025-12-15','Purnima','Shukla','Pushya','x'),('2025-12-25','Dwadashi','Shukla','Mula','x'),
      ('2026-01-01','Chaturthi','Krishna','Magha','x');
  `);
  before = await snapshot();
  for (const f of migrationFiles())
    await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  after = await snapshot();
  await db.exec(
    readFileSync(join(__dirname, "seed", "poojas.seed.sql"), "utf8"),
  );
  afterSeed = await snapshot();
});

describe("public.pooja_days is untouched by migrations 1-5 and by the seed", () => {
  it("starts as the real project's state (sanity check of this test)", () => {
    expect(before.rows).toHaveLength(7);
    expect(before.rel[0].rls).toBe(false);
    expect(before.grants.length).toBeGreaterThan(0);
  });
  it("keeps all 7 rows, byte for byte", () => {
    expect(after.rows).toEqual(before.rows);
    expect(afterSeed.rows).toEqual(before.rows);
  });
  it("keeps its columns, constraints and indexes", () => {
    expect(after.columns).toEqual(before.columns);
    expect(after.constraints).toEqual(before.constraints);
    expect(after.indexes).toEqual(before.indexes);
  });
  it("keeps RLS exactly as it was (disabled): we neither enable nor force it", () => {
    expect(after.rel).toEqual(before.rel);
    expect(after.policies).toEqual([]);
    expect(after.triggers).toEqual([]);
  });
  it("keeps its grants and owner exactly as they were", () => {
    expect(after.grants).toEqual(before.grants);
    expect(after.columnGrants).toEqual(before.columnGrants);
    expect(afterSeed.rel).toEqual(before.rel);
  });
  it("does not change the project's default privileges", () => {
    expect(after.defaultAcl).toEqual(before.defaultAcl);
  });
  it("none of the migration or seed files names the table outside comments", () => {
    const files = [
      ...migrationFiles().map((f) => join(MIGRATIONS_DIR, f)),
      join(__dirname, "seed", "poojas.seed.sql"),
    ];
    for (const f of files) {
      const code = readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      expect([f, /pooja_days/.test(code)]).toEqual([f, false]);
    }
  });
  it("no migration drops, truncates or deletes from any table", () => {
    for (const f of migrationFiles()) {
      const code = readFileSync(join(MIGRATIONS_DIR, f), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      expect([
        f,
        /\b(drop\s+table|truncate\s+table|delete\s+from|drop\s+schema|alter\s+default\s+privileges|create\s+extension)/i.test(
          code,
        ),
      ]).toEqual([f, false]);
    }
  });
});

describe("optional pooja_days hardening script (separate approval)", () => {
  it("keeps the data readable by the public and the service role, and removes the write path", async () => {
    await db.exec(
      readFileSync(
        join(__dirname, "optional", "harden_pooja_days.sql"),
        "utf8",
      ),
    );
    const can = async (role: string, sql: string) => {
      await db.exec(`set role ${role}`);
      try {
        await db.query(sql);
        return true;
      } catch {
        return false;
      } finally {
        await db.exec("reset role");
      }
    };
    expect(await can("anon", "select count(*) from public.pooja_days")).toBe(
      true,
    );
    expect(
      (await q("select count(*)::int n from public.pooja_days")).rows[0].n,
    ).toBe(7);
    expect(await can("service_role", "select 1 from public.pooja_days")).toBe(
      true,
    );
    expect(await can("anon", "delete from public.pooja_days")).toBe(false);
    expect(
      await can("authenticated", "update public.pooja_days set tithi = 'x'"),
    ).toBe(false);
    expect(
      await can(
        "anon",
        "insert into public.pooja_days (date,tithi,paksha,nakshatra,source_provider) values ('2030-01-01','a','b','c','d')",
      ),
    ).toBe(false);
    expect(
      (await q("select count(*)::int n from public.pooja_days")).rows[0].n,
    ).toBe(7);
  });
});
