/**
 * Who someone is, and what that lets them do.
 *
 * There are two independent axes here and conflating them is how access
 * models rot:
 *
 *   TIER is what someone bought. free → member → inner → executive, already
 *   modelled in community.ts as `TIER_RANKS` and already used for real
 *   (`channels.minTierRank`). Money moves you up it.
 *
 *   ROLE is what someone does for the business. member → coach → moderator →
 *   admin → owner. No amount of money moves you up it.
 *
 * A tier can never grant a role and a role should not be faked with a tier.
 * An executive member is not staff; a coach on the free tier is.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Role was `users.isAdmin`, a varchar holding the string "true" or "false" —
 * a boolean wearing a costume, with exactly two states. Every back-office
 * capability, from reading the support inbox to deleting a retreat, sat
 * behind that one bit. There was no way to say "this person can answer
 * support but cannot delete a retreat", and no way to add a coach who sees
 * their cohort's roster and nothing else.
 *
 * That is fine right up until the moment there is a second kind of staff, or
 * cohorts with levels — at which point every check has to be found and
 * rewritten at once, in an app that is already in store review.
 *
 * So: ordered ranks, spaced by ten so a level can be slotted between two
 * without renumbering the ones either side, and one `can()` to ask against.
 * `isAdmin` is still written and still read — the RLS policies in Supabase
 * call `public.is_sakred_admin()`, which reads it — so nothing breaks while
 * the two coexist. This is the model everything new should be built against.
 */

/**
 * Staff ladder. Higher includes everything lower.
 *
 * Spaced by 10 deliberately: `coach_lead` at 15 or `support` at 25 can be
 * added later without touching a single existing comparison.
 */
export const ROLE_RANKS = {
  /** Everybody. Not staff — the floor, so `roleRank` always has an answer. */
  member: 0,
  /** Sees their own cohorts and the people in them. */
  coach: 10,
  /** Community reports and the support inbox. */
  moderator: 20,
  /** The back office. What `isAdmin: "true"` used to mean, exactly. */
  admin: 30,
  /** Can make other people admins. */
  owner: 40,
} as const;

export type Role = keyof typeof ROLE_RANKS;

export const ROLES = Object.keys(ROLE_RANKS) as Role[];

/** Unknown strings floor to `member` rather than throwing — a bad row in the
 *  database should cost someone their admin menu, never the whole app. */
export function roleRank(role: string | null | undefined): number {
  return ROLE_RANKS[(role ?? "member") as Role] ?? 0;
}

export function atLeast(role: string | null | undefined, min: Role): boolean {
  return roleRank(role) >= ROLE_RANKS[min];
}

/**
 * The capabilities the UI and the server both ask about.
 *
 * Named for the job rather than the screen: `answerSupport`, not `supportTab`.
 * When the tab moves — and tabs move — the capability doesn't have to.
 */
export const CAPABILITIES = {
  /** See any back-office surface at all. */
  viewBackOffice: "moderator",
  /** Community reports, blocks, takedowns. */
  moderate: "moderator",
  /** The support inbox. */
  answerSupport: "moderator",
  /** Intake applications, executive applications. */
  reviewApplications: "moderator",
  /** Cohort rosters and schedules. */
  manageCohorts: "coach",
  /** Members, tiers, partners, bookings. */
  manageMembers: "admin",
  /** Retreats, offerings, library, apothecary — anything the site publishes. */
  manageContent: "admin",
  /** Make someone else staff. */
  grantRoles: "owner",
} as const satisfies Record<string, Role>;

export type Capability = keyof typeof CAPABILITIES;

/**
 * The one question everything asks.
 *
 * `can(user.role, "answerSupport")` reads as the sentence it is, and moving a
 * capability up or down the ladder is a one-line change here rather than a
 * search across the codebase.
 */
export function can(role: string | null | undefined, capability: Capability): boolean {
  return atLeast(role, CAPABILITIES[capability]);
}

/**
 * Bridge for the rows that predate the `role` column.
 *
 * `isAdmin` is a varchar of "true"/"false". A row written before the
 * migration has no role, and a row written by old code may have isAdmin set
 * and role not. Trusting whichever is higher means a person never
 * *loses* access to a half-applied migration — the failure mode that would
 * lock the owner out of their own back office.
 */
export function effectiveRole(user: {
  role?: string | null;
  isAdmin?: string | null;
}): Role {
  const fromRole = roleRank(user.role);
  const fromLegacy = user.isAdmin === "true" ? ROLE_RANKS.admin : ROLE_RANKS.member;
  const rank = Math.max(fromRole, fromLegacy);
  // Highest named role at or below the rank.
  return (ROLES.filter((r) => ROLE_RANKS[r] <= rank).pop() ?? "member") as Role;
}
