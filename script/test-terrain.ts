import { readFileSync } from "node:fs";
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
  composeTerrainNow,
  terrainHeadline,
  weekLoad,
  type TerrainInputs,
} from "../shared/models/terrain.js";
import { terrainLeanFrom, signalLean } from "../shared/models/terrainSignals.js";

let passed = 0;
let failed = 0;

const src = (rel: string) =>
  readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
/** Source with comments stripped, so prose cannot satisfy a code assertion. */
const code = (rel: string) =>
  src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

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
  "Pilates counts on both sides of the ledger, unevenly",
  weekLoad(["pilates"]).stress === 2 && weekLoad(["pilates"]).restoration === 1,
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
  "the sleep reason names the size of the change as a duration",
  depleted.reasons.some((r) => /\dh \d+m less sleep/.test(r.text)),
  depleted.reasons.map((r) => r.text).join(" | "),
);

/**
 * A comparison has to say what it compared.
 *
 * "Sleeping 192 minutes less than usual" was the complaint that started this:
 * it names neither window, so it cannot be checked or argued with — and in the
 * case that prompted it, "usual" was a 28-day average poisoned by six
 * double-counted nights, which the member had no way to notice.
 *
 * Every reason drawn from the two averages must therefore name both windows,
 * and must take them from the caller rather than restating them, or the
 * sentence and the arithmetic drift apart silently.
 */
for (const r of depleted.reasons.filter((x) => /average/.test(x.text))) {
  check(`"${r.text}" names the recent window`, /Last 7 (nights|days)/.test(r.text));
  check(`"${r.text}" names the baseline window`, /28-day average/.test(r.text));
}

const custom = readTerrain({
  sleepRecent: 380,
  sleepBaseline: 450,
  hrvRecent: null,
  hrvBaseline: null,
  rhrRecent: null,
  rhrBaseline: null,
  trainedCategories: [],
  daysSinceLastSession: null,
  recentDays: 5,
  baselineDays: 30,
});
check(
  "the windows come from the caller, not the copy",
  custom.reasons.some((r) => /Last 5 nights/.test(r.text) && /30-day average/.test(r.text)),
  custom.reasons.map((r) => r.text).join(" | "),
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
/**
 * `either` now also means "the instruments and the person disagree", so it
 * cannot claim recovery. A tie is a day to stay responsive on, not a clean bill
 * of health picked from the more reassuring of two answers.
 */
check(
  "a tie does not claim the member is recovered",
  !/recover/i.test(terrainHeadline({ ...read(), lean: "either" })),
);
check(
  "it says what a tie is actually good for",
  terrainHeadline({ ...read(), lean: "either" }) === "Keep today adjustable",
);
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

console.log("\nWhat the person says, alongside what the instruments say\n");

/**
 * ── The cases that matter are the disagreements ───────────────────────────
 *
 * A watch is a proxy for a body. A person is not. When the two agree, the
 * composition is uninteresting; when they disagree, whichever one this product
 * decides to believe *is* the product. So both stay on screen in every case
 * below, and the rules are: what somebody reports always outweighs a single
 * measurement, and never clears an accumulated deficit.
 */
const WRECKED = { energy: 1, recovery: 1, bodyTension: 5, nervousSystem: 2 };
const STRONG = { energy: 5, recovery: 5, drive: 5, mentalClarity: 4 };
const compose = (over: Partial<TerrainInputs>, reported: Parameters<typeof composeTerrainNow>[0]["reported"]) =>
  composeTerrainNow({ measured: read(over), reported });

/** Good wearable, poor subjective. The case that started all of this. */
{
  const r = compose({ daysSinceLastSession: 5 }, WRECKED);
  check("a light week with a wrecked report does not offer more movement", r.lean !== "build");
  check("it reads restore", r.lean === "restore");
  check(
    "and never prints 'you have room for more movement'",
    terrainHeadline(r) !== terrainHeadline({ ...r, lean: "build" }),
  );
  check("the measured reason is still there", r.reasons.some((x) => x.source === "measured"));
  check("beside the reported one", r.reasons.some((x) => x.source === "reported"));
  check("which names the actual answers", /Recovery 1\/5/.test(r.reasons.at(-1)!.text));
  check("in a voice that works on a coach's screen too", !/\byou\b/i.test(r.reasons.at(-1)!.text));
}

/** Poor wearable, strong subjective. Feeling good is not being recovered. */
{
  const oneDebt = compose({ sleepRecent: 380 }, STRONG);
  check("one measurement down against a strong report yields to the person", oneDebt.lean === "build");
  check("but the sleep debt is still stated", oneDebt.reasons.some((x) => /less sleep/.test(x.text)));

  const realDebt = compose({ sleepRecent: 380, hrvRecent: 50, rhrRecent: 60 }, STRONG);
  check("an accumulated deficit is not cleared by feeling great", realDebt.lean === "restore");
  check("and the report is still shown, not suppressed",
    realDebt.reasons.some((x) => x.source === "reported"));
}

/** Both agreeing, in each direction. */
check("both poor reads restore", compose({ sleepRecent: 380 }, WRECKED).lean === "restore");
check("both strong reads build", compose({ daysSinceLastSession: 5 }, STRONG).lean === "build");

/** No report at all — the measured behaviour is exactly what it was. */
{
  const measured = read({ sleepRecent: 380 });
  const composed = composeTerrainNow({ measured, reported: null });
  check("no check-in changes nothing", composed.lean === measured.lean);
  check("and says so", composed.hasReport === false);
  check("with no reason invented", composed.reasons.length === measured.reasons.length);
}

/**
 * Yesterday's answer is history, not a present-tense claim about a body. The
 * freshness rule lives in the caller — this pins the half the model owns: it
 * only ever sees what it is handed, and null is the same as no check-in.
 */
check("a stale check-in reaches the model as nothing at all",
  composeTerrainNow({ measured: read(), reported: null }).hasReport === false);

/** Answering too little is not a reading. */
{
  const thin = composeTerrainNow({ measured: read(), reported: { energy: 1, recovery: 1 } });
  check("two answers is a mood, not a report", thin.hasReport === false);
  check("and moves nothing", thin.lean === read().lean);
}

/** Answered, and nothing pulls. A report, and not a reason for anything. */
{
  const flat = composeTerrainNow({ measured: read(), reported: { energy: 3, recovery: 3, drive: 3 } });
  check("a neutral report counts as having checked in", flat.hasReport === true);
  check("without adding a reason", flat.reasons.length === read().reasons.length);
}

/** A member with no wearable is not an empty reading. */
{
  const nothing = read({
    sleepRecent: null, sleepBaseline: null,
    hrvRecent: null, hrvBaseline: null,
    rhrRecent: null, rhrBaseline: null,
    daysSinceLastSession: null,
  });
  check("with no devices at all, measured terrain is unknown", nothing.lean === "unknown");
  const spoken = composeTerrainNow({ measured: nothing, reported: WRECKED });
  check("but somebody who tells us how they are has a terrain", spoken.lean === "restore");
  check("still honestly reporting no synced body", spoken.hasBody === false);
  check("and that they spoke", spoken.hasReport === true);
}

/**
 * One reducer. If these two ever disagree about the same seven answers, the
 * member is being told one thing by Terrain Now and another by their
 * recommendations, from a single check-in.
 */
{
  const cases = [WRECKED, STRONG, { energy: 3, recovery: 3, drive: 3 }];
  check(
    "the terrain lean and the readiness lean read the check-in the same way",
    cases.every((c) => {
      const n = terrainLeanFrom(c);
      const word = signalLean(c);
      return n === null
        ? word === "unknown"
        : word === (n < 0 ? "restore" : n > 0 ? "build" : "either");
    }),
  );
  check("and the check-in's weight is bounded", cases.every((c) => {
    const n = terrainLeanFrom(c);
    return n === null || (n >= -3 && n <= 3);
  }));
}

/** Every reason says where it came from — no biometric invented from a slider. */
check(
  "no measured reason is ever produced by a report",
  compose({}, WRECKED).reasons.filter((r) => r.source === "measured").length ===
    read().reasons.length,
);


console.log("\nAn event is history; a projection is not\n");

/**
 * The bug this pins: two workouts on one day that map to the same Sakred
 * category collapsed into one entry, and — because the query had no ordering —
 * which of their names survived could change between calls with no change to
 * the data. Harmless while only the category survived; a false claim the moment
 * a specific activity was displayed.
 */
{
  const hist = code("server/movement/history.ts");
  const read = code("server/terrain/read.ts");
  const restore = code("client/src/components/RestoreTab.tsx");

  check("there is an event-level reader", /export async function movementEvents\(/.test(hist));
  check("it carries a stable event id", /  id: string;/.test(hist));
  check("and when it happened", /occurredAt: Date \| null;/.test(hist));

  /** One query path, so the two representations cannot drift apart. */
  check(
    "the reduction is derived from the events",
    /const events = await movementEvents\(userId, since\);/.test(hist),
  );
  check(
    "rather than querying health_workouts a second time",
    (hist.match(/from\(healthWorkouts\)/g) ?? []).length === 1,
  );

  /** The actual defect: relying on unspecified row order. */
  check("event order is explicit", /events\.sort\(\(a, b\) =>/.test(hist));
  check("and total, so ties cannot float", /a\.id\.localeCompare\(b\.id\)/.test(hist));

  /** The reduction keeps its job. */
  check("the day/category collapse survives", /claimed\.has\(key\)\) continue;/.test(hist));
  check(
    "and still prefers what the member logged themselves",
    /a\.source === "sakred" \? -1 : 1/.test(hist),
  );

  /** Restore reads history, not the projection. */
  check("the terrain read exposes the events", /movementEvents: movementEventList/.test(read));
  check("under their own name", !/movement: movementEventList/.test(read));
  check("and Restore renders them", /terrain\.data\.movementEvents/.test(restore));

  /** Placement stays classification, never English. */
  check(
    "demand and restoration come from orientation",
    /orientation === "yang"/.test(restore) && /orientation === "yin"/.test(restore),
  );
  check("not from the activity name", !/activity ===|activity\.includes/.test(restore));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
