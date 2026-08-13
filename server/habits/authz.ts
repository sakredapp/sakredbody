/**
 * Who may touch whose habits.
 *
 * ── Say the true thing about the security model ───────────────────────────
 *
 * The app connects to Postgres as `service_role`, which bypasses row-level
 * security by design. So RLS is not what protects a member's data here —
 * Express is. The policies in supabase/habit-phases.sql exist so that a leaked
 * anon key still reaches nothing; they are a second wall, and this file is the
 * first one.
 *
 * Writing that down matters more than it sounds. A team that believes RLS is
 * covering them writes routes that trust a body parameter, because "the
 * database will stop it". It will not. It has been told this request is the
 * database's owner.
 *
 * ── The rule that prevents the whole class of bug ─────────────────────────
 *
 * Never fetch an object by an id from the request and *then* check who owns
 * it. That pattern works right up until one handler forgets the second half,
 * and the forgotten one is never the handler you audit.
 *
 * Every loader below takes the actor and returns the row *scoped through the
 * relationship*: `phaseFor(actor, phaseId)` cannot return a phase belonging to
 * somebody the actor may not see, because ownership is in the WHERE clause
 * rather than in an `if` after it. A tampered id returns null, and null is a
 * 404, which is also the right answer — telling an attacker "that exists but
 * isn't yours" is telling them it exists.
 *
 * ── Who a coach can see ───────────────────────────────────────────────────
 *
 * The members assigned to them, and no others. `canCoachAccessMember` is the
 * one function that decides it, which is what made closing the old hole a
 * one-file change: before `coach_relationships` existed this said "coach rank
 * or above may read anybody", and every `/api/coach/members/:userId/…` route
 * inherited that.
 *
 * The roster is resolved here, once per request, and handed to the pure
 * decision as data — see `actorFrom`.
 */

import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import {
  trackedHabits,
  trackedHabitPhases,
  habitEntries,
  habitProposals,
} from "../../shared/models/trackedHabits.js";
import { atLeast, can, effectiveRole } from "../../shared/models/access.js";
import type { Actor as SharedActor } from "../../shared/models/habitAccess.js";
import { clientsOf } from "../coaching/relationships.js";

export type Actor = SharedActor & {
  /** Coach level or above. Attached so a handler can branch without a lookup. */
  isStaff: boolean;
};

/**
 * Resolve the authenticated actor, or answer the request and return null.
 *
 * The role is read per request rather than cached on the session, same as
 * requireCapability: demoting somebody has to take effect on their next
 * request, not their next login.
 */
export async function actorFrom(req: Request, res: Response): Promise<Actor | null> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const user = await storage.getUser(userId);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const role = effectiveRole(user);
  const isStaff = atLeast(role, "coach");

  /**
   * A coach's roster, resolved once and carried on the actor.
   *
   * Only for staff, so an ordinary member's request — the overwhelming majority
   * — costs nothing extra. Admins skip it too: `canCoachAccessMember` lets them
   * through on the `superviseCoaching` capability, and fetching a roster they do
   * not consult would be a query per request to no end.
   *
   * Read per request rather than cached on the session, for the same reason the
   * role is: ending a coaching relationship has to take effect on the coach's
   * next request, not their next login.
   */
  const clientIds =
    isStaff && !can(role, "superviseCoaching")
      ? (await clientsOf(userId)).map((r) => r.memberUserId)
      : [];

  return { userId, role, isStaff, clientIds };
}

// ─── The four questions ────────────────────────────────────────────────────
//
// The decisions themselves live in shared/models/habitAccess.ts, pure and
// exhaustively tested. They were here, and could not be tested here: this file
// reaches the database to resolve a role, so importing it opens a connection —
// and an authorization rule that only runs against live Postgres is one nobody
// exercises. Re-exported so route handlers still import one module.

export {
  canCoachAccessMember,
  canCoachModifyMemberHabit,
  canAdminManageCatalogue,
  subjectOf,
} from "../../shared/models/habitAccess.js";

// ─── Scoped loaders ────────────────────────────────────────────────────────
//
// Each one takes the subject the caller already proved they may act for, so
// ownership lives in the query. There is deliberately no `getPhase(id)`.

export async function trackedHabitFor(subjectId: string, id: string) {
  const [row] = await db
    .select()
    .from(trackedHabits)
    .where(and(eq(trackedHabits.id, id), eq(trackedHabits.userId, subjectId)))
    .limit(1);
  return row ?? null;
}

export async function phaseFor(subjectId: string, id: string) {
  const [row] = await db
    .select()
    .from(trackedHabitPhases)
    .where(and(eq(trackedHabitPhases.id, id), eq(trackedHabitPhases.userId, subjectId)))
    .limit(1);
  return row ?? null;
}

export async function entryFor(subjectId: string, id: string) {
  const [row] = await db
    .select()
    .from(habitEntries)
    .where(and(eq(habitEntries.id, id), eq(habitEntries.userId, subjectId)))
    .limit(1);
  return row ?? null;
}

export async function proposalFor(subjectId: string, id: string) {
  const [row] = await db
    .select()
    .from(habitProposals)
    .where(and(eq(habitProposals.id, id), eq(habitProposals.userId, subjectId)))
    .limit(1);
  return row ?? null;
}

/**
 * A missing row and a row belonging to somebody else are the same answer.
 *
 * "That phase exists but is not yours" confirms the id is real, which is the
 * one thing an attacker enumerating uuids wants to learn.
 */
export function notFound(res: Response) {
  res.status(404).json({ message: "Not found" });
  return null;
}
