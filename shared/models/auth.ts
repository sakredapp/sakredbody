import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table for express-session with connect-pg-simple.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: varchar("is_admin").default("false"),
  // IANA zone, e.g. "America/Los_Angeles". The server has no other way to know
  // when this member's day starts, and every habit is scheduled by calendar
  // date — get this wrong and completions land on the wrong day.
  timezone: varchar("timezone").default("UTC"),
  /**
   * Display unit for every weight in Build. Nothing stored changes when this
   * flips — the database is kilograms throughout — which is exactly why
   * switching is a preference rather than a migration.
   */
  weightUnit: varchar("weight_unit").notNull().default("lb"),
  // Coaching profile fields
  activeRoutineId: varchar("active_routine_id"), // FK → wellness_routines.id
  routineIntensity: varchar("routine_intensity").default("lite"), // 'lite' | 'intense'
  sakredCoins: integer("sakred_coins").default(0),
  currentStreak: integer("current_streak").default(0),
  longestStreak: integer("longest_streak").default(0),
  membershipTier: varchar("membership_tier").default("free"), // 'free' | 'premium'
  /**
   * When this account was confirmed to belong to an adult.
   *
   * The App Store questionnaire ties Social Media, User-Generated Content and
   * Age Assurance together — the community channels make the first two true,
   * so the third has to be true as well.
   *
   * Only the result is kept, never the date of birth. Storing the date would
   * add a category of personal data to every privacy disclosure on both
   * stores in exchange for something we would never query; the timestamp
   * answers the only question that matters. Members who want numerology enter
   * their birth date separately, into user_cosmology, which stays opt-in the
   * way it was designed to be.
   *
   * Null means "joined before the gate existed", not "failed it" — never
   * treat it as a reason to deny access.
   */
  ageVerifiedAt: timestamp("age_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

/**
 * Bearer tokens for the iOS and Android shells.
 *
 * The session cookie cannot reach them. Capacitor serves the bundled client
 * from `https://localhost` / `capacitor://localhost`, so every /api call is
 * cross-site: `sameSite: "lax"` withholds the cookie by definition, and on
 * iOS WebKit's tracking prevention discards it even when the attribute is
 * relaxed. Native auth therefore travels in an Authorization header instead.
 *
 * Only the hash is stored. The token is 256 bits from a CSPRNG, so unlike a
 * password it has no guessable structure and needs no slow KDF — SHA-256 is
 * the right cost here, and a fast lookup is what lets this sit on every
 * authenticated request.
 *
 * Rows are per device, not per user: revoking a lost phone must not sign the
 * member out everywhere else.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    tokenHash: varchar("token_hash").notNull().unique(),
    platform: varchar("platform"), // 'ios' | 'android'
    createdAt: timestamp("created_at").defaultNow(),
    lastUsedAt: timestamp("last_used_at").defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("IDX_auth_tokens_user").on(table.userId)]
);

/**
 * FCM registration tokens, one row per device.
 *
 * Keyed on the token rather than the user because a member can hold several
 * devices, and because FCM reissues tokens (reinstall, restore from backup,
 * periodic refresh). A stale token does not error on send — it silently fails
 * to deliver — so the client re-registers on every rotation and the unique
 * constraint collapses the duplicate.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    token: varchar("token").notNull().unique(),
    platform: varchar("platform").notNull(), // 'ios' | 'android' | 'web'
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("IDX_push_tokens_user").on(table.userId)]
);

export type AuthToken = typeof authTokens.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
