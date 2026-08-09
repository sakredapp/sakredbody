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
} from "../shared/models/training.js";

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

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
