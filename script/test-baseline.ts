/**
 * The baseline is still the thing its generator produces, and still in an
 * order that can be applied.
 *
 * ── Why this runs without a database ──────────────────────────────────────
 *
 * `verify-from-zero` is the authoritative proof and it needs a QA branch, so
 * it is skipped on every machine that has not configured one — which is most
 * of them, and all of CI. That is the right shape for the expensive check and
 * the wrong shape for the cheap one: the bug that cost this repository its
 * ability to rebuild itself was a `.sort()`, and a sort can be caught by
 * reading two files.
 *
 * So the questions here are the ones answerable from disk:
 *
 *   · does the checked-in baseline match what the assembler produces now;
 *   · is every part accounted for in the declared order, and vice versa;
 *   · does anything appear in the file before the thing it depends on.
 *
 * The last is a static approximation of what Postgres will say out loud. It is
 * weaker than executing the file and it is available on every commit, which is
 * the trade being made deliberately.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
import { assembleBaseline, GENERATED_PART, PARTS } from "./baseline.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

// ─── The generated file is what the generator generates ──────────────────

const onDisk = readFileSync("supabase/schema-baseline.sql", "utf8");
let assembled = "";
let assemblyError = "";
try {
  assembled = assembleBaseline();
} catch (err) {
  assemblyError = (err as Error).message.split("\n")[0];
}

check("the parts assemble at all", assemblyError === "", assemblyError);
check(
  "supabase/schema-baseline.sql is the current assembly of supabase/baseline/*",
  assembled !== "" && assembled === onDisk,
  assembled === "" ? "" : `${onDisk.split("\n").length} lines on disk, ${assembled.split("\n").length} assembled`,
);

check("the generated part is named once, by the assembler", PARTS.some((p) => p.file === GENERATED_PART));
check("every part states why it sits where it does", PARTS.every((p) => p.because.length > 10));

/*
  Alphabetical order and the declared order agree today. They do not have to —
  PARTS is what the assembler reads — but a filename that sorts somewhere other
  than where it belongs is a trap for the next person who greps the directory
  instead of the script.
*/
check(
  "the filenames sort into the order they are applied in",
  JSON.stringify(PARTS.map((p) => p.file)) === JSON.stringify([...PARTS.map((p) => p.file)].sort()),
);

// ─── Nothing is used before it exists ────────────────────────────────────

const at = (needle: RegExp): number => onDisk.search(needle);
const first = (needle: RegExp): number => {
  const i = at(needle);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

/*
  The bug that started all of this, stated as an assertion. `is_sakred_admin`
  is called by 40-odd policies and defined once; if the definition ever moves
  back after the first call site, this fails here rather than on the next
  attempt to build an environment.
*/
const fnDefined = first(/CREATE OR REPLACE FUNCTION public\.is_sakred_admin/);
const fnUsed = first(/CREATE POLICY[^\n]*is_sakred_admin\(\)/);
check("is_sakred_admin is defined before the first policy calls it", fnDefined < fnUsed,
  `defined at ${fnDefined}, called at ${fnUsed}`);

const chanDefined = first(/CREATE OR REPLACE FUNCTION public\.can_see_channel/);
const chanUsed = first(/CREATE POLICY[^\n]*can_see_channel\(/);
check("and so is can_see_channel", chanDefined < chanUsed, `defined at ${chanDefined}, called at ${chanUsed}`);

check(
  "the extension is created before anything that could want it",
  first(/CREATE EXTENSION/) < first(/CREATE TABLE/),
);

/*
  Both trigger functions are plpgsql, so Postgres will not check their bodies
  at CREATE time — but a CREATE TRIGGER naming a function that does not exist
  fails immediately, and that is the check worth having.
*/
for (const fn of ["bump_reply_count", "tracked_habit_phase_freeze"]) {
  const def = first(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`));
  const use = first(new RegExp(`CREATE TRIGGER[^;]*EXECUTE FUNCTION ${fn}`));
  check(`${fn} exists before the trigger that runs it`, def < use, `defined at ${def}, used at ${use}`);
  check(`and ${fn} is actually attached to a trigger`, use !== Number.MAX_SAFE_INTEGER);
}

/*
  Every table a policy, an ALTER or an index names must have been created
  earlier in the file. This is the general form of the specific bug, and it is
  the check that catches the next one — a part added in the wrong place, a
  table moved between parts, a policy written for something that arrives in a
  migration rather than the baseline.
*/
const created = new Map<string, number>();
for (const m of onDisk.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?([a-z_]+)"?/g)) {
  if (!created.has(m[1])) created.set(m[1], m.index!);
}
const usedBeforeCreated: string[] = [];
for (const m of onDisk.matchAll(
  /(?:CREATE POLICY [a-z_"]+ ON|ALTER TABLE|CREATE (?:UNIQUE )?INDEX[^;]*? ON|CREATE TRIGGER[^;]*? ON) (?:public\.)?"?([a-z_]+)"?/g,
)) {
  const born = created.get(m[1]);
  if (born === undefined) usedBeforeCreated.push(`${m[1]} (never created)`);
  else if (born > m.index!) usedBeforeCreated.push(`${m[1]} (used at ${m.index}, created at ${born})`);
}
check("no table is altered, indexed or secured before it is created", usedBeforeCreated.length === 0,
  [...new Set(usedBeforeCreated)].slice(0, 6).join("; "));

// ─── The cutoff rule is still written down ───────────────────────────────

check("the cutoff rule is in the file rather than in somebody's memory",
  /PRE-BASELINE HISTORY/.test(onDisk));

// ─── No migration manages its own transaction ────────────────────────────

/*
  The caller wraps a migration file; the file must not wrap itself.

  A `COMMIT;` in the middle closes the transaction opened around the whole
  file, so everything after it — which is where the verification block lives —
  runs already committed. Demonstrated against QA rather than argued: a file
  shaped that way, whose verification raises, is reported as "rolled back"
  while the table it created is still there afterwards. Four migrations were
  written that way before anyone looked.

  script/qa-migrate.ts refuses such a file, but production is applied through
  the Management API and never sees that guard. This is the check that does.
*/
{
  /*
    Six module files predate the rule. They are already applied, and none of
    them has a statement after its final COMMIT — so the hazard is latent
    rather than live, and rewriting schema that is in production to close a
    latent hazard is a worse trade than naming it. Named, so that the list
    cannot grow quietly, and so a checked one growing a tail is caught.
  */
  const LEGACY_SELF_TRANSACTED = [
    "coaching-attachments.sql",
    "coaching-plans.sql",
    "habit-identity.sql",
    "offerings.sql",
    "telemetry.sql",
    "wins.sql",
  ];

  const files = readdirSync(resolve(ROOT, "supabase"))
    .filter((f) => f.endsWith(".sql") && !f.startsWith("schema-baseline"));
  const transacts = (body: string) => /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body);

  const offenders = files.filter(
    (f) => !LEGACY_SELF_TRANSACTED.includes(f) &&
      transacts(readFileSync(resolve(ROOT, "supabase", f), "utf8")),
  );
  check(
    "no migration opens or closes its own transaction",
    offenders.length === 0,
    `${offenders.join(", ")} — a COMMIT here ends the caller's transaction, and a verification after it cannot roll anything back`,
  );

  /* And the exceptions are still exceptions. */
  const healed = LEGACY_SELF_TRANSACTED.filter(
    (f) => !transacts(readFileSync(resolve(ROOT, "supabase", f), "utf8")),
  );
  check(
    "the legacy list names only files that still need naming",
    healed.length === 0,
    `${healed.join(", ")} no longer self-transacts — take it off the list`,
  );

  const grewATail = LEGACY_SELF_TRANSACTED.filter((f) => {
    const body = readFileSync(resolve(ROOT, "supabase", f), "utf8");
    const last = body.toUpperCase().lastIndexOf("\nCOMMIT;");
    return last >= 0 && body.slice(last + 8).replace(/--.*$/gm, "").trim().length > 0;
  });
  check(
    "and none of them has grown a statement after its last COMMIT",
    grewATail.length === 0,
    `${grewATail.join(", ")} — that statement is outside the transaction`,
  );
}

if (failures.length) {
  console.error("\n✗ baseline\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("\n    If the parts changed on purpose: npm run db:baseline\n");
  process.exit(1);
}
console.log(
  `✓ ${passed} baseline assertions passed (${PARTS.length} parts, ${created.size} tables, ` +
    `${onDisk.split("\n").length} lines)`,
);
