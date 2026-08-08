/**
 * The Body Map — energy centres
 *
 * This is the layer the macro app cannot have. It reads the body as regions and
 * flows rather than organs and lab values, and it exists here because there is
 * always a coach in the room to explain it. See docs/VISION.md §4.
 *
 *   energy_centres       — the regions themselves (admin-authored)
 *   centre_habits        — which practices move which centre
 *   centre_routines      — which protocols work which centre
 *   user_centre_readings — a member's state over time, coach- or self-recorded
 *   user_cosmology       — birth data, for timing and disposition
 *
 * GUARDRAIL, enforced by convention and by copy: everything here is
 * interpretive. It explains what a member is doing and why it's sequenced that
 * way. It is not a diagnosis, it does not name diseases, and it never replaces
 * care. Content that crosses that line does not belong in these tables.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── 1. ENERGY CENTRES ─────────────────────────────────────────────────────

export const energyCentres = pgTable(
  "energy_centres",
  {
    // Readable slug, like wellness_routines — these are referenced by hand in
    // content and should stay legible in a URL.
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // One word. The site's voice bans explanatory subtitles, and a centre
    // called "Root" followed by "your foundation of safety" is exactly that.
    aspect: text("aspect"),

    bodyRegion: text("body_region"), // "pelvic floor", "diaphragm", "throat"
    element: text("element"), // earth | water | fire | air | ether
    colorHex: text("color_hex"),

    description: text("description"),
    whenBlocked: text("when_blocked"), // what a member notices, never a diagnosis
    whenFlowing: text("when_flowing"),

    // Position on the map, as a percentage down the figure. 0 = crown.
    axisPosition: integer("axis_position").notNull().default(50),

    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_energy_centres_published").on(t.isPublished)]
);

export const elementEnum = z.enum(["earth", "water", "fire", "air", "ether"]);
export type Element = z.infer<typeof elementEnum>;

export const insertEnergyCentreSchema = createInsertSchema(energyCentres).omit({
  createdAt: true,
  updatedAt: true,
});

export type EnergyCentre = typeof energyCentres.$inferSelect;
export type InsertEnergyCentre = z.infer<typeof insertEnergyCentreSchema>;

// ─── 2. CENTRE ↔ HABIT ─────────────────────────────────────────────────────

export const centreHabits = pgTable(
  "centre_habits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    centreId: text("centre_id").notNull(), // FK → energy_centres.id
    habitId: uuid("habit_id").notNull(), // FK → routine_habits.id
    // How the practice acts on the centre. Reads better in the UI than a bare
    // link: "breathwork *opens* the diaphragm" vs "breathwork → diaphragm".
    action: text("action").notNull().default("moves"), // moves | opens | grounds | clears
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_centre_habits_centre").on(t.centreId),
    index("idx_centre_habits_habit").on(t.habitId),
    uniqueIndex("uq_centre_habits").on(t.centreId, t.habitId),
  ]
);

export const centreActionEnum = z.enum(["moves", "opens", "grounds", "clears"]);
export type CentreAction = z.infer<typeof centreActionEnum>;

export type CentreHabit = typeof centreHabits.$inferSelect;

// ─── 3. CENTRE ↔ ROUTINE ───────────────────────────────────────────────────

export const centreRoutines = pgTable(
  "centre_routines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    centreId: text("centre_id").notNull(), // FK → energy_centres.id
    routineId: text("routine_id").notNull(), // FK → wellness_routines.id
    // A protocol usually has one centre it is really about, and others it
    // brushes. The primary flag is what the map highlights.
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("idx_centre_routines_centre").on(t.centreId),
    index("idx_centre_routines_routine").on(t.routineId),
    uniqueIndex("uq_centre_routines").on(t.centreId, t.routineId),
  ]
);

export type CentreRoutine = typeof centreRoutines.$inferSelect;

// ─── 4. READINGS ───────────────────────────────────────────────────────────

/**
 * A member's state at a point in time. Append-only — the history is the value,
 * because what a coach wants to see is movement, not a current snapshot. Never
 * update a reading; record a new one.
 */
export const userCentreReadings = pgTable(
  "user_centre_readings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    centreId: text("centre_id").notNull(),
    state: text("state").notNull(), // blocked | stirring | open
    note: text("note"),
    // Who saw it this way. A coach's reading and a member's own reading of the
    // same centre are both worth keeping, and they often differ.
    recordedBy: text("recorded_by").notNull().default("member"), // member | coach
    recordedAt: timestamp("recorded_at").defaultNow(),
  },
  (t) => [
    index("idx_centre_readings_user").on(t.userId),
    index("idx_centre_readings_user_centre").on(t.userId, t.centreId),
  ]
);

export const centreStateEnum = z.enum(["blocked", "stirring", "open"]);
export type CentreState = z.infer<typeof centreStateEnum>;

export const insertCentreReadingSchema = createInsertSchema(userCentreReadings, {
  state: centreStateEnum,
}).omit({ id: true, recordedAt: true });

export type UserCentreReading = typeof userCentreReadings.$inferSelect;
export type InsertCentreReading = z.infer<typeof insertCentreReadingSchema>;

// ─── 5. COSMOLOGY ──────────────────────────────────────────────────────────

/**
 * Birth data, used for timing and disposition — when to start a protocol, what
 * a member tends to resist. Not prediction, and never shown as fate.
 *
 * One row per member. Everything is optional: a member who doesn't know their
 * birth time still gets a life path number, and one who wants none of it leaves
 * the row absent entirely.
 */
export const userCosmology = pgTable(
  "user_cosmology",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    birthDate: date("birth_date"),
    birthTime: text("birth_time"), // "HH:MM", local to birth place
    birthPlace: text("birth_place"),

    sunSign: text("sun_sign"),
    moonSign: text("moon_sign"),
    risingSign: text("rising_sign"),

    lifePathNumber: integer("life_path_number"),

    // The coach's reading. Long-form, deliberately not structured — this is
    // interpretation, and schema would only flatten it.
    disposition: text("disposition"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [uniqueIndex("uq_user_cosmology").on(t.userId)]
);

export const insertCosmologySchema = createInsertSchema(userCosmology).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserCosmology = typeof userCosmology.$inferSelect;
export type InsertCosmology = z.infer<typeof insertCosmologySchema>;

// ─── Numerology ────────────────────────────────────────────────────────────

/**
 * Life path: sum every digit of the birth date, reduce to one digit, except
 * 11, 22 and 33 which are held as master numbers.
 *
 * Kept in shared/ so the server computes it on save and the client can show it
 * live in a form without a round trip — one implementation, two callers.
 */
export function lifePathNumber(isoDate: string): number | null {
  const digits = isoDate.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  let sum = digits.split("").reduce((acc, d) => acc + Number(d), 0);
  while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
    sum = String(sum)
      .split("")
      .reduce((acc, d) => acc + Number(d), 0);
  }
  return sum;
}
