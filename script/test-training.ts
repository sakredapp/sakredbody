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
  WALL,
  foldsAt,
  summarise,
  type SummarisableEntry,
} from "../shared/models/history.js";
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
  externalActivityCategory,
  externalActivityOrientation,
  EXTERNAL_ACTIVITY_CATEGORY,
  DEMANDING_EXTERNAL_TYPES,
  WORKOUT_RESPONSES,
  WORKOUT_PLACEMENTS,
  PLACEMENT_LABEL,
  ORIENTATION_LABEL,
  placementOfOrientation,
  effectivePlacement,
  placementIsMembers,
  type LoggedSet,
} from "../shared/models/training.js";
import { workoutFeedbackSchema } from "../shared/models/health.js";
import { catalogueRows, slug, arrayLiteral } from "../shared/data/exerciseCatalogue.js";
import { readFileSync } from "node:fs";

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
/**
 * Reformer work is resistance against a spring. It gives something back, which
 * is what restoration 1 says; it does not give back as much as it asks, which
 * is why it is not `both` and does not belong on the Restore shelf.
 */
check("Pilates builds", categoryOrientation("pilates") === "yang");
check("and still gives something back", categoryLoad("pilates").restoration === 1);
check("an unknown category is neutral, not guessed", categoryOrientation("nonsense") === "neutral");
check("an unknown category has no load", categoryLoad("nonsense").stress === 0);

/**
 * ── Workouts imported from Apple Health / Health Connect ──────────────────
 *
 * The point of the mapping is that it is a *translation*, not a second opinion.
 * An imported run has to reach Build through exactly the model a logged session
 * uses, or the app ends up with two answers to "what does a run cost" and no
 * way to say which is right.
 */
check("a run is endurance", externalActivityCategory("running") === "endurance");
check("and endurance is Build", externalActivityOrientation("running") === "yang");

check("yoga is yoga", externalActivityCategory("yoga") === "yoga");
check("and yoga is Restore", externalActivityOrientation("yoga") === "yin");

check("stretching lands in mobility", externalActivityCategory("flexibility") === "mobility");
check("and mobility is Restore", externalActivityOrientation("flexibility") === "yin");

check("strength training is a full-body session", externalActivityCategory("strength") === "full_body");
/**
 * A walk is not a training session. Mapped to `locomotion` it carried stress 2,
 * which is the definition of demanding, so a member who walks the dog twice a
 * day accumulated "demanding sessions" without training once — and the same
 * movement had already been counted in that day's steps, distance and energy.
 */
check("a hike is real movement", externalActivityCategory("hiking") === "locomotion");
check("and it is demanding", DEMANDING_EXTERNAL_TYPES.includes("hiking"));
check("a walk is easy movement", externalActivityCategory("walking") === "recovery");
check("and a walk is not a demanding session", !DEMANDING_EXTERNAL_TYPES.includes("walking"));
/** Four hours of golf is a long walk, not a boxing match. */
check("golf is not a contact sport", externalActivityCategory("golf") === "locomotion");

/** Case and whitespace come from two different platforms; neither should matter. */
check("the platform's casing is irrelevant", externalActivityCategory(" Running ") === "endurance");

/**
 * The orientation must come from CATEGORY_LOAD, never from a second table.
 * If someone re-tunes what yoga costs, this follows automatically — and this
 * assertion is what proves the two are actually wired together.
 */
for (const [type, category] of Object.entries(EXTERNAL_ACTIVITY_CATEGORY)) {
  check(
    `${type} orients the same way as its category`,
    externalActivityOrientation(type) === categoryOrientation(category),
  );
  check(`${type} maps to a category the load model knows`, categoryLoad(category).stress > 0 || categoryLoad(category).restoration > 0);
}

/**
 * An activity we cannot place contributes nothing.
 *
 * Guessing would feed an invented load into the terrain reading, and a wrong
 * reason there is worse than a missing one — the member is asked to act on it.
 */
check("an unmapped activity has no category", externalActivityCategory("paragliding") === null);
check("and therefore no orientation", externalActivityOrientation("paragliding") === null);
check("'other' is never mapped", externalActivityCategory("other") === null);
check("nothing at all is not a category", externalActivityCategory(null) === null);
check("an empty string is not a category", externalActivityCategory("") === null);

/**
 * The demanding list is derived, not hand-kept. Yoga resetting "nothing
 * demanding in N days" would tell somebody who has stretched for a fortnight
 * that they have been training.
 */
check("running is demanding", DEMANDING_EXTERNAL_TYPES.includes("running"));
check("strength is demanding", DEMANDING_EXTERNAL_TYPES.includes("strength"));
check("yoga is not demanding", !DEMANDING_EXTERNAL_TYPES.includes("yoga"));
check("stretching is not demanding", !DEMANDING_EXTERNAL_TYPES.includes("flexibility"));
check("a cooldown is not demanding", !DEMANDING_EXTERNAL_TYPES.includes("cooldown"));
/**
 * "Demanding" here must mean the same thing it means everywhere else — the
 * stress >= 2 that orientationOfLoad already uses to call something Build.
 * Any other threshold would let an activity reset the "nothing demanding"
 * counter while not counting as Build, which is two definitions of one word.
 */
check(
  "demanding means exactly what Build means",
  DEMANDING_EXTERNAL_TYPES.every((t) =>
    ["yang", "both"].includes(externalActivityOrientation(t)!),
  ),
);
check(
  "and nothing demanding was left out",
  Object.keys(EXTERNAL_ACTIVITY_CATEGORY)
    .filter((t) => ["yang", "both"].includes(externalActivityOrientation(t)!))
    .every((t) => DEMANDING_EXTERNAL_TYPES.includes(t)),
);

// ─── How a session landed, and where the member wants it ───────────────────

/**
 * The whole point of this layer is that the two questions stay apart. A
 * placement moves where a session is shown; it is not an opinion about what the
 * session cost, and nothing in the load model may read it.
 */
/**
 * ── Every word the phones can say, against the table that reads them ──────
 *
 * The expensive property of EXTERNAL_ACTIVITY_CATEGORY is that a missing key
 * fails silently: the workout is stored, shown on the health card, and counted
 * by nothing. Terrain gets no load from it and "nothing demanding in N days"
 * keeps counting. Nobody reports it, because the screen looks fine.
 *
 * That is exactly how "martial arts" and "mind and body" went unmapped — both
 * are emitted by the iOS reader and neither had a key here.
 *
 * So this reads the two native readers and asserts the table covers everything
 * they can emit. It is grep rather than a shared constant because the readers
 * are Swift and Kotlin and cannot import this file; a new `case` in either that
 * nobody maps now fails here instead of on somebody's phone.
 */
console.log("\nEvery activity name the readers emit is mapped\n");

{
  const root = new URL("..", import.meta.url).pathname;
  const swift = readFileSync(
    `${root}plugins/health-sync/ios/Sources/HealthSyncPlugin/HealthSyncEngine.swift`,
    "utf8",
  );
  const kotlin = readFileSync(
    `${root}plugins/health-sync/android/src/main/java/com/sakredbody/healthsync/HealthReader.kt`,
    "utf8",
  );

  // The bodies of the two name functions only, so unrelated string literals
  // elsewhere in either file cannot be mistaken for an activity name.
  const swiftBody = swift.slice(
    swift.indexOf("func activityName"),
    swift.indexOf("// MARK: - Posting"),
  );
  const kotlinBody = kotlin.slice(
    kotlin.indexOf("fun exerciseName"),
    kotlin.indexOf("suspend fun workouts"),
  );

  const names = new Set<string>();
  for (const [, name] of swiftBody.matchAll(/return "([a-z ]+)"/g)) names.add(name);
  for (const [, name] of kotlinBody.matchAll(/->\s*"([a-z ]+)"/g)) names.add(name);
  // `other` is what both readers emit when they do not recognise a type.
  // Mapping it would be inventing a category for an admitted unknown.
  names.delete("other");

  check("the readers were actually parsed", names.size >= 15, `found ${names.size}`);
  for (const name of Array.from(names).sort()) {
    check(`"${name}" has a Sakred category`, externalActivityCategory(name) !== null);
  }
}

console.log("\nHow a session landed, and where the member wants it\n");

check("Sakred reads a run as Build", placementOfOrientation(externalActivityOrientation("running")) === "build");
check("and yoga as Restore", placementOfOrientation(externalActivityOrientation("yoga")) === "restore");
check("and pilates as Build", placementOfOrientation(externalActivityOrientation("pilates")) === "build");
/**
 * Neutral is not a fourth placement. A gentle walk is genuinely neither, and
 * filing it under Build or Restore would be the app asserting something it does
 * not think.
 */
check("neutral has no placement", placementOfOrientation("neutral") === null);
check("and neither does an unplaceable activity", placementOfOrientation(null) === null);

check("with no override, Sakred's reading stands", effectivePlacement("running", null) === "build");
check("the member's choice wins", effectivePlacement("running", "restore") === "restore");
/**
 * Clearing has to return the row to Sakred's reading exactly, with nothing left
 * behind. This is why "system" is not a stored value: there is no third state
 * that could later disagree with the model.
 */
check("clearing returns to Sakred's reading", effectivePlacement("running", null) === "build");
check("an override on an unplaceable activity still places it", effectivePlacement("paragliding", "build") === "build");
check("and without one it stays unplaced", effectivePlacement("paragliding", null) === null);

/**
 * Provenance is derived, never stored. `classification_source` would be a
 * second copy of this and could drift from it.
 */
check("no override means Sakred placed it", placementIsMembers(null) === false);
check("an override means the member did", placementIsMembers("restore") === true);

/**
 * ── The one that matters most ────────────────────────────────────────────
 *
 * A member who says a run restored them still ran. If an override or a response
 * could reach the load model, the app would tell somebody they were fresh on
 * the fourth day of a hard week because they had enjoyed it.
 */
check(
  "a placement override does not change what the activity costs",
  categoryLoad(externalActivityCategory("running")!).stress === CATEGORY_LOAD.endurance.stress,
);
check(
  "and the activity still counts as demanding after being moved to Restore",
  DEMANDING_EXTERNAL_TYPES.includes("running"),
);
/**
 * Structural rather than behavioural, and deliberately so: the load functions
 * take a category and nothing else, so there is no parameter through which a
 * member's answer could arrive. A test that called them with an override would
 * not compile, which is the guarantee worth having.
 */
check("load is a function of category alone", categoryLoad.length === 1);
check("and orientation likewise", categoryOrientation.length === 1);

/** The two vocabularies stay apart — see the note above WORKOUT_PLACEMENTS. */
check("placements are not orientations", !WORKOUT_PLACEMENTS.some((p) => ["yin", "yang"].includes(p)));
check(
  "but they say the same thing to a member",
  PLACEMENT_LABEL.restore === ORIENTATION_LABEL.yin &&
    PLACEMENT_LABEL.build === ORIENTATION_LABEL.yang &&
    PLACEMENT_LABEL.both === ORIENTATION_LABEL.both,
);
check("every orientation with a side maps to a placement", ["yin", "yang", "both"].every((o) =>
  WORKOUT_PLACEMENTS.includes(placementOfOrientation(o as never)!),
));

// ── What the API will accept ──

check("a response is accepted", workoutFeedbackSchema.safeParse({ response: "restored" }).success);
check("all three responses are", WORKOUT_RESPONSES.every((r) =>
  workoutFeedbackSchema.safeParse({ response: r }).success,
));
check("all three placements are", WORKOUT_PLACEMENTS.every((p) =>
  workoutFeedbackSchema.safeParse({ placement: p }).success,
));
check("an invented response is not", !workoutFeedbackSchema.safeParse({ response: "great" }).success);
check("an orientation is not a placement", !workoutFeedbackSchema.safeParse({ placement: "yang" }).success);

/**
 * Null clears, absent leaves alone. Without both, an answer to "how did that
 * land" could be given once and never taken back.
 */
check("null clears a response", workoutFeedbackSchema.safeParse({ response: null }).success);
check("null clears a placement", workoutFeedbackSchema.safeParse({ placement: null }).success);
{
  const parsed = workoutFeedbackSchema.safeParse({ response: null });
  check("and a cleared response is null, not missing", parsed.success && parsed.data.response === null);
  check("while the field left out stays undefined", parsed.success && parsed.data.placement === undefined);
}
check("an empty body changes nothing and is refused", !workoutFeedbackSchema.safeParse({}).success);

/**
 * Nothing a sensor measured can be written here. An endpoint that accepted a
 * duration would quietly turn imported measurements into self-reported ones.
 */
for (const field of ["durationSeconds", "distanceMeters", "activeCalories", "workoutType", "userId"]) {
  const parsed = workoutFeedbackSchema.safeParse({ response: "steady", [field]: 999 });
  check(`${field} is not writable through feedback`, parsed.success && !(field in parsed.data));
}


// ─── History, summarised rather than stacked ─────────────────────────────

/*
  Build shows this week unfiltered and then thirty days of training, so the
  rows a member has just read reappear immediately underneath as the top of the
  longer list. Neither panel is wrong — the week is everything, the history is
  Build — but reading the same six activities twice on the way down one screen
  is what it felt like, and it was thirty days of rows rendered because the API
  had already returned them.
*/
const entry = (placement: SummarisableEntry["placement"], seconds: number | null): SummarisableEntry =>
  ({ placement, seconds });

check("a short list is shown, not folded behind a count", !foldsAt(3, 0));
check("and so is one exactly at the floor", !foldsAt(WALL, 0));
check("a wall of activity folds", foldsAt(WALL + 1, 0));
check("a preview larger than the floor wins", !foldsAt(6, 8));
check("a panel that asked for no folding never folds", !foldsAt(40, undefined));

check(
  "the summary counts what it is about to hide",
  summarise([entry("build", 600), entry("build", 900)]).startsWith("2 sessions"),
  summarise([entry("build", 600), entry("build", 900)]),
);
check("and says session, singular, when there is one", summarise([entry("build", 600)]).startsWith("1 session ") ||
  summarise([entry("build", 600)]) === "1 session · 10m", summarise([entry("build", 600)]));
check(
  "a mixed window says how it was mixed",
  summarise([entry("build", 600), entry("restore", 600)]).includes("1 Build · 1 Restore"),
);
/* `both` is genuinely both — a long walk is movement and it is restorative. */
check(
  "an activity that is both is counted on both sides",
  summarise([entry("both", 600), entry("build", 600)]).includes("2 Build · 1 Restore"),
);
check(
  "a window that is all one thing does not announce a split",
  !summarise([entry("build", 600), entry("build", 600)]).includes("Build ·"),
);

/*
  A Sakred session records no duration — nothing writes a start time — so a
  window containing one cannot be totalled. Adding up the imported half and
  presenting it as the week is the sort of number somebody plans around.
*/
check(
  "time is reported when every entry can be counted",
  summarise([entry("build", 1800), entry("build", 1800)]).includes("1h 0m"),
  summarise([entry("build", 1800), entry("build", 1800)]),
);
check(
  "and omitted entirely when one cannot",
  summarise([entry("build", 1800), entry(null, null)]) === "2 sessions",
  summarise([entry("build", 1800), entry(null, null)]),
);
check("under an hour reads in minutes", summarise([entry("build", 900)]).includes("15m"));

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
