/**
 * Goals — where a member is trying to go, kept apart from everything else.
 *
 * ── What this is not ──────────────────────────────────────────────────────
 *
 * The schema already had five things that look like goals and are not, which
 * is exactly why this took a schema audit before a line of it was written:
 *
 *   applications.goals            what somebody typed at intake, free text
 *   wellness_routines.goal        what a routine is for
 *   tracked_habits.target         how often to do a habit, this week
 *   coaching_plan_items.target    what a coach has prescribed
 *   habit_exercises.target_*      sets and reps on a prescribed line
 *
 * Every one of those is a *plan* — a strategy, a prescription, an adherence
 * count. None of them survives the strategy changing. A member who wants a
 * six-minute mile still wants it after the intervals stop working, after the
 * coach rewrites the block, and after a bad month of sleep; the goal is the
 * thing all of those are in service of, and it is the only one of the six that
 * is still true a year later.
 *
 * So the separations this file exists to hold:
 *
 *   GOAL            where they are trying to go        ← here
 *   PLAN            the strategy currently in use      coaching_plans
 *   TERRAIN         what today can support             terrain.ts
 *   RECOMMENDATION  what Sakred suggests today         recommendation.ts
 *   ACTIVITY        what actually happened             workout_sets, health_workouts
 *   RESPONSE        how it landed                      trainingResponse.ts
 *   PROGRESS        evidence of movement               ← here
 *
 * A goal is direction. It is never authority over the body: Terrain decides
 * what today can take, and a goal that could override it would be the app
 * telling somebody to run intervals on four hours of sleep because they said
 * so in March.
 *
 * ── Pure ──────────────────────────────────────────────────────────────────
 *
 * Table definitions and decisions, no database and no clock. What counts as
 * evidence for a goal is the part most worth testing and the part most easily
 * got wrong in a direction nobody notices, so it is all reachable from node.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  date,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { WORKOUT_PLACEMENTS } from "./training.js";
import { recommendationEvents } from "./recommendation.js";

// ─── How a goal is measured ────────────────────────────────────────────────

/**
 * The seven shapes a target can take, and why there are seven rather than one.
 *
 * The tempting design is `{ amount: number, unit: string }` for everything.
 * It falls over on the first real goal anybody has: "a six-minute mile" is two
 * numbers that only mean something together, and storing 360 seconds with a
 * unit of "seconds" loses the mile. Same for a bench single — 102 kg is not
 * the goal, 102 kg *for one rep* is, and a member who does 60 kg for twenty
 * has not made progress toward it.
 *
 * So the kind decides the shape of the payload, and the payload is validated
 * against the kind rather than accepted as an open object. `custom` is the
 * escape hatch for a goal we did not anticipate, and it is the only one that
 * has to be told which way is better — every other kind knows.
 */
export const MEASUREMENTS = [
  /** A distance covered in a time. Lower is better. */
  "time_for_distance",
  /** A number of repetitions. */
  "reps",
  /** A load moved for at least a number of repetitions. */
  "load_reps",
  /** Time spent, in one go. */
  "duration",
  /** Ground covered. */
  "distance",
  /** How often, over a window. */
  "frequency",
  /** Anything else, in the member's own words and unit. */
  "custom",
] as const;
export type Measurement = (typeof MEASUREMENTS)[number];

/**
 * Canonical units, matching the columns this is compared against.
 *
 * Metres, seconds and kilograms — the same units `workout_sets` and
 * `health_workouts` already store, so a comparison is a comparison and never a
 * conversion. Pounds exist at the edges only, where `users.weight_unit` and
 * `displayWeight` already handle them; a second units system is how a member
 * ends up with a 225 kg bench goal.
 */
export const timeForDistanceTarget = z.object({
  distanceM: z.number().positive(),
  seconds: z.number().positive(),
});
export const repsTarget = z.object({ reps: z.number().int().positive() });
export const loadRepsTarget = z.object({
  weightKg: z.number().positive(),
  reps: z.number().int().positive(),
});
export const durationTarget = z.object({ seconds: z.number().positive() });
export const distanceTarget = z.object({ distanceM: z.number().positive() });
export const frequencyTarget = z.object({
  count: z.number().int().positive(),
  perDays: z.number().int().positive(),
});
export const customTarget = z.object({
  amount: z.number(),
  unit: z.string().min(1).max(24),
  /** Up for more-is-better, down for less. The only kind that has to be told. */
  direction: z.enum(["up", "down"]),
});

export const TARGET_SHAPES = {
  time_for_distance: timeForDistanceTarget,
  reps: repsTarget,
  load_reps: loadRepsTarget,
  duration: durationTarget,
  distance: distanceTarget,
  frequency: frequencyTarget,
  custom: customTarget,
} as const satisfies Record<Measurement, z.ZodTypeAny>;

export type TargetOf<M extends Measurement> = z.infer<(typeof TARGET_SHAPES)[M]>;
export type GoalTarget = { [M in Measurement]: TargetOf<M> }[Measurement];

/** Parse a payload against the kind it claims to be. Null when it does not fit. */
export function parseTarget(measurement: string, payload: unknown): GoalTarget | null {
  const shape = TARGET_SHAPES[measurement as Measurement];
  if (!shape) return null;
  const result = shape.safeParse(payload);
  return result.success ? (result.data as GoalTarget) : null;
}

/**
 * Which direction counts as better.
 *
 * A time goes down and everything else goes up, except `custom`, which cannot
 * be known from the kind and says so in its own payload. This is a function
 * rather than a column because six of the seven answers are already implied by
 * the kind, and a stored copy of an implied fact is a stored copy that can
 * disagree.
 */
export function improvesDownward(measurement: Measurement, target: GoalTarget): boolean {
  if (measurement === "time_for_distance") return true;
  if (measurement === "custom") return (target as TargetOf<"custom">).direction === "down";
  return false;
}

// ─── The record ────────────────────────────────────────────────────────────

/**
 * A goal's life.
 *
 * `paused` and `archived` are different facts and both are needed. Paused is a
 * goal the member still holds and has set down for now — it stays on their
 * screen, under Paused, and stops influencing anything Sakred suggests.
 * Archived is a goal they are done with, achieved or not. Neither deletes: the
 * progress underneath a goal is a record of what a body did, and a member who
 * ran a 6:28 mile last summer ran it whether or not they still care.
 */
export const GOAL_STATUSES = ["active", "paused", "achieved", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/**
 * Where the goal mostly lives — the same three words the rest of the product
 * uses for a session's placement, rather than a fourth vocabulary meaning the
 * same thing. `both` is the brief's "integrated".
 *
 * It is a lens and never a wall. Somebody chasing a mile time needs their hips
 * to open and their sleep to hold, so a running goal is legitimately relevant
 * on Restore; `emphasis` decides what leads, not what is allowed.
 */
export const GOAL_EMPHASES = WORKOUT_PLACEMENTS;
export type GoalEmphasis = (typeof GOAL_EMPHASES)[number];

export const memberGoals = pgTable(
  "member_goals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),

    /** The member's own words. "Six-minute mile", not "run_1mi_360s". */
    title: text("title").notNull(),
    description: text("description"),

    status: text("status").notNull().default("active"),
    emphasis: text("emphasis").notNull().default("build"),

    /** One of MEASUREMENTS. The payload's shape follows from it. */
    measurement: text("measurement").notNull(),

    /**
     * The current target, in canonical units.
     *
     * Also, and separately, the newest row in `goal_target_revisions` — see
     * the note on that table for why both. This column is what every read
     * needs; that table is what makes an old observation still mean something.
     */
    target: jsonb("target").$type<GoalTarget>().notNull(),

    /**
     * What the goal is *about*, when it is about something the catalogue
     * already knows. A slug from `exercises`, or a normalized activity word —
     * 'running', 'yoga' — from the same vocabulary the health readers emit.
     *
     * These are the whole mechanism for automatic progress. Matching a goal to
     * a set by comparing titles would attach "Bench Press" the goal to "Bench
     * Press (Smith)" the movement and be wrong in a way that reads right.
     * Either the identity matches or nothing happens.
     */
    exerciseId: text("exercise_id"),
    activityType: text("activity_type"),

    /** When they'd like it by. Nullable, and most goals will not have one. */
    targetDate: date("target_date"),

    /** The member's own ordering. Lower first. */
    sortOrder: integer("sort_order").notNull().default(0),

    /**
     * Who wrote it and who last touched it.
     *
     * A coach may create a goal during a call and edit a target afterwards,
     * and the member must be able to see that they did. What must never exist
     * is a goal the coach can see and the member cannot — see `goalsFor` and
     * the privacy tests. Attribution, not ownership: the goal is the
     * member's whoever typed it.
     */
    createdBy: varchar("created_by").notNull(),
    updatedBy: varchar("updated_by").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when the member says so, never by arithmetic. See `meetsTarget`. */
    achievedAt: timestamp("achieved_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_member_goals_user").on(t.userId, t.status),
    index("idx_member_goals_exercise").on(t.exerciseId),
    index("idx_member_goals_activity").on(t.activityType),
  ],
);

export type MemberGoal = typeof memberGoals.$inferSelect;

/**
 * Every target this goal has ever had.
 *
 * ── Why this is not just an updated column ────────────────────────────────
 *
 * Targets move, and that is the healthy case: 7:00, then 6:30, then 6:00. If
 * the target is only ever the current one, then a progress row from March
 * reading 6:42 cannot be interpreted — it was twelve seconds *under* target at
 * the time and reads as twenty-four seconds over it now. The member's own
 * history would turn into a record of failure the day they got ambitious.
 *
 * So: one row at creation, one row per change, never edited. The goal's own
 * `target` column stays as the current value because every list needs it in a
 * single read, and the writer sets both in one transaction. That is the whole
 * of the mechanism — no event sourcing, no rebuild-on-read, just the ability
 * to answer "what was this goal on the tenth of August" truthfully.
 *
 * `measurement` is here too because it can change, rarely: a member who
 * reframes "run more" as "a six-minute mile" has changed the kind, and their
 * old observations belong to the old kind.
 */
export const goalTargetRevisions = pgTable(
  "goal_target_revisions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => memberGoals.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    measurement: text("measurement").notNull(),
    target: jsonb("target").$type<GoalTarget>().notNull(),
    changedBy: varchar("changed_by").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_goal_target_revisions").on(t.goalId, t.createdAt)],
);

export type GoalTargetRevision = typeof goalTargetRevisions.$inferSelect;

/**
 * Where a member is now, as often as it has been observed.
 *
 * ── History, not a current value ──────────────────────────────────────────
 *
 * The cheap version of this is a `current_value` column on the goal, and it
 * destroys the only thing progress is for. A member who ran 6:28 in August and
 * 6:35 in September has a trajectory; a column has 6:35 and no memory that the
 * good day happened. Best and latest are different questions and both matter —
 * best is what the body has proved it can do, latest is where it is today, and
 * a bad week is not evidence that the best was a fluke.
 *
 * So rows, and `latest` / `best` are derived. Nothing here is ever rewritten.
 */
export const PROGRESS_SOURCES = ["member", "workout", "health", "coach"] as const;
export type ProgressSource = (typeof PROGRESS_SOURCES)[number];

export const goalProgress = pgTable(
  "goal_progress",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => memberGoals.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),

    /** When the thing happened, not when it was recorded. */
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    /** The member's own calendar date for it, for grouping beside everything else. */
    onDate: date("on_date").notNull(),

    /** The kind this value is in — the goal's kind at the time it was observed. */
    measurement: text("measurement").notNull(),
    /** Same shape as a target of that kind. */
    value: jsonb("value").$type<GoalTarget>().notNull(),

    source: text("source").notNull(),

    /**
     * What in the product produced it — a `workout_sets.id`, a
     * `health_workouts.external_id`. Null for anything a person typed.
     *
     * This is the idempotency key, and it is why a re-sync is free. Health
     * Connect re-reads a trailing window every fifteen minutes and hands back
     * the same session with the same id; without this, a member who ran on
     * Tuesday would collect a new "47 minutes" every quarter hour until the
     * window moved past it. The unique index below is partial, because two
     * things a member typed by hand on the same day are two facts.
     */
    sourceReference: text("source_reference"),

    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_goal_progress_goal").on(t.goalId, t.observedAt),
    index("idx_goal_progress_user").on(t.userId, t.onDate),
    uniqueIndex("uq_goal_progress_source")
      .on(t.goalId, t.source, t.sourceReference)
      .where(sql`source_reference is not null`),
  ],
);

export type GoalProgress = typeof goalProgress.$inferSelect;

// ─── Reading progress ──────────────────────────────────────────────────────

/**
 * Is this observation about the same thing as the target?
 *
 * The check that stops the whole idea being nonsense. A mile goal and a 400 m
 * time trial are both `time_for_distance` and both in seconds, and comparing
 * them would show a member setting a spectacular new best every time they ran
 * something short. A bench single and a set of twenty are both `load_reps`.
 *
 * Non-comparable observations are still stored — they happened — and are
 * simply not counted toward best or latest. That is the honest treatment:
 * dropping them would lose the record, and counting them would lose the goal.
 */
export function comparable(
  measurement: Measurement,
  target: GoalTarget,
  value: GoalTarget,
): boolean {
  switch (measurement) {
    case "time_for_distance": {
      const t = target as TargetOf<"time_for_distance">;
      const v = value as TargetOf<"time_for_distance">;
      return sameDistance(t.distanceM, v.distanceM);
    }
    /*
      Reps are a floor, not a match.

      A 225 lb single is the goal; 225 for three is better, not different, so
      the rule is `at least`. What it refuses is the other direction — 100 kg
      for twenty is a real set and no evidence at all about a heavy single, and
      an e1RM estimate that turned it into one would be the app inventing a
      lift the member has never done. `estimateOneRepMax` exists and is
      deliberately not called here.
    */
    case "load_reps":
      return (value as TargetOf<"load_reps">).reps >= (target as TargetOf<"load_reps">).reps;
    case "custom": {
      const t = target as TargetOf<"custom">;
      const v = value as TargetOf<"custom">;
      return t.unit === v.unit;
    }
    default:
      return true;
  }
}

/**
 * Two distances that are the same distance.
 *
 * A mile is 1609.34 m, a phone that recorded "1 mile" may hand back 1609, and
 * a member who typed 1600 meant the mile. One percent covers all three and
 * excludes 1500 m, which is a different race.
 */
export function sameDistance(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / a <= 0.01;
}

/** The single orderable number inside a payload of this kind. */
export function scalarOf(measurement: Measurement, value: GoalTarget): number | null {
  switch (measurement) {
    case "time_for_distance":
      return (value as TargetOf<"time_for_distance">).seconds;
    case "reps":
      return (value as TargetOf<"reps">).reps;
    case "load_reps":
      return (value as TargetOf<"load_reps">).weightKg;
    case "duration":
      return (value as TargetOf<"duration">).seconds;
    case "distance":
      return (value as TargetOf<"distance">).distanceM;
    /** A rate, so eight sessions in a fortnight ranks with four in a week. */
    case "frequency": {
      const v = value as TargetOf<"frequency">;
      return v.perDays > 0 ? v.count / v.perDays : null;
    }
    case "custom":
      return (value as TargetOf<"custom">).amount;
  }
}

/**
 * Has the target been reached by this observation?
 *
 * Reached, not achieved. Nothing in this file marks a goal achieved — that is
 * `achievedAt`, and only a member sets it. The difference matters: a member
 * who hits 225 once may want a new target, may want to hold it for a month
 * before believing it, and may have been spotted. Closing their goal for them
 * on the strength of one row is the app deciding something it cannot see.
 */
export function meetsTarget(
  measurement: Measurement,
  target: GoalTarget,
  value: GoalTarget,
): boolean {
  if (!comparable(measurement, target, value)) return false;
  const want = scalarOf(measurement, target);
  const got = scalarOf(measurement, value);
  if (want == null || got == null) return false;
  return improvesDownward(measurement, target) ? got <= want : got >= want;
}

export type Observed = {
  observedAt: Date | string;
  measurement: string;
  value: GoalTarget;
  source: string;
};

export type GoalSummary<T extends Observed> = {
  /** The most recent comparable observation. */
  latest: T | null;
  /** The best one, ever. */
  best: T | null;
  /** How many observations were counted, and how many could not be. */
  counted: number;
  incomparable: number;
  /** Whether the best one reaches the target. */
  reached: boolean;
};

/**
 * Latest, best, and how much of the history either of them speaks for.
 *
 * `incomparable` is returned rather than swallowed so a screen can say why a
 * member's twelve entries produced two numbers. A count silently smaller than
 * the list is the kind of thing that reads as a bug and is never reported.
 */
export function summariseGoal<T extends Observed>(
  goal: { measurement: string; target: GoalTarget },
  observations: readonly T[],
): GoalSummary<T> {
  const measurement = goal.measurement as Measurement;
  const down = MEASUREMENTS.includes(measurement)
    ? improvesDownward(measurement, goal.target)
    : false;

  let latest: T | null = null;
  let best: T | null = null;
  let bestScalar: number | null = null;
  let counted = 0;
  let incomparable = 0;

  for (const o of observations) {
    if (o.measurement !== goal.measurement || !comparable(measurement, goal.target, o.value)) {
      incomparable += 1;
      continue;
    }
    const scalar = scalarOf(measurement, o.value);
    if (scalar == null) {
      incomparable += 1;
      continue;
    }
    counted += 1;

    if (latest === null || time(o.observedAt) > time(latest.observedAt)) latest = o;
    if (bestScalar === null || (down ? scalar < bestScalar : scalar > bestScalar)) {
      best = o;
      bestScalar = scalar;
    }
  }

  return {
    latest,
    best,
    counted,
    incomparable,
    reached: best !== null && meetsTarget(measurement, goal.target, best.value),
  };
}

function time(at: Date | string): number {
  return at instanceof Date ? at.getTime() : Date.parse(at);
}

/**
 * What the target was on a given day.
 *
 * Newest revision at or before the moment, so an observation from March is
 * read against March's target. Revisions may arrive in any order; this does
 * not assume they are sorted.
 */
export function targetAsOf<T extends { createdAt: Date | string; target: GoalTarget }>(
  revisions: readonly T[],
  at: Date | string,
): T | null {
  const moment = time(at);
  let found: T | null = null;
  for (const r of revisions) {
    const when = time(r.createdAt);
    if (when > moment) continue;
    if (found === null || when > time(found.createdAt)) found = r;
  }
  return found;
}

// ─── What counts as evidence ───────────────────────────────────────────────

/**
 * A goal, reduced to what matching needs. Deliberately not `MemberGoal` so
 * that the rules can be exercised without a database row.
 */
export type MatchableGoal = {
  id: string;
  status: string;
  measurement: string;
  target: GoalTarget;
  exerciseId: string | null;
  activityType: string | null;
};

export type CanonicalSet = {
  id: string;
  exerciseId: string;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  weightKg: number;
  isWarmup: boolean;
};

export type CanonicalActivity = {
  externalId: string;
  /** Normalized already — 'running', 'yoga'. See HealthReader.exerciseName. */
  workoutType: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

/**
 * A logged set, as evidence for a goal — or null, which is the usual answer.
 *
 * ── The rule this file exists to enforce ──────────────────────────────────
 *
 * Progress is only ever taken from data that already means what the goal
 * means. Not "close enough", not "probably", not a conversion. The three
 * things that make a set count:
 *
 *   1. It is the same movement, by catalogue id. Not by name — "Bench Press"
 *      the goal and "Bench Press (Smith machine)" the movement would match on
 *      any string comparison and are not the same lift.
 *   2. It is not a warm-up. A ramp to a heavy single is not thirteen proofs.
 *   3. The set carries the quantity the goal is measured in. A squat has no
 *      distance, and filling one in would be the invention.
 *
 * Frequency and custom goals are never auto-filled from a set. A frequency is
 * a count over a window rather than a property of one set, and a custom unit
 * is by definition one we do not know how to derive.
 */
export function evidenceFromSet(goal: MatchableGoal, set: CanonicalSet): GoalTarget | null {
  if (goal.status !== "active") return null;
  if (!goal.exerciseId || goal.exerciseId !== set.exerciseId) return null;
  if (set.isWarmup) return null;

  switch (goal.measurement as Measurement) {
    case "reps":
      return set.reps != null && set.reps > 0 ? { reps: set.reps } : null;
    case "load_reps":
      return set.reps != null && set.reps > 0 && set.weightKg > 0
        ? { weightKg: set.weightKg, reps: set.reps }
        : null;
    case "duration":
      return set.durationSeconds != null && set.durationSeconds > 0
        ? { seconds: set.durationSeconds }
        : null;
    case "distance":
      return set.distanceM != null && set.distanceM > 0 ? { distanceM: set.distanceM } : null;
    case "time_for_distance":
      return set.distanceM != null &&
        set.distanceM > 0 &&
        set.durationSeconds != null &&
        set.durationSeconds > 0
        ? { distanceM: set.distanceM, seconds: set.durationSeconds }
        : null;
    default:
      return null;
  }
}

/**
 * An imported activity, as evidence — or null.
 *
 * ── Why this refuses more than the set rule does ──────────────────────────
 *
 * A workout from a phone is a summary written by something that was guessing.
 * "Functional Strength Training, 52 minutes" is all a watch knows about an
 * hour in a gym; it cannot say what was lifted, so a bench goal can never be
 * moved by one. Reps and load are therefore never derived from an activity,
 * whatever the activity is called.
 *
 * A goal pinned to a catalogue movement is also never moved by an activity,
 * even when the activity's type looks right. A member with a "SkiErg 1,000 m
 * in 3:30" goal and a rowing machine in the shed produces `rowing` sessions
 * of about a kilometre that would otherwise sail straight through — same
 * kind, same distance, wrong machine. If the goal names a movement, the proof
 * is a logged set of that movement.
 *
 * What is left is the honest case: a yoga goal measured in minutes, and a yoga
 * session that lasted 47 of them. The platform knew what it was and how long
 * it went on, and both of those are the thing the goal is about.
 */
export function evidenceFromActivity(
  goal: MatchableGoal,
  activity: CanonicalActivity,
): GoalTarget | null {
  if (goal.status !== "active") return null;
  if (goal.exerciseId) return null;
  if (!goal.activityType || !activity.workoutType) return null;
  if (goal.activityType !== activity.workoutType.trim().toLowerCase()) return null;

  const seconds = activity.durationSeconds;
  const metres = activity.distanceMeters;

  switch (goal.measurement as Measurement) {
    case "duration":
      return seconds != null && seconds > 0 ? { seconds } : null;
    case "distance":
      return metres != null && metres > 0 ? { distanceM: metres } : null;
    /*
      Both numbers, and the distance has to be the goal's.

      A 45-minute run is not a mile time. Neither is a 5 km run, for a mile
      goal — `sameDistance` is what stops "ran 5 km in 24:00" being recorded
      as a catastrophic mile and then, worse, as a member's personal best when
      the goal is later rewritten.
    */
    case "time_for_distance": {
      if (seconds == null || seconds <= 0 || metres == null || metres <= 0) return null;
      const want = goal.target as TargetOf<"time_for_distance">;
      return sameDistance(want.distanceM, metres) ? { distanceM: metres, seconds } : null;
    }
    default:
      return null;
  }
}

// ─── Saying it ─────────────────────────────────────────────────────────────

/** m:ss, or h:mm:ss past an hour. The way a runner writes a time. */
export function clockTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * A distance in the words people use for it.
 *
 * Named races first, because "1,609 m" is nobody's goal and "a mile" is a
 * great many people's. Everything else in whichever of metres or kilometres
 * carries fewer meaningless digits.
 */
export function distanceLabel(metres: number): string {
  const named: [number, string][] = [
    [1609.34, "mile"],
    [3218.69, "2 miles"],
    [5000, "5K"],
    [10000, "10K"],
    [21097.5, "half marathon"],
    [42195, "marathon"],
  ];
  for (const [m, name] of named) if (sameDistance(m, metres)) return name;
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
}

/** Minutes when it divides, otherwise the clock. "60 min", "47 min", "1:30:00". */
export function durationLabel(seconds: number): string {
  if (seconds % 60 === 0 && seconds < 3600 * 4) return `${Math.round(seconds / 60)} min`;
  return clockTime(seconds);
}

/**
 * A target or an observation, in one line, in the member's own weight unit.
 *
 * The unit is passed in rather than read, because this runs on both sides and
 * `users.weight_unit` is the only place that decides. Everything stored is
 * kilograms; a member who thinks in pounds sees pounds, and nothing converts
 * twice.
 */
export function formatMeasurement(
  measurement: Measurement,
  value: GoalTarget,
  weightUnit: "kg" | "lb" = "lb",
): string {
  switch (measurement) {
    case "time_for_distance": {
      const v = value as TargetOf<"time_for_distance">;
      return `${clockTime(v.seconds)} · ${distanceLabel(v.distanceM)}`;
    }
    case "reps": {
      const v = value as TargetOf<"reps">;
      return `${v.reps}`;
    }
    case "load_reps": {
      const v = value as TargetOf<"load_reps">;
      const shown = weightUnit === "lb" ? Math.round(v.weightKg * 2.20462) : Math.round(v.weightKg);
      return `${shown} ${weightUnit} × ${v.reps}`;
    }
    case "duration":
      return durationLabel((value as TargetOf<"duration">).seconds);
    case "distance":
      return distanceLabel((value as TargetOf<"distance">).distanceM);
    case "frequency": {
      const v = value as TargetOf<"frequency">;
      const window =
        v.perDays === 7 ? "week" : v.perDays === 1 ? "day" : v.perDays === 30 ? "month" : `${v.perDays} days`;
      return `${v.count}× a ${window}`;
    }
    case "custom": {
      const v = value as TargetOf<"custom">;
      return `${v.amount} ${v.unit}`;
    }
  }
}

/** The word for what a member is asked to enter, on the update-progress sheet. */
export const MEASUREMENT_LABELS: Readonly<Record<Measurement, string>> = {
  time_for_distance: "Time for a distance",
  reps: "Repetitions",
  load_reps: "Load for repetitions",
  duration: "Time",
  distance: "Distance",
  frequency: "How often",
  custom: "Something else",
};

// ─── What the API accepts ──────────────────────────────────────────────────

/**
 * A target, validated against the kind it says it is.
 *
 * `superRefine` rather than a discriminated union because the two fields are
 * separate columns and a union would push the kind inside the payload,
 * duplicating it. This keeps one `measurement` in one place and still refuses
 * a `reps` goal carrying a distance.
 */
const measuredTarget = z
  .object({
    measurement: z.enum(MEASUREMENTS),
    target: z.unknown(),
  })
  .superRefine((input, ctx) => {
    const parsed = parseTarget(input.measurement, input.target);
    if (parsed === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message: `not a valid ${input.measurement} target`,
      });
    }
  });

export const createGoalInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    emphasis: z.enum(GOAL_EMPHASES).default("build"),
    measurement: z.enum(MEASUREMENTS),
    target: z.unknown(),
    exerciseId: z.string().trim().min(1).max(120).nullable().optional(),
    activityType: z.string().trim().min(1).max(60).nullable().optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (parseTarget(input.measurement, input.target) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message: `not a valid ${input.measurement} target`,
      });
    }
    /*
      Both would mean two ways for the same goal to collect evidence, and
      `evidenceFromActivity` already refuses any goal naming a movement. Saying
      so here turns a silent no-op into a rejected form.
    */
    if (input.exerciseId && input.activityType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activityType"],
        message: "a goal is about a movement or an activity, not both",
      });
    }
  });

export const updateGoalInput = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  emphasis: z.enum(GOAL_EMPHASES).optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

/** Changing the target. Separate from the rest, because it writes a revision. */
export const retargetGoalInput = measuredTarget.and(
  z.object({ note: z.string().trim().max(500).nullable().optional() }),
);

export const recordProgressInput = z.object({
  /** Optional; the server uses the goal's own kind when this is omitted. */
  measurement: z.enum(MEASUREMENTS).optional(),
  value: z.unknown(),
  observedAt: z.string().datetime().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

// ─── Which goals actually moved a recommendation ───────────────────────────

/**
 * Provenance, and only provenance.
 *
 * The recommendation foundation already existed — `recommendation_events`
 * carries reason codes, canonical action, provenance and version stamps, and
 * `recommendation_feedback` carries a verdict. None of it needed rebuilding.
 * One edge was missing: which goal, if any, actually participated.
 *
 * ── Why a table and not a `relevant_goal_ids` array ───────────────────────
 *
 * Because the failure mode is writing all of them. An array field invites a
 * caller to hand it `active.map(g => g.id)` and produce a row claiming every
 * goal influenced every recommendation — which then licenses "Supports your
 * running goal" underneath advice that had nothing to do with running. A row
 * that has to be inserted deliberately is harder to fill in by accident, and
 * a cascade keeps it honest when a goal is deleted.
 *
 * `Why this?` may name a goal only when the goal is in here. Never because a
 * member happens to have one.
 */
export const recommendationGoals = pgTable(
  "recommendation_goals",
  {
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendationEvents.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => memberGoals.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.recommendationId, t.goalId] }),
    index("idx_recommendation_goals_goal").on(t.goalId, t.createdAt),
  ],
);
