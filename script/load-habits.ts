/**
 * Load the catalogue.
 *
 * ── Idempotent, keyed, and rerunnable ─────────────────────────────────────
 *
 * Matching is on `habit_key`, never on title. Titles are copy and copy gets
 * rewritten; the day somebody improves "Magnesium before bed" to "Evening
 * magnesium", a title-keyed loader inserts a second row and every member
 * tracking the first one silently stops matching. Running this twice must
 * change nothing, and running it after an edit must change exactly that edit.
 *
 * ── What it will not overwrite ────────────────────────────────────────────
 *
 * `published`, `routine_id` and `order_index` are left alone on rows that
 * already exist. Those are decisions somebody made in the admin, and a loader
 * that resets them turns "re-seed the catalogue" into "un-retire six habits
 * and reshuffle a routine".
 *
 * Nothing here touches tracked_habits, phases or entries. A member on a habit
 * whose wording changed keeps their contract, their history and their streak —
 * that is the whole reason the key exists.
 *
 * ── Two ways to run ───────────────────────────────────────────────────────
 *
 *   tsx script/load-habits.ts          validate, then write, in one transaction
 *   tsx script/load-habits.ts --sql    validate, then print the SQL instead
 *
 * The second exists because the database URL is a Vercel Sensitive variable
 * and does not exist on a laptop. Printing the statements means the same
 * validated, single-source-of-truth data can go through the Supabase console
 * without anybody hand-writing an INSERT.
 */

import { CATALOGUE, type CatalogueEntry } from "./habit-catalogue.js";
import { TRACKING_TYPES, AUTO_TRACKABLE } from "../shared/models/habitTracking.js";
import { LOAD_CLASSES, PRIORITY_LEVELS, TERRAIN_FITS } from "../shared/models/loadClass.js";

const TRACKING_IDS = new Set<string>(TRACKING_TYPES.map((t) => t.id));
const METRICS = new Set<string>(AUTO_TRACKABLE as readonly string[]);
// Read-only metrics a habit may point at even though nobody can type one.
const READ_ONLY_METRICS = new Set([
  "heartRateVariability",
  "restingHeartRate",
  "sleepDeepMinutes",
  "sleepRemMinutes",
  "weightKg",
  "vo2Max",
]);

// ─── Validation ────────────────────────────────────────────────────────────

/**
 * Every rule the database would enforce, checked before the transaction opens.
 *
 * A CHECK constraint rolling back 100 rows tells you one thing was wrong. This
 * tells you all of them, with the key attached, which is the difference
 * between one fix and eleven round trips.
 */
function validate(entries: CatalogueEntry[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const e of entries) {
    const at = `${e.key}`;

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.key)) {
      problems.push(`${at}: key must be lower-case kebab — it ends up in URLs and diffs`);
    }
    if (seen.has(e.key)) problems.push(`${at}: duplicate key`);
    seen.add(e.key);

    if (!e.title.trim()) problems.push(`${at}: no title`);
    if (e.title.length > 60) problems.push(`${at}: title is too long to sit on a card`);
    if (!e.short.trim()) problems.push(`${at}: no short description`);

    if (!TRACKING_IDS.has(e.tracking)) problems.push(`${at}: unknown tracking type ${e.tracking}`);

    // The pair the database enforces: a boolean has nothing to hit, and a
    // measured habit is meaningless without a number.
    if (e.tracking === "boolean" && e.target != null) {
      problems.push(`${at}: a boolean habit cannot carry a target`);
    }
    if (e.tracking !== "boolean" && (e.target == null || e.target <= 0)) {
      problems.push(`${at}: ${e.tracking} needs a positive target`);
    }

    if (e.metric && !METRICS.has(e.metric) && !READ_ONLY_METRICS.has(e.metric)) {
      problems.push(`${at}: ${e.metric} is not a metric we ingest`);
    }
    // A habit the phone answers but which is only ever done-or-not has nothing
    // for the health value to become.
    if (e.metric && e.tracking === "boolean") {
      problems.push(`${at}: a health-backed habit needs a number, not a tick`);
    }

    if (!LOAD_CLASSES.includes(e.load)) problems.push(`${at}: unknown load class ${e.load}`);
    for (const t of e.tags ?? []) {
      if (!LOAD_CLASSES.includes(t)) problems.push(`${at}: unknown load tag ${t}`);
      if (t === e.load) problems.push(`${at}: ${t} is already its primary load`);
    }
    if (!PRIORITY_LEVELS.includes(e.priority)) problems.push(`${at}: unknown priority`);
    if (e.fit && !TERRAIN_FITS.includes(e.fit)) problems.push(`${at}: unknown terrain fit`);

    if (e.maxPerWeek != null && (e.maxPerWeek < 1 || e.maxPerWeek > 21)) {
      problems.push(`${at}: maxPerWeek out of range`);
    }
    if (e.keywords.length < 2) {
      problems.push(`${at}: needs keywords — the picker searches them, and nobody types the title`);
    }

    // Copy rules, checked because a catalogue is where claims leak in.
    const copy = `${e.title} ${e.short}`.toLowerCase();
    for (const word of ["cure", "heal your", "detoxif", "boost your immune", "cortisol", "disease"]) {
      if (copy.includes(word)) problems.push(`${at}: copy makes a claim ("${word}")`);
    }
    if (/[a-z]_[a-z]/.test(copy)) problems.push(`${at}: copy contains a snake_case enum`);
  }

  return problems;
}

// ─── SQL ───────────────────────────────────────────────────────────────────

function q(v: string | null | undefined): string {
  if (v == null) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function arr(v: readonly string[] | undefined): string {
  if (!v || v.length === 0) return "NULL";
  return `ARRAY[${v.map(q).join(",")}]::text[]`;
}

function n(v: number | null | undefined): string {
  return v == null ? "NULL" : String(v);
}

function statementFor(e: CatalogueEntry): string {
  const cols = [
    q(e.key),
    q(e.title),
    q(e.short),
    q(e.emphasis),
    q(e.tracking),
    n(e.target),
    q(e.metric ?? null),
    q(e.load),
    arr(e.tags),
    q(e.priority),
    q(e.polarity ?? "strong"),
    q(e.time ?? "Anytime"),
    n(e.maxPerWeek),
    n(e.minutes),
    q(e.fit ?? null),
    arr(e.keywords),
  ].join(", ");

  return `(${cols})`;
}

function buildSql(entries: CatalogueEntry[]): string {
  const values = entries.map(statementFor).join(",\n  ");
  return `-- Generated by script/load-habits.ts from script/habit-catalogue.ts.
-- Do not hand-edit: rerun the script. Matching is on habit_key, so a reworded
-- title updates in place and every member tracking it keeps their contract.
-- habit_key carries a plain UNIQUE constraint rather than a partial index, so
-- ON CONFLICT needs no predicate here; NULL keys stay distinct from each other.
INSERT INTO routine_habits (
  habit_key, title, short_description, emphasis, tracking_type, default_target,
  health_metric, load_class, load_tags, priority_level, polarity_strength,
  recommended_time, max_per_week, duration_minutes, terrain_fit, search_keywords
) VALUES
  ${values}
ON CONFLICT (habit_key) DO UPDATE SET
  title             = EXCLUDED.title,
  short_description = EXCLUDED.short_description,
  emphasis          = EXCLUDED.emphasis,
  tracking_type     = EXCLUDED.tracking_type,
  default_target    = EXCLUDED.default_target,
  health_metric     = EXCLUDED.health_metric,
  load_class        = EXCLUDED.load_class,
  load_tags         = EXCLUDED.load_tags,
  priority_level    = EXCLUDED.priority_level,
  polarity_strength = EXCLUDED.polarity_strength,
  recommended_time  = EXCLUDED.recommended_time,
  max_per_week      = EXCLUDED.max_per_week,
  duration_minutes  = EXCLUDED.duration_minutes,
  terrain_fit       = EXCLUDED.terrain_fit,
  search_keywords   = EXCLUDED.search_keywords,
  updated_at        = now();
-- published, routine_id and order_index are deliberately absent: those are
-- decisions somebody made in the admin, and a re-seed must not undo them.
`;
}

// ─── Run ───────────────────────────────────────────────────────────────────

const problems = validate(CATALOGUE);
if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("\nNothing was written.\n");
  process.exit(1);
}

const restore = CATALOGUE.filter((e) => e.emphasis === "yin").length;
const build = CATALOGUE.length - restore;

if (process.argv.includes("--sql")) {
  console.log(buildSql(CATALOGUE));
  process.exit(0);
}

console.log(`\n${CATALOGUE.length} habits validated — ${restore} Restore, ${build} Build.\n`);

const url = process.env.SAKREDBODY_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log(
    "No database URL in this environment (it's a Vercel Sensitive variable).\n" +
      "Run with --sql and apply the output through the Supabase console.\n",
  );
  process.exit(0);
}

const { db } = await import("../server/db.js");
await db.execute(buildSql(CATALOGUE) as never);
console.log("Written.\n");
process.exit(0);
