/**
 * What the public API roles can reach on a Supabase-like database (default
 * privileges reproduced by testDb), and that the migrations can be rolled back
 * cleanly on staging.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MIGRATIONS_DIR,
  createTestDb,
  migrationFiles,
  type TestDb,
} from "./testDb";

let t: TestDb;
const q = (sql: string, p?: any[]) => t.db.query<any>(sql, p);
beforeAll(async () => {
  t = await createTestDb({ withPoojaDays: true });
  await t.db.exec(
    "insert into public.pooja_days (date,tithi,paksha,nakshatra,source_provider) values ('2099-01-01','Trayodashi','Shukla','Rohini','x')",
  );
});

const callable = async (role: string) =>
  (
    await q(
      `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
        and has_function_privilege($1, p.oid, 'execute') order by 1`,
      [role],
    )
  ).rows.map((r) => r.proname);

describe("API surface", () => {
  it("anon can call no database function at all", async () => {
    expect(await callable("anon")).toEqual([]);
  });
  it("signed-in users can call only the admin functions and is_admin() (each re-checks admin rights)", async () => {
    expect(await callable("authenticated")).toEqual([
      "admin_booking_action",
      "admin_festival_create",
      "admin_festival_update",
      "admin_schedule_rule_set_active",
      "admin_set_pooja_price",
      "admin_special_schedule_create",
      "admin_special_schedule_update",
      "is_admin",
    ]);
  });
  it("the server's service role keeps what it needs (order numbers are a column default)", async () => {
    expect(await callable("service_role")).toContain("generate_order_no");
  });
  it("every security-definer function pins its search_path", async () => {
    const r = await q(
      `select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
          and not coalesce(proconfig::text, '') like '%search_path%'`,
    );
    expect(r.rows).toEqual([]);
  });
  it("API roles have no table privilege beyond the intended reads", async () => {
    for (const role of ["anon", "authenticated"]) {
      const r = await q(
        `select table_name, privilege_type from information_schema.role_table_grants
          where grantee = $1 and table_schema = 'public' and table_name <> 'pooja_days'
            and privilege_type <> 'SELECT'`,
        [role],
      );
      expect([role, r.rows]).toEqual([role, []]);
    }
  });
});

describe("post-migration check script", () => {
  it("runs without error and its must-be-empty checks are empty", async () => {
    const sql = readFileSync(
      join(__dirname, "verification", "post_migration_checks.sql"),
      "utf8",
    );
    const results = await t.db.exec(sql);
    // statements 1, 2, 3, 5 are documented as "expect 0 rows"
    for (const i of [0, 1, 2, 4]) expect([i, results[i].rows]).toEqual([i, []]);
    expect(results[5].rows).toHaveLength(6);
  });
});

describe("staging rollback script", () => {
  it("removes everything the migrations created and leaves pooja_days and its data untouched", async () => {
    await t.db.exec(
      readFileSync(join(__dirname, "rollback", "rollback_all.sql"), "utf8"),
    );
    const tables = (
      await q(
        "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','v','S') order by 1",
      )
    ).rows.map((r) => r.relname);
    expect(tables.filter((n) => !n.startsWith("pooja_days"))).toEqual([]);
    expect(
      (await q("select count(*)::int n from public.pooja_days")).rows[0].n,
    ).toBe(1);
    expect(
      (
        await q(
          "select proname from pg_proc where pronamespace = 'public'::regnamespace",
        )
      ).rows,
    ).toEqual([]);
  });
  it("can then be re-applied from scratch (the sequence is repeatable)", async () => {
    for (const f of migrationFiles())
      await t.db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    expect(
      (await q("select count(*)::int n from public.poojas")).rows[0].n,
    ).toBe(0);
  });
});
