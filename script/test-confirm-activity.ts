/**
 * Confirm Activity — the member adds meaning, and erases nothing.
 *
 * ── What these hold ───────────────────────────────────────────────────────
 *
 * Three truths stay separate: what the platform recorded, what Sakred makes of
 * it, and what the member says. Enrichment travels beside the event rather
 * than instead of it, so somebody calling a hard session restorative in intent
 * changes how it reads and never what it cost. An annotation able to delete
 * demand would let a member quietly erase a training week from their own
 * terrain.
 *
 * And restraint is the feature. A watch reports dozens of passive walks a
 * week; asking about each turns a good idea into a chore queue, and a member
 * who learns to dismiss the card unread dismisses the one that mattered too.
 *
 * Run: tsx script/test-confirm-activity.ts
 */

import { readFileSync } from "node:fs";
import { needsConfirmation, WORKOUT_FOCUSES, workoutFeedbackSchema } from "../shared/models/health.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const code = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("\nOnly ask where the answer changes something\n");

{
  /** The whole muscle-group question a watch cannot answer. */
  for (const t of ["strength", "Strength Training", "functional_strength_training", "crossTraining", "HIIT"]) {
    check(`${t} is worth asking about`, needsConfirmation(t));
  }

  /** Already understood. Prompting about these is how the card gets ignored. */
  for (const t of ["walking", "Walking", "running", "cycling", "yoga", "pilates", "mobility", "swimming", "hiking"]) {
    check(`${t} is not`, !needsConfirmation(t));
  }

  /** Ambiguity is exactly where a member's answer is worth having. */
  check("an unknown type is asked about", needsConfirmation("kettlebell_flow"));
  check("and a missing one", needsConfirmation(null));
  check("and an empty one", needsConfirmation("   "));
}

console.log("\nOne card, never a queue\n");

{
  const routes = code("server/health/routes.ts");
  const confirm = routes.slice(routes.indexOf('"/api/health/workouts/confirm"'));
  const body = confirm.slice(0, confirm.indexOf("app.patch("));

  check("only the unreviewed are candidates", /!w\.reviewedAt/.test(body));
  check("filtered by the same rule", /needsConfirmation\(w\.workoutType\)/.test(body));
  /** Newest first, and exactly one. */
  check("newest first", /desc\(healthWorkouts\.startAt\)/.test(body));
  check("and one at a time", /\.find\(/.test(body) && !/\.filter\([\s\S]{0,200}map\(/.test(body));

  /**
   * The daily gate, derived rather than stored. Handling one card must not
   * immediately produce the next, or the member is playing whack-a-mole.
   */
  check("nothing more once something is answered today", /answeredToday/.test(body));
  check("derived from reviewed_at", /reviewedAt && w\.reviewedAt\.toISOString/.test(body));

  check("Sakred's own reading is sent separately", /externalActivityCategory/.test(body));
}

console.log("\nConfirm changes one thing\n");

{
  /** Confirm on its own is a complete answer. */
  const only = workoutFeedbackSchema.safeParse({ reviewed: true });
  check("reviewed alone is valid", only.success);

  const empty = workoutFeedbackSchema.safeParse({});
  check("but an empty patch is not", !empty.success);

  const routes = code("server/health/routes.ts");
  check("reviewing stamps the time", /patch\.reviewedAt = new Date\(\)/.test(routes));
  /**
   * Any answer implies a review, or a member who adds detail is asked about
   * the same session again tomorrow.
   */
  check("and any answer counts as one", /reviewed \|\| focus !== undefined/.test(routes));

  /** Ownership in the predicate, not merely an unguessable id. */
  check(
    "another member's workout is refused",
    /eq\(healthWorkouts\.id, id\), eq\(healthWorkouts\.userId, userId\)/.test(routes),
  );
}

console.log("\nEnrichment adds meaning and erases nothing\n");

{
  const history = code("server/movement/history.ts");

  /** Beside the event, never instead of it. */
  check("focus travels with the event", /memberFocus: row\.userFocus/.test(history));
  check("as does orientation", /memberOrientation: row\.userOrientationOverride/.test(history));
  check("and their own label", /memberLabel: row\.userLabel/.test(history));

  /** Identity is untouched: same id, same activity, same categories. */
  check("the activity still comes from the source", /activity: row\.workoutType/.test(history));
  check("and the category from the mapper", /externalActivityCategory\(row\.workoutType\)/.test(history));
  /**
   * The load model never reads an annotation. A member marking a hard session
   * Restore changes where it is shown and not what it cost.
   */
  check("no annotation reaches the projection", !/userFocus|userOrientationOverride/.test(
    history.slice(history.indexOf("export async function recentMovement")),
  ));
}

console.log("\nA re-sync cannot overwrite what a member said\n");

{
  const health = code("server/health/routes.ts");
  const upsert = health.slice(health.indexOf("onConflictDoUpdate"), health.indexOf("onConflictDoUpdate") + 1200);

  for (const col of ["userFocus", "userLabel", "reviewedAt", "userResponse", "userOrientationOverride"]) {
    check(`${col} is not overwritten on re-sync`, !new RegExp(`${col}:\\s*sql`).test(upsert));
  }
}

console.log("\nThe card keeps the three truths apart\n");

{
  const card = code("client/src/components/health/ConfirmActivity.tsx");

  check("the source is named", /sourceApp/.test(card));
  check("Sakred's reading is attributed to Sakred", /Sakred reads this as/.test(card));
  check("nothing is required", /reviewed: true,/.test(card));
  check("focus comes from the canon", /WORKOUT_FOCUSES/.test(card));
  check("core is offered", WORKOUT_FOCUSES.includes("core" as never));
  check("and 'other' carries the rest", WORKOUT_FOCUSES.includes("other" as never));
  /** The card is on Home, not buried in Build. */
  const home = code("client/src/components/portal/TodayBody.tsx");
  check("it lives on Home", /<ConfirmActivity \/>/.test(home));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
