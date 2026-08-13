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
  /**
   * The bucket, and deliberately not in the practice group.
   *
   * It is where a member-created movement lands and where nine pre-catalogue
   * lifts still live — Deadlift, Bench Press, Dip. It sat under "Practices"
   * when that group meant "whole sessions" and nothing depended on the
   * distinction; the moment `isPracticeCategory` started reading the group,
   * that placement quietly declared a deadlift to be a class, and the app
   * would have asked how many *minutes* of it somebody did.
   */
  { id: "full_body", label: "Full body", group: "strength" },

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
/**
 * ── What somebody actually does ───────────────────────────────────────────
 *
 * Six hundred and fifty-seven movements is the right catalogue and the wrong
 * first impression. A member who does Pilates, walks and stretches should not
 * open Build and find a bodybuilding app; a member who only lifts should not
 * be scrolling past reformer work to reach a squat rack.
 *
 * So one question, once: what kinds of movement are part of your life? The
 * answer narrows what is *shown by default* and nothing else. Search still
 * spans the whole catalogue, every group chip is still there, and nothing is
 * hidden in a way that cannot be undone with one tap — because the failure
 * mode of a preference like this is somebody unable to find a movement they
 * know exists, which is worse than a long list.
 *
 * Fourteen choices rather than forty categories. A member does not think "I do
 * neck and grip work"; they think "I lift". The mapping from a choice to the
 * categories behind it lives here, and a test asserts every category is
 * reachable through at least one of them — otherwise a whole shelf of the
 * catalogue becomes invisible to anybody who answers this question.
 */
export const BUILD_MODALITIES = [
  {
    id: "lifting",
    label: "Lifting",
    hint: "Barbells, dumbbells, machines",
    categories: [
      "chest", "back", "shoulders", "arms", "legs", "glutes", "calves", "core",
      "olympic", "landmine", "neck_grip", "isometric", "full_body",
    ],
  },
  {
    id: "calisthenics",
    label: "Calisthenics",
    hint: "Your own bodyweight, rings",
    categories: ["calisthenics", "rings"],
  },
  {
    id: "athletic",
    label: "Athletic",
    hint: "Sprints, jumps, agility, carries",
    categories: [
      "explosive", "plyometric", "agility", "rotation", "balance", "ground",
      "carry", "kettlebell", "locomotion",
    ],
  },
  {
    id: "endurance",
    label: "Running, cycling, swimming",
    hint: "Anything with a distance or a clock",
    categories: ["endurance", "cardio"],
  },
  { id: "sport", label: "Sports", hint: "Ball games, martial arts, climbing", categories: ["sport"] },
  { id: "pilates", label: "Pilates", hint: "Mat, reformer, apparatus", categories: ["pilates"] },
  { id: "lagree", label: "Lagree", hint: "Megaformer", categories: ["lagree"] },
  { id: "barre", label: "Barre", hint: "", categories: ["barre"] },
  { id: "yoga", label: "Yoga", hint: "Poses and flows", categories: ["yoga"] },
  {
    id: "mobility",
    label: "Mobility",
    hint: "Stretching, joints, feet",
    categories: ["mobility", "feet", "corrective"],
  },
  {
    id: "fascia",
    label: "Fascia & elastic",
    hint: "Springiness, tissue work, somatics",
    categories: ["fascia", "somatic", "tissue"],
  },
  {
    id: "recovery",
    label: "Breath & recovery",
    hint: "Breathwork, sauna, easy movement",
    categories: ["breath", "recovery"],
  },
  { id: "classes", label: "Classes", hint: "Anything taught in a room", categories: ["class"] },
  { id: "flows", label: "Flows", hint: "Whole practices, logged by time", categories: ["practice"] },
] as const;

export type BuildModality = (typeof BUILD_MODALITIES)[number]["id"];

/** The categories behind a set of chosen modalities. Empty means "all of it". */
export function categoriesForModalities(chosen: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const m of BUILD_MODALITIES) {
    if (chosen.includes(m.id)) for (const c of m.categories) out.add(c);
  }
  return out;
}

/**
 * Where the answer lives.
 *
 * Its own table rather than a column on `users` because it is Build's, and
 * because this is the first row of what will become a member's Build profile —
 * goals, equipment, limitations, the things a recommendation would need. A
 * text array rather than rows-per-choice: it is read whole, written whole, and
 * never joined against.
 */
export const memberBuildProfile = pgTable(
  "member_build_profile",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    /** Empty or absent means the question has not been answered — not "none". */
    modalities: text("modalities").array(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("uq_member_build_profile").on(t.userId)],
);

export const modalitiesSchema = z.object({
  modalities: z.array(z.string().max(40)).max(BUILD_MODALITIES.length),
});

/**
 * How many rows `GET /api/training/exercises` will return.
 *
 * Here rather than in the route because the picker's correctness depends on it:
 * it fetches the catalogue once and filters in memory, so anything past this
 * line does not exist as far as a member is concerned.
 *
 * It was 300, set when the picker searched server-side, and stayed 300 after
 * the picker stopped. Nothing connected the two, so the catalogue silently
 * truncated at 300 of 657 in declaration order — and the cut fell exactly
 * across the newest categories. A test asserts the catalogue fits.
 */
export const CATALOGUE_FETCH_LIMIT = 2000;

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

// ─── 1a-ii. WHAT A CATEGORY ASKS OF THE BODY ───────────────────────────────

/**
 * Two loads per category, and orientation derived from them.
 *
 * ── Why two numbers rather than one label ─────────────────────────────────
 *
 * The obvious shape is a single `orientation: "yin" | "yang"` column, and it
 * is wrong for the cases that matter most. A sauna is a genuine cardiovascular
 * stressor *and* genuinely restorative; so is a long easy ride; so is a hard
 * yoga class. Forcing one label makes the model pick a side, and it will pick
 * the wrong one exactly where a member most needs it to be right — the brief
 * makes this point about fasting, which is "cleansing" and also one of the
 * larger stressors a person can apply to themselves.
 *
 * Two independent loads say the true thing: sauna is high on both. Orientation
 * then *falls out* rather than being asserted, which means it can never
 * disagree with the numbers it came from.
 *
 * ── Scale ─────────────────────────────────────────────────────────────────
 *
 *   0  none        1  mild        2  moderate        3  substantial
 *
 * These are per *category*, not per movement, because a category is the level
 * at which the claim is defensible. "Plyometrics are demanding" is true of
 * every plyometric; "this particular box jump is a 2" is a number nobody can
 * check. Per-movement overrides can come later if a real case appears — the
 * lookup below is already the only thing that would have to change.
 *
 * Deliberately not a database column. There are 34 categories and one correct
 * answer per category; a column would mean 657 rows to backfill, 657 chances
 * to disagree with each other, and a migration every time a judgement changes.
 * This is a constant because it is a decision, not data.
 */
export type MovementLoad = { stress: 0 | 1 | 2 | 3; restoration: 0 | 1 | 2 | 3 };

export const CATEGORY_LOAD: Readonly<Record<string, MovementLoad>> = {
  // ── Strength — demand, with little restorative value of its own ──
  chest: { stress: 3, restoration: 0 },
  back: { stress: 3, restoration: 0 },
  shoulders: { stress: 2, restoration: 0 },
  arms: { stress: 2, restoration: 0 },
  legs: { stress: 3, restoration: 0 },
  glutes: { stress: 2, restoration: 0 },
  calves: { stress: 1, restoration: 0 },
  core: { stress: 2, restoration: 0 },
  olympic: { stress: 3, restoration: 0 },
  landmine: { stress: 2, restoration: 0 },
  calisthenics: { stress: 2, restoration: 0 },
  rings: { stress: 3, restoration: 0 },
  neck_grip: { stress: 1, restoration: 0 },
  // Isometrics load hard and leave the tissue calmer than they found it, which
  // is why they survive in rehab where nothing else does.
  isometric: { stress: 2, restoration: 1 },
  full_body: { stress: 2, restoration: 0 },

  // ── Athletic ──
  explosive: { stress: 3, restoration: 0 },
  plyometric: { stress: 3, restoration: 0 },
  agility: { stress: 2, restoration: 0 },
  locomotion: { stress: 2, restoration: 1 },
  carry: { stress: 3, restoration: 0 },
  kettlebell: { stress: 2, restoration: 0 },
  rotation: { stress: 2, restoration: 1 },
  balance: { stress: 1, restoration: 1 },
  ground: { stress: 1, restoration: 2 },
  cardio: { stress: 2, restoration: 1 },

  // ── Mobility — the clearest Yin in the catalogue ──
  mobility: { stress: 0, restoration: 3 },
  feet: { stress: 0, restoration: 2 },
  corrective: { stress: 1, restoration: 2 },
  // Yoga is the case the single-label version gets wrong: a restorative class
  // and a led ashtanga class are the same category and not the same demand.
  yoga: { stress: 1, restoration: 3 },

  // ── Studio ──
  /**
   * Build, not Both.
   *
   * This was `restoration: 2`, which made Pilates the only category in the
   * whole table whose orientation came out `both` — and `sideOf` in
   * recommend.ts sends `both` to Restore, so "Pilates & Reformer" was being
   * offered under Restore's "Try something different". That is the wrong shelf
   * for it. Reformer work is resistance against a spring: muscular control,
   * structural development, training capacity. Somebody who takes it as their
   * recovery session has not recovered.
   *
   * It still gives something back, which is what `restoration: 1` says. What it
   * no longer claims is that it gives back as much as it asks. A specifically
   * restorative variant can earn its own category if one ever appears; the
   * generic word belongs here.
   */
  pilates: { stress: 2, restoration: 1 },
  // Lagree is not Pilates for this purpose. It is deliberately taken close to
  // failure under constant tension, and treating it as gentle because it
  // happens on a carriage would understate a member's week considerably.
  lagree: { stress: 3, restoration: 1 },
  barre: { stress: 2, restoration: 1 },

  // ── Fascia ──
  fascia: { stress: 1, restoration: 3 },
  somatic: { stress: 0, restoration: 3 },
  tissue: { stress: 0, restoration: 3 },
  breath: { stress: 0, restoration: 3 },
  recovery: { stress: 0, restoration: 3 },

  // ── Whole sessions ──
  practice: { stress: 1, restoration: 2 },
  class: { stress: 2, restoration: 1 },
  sport: { stress: 3, restoration: 0 },
  endurance: { stress: 3, restoration: 1 },
};

/**
 * Which direction something leans, or that it genuinely does both.
 *
 * `both` is not a hedge and not the same as `neutral`: a sauna is both, a
 * gentle walk is neither, and telling a member they are the same thing would
 * be worse than saying nothing.
 */
export type Orientation = "yin" | "yang" | "both" | "neutral";

export function orientationOfLoad({ stress, restoration }: MovementLoad): Orientation {
  const demanding = stress >= 2;
  const restoring = restoration >= 2;
  if (demanding && restoring) return "both";
  if (demanding) return "yang";
  if (restoring) return "yin";
  return "neutral";
}

/** Unknown categories are neutral — an absent judgement, not a guessed one. */
export function categoryLoad(category: string): MovementLoad {
  return CATEGORY_LOAD[category] ?? { stress: 0, restoration: 0 };
}

export function categoryOrientation(category: string): Orientation {
  return orientationOfLoad(categoryLoad(category));
}

export const ORIENTATION_LABEL: Readonly<Record<Orientation, string>> = {
  yin: "Restore",
  yang: "Build",
  both: "Both",
  neutral: "Neutral",
};

/**
 * A workout Apple Health or Health Connect knows about, placed in our own
 * vocabulary.
 *
 * ── Why this is a translation and not a second classifier ─────────────────
 *
 * The temptation is a table mapping Apple's activity types straight to Restore
 * and Build. That would be a second opinion about movement living beside the
 * one above, and the two would drift the first time a category's load changed —
 * a run would be Build in one place and something else in the other, with
 * nothing to say which was right.
 *
 * So this only answers "what is this, in Sakred's terms". Whether it is Restore
 * or Build is then decided where it is decided for everything else, by
 * CATEGORY_LOAD and categoryOrientation. Changing what a run costs a member is
 * still one edit, in one table.
 *
 * ── The vocabulary on each side ───────────────────────────────────────────
 *
 * The keys are what our own readers emit, not raw platform enums: iOS turns
 * HKWorkoutActivityType into a lowercase name in HealthSyncEngine.activityName,
 * and Android does the same for ExerciseSessionRecord's exercise types. Both
 * deliberately produce the same small set, so this table is shared rather than
 * one per platform.
 *
 * ── What is deliberately absent ───────────────────────────────────────────
 *
 * Anything unrecognised returns null and is counted by nothing. An imported
 * workout we cannot place is still shown to the member with its duration and
 * its source, because it happened — but guessing a category for it would feed
 * an invented load into the terrain reading, and a wrong reason there is worse
 * than a missing one.
 */
export const EXTERNAL_ACTIVITY_CATEGORY: Readonly<Record<string, string>> = {
  // ── Yang: these ask something of the body ──
  running: "endurance",
  cycling: "endurance",
  swimming: "endurance",
  rowing: "endurance",
  elliptical: "cardio",
  stairs: "cardio",
  hiit: "explosive",
  strength: "full_body",
  boxing: "sport",
  tennis: "sport",
  dance: "class",

  /**
   * Named by iOS and, until now, mapped by nothing.
   *
   * `HealthSyncEngine.activityName` emits "martial arts" for
   * `.martialArts`, and this table had no key for it — so an iOS member's BJJ
   * or muay thai session was stored, shown on their health card, and counted
   * by nothing. It contributed no load to terrain and did not reset "nothing
   * demanding in N days". Android is unaffected because its reader folds
   * martial arts into "boxing", which is itself worth noticing: the two
   * platforms disagreed, and the disagreement was invisible.
   *
   * An unmapped activity failing silently is the expensive property of this
   * table. Nothing warns; the member simply gets advice computed as though
   * they had not trained.
   */
  "martial arts": "sport",

  /**
   * Meditation, tai chi, qigong — Apple files all three under `.mindAndBody`.
   * Restorative, and previously invisible for the same reason.
   */
  "mind and body": "somatic",

  /** A gym class, when the platform will not say which kind. */
  class: "class",

  // ── Both, or contextual ──
  hiking: "locomotion",
  pilates: "pilates",
  core: "core",

  /**
   * Golf is not boxing.
   *
   * It sat under `sport`, which is `stress: 3` — the same figure as a boxing
   * session and a competitive tennis match. Four hours of golf is a long walk
   * with some rotational work in it, and telling somebody they have spent their
   * week's capacity on it would be a strange thing for the app to believe.
   */
  golf: "locomotion",

  /**
   * ── Why a walk is not a demanding session ───────────────────────────────
   *
   * `walking` mapped to `locomotion`, which is `stress: 2` — and `stress >= 2`
   * is the definition of demanding everywhere in this file. So every walk Apple
   * Health recorded counted as a training session: a member who walks the dog
   * twice a day could reach "9 demanding sessions this week" without training
   * once, and Restore would then be reasoning about recovery they do not need.
   *
   * It is also a double count. A walk has already been recorded in steps,
   * distance and active energy for that day; counting it again as a session
   * charges the same movement to the member twice.
   *
   * `recovery` is where the modality list already puts easy movement, alongside
   * breathwork and sauna. Hiking stays under locomotion, because a hike is a
   * different proposition and the platforms distinguish them.
   */
  walking: "recovery",

  // ── Yin: these give more than they take ──
  yoga: "yoga",
  flexibility: "mobility",
  cooldown: "recovery",

  // `other` is deliberately not here. It is what our own readers emit when
  // they do not recognise the platform's type, so mapping it would be
  // inventing a category for something we already failed to identify.
};

/**
 * The Sakred category for an imported workout, or null if we cannot say.
 *
 * Null is a real answer and callers must handle it: it means the workout is
 * shown but contributes no load, which is the honest treatment of an activity
 * whose character we do not know.
 */
/**
 * What a member would call an imported activity.
 *
 * The stored `workout_type` is already normalized to a plain lowercase word —
 * "yoga", "running", "strength" — rather than a platform identifier, so this is
 * presentation only and deliberately small. It is not a second taxonomy: the
 * category remains what the load model reads.
 *
 * Anything with its own capitalization gets it; everything else is title-cased.
 * Unknown words pass through title-cased rather than being dropped, because a
 * word the member's phone chose is still more use to them than a blank.
 */
const ACTIVITY_LABEL: Readonly<Record<string, string>> = {
  hiit: "HIIT",
  tai_chi: "Tai chi",
  taichi: "Tai chi",
  jump_rope: "Jump rope",
  strength_training: "Strength",
  functional_strength: "Strength",
  cross_training: "Cross-training",
  high_intensity: "HIIT",
};

export function activityLabel(workoutType: string | null | undefined): string | null {
  if (!workoutType) return null;
  const key = workoutType.trim().toLowerCase();
  if (!key) return null;
  const known = ACTIVITY_LABEL[key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function externalActivityCategory(workoutType: string | null | undefined): string | null {
  if (!workoutType) return null;
  return EXTERNAL_ACTIVITY_CATEGORY[workoutType.trim().toLowerCase()] ?? null;
}

/**
 * Restore, Build, Both — or null when the activity could not be placed.
 *
 * Straight through the same orientation model every Sakred-logged session
 * uses, which is the entire point of the table above.
 */
export function externalActivityOrientation(
  workoutType: string | null | undefined,
): Orientation | null {
  const category = externalActivityCategory(workoutType);
  return category === null ? null : categoryOrientation(category);
}

/**
 * Imported activity types that actually cost the body something.
 *
 * Derived from the two tables above rather than written out, so it cannot
 * drift: change what a category costs in CATEGORY_LOAD and this follows. A
 * hand-kept second list is how "yoga counts as training" gets shipped by
 * somebody editing one file and not the other.
 *
 * Used to answer "how long since they last did something demanding" — yoga and
 * stretching are real movement and belong in a member's history, but letting
 * them reset that counter would tell someone who has stretched for a fortnight
 * that they have been training.
 *
 * "Demanding" is `stress >= 2`, which is not a new threshold: it is the one
 * `orientationOfLoad` already uses to decide that something is Build. Yoga sits
 * at 1 and is correctly excluded. Picking any other number here would mean an
 * activity could be demanding enough to reset this counter while not being
 * demanding enough to count as Build, which is two definitions of the same word.
 */
export const DEMANDING_EXTERNAL_TYPES: string[] = Object.entries(EXTERNAL_ACTIVITY_CATEGORY)
  .filter(([, category]) => orientationOfLoad(categoryLoad(category)) === "yang"
    || orientationOfLoad(categoryLoad(category)) === "both")
  .map(([type]) => type);

// ─── 1a-iv. WHAT THE PERSON SAYS ABOUT IT ──────────────────────────────────

/**
 * Three things about one session, kept apart on purpose.
 *
 *   what happened          the imported event — type, duration, distance
 *   what it asks of a body CATEGORY_LOAD, via the table above
 *   how it landed          the member's own answer, below
 *
 * The first is Apple's or Google's to state, the second is ours, the third is
 * only ever the member's. Collapsing any two of them loses something real: a
 * 54-minute run that somebody found restorative was still a 54-minute run, and
 * an app that lets "it felt good" delete the load will cheerfully tell them
 * they are fresh on the fourth day of it.
 *
 * So nothing here feeds `categoryLoad`. This module is what somebody says about
 * a session; the load model is what the session cost. Both are stored, and only
 * one of them is a matter of opinion.
 */

/** How it landed. Absent is the normal state — most sessions are never rated. */
export const WORKOUT_RESPONSES = ["restored", "steady", "taxed"] as const;
export type WorkoutResponse = (typeof WORKOUT_RESPONSES)[number];

export const WORKOUT_RESPONSE_LABEL: Readonly<Record<WorkoutResponse, string>> = {
  restored: "Restored me",
  steady: "Steady",
  taxed: "Taxed me",
};

/**
 * Where a session sits in the app, which is a different question from what it
 * cost.
 *
 * Deliberately its own vocabulary rather than reusing `Orientation`. An
 * override spelled "yang" is one careless line away from being fed into a load
 * calculation — it would type-check — and that is exactly the mistake this
 * whole section exists to prevent. Spelled as Restore and Build, it can only
 * ever answer the question it is for: which side of the app this session is
 * shown on. Nothing downstream of `CATEGORY_LOAD` accepts one of these.
 */
export const WORKOUT_PLACEMENTS = ["restore", "build", "both"] as const;
export type WorkoutPlacement = (typeof WORKOUT_PLACEMENTS)[number];

export const PLACEMENT_LABEL: Readonly<Record<WorkoutPlacement, string>> = {
  restore: "Restore",
  build: "Build",
  both: "Both",
};

/**
 * Sakred's own reading of a session, in placement terms.
 *
 * `neutral` becomes null rather than a fourth placement: a gentle walk is
 * genuinely neither, and putting it under Build or Restore would be the app
 * asserting something it does not think.
 */
export function placementOfOrientation(
  orientation: Orientation | null | undefined,
): WorkoutPlacement | null {
  if (orientation === "yin") return "restore";
  if (orientation === "yang") return "build";
  if (orientation === "both") return "both";
  return null;
}

/**
 * Where this session is shown — the member's choice if they made one, ours
 * otherwise.
 *
 * Clearing the override is not a third state to store. It returns null, this
 * falls through to the canonical reading, and the member is back where they
 * started with nothing left behind to go stale.
 */
export function effectivePlacement(
  workoutType: string | null | undefined,
  override: WorkoutPlacement | null | undefined,
): WorkoutPlacement | null {
  if (override) return override;
  return placementOfOrientation(externalActivityOrientation(workoutType));
}

/** Whether an override was used — derived, so it can never disagree. */
export function placementIsMembers(override: WorkoutPlacement | null | undefined): boolean {
  return override != null;
}

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

// ─── Reading a session back ────────────────────────────────────────────────

/**
 * What a set looks like once it has been read back and converted.
 * `weight` is already in the member's own unit; nothing here converts.
 */
export type LoggedSet = {
  name: string;
  category: string;
  trackingType: string;
  reps: number | null;
  durationSeconds: number | null;
  weight: number | null;
  isWarmup: boolean;
};

/**
 * One line per movement, collapsed.
 *
 *   Barbell Bench Press — 3 × 8 @ 185 lb
 *   Plank — 3 × 45s
 *   Reformer Pilates — 45 min
 *
 * Here rather than on the server because two places render it: the message
 * posted into the coaching thread, and the member's own history. Those had
 * better not disagree — a coach reading "3 × 8 @ 185" while the member's
 * screen says something else is the kind of small mismatch that makes somebody
 * stop trusting both.
 *
 * Warm-ups are dropped, the same way every derived number in this file drops
 * them. Order follows first appearance, which is the order it was done in.
 */
export function summariseSession(sets: LoggedSet[], unit: WeightUnit): string[] {
  const working = sets.filter((s) => !s.isWarmup);
  const byMovement = new Map<string, LoggedSet[]>();
  for (const s of working) {
    const list = byMovement.get(s.name) ?? [];
    list.push(s);
    byMovement.set(s.name, list);
  }

  // Array.from rather than iterating the Map directly — this targets a build
  // without downlevelIteration.
  return Array.from(byMovement.entries()).map(([name, group]) => {
    const first = group[0];

    // A class is one line and the honest unit is minutes. "Reformer Pilates —
    // 1 × 2700s" is the sort of detail that makes a coach stop reading.
    if (isPracticeCategory(first.category)) {
      const total = group.reduce((t, s) => t + (s.durationSeconds ?? 0), 0);
      return `${name} — ${Math.round(total / 60)} min`;
    }

    if (first.trackingType === "duration") {
      const total = group.reduce((t, s) => t + (s.durationSeconds ?? 0), 0);
      return `${name} — ${group.length} × ${Math.round(total / group.length)}s`;
    }

    const reps = group.map((s) => s.reps ?? 0);
    const same = reps.every((n) => n === reps[0]);
    const loads = group.map((s) => s.weight ?? 0).filter((n) => n > 0);
    const top = loads.length ? Math.max(...loads) : null;
    return (
      `${name} — ${group.length} × ${same ? reps[0] : reps.join("/")}` +
      (top ? ` @ ${top}${unit}` : "")
    );
  });
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
