/**
 * A shared workout is a copy, and it is a narrow one.
 *
 * ── Two different claims ──────────────────────────────────────────────────
 *
 * That the card says the right numbers, and that the card is not re-derived
 * from live rows when somebody reads it. The first is arithmetic and is tested
 * here directly. The second is the defect that shipped — a post about Tuesday
 * quietly becoming a post about a different Tuesday when the member corrected
 * a set — and it is proved end to end in script/qa-room-share.ts, against a
 * real database, because that is the only place it can be proved.
 *
 * What is left for a test with no database is the shape that made the fix
 * possible, and the shape whose loss would undo it:
 *
 *   the publish path writes a snapshot        both of them
 *   the read path reads that column           and nothing else
 *   the snapshot cannot carry private fields  by its own schema
 *
 * ── Why the source checks earn their place ────────────────────────────────
 *
 * The realistic regression is not somebody deleting the column. It is somebody
 * adding a third way to post — a scheduled share, a coach re-posting a client's
 * lift — and reaching for `sharedSessionId` alone because that is the field
 * that reads like the workout. That post would render nothing, or, if the read
 * path were "helpfully" made to fall back to live rows, would bring the whole
 * defect back. The gate is the sentence that says so.
 *
 * Run: tsx script/test-room-share.ts
 */

import { readFileSync } from "node:fs";
import { readSharedWorkout, sharedWorkoutSchema, summarise } from "../shared/models/community.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want),
    `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/** The file with its prose removed — the comments explain the rule and would
    otherwise satisfy a grep for it. Same trick as test-media-privacy.ts. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const AT = "2026-08-19T10:00:00.000Z";
const session = { id: "s1", title: "Tuesday", onDate: "2026-08-18", durationMinutes: 47 };

// ─── 1. The numbers on the card ───────────────────────────────────────────

{
  const card = summarise(
    session,
    [{ exerciseId: "squat", supersetGroup: null, name: "Back Squat" }],
    [
      { exerciseId: "squat", reps: 5, weightKg: 100 },
      { exerciseId: "squat", reps: 5, weightKg: 120 },
      { exerciseId: "squat", reps: 3, weightKg: 140 },
    ],
    AT,
  );
  eq("three sets are three sets", card.movements[0].sets, 3);
  eq("the top weight is the heaviest one", card.movements[0].topWeightKg, 140);
  eq("the reps shown are the last that had any", card.movements[0].reps, 3);
  eq("volume is weight times reps, summed", card.volumeKg, 100 * 5 + 120 * 5 + 140 * 3);
  eq("and the card knows when it was taken", card.publishedAt, AT);
}

{
  /* A movement that was put in the session and never performed. The card
     should say so rather than dropping it — "I set up for pull-ups and did
     none" is a true thing about a session. */
  const card = summarise(
    session,
    [{ exerciseId: "pullup", supersetGroup: null, name: "Pull-Up" }],
    [],
    AT,
  );
  eq("an unperformed movement still appears", card.movements.length, 1);
  eq("with no sets", card.movements[0].sets, 0);
  eq("and no volume at all rather than zero", card.volumeKg, null);
}

{
  const card = summarise(
    session,
    [{ exerciseId: "incline-chest-press", supersetGroup: "A", name: null }],
    [{ exerciseId: "incline-chest-press", reps: 12, weightKg: 0 }],
    AT,
  );
  eq("a missing name falls back to something readable", card.movements[0].name, "incline-chest-press");
  eq("unweighted work has no top weight", card.movements[0].topWeightKg, null);
  eq("and contributes no volume", card.volumeKg, null);
  eq("the superset key is carried", card.movements[0].supersetGroup, "A");
}

{
  const card = summarise(
    session,
    [
      { exerciseId: "row", supersetGroup: null, name: "Row" },
      { exerciseId: "press", supersetGroup: null, name: "Press" },
    ],
    [
      { exerciseId: "row", reps: 10, weightKg: 60 },
      { exerciseId: "press", reps: 8, weightKg: 40 },
    ],
    AT,
  );
  eq("movements keep the order they were performed in",
    card.movements.map((m) => m.exerciseId), ["row", "press"]);
  eq("volume counts every movement", card.volumeKg, 600 + 320);
}

// ─── 2. What a snapshot may contain ──────────────────────────────────────

{
  const card = summarise(session, [{ exerciseId: "x", supersetGroup: null, name: "X" }],
    [{ exerciseId: "x", reps: 5, weightKg: 50 }], AT);
  const keys = Object.keys(card).sort();
  eq("the card is exactly these fields", keys,
    ["durationMinutes", "movements", "onDate", "publishedAt", "sessionId", "title", "volumeKg"]);
  eq("and a movement is exactly these", Object.keys(card.movements[0]).sort(),
    ["exerciseId", "name", "reps", "sets", "supersetGroup", "topWeightKg"]);
}

{
  /* The schema is the contract at rest, so it is where "never publishes the
     diary" has to be true — a builder that started copying `note` would be
     refused by the thing that writes the column, not merely reviewed. */
  const strict = sharedWorkoutSchema.strict();
  const base = {
    sessionId: "s1", title: null, onDate: "2026-08-18", durationMinutes: null,
    movements: [], volumeKg: null, publishedAt: AT,
  };
  check("a plain card is valid", strict.safeParse(base).success);
  for (const field of ["note", "rpe", "toFailure", "observations", "terrain", "health"]) {
    check(`a snapshot cannot carry ${field}`,
      !strict.safeParse({ ...base, [field]: "anything" }).success);
  }
}

{
  eq("nothing parses to nothing", readSharedWorkout(null), null);
  eq("and so does a row somebody hand-edited", readSharedWorkout({ sessionId: 1 }), null);
  eq("and a string that is not a card", readSharedWorkout("{}"), null);
  const good = summarise(session, [], [], AT);
  eq("a real card survives the round trip", readSharedWorkout(JSON.parse(JSON.stringify(good))), good);
}

// ─── 3. The copy is taken on the way in, on every path ───────────────────

{
  const community = code("server/community/routes.ts");
  const training = code("server/training/routes.ts");
  const builder = code("server/community/sharedWorkout.ts");

  check("the Room composer takes a copy when it posts",
    /publishedWorkout\(/.test(community) && /sharedWorkout:\s*workout/.test(community));
  check("and so does sharing from a finished workout",
    /publishedWorkout\(/.test(training) && /sharedWorkout:\s*workout/.test(training));

  /* Both paths refuse rather than posting an empty card: a share of a session
     that has gone is not a share. */
  check("a share of a session that no longer exists is refused, not published",
    (community.match(/No such workout/g) ?? []).length >= 2
      && /if \(!workout\) return \{ ok: false/.test(training));

  check("the read path reads the stored copy",
    /readSharedWorkout\(sharedWorkout\)/.test(community));

  /* The specific way the old defect would return: a reader that resolves the
     session id into a card. */
  check("and never re-derives a card from the session id",
    !/sharedWorkoutsFor/.test(community) && !/workouts\.get\(/.test(community));

  check("only one module is allowed to build a card",
    /export function summarise/.test(code("shared/models/community.ts"))
      && /export \{ summarise \}/.test(builder)
      && !/function summarise/.test(community)
      && !/function summarise/.test(training));

  /* The narrowing that keeps a diary private is in the select, and it is the
     line somebody would widen while "making the card richer". */
  for (const column of ["notes", ".note", "rpe", "toFailure", "observation"]) {
    check(`the builder never selects ${column}`, !builder.includes(column));
  }

  const tombstone = community.slice(community.indexOf("function present"), community.indexOf("function present") + 900);
  check("a deleted post shows no lift", /workout: null/.test(tombstone));
}

// ─── 4. The column, and the constraint that lets a post outlive its session ──

{
  const migration = readFileSync("supabase/2026-08-19-room-share-snapshot.sql", "utf8");
  check("the column exists", /ADD COLUMN IF NOT EXISTS shared_workout jsonb/.test(migration));
  check("a post with only a snapshot is still legal content",
    /OR shared_workout IS NOT NULL/.test(migration));
  check("and the migration refuses to leave a share without one",
    /RAISE EXCEPTION/.test(migration));

  const model = code("shared/models/community.ts");
  check("the column is declared jsonb in the model",
    /jsonb\("shared_workout"\)/.test(model));
}

// ─── 5. The card publishes what the session meant, not what the catalogue says ──

/*
  A published card is a snapshot. The volume on it has to be computed from what
  the numbers meant *in that workout*, and the only place that is recorded is
  `session_exercises.load_entry`. Joining to `exercises.load_entry` instead
  would mean a member correcting how a movement is entered next year silently
  changed the number on a card their friends replied to in March.
*/

{
  const dumbbells = [{ exerciseId: "db-bench", supersetGroup: null, name: "Dumbbell Bench" }];
  const sets = [{ exerciseId: "db-bench", reps: 8, weightKg: 30 }];

  const legacy = summarise(session,
    dumbbells.map((c) => ({ ...c, loadEntry: null, unilateral: false })), sets, AT);
  eq("a workout that never recorded what 30 meant publishes what it always did",
    legacy.volumeKg, 8 * 30);

  const recorded = summarise(session,
    dumbbells.map((c) => ({ ...c, loadEntry: "per_limb", unilateral: false })), sets, AT);
  eq("one that recorded 'each' publishes both hands", recorded.volumeKg, 8 * 30 * 2);

  const oneArm = summarise(session,
    dumbbells.map((c) => ({ ...c, loadEntry: "per_limb", unilateral: true })), sets, AT);
  eq("and a one-sided one counts its two sides, not four", oneArm.volumeKg, 8 * 30 * 2);

  eq("the top weight stays the number the member entered",
    recorded.movements[0].topWeightKg, 30);
}

{
  const builder = code("server/community/sharedWorkout.ts");
  check("the card reads the session's own reading",
    /loadEntry:\s*sessionExercises\.loadEntry/.test(builder));
  check("and never the catalogue's current setting",
    !/loadEntry:[^\n]*exercises\.loadEntry/.test(builder));
}

if (failures.length) {
  console.error("\n✗ room share\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} room share assertions`);
