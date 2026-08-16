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
import {
  needsConfirmation,
  answeredToday,
  WORKOUT_FOCUSES,
  workoutFeedbackSchema,
} from "../shared/models/health.js";

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
  /**
   * Still derived from `reviewed_at` rather than stored — no extra state to
   * keep, and a member who reviews nothing is simply asked again tomorrow.
   *
   * This assertion used to require `reviewedAt.toISOString()`, which is to say
   * it required the defect: it pinned the UTC read that mis-fired every Toronto
   * evening. A test can hold a bug in place as firmly as it holds a rule, and
   * the only difference is whether anyone stated which one it was.
   */
  check("derived from reviewed_at", /reviewedAt: healthWorkouts\.reviewedAt/.test(body));
  check("and read in the member's zone, not the server's", /todayInZone/.test(code("shared/models/health.ts")));

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
  /**
   * ── On the Home a member actually opens ──
   *
   * This assertion used to read `portal/TodayBody.tsx` and call it Home. It is
   * not: the member's Home tab renders `PillarHome`, and `TodayBody` belongs to
   * the coaching screen. So the card was mounted somewhere no member could
   * reach it, and the test passed for a year of nothing — which is what a
   * browser render pass found in four minutes and no source assertion could.
   *
   * Pinned to the component the dashboard names for `section === "home"`, so a
   * future move has to move this too.
   */
  const dash = code("client/src/pages/MemberDashboard.tsx");
  check("Home is PillarHome", /section === "home"[\s\S]{0,400}<PillarHome/.test(dash));
  const home = code("client/src/components/PillarHome.tsx");
  check("and the card is on it", /<ConfirmActivity \/>/.test(home));
  /** Below the reading, because it is about yesterday and Home opens on today. */
  check("under the terrain reading", /<TerrainToday[\s\S]{0,600}<ConfirmActivity \/>/.test(home));
}

/**
 * ── The 15 Aug regression, kept as a fixture ──────────────────────────────
 *
 * A member in Toronto answered a card at 22:05 local. The write succeeded. The
 * gate then read the write's instant as a UTC date — already tomorrow — decided
 * nothing had been answered today, and put the next unreviewed import on screen
 * wearing the last one's answers.
 *
 * Everything below is that evening, at the boundary and either side of it.
 */
console.log("\nOne card a day, in the member's day\n");

{
  const at = (iso: string) => ({ reviewedAt: new Date(iso) });
  const TORONTO = "America/Toronto";

  /** 22:05 on the 15th in Toronto is 02:05 on the 16th in UTC. The bug, exactly. */
  check("an evening review counts as today",
    answeredToday([at("2026-08-16T02:05:57Z")], TORONTO, "2026-08-15"));
  check("and does not count as the UTC tomorrow",
    !answeredToday([at("2026-08-16T02:05:57Z")], TORONTO, "2026-08-16"));

  /** The six seconds that produced the second write must be inside the same day. */
  check("the second tap six seconds later is the same day",
    answeredToday([at("2026-08-16T02:06:03Z")], TORONTO, "2026-08-15"));

  /** Midnight either side, in local terms. */
  check("one minute before local midnight still counts",
    answeredToday([at("2026-08-16T03:59:00Z")], TORONTO, "2026-08-15"));
  check("one minute after it does not",
    !answeredToday([at("2026-08-16T04:01:00Z")], TORONTO, "2026-08-15"));

  /** Morning, where UTC and local agree and the old code looked fine. */
  check("a morning review counts too",
    answeredToday([at("2026-08-15T13:30:00Z")], TORONTO, "2026-08-15"));

  /** Zones ahead of UTC break the other way; both directions are one rule. */
  check("Sydney, where local is already tomorrow",
    answeredToday([at("2026-08-15T14:00:00Z")], "Australia/Sydney", "2026-08-16"));
  check("and Los Angeles, further behind",
    answeredToday([at("2026-08-16T05:00:00Z")], "America/Los_Angeles", "2026-08-15"));

  /** Yesterday's review never gates today. */
  check("a review from yesterday does not silence today",
    !answeredToday([at("2026-08-15T02:05:00Z")], TORONTO, "2026-08-15"));

  check("nothing reviewed means nothing answered",
    !answeredToday([{ reviewedAt: null }, { reviewedAt: null }], TORONTO, "2026-08-15"));
  check("an empty history likewise", !answeredToday([], TORONTO, "2026-08-15"));

  /** One answered among many is still an answer. */
  check("one answer among unreviewed rows is enough",
    answeredToday(
      [{ reviewedAt: null }, at("2026-08-16T02:05:57Z"), { reviewedAt: null }],
      TORONTO,
      "2026-08-15",
    ));

  /** A member with no zone set still gets a consistent answer rather than a crash. */
  check("a missing zone falls back rather than throwing",
    typeof answeredToday([at("2026-08-16T02:05:57Z")], null, "2026-08-15") === "boolean");
  check("as does a nonsense one",
    typeof answeredToday([at("2026-08-16T02:05:57Z")], "Mars/Olympus", "2026-08-15") === "boolean");

  /** And the route asks the shared rule rather than keeping its own copy. */
  const routes = code("server/health/routes.ts");
  check("the route uses the shared gate", /answeredToday\(recent, zone, today\)/.test(routes));
  check("it reads the member's own zone", /select\(\{ timezone: users\.timezone \}\)/.test(routes));
  check("and no longer slices a UTC instant",
    !/reviewedAt\.toISOString\(\)\.slice/.test(routes));
}

/**
 * ── A save must be legible ────────────────────────────────────────────────
 *
 * The same evening proved the other half: a successful write and a failed one
 * looked identical, because neither said anything. Nothing below tests the
 * network — it tests that each of the four states has somewhere to appear.
 */
console.log("\nEvery save says what happened\n");

{
  const card = code("client/src/components/health/ConfirmActivity.tsx");

  /** The key is the fix for answers travelling to the wrong workout. */
  check("the answering form is keyed by workout", /<Answer key=\{w\.id\} w=\{w\} \/>/.test(card));
  check("so the query and the form are separate components",
    /function Answer\(\{ w \}/.test(card));

  check("success is stated, not merely implied", /Activity updated/.test(card));
  check("and has somewhere to be found", /data-testid="confirm-activity-saved"/.test(card));
  /** Held for a beat, so the card's exit reads as a consequence. */
  check("the card stands down after the acknowledgement",
    /onSuccess: \(\) => setDone\(true\)/.test(card));
  check("and only then invalidates", /setTimeout\([\s\S]{0,200}invalidateQueries/.test(card));

  check("a failure is visible", /Couldn't save\. Try again\./.test(card));
  check("with a hook for the harness", /data-testid="confirm-activity-error"/.test(card));
  /** The answer they already gave stays on screen; nothing is cleared on error. */
  check("nothing is reset when it fails",
    !/isError[\s\S]{0,200}set(Focus|Orientation|Label)\(/.test(card));

  check("working is stated on both buttons", /Saving…/.test(card) && /Confirming…/.test(card));
  check("and both refuse a second tap while in flight",
    (card.match(/disabled=\{save\.isPending\}/g) ?? []).length === 2);
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
