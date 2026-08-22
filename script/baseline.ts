/**
 * Rebuild `supabase/schema-baseline.sql` from the parts.
 *
 * ── The order is the whole job ────────────────────────────────────────────
 *
 * This file used to concatenate `readdirSync(...).sort()`, which is to say it
 * used alphabetical order and hoped. It held for months because production
 * already contained every helper function from its own history, so the baseline
 * was never actually applied to nothing. The first empty database refused it
 * immediately:
 *
 *     CREATE POLICY … USING (is_sakred_admin())
 *     → ERROR: function is_sakred_admin() does not exist
 *
 * The policies were part 04 and the functions they call were part 05. The
 * policy file even carried a comment saying so.
 *
 * So the order is declared here, with its reasons, and the filenames are
 * numbered to match — sort() and PARTS now agree, and if they ever stop
 * agreeing the completeness check below refuses to write the file rather than
 * emitting a baseline that assembles in an order nobody chose.
 *
 * ── What depends on what ──────────────────────────────────────────────────
 *
 *     extension  →  (nothing)
 *     table      →  types, referenced tables
 *     index      →  its table, its operator class → extension
 *     function   →  the tables its body reads      ← SQL bodies are validated
 *     RLS enable →  its table                        at CREATE time
 *     policy     →  its table, the functions it calls
 *
 * The last line is the one that bit. Everything above it is stated so the next
 * part added has somewhere obvious to go.
 *
 * Run: npm run db:baseline           writes the file
 *      npm run db:baseline -- --check   proves the checked-in file is current
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PART_DIR = join(ROOT, "supabase/baseline");
const BASELINE = join(ROOT, "supabase/schema-baseline.sql");

/**
 * Assembly order, and why each part sits where it does.
 *
 * A new part must be added here deliberately. Dropping a file into the
 * directory and letting the sort decide where it lands is exactly how the
 * policies ended up ahead of the functions.
 */
export const PARTS: { file: string; because: string }[] = [
  { file: "00-header.sql", because: "prose; creates nothing" },
  { file: "01-extensions.sql", because: "everything may depend on these; they depend on nothing" },
  { file: "02-drizzle-schema.sql", because: "tables, enums, constraints, indexes, foreign keys" },
  { file: "03-untracked-tables.sql", because: "the tables Drizzle does not model" },
  { file: "04-functions.sql", because: "SQL bodies are validated at CREATE time, so their tables must exist" },
  { file: "05-rls-enable.sql", because: "needs its tables; a table with RLS on and no policy yet is closed, not open" },
  { file: "06-rls-policies-a-m.sql", because: "calls the functions in 04" },
  { file: "06-rls-policies-n-z.sql", because: "calls the functions in 04" },
  {
    file: "07-constraints-and-indexes.sql",
    because: "needs every table and column; nothing needs it, which is why it can sit last",
  },
  { file: "08-triggers.sql", because: "needs both its table and its function" },
];

/** The generated part, written by `npm run db:baseline` and never by hand. */
export const GENERATED_PART = "02-drizzle-schema.sql";

/**
 * Read the parts and join them, refusing if the directory and the declared
 * order disagree in either direction.
 */
export function assembleBaseline(): string {
  const onDisk = readdirSync(PART_DIR).filter((f) => f.endsWith(".sql")).sort();
  const declared = PARTS.map((p) => p.file);

  const unaccounted = onDisk.filter((f) => !declared.includes(f));
  if (unaccounted.length) {
    throw new Error(
      `supabase/baseline holds ${unaccounted.join(", ")}, which the assembly order does not mention.\n` +
        `Add it to PARTS in script/baseline.ts at the position its dependencies require.`,
    );
  }
  const absent = declared.filter((f) => !onDisk.includes(f));
  if (absent.length) throw new Error(`the assembly order names ${absent.join(", ")}, which is not on disk`);

  return declared.map((f) => readFileSync(join(PART_DIR, f), "utf8")).join("\n");
}

/** Regenerate part 02 from `shared/schema.ts` via drizzle-kit. */
function regenerateDrizzlePart(): string {
  /*
    drizzle-kit's CJS loader cannot resolve the NodeNext `.js` specifiers the
    repository uses, so it reads a stripped copy rather than `shared/` itself.
  */
  const src = join(ROOT, ".baseline-src");
  const strip = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) strip(p);
      else if (p.endsWith(".ts")) {
        writeFileSync(p, readFileSync(p, "utf8").replace(/(from\s+"\.[^"]*?)\.js"/g, '$1"'));
      }
    }
  };

  rmSync(src, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  cpSync(join(ROOT, "shared"), join(src, "shared"), { recursive: true });
  strip(join(src, "shared"));

  rmSync(join(ROOT, ".baseline-out"), { recursive: true, force: true });
  execFileSync("npx", ["drizzle-kit", "generate", "--config=drizzle.baseline.config.ts"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  const generated = readdirSync(join(ROOT, ".baseline-out")).find((f) => f.endsWith(".sql"));
  if (!generated) throw new Error("drizzle-kit produced no SQL");
  return readFileSync(join(ROOT, ".baseline-out", generated), "utf8");
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const check = process.argv.includes("--check");
  const fresh = regenerateDrizzlePart();
  const partPath = join(PART_DIR, GENERATED_PART);

  if (check) {
    /*
      Two drifts, both reported by name. A generated part edited by hand is the
      one that survives a casual `git diff` — it looks like somebody fixing a
      column, and it disappears the next time this script runs.
    */
    const problems: string[] = [];
    if (readFileSync(partPath, "utf8") !== fresh) {
      problems.push(`${GENERATED_PART} is not what drizzle-kit currently produces from shared/schema.ts`);
    }
    if (readFileSync(BASELINE, "utf8") !== assembleBaseline()) {
      problems.push("supabase/schema-baseline.sql is not the current assembly of supabase/baseline/*");
    }
    if (problems.length) {
      console.error("\n✗ baseline drift\n");
      for (const p of problems) console.error(`    ${p}`);
      console.error("\n    Run: npm run db:baseline\n");
      process.exit(1);
    }
    console.log("✓ schema-baseline.sql is the current output of script/baseline.ts");
  } else {
    writeFileSync(partPath, fresh);
    const whole = assembleBaseline();
    writeFileSync(BASELINE, whole);
    console.log(
      `supabase/schema-baseline.sql — ${whole.split("\n").length} lines, ` +
        `${(whole.match(/CREATE TABLE/g) ?? []).length} tables, ` +
        `${(whole.match(/CREATE POLICY/g) ?? []).length} policies, ` +
        `${(whole.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length} functions`,
    );
  }
}
