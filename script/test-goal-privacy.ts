/**
 * Who may read a goal, and the five coaching stories, asserted where they can
 * regress.
 *
 * ── Two halves, and they fail differently ─────────────────────────────────
 *
 * The first half is a source check, for the same reason the progress-photo
 * rules are. The authorization on the goal routes is one comparison —
 * `req.coachAccess !== "relationship"` — sitting on top of middleware that
 * deliberately admits a wider set. The realistic failure is not a broken
 * query; it is somebody noticing that the goal routes are the odd ones out,
 * tidying them onto the shared middleware, and shipping a change where every
 * test passes and administrators can read what members are trying to do with
 * their bodies.
 *
 * The second half is the brief's five stories and its negative controls,
 * exercised against the pure model. Those are the ones that say the feature
 * does what it was asked to do.
 *
 * ── What this deliberately does not claim ─────────────────────────────────
 *
 * That the rules hold at runtime. That needs a database and belongs to
 * qa-auth-matrix. These are the invariants checkable with no database at all,
 * on every commit, which is the point.
 *
 * Run: tsx script/test-goal-privacy.ts
 */

import { readFileSync } from "node:fs";
import {
  evidenceFromSet,
  evidenceFromActivity,
  summariseGoal,
  meetsTarget,
  type GoalTarget,
  type MatchableGoal,
} from "../shared/models/goals.js";
import { readReadiness, suggestToday } from "../shared/models/recommend.js";
import { categoryLoad } from "../shared/models/training.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const read = (p: string) => readFileSync(p, "utf8");

/**
 * The file with its prose removed.
 *
 * Every one of these modules *explains* its rule at length, so a plain grep
 * for a name finds the sentence saying the thing is not used and reports the
 * opposite of the truth. The comments are the most valuable part of these
 * files and must not be what breaks their guard.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const goalRoutes = code("server/goals/routes.ts");
const goalStore = code("server/goals/store.ts");
const clientRoutes = code("server/coaching/clientRoutes.ts");
const migration = read("supabase/2026-08-27-goals.sql");

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nWho may read a goal\n");

/*
  Supervision does not inherit this.

  requireCoachOf sets coachAccess to "admin" for anybody holding
  superviseCoaching and to "relationship" for an actual coach. Both are correct
  for the roster and the reviewed stamp. Neither middleware nor role is the
  boundary here — the comparison is.
*/
const relationshipChecks = goalRoutes.match(/coachAccess !== "relationship"/g) ?? [];
check(
  "the coach half of the goal API tests for a live relationship, not a role",
  relationshipChecks.length >= 1,
  "no coachAccess !== \"relationship\" comparison found in server/goals/routes.ts",
);

const coachHandlers = goalRoutes.match(/app\.(get|post|put|patch|delete)\(\s*\n?\s*"\/api\/coach\/[^"]+"/g) ?? [];
check("there are coach goal routes to guard", coachHandlers.length >= 3, String(coachHandlers.length));
check(
  "every coach goal route goes through requireCoachOf",
  (goalRoutes.match(/requireCoachOf\(\)/g) ?? []).length >= coachHandlers.length,
  `${coachHandlers.length} coach routes, ${(goalRoutes.match(/requireCoachOf\(\)/g) ?? []).length} gates`,
);
check(
  "…and through the relationship narrowing as well",
  (goalRoutes.match(/clientOf\(req, res\)/g) ?? []).length >= coachHandlers.length,
  "clientOf is what turns an admin bypass into a 404",
);

/*
  The refusal must not be a hint.

  A former coach, an unrelated coach and an id that never existed have to be
  indistinguishable. A 403 says "this member exists and you may not see them",
  which is exactly the fact being withheld.
*/
check(
  "no goal route answers 403",
  !/status\(403\)/.test(goalRoutes),
  "a 403 tells the asker the member exists",
);
check(
  "the coach refusal is the same 404 an unknown id gets",
  /coachAccess !== "relationship"[\s\S]{0,200}status\(404\)[\s\S]{0,80}No such member/.test(goalRoutes),
);

/* The coaching context carries goals, so it inherits the same narrowing. */
check(
  "the coaching context endpoint narrows to a relationship too",
  /"\/api\/coach\/clients\/:memberId\/context"[\s\S]{0,600}coachAccess !== "relationship"/.test(clientRoutes),
);

// ─── Scoping ───────────────────────────────────────────────────────────────

/*
  Every read and write names the owner.

  A goal id is a uuid and unguessable, which is not an authorization model —
  "Never use an effectively public object URL as the authorization model" is
  the rule this repository already holds for photographs. So every statement
  that touches a single goal has to carry the member id as well.
*/
check("the store scopes goals by their owner", goalStore.includes("memberGoals.userId"));

/*
  Progress is reached through a goal, and the goal is what carries the owner.

  goal_progress does have a user_id, and filtering on it here would look like
  belt and braces. It would actually be worse: a redundant filter can make an
  absent ownership check pass, so the read would keep returning the right rows
  for the wrong reason and the missing check would never surface. What has to
  hold is the ordering — the goal is proven to be theirs, and only then is its
  history read.
*/
check(
  "goalDetail proves the goal is theirs before reading its history",
  /goalDetail[\s\S]{0,400}eq\(memberGoals\.userId, userId\)[\s\S]{0,120}if \(!goal\) return null;[\s\S]{0,600}from\(goalProgress\)/.test(
    goalStore,
  ),
);
check(
  "…and the list only ever asks for the goals it just fetched for that member",
  /goalsFor[\s\S]{0,1200}inArray\(\s*goalProgress\.goalId,\s*goals\.map/.test(goalStore),
);
const singleGoalStatements = goalStore.match(/eq\(memberGoals\.id, [a-zA-Z.]+\)/g) ?? [];
check("there are single-goal statements to check", singleGoalStatements.length >= 3);
check(
  "and none of them addresses a goal by id alone",
  (goalStore.match(/and\(eq\(memberGoals\.id, [a-zA-Z.]+\), eq\(memberGoals\.userId/g) ?? []).length ===
    singleGoalStatements.length,
  `${singleGoalStatements.length} by id, ${(goalStore.match(/and\(eq\(memberGoals\.id, [a-zA-Z.]+\), eq\(memberGoals\.userId/g) ?? []).length} also by owner`,
);

// ─── Ending the relationship ───────────────────────────────────────────────

/*
  A goal outlives the coaching.

  Nothing in the goals schema references coach_relationships, and nothing
  cascades from it. Ending the relationship removes the coach's access — which
  is `activeRelationship` returning nothing, one layer up — and touches neither
  the goal nor its progress. Said here because the tempting "tidy-up" is a
  cascade, and a member would lose their own history to it.
*/
check(
  "no goals table is tied to the coaching relationship",
  !/coach_relationships/.test(migration),
);
check(
  "goal progress cascades from the goal and from nothing else",
  (migration.match(/REFERENCES member_goals\(id\) ON DELETE CASCADE/g) ?? []).length >= 2,
);
check(
  "a coach's plan line releases the goal rather than deleting it",
  /coaching_plan_items ADD COLUMN IF NOT EXISTS goal_id[\s\S]{0,120}ON DELETE SET NULL/.test(migration),
);

check("every goals table has RLS enabled", (migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 4);
check("the migration proves itself rather than trusting", /RAISE EXCEPTION/.test(migration));

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nThe five stories\n");

const MILE = 1609.34;
const LB = 0.45359237;

const goodDay = readReadiness({
  sleepMinutes: 480,
  sleepBaselineMinutes: 450,
  restingHeartRate: 50,
  restingHeartRateBaseline: 54,
});
const badDay = readReadiness({
  sleepMinutes: 240,
  sleepBaselineMinutes: 450,
  restingHeartRate: 62,
  restingHeartRateBaseline: 54,
  terrainLean: -2,
});

// ── A. A mile goal, and a day that can carry it ──
{
  const goals = [{ id: "g-mile", categories: ["endurance"] }];
  const day = suggestToday({ read: goodDay, recentCategories: ["yoga", "chest"], goals });
  check("A: a mile goal reaches a good day", day.some((s) => s.category === "endurance"));
  check(
    "A: and the card that changed says which goal did it",
    day.find((s) => s.category === "endurance")?.goalIds.includes("g-mile") === true,
  );
}

// ── B. The same goal, the same plan, a body that cannot ──
{
  const goals = [{ id: "g-mile", categories: ["endurance", "explosive", "plyometric"] }];
  const day = suggestToday({ read: badDay, recentCategories: ["yoga"], goals });
  check("B: the day still offers three things", day.length === 3);
  check(
    "B: and terrain keeps the authority — nothing demanding",
    day.every((s) => categoryLoad(s.category).stress < 3),
  );
  check("B: the goal is not credited for a day it did not shape", day.every((s) => !s.codes.includes("goal_relevant")));
  /*
    The goal survives. Nothing in this path writes to member_goals, and a
    reduced day is a recommendation rather than an edit — the brief's "do not
    silently rewrite either" is structural here, not a rule anybody has to
    remember.
  */
  check(
    "B: nothing in the ranking can write to a goal",
    !/update\(memberGoals\)|insert\(memberGoals\)/.test(code("server/today/routes.ts")),
  );
}

// ── C. Pull-ups ──
{
  const pullups: MatchableGoal = {
    id: "g-pull",
    status: "active",
    measurement: "reps",
    target: { reps: 15 },
    exerciseId: "pull-up",
    activityType: null,
  };
  const session = [
    { id: "s1", exerciseId: "pull-up", reps: 5, durationSeconds: null, distanceM: null, weightKg: 0, isWarmup: true },
    { id: "s2", exerciseId: "pull-up", reps: 13, durationSeconds: null, distanceM: null, weightKg: 0, isWarmup: false },
    { id: "s3", exerciseId: "chin-up", reps: 14, durationSeconds: null, distanceM: null, weightKg: 0, isWarmup: false },
  ];
  const found = session.map((s) => evidenceFromSet(pullups, s)).filter(Boolean);
  check("C: exactly one observation from that session", found.length === 1, String(found.length));
  check("C: and it is the thirteen, not the warm-up ramp", JSON.stringify(found[0]) === JSON.stringify({ reps: 13 }));
  check("C: thirteen does not reach fifteen", !meetsTarget("reps", pullups.target, { reps: 13 } as GoalTarget));
}

// ── D. Bench ──
{
  const bench: MatchableGoal = {
    id: "g-bench",
    status: "active",
    measurement: "load_reps",
    target: { weightKg: 225 * LB, reps: 1 },
    exerciseId: "barbell-bench-press",
    activityType: null,
  };
  const single = evidenceFromSet(bench, {
    id: "s1",
    exerciseId: "barbell-bench-press",
    reps: 1,
    durationSeconds: null,
    distanceM: null,
    weightKg: 225 * LB,
    isWarmup: false,
  });
  check("D: the single is recorded", single !== null);
  check("D: and it reaches the target", meetsTarget("load_reps", bench.target, single!));
  /*
    Reached, not achieved. The member chooses; nothing in the model closes a
    goal, and `summariseGoal` reports `reached` without ever touching status.
  */
  const summary = summariseGoal(bench, [
    { observedAt: "2026-08-27T10:00:00.000Z", measurement: "load_reps", value: single!, source: "workout" },
  ]);
  check("D: the summary says reached", summary.reached);
  check(
    "D: and nothing in the model marks it achieved",
    !/achievedAt/.test(code("shared/models/goals.ts")) ||
      !/status\s*=\s*"achieved"/.test(code("shared/models/goals.ts")),
  );
}

// ── E. Yoga ──
{
  const yoga: MatchableGoal = {
    id: "g-yoga",
    status: "active",
    measurement: "duration",
    target: { seconds: 3600 },
    exerciseId: null,
    activityType: "yoga",
  };
  const found = evidenceFromActivity(yoga, {
    externalId: "hk-1",
    workoutType: "yoga",
    durationSeconds: 2820,
    distanceMeters: null,
  });
  check("E: 47 minutes of yoga is recorded", JSON.stringify(found) === JSON.stringify({ seconds: 2820 }));
  check("E: and it does not reach an hour", !meetsTarget("duration", yoga.target, found!));
  /*
    No strength assumption anywhere near it. A duration goal has no reps and no
    load, and a set with reps cannot move it — which is the same rule read from
    the other side.
  */
  check(
    "E: a rep count cannot move a duration goal",
    evidenceFromSet(
      { ...yoga, exerciseId: "pull-up", activityType: null },
      { id: "s", exerciseId: "pull-up", reps: 13, durationSeconds: null, distanceM: null, weightKg: 0, isWarmup: false },
    ) === null,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nThe negatives\n");

check(
  "no goals leaves the recommendation untouched",
  JSON.stringify(suggestToday({ read: goodDay, recentCategories: ["yoga"] })) ===
    JSON.stringify(suggestToday({ read: goodDay, recentCategories: ["yoga"], goals: [] })),
);

/*
  A paused goal is refused twice, in two different places, and both matter.

  The model refuses to take evidence for one. The server refuses to hand one to
  the ranking. Either alone would be a rule somebody could delete without a
  test failing.
*/
{
  const paused: MatchableGoal = {
    id: "g",
    status: "paused",
    measurement: "reps",
    target: { reps: 15 },
    exerciseId: "pull-up",
    activityType: null,
  };
  check(
    "a paused goal takes no evidence from a set",
    evidenceFromSet(paused, {
      id: "s",
      exerciseId: "pull-up",
      reps: 13,
      durationSeconds: null,
      distanceM: null,
      weightKg: 0,
      isWarmup: false,
    }) === null,
  );
  check(
    "a paused goal takes no evidence from a sync",
    evidenceFromActivity(
      { ...paused, exerciseId: null, activityType: "yoga", measurement: "duration", target: { seconds: 3600 } },
      { externalId: "e", workoutType: "yoga", durationSeconds: 2820, distanceMeters: null },
    ) === null,
  );
  check(
    "and the ranking is only ever handed active goals",
    /goalRelevance[\s\S]{0,900}eq\(memberGoals\.status, "active"\)/.test(goalStore),
  );
}

check(
  "a generic run never becomes a mile time",
  evidenceFromActivity(
    {
      id: "g",
      status: "active",
      measurement: "time_for_distance",
      target: { distanceM: MILE, seconds: 360 },
      exerciseId: null,
      activityType: "running",
    },
    { externalId: "e", workoutType: "running", durationSeconds: 2700, distanceMeters: null },
  ) === null,
);

check(
  "a generic strength session never becomes a bench figure",
  evidenceFromActivity(
    {
      id: "g",
      status: "active",
      measurement: "load_reps",
      target: { weightKg: 100, reps: 1 },
      exerciseId: null,
      activityType: "strength",
    },
    { externalId: "e", workoutType: "strength", durationSeconds: 3120, distanceMeters: null },
  ) === null,
);

/*
  Duplicate sync. The rule is a partial unique index rather than a comparison
  in TypeScript, because two syncs can overlap and a check followed by an
  insert has a window between them.
*/
check(
  "the same session twice cannot become two observations",
  /CREATE UNIQUE INDEX IF NOT EXISTS uq_goal_progress_source[\s\S]{0,200}source_reference IS NOT NULL/.test(migration),
);
check(
  "…and the writer relies on the index rather than reading first",
  /onConflictDoNothing/.test(goalStore),
);
check(
  "…while a member may still type two entries on one day",
  /WHERE source_reference IS NOT NULL/.test(migration),
);

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log(`\n✓ ${passed} goal privacy and story assertions passed\n`);
