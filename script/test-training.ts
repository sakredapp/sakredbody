/**
 * Training — the derived numbers.
 *
 * Every figure Build shows a member is calculated from sets they entered, so a
 * wrong formula here is not a crash, it is a member told they are stronger
 * than they are. That is the failure mode worth testing: silent and flattering.
 *
 * Pure functions and schemas only — no database.
 *
 * Run: tsx script/test-training.ts
 */

import {
  estimateOneRepMax,
  totalLoadKg,
  volumeKg,
  displayWeight,
  lbToKg,
  kgToLb,
  logSetSchema,
  prescribeExerciseSchema,
  MAX_REPS_FOR_ESTIMATE,
  EXERCISE_CATEGORIES,
  EXERCISE_GROUPS,
  MOVEMENT_PATTERNS,
  EQUIPMENT,
  CATALOGUE_FETCH_LIMIT,
  isPracticeCategory,
  summariseSession,
  BUILD_MODALITIES,
  categoriesForModalities,
  CATEGORY_LOAD,
  categoryLoad,
  categoryOrientation,
  orientationOfLoad,
  type LoggedSet,
} from "../shared/models/training.js";
import { catalogueRows, slug, arrayLiteral } from "../shared/data/exerciseCatalogue.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number | null, b: number, eps = 0.01) => a !== null && Math.abs(a - b) < eps;

console.log("\nEpley, inside the range Build actually programmes\n");

check("a single is itself", estimateOneRepMax(100, 1) === 100);
check("100kg × 3 ≈ 110", near(estimateOneRepMax(100, 3), 110));
check("100kg × 5 ≈ 116.7", near(estimateOneRepMax(100, 5), 116.67));
check("100kg × 8 ≈ 126.7", near(estimateOneRepMax(100, 8), 126.67));
// The whole reason Build programmes 2–8: the estimate is trustworthy there.
check("2–8 reps all estimate", [2, 3, 4, 5, 6, 7, 8].every((r) => estimateOneRepMax(100, r) !== null));
check("more reps estimates more", estimateOneRepMax(100, 5)! > estimateOneRepMax(100, 3)!);

console.log("\nAnd refuses where it would lie\n");

check(`above ${MAX_REPS_FOR_ESTIMATE} reps returns null`, estimateOneRepMax(60, 30) === null);
check("at the cap it still answers", estimateOneRepMax(60, MAX_REPS_FOR_ESTIMATE) !== null);
check("zero weight is not a max", estimateOneRepMax(0, 5) === null);
check("zero reps is not a set", estimateOneRepMax(100, 0) === null);
check("NaN in, null out", estimateOneRepMax(Number.NaN, 5) === null);

console.log("\nBodyweight movements load the body\n");

// Twenty pull-ups at an unrecorded zero would say a member did nothing.
check("bodyweight pull-up at 80kg loads 80", totalLoadKg(0, 1.0, 80) === 80);
check("+20kg pull-up loads 100", totalLoadKg(20, 1.0, 80) === 100);
check("push-up at 0.64 loads 51.2", near(totalLoadKg(0, 0.64, 80), 51.2));
check("a barbell squat loads only the bar", totalLoadKg(140, 0, 80) === 140);
check("unknown bodyweight falls back to added load", totalLoadKg(20, 1.0, null) === 20);
check("volume is reps × load", volumeKg(5, 100) === 500);

console.log("\nUnits convert and round the way a gym does\n");

check("225lb ≈ 102.06kg", near(lbToKg(225), 102.058, 0.01));
check("round-trips", near(kgToLb(lbToKg(225)), 225, 0.0001));
check("lb shown whole", displayWeight(lbToKg(225), "lb") === 225);
check("kg shown to the half", displayWeight(102.058, "kg") === 102);
check("102.3kg rounds to 102.5", displayWeight(102.3, "kg") === 102.5);

console.log("\nA set has to measure something\n");

check("reps alone is valid", logSetSchema.safeParse({ exerciseId: "squat", reps: 5, weight: 100 }).success);
check("a duration alone is valid", logSetSchema.safeParse({ exerciseId: "plank", durationSeconds: 90 }).success);
check("a distance alone is valid", logSetSchema.safeParse({ exerciseId: "carry", distanceM: 40 }).success);
check(
  "measuring nothing is refused",
  !logSetSchema.safeParse({ exerciseId: "squat", weight: 60 }).success,
);
check("zero reps is refused", !logSetSchema.safeParse({ exerciseId: "squat", reps: 0 }).success);

console.log("\nA prescription has to make sense\n");

check("4 × 3–5 is valid", prescribeExerciseSchema.safeParse({ exerciseId: "squat", targetSets: 4, targetRepsLow: 3, targetRepsHigh: 5 }).success);
check("an inverted range is refused", !prescribeExerciseSchema.safeParse({ exerciseId: "squat", targetRepsLow: 8, targetRepsHigh: 3 }).success);
check("no rep range is allowed", prescribeExerciseSchema.safeParse({ exerciseId: "squat", targetSets: 5 }).success);
check("zero sets is refused", !prescribeExerciseSchema.safeParse({ exerciseId: "squat", targetSets: 0 }).success);

// ── The catalogue ──────────────────────────────────────────────────────────
//
// Not decoration. Every one of these went wrong once: the equipment default
// that silently wrote "bodyweight" onto every barbell lift, the alias array
// that made the sync endpoint fail 500 for its entire life because nothing had
// ever called it, the practice sitting in a category the picker cannot reach.

console.log("\nThe catalogue holds together\n");

const rows = catalogueRows();
const knownCategories = new Set(EXERCISE_CATEGORIES.map((c) => c.id as string));
const knownGroups = new Set(EXERCISE_GROUPS.map((g) => g.id as string));

check("it is not the twenty-five barbell lifts any more", rows.length > 500, `${rows.length}`);
check(
  "every row sits in a category the picker knows",
  rows.every((r) => knownCategories.has(r.category)),
  rows.filter((r) => !knownCategories.has(r.category)).map((r) => r.category).join(", "),
);
check(
  "every category sits in a group the picker shows",
  EXERCISE_CATEGORIES.every((c) => knownGroups.has(c.group)),
);
check(
  "no category is unreachable — each has at least one movement in it",
  EXERCISE_CATEGORIES.filter((c) => c.id !== "full_body").every((c) =>
    rows.some((r) => r.category === c.id),
  ),
  EXERCISE_CATEGORIES.filter(
    (c) => c.id !== "full_body" && !rows.some((r) => r.category === c.id),
  )
    .map((c) => c.id)
    .join(", "),
);
check(
  "slugs are unique",
  new Set(rows.map((r) => slug(r.name))).size === rows.length,
);
// The picker fetches once and filters in memory, so a catalogue larger than
// the endpoint returns is a catalogue that is partly invisible — silently,
// with every other test still green. It truncated at 300 of 657 for a day.
check(
  "the whole catalogue fits in one fetch, with room for a member's own",
  rows.length + 200 < CATALOGUE_FETCH_LIMIT,
  `${rows.length} rows vs a ${CATALOGUE_FETCH_LIMIT} limit`,
);
check(
  "every barbell lift names its equipment",
  !rows.some((r) => r.pattern === "hinge" && r.category === "back" && r.equipment === "bodyweight"),
);

// The database has a CHECK constraint on each of these. It is a fourth copy of
// the list, and the only one that can reject a write — so a word the catalogue
// uses and the vocabulary does not is a 500 at sync time, not a lint.
console.log("\nOne vocabulary, not four that drifted\n");

const patterns = new Set<string>(MOVEMENT_PATTERNS);
const equipment = new Set<string>(EQUIPMENT);

check(
  "every movement pattern is in the vocabulary",
  rows.every((r) => patterns.has(r.pattern)),
  Array.from(new Set(rows.filter((r) => !patterns.has(r.pattern)).map((r) => r.pattern))).join(", "),
);
check(
  "every equipment is in the vocabulary",
  rows.every((r) => equipment.has(r.equipment)),
  Array.from(new Set(rows.filter((r) => !equipment.has(r.equipment)).map((r) => r.equipment))).join(
    ", ",
  ),
);
check(
  "no vocabulary word is dead — each is used by something",
  EQUIPMENT.filter((e) => e !== "band" && e !== "smith_machine" && e !== "medicine_ball").every(
    (e) => rows.some((r) => r.equipment === e),
  ),
  EQUIPMENT.filter((e) => !rows.some((r) => r.equipment === e)).join(", "),
);
check(
  "no word carries a space — these become SQL literals and URL-ish slugs",
  [...MOVEMENT_PATTERNS, ...EQUIPMENT].every((w) => !/\s/.test(w)),
);
check(
  "every tracking type is one the schema allows",
  rows.every((r) => ["reps", "duration", "distance"].includes(r.tracking ?? "reps")),
);

// The answer to "what kinds of movement are part of your life" narrows what
// the picker browses. A category behind none of the choices is a shelf of the
// catalogue that becomes unreachable by browsing for anybody who answers.
console.log("\nEvery category is reachable through some modality\n");

const reachable = new Set(BUILD_MODALITIES.flatMap((m) => m.categories as readonly string[]));
check(
  "no category is orphaned by the modality mapping",
  EXERCISE_CATEGORIES.every((c) => reachable.has(c.id)),
  EXERCISE_CATEGORIES.filter((c) => !reachable.has(c.id)).map((c) => c.id).join(", "),
);
check(
  "no modality points at a category that doesn't exist",
  Array.from(reachable).every((c) => knownCategories.has(c)),
  Array.from(reachable).filter((c) => !knownCategories.has(c)).join(", "),
);
check(
  "picking everything is the same as no filter at all",
  categoriesForModalities(BUILD_MODALITIES.map((m) => m.id)).size === EXERCISE_CATEGORIES.length,
);
check("picking nothing narrows nothing", categoriesForModalities([]).size === 0);
check(
  "a Pilates member gets the reformer and not the squat rack",
  (() => {
    const c = categoriesForModalities(["pilates", "mobility"]);
    return c.has("pilates") && c.has("mobility") && !c.has("legs") && !c.has("sport");
  })(),
);

console.log("\nA practice is a duration, and never a weight\n");

const practices = rows.filter((r) => isPracticeCategory(r.category));
check("there are practices at all", practices.length > 50, `${practices.length}`);
check(
  "every practice is tracked as a duration",
  practices.every((r) => r.tracking === "duration"),
  practices.filter((r) => r.tracking !== "duration").map((r) => r.name).join(", "),
);
check(
  "no practice asks for a weight",
  practices.every((r) => !r.load),
  practices.filter((r) => r.load).map((r) => r.name).join(", "),
);
check(
  "no practice claims a one-rep max",
  practices.every((r) => !r.orm),
);
check("a class is a practice", isPracticeCategory("class"));
check("basketball is a practice", isPracticeCategory("sport"));
check("a barbell row is not", !isPracticeCategory("back"));
// `full_body` is where every member-created movement lands. Classing it as a
// practice would ask somebody how many minutes of their own deadlift they did.
check("the bucket every custom movement lands in is not", !isPracticeCategory("full_body"));
check("a reformer movement is not — a sequence can prescribe it", !isPracticeCategory("pilates"));
check(
  "the studio takes springs, not kilograms",
  rows
    .filter((r) => ["pilates", "lagree", "barre"].includes(r.category))
    .every((r) => !r.load),
);

// One function draws both the member's history and the message posted into the
// coaching thread. A coach reading "3 × 8 @ 185" while the member's screen says
// something else is how somebody stops trusting both.
console.log("\nA session reads the same to a member and to their coach\n");

const set = (o: Partial<LoggedSet> & { name: string }): LoggedSet => ({
  category: "back",
  trackingType: "reps",
  reps: null,
  durationSeconds: null,
  weight: null,
  isWarmup: false,
  ...o,
});

check(
  "reps and a top load",
  summariseSession(
    [
      set({ name: "Barbell Row", reps: 8, weight: 60 }),
      set({ name: "Barbell Row", reps: 8, weight: 70 }),
    ],
    "kg",
  )[0] === "Barbell Row — 2 × 8 @ 70kg",
);
check(
  "uneven reps are listed rather than averaged",
  summariseSession(
    [set({ name: "Pull-Up", reps: 8 }), set({ name: "Pull-Up", reps: 6 })],
    "kg",
  )[0] === "Pull-Up — 2 × 8/6",
);
check(
  "a hold is seconds",
  summariseSession(
    [
      set({ name: "Plank", category: "core", trackingType: "duration", durationSeconds: 40 }),
      set({ name: "Plank", category: "core", trackingType: "duration", durationSeconds: 50 }),
    ],
    "kg",
  )[0] === "Plank — 2 × 45s",
);
check(
  "a class is minutes, never 1 × 2700s",
  summariseSession(
    [
      set({
        name: "Reformer Pilates",
        category: "class",
        trackingType: "duration",
        durationSeconds: 2700,
      }),
    ],
    "kg",
  )[0] === "Reformer Pilates — 45 min",
);
check(
  "warm-ups are not in the summary",
  summariseSession(
    [
      set({ name: "Squat", reps: 5, weight: 40, isWarmup: true }),
      set({ name: "Squat", reps: 5, weight: 100 }),
    ],
    "kg",
  )[0] === "Squat — 1 × 5 @ 100kg",
);
check(
  "movements keep the order they were done in",
  summariseSession(
    [set({ name: "Squat", reps: 5 }), set({ name: "Row", reps: 8 }), set({ name: "Squat", reps: 5 })],
    "kg",
  ).join(" | ") === "Squat — 2 × 5 | Row — 1 × 8",
);
check("an empty session summarises to nothing", summariseSession([], "kg").length === 0);

console.log("\nAn alias array survives the trip to Postgres\n");

// The bug this catches returns `(a, b)` — a record — where a text[] is needed.
check("nothing becomes NULL", arrayLiteral(undefined) === null && arrayLiteral([]) === null);
check("one alias", arrayLiteral(["bench"]) === '{"bench"}');
check("two aliases", arrayLiteral(["bench", "bb bench"]) === '{"bench","bb bench"}');
check('a quote is escaped', arrayLiteral(['say "hi"']) === '{"say \\"hi\\""}');
check("a backslash is escaped", arrayLiteral(["a\\b"]) === '{"a\\\\b"}');
check(
  "every alias in the catalogue renders",
  rows.every((r) => (r.aliases?.length ? arrayLiteral(r.aliases)!.startsWith("{") : true)),
);

console.log("\nWhat a category asks of the body\n");

// The whole point of keeping the loads beside the categories is that they
// cannot drift apart. A category added without a load would silently become
// neutral — invisible to the terrain reading and impossible to notice.
check(
  "every category has a load",
  EXERCISE_CATEGORIES.every((c) => CATEGORY_LOAD[c.id] !== undefined),
  EXERCISE_CATEGORIES.filter((c) => !CATEGORY_LOAD[c.id]).map((c) => c.id).join(", "),
);
check(
  "no load is invented for a category that does not exist",
  Object.keys(CATEGORY_LOAD).every((id) => EXERCISE_CATEGORIES.some((c) => c.id === id)),
  Object.keys(CATEGORY_LOAD)
    .filter((id) => !EXERCISE_CATEGORIES.some((c) => c.id === id))
    .join(", "),
);
check(
  "every load is inside the scale",
  Object.values(CATEGORY_LOAD).every(
    (l) => l.stress >= 0 && l.stress <= 3 && l.restoration >= 0 && l.restoration <= 3,
  ),
);

check("demanding and restoring is both", orientationOfLoad({ stress: 3, restoration: 3 }) === "both");
check("demanding alone is yang", orientationOfLoad({ stress: 3, restoration: 0 }) === "yang");
check("restoring alone is yin", orientationOfLoad({ stress: 0, restoration: 3 }) === "yin");
check("neither is neutral", orientationOfLoad({ stress: 1, restoration: 1 }) === "neutral");

// The cases the single-label version would have got wrong.
check("a deadlift's category builds", categoryOrientation("legs") === "yang");
check("fascia restores", categoryOrientation("fascia") === "yin");
check("Lagree is not gentle because it happens on a carriage", categoryOrientation("lagree") === "yang");
check("Pilates is both", categoryOrientation("pilates") === "both");
check("an unknown category is neutral, not guessed", categoryOrientation("nonsense") === "neutral");
check("an unknown category has no load", categoryLoad("nonsense").stress === 0);

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
