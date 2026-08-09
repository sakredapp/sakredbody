/**
 * Offerings — everything with a date on it that someone can join.
 *
 * A retreat in Costa Rica, a twelve-week mastermind, a Tuesday webinar, a
 * one-hour talk from a TCM doctor on where energy actually goes. Those look
 * like different products and they are not: each is **a thing that happens at
 * a time, led by someone, that a member joins**. Modelling them separately
 * would mean four discovery surfaces, four rosters and four calendars that
 * disagree.
 *
 * This started as `cohorts` — masterminds only. The shape turned out to be the
 * general one, so it was widened rather than copied. See supabase/offerings.sql.
 *
 *   offerings              — the thing on offer, and how to get in
 *   offering_sessions      — when it actually meets; one row per gathering
 *   offering_registrations — the roster, and where each person is in joining
 *   session_attendance     — who was in the room
 *   hosts                  — coaches, practitioners, guests
 *   offering_hosts         — who leads an offering
 *   session_hosts          — who leads one session of it (the guest speaker)
 *
 * ── Two levels, on purpose ────────────────────────────────────────────────
 *
 * An offering has sessions. A single talk is an offering with one session; a
 * mastermind is an offering with twelve. That means one calendar query answers
 * "what is on this month" across every kind, and a guest speaker can be
 * attached to the one session they're actually in.
 *
 * ── What this is NOT ──────────────────────────────────────────────────────
 *
 * `retreats` + `booking_requests` stay where they are. That is the bespoke
 * concierge flow — *design your own retreat, we call you*. This is the
 * scheduled catalogue — *this is happening on the 14th, come*. A business
 * wants both, and they are genuinely different transactions.
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

// ─── 1. HOSTS ──────────────────────────────────────────────────────────────

/**
 * Whoever stands at the front.
 *
 * Deliberately not a `users` row. Most people who give a talk here will never
 * hold a member account, and requiring one to put a TCM doctor on the calendar
 * would mean creating fake logins. `userId` is the optional bridge for hosts
 * who *are* members, so a coach can see their own roster.
 */
export const hosts = pgTable(
  "hosts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    /** "Doctor of Chinese Medicine", "Breathwork facilitator". Shown under the name. */
    title: text("title"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    /** Free-form lines — "L.Ac.", "20 years in practice". Not validated. */
    credentials: text("credentials").array(),
    website: text("website"),
    instagram: text("instagram"),

    /** Set when this host also holds a member account. */
    userId: varchar("user_id"),

    /**
     * internal — us
     * coach    — contracted, runs their own offerings
     * partner  — an outside practitioner we platform
     */
    kind: text("kind").notNull().default("internal"),

    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_hosts_user").on(t.userId), index("idx_hosts_active").on(t.isActive)]
);

export const hostKindEnum = z.enum(["internal", "coach", "partner"]);
export type HostKind = z.infer<typeof hostKindEnum>;

export const insertHostSchema = createInsertSchema(hosts, { kind: hostKindEnum }).omit({
  id: true,
  createdAt: true,
});

export type Host = typeof hosts.$inferSelect;
export type InsertHost = z.infer<typeof insertHostSchema>;

// ─── 2. OFFERINGS ──────────────────────────────────────────────────────────

export const offerings = pgTable(
  "offerings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),

    /**
     * What kind of thing this is. Drives how it's presented, never who can
     * see it — that's `minTierRank` — and never how you join it, which is
     * `registrationMode`. Keeping those three independent is what stops this
     * becoming four hardcoded product types again.
     */
    kind: text("kind").notNull().default("mastermind"),

    /** One line, for the card. The description is for the page. */
    summary: text("summary"),
    description: text("description"),
    coverUrl: text("cover_url"),

    startDate: date("start_date"),
    endDate: date("end_date"),

    format: text("format").notNull().default("hybrid"),

    /** Where, if it's in the world. "Rincón, on the west coast". */
    location: text("location"),

    /**
     * The offering's own timezone, IANA. An in-person retreat happens in local
     * time wherever it is; an online talk is announced in one zone and read in
     * many. Session times are stored absolute (timestamptz) — this is only for
     * *displaying* the canonical hour, so "7pm ET" stays 7pm ET on the page
     * even for someone reading it in Lisbon.
     */
    timezone: text("timezone").notNull().default("America/New_York"),

    /**
     * How members get in.
     *   open        — register and you're in, up to capacity
     *   application — you apply, someone decides
     *   invite      — only an admin can add you
     */
    registrationMode: text("registration_mode").notNull().default("application"),

    /** Null means unlimited — correct for a webinar, wrong for a mastermind. */
    capacity: integer("capacity"),

    priceCents: integer("price_cents"),
    priceNote: text("price_note"),

    /** Minimum membership rank to see this at all. 0 = everyone. */
    minTierRank: integer("min_tier_rank").notNull().default(0),

    /**
     * Where the online room is. Never sent to a member who isn't confirmed —
     * a Zoom link in a public payload is an open door.
     */
    meetingUrl: text("meeting_url"),
    /** Available afterwards, to registrants. */
    replayUrl: text("replay_url"),

    // draft → open → closed → running → complete
    status: text("status").notNull().default("draft"),

    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_offerings_status").on(t.status),
    index("idx_offerings_kind").on(t.kind),
    index("idx_offerings_start").on(t.startDate),
    index("idx_offerings_tier").on(t.minTierRank),
  ]
);

export const offeringKindEnum = z.enum([
  "retreat",
  "mastermind",
  "circle",
  "webinar",
  "talk",
  "workshop",
  "intensive",
]);
export const offeringFormatEnum = z.enum(["in_person", "virtual", "hybrid"]);
export const offeringStatusEnum = z.enum(["draft", "open", "closed", "running", "complete"]);
export const registrationModeEnum = z.enum(["open", "application", "invite"]);

export type OfferingKind = z.infer<typeof offeringKindEnum>;
export type OfferingFormat = z.infer<typeof offeringFormatEnum>;
export type OfferingStatus = z.infer<typeof offeringStatusEnum>;
export type RegistrationMode = z.infer<typeof registrationModeEnum>;

/** Labels live with the enum so a new kind is one edit, not a hunt. */
export const OFFERING_KIND_LABELS: Record<OfferingKind, string> = {
  retreat: "Retreat",
  mastermind: "Mastermind",
  circle: "Circle",
  webinar: "Webinar",
  talk: "Talk",
  workshop: "Workshop",
  intensive: "Intensive",
};

export const OFFERING_FORMAT_LABELS: Record<OfferingFormat, string> = {
  in_person: "In person",
  virtual: "Online",
  hybrid: "In person + online",
};

export const insertOfferingSchema = createInsertSchema(offerings, {
  kind: offeringKindEnum,
  format: offeringFormatEnum,
  status: offeringStatusEnum,
  registrationMode: registrationModeEnum,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type Offering = typeof offerings.$inferSelect;
export type InsertOffering = z.infer<typeof insertOfferingSchema>;

// ─── 3. OFFERING HOSTS ─────────────────────────────────────────────────────

export const offeringHosts = pgTable(
  "offering_hosts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    /** lead | co_host | guest */
    role: text("role").notNull().default("lead"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("idx_offering_hosts_offering").on(t.offeringId),
    index("idx_offering_hosts_host").on(t.hostId),
    uniqueIndex("uq_offering_hosts").on(t.offeringId, t.hostId),
  ]
);

export const hostRoleEnum = z.enum(["lead", "co_host", "guest"]);
export type HostRole = z.infer<typeof hostRoleEnum>;
export type OfferingHost = typeof offeringHosts.$inferSelect;

// ─── 4. SESSIONS ───────────────────────────────────────────────────────────

/**
 * One gathering. A single talk has exactly one of these.
 */
export const offeringSessions = pgTable(
  "offering_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    agenda: text("agenda"),

    /**
     * Absolute, always. `timestamptz` rather than `timestamp` because this was
     * the bug: a naive timestamp says "7pm" without saying whose 7pm, and the
     * moment one attendee is in another timezone it is wrong for somebody.
     * The offering's `timezone` says how to *render* it canonically.
     */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),

    /** A physical room. For the online link, see `meetingUrl`. */
    location: text("location"),
    /** Overrides the offering's link for this session only. Gated like it. */
    meetingUrl: text("meeting_url"),
    replayUrl: text("replay_url"),

    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_offering_sessions_offering").on(t.offeringId),
    index("idx_offering_sessions_starts").on(t.startsAt),
  ]
);

export const insertOfferingSessionSchema = createInsertSchema(offeringSessions).omit({
  id: true,
  createdAt: true,
});

export type OfferingSession = typeof offeringSessions.$inferSelect;
export type InsertOfferingSession = z.infer<typeof insertOfferingSessionSchema>;

/** A guest who leads one session rather than the whole offering. */
export const sessionHosts = pgTable(
  "session_hosts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => offeringSessions.id, { onDelete: "cascade" }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("idx_session_hosts_session").on(t.sessionId),
    uniqueIndex("uq_session_hosts").on(t.sessionId, t.hostId),
  ]
);

export type SessionHost = typeof sessionHosts.$inferSelect;

// ─── 5. REGISTRATIONS ──────────────────────────────────────────────────────

/**
 * One row per person per offering, from the moment they express interest.
 *
 * `status` carries the whole join, so withdrawing is a state change rather
 * than a delete — whoever is running the room needs to know someone left, and
 * when.
 */
export const offeringRegistrations = pgTable(
  "offering_registrations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),

    /**
     * applied   — waiting on a decision (application mode)
     * invited   — offered a place, hasn't taken it
     * confirmed — in the room. The only status that unlocks the meeting link.
     * waitlist  — capacity was full
     * declined  — we said no
     * withdrawn — they left
     */
    status: text("status").notNull().default("applied"),

    /** What they wrote when applying. One paragraph, not an intake form. */
    note: text("note"),
    /** The host's, never shown to the member. */
    reviewNote: text("review_note"),

    appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_offering_registrations_offering").on(t.offeringId),
    index("idx_offering_registrations_user").on(t.userId),
    uniqueIndex("uq_offering_registrations").on(t.offeringId, t.userId),
  ]
);

export const registrationStatusEnum = z.enum([
  "applied",
  "invited",
  "confirmed",
  "waitlist",
  "declined",
  "withdrawn",
]);
export type RegistrationStatus = z.infer<typeof registrationStatusEnum>;
export type OfferingRegistration = typeof offeringRegistrations.$inferSelect;

/** The statuses that mean "this person is in the room". */
export const ATTENDING_STATUSES: RegistrationStatus[] = ["confirmed"];

// ─── 6. ATTENDANCE ─────────────────────────────────────────────────────────

export const sessionAttendance = pgTable(
  "session_attendance",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => offeringSessions.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    present: boolean("present").notNull().default(true),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_session_attendance_session").on(t.sessionId),
    uniqueIndex("uq_session_attendance").on(t.sessionId, t.userId),
  ]
);

export type SessionAttendance = typeof sessionAttendance.$inferSelect;

// ─── 7. Member-facing input ────────────────────────────────────────────────

export const registerSchema = z.object({
  offeringId: z.string().uuid(),
  /** Required by application-mode offerings, ignored by open ones. */
  note: z.string().max(2000).optional(),
});

export const decideRegistrationSchema = z.object({
  status: registrationStatusEnum,
  reviewNote: z.string().max(2000).nullable().optional(),
});
