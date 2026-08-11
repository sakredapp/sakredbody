/**
 * Masterminds — cohorts, roster, schedule, attendance.
 *
 * supabase/cohorts.sql created four tables, enabled RLS on all of them and
 * wrote eight policies. Nothing in the server or the client ever referenced
 * any of it. These routes are what make that schema real.
 *
 * Shape of the thing:
 *   - a cohort is a group program; `kind` separates a mastermind from a circle
 *   - the roster is a state machine, not a membership list — applied →
 *     invited → confirmed, with declined and withdrawn as terminal states
 *   - a withdrawal is never a delete, because a coach needs to know someone
 *     left the room and when
 *   - `reviewNote` on a roster row is internal and is stripped before any
 *     member-facing response
 *
 * Registered from server/index.ts rather than server/routes.ts so the two
 * sessions working in this tree aren't editing the same file.
 */

import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import {
  cohorts,
  cohortMembers,
  cohortSessions,
  cohortAttendance,
  COHORT_KINDS,
  COHORT_FORMATS,
  COHORT_STATUSES,
  COHORT_MEMBER_STATUSES,
  COHORT_SEAT_TAKEN,
  type CohortMember,
} from "../../shared/models/cohorts.js";
import { EMPHASES } from "../../shared/models/terrain.js";
import { users } from "../../shared/models/auth.js";
import { isAuthenticated } from "../auth/sessionAuth.js";
import { isAdmin } from "../routes.js";
import { track, trackError } from "../telemetry/index.js";

const cohortSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  kind: z.enum(COHORT_KINDS).default("mastermind"),
  description: z.string().trim().max(6000).nullable().optional(),
  coverUrl: z.string().trim().max(500).nullable().optional(),
  startDate: z.string().trim().max(30).nullable().optional(),
  endDate: z.string().trim().max(30).nullable().optional(),
  format: z.enum(COHORT_FORMATS).default("hybrid"),
  /** Direction this cohort runs to. Orthogonal to kind and format. */
  emphasis: z.enum(EMPHASES).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  capacity: z.number().int().min(1).max(500).default(12),
  /** Cents. See the note on the column in shared/models/cohorts.ts. */
  priceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  priceNote: z.string().trim().max(200).nullable().optional(),
  applicationRequired: z.boolean().default(true),
  status: z.enum(COHORT_STATUSES).default("draft"),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

const sessionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  agenda: z.string().trim().max(6000).nullable().optional(),
  /** ISO string from the client; stored as a timestamp. */
  startsAt: z.string().trim().max(40).nullable().optional(),
  durationMinutes: z.number().int().min(0).max(10_080).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  orderIndex: z.number().int().min(0).max(9999).default(0),
});

const memberPatchSchema = z.object({
  status: z.enum(COHORT_MEMBER_STATUSES).optional(),
  reviewNote: z.string().trim().max(4000).nullable().optional(),
});

/** Roster rows leave the server without the coach's private note. */
function stripReviewNote(row: CohortMember) {
  const { reviewNote: _reviewNote, ...rest } = row;
  return rest;
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function registerCohortRoutes(app: Express): void {
  // ══ Admin ═══════════════════════════════════════════════════════════

  /**
   * Every cohort with its seat count, in one round trip.
   *
   * The count is computed here rather than in the client because "how full is
   * it" is the single thing you look at, and a client that has to fetch each
   * roster to answer it will make one request per cohort.
   */
  app.get("/api/admin/cohorts", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(cohorts)
        .orderBy(asc(cohorts.sortOrder), desc(cohorts.createdAt));

      if (rows.length === 0) return res.json([]);

      const roster = await db
        .select({
          cohortId: cohortMembers.cohortId,
          status: cohortMembers.status,
        })
        .from(cohortMembers)
        .where(inArray(cohortMembers.cohortId, rows.map((r) => r.id)));

      const counts = new Map<string, { taken: number; applied: number }>();
      for (const r of roster) {
        const c = counts.get(r.cohortId) ?? { taken: 0, applied: 0 };
        if (COHORT_SEAT_TAKEN.includes(r.status)) c.taken += 1;
        if (r.status === "applied") c.applied += 1;
        counts.set(r.cohortId, c);
      }

      res.json(
        rows.map((r) => ({
          ...r,
          seatsTaken: counts.get(r.id)?.taken ?? 0,
          pendingApplications: counts.get(r.id)?.applied ?? 0,
        })),
      );
    } catch (error) {
      trackError("cohorts.list", error);
      res.status(500).json({ message: "Failed to load cohorts" });
    }
  });

  app.post("/api/admin/cohorts", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const input = cohortSchema.parse(req.body ?? {});
      const [created] = await db.insert(cohorts).values(input).returning();
      track("cohort.created", { surface: "admin", props: { kind: input.kind } });
      res.status(201).json({ ...created, seatsTaken: 0, pendingApplications: 0 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("cohorts.create", error);
      res.status(500).json({ message: "Failed to create cohort" });
    }
  });

  app.patch("/api/admin/cohorts/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const input = cohortSchema.partial().parse(req.body ?? {});

      const [updated] = await db
        .update(cohorts)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(cohorts.id, id))
        .returning();

      if (!updated) return res.status(404).json({ message: "Cohort not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("cohorts.update", error);
      res.status(500).json({ message: "Failed to update cohort" });
    }
  });

  /**
   * Roster and schedule cascade from the foreign keys in cohorts.sql, so
   * deleting a cohort deletes everyone's application to it. The admin UI
   * pushes 'complete' instead and only offers this on a draft.
   */
  app.delete("/api/admin/cohorts/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const deleted = await db
        .delete(cohorts)
        .where(eq(cohorts.id, String(req.params.id)))
        .returning({ id: cohorts.id });

      if (!deleted.length) return res.status(404).json({ message: "Cohort not found" });
      res.status(204).end();
    } catch (error) {
      trackError("cohorts.delete", error);
      res.status(500).json({ message: "Failed to delete cohort" });
    }
  });

  // ── Roster ───────────────────────────────────────────────────────────

  /** The roster with names attached — a bare user id is unusable in a list. */
  app.get(
    "/api/admin/cohorts/:id/members",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const rows = await db
          .select({
            member: cohortMembers,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            profileImageUrl: users.profileImageUrl,
          })
          .from(cohortMembers)
          .leftJoin(users, eq(users.id, cohortMembers.userId))
          .where(eq(cohortMembers.cohortId, String(req.params.id)))
          .orderBy(desc(cohortMembers.appliedAt));

        res.json(
          rows.map((r) => ({
            ...r.member,
            firstName: r.firstName,
            lastName: r.lastName,
            email: r.email,
            profileImageUrl: r.profileImageUrl,
          })),
        );
      } catch (error) {
        trackError("cohorts.roster", error);
        res.status(500).json({ message: "Failed to load roster" });
      }
    },
  );

  /** Admin adds someone directly — the invite path, skipping the application. */
  app.post(
    "/api/admin/cohorts/:id/members",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const cohortId = String(req.params.id);
        const { userId, status } = z
          .object({
            userId: z.string().trim().min(1),
            status: z.enum(COHORT_MEMBER_STATUSES).default("invited"),
          })
          .parse(req.body ?? {});

        const [existing] = await db
          .select()
          .from(cohortMembers)
          .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)));

        if (existing) {
          return res.status(409).json({ message: "They're already on this roster" });
        }

        const [created] = await db
          .insert(cohortMembers)
          .values({ cohortId, userId, status, decidedAt: new Date() })
          .returning();

        res.status(201).json(created);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        trackError("cohorts.addMember", error);
        res.status(500).json({ message: "Failed to add them" });
      }
    },
  );

  app.patch(
    "/api/admin/cohort-members/:memberId",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const input = memberPatchSchema.parse(req.body ?? {});
        const patch: Record<string, unknown> = { ...input };
        // A decision is a moment; record when it was taken.
        if (input.status && input.status !== "applied") patch.decidedAt = new Date();

        const [updated] = await db
          .update(cohortMembers)
          .set(patch)
          .where(eq(cohortMembers.id, String(req.params.memberId)))
          .returning();

        if (!updated) return res.status(404).json({ message: "Not found" });
        res.json(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        trackError("cohorts.decide", error);
        res.status(500).json({ message: "Failed to save" });
      }
    },
  );

  // ── Schedule ─────────────────────────────────────────────────────────

  app.get(
    "/api/admin/cohorts/:id/sessions",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const rows = await db
          .select()
          .from(cohortSessions)
          .where(eq(cohortSessions.cohortId, String(req.params.id)))
          .orderBy(asc(cohortSessions.orderIndex), asc(cohortSessions.startsAt));
        res.json(rows);
      } catch (error) {
        trackError("cohorts.sessions", error);
        res.status(500).json({ message: "Failed to load sessions" });
      }
    },
  );

  app.post(
    "/api/admin/cohorts/:id/sessions",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const input = sessionSchema.parse(req.body ?? {});
        const [created] = await db
          .insert(cohortSessions)
          .values({
            ...input,
            cohortId: String(req.params.id),
            startsAt: toDate(input.startsAt) ?? null,
          })
          .returning();
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        trackError("cohorts.createSession", error);
        res.status(500).json({ message: "Failed to create session" });
      }
    },
  );

  app.patch(
    "/api/admin/cohort-sessions/:sessionId",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const input = sessionSchema.partial().parse(req.body ?? {});
        const patch: Record<string, unknown> = { ...input };
        if ("startsAt" in input) patch.startsAt = toDate(input.startsAt);

        const [updated] = await db
          .update(cohortSessions)
          .set(patch)
          .where(eq(cohortSessions.id, String(req.params.sessionId)))
          .returning();

        if (!updated) return res.status(404).json({ message: "Not found" });
        res.json(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        trackError("cohorts.updateSession", error);
        res.status(500).json({ message: "Failed to save" });
      }
    },
  );

  app.delete(
    "/api/admin/cohort-sessions/:sessionId",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const deleted = await db
          .delete(cohortSessions)
          .where(eq(cohortSessions.id, String(req.params.sessionId)))
          .returning({ id: cohortSessions.id });

        if (!deleted.length) return res.status(404).json({ message: "Not found" });
        res.status(204).end();
      } catch (error) {
        trackError("cohorts.deleteSession", error);
        res.status(500).json({ message: "Failed to delete" });
      }
    },
  );

  /** Attendance: one upsert per person, so a mis-tap is corrected, not doubled. */
  app.put(
    "/api/admin/cohort-sessions/:sessionId/attendance",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const { userId, present, note } = z
          .object({
            userId: z.string().trim().min(1),
            present: z.boolean(),
            note: z.string().trim().max(1000).nullable().optional(),
          })
          .parse(req.body ?? {});

        const sessionId = String(req.params.sessionId);
        const [saved] = await db
          .insert(cohortAttendance)
          .values({ sessionId, userId, present, note: note ?? null })
          .onConflictDoUpdate({
            target: [cohortAttendance.sessionId, cohortAttendance.userId],
            set: { present, note: note ?? null, recordedAt: new Date() },
          })
          .returning();

        res.json(saved);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.errors[0].message });
        }
        trackError("cohorts.attendance", error);
        res.status(500).json({ message: "Failed to record attendance" });
      }
    },
  );

  app.get(
    "/api/admin/cohort-sessions/:sessionId/attendance",
    isAuthenticated,
    isAdmin,
    async (req: Request, res: Response) => {
      try {
        const rows = await db
          .select()
          .from(cohortAttendance)
          .where(eq(cohortAttendance.sessionId, String(req.params.sessionId)));
        res.json(rows);
      } catch (error) {
        trackError("cohorts.attendanceList", error);
        res.status(500).json({ message: "Failed to load attendance" });
      }
    },
  );

  // ══ Member-facing ═══════════════════════════════════════════════════
  // Mirrors the RLS policies in supabase/cohorts.sql: drafts are invisible,
  // everything else is announceable.

  app.get("/api/cohorts", async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(cohorts)
        .where(inArray(cohorts.status, ["open", "running", "closed"]))
        .orderBy(asc(cohorts.sortOrder), desc(cohorts.startDate));
      res.json(rows);
    } catch (error) {
      trackError("cohorts.public", error);
      res.status(500).json({ message: "Failed to load" });
    }
  });

  app.get("/api/cohorts/mine", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const rows = await db
        .select({ member: cohortMembers, cohort: cohorts })
        .from(cohortMembers)
        .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
        .where(eq(cohortMembers.userId, userId))
        .orderBy(desc(cohortMembers.appliedAt));

      res.json(rows.map((r) => ({ ...stripReviewNote(r.member), cohort: r.cohort })));
    } catch (error) {
      trackError("cohorts.mine", error);
      res.status(500).json({ message: "Failed to load" });
    }
  });

  app.post("/api/cohorts/:id/apply", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const cohortId = String(req.params.id);
      const { note } = z
        .object({ note: z.string().trim().max(4000).optional() })
        .parse(req.body ?? {});

      const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId));
      if (!cohort) return res.status(404).json({ message: "Not found" });
      if (cohort.status !== "open") {
        return res.status(409).json({ message: "Applications for this one are closed" });
      }

      const [existing] = await db
        .select()
        .from(cohortMembers)
        .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)));

      if (existing) {
        return res.status(409).json({ message: "You've already applied to this one" });
      }

      const [created] = await db
        .insert(cohortMembers)
        .values({ cohortId, userId, status: "applied", note: note ?? null })
        .returning();

      track("cohort.applied", { userId, surface: "cohorts", props: { cohortId } });
      res.status(201).json(stripReviewNote(created));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      trackError("cohorts.apply", error);
      res.status(500).json({ message: "Failed to apply" });
    }
  });
}
