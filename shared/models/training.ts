/**
 * Training — the Build side.
 *
 * ── What this is, and what it deliberately is not ─────────────────────────
 *
 * Not a workout logger. Sessions are prebuilt by a coach against a protocol
 * and a season — mostly heavy, 2 to 8 reps — and the member is handed a
 * prescription and records what they actually hit against it. Nobody composes
 * a workout from a blank screen.
 *
 * That is the whole reason this is small. A general logger has to solve
 * exercise discovery, custom movements, supersets, templates and programme
 * builders, and Strong and Hevy already do all of it for free. Here the
 * programme is the product, and the app's job is to show today's lifts and
 * take the numbers.
 *
 * ── It rides the protocol engine rather than paralleling it ───────────────
 *
 * A Build protocol is an ordinary `wellness_routines` row. Its habits are
 * sessions — "Lower Body Power" — and `habitExercises` below is the only new
 * idea: the lifts prescribed for one of those sessions. Enrollment, day
 * windows, materialisation, Today, completion, streaks and wins are all
 * inherited. None of it is rebuilt, and a Build day appears in the member's
 * checklist next to their breathwork without a line of new scheduling code.
 *
 * ── Three numbers that are calculated, never invented ─────────────────────
 *
 * Estimated 1RM uses Epley — `weight × (1 + reps/30)` — published in 1985. It
 * exists so a 5×5 and a 3×3 can be compared at all; without it "am I getting
 * stronger" is unanswerable the moment the rep scheme changes. It degrades
 * badly past about twelve reps, which is exactly why the cap below exists —
 * and why heavy programming at 2–8 sits squarely in its accurate range.
 *
 * Relative strength is `e1RM ÷ bodyweight`, which is the honest comparison
 * across very different body sizes: a 1.5× squat means the same thing at
 * 150lb and 250lb where "225 on the bar" does not.
 *
 * Volume is sets × reps × load. Blunt, and the only one of the three that
 * needs no explanation.
 *
 * All three are arithmetic over numbers the member entered. That is the line
 * this codebase draws elsewhere: a readiness score synthesised from other
 * scores is a character sheet; a formula over recorded reps is not.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  integer,
  real,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── 1. THE CATALOGUE ──────────────────────────────────────────────────────

/**
 * What can be done.
 *
 * Admin-owned, like protocols and guides, rather than free text per member.
 * Free text feels friendlier and destroys the data: "bench", "Bench Press",
 * "BB bench" and "benchpress" become four movements that can never be graphed
 * together, and no amount of later cleanup recovers which was which.
 *
 * `aliases` is how the friendlier version is kept — the member searches
 * "bench" and finds Barbell Bench Press.
 */
export const exercises = pgTable(
  "exercises",
  {
    /** Readable slug — appears in URLs and is referenced from content. */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** squat | hinge | push | pull | carry | core | conditioning | mobility */
    pattern: text("pattern").notNull().default("push"),
    equipment: text("equipment").notNull().default("barbell"),

    /**
     * The word a member would use to find it. See EXERCISE_CATEGORIES.
     *
     * `pattern` is how a coach thinks — hinge, push, carry — and it is what
     * programming is built from. It is not how anybody searches. Nobody opens
     * a picker looking for "a hinge"; they look for legs, or arms, or the
     * stretch for their hips. Both exist because they answer different
     * questions, and collapsing them would cost one of the two.
     *
     * Fascia is deliberately its own category rather than a corner of
     * mobility. Pogo hops, spiral walks and shaking are not stretching, they
     * are the elastic work this product is actually about — and burying them
     * under "mobility" is how they end up looking like a warm-up nobody does.
     */
    category: text("category").notNull().default("full_body"),

    /**
     * Whether load is even a question.
     *
     * ChatGPT's spec proposed exploding trackingType into weight_reps,
     * weight_distance, assisted_reps and so on. That would duplicate what the
     * schema already says better: `workout_sets` carries reps, duration and
     * distance *alongside* a separate weightKg, so a weighted carry is
     * distance + weight and a weighted pull-up is reps + weight, with no new
     * vocabulary and no combinatorial explosion when the next pairing appears.
     *
     * The genuinely missing bit was smaller: whether to show a weight field at
     * all. A couch stretch with a "kg" box next to it is the sort of detail
     * that makes an app feel like it was built for something else.
     */
    takesLoad: boolean("takes_load").notNull().default(true),

    /** One side at a time — the picker says so, and volume doubles honestly. */
    unilateral: boolean("unilateral").notNull().default(false),

    /**
     * What a set of this is measured in: reps, duration or distance.
     *
     * The column exists because a plank has no reps and a carry has no reps,
     * and forcing them to "1 rep" is a lie the data never recovers from —
     * every volume total and every estimate downstream inherits it.
     */
    trackingType: text("tracking_type").notNull().default("reps"),

    /**
     * What the movement loads, as a multiple of bodyweight, before any added
     * plates. A pull-up is 1.0; a push-up is roughly 0.64; a barbell squat is
     * 0 because the bar carries the load.
     *
     * Without this, a member who does twenty pull-ups records zero weight and
     * appears to have done nothing, while their actual load was their entire
     * bodyweight twenty times.
     */
    bodyweightFactor: real("bodyweight_factor").notNull().default(0),

    /** First is primary. Familiar in a way movement patterns are not. */
    muscleGroups: text("muscle_groups").array(),

    /** Other names members type. Matched case-insensitively on search. */
    aliases: text("aliases").array(),

    /**
     * Whether this movement is worth tracking a 1RM for. True for the barbell
     * lifts; false for a farmer's carry, where the meaningful number is
     * distance or time and an estimated single is nonsense.
     */
    tracksOneRepMax: boolean("tracks_one_rep_max").notNull().default(true),

    demoUrl: text("demo_url"),
    cues: text("cues"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    /**
     * Whose movement this is. Null for the shared catalogue.
     *
     * The note at the top of this table argues against free text, and it is
     * right: "bench", "Bench Press" and "BB bench" become three movements that
     * can never be graphed together. But a catalogue that does not contain
     * what somebody actually does is its own failure — a member training
     * bodybuilding accessories finds no cable fly and simply cannot log their
     * session, which is worse than an untidy row.
     *
     * So both. The shared catalogue stays curated and is the only thing that
     * feeds cross-member analysis; a member can add what is missing, and it is
     * visible to them alone. Their history is real either way, and nothing
     * they invent can fragment anyone else's data.
     */
    ownerUserId: varchar("owner_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_exercises_pattern").on(t.pattern),
    index("idx_exercises_active").on(t.isActive),
    index("idx_exercises_owner").on(t.ownerUserId),
  ],
);

/**
 * The categories, in the order the picker shows them.
 *
 * Ordered by how often somebody reaches for them, not alphabetically and not
 * by anatomy. Chest and back first because that is most of what gets logged;
 * fascia and breath last but present, because they are the reason this is not
 * a lifting app with a wellness skin.
 */
export const EXERCISE_CATEGORIES = [
  // ── Strength ──
  { id: "chest", label: "Chest", group: "strength" },
  { id: "back", label: "Back", group: "strength" },
  { id: "shoulders", label: "Shoulders", group: "strength" },
  { id: "arms", label: "Arms", group: "strength" },
  { id: "legs", label: "Legs", group: "strength" },
  { id: "glutes", label: "Glutes", group: "strength" },
  { id: "calves", label: "Calves", group: "strength" },
  { id: "core", label: "Core", group: "strength" },
  { id: "olympic", label: "Olympic", group: "strength" },
  { id: "landmine", label: "Landmine", group: "strength" },
  { id: "calisthenics", label: "Calisthenics", group: "strength" },
  { id: "rings", label: "Rings", group: "strength" },
  { id: "neck_grip", label: "Neck & grip", group: "strength" },
  { id: "isometric", label: "Isometrics", group: "strength" },

  // ── Athletic ──
  { id: "explosive", label: "Explosive", group: "athletic" },
  { id: "plyometric", label: "Plyometrics", group: "athletic" },
  { id: "agility", label: "Agility", group: "athletic" },
  { id: "locomotion", label: "Running & locomotion", group: "athletic" },
  { id: "carry", label: "Carries", group: "athletic" },
  { id: "kettlebell", label: "Kettlebell", group: "athletic" },
  { id: "rotation", label: "Rotation", group: "athletic" },
  { id: "balance", label: "Balance", group: "athletic" },
  { id: "ground", label: "Ground movement", group: "athletic" },
  { id: "cardio", label: "Cardio", group: "athletic" },

  // ── Mobility ──
  { id: "mobility", label: "Mobility", group: "mobility" },
  { id: "feet", label: "Feet & ankles", group: "mobility" },
  { id: "corrective", label: "Corrective", group: "mobility" },
  { id: "yoga", label: "Yoga", group: "mobility" },

  // ── Studio — controlled, spring-loaded, taught in classes ──
  { id: "pilates", label: "Pilates & Reformer", group: "studio" },
  { id: "lagree", label: "Lagree", group: "studio" },
  { id: "barre", label: "Barre", group: "studio" },

  // ── Fascia — the reason this is not a lifting app ──
  { id: "fascia", label: "Fascia", group: "fascia" },
  { id: "somatic", label: "Somatic", group: "fascia" },
  { id: "tissue", label: "Tissue work", group: "fascia" },
  { id: "breath", label: "Breath", group: "fascia" },
  { id: "recovery", label: "Recovery", group: "fascia" },

  // ── Whole sessions ──
  { id: "practice", label: "Flows", group: "practice" },
  { id: "class", label: "Classes", group: "practice" },
  { id: "sport", label: "Sports", group: "practice" },
  { id: "endurance", label: "Endurance", group: "practice" },
  { id: "full_body", label: "Full body", group: "practice" },
] as const;

/**
 * The five chips the picker actually shows.
 *
 * Thirty-four categories is a correct taxonomy and a terrible filter bar —
 * nobody scans thirty-four chips, they scroll past them. The groups are what
 * somebody has in mind when they open the picker ("I'm doing legs", "I want
 * something for my hips"), and the category is what narrows it once they are
 * inside. Search cuts across all of it, so neither level has to be guessed
 * correctly to find anything.
 */
export const EXERCISE_GROUPS = [
  { id: "strength", label: "Strength" },
  { id: "athletic", label: "Athletic" },
  { id: "mobility", label: "Mobility" },
  { id: "studio", label: "Studio" },
  { id: "fascia", label: "Fascia & recovery" },
  { id: "practice", label: "Practices" },
] as const;

export type ExerciseGroup = (typeof EXERCISE_GROUPS)[number]["id"];

/**
 * ── The distinction that stops this being a bodybuilding app ──────────────
 *
 * Somebody who takes a 50-minute Lagree class did not do "3 × 12 Lagree Bear
 * followed by 3 × 12 Wheelbarrow". They did Lagree, for fifty minutes. An app
 * that will only accept the first version is quietly saying that countable gym
 * sets are the only real training — and it is also just wrong about what
 * happened, because nobody in a class is holding a phone.
 *
 * So the catalogue holds both. `Reformer Footwork` is a movement: a Sakred
 * sequence can prescribe it, and a member following one can log it. `Reformer
 * Pilates` is a practice: one row, one number, minutes. The same is true of
 * Basketball, a bike ride, a yoga class and a BJJ session.
 *
 * They live in one table because everything downstream — history, the coach's
 * view, weekly load, what the member has and has not touched lately — wants
 * one list of what a person did, not two that have to be merged at every read.
 * The only thing that differs is how it is entered, which is what this asks.
 *
 * Derived from the group rather than stored as a column: the group already
 * says it, and a second source of truth is a second thing to keep in sync.
 */
export function isPracticeCategory(category: string): boolean {
  return PRACTICE_CATEGORIES.has(category);
}

const PRACTICE_CATEGORIES: ReadonlySet<string> = new Set(
  EXERCISE_CATEGORIES.filter((c) => c.group === "practice").map((c) => c.id as string),
);

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number]["id"];
export const exerciseCategoryEnum = z.enum(
  EXERCISE_CATEGORIES.map((c) => c.id) as [ExerciseCategory, ...ExerciseCategory[]],
);

// ─── 1b. THE MEMBER'S OWN SESSIONS ─────────────────────────────────────────

/**
 * A workout somebody wrote for themselves, saved to repeat.
 *
 * Not everyone arrives needing to be told how to train. Plenty of members are
 * already dialled on their lifting and want the coaching for fascia, mobility
 * and recovery — the parts they are *not* dialled on. Until now Build had
 * nothing for them: no prescription meant an empty screen, so the app's
 * position was effectively "train our way or don't log."
 *
 * Deliberately a separate table from `habit_exercises` rather than a shared
 * one with an owner column. They are different things with different rules: a
 * prescription belongs to a protocol, is authored by a coach, arrives on a
 * schedule and is edited centrally for everyone on it. This belongs to one
 * person, is authored by them, appears when they choose it, and nobody else
 * ever sees it. Merging them would mean every query in Build growing a clause
 * about which kind it was looking at.
 *
 * The catalogue, the sets, the volume maths and the 1RM estimates are all
 * shared. Only authorship differs.
 */
export const memberWorkouts = pgTable(
  "member_workouts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    name: text("name").notNull(),
    note: text("note"),
    /** Hidden rather than deleted, so past sessions keep their origin. */
    isArchived: boolean("is_archived").notNull().default(false),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_member_workouts_user").on(t.userId, t.isArchived)],
);

/**
 * The movements in one of those, mirroring habit_exercises on purpose.
 *
 * Same column names and same meanings, so the Build UI renders a prescribed
 * session and a self-written one with the same component, and a member reading
 * "4 × 3–5" sees the same thing in both. Percent-of-1RM is kept even though
 * most people writing their own will not use it — the ones who do are exactly
 * the members already dialled enough to be writing their own.
 */
export const memberWorkoutExercises = pgTable(
  "member_workout_exercises",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    memberWorkoutId: uuid("member_workout_id").notNull(),
    exerciseId: text("exercise_id").notNull(),

    orderIndex: integer("order_index").notNull().default(0),
    targetSets: integer("target_sets").notNull().default(3),
    targetRepsLow: integer("target_reps_low"),
    targetRepsHigh: integer("target_reps_high"),
    targetPercent1rm: real("target_percent_1rm"),
    restSeconds: integer("rest_seconds"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_member_workout_exercises").on(t.memberWorkoutId, t.orderIndex),
    index("idx_member_workout_exercises_ex").on(t.exerciseId),
  ],
);

export type MemberWorkout = typeof memberWorkouts.$inferSelect;
export type MemberWorkoutExercise = typeof memberWorkoutExercises.$inferSelect;

// ─── 2. THE PRESCRIPTION ───────────────────────────────────────────────────

/**
 * The lifts that make up one prescribed session.
 *
 * Hangs off `routineHabits` — the habit *template* — so "Lower Body Power" is
 * an ordinary habit that happens to carry four exercises. Everything the habit
 * engine already does for a breathwork step it does for this one, which is why
 * Build needs no scheduler, no enrollment and no calendar of its own.
 *
 * Targets are a range rather than a number because that is how heavy work is
 * actually written: 4 × 3–5, take the top set to a hard 5 or stop at 3.
 */
export const habitExercises = pgTable(
  "habit_exercises",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    routineHabitId: uuid("routine_habit_id").notNull(),
    exerciseId: text("exercise_id").notNull(),

    orderIndex: integer("order_index").notNull().default(0),
    targetSets: integer("target_sets").notNull().default(3),
    targetRepsLow: integer("target_reps_low"),
    targetRepsHigh: integer("target_reps_high"),

    /**
     * Load guidance as a percentage of the member's estimated max.
     *
     * Nullable on purpose. "Top set heavy, back-offs at RPE 7" is a real
     * prescription and does not reduce to a number, and forcing a percentage
     * would make coaches invent one.
     */
    targetPercent1rm: real("target_percent_1rm"),
    restSeconds: integer("rest_seconds"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_habit_exercises_habit").on(t.routineHabitId, t.orderIndex),
    index("idx_habit_exercises_exercise").on(t.exerciseId),
  ],
);

// ─── 3. BODYWEIGHT ─────────────────────────────────────────────────────────

/**
 * Bodyweight over time.
 *
 * Its own table rather than a column on `users`, because relative strength
 * needs the bodyweight *at the time of the lift*. A single current-weight
 * column would silently rewrite history: lose fifteen pounds and every squat
 * you ever did would retroactively become a better ratio.
 */
export const bodyMeasurements = pgTable(
  "body_measurements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    onDate: date("on_date").notNull(),

    /**
     * Kilograms, always, everywhere in this module.
     *
     * Storing a bare "weight" and remembering the unit elsewhere is the
     * classic way to end up with a 90 that might be kg or lb and no way to
     * tell. Conversion happens at the edges — `users.weight_unit` decides what
     * is shown and what an entry is multiplied by on the way in.
     */
    weightKg: real("weight_kg"),
    heightCm: real("height_cm"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_body_measurements_user").on(t.userId, t.onDate),
    // One reading per day. A second entry corrects the first rather than
    // adding a duplicate the averages would double-count.
    uniqueIndex("uq_body_measurements_user_date").on(t.userId, t.onDate),
  ],
);

// ─── 4. SESSIONS ───────────────────────────────────────────────────────────

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),

    /**
     * The habit that prescribed this, when there was one.
     *
     * Nullable and `ON DELETE SET NULL` in the migration — deleting a protocol
     * must never delete what somebody actually lifted. The same rule the
     * habit-identity work established: templates are editable, history is not.
     */
    habitId: uuid("habit_id"),

    /** The member's own date, from `memberToday()` — never the server's. */
    onDate: date("on_date").notNull(),
    title: text("title"),
    note: text("note"),
    durationMinutes: integer("duration_minutes"),

    /**
     * Null while in progress. A session is created when the first set is
     * entered and finished explicitly, so a workout abandoned halfway still
     * keeps its sets rather than vanishing.
     */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_workout_sessions_user_date").on(t.userId, t.onDate),
    index("idx_workout_sessions_habit").on(t.habitId),
  ],
);

// ─── 5. SETS ───────────────────────────────────────────────────────────────

export const workoutSets = pgTable(
  "workout_sets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id").notNull(),
    exerciseId: text("exercise_id").notNull(),

    /** Which prescribed line this answers, when it answers one. */
    habitExerciseId: uuid("habit_exercise_id"),

    /** 1-based, in the order performed. */
    setIndex: integer("set_index").notNull().default(1),

    /**
     * One of these three, matching the exercise's `trackingType`.
     *
     * All nullable, with a database CHECK that at least one is present. A
     * squat has no distance and a plank has no reps, and a row measuring
     * nothing at all is the shape every average silently skips.
     */
    reps: integer("reps"),
    durationSeconds: integer("duration_seconds"),
    distanceM: real("distance_m"),

    /** Added load in kilograms. Zero for an unweighted bodyweight set. */
    weightKg: real("weight_kg").notNull().default(0),

    /**
     * Warm-ups are recorded and excluded from every derived number. Dropping
     * them entirely would be tidier and wrong — a member who logs their ramp
     * wants to see it next week, and counting it toward volume or a 1RM
     * estimate would make a light day look heavy.
     */
    isWarmup: boolean("is_warmup").notNull().default(false),

    /** Rate of perceived exertion, 1–10. Optional; most people won't use it. */
    rpe: real("rpe"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_workout_sets_session").on(t.sessionId),
    index("idx_workout_sets_exercise").on(t.exerciseId),
  ],
);

// ─── Derived numbers ───────────────────────────────────────────────────────

/**
 * Epley's estimate of a one-rep max.
 *
 * `weight × (1 + reps / 30)`, published by Boyd Epley in 1985 and the reason
 * different rep schemes can be compared at all.
 *
 * Two guards that matter more than the formula:
 *
 *   - A single at a given weight *is* that weight. The formula returns it
 *     exactly at reps = 1, but stating it avoids a floating-point 100.0000001.
 *   - Above about twelve reps the estimate stops being an estimate. Epley is
 *     roughly linear and real strength curves are not, so a set of thirty
 *     bodyweight squats would "prove" a 2× bodyweight max. Beyond the cap this
 *     returns null and the caller shows nothing rather than a fiction.
 */
export const MAX_REPS_FOR_ESTIMATE = 12;

export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps < 1) return null;
  if (reps > MAX_REPS_FOR_ESTIMATE) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * What a set actually loaded, including the body.
 *
 * A weighted pull-up at +20kg on an 80kg member is a 100kg movement, and a
 * bodyweight one is an 80kg movement rather than a zero.
 */
export function totalLoadKg(
  addedKg: number,
  bodyweightFactor: number,
  bodyweightKg: number | null,
): number {
  const fromBody = bodyweightFactor > 0 && bodyweightKg ? bodyweightFactor * bodyweightKg : 0;
  return addedKg + fromBody;
}

/** Sets × reps × load. The blunt measure of how much work a session was. */
export function volumeKg(reps: number, loadKg: number): number {
  return reps * loadKg;
}

// ─── Units ─────────────────────────────────────────────────────────────────

export const KG_PER_LB = 0.45359237;

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/**
 * Rounded the way a gym rounds.
 *
 * Plates come in fixed steps, so displaying 102.058kg is noise. Pounds go to
 * the nearest whole; kilos to the nearest 0.5, which is the smallest plate
 * most gyms have.
 */
export function displayWeight(kg: number, unit: "kg" | "lb"): number {
  if (unit === "lb") return Math.round(kgToLb(kg));
  return Math.round(kg * 2) / 2;
}

export const weightUnitEnum = z.enum(["kg", "lb"]);
export type WeightUnit = z.infer<typeof weightUnitEnum>;

/**
 * ── The vocabularies, stated once ─────────────────────────────────────────
 *
 * These two lists had drifted into four disagreeing copies: a zod enum here, a
 * CHECK constraint in Postgres, whatever the catalogue happened to write, and
 * whatever the admin select happened to offer. The catalogue quietly grew
 * `rings`, `sled`, `elastic` and `flow`; nothing complained, because nothing
 * compared them — until the sync endpoint finally ran and Postgres rejected a
 * sled push on a constraint written before sleds existed.
 *
 * So: one array each, the zod enums derived from them, a test that every
 * catalogue row uses a word from them, and a migration that sets the CHECK
 * constraints to exactly these. Adding a word is now one edit and a migration,
 * and forgetting the migration fails loudly at the sync rather than silently
 * in the picker.
 *
 * `pattern` is how a coach programmes — hinge, push, carry. `equipment` is
 * what it is done on, which for the studio work is a machine with a name
 * rather than a plate: a reformer is not a "machine" in any sense that helps
 * somebody searching for one.
 */
export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "push",
  "pull",
  "carry",
  "core",
  "rotation",
  "isometric",
  "balance",
  "locomotion",
  "elastic",
  "conditioning",
  "mobility",
  "tissue",
  "breath",
  "recovery",
  "flow",
  "sport",
] as const;

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "machine",
  "smith_machine",
  "cable",
  "bodyweight",
  "band",
  "medicine_ball",
  "rings",
  "sled",
  // Studio apparatus. Named rather than folded into "machine" because a member
  // looking for reformer work is looking for a reformer.
  "mat",
  "reformer",
  "cadillac",
  "chair",
  "barrel",
  "spine_corrector",
  "megaformer",
  "barre",
  "pilates_ring",
  "other",
] as const;

export const movementPatternEnum = z.enum(MOVEMENT_PATTERNS);
export const equipmentEnum = z.enum(EQUIPMENT);

export const trackingTypeEnum = z.enum(["reps", "duration", "distance"]);
export type TrackingType = z.infer<typeof trackingTypeEnum>;

// ─── Insert schemas ────────────────────────────────────────────────────────

export const insertExerciseSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  name: z.string().min(1).max(120),
  pattern: movementPatternEnum.default("push"),
  equipment: equipmentEnum.default("barbell"),
  trackingType: trackingTypeEnum.default("reps"),
  bodyweightFactor: z.number().min(0).max(2).default(0),
  muscleGroups: z.array(z.string().max(40)).max(3).optional(),
  aliases: z.array(z.string().max(60)).optional(),
  tracksOneRepMax: z.boolean().default(true),
  demoUrl: z.string().url().nullable().optional(),
  cues: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

/**
 * One recorded set.
 *
 * The refinement is the important part: exactly the same rule as the database
 * CHECK, so a set measuring nothing is refused with a sentence at the API
 * rather than a constraint violation from Postgres.
 */
export const logSetSchema = z
  .object({
    exerciseId: z.string().min(1),
    habitExerciseId: z.string().uuid().nullable().optional(),
    reps: z.number().int().min(1).max(500).nullable().optional(),
    durationSeconds: z.number().int().min(1).max(86400).nullable().optional(),
    distanceM: z.number().min(0.1).max(500000).nullable().optional(),
    /** Sent in the member's unit; converted to kg before it is stored. */
    weight: z.number().min(0).max(2000).default(0),
    unit: weightUnitEnum.default("lb"),
    isWarmup: z.boolean().default(false),
    rpe: z.number().min(1).max(10).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) => v.reps != null || v.durationSeconds != null || v.distanceM != null,
    { message: "A set needs reps, a duration or a distance." },
  );

const prescribeExerciseFields = z.object({
    exerciseId: z.string().min(1),
    orderIndex: z.number().int().min(0).default(0),
    targetSets: z.number().int().min(1).max(20).default(3),
    targetRepsLow: z.number().int().min(1).max(100).nullable().optional(),
    targetRepsHigh: z.number().int().min(1).max(100).nullable().optional(),
    targetPercent1rm: z.number().min(1).max(150).nullable().optional(),
    restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const repRangeMakesSense = (v: {
  targetRepsLow?: number | null;
  targetRepsHigh?: number | null;
}) => v.targetRepsLow == null || v.targetRepsHigh == null || v.targetRepsLow <= v.targetRepsHigh;

const REP_RANGE_MESSAGE = {
  message: "The low rep target has to be at or below the high one.",
};

export const prescribeExerciseSchema = prescribeExerciseFields.refine(
  repRangeMakesSense,
  REP_RANGE_MESSAGE,
);

/**
 * The same rules for a partial edit.
 *
 * `.partial()` cannot be called on a refined schema — refining returns a
 * ZodEffects, which has no such method — so the fields are declared once and
 * the refinement is applied to both shapes rather than duplicated.
 */
export const prescribeExercisePatchSchema = prescribeExerciseFields
  .partial()
  .refine(repRangeMakesSense, REP_RANGE_MESSAGE);

export const startSessionSchema = z.object({
  habitId: z.string().uuid().nullable().optional(),
  title: z.string().max(120).nullable().optional(),
});

export const bodyMeasurementSchema = z.object({
  weight: z.number().min(20).max(700),
  unit: weightUnitEnum.default("lb"),
  heightCm: z.number().min(80).max(260).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

export type Exercise = typeof exercises.$inferSelect;
export type HabitExercise = typeof habitExercises.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type WorkoutSet = typeof workoutSets.$inferSelect;
export type BodyMeasurement = typeof bodyMeasurements.$inferSelect;
