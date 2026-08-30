/**
 * What the number in the weight box means.
 *
 * ── The ambiguity these settle ────────────────────────────────────────────
 *
 * A phone showed:
 *
 *     Dumbbell Bench Press
 *     [70]  [reps]
 *
 * No unit, and no indication whether 70 was in each hand or altogether. Those
 * are a factor of two apart in every derived number the product has, and the
 * Room was publishing the result of guessing: "5,361 kg moved".
 *
 * ── The trap ─────────────────────────────────────────────────────────────
 *
 * There are two separate reasons a set can be worth twice its entered number,
 * and the wrong fix applies both:
 *
 *     dumbbell bench, 70 each      two limbs loaded, one performance
 *     one-arm pushdown, 30 a side  one limb loaded, two performances
 *
 * A model that multiplies by `per_limb` and again by `unilateral` quadruples
 * the second. Half of what follows is about that one multiplication.
 */
import { readFileSync } from "node:fs";
import { numericDraft,
  defaultLoadEntry,
  enteredLoadLabel,
  estimateOneRepMax,
  externalLoadKg,
  loadEntryLabel,
  loadEntryKnown,
  loadShape,
  priorSummary,
  setVolumeKg,
  summariseSession,
  LOAD_ENTRIES,
} from "../shared/models/training.js";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
const section = (t: string) => console.log(`\n${t}\n`);

/** A file with its prose removed, so a comment cannot satisfy a grep for the
    rule it explains. That has happened here before. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ── The three worked examples ──────────────────────────────────────────────
section("The three the brief names");

/*
  Dumbbell bench, 70 lb in each hand, 8 reps. 140 lb is in the air, once.
  Working in kg throughout: 31.75 each hand.
*/
{
  const v = setVolumeKg({
    reps: 8, enteredKg: 31.75, loadEntry: "per_limb",
    unilateral: false, bodyweightFactor: 0, bodyweightKg: 80,
  });
  check("dumbbell bench counts both hands", Math.round(v) === Math.round(8 * 63.5), String(v));
  check(
    "and the entered number is not rewritten",
    enteredLoadLabel(70, "lb", "per_limb", false) === "70 lb each",
    enteredLoadLabel(70, "lb", "per_limb", false),
  );
}

/* Barbell bench, 225 lb total, 5 reps. One bar, one performance. */
{
  const v = setVolumeKg({
    reps: 5, enteredKg: 102, loadEntry: "total",
    unilateral: false, bodyweightFactor: 0, bodyweightKg: 80,
  });
  check("a barbell is not doubled", Math.round(v) === Math.round(5 * 102), String(v));
  check("and says nothing about sides", enteredLoadLabel(225, "lb", "total", false) === "225 lb");
}

/*
  One-arm cable pushdown, 30 lb per side, 10 reps a side. One hand at a time,
  the set done twice. 30 × 10 × 2 — NOT 30 × 2 × 10 × 2.
*/
{
  const shape = loadShape("per_limb", true);
  check("a one-sided movement loads one limb", shape.limbs === 1, JSON.stringify(shape));
  check("and is performed twice", shape.performances === 2, JSON.stringify(shape));
  const v = setVolumeKg({
    reps: 10, enteredKg: 13.6, loadEntry: "per_limb",
    unilateral: true, bodyweightFactor: 0, bodyweightKg: 80,
  });
  check("so it counts once per side, not four times", Math.round(v) === Math.round(10 * 2 * 13.6), String(v));
  check("and it is called per side", loadEntryLabel("per_limb", true) === "per side");
}

// ── The double-multiplication itself ───────────────────────────────────────
section("No double multiplication");

/*
  The whole point, stated as an invariant: a set is never worth more than
  twice its naive reps × entered load. Two limbs OR two performances, never
  both. This is the assertion that fails if somebody later multiplies in the
  obvious place.
*/
for (const entry of LOAD_ENTRIES) {
  for (const unilateral of [false, true]) {
    const naive = 10 * 20;
    const v = setVolumeKg({
      reps: 10, enteredKg: 20, loadEntry: entry,
      unilateral, bodyweightFactor: 0, bodyweightKg: null,
    });
    check(
      `${entry}/${unilateral ? "one side" : "both"} is at most twice the naive figure`,
      v <= naive * 2 + 0.001,
      `${v} vs ${naive}`,
    );
    check(
      `${entry}/${unilateral ? "one side" : "both"} is at least the naive figure`,
      v >= naive - 0.001,
      `${v} vs ${naive}`,
    );
  }
}

check(
  "a total-entry bilateral movement is exactly the naive figure",
  setVolumeKg({ reps: 10, enteredKg: 20, loadEntry: "total", unilateral: false,
    bodyweightFactor: 0, bodyweightKg: null }) === 200,
);

// ── Bodyweight does not double with the dumbbells ──────────────────────────
section("Bodyweight");

/*
  A weighted pull-up with a dumbbell between the feet is one body and one
  dumbbell. If the member's body were multiplied by the limb count, an 80kg
  member holding 10kg per hand would be recorded at 180kg of body.
*/
{
  const v = setVolumeKg({
    reps: 5, enteredKg: 10, loadEntry: "per_limb",
    unilateral: false, bodyweightFactor: 1, bodyweightKg: 80,
  });
  check("the body is counted once, the load twice", v === 5 * (20 + 80), String(v));
}
{
  const v = setVolumeKg({
    reps: 5, enteredKg: 0, loadEntry: "total",
    unilateral: false, bodyweightFactor: 1, bodyweightKg: 80,
  });
  check("an unweighted bodyweight set is still work", v === 400, String(v));
}
check(
  "no bodyweight recorded is not zero body and not a crash",
  setVolumeKg({ reps: 5, enteredKg: 40, loadEntry: "total", unilateral: false,
    bodyweightFactor: 1, bodyweightKg: null }) === 200,
);

// ── Degenerate input ───────────────────────────────────────────────────────
section("Nothing to count");

check("a set with no reps counts nothing",
  setVolumeKg({ reps: null, enteredKg: 40, loadEntry: "total", unilateral: false,
    bodyweightFactor: 0, bodyweightKg: null }) === 0);
check("a timed set counts nothing here",
  setVolumeKg({ reps: 0, enteredKg: 40, loadEntry: "total", unilateral: false,
    bodyweightFactor: 0, bodyweightKg: null }) === 0);
check("a negative load is not negative work",
  setVolumeKg({ reps: 5, enteredKg: -40, loadEntry: "total", unilateral: false,
    bodyweightFactor: 0, bodyweightKg: null }) === 0);
check("an unrecognised entry mode is treated as total, not as double",
  setVolumeKg({ reps: 5, enteredKg: 40, loadEntry: "nonsense", unilateral: false,
    bodyweightFactor: 0, bodyweightKg: null }) === 200);
check("external load ignores a load that is not a number",
  externalLoadKg(Number.NaN, "per_limb", false) === 0);

// ── Defaults are defaults ──────────────────────────────────────────────────
section("Catalogue defaults");

check("a dumbbell is read per hand", defaultLoadEntry("dumbbell") === "per_limb");
check("a kettlebell too", defaultLoadEntry("kettlebell") === "per_limb");
check("a barbell is one load", defaultLoadEntry("barbell") === "total");
check("a machine is one load", defaultLoadEntry("machine") === "total");
check("a cable is one load", defaultLoadEntry("cable") === "total");
check("and equipment nobody listed is one load", defaultLoadEntry("kayak") === "total");

/* Wording follows the movement, not the column. */
check("both-together per-limb reads as each", loadEntryLabel("per_limb", false) === "each");
check("one-at-a-time per-limb reads as per side", loadEntryLabel("per_limb", true) === "per side");
check("total reads as total either way", loadEntryLabel("total", true) === "total");

// ── History is not reinterpreted ───────────────────────────────────────────
section("A workout that was never asked keeps its arithmetic");

/*
  The defect this section exists to prevent.

  `exercises.load_entry` is a setting — how a movement should be entered from
  now on. If history read it, then correcting that setting today would rewrite
  what a workout six months ago is supposed to have weighed, and nobody would
  be told. Equipment makes "70 per hand" likely for a dumbbell. Likely is not a
  record.

  So the interpretation is snapshotted onto `session_exercises` when a movement
  enters a session, and null there means the session predates the question.
  Null must reproduce, exactly, the arithmetic the product used before this
  feature: `reps × weight`, with `unilateral` multiplying nothing. That is not
  remembered — it is the code at d1bd71a^, where `summarise` read
  `s.weightKg * (s.reps ?? 0)` and `unilateral` was a column with no consumer.
*/

const LEGACY_DUMBBELL = {
  reps: 8, enteredKg: 31.75, loadEntry: null,
  unilateral: false, bodyweightFactor: 0, bodyweightKg: null,
};
check("an old dumbbell set counts what it always counted",
  setVolumeKg(LEGACY_DUMBBELL) === 8 * 31.75,
  String(setVolumeKg(LEGACY_DUMBBELL)));
check("and not the per-limb reading of it",
  setVolumeKg(LEGACY_DUMBBELL) !== setVolumeKg({ ...LEGACY_DUMBBELL, loadEntry: "per_limb" }));

const LEGACY_ONE_ARM = {
  reps: 10, enteredKg: 13.6, loadEntry: null,
  unilateral: true, bodyweightFactor: 0, bodyweightKg: null,
};
check("an old one-armed set is not retroactively doubled either",
  setVolumeKg(LEGACY_ONE_ARM) === 10 * 13.6,
  String(setVolumeKg(LEGACY_ONE_ARM)));

check("undefined is the same admission as null",
  setVolumeKg({ ...LEGACY_DUMBBELL, loadEntry: undefined }) === 8 * 31.75);

/* The shape itself, said directly, so the reason survives a refactor. */
check("legacy loads one limb", loadShape(null, false).limbs === 1);
check("legacy performs once", loadShape(null, false).performances === 1);
check("legacy performs once even one-sided", loadShape(null, true).performances === 1);
check("and legacy loads one limb even one-sided", loadShape(null, true).limbs === 1);

/*
  The other half of the same rule: changing the catalogue must not be able to
  reach a session that already recorded its own answer. There is no code path
  here to exercise — the snapshot is a column — so what is asserted is that the
  two inputs are genuinely independent, which is what stops a future reader
  passing the catalogue value in by habit.
*/
const RECORDED_TOTAL = {
  reps: 8, enteredKg: 31.75, loadEntry: "total",
  unilateral: false, bodyweightFactor: 0, bodyweightKg: null,
};
check("a session that recorded 'total' stays 70 altogether",
  setVolumeKg(RECORDED_TOTAL) === 8 * 31.75);
check("a session that recorded 'per limb' stays 70 each",
  setVolumeKg({ ...RECORDED_TOTAL, loadEntry: "per_limb" }) === 8 * 31.75 * 2);
/*
  The two per-limb routes both arrive at twice, by different arithmetic — two
  limbs loaded once, or one limb loaded twice. That they agree is the correct
  answer and the reason the naive fix quadruples: a version multiplying by both
  would put 2,032 here.
*/
check("a one-sided per-limb set is twice, not four times",
  setVolumeKg({ ...RECORDED_TOTAL, loadEntry: "per_limb", unilateral: true }) === 8 * 31.75 * 2,
  String(setVolumeKg({ ...RECORDED_TOTAL, loadEntry: "per_limb", unilateral: true })));
check("recorded and unrecorded are genuinely different numbers, or the column is decorative",
  setVolumeKg({ ...RECORDED_TOTAL, loadEntry: null }) !==
    setVolumeKg({ ...RECORDED_TOTAL, loadEntry: "per_limb" }));

check("legacy is known to be unrecorded", loadEntryKnown(null) === false);
check("and so is a value nobody recognises", loadEntryKnown("dunno") === false);
check("recorded readings are known", loadEntryKnown("total") && loadEntryKnown("per_limb"));

/* Nothing is said about a workout that said nothing. */
check("an old set is labelled with no qualifier",
  enteredLoadLabel(70, "lb", null, false) === "70 lb");
check("where a recorded one is",
  enteredLoadLabel(70, "lb", "per_limb", false) === "70 lb each");

// ── The line a coach and a member both read ────────────────────────────────
section("Said the same way in both places");

const SET = {
  name: "Dumbbell Bench Press", category: "chest", trackingType: "reps",
  reps: 8, durationSeconds: null, weight: 70, isWarmup: false,
};
check("a recorded per-limb session says each",
  summariseSession([{ ...SET, loadEntry: "per_limb", unilateral: false }], "lb")[0] ===
    "Dumbbell Bench Press — 1 × 8 @ 70lb each");
check("a one-sided one says per side",
  summariseSession([{ ...SET, loadEntry: "per_limb", unilateral: true }], "lb")[0] ===
    "Dumbbell Bench Press — 1 × 8 @ 70lb per side");
check("a session that never recorded it says nothing extra",
  summariseSession([{ ...SET, loadEntry: null }], "lb")[0] ===
    "Dumbbell Bench Press — 1 × 8 @ 70lb");
check("and neither does one that recorded 'total'",
  summariseSession([{ ...SET, loadEntry: "total" }], "lb")[0] ===
    "Dumbbell Bench Press — 1 × 8 @ 70lb");

const PRIOR_SETS = [{ reps: 8, durationSeconds: null, distanceM: null, weight: 70, rpe: null, isWarmup: false }];
check("LAST TIME carries the qualifier too",
  priorSummary({ exerciseId: "db-bench", onDate: "2026-08-01", loadEntry: "per_limb", unilateral: false, sets: PRIOR_SETS }, "lb") ===
    "70 × 8 lb each");
check("and stays silent about an unrecorded one",
  priorSummary({ exerciseId: "db-bench", onDate: "2026-08-01", loadEntry: null, sets: PRIOR_SETS }, "lb") ===
    "70 × 8 lb");

// ── The migration cannot reinterpret anybody's history ─────────────────────
section("The migration, read rather than trusted");

/*
  The first draft of this file had one column and a backfill that decided every
  historical dumbbell set had been entered per hand. It would have been right
  more often than not, and that is exactly the problem: this product does not
  convert a probability into a record. What follows are the properties that
  keep the two columns doing different jobs.
*/
const migration = readFileSync("supabase/2026-08-28-load-entry.sql", "utf8");

check("the record column is added",
  /ALTER TABLE session_exercises\s+ADD COLUMN IF NOT EXISTS load_entry text;/.test(migration));
check("with no default, so no workout is assigned a reading",
  !/session_exercises[\s\S]{0,120}load_entry text[^;]*DEFAULT/.test(migration));
check("and nothing backfills it",
  !/UPDATE session_exercises/i.test(migration));
check("the migration checks that it stayed nullable",
  /must stay nullable/.test(migration));
check("the setting keeps its own constraint",
  /exercises_load_entry_check/.test(migration));
check("the record column allows the admission",
  /load_entry IS NULL OR load_entry IN \('total', 'per_limb'\)/.test(migration));
check("the equipment default still catches up on the catalogue",
  /UPDATE exercises\s+SET load_entry = 'per_limb'/.test(migration));
check("and only where nobody has answered",
  /AND load_entry = 'total'/.test(migration));

/*
  The server side of the same rule. Composition is snapshotted on insert and
  read back from the session row; the six readbacks over `workout_sets` share
  one correlated subquery so a new one cannot quietly join the catalogue.
*/
const composition = code("server/training/composition.ts");
check("a movement entering a session records what its numbers will mean",
  /loadEntry: sql<string>`\(\s*select load_entry from/.test(composition));
check("and the session's own reading is what comes back out",
  /loadEntry: sessionExercises\.loadEntry/.test(composition));
check("sets read their session's reading through one place",
  /export const setLoadEntry/.test(composition));

const training = code("server/training/routes.ts");
check("no readback over sets joins the catalogue for it",
  !/loadEntry: exercises\.loadEntry/.test(training));

// ── Strength is not volume, and must not learn to be ──────────────────────
section("The normalised load stays out of the strength numbers");

/*
  The next change somebody will want to make, and the reason not to.

  Volume now uses the total external load — 70 in each hand is 140kg moved.
  Finishing the job by doubling dumbbells in the one-rep-max estimate looks
  like consistency and is not: e1RM is a claim about capacity in the unit the
  movement is performed in, and "78 per hand" is the number a member and a
  coach both use. 156 is not a weight anybody has been near.

  There is a shape problem too. `load_entry` is recorded per session and is
  null for everything logged before it existed, so normalising a series would
  put a step in every dumbbell graph on the date it shipped.

  Read from the files with their prose stripped, because the paragraph above
  would otherwise satisfy a grep for the rule it is explaining.
*/
const strength = code("server/training/strength.ts");
check("the strength module does not consult how the weight was entered",
  !/loadEntry|load_entry/.test(strength));
check("nor normalises a load itself",
  !/externalLoadKg|setVolumeKg|loadShape/.test(strength));

/* And the reader that feeds it. `setRowsFor` is where a series is assembled;
   a `loadEntry` appearing in it is the change this is here to notice. */
const trainingRoutes = code("server/training/routes.ts");
const setRows = trainingRoutes.slice(
  trainingRoutes.indexOf("async function setRowsFor"),
  trainingRoutes.indexOf("async function bodyweightLookup"),
);
check("and neither does the query that feeds it", !/loadEntry|setLoadEntry/.test(setRows),
  setRows.length > 0 ? "" : "setRowsFor was not found — this check has stopped looking at anything");
check("which is a real slice of the file, not an empty string", setRows.length > 200);

/* The estimate itself takes the number as entered. Stated as arithmetic so the
   intent survives somebody deleting the comment. */
check("a single is exactly what was on the bar", estimateOneRepMax(70, 1) === 70);
check("and eight reps at 70 estimates from 70, not from 140",
  Math.abs((estimateOneRepMax(70, 8) ?? 0) - 70 * (1 + 8 / 30)) < 1e-9,
  String(estimateOneRepMax(70, 8)));
check("which is not the doubled figure",
  (estimateOneRepMax(70, 8) ?? 0) < 100);

if (failures.length) {
  console.error("\n✗ load semantics\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
// ─── The number boxes hand over what was typed ─────────────────────────────

/*
  From a phone, during a workout: "i cant type ny numbers".

  `<input type="number">` sanitises its own value, so a controlled React input
  never sees what was pressed — only what the browser kept. Anything it judges
  invalid arrives as "", the state becomes "", and the box redraws empty. The
  clearest way in is a keypad whose decimal separator is a comma: press it once
  and the field starts clearing itself.

  So the workout's boxes are `type="text"` with `inputMode="decimal"`, which
  raises the same keypad and hands over the keystrokes, and the rule about what
  a number looks like lives in `numericDraft` where it can be tested.
*/
section("A number box keeps what was typed");

const eqd = (name: string, got: string, want: string) =>
  check(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

eqd("plain digits pass through", numericDraft("70"), "70");
eqd("a decimal point survives", numericDraft("70.5"), "70.5");
eqd("a comma is the decimal point most keypads offer", numericDraft("70,5"), "70.5");
eqd("letters cannot get in", numericDraft("7a0"), "70");
eqd("and neither can a second point", numericDraft("70.5.2"), "70.52");

/* Half-typed numbers are allowed through on purpose. A box that refuses "7."
   is the same defect wearing a smaller hat — the member cannot get to "7.5". */
eqd("an empty box stays empty", numericDraft(""), "");
eqd("a lone point is a number being typed", numericDraft("."), ".");
eqd("and so is a trailing point", numericDraft("7."), "7.");

/* Reps and seconds are whole. */
eqd("reps take no decimal point", numericDraft("12.5", { decimals: false }), "125");
eqd("reps still take digits", numericDraft("12", { decimals: false }), "12");
eqd("nonsense becomes nothing rather than NaN", numericDraft("abc"), "");

console.log(`\n✓ ${passed} load assertions passed\n`);
