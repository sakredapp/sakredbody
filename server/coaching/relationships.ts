/**
 * The coaching relationship, and the boundary it draws.
 *
 * ── Why this is one file and not a check per route ────────────────────────
 *
 * A coach can read a member's sleep, their training load, their check-ins and
 * their terrain. That is the point of coaching and it is also the most
 * sensitive read in the product, so the rule deciding it should exist once,
 * where it can be tested, rather than as a clause repeated in a dozen handlers
 * — because the twelfth one is the one somebody forgets.
 *
 * ── Capability and relationship are different questions ───────────────────
 *
 * The role ladder in shared/models/access.ts is hierarchical: `coach` is rank
 * 10, so `atLeast(role, "coach")` is true for every moderator, admin and owner.
 * That is right for capability — "may this account perform coach-shaped
 * actions" — and it is emphatically not an answer to "for which member".
 *
 * Gating a coach route on rank alone would make every admin the assigned coach
 * of every member in the database. So both are checked, in order:
 *
 *   authenticated
 *        ↓
 *   capability — may this account act as a coach at all
 *        ↓
 *   relationship — is there an ACTIVE row joining them to this member
 *        ↓
 *   allow
 *
 * Admin bypass is deliberate and explicit rather than a side effect of rank:
 * an admin holds `superviseCoaching`, which names this authority exactly —
 * reading a member's coaching data without being their coach — rather than
 * borrowing `manageMembers`, which is about accounts, tiers and bookings.
 */

import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { coachRelationships } from "../../shared/schema.js";
import { can, effectiveRole, atLeast } from "../../shared/models/access.js";

/** The live relationship between a coach and a member, if there is one. */
export async function activeRelationship(coachUserId: string, memberUserId: string) {
  const [row] = await db
    .select()
    .from(coachRelationships)
    .where(
      and(
        eq(coachRelationships.coachUserId, coachUserId),
        eq(coachRelationships.memberUserId, memberUserId),
        eq(coachRelationships.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** A member's current coach, or null. The canonical answer to "do I have one". */
export async function coachOf(memberUserId: string) {
  const [row] = await db
    .select()
    .from(coachRelationships)
    .where(
      and(
        eq(coachRelationships.memberUserId, memberUserId),
        eq(coachRelationships.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** A coach's live roster. Ended relationships are history, not clients. */
export async function clientsOf(coachUserId: string) {
  return db
    .select()
    .from(coachRelationships)
    .where(
      and(
        eq(coachRelationships.coachUserId, coachUserId),
        eq(coachRelationships.status, "active"),
      ),
    );
}

declare module "express-serve-static-core" {
  interface Request {
    /** Set by requireCoachOf: whether access came from a relationship or from
     *  an admin acting operationally. Handlers that log or attribute should
     *  say which, rather than recording an admin as somebody's coach. */
    coachAccess?: "relationship" | "admin";
  }
}

/**
 * Gate a route on an active relationship with the member named in the path.
 *
 * `param` is the route parameter holding the member's id, so a route can call
 * the member whatever reads best without this having to guess.
 *
 * A member id that does not exist, a member with a different coach, and a
 * member whose relationship has ended all produce the same 404 — not a 403.
 * Whether a given id is a member of Sakred at all is not something a coach with
 * no relationship to them is entitled to learn from the difference between two
 * status codes.
 */
export function requireCoachOf(param = "memberId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const role = effectiveRole(user);
      req.role = role;

      // Capability first: an ordinary member has no business on a coach route
      // even if they somehow name themselves in the path.
      if (!atLeast(role, "coach")) {
        return res.status(403).json({ message: "You don't have access to that" });
      }

      const memberId = String((req.params as Record<string, unknown>)[param] ?? "");
      if (!memberId) return res.status(404).json({ message: "No such member" });

      /**
       * Nobody is their own client.
       *
       * A coach hitting a client route with their own id would otherwise fall
       * through to the relationship check and 404, which is the right outcome
       * by accident. Said explicitly because it is a real path — a coach who is
       * also a member has a member id that is their own.
       */
      if (memberId === userId) {
        return res.status(404).json({ message: "No such member" });
      }

      // The operational bypass, named rather than inherited from rank.
      if (can(role, "superviseCoaching")) {
        req.coachAccess = "admin";
        return next();
      }

      const relationship = await activeRelationship(userId, memberId);
      if (!relationship) return res.status(404).json({ message: "No such member" });

      req.coachAccess = "relationship";
      next();
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

/**
 * Assign a coach, closing whatever came before, in one transaction.
 *
 * ── Why a transaction and not two statements ──────────────────────────────
 *
 * The database holds a partial unique index on (member) where status = active,
 * so a member cannot have two live coaches. Inserting before closing therefore
 * *fails* rather than corrupting — which is the right failure, and still leaves
 * a window in the other order where the member has no coach at all. Inside one
 * transaction there is no moment when either is visible.
 *
 * The old row is closed, never deleted. Its messages and its plan phases stay
 * attributable to the coach who wrote them, and rewriting history so the new
 * coach appears to have done the old coach's work would be a lie the member
 * could act on.
 */
export async function assignCoach(input: {
  memberUserId: string;
  coachUserId: string;
  assignedBy: string;
}) {
  if (input.coachUserId === input.memberUserId) {
    throw new Error("Somebody cannot be their own coach.");
  }

  return db.transaction(async (tx) => {
    await tx
      .update(coachRelationships)
      .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(coachRelationships.memberUserId, input.memberUserId),
          eq(coachRelationships.status, "active"),
        ),
      );

    const [row] = await tx
      .insert(coachRelationships)
      .values({
        coachUserId: input.coachUserId,
        memberUserId: input.memberUserId,
        assignedBy: input.assignedBy,
        status: "active",
      })
      .returning();

    return row;
  });
}

/** End the member's current coaching without starting another. */
export async function endCoaching(memberUserId: string) {
  const [row] = await db
    .update(coachRelationships)
    .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(coachRelationships.memberUserId, memberUserId),
        eq(coachRelationships.status, "active"),
      ),
    )
    .returning();
  return row ?? null;
}
