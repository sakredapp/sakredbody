/**
 * Goals — what counts as evidence, and what must never.
 *
 * The dangerous failure here is not a crash. It is a member opening their
 * goals and finding a mile time they never ran, because a 45-minute jog was
 * close enough to something. Progress that is invented is worse than progress
 * that is missing: missing progress looks like missing progress, and invented
 * progress looks like an achievement.
 *
 * So most of this file is about refusals.
 *
 * Pure functions and schemas only — no database.
 *
 * Run: tsx script/test-goals.ts
 */

import {
  MEASUREMENTS,
  GOAL_STATUSES,
  GOAL_EMPHASES,
  parseTarget,
  improvesDownward,
  comparable,
  sameDistance,
  scalarOf,
  meetsTarget,
  summariseGoal,
  targetAsOf,
  evidenceFromSet,
  evidenceFromActivity,
  clockTime,
  distanceLabel,
  durationLabel,
  formatMeasurement,
  MEASUREMENT_LABELS,
  createGoalInput,
  updateGoalInput,
  recordProgressInput,
  type GoalTarget,
  type MatchableGoal,
  type CanonicalSet,
  type CanonicalActivity,
  type Measurement,
} from "../shared/models/goals.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const MILE = 1609.34;
const LB = 0.45359237;

/** The five goals the brief names, as rows. */
const mile: MatchableGoal = {
  id: "g-mile",
  status: "active",
  measurement: "time_for_distance",
  target: { distanceM: MILE, seconds: 360 },
  exerciseId: null,
  activityType: "running",
};
const skierg: MatchableGoal = {
  id: "g-ski",
  status: "active",
  measurement: "time_for_distance",
  target: { distanceM: 1000, seconds: 210 },
  exerciseId: "ski-erg",
  activityType: null,
};
const pullups: MatchableGoal = {
  id: "g-pull",
  status: "active",
  measurement: "reps",
  target: { reps: 15 },
  exerciseId: "pull-up",
  activityType: null,
};
const bench: MatchableGoal = {
  id: "g-bench",
  status: "active",
  measurement: "load_reps",
  target: { weightKg: 225 * LB, reps: 1 },
  exerciseId: "barbell-bench-press",
  activityType: null,
};
const yoga: MatchableGoal = {
  id: "g-yoga",
  status: "active",
  measurement: "duration",
  target: { seconds: 3600 },
  exerciseId: null,
  activityType: "yoga",
};

const set = (over: Partial<CanonicalSet>): CanonicalSet => ({
  id: "s1",
  exerciseId: "pull-up",
  reps: null,
  durationSeconds: null,
  distanceM: null,
  weightKg: 0,
  isWarmup: false,
  ...over,
});
const activity = (over: Partial<CanonicalActivity>): CanonicalActivity => ({
  externalId: "hk-1",
  workoutType: "running",
  durationSeconds: null,
  distanceMeters: null,
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nThe vocabulary is closed\n");

check("seven measurement kinds", MEASUREMENTS.length === 7);
check("four statuses", GOAL_STATUSES.length === 4);
check(
  "emphasis reuses the placement words rather than inventing a fourth vocabulary",
  GOAL_EMPHASES.join(",") === "restore,build,both",
  GOAL_EMPHASES.join(","),
);
check(
  "every kind has a label a member could read",
  MEASUREMENTS.every((m) => (MEASUREMENT_LABELS[m] ?? "").length > 0),
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nA target has to fit the kind it claims to be\n");

check("a mile time parses", parseTarget("time_for_distance", { distanceM: MILE, seconds: 360 }) !== null);
check(
  "a mile time without the mile does not",
  parseTarget("time_for_distance", { seconds: 360 }) === null,
);
check("reps parse", parseTarget("reps", { reps: 15 }) !== null);
check("half a rep does not", parseTarget("reps", { reps: 15.5 }) === null);
check("zero reps do not", parseTarget("reps", { reps: 0 }) === null);
check("a negative time does not", parseTarget("duration", { seconds: -1 }) === null);
check(
  "a reps payload is refused as a duration",
  parseTarget("duration", { reps: 15 }) === null,
);
check("an unknown kind is refused", parseTarget("vibes", { amount: 1 }) === null);
check(
  "custom has to say which way is better",
  parseTarget("custom", { amount: 5, unit: "sessions" }) === null,
);
check(
  "and parses when it does",
  parseTarget("custom", { amount: 5, unit: "sessions", direction: "up" }) !== null,
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nWhich way is better\n");

check("a time goes down", improvesDownward("time_for_distance", mile.target));
check("reps go up", !improvesDownward("reps", pullups.target));
check("load goes up", !improvesDownward("load_reps", bench.target));
check("a duration goes up", !improvesDownward("duration", yoga.target));
check(
  "custom is told",
  improvesDownward("custom", { amount: 3, unit: "coffees", direction: "down" } as GoalTarget),
);
check(
  "and told the other way",
  !improvesDownward("custom", { amount: 3, unit: "walks", direction: "up" } as GoalTarget),
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nComparing two things that are the same thing\n");

check("a mile is a mile", sameDistance(MILE, 1609));
check("and 1600 metres is the mile somebody typed", sameDistance(MILE, 1600));
check("1500 metres is a different race", !sameDistance(MILE, 1500));
check("5K is not a mile", !sameDistance(MILE, 5000));
check("zero is not a distance", !sameDistance(MILE, 0));

check(
  "a 400m time is not evidence about a mile",
  !comparable("time_for_distance", mile.target, { distanceM: 400, seconds: 62 } as GoalTarget),
);
check(
  "a mile time is",
  comparable("time_for_distance", mile.target, { distanceM: 1609, seconds: 395 } as GoalTarget),
);
check(
  "a heavy triple counts toward a single",
  comparable("load_reps", bench.target, { weightKg: 100, reps: 3 } as GoalTarget),
);
check(
  "and a set of twenty does not",
  !comparable("load_reps", { weightKg: 100, reps: 5 } as GoalTarget, {
    weightKg: 40,
    reps: 1,
  } as GoalTarget),
);
check(
  "a custom goal in different units is a different goal",
  !comparable("custom", { amount: 3, unit: "miles", direction: "up" } as GoalTarget, {
    amount: 3,
    unit: "km",
    direction: "up",
  } as GoalTarget),
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nReaching a target\n");

check(
  "6:00 on the nose reaches a six-minute mile",
  meetsTarget("time_for_distance", mile.target, { distanceM: MILE, seconds: 360 } as GoalTarget),
);
check(
  "5:58 reaches it",
  meetsTarget("time_for_distance", mile.target, { distanceM: MILE, seconds: 358 } as GoalTarget),
);
check(
  "6:28 does not",
  !meetsTarget("time_for_distance", mile.target, { distanceM: MILE, seconds: 388 } as GoalTarget),
);
check("13 pull-ups do not reach 15", !meetsTarget("reps", pullups.target, { reps: 13 } as GoalTarget));
check("15 do", meetsTarget("reps", pullups.target, { reps: 15 } as GoalTarget));
check("17 do", meetsTarget("reps", pullups.target, { reps: 17 } as GoalTarget));
check(
  "225 × 1 reaches a 225 × 1 goal",
  meetsTarget("load_reps", bench.target, { weightKg: 225 * LB, reps: 1 } as GoalTarget),
);
check(
  "215 × 1 does not",
  !meetsTarget("load_reps", bench.target, { weightKg: 215 * LB, reps: 1 } as GoalTarget),
);
/*
  The one that matters most.

  185 for five is a real set and Epley calls it a 216 lb single. The estimate
  exists in this repository and is deliberately not consulted here: a member
  who has never held 225 must not be told they have reached a 225 goal.
*/
check(
  "and a rep estimate does not reach it either — 185 × 5 is not a 225 single",
  !meetsTarget("load_reps", bench.target, { weightKg: 185 * LB, reps: 5 } as GoalTarget),
);
check(
  "47 minutes does not reach an hour of yoga",
  !meetsTarget("duration", yoga.target, { seconds: 2820 } as GoalTarget),
);
check("60 minutes does", meetsTarget("duration", yoga.target, { seconds: 3600 } as GoalTarget));
check(
  "a frequency compares as a rate — 8 a fortnight equals 4 a week",
  meetsTarget(
    "frequency",
    { count: 4, perDays: 7 } as GoalTarget,
    { count: 8, perDays: 14 } as GoalTarget,
  ),
);
check(
  "and 3 a week does not reach 4",
  !meetsTarget(
    "frequency",
    { count: 4, perDays: 7 } as GoalTarget,
    { count: 3, perDays: 7 } as GoalTarget,
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nLatest and best are different questions\n");

const obs = (day: string, value: GoalTarget, measurement = "time_for_distance", source = "member") => ({
  observedAt: `2026-08-${day}T12:00:00.000Z`,
  measurement,
  value,
  source,
});

const runs = [
  obs("28", { distanceM: MILE, seconds: 402 } as GoalTarget),
  obs("24", { distanceM: MILE, seconds: 388 } as GoalTarget),
  obs("10", { distanceM: MILE, seconds: 395 } as GoalTarget),
];
const summary = summariseGoal(mile, runs);
check("latest is the most recent, not the best", summary.latest?.observedAt.startsWith("2026-08-28") === true);
check("best is the fastest, not the most recent", summary.best?.observedAt.startsWith("2026-08-24") === true);
check("all three counted", summary.counted === 3);
check("none discarded", summary.incomparable === 0);
check("and the target is not reached", !summary.reached);

/*
  A bad week is not evidence that the good day was a fluke.

  This is why `best` is derived from history rather than kept in a column: the
  cheap version stores the current value, and a member who ran 6:28 in August
  and 6:42 in September would have no record that the 6:28 happened.
*/
const worse = summariseGoal(mile, [...runs, obs("30", { distanceM: MILE, seconds: 420 } as GoalTarget)]);
check("a slow run becomes the latest", worse.latest?.observedAt.startsWith("2026-08-30") === true);
check("and does not touch the best", worse.best?.observedAt.startsWith("2026-08-24") === true);

const mixed = summariseGoal(mile, [
  ...runs,
  obs("26", { distanceM: 400, seconds: 62 } as GoalTarget),
  obs("27", { seconds: 1200 } as GoalTarget, "duration"),
]);
check("a 400m repeat is not counted", mixed.counted === 3);
check("but it is reported rather than swallowed", mixed.incomparable === 2, String(mixed.incomparable));

check("an empty history has no best", summariseGoal(mile, []).best === null);
check("and reaches nothing", !summariseGoal(mile, []).reached);
check(
  "a target reached shows as reached",
  summariseGoal(mile, [obs("29", { distanceM: MILE, seconds: 359 } as GoalTarget)]).reached,
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nAn old observation is read against the old target\n");

const revisions = [
  { createdAt: "2026-06-01T00:00:00.000Z", target: { distanceM: MILE, seconds: 420 } as GoalTarget },
  { createdAt: "2026-08-01T00:00:00.000Z", target: { distanceM: MILE, seconds: 360 } as GoalTarget },
  { createdAt: "2026-07-01T00:00:00.000Z", target: { distanceM: MILE, seconds: 390 } as GoalTarget },
];
const inJuly = targetAsOf(revisions, "2026-07-15T00:00:00.000Z");
check("July's run is judged against July's target", (inJuly?.target as { seconds: number })?.seconds === 390);
check(
  "and today's against today's",
  (targetAsOf(revisions, "2026-08-27T00:00:00.000Z")?.target as { seconds: number })?.seconds === 360,
);
check(
  "before the first revision there is nothing to judge against",
  targetAsOf(revisions, "2026-01-01T00:00:00.000Z") === null,
);
check("revisions need not arrive in order", (inJuly?.target as { seconds: number })?.seconds === 390);

/*
  The failure this table exists to prevent.

  A 6:42 in June beat June's seven-minute target — it was the run that earned
  the member the right to move the target down. Read against today's
  six-minute target it is a miss by forty-two seconds. Without revisions,
  getting ambitious silently rewrites a member's own history into a record of
  failure, and the better they get the worse their past looks.
*/
const juneRun = { distanceM: MILE, seconds: 402 } as GoalTarget;
const inJune = targetAsOf(revisions, "2026-06-15T00:00:00.000Z");
check("June is judged against June", (inJune?.target as { seconds: number })?.seconds === 420);
check(
  "6:42 in June met the target it was run under",
  meetsTarget("time_for_distance", inJune!.target, juneRun),
);
check(
  "and does not meet today's",
  !meetsTarget("time_for_distance", { distanceM: MILE, seconds: 360 } as GoalTarget, juneRun),
);
check(
  "nor July's, which is the middle case that proves the lookup is not just first-or-last",
  !meetsTarget("time_for_distance", inJuly!.target, juneRun),
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nA logged set as evidence\n");

check(
  "13 pull-ups move a pull-up goal",
  JSON.stringify(evidenceFromSet(pullups, set({ exerciseId: "pull-up", reps: 13 }))) ===
    JSON.stringify({ reps: 13 }),
);
check(
  "225 × 1 moves a bench goal",
  JSON.stringify(
    evidenceFromSet(bench, set({ exerciseId: "barbell-bench-press", reps: 1, weightKg: 225 * LB })),
  ) === JSON.stringify({ weightKg: 225 * LB, reps: 1 }),
);
check(
  "a different movement does not",
  evidenceFromSet(pullups, set({ exerciseId: "chin-up", reps: 13 })) === null,
);
/*
  A name is not an identity. "Bench Press" and "Bench Press (Smith machine)"
  match on every string comparison anybody would write and are not the same
  lift; the catalogue slug is the only thing that can tell them apart.
*/
check(
  "nor does a movement whose name merely starts the same way",
  evidenceFromSet(bench, set({ exerciseId: "barbell-bench-press-smith", reps: 1, weightKg: 120 })) ===
    null,
);
check(
  "a warm-up is not a proof",
  evidenceFromSet(pullups, set({ exerciseId: "pull-up", reps: 13, isWarmup: true })) === null,
);
check(
  "a set with no reps cannot move a reps goal",
  evidenceFromSet(pullups, set({ exerciseId: "pull-up", durationSeconds: 60 })) === null,
);
check(
  "an unloaded set cannot move a load goal",
  evidenceFromSet(bench, set({ exerciseId: "barbell-bench-press", reps: 1, weightKg: 0 })) === null,
);
check(
  "a paused goal collects nothing automatically",
  evidenceFromSet({ ...pullups, status: "paused" }, set({ exerciseId: "pull-up", reps: 13 })) === null,
);
check(
  "an archived goal collects nothing",
  evidenceFromSet({ ...pullups, status: "archived" }, set({ exerciseId: "pull-up", reps: 13 })) === null,
);
check(
  "a SkiErg piece moves the SkiErg goal, because it was logged as one",
  JSON.stringify(
    evidenceFromSet(skierg, set({ exerciseId: "ski-erg", distanceM: 1000, durationSeconds: 218 })),
  ) === JSON.stringify({ distanceM: 1000, seconds: 218 }),
);
check(
  "a frequency goal is never filled in from one set",
  evidenceFromSet(
    { ...pullups, measurement: "frequency", target: { count: 3, perDays: 7 } as GoalTarget },
    set({ exerciseId: "pull-up", reps: 13 }),
  ) === null,
);
check(
  "nor is a custom one",
  evidenceFromSet(
    {
      ...pullups,
      measurement: "custom",
      target: { amount: 3, unit: "sessions", direction: "up" } as GoalTarget,
    },
    set({ exerciseId: "pull-up", reps: 13 }),
  ) === null,
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nAn imported activity as evidence, and mostly not\n");

check(
  "47 minutes of yoga moves a yoga goal",
  JSON.stringify(evidenceFromActivity(yoga, activity({ workoutType: "yoga", durationSeconds: 2820 }))) ===
    JSON.stringify({ seconds: 2820 }),
);
check(
  "a mile run at the mile distance moves a mile goal",
  JSON.stringify(
    evidenceFromActivity(mile, activity({ workoutType: "running", durationSeconds: 395, distanceMeters: 1609 })),
  ) === JSON.stringify({ distanceM: 1609, seconds: 395 }),
);

/* The four refusals the brief names, in order. */
check(
  "a 45-minute run does not become a mile time",
  evidenceFromActivity(mile, activity({ workoutType: "running", durationSeconds: 2700 })) === null,
);
check(
  "nor does a 5K, however fast",
  evidenceFromActivity(
    mile,
    activity({ workoutType: "running", durationSeconds: 1200, distanceMeters: 5000 }),
  ) === null,
);
check(
  "Functional Strength Training does not become bench press",
  evidenceFromActivity(
    { ...bench, exerciseId: null, activityType: "strength" },
    activity({ workoutType: "strength", durationSeconds: 3120 }),
  ) === null,
);
check(
  "no activity of any kind produces a load",
  MEASUREMENTS.every(
    (m) =>
      m === "load_reps"
        ? evidenceFromActivity(
            { ...yoga, measurement: "load_reps", target: { weightKg: 100, reps: 1 } as GoalTarget },
            activity({ workoutType: "yoga", durationSeconds: 3600 }),
          ) === null
        : true,
  ),
);
check(
  "nor a rep count",
  evidenceFromActivity(
    { ...yoga, measurement: "reps", target: { reps: 15 } as GoalTarget },
    activity({ workoutType: "yoga", durationSeconds: 3600 }),
  ) === null,
);
/*
  The SkiErg case, which is the subtle one.

  A rowing machine in the shed produces `rowing` sessions of about a kilometre.
  Same measurement kind, same distance, wrong machine — and the phone cannot
  tell. A goal that names a catalogue movement is proved by a logged set of
  that movement and by nothing else.
*/
check(
  "a rowing session does not become a SkiErg time",
  evidenceFromActivity(
    { ...skierg, activityType: "rowing" },
    activity({ workoutType: "rowing", durationSeconds: 218, distanceMeters: 1000 }),
  ) === null,
);
check(
  "a wrong activity type does nothing",
  evidenceFromActivity(yoga, activity({ workoutType: "running", durationSeconds: 2820 })) === null,
);
check(
  "an activity with no type does nothing",
  evidenceFromActivity(yoga, activity({ workoutType: null, durationSeconds: 2820 })) === null,
);
check(
  "a paused goal collects nothing from a sync either",
  evidenceFromActivity({ ...yoga, status: "paused" }, activity({ workoutType: "yoga", durationSeconds: 2820 })) ===
    null,
);
check(
  "casing and stray space in the platform's word still match",
  evidenceFromActivity(yoga, activity({ workoutType: " Yoga ", durationSeconds: 2820 })) !== null,
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nSaying it the way a person would\n");

check("6:00", clockTime(360) === "6:00");
check("6:28", clockTime(388) === "6:28");
check("under a minute still has a minutes place", clockTime(42) === "0:42");
check("past an hour", clockTime(5400) === "1:30:00");
check("a mile is called a mile", distanceLabel(MILE) === "mile");
check("and so is 1600 metres", distanceLabel(1600) === "mile");
check("5K", distanceLabel(5000) === "5K");
check("a marathon", distanceLabel(42195) === "marathon");
check("800 metres is metres", distanceLabel(800) === "800 m");
check("3 kilometres is kilometres", distanceLabel(3000) === "3 km");
check("an hour of yoga reads in minutes", durationLabel(3600) === "60 min");
check("47 minutes too", durationLabel(2820) === "47 min");
check("and 47:30 reads on the clock", durationLabel(2850) === "47:30");

check(
  "a mile goal reads as a time and a distance",
  formatMeasurement("time_for_distance", mile.target) === "6:00 · mile",
  formatMeasurement("time_for_distance", mile.target),
);
check(
  "a bench goal reads in the member's own pounds",
  formatMeasurement("load_reps", bench.target, "lb") === "225 lb × 1",
  formatMeasurement("load_reps", bench.target, "lb"),
);
check(
  "and in kilograms for a member who thinks in kilograms",
  formatMeasurement("load_reps", bench.target, "kg") === "102 kg × 1",
  formatMeasurement("load_reps", bench.target, "kg"),
);
check("pull-ups read as a number", formatMeasurement("reps", pullups.target) === "15");
check("yoga reads as minutes", formatMeasurement("duration", yoga.target) === "60 min");
check(
  "a frequency reads in weeks",
  formatMeasurement("frequency", { count: 4, perDays: 7 } as GoalTarget) === "4× a week",
  formatMeasurement("frequency", { count: 4, perDays: 7 } as GoalTarget),
);
check(
  "every kind can be said out loud",
  MEASUREMENTS.every((m) => {
    const sample: Record<Measurement, GoalTarget> = {
      time_for_distance: { distanceM: MILE, seconds: 360 },
      reps: { reps: 15 },
      load_reps: { weightKg: 100, reps: 1 },
      duration: { seconds: 3600 },
      distance: { distanceM: 5000 },
      frequency: { count: 4, perDays: 7 },
      custom: { amount: 3, unit: "sessions", direction: "up" },
    };
    return formatMeasurement(m, sample[m]).length > 0;
  }),
);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nWhat the API will accept\n");

const goodGoal = {
  title: "Six-minute mile",
  measurement: "time_for_distance",
  target: { distanceM: MILE, seconds: 360 },
  activityType: "running",
};
check("a well-formed goal", createGoalInput.safeParse(goodGoal).success);
check("emphasis defaults to build", createGoalInput.parse(goodGoal).emphasis === "build");
check(
  "a target that does not fit its kind is refused",
  !createGoalInput.safeParse({ ...goodGoal, target: { reps: 15 } }).success,
);
check("a goal needs a title", !createGoalInput.safeParse({ ...goodGoal, title: "  " }).success);
check(
  "a goal is about a movement or an activity, never both",
  !createGoalInput.safeParse({ ...goodGoal, exerciseId: "ski-erg" }).success,
);
check(
  "a movement-only goal is fine",
  createGoalInput.safeParse({
    title: "15 pull-ups",
    measurement: "reps",
    target: { reps: 15 },
    exerciseId: "pull-up",
  }).success,
);
check(
  "a goal about nothing in particular is fine too",
  createGoalInput.safeParse({
    title: "Move most days",
    measurement: "frequency",
    target: { count: 5, perDays: 7 },
  }).success,
);
check(
  "a nonsense date is refused",
  !createGoalInput.safeParse({ ...goodGoal, targetDate: "next spring" }).success,
);
check("a real one is not", createGoalInput.safeParse({ ...goodGoal, targetDate: "2026-12-31" }).success);
check(
  "status can be changed to any of the four",
  GOAL_STATUSES.every((s) => updateGoalInput.safeParse({ status: s }).success),
);
check("and not to a fifth", !updateGoalInput.safeParse({ status: "crushing_it" }).success);
check("progress can be recorded with just a value", recordProgressInput.safeParse({ value: { reps: 13 } }).success);
check(
  "and with a moment it happened",
  recordProgressInput.safeParse({ value: { reps: 13 }, observedAt: "2026-08-27T09:00:00.000Z" }).success,
);
check(
  "but not with a moment that is not one",
  !recordProgressInput.safeParse({ value: { reps: 13 }, observedAt: "yesterday" }).success,
);

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} goal assertions passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
