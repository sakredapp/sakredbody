/**
 * Terrain — the reading.
 *
 * This decides what the app tells a member their body is asking for, which is
 * the most consequential sentence in the product: told to build when they are
 * depleted, they get hurt; told to restore when they are fresh, they lose the
 * point of the app. Neither failure looks like a bug from the outside — both
 * look like an opinion.
 *
 * Pure functions only — no database.
 *
 * Run: tsx script/test-terrain.ts
 */

import {
  readTerrain,
  terrainHeadline,
  weekLoad,
  type TerrainInputs,
} from "../shared/models/terrain.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A body that is saying nothing in particular, so each test moves one thing. */
const base: TerrainInputs = {
  sleepRecent: 450,
  sleepBaseline: 450,
  hrvRecent: 60,
  hrvBaseline: 60,
  rhrRecent: 54,
  rhrBaseline: 54,
  trainedCategories: [],
  daysSinceLastSession: 1,
};

const read = (over: Partial<TerrainInputs> = {}) => readTerrain({ ...base, ...over });

console.log("\nThe week's load comes from the categories, not a guess\n");

check("nothing is nothing", weekLoad([]).stress === 0 && weekLoad([]).restoration === 0);
check("a heavy lift is stress", weekLoad(["legs"]).stress === 3);
check("fascia is restoration", weekLoad(["fascia"]).restoration === 3);
check(
  "Pilates counts on both sides of the ledger",
  weekLoad(["pilates"]).stress === 2 && weekLoad(["pilates"]).restoration === 2,
);
check("sessions are counted", weekLoad(["legs", "back", "fascia"]).sessions === 3);

console.log("\nWhat the body says\n");

check("a body saying nothing leans neither way", read().lean === "either");
check(
  "sleep well down asks for restoration",
  read({ sleepRecent: 400, sleepBaseline: 450 }).lean === "restore",
);
check(
  "sleep barely down is noise, not a signal",
  read({ sleepRecent: 440, sleepBaseline: 450 }).lean === "either",
);
check(
  "HRV below baseline asks for restoration",
  read({ hrvRecent: 50, hrvBaseline: 60 }).lean === "restore",
);
check(
  "resting heart rate up asks for restoration",
  read({ rhrRecent: 58, rhrBaseline: 54 }).lean === "restore",
);

console.log("\nWhat the week asked for\n");

check(
  "four heavy sessions ask for restoration",
  read({ trainedCategories: ["legs", "back", "chest", "olympic"] }).lean === "restore",
);
check(
  "a long gap argues for demand",
  read({ trainedCategories: [], daysSinceLastSession: 6 }).lean === "build",
);
check(
  "somebody who has never trained is not told they are under-trained",
  read({ trainedCategories: [], daysSinceLastSession: null }).lean === "either",
);
check(
  "restoration done alongside a heavy week is credited",
  read({
    trainedCategories: ["legs", "back", "chest", "fascia", "mobility"],
  }).lean === "either",
);

console.log("\nWhat it refuses to do\n");

// The whole argument of the file: a lean and its reasons, never a score.
check(
  "no composite number is produced",
  Object.keys(read()).every((k) => !["score", "readiness", "balance", "percent"].includes(k)),
);
check(
  "balance is never a lean",
  (["restore", "build", "either", "unknown"] as string[]).includes(read().lean),
);
check(
  "nothing synced and nothing trained is unknown, not a shrug",
  read({
    sleepRecent: null,
    sleepBaseline: null,
    hrvRecent: null,
    hrvBaseline: null,
    rhrRecent: null,
    rhrBaseline: null,
    daysSinceLastSession: null,
  }).lean === "unknown",
);
check(
  "an unknown terrain offers no reasons it cannot support",
  read({
    sleepRecent: null,
    sleepBaseline: null,
    hrvRecent: null,
    hrvBaseline: null,
    rhrRecent: null,
    rhrBaseline: null,
    daysSinceLastSession: null,
  }).reasons.length === 0,
);

console.log("\nEvery reason is something a member could argue with\n");

const depleted = read({ sleepRecent: 380, sleepBaseline: 450, hrvRecent: 48, hrvBaseline: 60 });
check("reasons are given", depleted.reasons.length >= 2);
check("each reason picks a side", depleted.reasons.every((r) => r.pulls === "restore" || r.pulls === "build"));
check(
  "the sleep reason names the size of the change",
  depleted.reasons.some((r) => /\d+ minutes less/.test(r.text)),
);
check(
  "no reason names a metric the way a database does",
  depleted.reasons.every((r) => !/sleepMinutes|heartRateVariability|restingHeartRate/.test(r.text)),
);

console.log("\nThe headline\n");

check("depleted reads as short on recovery", terrainHeadline(depleted).includes("short on recovery"));
/**
 * The headline states a condition and never instructs — it reads signals and
 * knows nothing about the member's actual day. It also must not say "your body
 * is asking", which was the old way of avoiding the instruction and bought it
 * with the register of a wellness retreat.
 */
for (const reading of [depleted, read({ daysSinceLastSession: 6 }), read({})]) {
  const line = terrainHeadline(reading);
  check(`"${line}" gives no instruction`, !/\byou should\b|\btry to\b|\bmake sure\b/i.test(line));
  check(`"${line}" does not personify the body`, !/\bbody is asking\b|\basking for\b/i.test(line));
}
check(
  "fresh reads as having room",
  terrainHeadline(read({ daysSinceLastSession: 6 })).includes("room for more movement"),
);
check(
  "unknown says so rather than inventing",
  terrainHeadline(
    read({
      sleepRecent: null,
      sleepBaseline: null,
      hrvRecent: null,
      hrvBaseline: null,
      rhrRecent: null,
      rhrBaseline: null,
      daysSinceLastSession: null,
    }),
  ).startsWith("Not enough yet"),
);

// The word failed a readability test twice, on the two people most likely to
// understand it. It stays the name of the model and leaves the screen.
check(
  "no headline says 'terrain' to a member",
  (["restore", "build", "either", "unknown"] as const).every((lean) =>
    !/terrain/i.test(terrainHeadline({ ...read(), lean })),
  ),
);

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
