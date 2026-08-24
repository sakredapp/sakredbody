/**
 * Health data from the phone — Apple Health and Health Connect
 *
 *   health_connections  — that a member linked a phone, and how far we've read
 *   health_days         — one number, for one member, for one day, for one metric
 *   health_workouts     — sessions, which are events rather than daily totals
 *
 * The device is the source of truth for what happened, and we are a cache of
 * it. None of the measurements are authored by us and none should be edited by
 * hand: a member revokes access in iOS Settings or Health Connect, not in our
 * UI, and the next sync simply stops carrying that metric.
 *
 * The two exceptions are named as such where they appear — `user_response` and
 * `user_orientation_override` on health_workouts, which are the member's
 * account of a session rather than the platform's, and which a sync must never
 * overwrite.
 *
 * WHY LONG AND NARROW, not a wide `health_days(steps, hrv, sleep_minutes, …)`:
 * the metric vocabulary is the platforms', not ours, and it grows. Apple added
 * wrist temperature; Health Connect added skin temperature after that. A wide
 * table turns each of those into a migration, a schema type change, and a
 * client change — and the migration is the step that gets skipped, so the
 * column exists in the type and never in the database. One row per metric
 * costs a little space and makes a new metric a string.
 *
 * The cost of that choice, stated honestly: you cannot express "steps and HRV
 * for the same day" as one row without a pivot. Every read here is
 * "some metrics over a date range for one member", which pivots in the query,
 * so that cost never lands on a request path.
 *
 * We store DAILY AGGREGATES, not raw samples. A watch writes heart rate every
 * few seconds — a year of one member is millions of rows to say something a
 * coach reads as a single line. The device aggregates before it posts.
 * Workouts are the exception, because a workout genuinely is one event.
 */

import { sql } from "drizzle-orm";
import { WORKOUT_RESPONSES, WORKOUT_PLACEMENTS } from "./training.js";
import { todayInZone } from "../utils/dates.js";
import {
  pgTable,
  text,
  uuid,
  integer,
  doublePrecision,
  jsonb,
  date,
  timestamp,
  index,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── 1. THE VOCABULARY ─────────────────────────────────────────────────────

/**
 * Every metric we will accept. A closed list on purpose: `metric` is a text
 * column, so without this a client typo writes `restingHR` next to
 * `restingHeartRate` and the chart quietly loses half its points with nothing
 * anywhere reporting an error.
 *
 * Names are ours, not either platform's — the client maps into these. That is
 * what keeps an iPhone member and an Android member comparable in one query.
 */
export const healthMetricEnum = z.enum([
  // Movement
  "steps",
  "distanceMeters",
  "flightsClimbed",
  "exerciseMinutes",
  "activeCalories",
  "totalCalories",
  // Heart
  "restingHeartRate",
  "heartRateVariability",
  "vo2Max",
  // Sleep — total, and the stages when the device breaks them out
  "sleepMinutes",
  "sleepDeepMinutes",
  "sleepRemMinutes",
  "sleepAwakeMinutes",
  // Body
  "weightKg",
  "bodyFatPercent",
  "heightCm",
  // Vitals
  "respiratoryRate",
  "oxygenSaturation",
  "bodyTemperatureC",
  // Practice
  "mindfulnessMinutes",
  "waterMl",
  "dietaryCalories",
]);
export type HealthMetric = z.infer<typeof healthMetricEnum>;

/**
 * The one unit each metric is stored in — always SI, always the same for both
 * platforms.
 *
 * This exists because HealthKit hands you whatever unit you ask for and Health
 * Connect hands you its own, so "82.4" is a plausible weight in kilograms and
 * a plausible weight in pounds, and a mixed column is not detectably wrong
 * until a member's weight chart has a 2.2x step in it on the day they changed
 * phones. The server rejects a sample whose unit is not this one rather than
 * converting: a conversion silently accepts a client that is confused about
 * what it is sending, and we would rather find that in a 400.
 */
export const HEALTH_UNITS: Record<HealthMetric, string> = {
  steps: "count",
  distanceMeters: "m",
  flightsClimbed: "count",
  exerciseMinutes: "min",
  activeCalories: "kcal",
  totalCalories: "kcal",
  restingHeartRate: "bpm",
  heartRateVariability: "ms",
  vo2Max: "mL/kg/min",
  sleepMinutes: "min",
  sleepDeepMinutes: "min",
  sleepRemMinutes: "min",
  sleepAwakeMinutes: "min",
  weightKg: "kg",
  bodyFatPercent: "%",
  heightCm: "cm",
  respiratoryRate: "brpm",
  oxygenSaturation: "%",
  bodyTemperatureC: "degC",
  mindfulnessMinutes: "min",
  waterMl: "mL",
  dietaryCalories: "kcal",
};

/**
 * Bounds a real human stays inside, used to drop impossible values before they
 * reach a chart. These are deliberately wide — this is a "the phone is
 * confused" filter, not a medical judgement, and a real outlier that a coach
 * should see must survive it.
 *
 * The failure this prevents is specific and common: a device that reports a
 * cumulative lifetime total instead of a daily one puts a single 4,000,000
 * step day in the series, and every other day flattens to nothing against the
 * new axis maximum.
 */
export const HEALTH_RANGES: Record<HealthMetric, [number, number]> = {
  steps: [0, 200_000],
  distanceMeters: [0, 500_000],
  flightsClimbed: [0, 2_000],
  exerciseMinutes: [0, 1_440],
  activeCalories: [0, 20_000],
  totalCalories: [0, 30_000],
  restingHeartRate: [20, 220],
  heartRateVariability: [0, 500],
  vo2Max: [5, 100],
  /**
   * Twelve hours, not twenty-four.
   *
   * `[0, 1_440]` said "a day has 1,440 minutes in it", which is true and is not
   * the question. It let six nights of 13h 30m to 17h 05m through in a single
   * week — the double-counting bug summing overlapping sessions — and because
   * they were arithmetically possible nothing rejected them. They then sat in
   * the 28-day baseline inflating "usual" to 10h 31m, so a member sleeping a
   * normal 7h 19m was told he was three hours down and that his terrain leaned
   * to Restore. Wrong, on the first card of the home screen, for a month.
   *
   * The generating bug is fixed (0482c63, "A night is a session, not a pile of
   * stages") but a range is the backstop for the next one, and the backstop was
   * set where it could never fire.
   *
   * Twelve hours is above any real night and below every artifact observed. The
   * cost of the cap is a genuinely enormous sleep-in being rejected; the cost of
   * not having it was a month of wrong readings. `rejectSample` returns a reason
   * rather than dropping silently, so a real one that is refused is visible.
   *
   * The stages keep a wider bound: they are a subdivision of the total, they
   * were never affected, and REM alone will never approach it.
   */
  sleepMinutes: [0, 720],
  sleepDeepMinutes: [0, 720],
  sleepRemMinutes: [0, 720],
  sleepAwakeMinutes: [0, 720],
  weightKg: [15, 500],
  bodyFatPercent: [1, 80],
  heightCm: [50, 260],
  respiratoryRate: [2, 80],
  oxygenSaturation: [50, 100],
  bodyTemperatureC: [25, 45],
  mindfulnessMinutes: [0, 1_440],
  waterMl: [0, 30_000],
  dietaryCalories: [0, 30_000],
};

export const healthPlatformEnum = z.enum(["healthkit", "healthconnect"]);
export type HealthPlatform = z.infer<typeof healthPlatformEnum>;

// ─── 2. CONNECTIONS ────────────────────────────────────────────────────────

export const healthConnections = pgTable(
  "health_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),

    /** 'healthkit' | 'healthconnect' */
    platform: text("platform").notNull(),

    /**
     * Which metrics the member actually granted, as of the last sync.
     *
     * Worth knowing that on iOS this is a polite fiction: HealthKit refuses to
     * tell an app whether READ access was denied, precisely so that an app
     * cannot infer "they hid their weight from me" — a denied read is
     * indistinguishable from no data. So this records what we asked for and
     * received something for, not a permission grant we can trust.
     */
    grantedMetrics: text("granted_metrics").array(),

    /**
     * The read watermark. The next sync starts here minus an overlap window,
     * never at "now" — see the note on syncing in server/health/routes.ts.
     */
    syncedThrough: timestamp("synced_through"),
    lastSyncAt: timestamp("last_sync_at"),
    /** Rows written by the last sync. 0 for a long stretch means look at it. */
    lastSyncCount: integer("last_sync_count").notNull().default(0),
    lastError: text("last_error"),

    /** For support: "it works on my phone" is answerable with a model string. */
    deviceModel: text("device_model"),
    osVersion: text("os_version"),

    /**
     * Set when the member disconnects. The row is kept and the data is deleted
     * — the opposite of the usual soft delete, and deliberate. Both stores
     * require that revoking access removes the data; nobody requires us to
     * forget that a phone was once linked, and keeping it means a re-link
     * starts from a known watermark instead of re-reading a year.
     */
    revokedAt: timestamp("revoked_at"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_health_connections").on(t.userId, t.platform),
    index("idx_health_connections_user").on(t.userId),
  ]
);

export type HealthConnection = typeof healthConnections.$inferSelect;
export const insertHealthConnectionSchema = createInsertSchema(healthConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── 3. DAILY VALUES ───────────────────────────────────────────────────────

export const healthDays = pgTable(
  "health_days",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),

    /**
     * The member's own calendar date, as the phone computed it — matching
     * daily_notes.on_date, and for the same reason. A member in Bali whose
     * steps land on the server's yesterday has a chart that is wrong by a day
     * forever, and it is wrong in a way that looks like a data problem rather
     * than a timezone one.
     */
    onDate: date("on_date").notNull(),

    /** One of healthMetricEnum. */
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
    /** Always HEALTH_UNITS[metric]. Stored anyway, so a row is self-describing. */
    unit: text("unit").notNull(),

    /** 'healthkit' | 'healthconnect' — which phone this came from. */
    source: text("source").notNull(),
    /**
     * The app that originally wrote it into Health, when the platform says
     * so — "Oura", "Whoop", "Apple Watch". A coach reading an HRV number
     * wants to know whether a ring or a phone produced it.
     */
    sourceApp: text("source_app"),

    syncedAt: timestamp("synced_at").defaultNow(),
  },
  (t) => [
    /**
     * The idempotency key. Every sync re-reads a trailing window, so the same
     * day arrives many times; this is what makes the second arrival an update
     * instead of a duplicate row that doubles a step count.
     */
    uniqueIndex("uq_health_days").on(t.userId, t.onDate, t.metric),
    index("idx_health_days_user_metric").on(t.userId, t.metric, t.onDate),
  ]
);

export type HealthDay = typeof healthDays.$inferSelect;

/** One value the phone is posting. */
export const healthSampleSchema = z.object({
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "onDate must be YYYY-MM-DD."),
  metric: healthMetricEnum,
  value: z.number().finite(),
  unit: z.string().min(1),
  sourceApp: z.string().max(120).optional().nullable(),
});
export type HealthSampleInput = z.infer<typeof healthSampleSchema>;

// ─── 4. WORKOUTS ───────────────────────────────────────────────────────────

export const healthWorkouts = pgTable(
  "health_workouts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),

    /**
     * The platform's own id for the session. This is the whole reason a
     * workout is not stored as a daily total: it is what lets a re-sync
     * recognise the same run rather than adding a second one.
     */
    externalId: text("external_id").notNull(),

    /** Free text from the platform — 'running', 'strength', 'yoga', … */
    workoutType: text("workout_type"),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at"),
    /** The member's local date, for grouping alongside health_days. */
    onDate: date("on_date").notNull(),

    durationSeconds: integer("duration_seconds"),
    activeCalories: doublePrecision("active_calories"),
    distanceMeters: doublePrecision("distance_meters"),
    avgHeartRate: doublePrecision("avg_heart_rate"),
    maxHeartRate: doublePrecision("max_heart_rate"),

    source: text("source").notNull(),
    sourceApp: text("source_app"),
    /** Whatever else the platform sent, unread. Cheap, and answers questions later. */
    raw: jsonb("raw"),

    /**
     * ── The member's columns ────────────────────────────────────────────────
     *
     * Everything above this line is the platform's account of what happened,
     * and a re-sync is entitled to correct any of it — Apple revising a
     * distance from 5.73 to 5.76 miles is the system working. These two are
     * not the platform's to touch. They are what the person said about the
     * session, and no amount of re-reading Health Connect makes that stale.
     *
     * The upsert in `server/health/routes.ts` therefore names its columns
     * rather than writing the row wholesale, and these are deliberately absent
     * from that list. A test pins it, because the failure is silent: the member
     * answers once, syncs again an hour later, and their answer is simply gone
     * with nothing in a log to say why.
     */

    /** restored | steady | taxed — how it landed. Null is the normal state. */
    userResponse: text("user_response"),

    /**
     * restore | build | both — where the member wants it shown.
     *
     * Null means Sakred's own reading applies, which is also how clearing it
     * works: there is no "system" value to write back, so an override that is
     * removed leaves nothing behind that could later disagree with the model.
     * See `effectivePlacement` in shared/models/training.ts.
     *
     * This changes where a session appears. It does not change what it cost —
     * terrain and load read `CATEGORY_LOAD` through the activity's category and
     * never look at this column.
     */
    userOrientationOverride: text("user_orientation_override"),

    /**
     * What the member says they actually trained.
     *
     * An imported `strength` workout carries no muscle-group truth: only a
     * Sakred-logged session reaches `exercises.muscleGroups` through its sets.
     * So Sakred must never infer "yesterday was legs" from a watch — but there
     * is no reason it cannot simply ask, and this is where the answer lives.
     *
     * Enrichment, not correction. The platform still said Strength Training and
     * the load model still reads the category; this adds the one thing neither
     * of them can know. Once it exists, "Chest has had more room than Back
     * recently" becomes a sentence Sakred is entitled to say.
     */
    userFocus: text("user_focus"),

    /** Their own name for it — "Back day". Never generated, only typed. */
    userLabel: text("user_label"),

    /**
     * When they looked at it, whether or not they added anything.
     *
     * Separate from the answers because "reviewed and had nothing to add" and
     * "never asked" are different states, and only the second is worth
     * prompting about again. Without this the confirmation card has no way to
     * stop asking, which is how a feature becomes a feed of twenty identical
     * cards about walks.
     */
    reviewedAt: timestamp("reviewed_at"),

    syncedAt: timestamp("synced_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_health_workouts").on(t.userId, t.externalId),
    index("idx_health_workouts_user_date").on(t.userId, t.onDate),
  ]
);

export type HealthWorkout = typeof healthWorkouts.$inferSelect;

export const healthWorkoutSchema = z.object({
  externalId: z.string().min(1).max(200),
  workoutType: z.string().max(80).optional().nullable(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }).optional().nullable(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "onDate must be YYYY-MM-DD."),
  durationSeconds: z.number().int().min(0).max(86_400 * 2).optional().nullable(),
  activeCalories: z.number().min(0).max(30_000).optional().nullable(),
  distanceMeters: z.number().min(0).max(1_000_000).optional().nullable(),
  avgHeartRate: z.number().min(20).max(250).optional().nullable(),
  maxHeartRate: z.number().min(20).max(260).optional().nullable(),
  sourceApp: z.string().max(120).optional().nullable(),
});
export type HealthWorkoutInput = z.infer<typeof healthWorkoutSchema>;

/**
 * What a member is allowed to say about one of their sessions.
 *
 * Both fields are `.nullable()` and optional, and the two states mean different
 * things: absent leaves the value alone, explicit null clears it. Without that
 * distinction there is no way to take an answer back — "restored" would be
 * writable and permanent, which is a poor property for a question about how
 * something felt.
 *
 * Nothing else about a workout is accepted here. Duration and distance belong
 * to the platform, and an endpoint that let them be edited would quietly turn
 * imported measurements into self-reported ones.
 */
/**
 * What a member may say they trained.
 *
 * Deliberately short. A watch cannot know this and Sakred must not guess it,
 * but that is not a reason to build a bodybuilding taxonomy — `other` plus a
 * free label carries Olympic lifting, climbing, kettlebells or an athletic
 * circuit without prematurely turning each into an enum nobody asked for.
 */
export const WORKOUT_FOCUSES = [
  "chest", "back", "legs", "shoulders", "arms", "core",
  "full_body", "conditioning", "other",
] as const;
export type WorkoutFocus = (typeof WORKOUT_FOCUSES)[number];

export const workoutFeedbackSchema = z
  .object({
    response: z.enum(WORKOUT_RESPONSES).nullable().optional(),
    placement: z.enum(WORKOUT_PLACEMENTS).nullable().optional(),
    focus: z.enum(WORKOUT_FOCUSES).nullable().optional(),
    /** Their own words. Trimmed, bounded, never generated. */
    label: z.string().trim().max(60).nullable().optional(),
    /**
     * Looked at, whether or not anything was added.
     *
     * Its own field because Confirm is a complete action: a member who reads
     * the card and has nothing to add has still answered, and must not be asked
     * again. Sending only this is the Confirm button.
     */
    reviewed: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.response !== undefined ||
      v.placement !== undefined ||
      v.focus !== undefined ||
      v.label !== undefined ||
      v.reviewed !== undefined,
    { message: "Nothing to change." },
  );
export type WorkoutFeedbackInput = z.infer<typeof workoutFeedbackSchema>;

// ─── 5. THE SYNC ENVELOPE ──────────────────────────────────────────────────

/**
 * What the phone posts. Capped at a size that survives a slow connection:
 * a first sync of 90 days x 20 metrics is 1,800 samples, so the client pages
 * rather than sending one enormous body a mobile network will drop halfway.
 */
export const healthSyncSchema = z.object({
  platform: healthPlatformEnum,
  samples: z.array(healthSampleSchema).max(3_000).default([]),
  workouts: z.array(healthWorkoutSchema).max(500).default([]),
  /** Metrics the member granted, so we can show what is and isn't flowing. */
  grantedMetrics: z.array(healthMetricEnum).optional(),
  /** How far the client read. Becomes the next watermark on success. */
  syncedThrough: z.string().datetime({ offset: true }).optional(),
  deviceModel: z.string().max(120).optional().nullable(),
  osVersion: z.string().max(60).optional().nullable(),
});
export type HealthSyncInput = z.infer<typeof healthSyncSchema>;

/**
 * Has this member already answered a card today?
 *
 * ── Why this is a function and not two lines in the route ─────────────────
 *
 * Because it was two lines in the route, and it was wrong for eight months in
 * a way nothing could see. It compared `reviewedAt.toISOString().slice(0, 10)`
 * — a UTC calendar date — against the member's local one. In Toronto those
 * agree for twenty hours a day and disagree for four, and the four are the
 * evening: precisely when somebody sits down and reviews the session they just
 * finished.
 *
 * What that produced was not an error. The write succeeded, the card refreshed,
 * and the *next* unreviewed import silently took its place — so the member saw
 * a card that appeared to have ignored them, pressed Save a second time, and
 * gave a session they had never described the previous session's name. Two rows
 * on 15 Aug 2026, six seconds apart, identically labelled.
 *
 * An instant is not a day. Turning one into the other requires knowing where
 * the member is standing, and this is the only place that conversion is
 * allowed to happen.
 */
export function answeredToday<T extends { reviewedAt: Date | null }>(
  recent: readonly T[],
  timeZone: string | null | undefined,
  today: string,
): boolean {
  return recent.some((w) => w.reviewedAt != null && todayInZone(timeZone, w.reviewedAt) === today);
}


/**
 * Is this an import where the member knows something the sensor does not?
 *
 * ── Restraint is the whole feature ────────────────────────────────────────
 *
 * A watch reports dozens of passive walks a week. Asking about each of them
 * turns a good idea into a chore queue, and the member learns to dismiss the
 * card without reading it — at which point the one prompt that mattered gets
 * dismissed too.
 *
 * So the test is not "could a member add something", which is true of
 * everything. It is "does the source classification leave out something that
 * changes what Sakred can say tomorrow". For a generic strength import that is
 * the whole muscle-group question: Sakred cannot infer legs from a watch, and
 * with the answer it can honestly say chest has had more room than back.
 *
 * A run is already understood. Easy-versus-intervals might refine a
 * recommendation one day, and when it does this list is where that decision
 * gets made — deliberately, rather than by an eager default.
 */
const ASKS_FOR_DETAIL: ReadonlySet<string> = new Set([
  "strength",
  "strengthtraining",
  "traditionalstrengthtraining",
  "functionalstrengthtraining",
  "crosstraining",
  "hiit",
  "highintensityintervaltraining",
  "mixedcardio",
  "mixedmetaboliccardiotraining",
  "other",
]);

/** Understood well enough already. Never prompted about. */
const UNDERSTOOD: ReadonlySet<string> = new Set([
  "walking", "running", "cycling", "biking", "swimming", "hiking",
  "yoga", "pilates", "mobility", "stretching", "meditation", "breathwork",
  "rowing", "elliptical", "stairs", "dance",
]);

export function needsConfirmation(workoutType: string | null | undefined): boolean {
  const t = (workoutType ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (!t) return true; // Unknown type — the ambiguous case worth asking about.
  if (UNDERSTOOD.has(t)) return false;
  if (ASKS_FOR_DETAIL.has(t)) return true;
  // Anything the mapper cannot place is ambiguous by definition, and ambiguity
  // is exactly where a member's answer is worth having.
  return true;
}

/**
 * The one order every sync must write in.
 *
 * ── The deadlock this removes ─────────────────────────────────────────────
 *
 * Postgres locks index tuples in the order a statement inserts them. Two
 * concurrent syncs from the same member — a foreground refresh and a
 * background delivery, which is the normal case on a phone — carry overlapping
 * (date, metric) rows in whatever order the platform handed them over. If one
 * batch reaches row B before row A and the other reaches A before B, each ends
 * up waiting on a lock the other holds, and Postgres kills one of them:
 *
 *     deadlock detected
 *     while inserting index tuple in relation "health_days"
 *
 * It happened nineteen times across six members in a fortnight. The member
 * sees a sync that silently did nothing.
 *
 * Sorting is the whole fix, and it is a fix rather than a mitigation: a
 * deadlock requires two transactions to acquire the same locks in opposite
 * orders, so making the order a function of the data alone makes the
 * precondition unreachable. A retry loop would have hidden the same collision
 * and paid for it in latency every time.
 *
 * The key is the conflict target — (onDate, metric) within one member — so
 * this orders precisely the thing that contends.
 */
export function orderedForWrite<T extends { onDate: string; metric: string }>(
  samples: readonly T[],
): T[] {
  return [...samples].sort((a, b) =>
    a.onDate < b.onDate ? -1
    : a.onDate > b.onDate ? 1
    : a.metric < b.metric ? -1
    : a.metric > b.metric ? 1
    : 0,
  );
}
