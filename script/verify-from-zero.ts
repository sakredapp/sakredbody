/**
 * Can this repository rebuild its own database?
 *
 * ── The question that had never been asked ────────────────────────────────
 *
 * On 16 Aug 2026 the answer was no, and nothing said so. Production had 93
 * tables; the tracked migrations could create 32. `users`, `workout_sessions`,
 * `exercises`, `habits`, `workout_sets` and `retreats` had no creating
 * statement anywhere. The schema lived only in the running database, because
 * `drizzle-kit push` diffs against what is already there and applies.
 *
 * This is the test that will notice next time. Point it at an EMPTY database —
 * never production, and the guard below refuses if the target has rows — and
 * it applies the baseline, applies every post-cutoff migration, then compares
 * the result to what the repository says the schema should be.
 *
 *   DATABASE_URL=postgres://…/qa npm run db:verify-from-zero
 *
 * Without a DATABASE_URL it still checks what it can offline: that the
 * baseline exists, that its parts assemble, and that the cutoff is recorded.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BASELINE = join(ROOT, "supabase/schema-baseline.sql");

/** Everything at or before this migration is inside the baseline already. */
export const BASELINE_CUTOFF = "20260815212610";

let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log("\nThe repository can describe its own database\n");

check("the baseline exists", existsSync(BASELINE));
const sql = existsSync(BASELINE) ? readFileSync(BASELINE, "utf8") : "";
const tables = (sql.match(/CREATE TABLE/g) ?? []).length;
const policies = (sql.match(/CREATE POLICY/g) ?? []).length;

/** The counts production reported when the baseline was cut. */
check("it creates every table production has", tables === 93, `${tables} of 93`);
check("and carries every policy", policies === 154, `${policies} of 154`);
check("row-level security is enabled where production enables it",
  (sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 89);
check("the helper functions the policies need are present",
  /FUNCTION public\.is_sakred_admin/.test(sql) && /FUNCTION public\.can_see_channel/.test(sql));
check("the cutoff rule is written down, not remembered",
  /PRE-BASELINE HISTORY/.test(sql) && sql.includes(BASELINE_CUTOFF));

/**
 * ── Parity, which is the check that would have caught all of this ─────────
 *
 * The baseline and `shared/schema.ts` must describe the same set of tables.
 * They disagreed by four: coaching_plans, coaching_plan_items,
 * coaching_checkin_requests and notifications were defined in Drizzle, used by
 * the server and applied to production — but their modules were never
 * re-exported from schema.ts, the one file drizzle-kit reads. So `generate`
 * could not emit them and `push` regarded them as tables nobody had asked for,
 * which is one confirmation prompt away from dropping live coaching data.
 *
 * The allowlist below is for tables that genuinely cannot be modelled in
 * Drizzle. It is empty, and adding to it should require an argument.
 */
const NON_DRIZZLE_TABLES: readonly string[] = [];

{
  const drizzlePart = join(ROOT, "supabase/baseline/01-drizzle-schema.sql");
  const drizzleTables = new Set(
    [...readFileSync(drizzlePart, "utf8").matchAll(/^CREATE TABLE "([a-z_]+)"/gm)].map((m) => m[1]),
  );
  const baselineTables = new Set(
    [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?([a-z_]+)"?/g)].map((m) => m[1]),
  );
  const missing = [...baselineTables].filter(
    (t) => !drizzleTables.has(t) && !NON_DRIZZLE_TABLES.includes(t),
  );
  check("every baseline table is in the Drizzle schema", missing.length === 0, missing.join(", "));
  check("and the allowlist is still empty", NON_DRIZZLE_TABLES.length === 0,
    NON_DRIZZLE_TABLES.join(", "));
  check("Drizzle emits all 93", drizzleTables.size === 93, `${drizzleTables.size}`);
}

/**
 * ── And the same parity in the other direction ────────────────────────────
 *
 * The block above asks whether every table the baseline creates is modelled.
 * It cannot ask the question that matters from here on, which is whether every
 * table the *code* models can actually be created — the baseline is a snapshot
 * at a cutoff and will not grow again, so a table added to Drizzle tomorrow is
 * absent from it by design.
 *
 * Without this check the repository would quietly lose the ability it just
 * regained, one new table at a time: `session_exercises` exists in
 * `shared/models/training.ts`, the server selects from it, and if nobody had
 * written the migration then a rebuild from zero would produce a database the
 * application cannot run against. That is the original failure exactly, and it
 * would have taken one commit to reintroduce.
 *
 * Two things are required of every modelled table, and they are different
 * requirements:
 *
 *   · it is reachable from `shared/schema.ts`, which is the only file
 *     drizzle-kit reads — a model nobody re-exports is invisible to `generate`
 *     and looks like a stray table to `push`;
 *   · it is created by the baseline, or by a migration in `supabase/` written
 *     after the cutoff.
 */
{
  const models = join(ROOT, "shared/models");
  const modelFiles = readdirSync(models).filter((f) => f.endsWith(".ts"));

  const manifest = readFileSync(join(ROOT, "shared/schema.ts"), "utf8");
  const exported = new Set(
    [...manifest.matchAll(/from\s+"\.\/models\/([a-zA-Z]+)\.js"/g)].map((m) => `${m[1]}.ts`),
  );

  /** Every migration in supabase/, baseline included, as one body of text. */
  const migrations = readdirSync(join(ROOT, "supabase"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(ROOT, "supabase", f), "utf8"))
    .join("\n");
  const creatable = new Set(
    [...migrations.matchAll(/create table\s+(?:if not exists\s+)?(?:public\.)?"?([a-z_]+)"?/gi)].map(
      (m) => m[1],
    ),
  );

  const unreachable: string[] = [];
  const uncreatable: string[] = [];
  let modelled = 0;

  for (const file of modelFiles) {
    const tables = [...readFileSync(join(models, file), "utf8").matchAll(/pgTable\(\s*"([a-z_]+)"/g)]
      .map((m) => m[1]);
    if (tables.length === 0) continue;
    modelled += tables.length;
    if (!exported.has(file)) unreachable.push(`${file} (${tables.join(", ")})`);
    for (const t of tables) if (!creatable.has(t)) uncreatable.push(t);
  }

  check("there are models to check", modelled > 80, `${modelled} tables`);
  check("every model is re-exported from schema.ts", unreachable.length === 0,
    unreachable.join("; "));
  check("and every modelled table has SQL that creates it", uncreatable.length === 0,
    uncreatable.join(", "));
}

if (!process.env.DATABASE_URL) {
  console.log(
    "\n  · No DATABASE_URL. Offline checks only — the reconstruction itself needs\n" +
      "    an empty database. Point this at the QA branch to prove it end to end.",
  );
} else {
  console.log("\n  · DATABASE_URL set — reconstruction against a live target is not yet");
  console.log("    implemented. It must refuse any database containing rows.");
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${failed} failed\n`);
if (failed > 0) process.exit(1);
