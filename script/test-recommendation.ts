/**
 * The learning loop is wired to something.
 *
 * ── Why the call-site assertions are the important half ───────────────────
 *
 * Four modules were found this cycle in the state of existing, compiling,
 * being imported and passing their own tests, while the application never
 * executed them: the tour anchor that never reached the DOM, the rehearsal
 * barrier wired to nothing, the resume reconstruction, and the coach tour
 * extension. Each looked finished from the inside.
 *
 * A recommendation recorder is the same shape of thing — pure to test, easy to
 * leave unplugged, and silent when it is. So most of what follows is not about
 * whether `record()` works. It is about whether anything calls it, whether the
 * thumbs are attached to output an engine actually chose, and whether the
 * columns the migration creates are the columns the model writes.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  RECOMMENDATION_TYPES,
  ENGINE_OF,
  FEEDBACK_REASONS,
  REASON_CODES,
  recommendationVersions,
  recommendationEvents,
  recommendationFeedback,
} from "../shared/models/recommendation.js";
import { readReadiness, suggestToday } from "../shared/models/recommend.js";
import { readTerrain, composeTerrainNow } from "../shared/models/terrain.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const CODES = new Set<string>(REASON_CODES);

// ─── 1. Every ground an engine cites is in the vocabulary ─────────────────

/*
  The failure this catches is a new branch in readReadiness that scores the day
  and pushes a code nobody added to the list. It would type-check — the array
  is typed — but only because the author would have had to add it. The real
  risk is the opposite: a branch that scores and pushes *nothing*, which no
  type can see. So the codes are checked against real inputs rather than read
  off the source.
*/
{
  const cases = [
    { sleepMinutes: 240, sleepBaselineMinutes: 460, restingHeartRate: 62, restingHeartRateBaseline: 54 },
    { hrv: 30, hrvBaseline: 60, hardSessionsRecently: 3 },
    { terrainLean: -3, cycleLean: -1 },
    { terrainLean: 2, daysSinceLastSession: 5, sleepMinutes: 520, sleepBaselineMinutes: 460 },
    {},
  ];
  for (const [i, signals] of cases.entries()) {
    const r = readReadiness(signals);
    check(
      `readiness case ${i}: every code is in the vocabulary`,
      r.codes.every((c) => CODES.has(c)),
      r.codes.filter((c) => !CODES.has(c)).join(", "),
    );
    check(`readiness case ${i}: a scored day names its grounds`, r.codes.length > 0);
  }

  /* Nothing known must say so, rather than say nothing. */
  check("no signals is recorded as no_signals", readReadiness({}).codes.includes("no_signals"));
  check(
    "…and a read with signals never claims it",
    !readReadiness({ terrainLean: -3 }).codes.includes("no_signals"),
  );
}

// ─── 2. …including every reason terrain composes ──────────────────────────

{
  const measured = readTerrain({
    sleepRecent: 300, sleepBaseline: 460,
    hrvRecent: 30, hrvBaseline: 60,
    rhrRecent: 60, rhrBaseline: 52,
    trainedCategories: ["strength", "conditioning", "strength"],
    daysSinceLastSession: 1,
  });
  check(
    "every measured terrain reason carries a known code",
    measured.reasons.length > 0 && measured.reasons.every((r) => CODES.has(r.code)),
  );

  const composed = composeTerrainNow({
    measured,
    reported: { energy: 1, recovery: 1, nervousSystem: 2, drive: 1, mentalClarity: 2 },
  });
  const reported = composed.reasons.filter((r) => r.source === "reported");
  check("the reported reason carries a code too", reported.length === 1 && CODES.has(reported[0]!.code));
}

// ─── 3. A suggestion says why it was selected ─────────────────────────────

{
  const r = readReadiness({ terrainLean: -3 });
  const three = suggestToday({ read: r, recentCategories: ["strength", "conditioning"] });
  check("three options", three.length === 3, String(three.length));
  for (const s of three) {
    check(`${s.category}: names its grounds`, s.codes.length > 0);
    check(`${s.category}: every code known`, s.codes.every((c) => CODES.has(c)));
    check(`${s.category}: fit is always cited`, s.codes.includes("slot_fit"));
    /*
      The read's grounds travel with the option. Without this, a 👎 on a
      recommendation made on three hours of sleep would be indistinguishable
      from a 👎 on one made with no signals at all.
    */
    check(`${s.category}: carries the read's grounds`, r.codes.every((c) => s.codes.includes(c)));
  }

  /* Novelty is claimed only when it did work. */
  const noHistory = suggestToday({ read: r, recentCategories: [] });
  check(
    "with no history, nothing claims a novelty nudge",
    noHistory.every((s) => !s.codes.includes("novelty_nudge")),
  );
}

// ─── 4. No reason code carries a measurement ──────────────────────────────

/*
  The whole privacy argument for codes rests on this. `sleep_deficit_large` is
  a fact about a decision; `sleep_5h` would be a health value in a table with
  no health policy looking at it.
*/
check(
  "no reason code contains a number",
  REASON_CODES.every((c) => !/\d/.test(c)),
  REASON_CODES.filter((c) => /\d/.test(c)).join(", "),
);

// ─── 5. Deterministic output is recorded as deterministic ─────────────────

for (const type of RECOMMENDATION_TYPES) {
  const v = recommendationVersions(type);
  check(`${type}: has an engine`, !!ENGINE_OF[type]);
  check(`${type}: names its decision logic`, v.decisionLogicVersion.startsWith(`${ENGINE_OF[type]}@`));
  check(
    `${type}: claims no model`,
    v.modelProvider === null && v.modelId === null && v.promptVersion === null,
  );
}

// ─── 6. The migration creates what the model writes ───────────────────────

{
  /*
    Every migration that touches the table, not only the one that created it.

    A schema is the sum of its migrations, and this read one file — so the day
    a column arrived by ALTER in a later migration, the check reported it
    missing from a schema it is actually in. `plan_item_id` was that day.

    Loose in one direction on purpose: a column name has to appear somewhere in
    the SQL that mentions this table, rather than inside a statement proven to
    target it. What the check is for is the failure that actually happens —
    a column added to the Drizzle model and to no migration at all, which
    compiles, passes every unit test and throws on the first insert in
    production.
  */
  const sql = readdirSync(join(ROOT, "supabase"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(`supabase/${f}`))
    .filter((text) => text.includes("recommendation_events"))
    .join("\n");
  check("the recommendation migrations were found", sql.includes("CREATE TABLE"));

  const columns = Object.values(recommendationEvents).flatMap((c: any) =>
    c && typeof c === "object" && "name" in c ? [String(c.name)] : [],
  );
  const missing = columns.filter((c) => !sql.includes(c));
  check(
    "every recommendation_events column exists in the migration",
    missing.length === 0,
    missing.join(", "),
  );

  const fbColumns = Object.values(recommendationFeedback).flatMap((c: any) =>
    c && typeof c === "object" && "name" in c ? [String(c.name)] : [],
  );
  const fbMissing = fbColumns.filter((c) => !sql.includes(c));
  check("…and every recommendation_feedback column", fbMissing.length === 0, fbMissing.join(", "));

  /*
    The index that makes this a record of decisions rather than of page loads.
    Losing it would not fail anything at runtime — it would quietly turn one
    recommendation into one row per open, and every rate computed from the
    table would be wrong in the same direction.
  */
  check("the identity index is created", sql.includes("uq_recommendation_identity"));
  check("…and it is unique", /CREATE UNIQUE INDEX[^;]*uq_recommendation_identity/s.test(sql));

  /* The closed reason list and the CHECK constraint are one list, twice. */
  const inCheck = FEEDBACK_REASONS.filter((r) => sql.includes(`'${r}'`));
  check(
    "every feedback reason is permitted by the CHECK constraint",
    inCheck.length === FEEDBACK_REASONS.length,
    FEEDBACK_REASONS.filter((r) => !sql.includes(`'${r}'`)).join(", "),
  );

  /*
    Named, not counted.

    This counted ENABLE ROW LEVEL SECURITY and expected two, which was true of
    one file and stopped being true the moment the corpus above included every
    migration mentioning the table. Counting also never actually said *which*
    two tables — a migration that enabled RLS on the same table twice would
    have satisfied it.
  */
  for (const table of ["recommendation_events", "recommendation_feedback"]) {
    check(
      `${table} has RLS enabled`,
      new RegExp(`ALTER TABLE\\s+${table}\\s+ENABLE ROW LEVEL SECURITY`).test(sql),
    );
  }
  check("the migration verifies itself rather than trusting", sql.includes("RAISE EXCEPTION"));
}

// ─── 7. Something actually calls the recorder ─────────────────────────────

{
  const today = read("server/today/routes.ts");
  const terrain = read("server/terrain/routes.ts");

  check("Today records its options", /await record\(/.test(today));
  check("…as today_option", today.includes('type: "today_option"'));
  check("…and hands the ids to the client", today.includes('withHandle(recorded, "today_option"'));

  check("Terrain records its direction", /await record\(/.test(terrain));
  check("…as terrain_direction", terrain.includes('type: "terrain_direction"'));

  /*
    Recorded once, on the surface it is read on. Terrain rides along on the
    Today response so Build can gate without a second request; recording it
    there too would double every terrain count on the strength of an
    implementation detail.
  */
  check(
    "…and Today does not also record it",
    !today.includes('"terrain_direction"'),
    "terrain would be counted twice",
  );

  /* Attribution is wired to the events that already exist, not to new ones. */
  const training = read("server/training/routes.ts");
  check("a finished session credits what was recommended", training.includes("markCompleted("));
  check("…from the session's own categories", training.includes("sessionCategories("));
  check("a dismissal is recorded against the recommendation", today.includes("markDismissed("));

  const routes = read("server/routes.ts");
  check("the feedback endpoints are mounted", routes.includes("registerIntelligenceRoutes(app)"));
}

// ─── 8. The thumbs are only on things an engine chose ─────────────────────

/*
  The rule that keeps the aggregate meaningful. A thumb on the moon card, on a
  library article, or on a coach's proposal produces data that looks like
  engine performance and is not — and it is the aggregate that will eventually
  be allowed to argue for a rule change.

  Enforced as an allow-list of importers rather than a convention in a comment,
  because a convention in a comment is how the four dead modules happened.
*/
{
  const ALLOWED = new Set([
    "client/src/components/TodayRead.tsx",
    "client/src/components/TerrainToday.tsx",
  ]);
  const { execSync } = await import("node:child_process");
  const found = execSync(
    "grep -rl 'components/intelligence/RecommendationFeedback' client/src --include='*.tsx' || true",
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const stray = found.filter((f) => !ALLOWED.has(f));
  check(
    "feedback controls appear only on genuine engine output",
    stray.length === 0,
    `${stray.join(", ")} — add it to ALLOWED here only if an engine chose that content`,
  );
  check("…and they do appear on the ones that are", found.length === ALLOWED.size, found.join(", "));
}

// ─── 9. One tap changes nothing ───────────────────────────────────────────

/*
  The constraint stated most plainly in the brief: a 👎 is evidence, never an
  edit. The feedback route may write its own two tables and nothing else — and
  in particular must never reach a decision module, a prompt, or a threshold.
*/
{
  const routes = read("server/intelligence/routes.ts");
  const writes = [...routes.matchAll(/db\s*\.\s*(insert|update|delete)\(\s*(\w+)/g)].map((m) => m[2]);
  const allowed = new Set(["recommendationFeedback"]);
  const forbidden = writes.filter((w) => !allowed.has(w!));
  check(
    "feedback writes only the feedback table",
    forbidden.length === 0,
    forbidden.join(", "),
  );
  check(
    "…and never imports a decision module",
    !/models\/(recommend|terrain|buildToday|habitResolve|rhythm)\.js/.test(routes),
  );
}

if (failures.length) {
  console.error("\n✗ recommendation events\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} recommendation assertions passed`);
