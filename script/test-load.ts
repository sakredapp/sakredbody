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
import {
  defaultLoadEntry,
  enteredLoadLabel,
  externalLoadKg,
  loadEntryLabel,
  loadShape,
  setVolumeKg,
  LOAD_ENTRIES,
} from "../shared/models/training.js";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
const section = (t: string) => console.log(`\n${t}\n`);

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

if (failures.length) {
  console.error("\n✗ load semantics\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} load assertions passed\n`);
