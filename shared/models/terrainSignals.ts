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

/**
 * Which way the subjective picture leans, in the same vocabulary the terrain
 * reading already uses — and only when there is enough to say.
 *
 * Deliberately blunt: recovery, nervous system and energy pull toward restore
 * when they are low; drive and clarity pull toward build when they are high.
 * Nothing is averaged into a score, and "not enough yet to tell" is a real
 * answer rather than a defaulted middle.
 */
export function signalLean(
  c: Partial<Record<TerrainSignalId, number | null>>,
): "restore" | "build" | "either" | "unknown" {
  const answered = SIGNAL_KEYS.filter((k) => typeof c[k] === "number");
  if (answered.length < 3) return "unknown";

  const low = (k: TerrainSignalId) => typeof c[k] === "number" && (c[k] as number) <= 2;
  const high = (k: TerrainSignalId) => typeof c[k] === "number" && (c[k] as number) >= 4;

  const asking = [low("recovery"), low("energy"), low("nervousSystem"), low("bodyTension")]
    .filter(Boolean).length;
  const room = [high("recovery"), high("energy"), high("drive"), high("mentalClarity")]
    .filter(Boolean).length;

  if (asking >= 2 && room >= 2) return "either";
  if (asking >= 2) return "restore";
  if (room >= 2) return "build";
  return "either";
}
