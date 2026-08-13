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

import { atLeast, can, type Role } from "./access.js";

export type Actor = {
  userId: string;
  role: Role;
  /**
   * The members this account actively coaches, resolved from
   * `coach_relationships` by whoever built the actor.
   *
   * Undefined means "not looked up" and is treated exactly like empty: an actor
   * assembled without the roster gets no client access rather than all of it.
   * Failing closed matters more than convenience here — the shape of the
   * mistake this guards against is somebody adding a new caller, forgetting the
   * lookup, and silently handing every coach the whole membership again.
   */
  clientIds?: readonly string[];
};

/**
 * Reading somebody else's habits.
 *
 * ── What this used to say, and why it was wrong ───────────────────────────
 *
 * "The platform has no coach↔client table: staff at coach level and above work
 * with every member." That was an honest description of a platform where the
 * only alternative was hard-coding names, and it is now false. It meant every
 * account at coach rank could read every member's habits, targets, adherence
 * and terrain check-ins by changing a number in a URL — and because the role
 * ladder is hierarchical, "coach rank" included every moderator and admin.
 *
 * `coach_relationships` answers the question properly, so it is asked properly:
 *
 *   themselves       always
 *   superviseCoaching  a named administrative capability, not a rank
 *   coach            only the members actually assigned to them
 *   anyone else      no
 *
 * The admin bypass is checked by capability rather than by `atLeast(role,
 * "admin")` on purpose. Rank comparisons are how the original hole opened: the
 * ladder grows a rung, the rung inherits everything below it, and an
 * authorization decision nobody revisited quietly widens.
 */
export function canCoachAccessMember(actor: Actor, memberId: string): boolean {
  if (actor.userId === memberId) return true;
  if (can(actor.role, "superviseCoaching")) return true;
  if (!atLeast(actor.role, "coach")) return false;
  return (actor.clientIds ?? []).includes(memberId);
}

/**
 * Assigning, proposing, reconfiguring and logging on somebody else's behalf.
 *
 * The same boundary as reading. It is a separate function because the two are
 * genuinely separate questions and one of them may tighten later — a coach who
 * can see a member is not obviously a coach who may log on their behalf — but
 * neither may ever be broader than the relationship.
 */
export function canCoachModifyMemberHabit(actor: Actor, memberId: string): boolean {
  return canCoachAccessMember(actor, memberId);
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
