/**
 * Coaching relationships — API
 *
 * Member:
 *   GET    /api/coaching/my-coach            — who coaches me, or null
 *
 * Coach:
 *   GET    /api/coach/clients                — my roster, and only mine
 *
 * Admin:
 *   GET    /api/admin/coaches                — who can be assigned
 *   PUT    /api/admin/members/:id/coach      — assign or reassign
 *   DELETE /api/admin/members/:id/coach      — end coaching
 *
 * ── What a member is allowed to know about their coach ────────────────────
 *
 * Name and photo, and nothing else. A coach's email, role and account state are
 * not part of the coaching relationship, and the natural shape of this endpoint
 * — "return the coach" — would hand over the whole user row by default. The
 * columns are named explicitly for that reason, here and in the roster below.
 */

import type { Express, Request, Response } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { requireCapability } from "../auth/roles.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { users } from "../../shared/models/auth.js";
import { assignCoachSchema, coachRelationships } from "../../shared/schema.js";
import { atLeast, effectiveRole } from "../../shared/models/access.js";
import { assignCoach, clientsOf, coachOf, endCoaching } from "./relationships.js";

/** What a member or a coach may see of another person. Never the whole row. */
const personColumns = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  profileImageUrl: users.profileImageUrl,
};

function displayName(p: { firstName: string | null; lastName: string | null }) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "Your coach";
}

function fail(res: Response, where: string, err: unknown) {
  console.error(`[coaching] ${where} failed`, err);
  res.status(500).json({ message: "Internal Server Error" });
}

export function registerCoachRelationshipRoutes(app: Express): void {
  // ── Member ───────────────────────────────────────────────────────────────

  /**
   * The canonical answer to "do I have a coach".
   *
   * This replaces inference from whether a plan or a message happens to exist.
   * Those are consequences of a relationship and they get the two cases that
   * matter backwards: a coach assigned this morning who has not written yet did
   * not register, and a coach replaced last month still did.
   *
   * `null` is a normal answer, not an error. Most members have no coach and the
   * app is expected to be complete for them.
   */
  app.get("/api/coaching/my-coach", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const relationship = await coachOf(userId);
      if (!relationship) return res.json({ coach: null });

      const [coach] = await db
        .select(personColumns)
        .from(users)
        .where(eq(users.id, relationship.coachUserId));

      if (!coach) {
        // The relationship points at a user that no longer exists. Report no
        // coach rather than a half-empty card: the member's experience should
        // degrade to "no coach", which is a state the app handles completely.
        return res.json({ coach: null });
      }

      res.json({
        coach: { ...coach, name: displayName(coach) },
        since: relationship.startedAt,
      });
    } catch (err) {
      fail(res, "my-coach", err);
    }
  });

  // ── Coach ────────────────────────────────────────────────────────────────

  /**
   * My clients — the ones assigned to me, and no others.
   *
   * Scoped by the authenticated coach's own id rather than by anything in the
   * request, so there is no parameter to tamper with. An admin calling this
   * gets their own roster, which is usually empty; the admin view of everybody
   * is a different endpoint with a different capability behind it.
   */
  app.get("/api/coach/clients", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const rows = await clientsOf(userId);
      if (!rows.length) return res.json({ clients: [] });

      const people = await db
        .select(personColumns)
        .from(users)
        .where(inArray(users.id, rows.map((r) => r.memberUserId)));

      const byId = new Map(people.map((p) => [p.id, p]));

      res.json({
        clients: rows
          .map((r) => {
            const person = byId.get(r.memberUserId);
            if (!person) return null;
            return { ...person, name: displayName(person), since: r.startedAt };
          })
          .filter(Boolean),
      });
    } catch (err) {
      fail(res, "clients", err);
    }
  });

  // ── Admin ────────────────────────────────────────────────────────────────

  /**
   * Who can be assigned as a coach.
   *
   * ── Rank is not the roster ──────────────────────────────────────────────
   *
   * The role ladder is hierarchical, so `atLeast(role, "coach")` is true for
   * moderators, admins and owners as well. Using that as the list would dump
   * every staff account into a dropdown labelled "Coach", which is a claim
   * about what those people do rather than what they may do.
   *
   * So the list is everyone at coach rank or above, each carrying its own role
   * so the UI can put actual coaches first and present the rest as staff who
   * *can* be assigned if somebody deliberately chooses them. Nobody is hidden
   * — an admin who also coaches is a real case, and the alternative was a
   * second boolean duplicating what `role` already says.
   *
   * A dedicated coach profile is the better long-term answer to "who is
   * presented as a Sakred Coach", and it belongs with the coach workspace.
   */
  app.get(
    "/api/admin/coaches",
    isAuthenticated,
    requireCapability("manageMembers"),
    async (_req: Request, res: Response) => {
      try {
        const rows = await db
          .select({ ...personColumns, role: users.role, isAdmin: users.isAdmin })
          .from(users);

        const eligible = rows
          .map((r) => ({ ...r, effective: effectiveRole(r) }))
          .filter((r) => atLeast(r.effective, "coach"))
          .map((r) => ({
            id: r.id,
            name: displayName(r),
            profileImageUrl: r.profileImageUrl,
            role: r.effective,
            /** Actual coaches first in the UI; staff are assignable, not implied. */
            isCoachByRole: r.effective === "coach",
          }))
          .sort((a, b) => Number(b.isCoachByRole) - Number(a.isCoachByRole) || a.name.localeCompare(b.name));

        // How many live clients each already has, so an admin assigning work
        // can see who is carrying it.
        const counts = await db
          .select({ coachUserId: coachRelationships.coachUserId })
          .from(coachRelationships)
          .where(eq(coachRelationships.status, "active"));

        const load = new Map<string, number>();
        for (const c of counts) load.set(c.coachUserId, (load.get(c.coachUserId) ?? 0) + 1);

        res.json({ coaches: eligible.map((c) => ({ ...c, activeClients: load.get(c.id) ?? 0 })) });
      } catch (err) {
        fail(res, "coaches", err);
      }
    },
  );

  /**
   * Assign or reassign a member's coach.
   *
   * PUT rather than POST because it is idempotent in intent: the member ends up
   * with this coach whether or not they had one before, and running it twice
   * leaves the same state.
   */
  app.put(
    "/api/admin/members/:id/coach",
    isAuthenticated,
    requireCapability("manageMembers"),
    async (req: Request, res: Response) => {
      try {
        const parsed = assignCoachSchema.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

        const memberUserId = String(req.params.id ?? "");
        const { coachUserId } = parsed.data;

        if (memberUserId === coachUserId) {
          return res.status(400).json({ message: "Somebody cannot be their own coach." });
        }

        const people = await db
          .select({ id: users.id, role: users.role, isAdmin: users.isAdmin })
          .from(users)
          .where(or(eq(users.id, memberUserId), eq(users.id, coachUserId)));

        const member = people.find((p) => p.id === memberUserId);
        const coach = people.find((p) => p.id === coachUserId);
        if (!member) return res.status(404).json({ message: "No such member" });
        if (!coach) return res.status(404).json({ message: "No such coach" });

        /**
         * The coach has to actually be one.
         *
         * Checked here rather than trusted from the dropdown, because the
         * dropdown is not the only way this endpoint can be called and a member
         * silently promoted by being assigned would be a way of granting
         * coach-level read access without going through the role screen.
         */
        if (!atLeast(effectiveRole(coach), "coach")) {
          return res.status(400).json({
            message: "That person is not a coach. Change their role first.",
          });
        }

        const relationship = await assignCoach({
          memberUserId,
          coachUserId,
          assignedBy: req.session!.userId!,
        });

        res.json(relationship);
      } catch (err) {
        fail(res, "assign coach", err);
      }
    },
  );

  /** End coaching without starting another relationship. */
  app.delete(
    "/api/admin/members/:id/coach",
    isAuthenticated,
    requireCapability("manageMembers"),
    async (req: Request, res: Response) => {
      try {
        const ended = await endCoaching(String(req.params.id ?? ""));
        if (!ended) return res.status(404).json({ message: "That member has no coach." });
        res.json(ended);
      } catch (err) {
        fail(res, "end coaching", err);
      }
    },
  );

  /**
   * The member's current coach, for the admin screen.
   *
   * Separate from `/api/coaching/my-coach` because it answers a different
   * question for a different reader — that one is "my coach" and is scoped to
   * the session; this one names a member and needs the capability.
   */
  app.get(
    "/api/admin/members/:id/coach",
    isAuthenticated,
    requireCapability("manageMembers"),
    async (req: Request, res: Response) => {
      try {
        const memberUserId = String(req.params.id ?? "");
        const relationship = await coachOf(memberUserId);
        if (!relationship) return res.json({ coach: null, history: await historyFor(memberUserId) });

        const [coach] = await db
          .select(personColumns)
          .from(users)
          .where(eq(users.id, relationship.coachUserId));

        res.json({
          coach: coach ? { ...coach, name: displayName(coach) } : null,
          since: relationship.startedAt,
          history: await historyFor(memberUserId),
        });
      } catch (err) {
        fail(res, "member coach", err);
      }
    },
  );
}

/**
 * Who has coached this member before.
 *
 * Kept because reassignment closes a relationship rather than deleting it, and
 * an admin looking at a member should be able to see that Nick had them until
 * August without reading the messages to work it out.
 */
async function historyFor(memberUserId: string) {
  const rows = await db
    .select()
    .from(coachRelationships)
    .where(
      and(
        eq(coachRelationships.memberUserId, memberUserId),
        eq(coachRelationships.status, "ended"),
      ),
    );
  if (!rows.length) return [];

  const people = await db
    .select(personColumns)
    .from(users)
    .where(inArray(users.id, rows.map((r) => r.coachUserId)));
  const byId = new Map(people.map((p) => [p.id, p]));

  return rows.map((r) => {
    const person = byId.get(r.coachUserId);
    return {
      coachUserId: r.coachUserId,
      name: person ? displayName(person) : "A former coach",
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    };
  });
}
