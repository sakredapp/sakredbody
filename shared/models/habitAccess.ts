/**
 * Who may act on whose habits — the decisions, with nothing else attached.
 *
 * ── Why these are not in server/habits/authz.ts ───────────────────────────
 *
 * They were, and they could not be tested there: that file reaches the
 * database to look up a role, so importing it opens a connection. An
 * authorization rule that can only be exercised against live Postgres is an
 * authorization rule nobody exercises.
 *
 * So the decisions live here — pure, exhaustively tested — and authz.ts keeps
 * the part that actually talks to a database: resolving the actor, and the
 * scoped loaders.
 *
 * ── The security model, stated rather than implied ────────────────────────
 *
 * The app connects to Postgres as `service_role`, which bypasses row-level
 * security by design. RLS is therefore not what protects a member's data —
 * Express is, and these functions are its core. The policies in
 * supabase/habit-phases.sql exist so a leaked anon key still reaches nothing.
 *
 * Writing that down matters. A team that believes RLS is covering them writes
 * routes that trust a body parameter, because "the database will stop it". It
 * will not. It has been told this request is the database's owner.
 */

import { atLeast, type Role } from "./access.js";

export type Actor = {
  userId: string;
  role: Role;
};

/**
 * Reading somebody else's habits.
 *
 * The platform has no coach↔client table: staff at coach level and above work
 * with every member. This encodes exactly that and nothing more, so the day
 * rosters arrive it is one function to change rather than thirty route
 * handlers to find.
 */
export function canCoachAccessMember(actor: Actor, memberId: string): boolean {
  if (actor.userId === memberId) return true;
  return atLeast(actor.role, "coach");
}

/** Assigning, proposing, reconfiguring and logging on somebody else's behalf. */
export function canCoachModifyMemberHabit(actor: Actor, memberId: string): boolean {
  if (actor.userId === memberId) return true;
  return atLeast(actor.role, "coach");
}

/**
 * Editing the shared catalogue every member draws from.
 *
 * Deliberately higher than coaching: a coach changing one member's target
 * affects one member, and a coach changing the catalogue default affects
 * everybody who adds that habit afterwards.
 */
export function canAdminManageCatalogue(actor: Actor): boolean {
  return atLeast(actor.role, "admin");
}

/**
 * The member this request is about.
 *
 * A member's own routes carry no id at all — the actor is the subject, so
 * there is nothing to tamper with. Coach routes carry `:userId`, and this is
 * the single gate they pass through. Null means refuse.
 */
export function subjectOf(actor: Actor, paramUserId?: string | null): string | null {
  if (!paramUserId || paramUserId === actor.userId) return actor.userId;
  return canCoachAccessMember(actor, paramUserId) ? paramUserId : null;
}
