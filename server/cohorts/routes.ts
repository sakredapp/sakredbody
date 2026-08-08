/**
 * Masterminds — API
 *
 * Member:
 *   GET  /api/cohorts             — open and running rooms, with this member's standing
 *   GET  /api/cohorts/:id         — one room; the schedule appears only once confirmed
 *   POST /api/cohorts/:id/apply   — ask to be in the room
 *   POST /api/cohorts/:id/withdraw — leave, or take back an application
 *
 * Admin:
 *   GET    /api/admin/cohorts                   — all rooms, drafts included
 *   POST   /api/admin/cohorts                   — create
 *   PUT    /api/admin/cohorts/:id               — update
 *   DELETE /api/admin/cohorts/:id               — delete (cascades roster + schedule)
 *   GET    /api/admin/cohorts/:id/roster        — the roster, with review notes
 *   PATCH  /api/admin/cohorts/members/:memberId — decide on someone
 *   POST   /api/admin/cohorts/:id/sessions      — add a session
 *   DELETE /api/admin/cohorts/sessions/:id      — remove one
 *
 * `review_note` is the coach's and is stripped from every member-facing
 * response. It is never selected into a member payload — not hidden in the UI.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { eq, and, inArray, asc, desc, ne, sql, count } from "drizzle-orm";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { z } from "zod";
import {
  cohorts,
  cohortMembers,
  cohortSessions,
  insertCohortSchema,
  insertCohortSessionSchema,
  cohortMemberStatusEnum,
  users,
} from "../../shared/schema.js";

function isAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  storage
    .getUser(userId)
    .then((user) => {
      if (!user || user.isAdmin !== "true")
        return res.status(403).json({ message: "Admin access required" });
      next();
    })
    .catch(() => res.status(500).json({ message: "Internal Server Error" }));
}

/** Express 5 types route params as `string | string[]`. Normalise to a string. */
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      message: err.errors[0].message,
      field: err.errors[0].path.join("."),
    });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

/** Confirmed seats taken. Applications don't hold a seat. */
async function confirmedCount(cohortId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.status, "confirmed")));
  return Number(row?.n ?? 0);
}

export function registerCohortRoutes(app: Express) {
  // ─── MEMBER ──────────────────────────────────────────────────────────────

  app.get("/api/cohorts", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;

      const rows = await db
        .select()
        .from(cohorts)
        .where(ne(cohorts.status, "draft"))
        .orderBy(asc(cohorts.sortOrder), asc(cohorts.startDate));

      if (rows.length === 0) return res.json([]);

      const ids = rows.map((c) => c.id);

      // Two aggregate queries rather than one per room.
      const [mine, seats] = await Promise.all([
        db
          .select({
            cohortId: cohortMembers.cohortId,
            status: cohortMembers.status,
          })
          .from(cohortMembers)
          .where(and(eq(cohortMembers.userId, userId), inArray(cohortMembers.cohortId, ids))),
        db
          .select({ cohortId: cohortMembers.cohortId, n: count() })
          .from(cohortMembers)
          .where(and(inArray(cohortMembers.cohortId, ids), eq(cohortMembers.status, "confirmed")))
          .groupBy(cohortMembers.cohortId),
      ]);

      const myStatus = new Map(mine.map((m) => [m.cohortId, m.status]));
      const taken = new Map(seats.map((s) => [s.cohortId, Number(s.n)]));

      res.json(
        rows.map((c) => ({
          ...c,
          myStatus: myStatus.get(c.id) ?? null,
          seatsRemaining: Math.max(0, c.capacity - (taken.get(c.id) ?? 0)),
        })),
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/cohorts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const cohortId = param(req, "id");

      const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId));
      if (!cohort || cohort.status === "draft")
        return res.status(404).json({ message: "Not found" });

      const [membership] = await db
        .select({ status: cohortMembers.status, note: cohortMembers.note })
        .from(cohortMembers)
        .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)));

      const confirmed = membership?.status === "confirmed";

      // The schedule belongs to the room. Applicants see that it exists, not
      // what's in it.
      const sessions = confirmed
        ? await db
            .select()
            .from(cohortSessions)
            .where(eq(cohortSessions.cohortId, cohortId))
            .orderBy(asc(cohortSessions.orderIndex), asc(cohortSessions.startsAt))
        : [];

      res.json({
        ...cohort,
        myStatus: membership?.status ?? null,
        myNote: membership?.note ?? null,
        seatsRemaining: Math.max(0, cohort.capacity - (await confirmedCount(cohortId))),
        sessions,
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/cohorts/:id/apply", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const cohortId = param(req, "id");
      const { note } = z.object({ note: z.string().max(4000).optional() }).parse(req.body ?? {});

      const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId));
      if (!cohort || cohort.status === "draft")
        return res.status(404).json({ message: "Not found" });

      if (cohort.status !== "open") {
        return res.status(409).json({ message: "This room isn't taking applications." });
      }

      if ((await confirmedCount(cohortId)) >= cohort.capacity) {
        return res.status(409).json({ message: "This room is full." });
      }

      // Re-applying after withdrawing is allowed and resets the row rather than
      // stacking a second one.
      const [saved] = await db
        .insert(cohortMembers)
        .values({ cohortId, userId, note: note ?? null, status: "applied" })
        .onConflictDoUpdate({
          target: [cohortMembers.cohortId, cohortMembers.userId],
          set: { status: "applied", note: note ?? null, decidedAt: null },
        })
        .returning({
          id: cohortMembers.id,
          status: cohortMembers.status,
          note: cohortMembers.note,
        });

      res.status(201).json(saved);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/cohorts/:id/withdraw", isAuthenticated, async (req, res) => {
    try {
      const [updated] = await db
        .update(cohortMembers)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(
          and(
            eq(cohortMembers.cohortId, param(req, "id")),
            eq(cohortMembers.userId, req.session!.userId!),
          ),
        )
        .returning({ id: cohortMembers.id, status: cohortMembers.status });

      if (!updated) return res.status(404).json({ message: "You're not on this roster." });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  app.get("/api/admin/cohorts", isAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(cohorts)
        .orderBy(asc(cohorts.sortOrder), desc(cohorts.startDate));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/cohorts", isAdmin, async (req, res) => {
    try {
      const input = insertCohortSchema.parse(req.body);
      const [created] = await db.insert(cohorts).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/cohorts/:id", isAdmin, async (req, res) => {
    try {
      const input = insertCohortSchema.partial().parse(req.body);
      const [updated] = await db
        .update(cohorts)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(cohorts.id, param(req, "id")))
        .returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/cohorts/:id", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(cohorts)
        .where(eq(cohorts.id, param(req, "id")))
        .returning({ id: cohorts.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/cohorts/:id/roster", isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          member: cohortMembers,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(cohortMembers)
        .leftJoin(users, eq(cohortMembers.userId, users.id))
        .where(eq(cohortMembers.cohortId, param(req, "id")))
        .orderBy(asc(cohortMembers.appliedAt));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.patch("/api/admin/cohorts/members/:memberId", isAdmin, async (req, res) => {
    try {
      const input = z
        .object({
          status: cohortMemberStatusEnum.optional(),
          reviewNote: z.string().max(4000).nullable().optional(),
        })
        .parse(req.body);

      const [updated] = await db
        .update(cohortMembers)
        .set({
          ...input,
          ...(input.status ? { decidedAt: new Date() } : {}),
        })
        .where(eq(cohortMembers.id, param(req, "memberId")))
        .returning();

      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/cohorts/:id/sessions", isAdmin, async (req, res) => {
    try {
      const cohortId = param(req, "id");
      const existing = await db
        .select({ orderIndex: cohortSessions.orderIndex })
        .from(cohortSessions)
        .where(eq(cohortSessions.cohortId, cohortId));
      const nextIndex = existing.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;

      const input = insertCohortSessionSchema.parse({
        orderIndex: nextIndex,
        ...req.body,
        cohortId,
        ...(req.body?.startsAt ? { startsAt: new Date(req.body.startsAt) } : {}),
      });

      const [created] = await db.insert(cohortSessions).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/cohorts/sessions/:sessionId", isAdmin, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(cohortSessions)
        .where(eq(cohortSessions.id, param(req, "sessionId")))
        .returning({ id: cohortSessions.id });
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ id: deleted.id });
    } catch (err) {
      fail(res, err);
    }
  });
}
