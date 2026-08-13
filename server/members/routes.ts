/**
 * Members — administration
 *
 *   GET    /api/admin/members          — everyone, with the state that matters
 *   GET    /api/admin/members/:id      — one member, in depth
 *   PATCH  /api/admin/members/:id      — tier, admin, timezone
 *   GET    /api/admin/tiers            — the tiers themselves
 *   POST   /api/admin/tiers            — create
 *   PUT    /api/admin/tiers/:id        — update
 *   DELETE /api/admin/tiers/:id        — remove, if nobody holds it
 *
 * ── Why this did not exist ────────────────────────────────────────────────
 *
 * It should have been the first admin screen and was the last. There was no
 * endpoint anywhere to list a member or change their tier, which meant the
 * one thing standing between a paying client and the community — being on a
 * tier above `free` — could only be done by writing SQL against production.
 * The audit told you to "assign real tiers"; there was no way to.
 *
 * ── The two rules worth stating ───────────────────────────────────────────
 *
 * 1. An admin cannot remove their own admin rights. Not paternalism: this is
 *    the only screen that can grant them, so the last admin demoting
 *    themselves locks everybody out of the entire back office permanently,
 *    with no path back that doesn't involve a database console.
 *
 * 2. A tier cannot be deleted while a member holds it. The foreign key is
 *    `ON UPDATE CASCADE` with no delete rule, so the database would refuse
 *    anyway — this refuses first, with a sentence explaining who is still on
 *    it, instead of surfacing a constraint violation.
 *
 * Passwords are never selected. Not redacted after the fact — never read out
 * of the database, so there is no code path where a hash can reach a client.
 */

import type { Express, Request, Response } from "express";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { db } from "../db.js";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { z } from "zod";
import {
  users,
  membershipTiers,
  userRoutines,
  wellnessRoutines,
  wins,
  offeringRegistrations,
  communityMessages,
} from "../../shared/schema.js";
import { track, trackError } from "../telemetry/index.js";
import { ROLES, atLeast, type Role } from "../../shared/models/access.js";

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Admin gate.
 *
 * Deliberately a local copy of the same three lines used by the other admin
 * modules rather than a shared import, because that is the pattern already
 * established here and consistency beats a marginal deduplication. The rule
 * itself — `is_admin === "true"` — lives in one place: the column.
 */
function isAdmin(req: Request, res: Response, next: () => void) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  storage
    .getUser(userId)
    .then((user) => {
      if (!user || user.isAdmin !== "true")
        return res.status(403).json({ message: "Admin access required" });
      next();
    })
    .catch(() => res.status(500).json({ message: "Internal Server Error" }));
}

/** Every column except the password. */
const memberColumns = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  profileImageUrl: users.profileImageUrl,
  isAdmin: users.isAdmin,
  /** The canonical one. `isAdmin` is kept alongside for the RLS helper. */
  role: users.role,
  membershipTier: users.membershipTier,
  timezone: users.timezone,
  currentStreak: users.currentStreak,
  longestStreak: users.longestStreak,
  sakredCoins: users.sakredCoins,
  activeRoutineId: users.activeRoutineId,
  routineIntensity: users.routineIntensity,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

const patchMemberSchema = z.object({
  membershipTier: z.string().min(1).optional(),
  isAdmin: z.boolean().optional(),
  timezone: z.string().min(1).max(64).optional(),
  /**
   * The canonical role. See shared/models/access.ts.
   *
   * This endpoint could only write the legacy `isAdmin` varchar, which has
   * exactly two states — so there was no way to make anybody a coach without a
   * SQL console, which is why the app had a `coach` rank that nothing could
   * ever reach.
   *
   * `isAdmin` is still written alongside it, because the Supabase RLS policies
   * call `public.is_sakred_admin()` and that function reads the varchar. Two
   * sources of truth is exactly the problem this is meant to avoid, so they are
   * written together, from the role, below — never independently.
   */
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
});

const tierSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "Use lowercase letters, numbers, dashes"),
  name: z.string().min(1).max(80),
  rank: z.number().int().min(0).max(1000),
  description: z.string().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  priceNote: z.string().max(80).nullable().optional(),
  includes: z.array(z.string().max(200)).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: zodMessage(err) });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

export function registerMemberRoutes(app: Express) {
  // ─── Members ─────────────────────────────────────────────────────────────

  /**
   * Everyone, newest first, with the numbers you'd want before deciding
   * anything about them.
   *
   * The counts are subqueries rather than joins: a join to wins and another
   * to registrations multiplies rows against each other, and the totals come
   * out wrong in a way that looks plausible.
   */
  app.get("/api/admin/members", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const q = String((req.query.q as string) ?? "").trim();
      const tier = String((req.query.tier as string) ?? "").trim();

      const filters = [];
      if (q) {
        filters.push(
          or(
            ilike(users.email, `%${q}%`),
            ilike(users.firstName, `%${q}%`),
            ilike(users.lastName, `%${q}%`),
          ),
        );
      }
      if (tier) filters.push(eq(users.membershipTier, tier));

      const rows = await db
        .select({
          ...memberColumns,
          tierName: membershipTiers.name,
          tierRank: membershipTiers.rank,
          winCount: sql<number>`(select count(*)::int from ${wins} w where w.user_id = ${users.id})`,
          postCount: sql<number>`(select count(*)::int from ${communityMessages} m where m.user_id = ${users.id} and m.deleted_at is null)`,
          registrationCount: sql<number>`(select count(*)::int from ${offeringRegistrations} r where r.user_id = ${users.id})`,
        })
        .from(users)
        .leftJoin(membershipTiers, eq(users.membershipTier, membershipTiers.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(users.createdAt))
        .limit(500);

      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  /** One member, with what they're actually doing. */
  app.get("/api/admin/members/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = param(req, "id");

      const [member] = await db
        .select({
          ...memberColumns,
          tierName: membershipTiers.name,
          tierRank: membershipTiers.rank,
        })
        .from(users)
        .leftJoin(membershipTiers, eq(users.membershipTier, membershipTiers.id))
        .where(eq(users.id, id));

      if (!member) return res.status(404).json({ message: "No such member" });

      const routines = await db
        .select({
          id: userRoutines.id,
          status: userRoutines.status,
          startDate: userRoutines.startDate,
          endDate: userRoutines.endDate,
          routineName: wellnessRoutines.name,
        })
        .from(userRoutines)
        .leftJoin(wellnessRoutines, eq(userRoutines.routineId, wellnessRoutines.id))
        .where(eq(userRoutines.userId, id))
        .orderBy(desc(userRoutines.startDate))
        .limit(20);

      const recentWins = await db
        .select()
        .from(wins)
        .where(eq(wins.userId, id))
        .orderBy(desc(wins.earnedAt))
        .limit(10);

      res.json({ ...member, routines, wins: recentWins });
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Change a member's tier, admin rights or timezone.
   *
   * The self-demotion guard is the important line. This is the only surface
   * that can grant admin, so an admin removing their own rights here would
   * lock the entire back office with no way back short of a SQL console.
   */
  app.patch("/api/admin/members/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = param(req, "id");
      const input = patchMemberSchema.parse(req.body ?? {});
      const actorId = req.session!.userId!;

      const [target] = await db.select(memberColumns).from(users).where(eq(users.id, id));
      if (!target) return res.status(404).json({ message: "No such member" });

      if (input.isAdmin === false && id === actorId) {
        return res.status(400).json({
          message:
            "You can't remove your own admin rights here — you'd lock yourself out of this screen.",
        });
      }

      // A tier that doesn't exist would be caught by the foreign key, but as
      // a 500 with a constraint name in it. Check first and say which tiers
      // are real.
      if (input.membershipTier) {
        const [tier] = await db
          .select({ id: membershipTiers.id })
          .from(membershipTiers)
          .where(eq(membershipTiers.id, input.membershipTier));
        if (!tier) {
          return res.status(400).json({ message: `There's no tier called "${input.membershipTier}".` });
        }
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.membershipTier !== undefined) patch.membershipTier = input.membershipTier;
      if (input.timezone !== undefined) patch.timezone = input.timezone;
      // Stored as the string "true"/"false", matching the existing column.
      if (input.isAdmin !== undefined) patch.isAdmin = input.isAdmin ? "true" : "false";

      /**
       * Role, with the legacy flag kept in step.
       *
       * Written together and derived from one value, so the two can never
       * disagree — `effectiveRole` takes the higher of them, which means a
       * half-applied change would silently leave somebody with access they were
       * just supposed to lose. Setting a role at or above `admin` sets the
       * varchar; anything below clears it.
       *
       * The self-demotion guard below covers the same ground for `role` as it
       * does for `isAdmin`: this is the only surface that grants back-office
       * access, so an admin demoting themselves here would lock the office.
       */
      if (input.role !== undefined) {
        if (id === actorId && !atLeast(input.role, "admin")) {
          return res.status(400).json({
            message: "You can't remove your own admin access — ask another admin.",
          });
        }
        patch.role = input.role;
        patch.isAdmin = atLeast(input.role, "admin") ? "true" : "false";
      }

      const [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, id))
        .returning(memberColumns);

      track("member.update", {
        userId: actorId,
        surface: "admin",
        subjectId: id,
        props: {
          tier: input.membershipTier ?? null,
          admin: input.isAdmin ?? null,
        },
      });

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err) });
      }
      trackError("member.update", err, { userId: req.session?.userId });
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ─── Tiers ───────────────────────────────────────────────────────────────

  /** The tiers, with how many people are on each. */
  app.get("/api/admin/tiers", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: membershipTiers.id,
          name: membershipTiers.name,
          rank: membershipTiers.rank,
          description: membershipTiers.description,
          priceCents: membershipTiers.priceCents,
          priceNote: membershipTiers.priceNote,
          includes: membershipTiers.includes,
          isActive: membershipTiers.isActive,
          sortOrder: membershipTiers.sortOrder,
          memberCount: sql<number>`(select count(*)::int from ${users} u where u.membership_tier = ${membershipTiers.id})`,
        })
        .from(membershipTiers)
        .orderBy(asc(membershipTiers.rank));

      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/tiers", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = tierSchema.parse(req.body ?? {});

      const [existing] = await db
        .select({ id: membershipTiers.id })
        .from(membershipTiers)
        .where(eq(membershipTiers.id, input.id));
      if (existing) {
        return res.status(409).json({ message: `A tier called "${input.id}" already exists.` });
      }

      const [row] = await db.insert(membershipTiers).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Update a tier.
   *
   * `id` is deliberately not changeable. It is the foreign key every member
   * row points at; renaming it would be an `ON UPDATE CASCADE` across the
   * whole users table for a cosmetic change, when `name` is the field
   * actually shown to anyone.
   */
  app.put("/api/admin/tiers/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = param(req, "id");
      const input = tierSchema.omit({ id: true }).partial().parse(req.body ?? {});

      const [row] = await db
        .update(membershipTiers)
        .set(input)
        .where(eq(membershipTiers.id, id))
        .returning();

      if (!row) return res.status(404).json({ message: "No such tier" });
      res.json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/tiers/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = param(req, "id");

      const [{ n }] = await db
        .select({ n: count() })
        .from(users)
        .where(eq(users.membershipTier, id));

      if (n > 0) {
        return res.status(409).json({
          message: `${n} ${n === 1 ? "member is" : "members are"} on this tier. Move them first.`,
        });
      }

      const [row] = await db
        .delete(membershipTiers)
        .where(eq(membershipTiers.id, id))
        .returning({ id: membershipTiers.id });

      if (!row) return res.status(404).json({ message: "No such tier" });
      res.json({ deleted: row.id });
    } catch (err) {
      fail(res, err);
    }
  });
}
