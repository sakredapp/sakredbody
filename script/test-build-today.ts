/**
 * Build cannot contradict Terrain.
 *
 * ── What these hold ───────────────────────────────────────────────────────
 *
 * Sakred has two readers of one set of signals, and they disagree by
 * construction: Terrain counts reasons by direction and lets the member's own
 * report outweigh the measured side; readReadiness sums magnitudes, where that
 * report is one term among five. On real data that produces
 *
 *     terrain restore + readiness primed
 *
 * and the shipped bug was Build printing "You've got room to push today" under
 * a Home screen reading "Keep today adjustable".
 *
 * So the assertions below are mostly about *silence*: what Build is not allowed
 * to say once Terrain has spoken. The grid is swept rather than spot-checked,
 * because the contradiction is a combination rather than a case.
 *
 * Run: tsx script/test-build-today.ts
 */

import { readFileSync } from "node:fs";
import { buildGate, gatedLine } from "../shared/models/buildToday.js";
import { readReadiness, readLine, suggestToday, type Suggestion } from "../shared/models/recommend.js";
import { readTerrain, composeTerrainNow, type TerrainLean } from "../shared/models/terrain.js";
import { terrainLeanFrom, type ReportedSignals } from "../shared/models/terrainSignals.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Source with comments stripped — a doc comment naming the thing it forbids is not a violation. */
const code = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Language that claims capacity. If Terrain said restore, none of it may appear. */
const PUSH_WORDS = /room to push|push it|good capacity|ready for|hard session|go hard/i;

const LOW: ReportedSignals = {
  energy: 2, recovery: 2, nervousSystem: 2, bodyTension: 2, mentalClarity: 2, drive: 2, digestion: 3,
};
const HIGH: ReportedSignals = {
  energy: 5, recovery: 5, nervousSystem: 5, bodyTension: 4, mentalClarity: 5, drive: 5, digestion: 4,
};

type Fixture = {
  name: string;
  sleep: number | null;
  sleepBase: number | null;
  hrv: number | null;
  hrvBase: number | null;
  rhr: number | null;
  rhrBase: number | null;
  trained: string[];
  daysSince: number | null;
  hard: number;
  reported: ReportedSignals | null;
};

/** Both readers, from one fixture, exactly as the server assembles them. */
function read(f: Fixture) {
  const measured = readTerrain({
    sleepRecent: f.sleep, sleepBaseline: f.sleepBase,
    hrvRecent: f.hrv, hrvBaseline: f.hrvBase,
    rhrRecent: f.rhr, rhrBaseline: f.rhrBase,
    trainedCategories: f.trained,
    daysSinceLastSession: f.daysSince,
  });
  const terrain = composeTerrainNow({ measured, reported: f.reported });
  const readiness = readReadiness({
    sleepMinutes: f.sleep, sleepBaselineMinutes: f.sleepBase,
    hrv: f.hrv, hrvBaseline: f.hrvBase,
    restingHeartRate: f.rhr, restingHeartRateBaseline: f.rhrBase,
    hardSessionsRecently: f.hard,
    daysSinceLastSession: f.daysSince,
    terrainLean: terrainLeanFrom(f.reported),
  });
  const suggestions = suggestToday({
    read: readiness,
    recentCategories: Array.from(new Set(f.trained)),
    excluded: [],
  });
  const gate = buildGate({
    lean: terrain.lean,
    reasons: terrain.reasons,
    hasReport: terrain.hasReport,
    read: readiness,
    suggestions,
  });
  return { terrain, readiness, suggestions, gate };
}

const HARD_WEEK = ["strength", "strength", "endurance", "endurance", "endurance", "strength"];

const FIXTURES: Fixture[] = [
  { name: "wearables excellent, member reports wrecked",
    sleep: 505, sleepBase: 420, hrv: 78, hrvBase: 60, rhr: 48, rhrBase: 56,
    trained: [], daysSince: 4, hard: 0, reported: LOW },
  { name: "wearables poor, member reports strong",
    sleep: 300, sleepBase: 450, hrv: 40, hrvBase: 60, rhr: 63, rhrBase: 55,
    trained: [], daysSince: 5, hard: 0, reported: HIGH },
  { name: "strong terrain, little recent load",
    sleep: 480, sleepBase: 430, hrv: 72, hrvBase: 60, rhr: 50, rhrBase: 55,
    trained: [], daysSince: 4, hard: 0, reported: HIGH },
  { name: "one great night against a heavy week",
    sleep: 531, sleepBase: 394, hrv: null, hrvBase: null, rhr: null, rhrBase: null,
    trained: HARD_WEEK, daysSince: 1, hard: 3, reported: null },
  { name: "repeated endurance recently",
    sleep: 450, sleepBase: 440, hrv: 60, hrvBase: 60, rhr: 54, rhrBase: 54,
    trained: ["endurance", "endurance", "endurance"], daysSince: 1, hard: 2, reported: null },
  { name: "repeated strength recently",
    sleep: 450, sleepBase: 440, hrv: 60, hrvBase: 60, rhr: 54, rhrBase: 54,
    trained: ["strength", "strength", "strength"], daysSince: 1, hard: 2, reported: null },
  { name: "no wearable, member reports low",
    sleep: null, sleepBase: null, hrv: null, hrvBase: null, rhr: null, rhrBase: null,
    trained: ["endurance"], daysSince: 2, hard: 1, reported: LOW },
  { name: "no wearable, member reports strong",
    sleep: null, sleepBase: null, hrv: null, hrvBase: null, rhr: null, rhrBase: null,
    trained: [], daysSince: 3, hard: 0, reported: HIGH },
  { name: "nothing known at all",
    sleep: null, sleepBase: null, hrv: null, hrvBase: null, rhr: null, rhrBase: null,
    trained: [], daysSince: null, hard: 0, reported: null },
];

console.log("\nTerrain controls the sentence\n");

{
  /**
   * The sweep. Every fixture, both directions, no exceptions — this is the
   * assertion the whole file exists for.
   */
  for (const f of FIXTURES) {
    const { terrain, gate } = read(f);

    if (terrain.lean === "restore") {
      check(`${f.name}: no capacity claim`, !PUSH_WORDS.test(gate.headline), gate.headline);
      check(`${f.name}: hard build withheld`, !gate.allowsBuild);
      check(
        `${f.name}: no demanding option offered`,
        gate.options.every((s: Suggestion) => s.side !== "build"),
      );
    }

    if (terrain.lean === "build" || terrain.lean === "either") {
      check(`${f.name}: build not withheld`, gate.allowsBuild || gate.insufficient);
    }

    /** Never a readiness word, in any state. */
    check(
      `${f.name}: no readiness vocabulary`,
      !/\b(primed|depleted|steady)\b/i.test(gate.headline + gate.rationale.join(" ")),
    );
  }
}

console.log("\nThe contradiction case, named\n");

{
  const f = FIXTURES[0]!;
  const { terrain, readiness, gate } = read(f);

  check("terrain reads restore", terrain.lean === "restore", terrain.lean);
  check("readiness reads primed", readiness.level === "primed", readiness.level);
  check("the two genuinely disagree", terrain.lean === "restore" && readiness.level === "primed");

  check("Build does not offer hard work", !gate.allowsBuild);
  check("and says so plainly", /isn't asking for hard output/.test(gate.headline));
  check("restorative options survive", gate.options.length > 0);
  check("every one of them restorative", gate.options.every((s) => s.side === "restore"));

  /** The shipped line, and the guard that stops it. */
  check("readLine alone would contradict", PUSH_WORDS.test(readLine(readiness)));
  check(
    "gatedLine does not",
    !PUSH_WORDS.test(gatedLine(terrain.lean, readLine(readiness), readiness)),
  );
}

console.log("\nThe inverse — Build must not understate\n");

{
  const f = FIXTURES[1]!;
  const { terrain, readiness, gate } = read(f);

  check("terrain allows something", terrain.lean !== "restore", terrain.lean);
  check("readiness alone would say depleted", readiness.level === "depleted", readiness.level);
  check("Build still offers a conditional option", gate.allowsBuild);
  check("and does not present as depleted", !/depleted|take something back/i.test(gate.headline));
}

console.log("\nOne great night does not erase a heavy week\n");

{
  const { terrain, readiness, gate } = read(FIXTURES[3]!);

  check("readiness is not primed", readiness.level !== "primed", readiness.level);
  check("terrain does not read build", terrain.lean !== "build", terrain.lean);
  check("no unconditional push", !PUSH_WORDS.test(gate.headline), gate.headline);
  /**
   * The conditional state is the useful one and it must stay conditional —
   * "available if the warm-up agrees", never "available".
   */
  if (terrain.lean === "either") {
    check("the offer is conditional", /warm-up agrees/.test(gate.headline), gate.headline);
  }
}

console.log("\nModality comes from the engine, not from Build\n");

{
  const endurance = read(FIXTURES[4]!);
  const strength = read(FIXTURES[5]!);

  check(
    "repeated endurance does not simply beget endurance",
    !endurance.suggestions.slice(0, 1).every((s) => s.category === "endurance"),
  );
  check(
    "repeated strength diversifies too",
    !strength.suggestions.slice(0, 1).every((s) => s.category === "strength"),
  );
  /** Build re-orders nothing — the engine's ordering survives the gate. */
  const ordered = strength.gate.options.map((s) => s.category);
  const expected = strength.suggestions.filter((s) => strength.gate.allowsBuild || s.side !== "build").map((s) => s.category);
  check("the gate filters but never re-ranks", JSON.stringify(ordered) === JSON.stringify(expected));
}

console.log("\nNo evidence, no recommendation\n");

{
  const { gate, terrain } = read(FIXTURES[8]!);

  check("terrain knows nothing", terrain.lean === "unknown", terrain.lean);
  check("Build admits it", gate.insufficient);
  check("and invents no options", gate.options.length === 0);
  check("nor a reason", gate.rationale.length === 0);
  check("but offers the way to fix it", gate.invitesReport);
}

console.log("\nThe check-in is offered, never demanded\n");

{
  /** Measured-only is exactly when asking is worth something. */
  const noReport = read(FIXTURES[3]!);
  check("no report means the invitation shows", noReport.gate.invitesReport);

  /** And once they have answered, Build stops asking. */
  const reported = read(FIXTURES[0]!);
  check("a report silences it", !reported.gate.invitesReport);
}

console.log("\nSelf-guided is first class\n");

{
  /**
   * Nothing in the gate reads a coach, a plan or a relationship. A member with
   * no coach gets the same intelligence — asserted on the source so it cannot
   * quietly acquire a dependency.
   */
  const gateSrc = code("shared/models/buildToday.ts");
  check("the gate does not read a coach", !/coach/i.test(gateSrc));
  check("nor a plan", !/coachingPlan|planItem/i.test(gateSrc));
  /** And it stays a gate rather than becoming a third engine. */
  check("no second readiness model", !/buildReadinessScore|score\s*[+-]=/.test(gateSrc));
}

console.log("\nNo invented muscle groups\n");

{
  /**
   * An imported `strength` workout carries no muscle-group truth: only a
   * Sakred-logged session reaches `exercises.muscleGroups`, through its sets.
   * So the invariant is about *history*, not vocabulary — a recommendation may
   * name a category, because that is a proposal rather than a claim about what
   * somebody did.
   *
   * Grepping for body parts is the wrong test and was briefly the one here: it
   * failed on "asking for something back today". What must hold is that
   * nothing derives a muscle group from a movement event.
   */
  const ui = code("client/src/components/build/BuildToday.tsx");
  check("the screen reads no muscle groups", !/muscleGroups|muscle_groups/.test(ui));
  check("history is labelled from the source's own words", /e\.activity/.test(ui));
  check("and falls back to the category, not a body part", /CATEGORY_LABEL\.get/.test(ui));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
