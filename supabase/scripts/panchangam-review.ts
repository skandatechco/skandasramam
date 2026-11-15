/**
 * Offline Panchangam review. Input: a CSV export of public.pooja_days (Supabase
 * dashboard > Table Editor > Export, or the SQL in supabase/verification). Output: a
 * Markdown list of the dates that need manual verification.
 *
 *   npx tsx supabase/scripts/panchangam-review.ts pooja_days.csv [out.md]
 *
 * Reads the CSV and writes the report only; never connects to anything.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  reviewPanchangam,
  type DayRow,
  type ReviewPooja,
} from "../../server/lib/panchangamReview";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') ((f += '"'), i++);
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") (cur.push(f), (f = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(f);
      f = "";
      if (cur.some((x) => x !== "")) rows.push(cur);
      cur = [];
    } else f += c;
  }
  cur.push(f);
  if (cur.some((x) => x !== "")) rows.push(cur);
  const [head, ...rest] = rows;
  return rest.map((r) =>
    Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])),
  );
}

async function loadPoojas(): Promise<ReviewPooja[]> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `);
  for (const f of readdirSync(join(root, "migrations")).sort())
    await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  await db.exec(readFileSync(join(root, "seed", "poojas.seed.sql"), "utf8"));
  const poojas = (
    await db.query<any>(
      "select id, slug, name from public.poojas where type = 'panchangam' order by name",
    )
  ).rows;
  const rules = (
    await db.query<any>(
      "select pooja_id, tithis, paksha, nakshatras, start_time::text st from public.panchangam_pooja_rules",
    )
  ).rows;
  return poojas.map((p) => ({
    slug: p.slug,
    name: p.name,
    input: {
      type: "panchangam" as const,
      recurring: [],
      special: [],
      panchangamRules: rules
        .filter((r) => r.pooja_id === p.id)
        .map((r) => ({
          tithis: r.tithis,
          paksha: r.paksha,
          nakshatras: r.nakshatras,
          startTime: r.st,
        })),
    },
  }));
}

async function main() {
  const [csvPath, outPath] = process.argv.slice(2);
  if (!csvPath)
    throw new Error("usage: panchangam-review.ts pooja_days.csv [out.md]");
  const days: DayRow[] = parseCsv(readFileSync(csvPath, "utf8")).map((r) => ({
    date: r.date.slice(0, 10),
    tithi: r.tithi,
    paksha: r.paksha || null,
    nakshatra: r.nakshatra,
  }));
  const review = reviewPanchangam(days, await loadPoojas());
  const out: string[] = ["# Panchangam review (manual verification list)", ""];
  if (!review.range) out.push("No rows in the export.");
  else {
    out.push(
      `Data range: ${review.range.from} to ${review.range.to} (${review.range.days} rows)`,
      `Missing dates inside the range: ${review.missingDates.length}${review.missingDates.length ? " (" + review.missingDates.slice(0, 40).join(", ") + ")" : ""}`,
      "",
      "| Date | Observance | Why it needs checking |",
      "|---|---|---|",
      ...review.findings.map(
        (f) => `| ${f.date} | ${f.name} | ${f.reasons.join(" • ") || "—"} |`,
      ),
    );
  }
  const text = out.join("\n") + "\n";
  if (outPath) writeFileSync(outPath, text);
  else console.log(text);
}
main();
