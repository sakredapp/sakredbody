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
  /**
   * Legacy staff bit — a boolean stored as the string "true"/"false".
   *
   * Kept because `public.is_sakred_admin()` reads it and every RLS policy in
   * the schema calls that function. `role` below is what new code asks. The
   * app writes both and trusts whichever is higher; see
   * shared/models/access.ts.
   */
  isAdmin: varchar("is_admin").default("false"),
  /** 'member' | 'coach' | 'moderator' | 'admin' | 'owner' — see access.ts. */
  role: varchar("role").notNull().default("member"),
  /**
   * 'male' | 'female', or null when the member has not answered.
   *
   * Here rather than in user_cosmology because it is physiology, not birth
   * data: several readings mean different things by it, resting heart rate and
   * HRV baselines most of all, and reading those without it means comparing a
   * member to a population that may not include them.
   *
   * Nullable with no default, and that is the whole point. Everyone who signed
   * up before this column existed genuinely has not answered, and defaulting
   * them to either value would be inventing a fact about a person — the same
   * rule health_days follows for a day nobody wore a watch. Code that reads
   * this must handle null rather than assume.
   */
  sex: varchar("sex"),
  /**
   * 'single' | 'dating' | 'married' | 'private', or null when unanswered.
   *
   * Asked because the useful lifestyle guidance differs: what helps somebody
   * living alone is not what helps somebody whose week has another person in
   * it. `private` is a real answer and not a synonym for null — it means the
   * member was asked and declined, so nothing should ask again.
   */
  relationshipStatus: varchar("relationship_status"),
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

/**
 * Password reset tokens.
 *
 * Until this existed there was no recovery path at all: no route, no email, no
 * column. A member who forgot their password was locked out permanently and
 * the only fix was someone editing a hash in the database by hand. For a paid
 * membership that is not a missing feature, it is a way to lose an account.
 *
 * ── Only the hash is stored ───────────────────────────────────────────────
 *
 * Same reasoning as authTokens: the raw token is 256 bits from a CSPRNG, so it
 * has no structure to guess and needs no slow KDF — SHA-256 is the right cost.
 * Storing the raw value would mean anyone who could read this table could take
 * over any account that had ever asked for a reset, which is strictly worse
 * than the password table it protects.
 *
 * ── Single use, and short ─────────────────────────────────────────────────
 *
 * `usedAt` rather than deletion, so a second click on the same link can say
 * "already used" instead of the indistinguishable "invalid link" — the
 * difference between a member trying again and a member giving up. Rows are
 * swept later; see supabase/password-reset.sql.
 *
 * An hour is the window. Reset links sit in inboxes forever, and inboxes are
 * the thing most likely to be compromised in the first place.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    tokenHash: varchar("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Null until redeemed. Set, never deleted, so reuse is distinguishable. */
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [index("IDX_password_reset_user").on(table.userId)]
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

/** How long a reset link stays good. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * How many resets may be asked for before we stop sending.
 *
 * Looser than the login limits because the cost of tripping it is different:
 * a locked login is a member who cannot get in, while a throttled reset is a
 * member who has already been sent a link and is clicking again. The limit
 * exists to stop this endpoint being used to mail-bomb someone, not to stop
 * guessing — there is nothing here to guess.
 */
export const RESET_THROTTLE = {
  emailMax: 5,
  ipMax: 15,
  windowMs: 60 * 60 * 1000,
  lockMs: 60 * 60 * 1000,
} as const;
