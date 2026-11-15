/**
 * Test helper: a clean in-process Postgres (PGlite) with a stand-in for Supabase's
 * platform objects (auth schema, auth.uid(), auth.jwt(), roles), onto which the
 * REAL migration files are applied in order. Nothing here touches any real database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect } from "vitest";

export const ADMIN = "00000000-0000-0000-0000-0000000000a1";
export const OTHER_ADMIN = "00000000-0000-0000-0000-0000000000a2";
export const USER = "00000000-0000-0000-0000-0000000000b1";
export const EMAILS: Record<string, string> = {
  [ADMIN]: "admin@example.com",
  [OTHER_ADMIN]: "second@example.com",
  [USER]: "user@example.com",
};

export const MIGRATIONS_DIR = join(__dirname, "migrations");
export const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

export interface TestDb {
  db: PGlite;
  /** run `fn` as a Supabase role (and optionally as a signed-in user) */
  as<T>(
    role: "anon" | "authenticated",
    uid: string | null,
    fn: () => Promise<T>,
  ): Promise<T>;
}

export async function createTestDb(
  opts: { withPoojaDays?: boolean } = {},
): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    insert into auth.users values
      ('${ADMIN}', 'admin@example.com'), ('${OTHER_ADMIN}', 'second@example.com'), ('${USER}', 'user@example.com');
  `);
  if (opts.withPoojaDays) {
    // Stand-in for the pre-existing production table (must survive untouched).
    await db.exec(`
      create table public.pooja_days (id bigserial primary key, date date not null unique, tithi text not null,
        paksha text not null, nakshatra text not null, labels text[] not null default '{}',
        source_provider text not null, fetched_at timestamptz not null default now());
    `);
  }
  // Supabase grants every new table/function in public to the API roles by default;
  // reproduce that, so the tests prove the migrations REVOKE what must not be exposed.
  await db.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  for (const f of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  }
  await db.exec(
    `insert into public.admin_users values ('${ADMIN}', '${EMAILS[ADMIN]}'), ('${OTHER_ADMIN}', '${EMAILS[OTHER_ADMIN]}');`,
  );

  async function as<T>(
    role: "anon" | "authenticated",
    uid: string | null,
    fn: () => Promise<T>,
  ) {
    await db.exec(
      `reset role;
       select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);
       select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, email: EMAILS[uid] ?? "" }) : "{}"}', false);
       set role ${role};`,
    );
    try {
      return await fn();
    } finally {
      // Leave no identity behind: SQL run afterwards (seeding / the SQL editor)
      // has no JWT, exactly like an operator session on a real project.
      await db.exec(
        `reset role;
         select set_config('request.jwt.claim.sub', '', false);
         select set_config('request.jwt.claims', '{}', false);`,
      );
    }
  }
  return { db, as };
}

export const denied = (p: Promise<unknown>) =>
  expect(p).rejects.toThrow(/permission denied|row-level security|violates/i);
