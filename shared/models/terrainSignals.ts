/**
 * The seven things a person knows about themselves that no device does.
 *
 * A watch can say how long you slept. It cannot say whether you woke up
 * wanting the day. HRV is a number about the nervous system; "wired and tired"
 * is the experience of one, and they disagree often enough that treating
 * either as the truth loses information.
 *
 * ── Why this is a table and not seven columns on the profile ──────────────
 *
 * Seven mutable columns on `users` would hold today's answer and destroy
 * yesterday's. The entire value of asking is the trend: one low-energy day is
 * a Tuesday, five in a row is something a coach should see. So every check-in
 * is a row, keyed to the member's own local date.
 *
 * ── Why one wide row and not one row per signal ───────────────────────────
 *
 * `health_days` is long and narrow because its vocabulary belongs to Apple and
 * Google and keeps growing — a new metric there has to be a string, not a
 * migration. This vocabulary is ours. Seven signals, chosen deliberately,
 * changing about as often as the product's idea of a body does. A wide row is
 * one insert, one read, and a check constraint per column; the long form would
 * buy flexibility we'd never spend and make "show me the last 30 days" a pivot.
 *
 * ── No composite ─────────────────────────────────────────────────────────
 *
 * There is no overall score and there will not be one. A number invented out
 * of other numbers is a character sheet, and this is a practice. Seven values,
 * shown as seven values, and a reading that says which way they lean.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  smallint,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";

export const TERRAIN_SIGNALS = [
  {
    id: "energy",
    label: "Energy",
    question: "How much did you have today?",
    low: "Running on empty",
    high: "Plenty",
  },
  {
    id: "recovery",
    label: "Recovery",
    question: "How recovered do you feel from yesterday?",
    low: "Still wrecked",
    high: "Fully back",
  },
  {
    id: "nervousSystem",
    label: "Nervous system",
    question: "Wired, or settled?",
    low: "Wired",
    high: "Settled",
  },
  {
    id: "digestion",
    label: "Digestion",
    question: "How did things sit today?",
    low: "Struggling",
    high: "Easy",
  },
  {
    id: "bodyTension",
    label: "Body",
    question: "Tight, or moving freely?",
    low: "Locked up",
    high: "Fluid",
  },
  {
    id: "mentalClarity",
    label: "Clarity",
    question: "How clear was your head?",
    low: "Fogged",
    high: "Sharp",
  },
  {
    id: "drive",
    label: "Drive",
    question: "How much did you want to go after things?",
    low: "None",
    high: "Charged",
  },
] as const;

export type TerrainSignalId = (typeof TERRAIN_SIGNALS)[number]["id"];

export const terrainCheckins = pgTable(
  "terrain_checkins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    /** The member's own local date. One check-in a day; answering again edits it. */
    onDate: date("on_date").notNull(),

    energy: smallint("energy"),
    recovery: smallint("recovery"),
    nervousSystem: smallint("nervous_system"),
    digestion: smallint("digestion"),
    bodyTension: smallint("body_tension"),
    mentalClarity: smallint("mental_clarity"),
    drive: smallint("drive"),

    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_terrain_checkin").on(t.userId, t.onDate),
    index("idx_terrain_checkin_user").on(t.userId, t.onDate),
  ],
);

export type TerrainCheckin = typeof terrainCheckins.$inferSelect;

const scale = z.number().int().min(1).max(5).nullable().optional();

/**
 * Every signal optional, deliberately.
 *
 * A check-in that demands all seven is a check-in people stop doing by
 * Thursday. Three honest answers beat seven guessed ones, and a null is a
 * fact — "they didn't say" — where a forced 3 is noise that looks like data.
 */
export const terrainCheckinSchema = z.object({
  onDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  energy: scale,
  recovery: scale,
  nervousSystem: scale,
  digestion: scale,
  bodyTension: scale,
  mentalClarity: scale,
  drive: scale,
  note: z.string().max(1000).nullable().optional(),
});

export type TerrainCheckinInput = z.infer<typeof terrainCheckinSchema>;

/** The column names, so a route can iterate them without restating the list. */
export const SIGNAL_KEYS = TERRAIN_SIGNALS.map((s) => s.id) as readonly TerrainSignalId[];

export type ReportedSignals = Partial<Record<TerrainSignalId, number | null>>;

/**
 * Which way each answered signal pulls: −1, 0 or +1.
 *
 * ── One weighting, not three ──────────────────────────────────────────────
 *
 * Three things now want to know what somebody's check-in said: the readiness
 * engine, the terrain reading, and the sentence that explains the terrain
 * reading. Each of them weighting the seven signals for itself is how a member
 * ends up told they are depleted on one screen and primed on the next, from the
 * same seven numbers — the exact failure that produced one `recentMovement` and
 * one `terrainFor`.
 *
 * So the judgement about what a 2/5 means lives here, once, and everything
 * downstream reads it.
 *
 * ── The rules, and the one that is inverted ───────────────────────────────
 *
 * Most signals run the same way: low is depleted, high is capable. Body tension
 * is the exception — a high number means *more* tension, so it is the one place
 * where up is worse. Getting that backwards would have made the tightest days
 * read as the most capable.
 *
 * Digestion is collected and does not pull. It is worth knowing, worth showing
 * a coach and worth a trend, but this product has no defensible rule turning it
 * into capacity — and inventing one to fill the gap would be pseudo-precision.
 * It still counts toward "did they answer enough to have said anything".
 */
const PULL_RULE: Record<TerrainSignalId, "up-is-capacity" | "up-is-cost" | "no-pull"> = {
  energy: "up-is-capacity",
  recovery: "up-is-capacity",
  nervousSystem: "up-is-capacity",
  drive: "up-is-capacity",
  mentalClarity: "up-is-capacity",
  bodyTension: "up-is-cost",
  digestion: "no-pull",
};

/** How many signals can actually move the lean. The divisor below. */
const PULLING_SIGNALS = SIGNAL_KEYS.filter((k) => PULL_RULE[k] !== "no-pull").length;

export function signalPulls(c: ReportedSignals): { id: TerrainSignalId; pull: -1 | 0 | 1 }[] {
  const out: { id: TerrainSignalId; pull: -1 | 0 | 1 }[] = [];
  for (const id of SIGNAL_KEYS) {
    const v = c[id];
    if (typeof v !== "number") continue;
    const rule = PULL_RULE[id];
    let pull: -1 | 0 | 1 = 0;
    if (rule !== "no-pull" && (v <= 2 || v >= 4)) {
      const depleted = v <= 2;
      pull = rule === "up-is-cost" ? (depleted ? 1 : -1) : depleted ? -1 : 1;
    }
    out.push({ id, pull });
  }
  return out;
}

/**
 * The check-in as a bounded −3…+3, or null when they haven't said enough.
 *
 * Magnitude as well as direction, because "a bit flat" and "wrung out" should
 * not move a day by the same amount. Two answers is a mood, not a reading —
 * below three the engines are better off knowing nothing than knowing one
 * number, and a defaulted middle would be noise that looks like data.
 */
export function terrainLeanFrom(c: ReportedSignals | null): number | null {
  if (!c) return null;
  const pulls = signalPulls(c);
  if (pulls.length < 3) return null;

  const sum = pulls.reduce((n, p) => n + p.pull, 0);
  // Scaled back into the documented range. Six contributing signals could
  // otherwise hand a caller a ±6 and quietly outweigh everything else.
  const scaled = Math.round((sum / PULLING_SIGNALS) * 3);
  return Math.max(-3, Math.min(3, scaled));
}

/**
 * The same answer as a word, in the vocabulary the terrain reading uses.
 *
 * Derived from `terrainLeanFrom` rather than computed again — a second
 * weighting of the same seven numbers is a second opinion waiting to disagree
 * with the first.
 */
export function signalLean(c: ReportedSignals): "restore" | "build" | "either" | "unknown" {
  const lean = terrainLeanFrom(c);
  if (lean === null) return "unknown";
  return lean < 0 ? "restore" : lean > 0 ? "build" : "either";
}
