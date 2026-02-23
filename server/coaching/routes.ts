/**
 * Coaching API Routes — Parts 3, 4, 6, 8
 *
 * User Endpoints:
 *   GET    /api/routines                      — List available routines
 *   GET    /api/routines/active               — Get user's active enrollment
 *   GET    /api/routines/history              — Enrollment history
 *   GET    /api/routines/:id                  — Get routine detail + habits
 *   POST   /api/routines/enroll               — Enroll in a routine
 *   POST   /api/routines/pause                — Pause active routine
 *   POST   /api/routines/abandon              — Abandon active routine
 *   GET    /api/habits/today                  — Today's habits (grouped by cadence)
 *   GET    /api/habits/date/:date             — Habits for a specific date
 *   PATCH  /api/habits/:id/toggle             — Toggle habit completion
 *   GET    /api/habits/:id/detail             — Habit detail (template data)
 *   POST   /api/habits/reconcile              — Reconcile missing habits
 *   GET    /api/habits/range                  — Completion data for date range
 *   GET    /api/coaching/stats                — User stats (coins, streaks)
 *
 * Catalog Endpoints (Part 4):
 *   GET    /api/catalog/habits                — Browse all habit templates
 *   POST   /api/catalog/assign                — Assign a standalone habit
 *   POST   /api/catalog/custom                — Create a custom habit
 *   DELETE /api/catalog/assigned/:id          — Unassign (soft-delete)
 *   GET    /api/catalog/assigned              — List user's assigned habits
 *
 * Admin Endpoints (Part 6):
 *   GET    /api/admin/routines                — List all routines
 *   POST   /api/admin/routines                — Create routine
 *   PATCH  /api/admin/routines/:id            — Update routine
 *   DELETE /api/admin/routines/:id            — Delete routine (cascade)
 *   GET    /api/admin/routines/:id/habits     — List habits for routine
 *   POST   /api/admin/habits                  — Create habit template
 *   PATCH  /api/admin/habits/:id              — Update habit template
 *   DELETE /api/admin/habits/:id              — Delete habit template
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { eq, and, desc, count, sql, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import {
  wellnessRoutines,
  routineHabits,
  habitRoutineAssignments,
  userRoutines,
  habits,
  rewards,
  userAssignedHabits,
  users,
  coachingMessages,
  insertWellnessRoutineSchema,
  insertRoutineHabitSchema,
  COINS_PER_HABIT_COMPLETION,
} from "../../shared/schema.js";
import {
  enrollInRoutine,
  reconcileHabits,
  pauseRoutine,
  abandonRoutine,
} from "./enrollment.js";
import {
  formatLocalDateString,
  parseLocalDate,
  addDays,
} from "../../shared/utils/dates.js";

// ─── Middleware ────────────────────────────────────────────────────────────

function isAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  storage
    .getUser(userId)
    .then((user) => {
      if (!user || user.isAdmin !== "true") {
        return res.status(403).json({ message: "Admin access required" });
      }
      next();
    })
    .catch(() => res.status(500).json({ message: "Internal Server Error" }));
}

/** Safely extract a string route param (Express 5 types params as string | string[]) */
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

// ─── Slug Generation ──────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 6);
}

async function uniqueSlug(name: string): Promise<string> {
  let slug = generateSlug(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db
      .select({ id: wellnessRoutines.id })
      .from(wellnessRoutines)
      .where(eq(wellnessRoutines.id, slug));
    if (!existing) return slug;
    slug = `${generateSlug(name)}_${randomSuffix()}`;
  }
  throw new Error("Could not generate unique slug after 5 attempts");
}

// ─── Input Schemas ────────────────────────────────────────────────────────

const enrollInputSchema = z.object({
  routineId: z.string().min(1, "Routine ID is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  intensity: z.enum(["lite", "intense"]).default("lite"),
});

const habitToggleSchema = z.object({
  completed: z.boolean(),
});

const assignHabitSchema = z.object({
  routineHabitId: z.string().uuid("Invalid habit template ID"),
});

const customHabitSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  cadence: z.enum(["daily", "weekly", "as-needed"]).default("daily"),
  recommendedTime: z.string().optional(),
});

// ─── Route Registration ──────────────────────────────────────────────────

export function registerCoachingRoutes(app: Express): void {
  // ═══════════════════════════════════════════════════════════════════════
  // USER ROUTES
  // ═══════════════════════════════════════════════════════════════════════

  // ── List available routines ──────────────────────────────────────────
  app.get("/api/routines", async (_req: Request, res: Response) => {
    try {
      const all = await db.select().from(wellnessRoutines).orderBy(wellnessRoutines.sortOrder);
      res.json(all);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Get active enrollment (must be before :id route) ─────────────────
  app.get("/api/routines/active", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const [active] = await db
        .select()
        .from(userRoutines)
        .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")));
      if (!active) return res.json(null);

      const [routine] = await db
        .select()
        .from(wellnessRoutines)
        .where(eq(wellnessRoutines.id, active.routineId));

      res.json({ ...active, routine });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Enrollment history ───────────────────────────────────────────────
  app.get("/api/routines/history", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const enrollments = await db
        .select()
        .from(userRoutines)
        .where(eq(userRoutines.userId, userId))
        .orderBy(desc(userRoutines.createdAt));
      res.json(enrollments);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Get routine detail ───────────────────────────────────────────────
  app.get("/api/routines/:id", async (req: Request, res: Response) => {
    try {
      const routineId = param(req, "id");
      const [routine] = await db
        .select()
        .from(wellnessRoutines)
        .where(eq(wellnessRoutines.id, routineId));
      if (!routine) return res.status(404).json({ message: "Routine not found" });

      const habitTemplates = await db
        .select()
        .from(routineHabits)
        .where(eq(routineHabits.routineId, routine.id))
        .orderBy(routineHabits.orderIndex);

      res.json({ ...routine, habits: habitTemplates });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Enroll in routine ────────────────────────────────────────────────
  app.post("/api/routines/enroll", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { routineId, startDate, intensity } = enrollInputSchema.parse(req.body);
      const result = await enrollInRoutine({ userId, routineId, startDate, intensity });

      if (result.alreadyEnrolled) {
        return res.status(200).json({
          message: "Already enrolled in this routine",
          enrollment: result.enrollment,
        });
      }

      res.status(201).json({
        message: "Enrolled successfully",
        enrollment: result.enrollment,
        habitsScheduled: result.habitsScheduled,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if (err instanceof Error && err.message.startsWith("Routine not found"))
        return res.status(404).json({ message: err.message });
      console.error("Enrollment error:", err);
      res.status(500).json({ message: "Failed to enroll in routine" });
    }
  });

  // ── Pause active routine ─────────────────────────────────────────────
  app.post("/api/routines/pause", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const result = await pauseRoutine(req.session.userId!);
      if (!result) return res.status(404).json({ message: "No active routine to pause" });
      res.json({ message: "Routine paused", enrollment: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Abandon active routine ───────────────────────────────────────────
  app.post("/api/routines/abandon", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const result = await abandonRoutine(req.session.userId!);
      if (!result) return res.status(404).json({ message: "No active routine to abandon" });
      res.json({ message: "Routine abandoned", enrollment: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Get today's habits (Part 3) ─────────────────────────────────────
  // Groups: DAILY, WEEKLY, ONE-TIME; sorted by cadence + title
  app.get("/api/habits/today", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const today = formatLocalDateString();

      const todayHabits = await db
        .select()
        .from(habits)
        .where(and(eq(habits.userId, userId), eq(habits.scheduledDate, today)));

      // Group by cadence
      const grouped = {
        daily: todayHabits.filter((h) => h.cadence === "daily").sort((a, b) => a.title.localeCompare(b.title)),
        weekly: todayHabits.filter((h) => h.cadence === "weekly").sort((a, b) => a.title.localeCompare(b.title)),
        "as-needed": todayHabits
          .filter((h) => h.cadence === "as-needed")
          .sort((a, b) => a.title.localeCompare(b.title)),
      };

      res.json({ habits: todayHabits, grouped, date: today });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Get habits for a specific date (for Journey Map day-detail) ─────
  app.get("/api/habits/date/:date", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const dateStr = param(req, "date");

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ message: "Date must be YYYY-MM-DD" });
      }

      const dayHabits = await db
        .select()
        .from(habits)
        .where(and(eq(habits.userId, userId), eq(habits.scheduledDate, dateStr)));

      res.json(dayHabits);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Toggle habit completion (Part 3) ─────────────────────────────────
  // Coins awarded on completion, NOT revoked on uncheck (permanent)
  app.patch("/api/habits/:id/toggle", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const habitId = param(req, "id");
      const { completed } = habitToggleSchema.parse(req.body);

      // Verify ownership
      const [habit] = await db
        .select()
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));

      if (!habit) return res.status(404).json({ message: "Habit not found" });

      // Update completion status
      const [updated] = await db
        .update(habits)
        .set({
          completed,
          completedAt: completed ? new Date() : null,
        })
        .where(eq(habits.id, habitId))
        .returning();

      // Coin economy: award coins on completion only (Part 3: no reversal on uncheck)
      if (completed && !habit.completed) {
        await db.insert(rewards).values({
          userId,
          amount: COINS_PER_HABIT_COMPLETION,
          reason: `Completed habit: ${habit.title}`,
          type: "earn",
        });

        await db
          .update(users)
          .set({
            sakredCoins: sql`COALESCE(${users.sakredCoins}, 0) + ${COINS_PER_HABIT_COMPLETION}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }
      // No coin reversal when unchecking — coins are permanent once earned

      // Update streak
      await updateStreak(userId);

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Habit detail view (Part 3) ───────────────────────────────────────
  // Fetches the full template for expanded habit card
  app.get("/api/habits/:id/detail", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const habitId = param(req, "id");

      const [habit] = await db
        .select()
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));

      if (!habit) return res.status(404).json({ message: "Habit not found" });

      let template = null;
      if (habit.routineHabitId) {
        const [t] = await db
          .select()
          .from(routineHabits)
          .where(eq(routineHabits.id, habit.routineHabitId));
        template = t || null;
      }

      res.json({
        habit,
        template: template
          ? {
              detailedDescription: template.detailedDescription,
              scienceExplanation: template.scienceExplanation,
              tips: template.tips,
              expectToNotice: template.expectToNotice,
              instructions: template.instructions,
              durationMinutes: template.durationMinutes,
              recommendedTime: template.recommendedTime,
            }
          : null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Reconcile missing habits ─────────────────────────────────────────
  app.post("/api/habits/reconcile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const [active] = await db
        .select()
        .from(userRoutines)
        .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")));

      if (!active) return res.json({ reconciled: false, habitsAdded: 0 });
      const result = await reconcileHabits(userId, active.id);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Completion data for date range (Part 5 Journey Map + Part 8 Analytics)
  app.get("/api/habits/range", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const startDate = (req.query.start as string) || formatLocalDateString(addDays(new Date(), -13));
      const endDate = (req.query.end as string) || formatLocalDateString();

      const rangeData = await db
        .select({
          scheduledDate: habits.scheduledDate,
          total: count(),
          completed: sql<number>`SUM(CASE WHEN ${habits.completed} THEN 1 ELSE 0 END)`,
        })
        .from(habits)
        .where(
          and(
            eq(habits.userId, userId),
            gte(habits.scheduledDate, startDate),
            lte(habits.scheduledDate, endDate)
          )
        )
        .groupBy(habits.scheduledDate)
        .orderBy(habits.scheduledDate);

      res.json(rangeData);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Coaching stats ───────────────────────────────────────────────────
  app.get("/api/coaching/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const [activeEnrollment] = await db
        .select()
        .from(userRoutines)
        .where(and(eq(userRoutines.userId, userId), eq(userRoutines.status, "active")));

      const [completedStats] = await db
        .select({ total: count() })
        .from(habits)
        .where(and(eq(habits.userId, userId), eq(habits.completed, true)));

      const [scheduledStats] = await db
        .select({ total: count() })
        .from(habits)
        .where(eq(habits.userId, userId));

      res.json({
        sakredCoins: user.sakredCoins ?? 0,
        currentStreak: user.currentStreak ?? 0,
        longestStreak: user.longestStreak ?? 0,
        activeRoutineId: user.activeRoutineId,
        routineIntensity: user.routineIntensity ?? "lite",
        membershipTier: user.membershipTier ?? "free",
        totalCompleted: Number(completedStats.total),
        totalScheduled: Number(scheduledStats.total),
        completionRate:
          Number(scheduledStats.total) > 0
            ? Math.round((Number(completedStats.total) / Number(scheduledStats.total)) * 100)
            : 0,
        activeEnrollment: activeEnrollment || null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CATALOG ROUTES (Part 4 — Standalone Habit Assignment)
  // ═══════════════════════════════════════════════════════════════════════

  // ── Browse all habit templates (with dedup by title) ─────────────────
  app.get("/api/catalog/habits", async (_req: Request, res: Response) => {
    try {
      const allHabits = await db
        .select({
          habit: routineHabits,
          routineName: wellnessRoutines.name,
        })
        .from(routineHabits)
        .leftJoin(wellnessRoutines, eq(routineHabits.routineId, wellnessRoutines.id));

      // Deduplicate by title — merge routine names into array
      const deduped = new Map<
        string,
        {
          habit: typeof allHabits[0]["habit"];
          routineNames: string[];
        }
      >();

      for (const row of allHabits) {
        const key = row.habit.title.toLowerCase().trim();
        if (deduped.has(key)) {
          if (row.routineName) {
            deduped.get(key)!.routineNames.push(row.routineName);
          }
        } else {
          deduped.set(key, {
            habit: row.habit,
            routineNames: row.routineName ? [row.routineName] : [],
          });
        }
      }

      const catalog = Array.from(deduped.values()).map((item) => ({
        ...item.habit,
        routineNames: Array.from(new Set(item.routineNames)),
      }));

      res.json(catalog);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── User's assigned habits ───────────────────────────────────────────
  app.get("/api/catalog/assigned", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const assigned = await db
        .select()
        .from(userAssignedHabits)
        .where(and(eq(userAssignedHabits.userId, userId), eq(userAssignedHabits.isActive, true)));
      res.json(assigned);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Assign a standalone habit ────────────────────────────────────────
  app.post("/api/catalog/assign", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { routineHabitId } = assignHabitSchema.parse(req.body);

      const [template] = await db
        .select()
        .from(routineHabits)
        .where(eq(routineHabits.id, routineHabitId));
      if (!template) return res.status(404).json({ message: "Habit template not found" });

      // Upsert — reactivate if previously soft-deleted
      const [existing] = await db
        .select()
        .from(userAssignedHabits)
        .where(
          and(
            eq(userAssignedHabits.userId, userId),
            eq(userAssignedHabits.routineHabitId, routineHabitId)
          )
        );

      let assignment;
      if (existing) {
        const [updated] = await db
          .update(userAssignedHabits)
          .set({ isActive: true })
          .where(eq(userAssignedHabits.id, existing.id))
          .returning();
        assignment = updated;
      } else {
        const [created] = await db
          .insert(userAssignedHabits)
          .values({
            userId,
            routineHabitId,
            title: template.title,
            description: template.shortDescription || template.description,
            cadence: template.cadence,
            recommendedTime: template.recommendedTime,
            isCustom: false,
          })
          .returning();
        assignment = created;
      }

      // Pre-schedule habit rows
      const today = new Date();
      const habitRows = buildStandaloneHabitRows(userId, template, today);
      if (habitRows.length > 0) {
        await db.insert(habits).values(habitRows);
      }

      res.status(201).json({ assignment, habitsScheduled: habitRows.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Create custom habit ──────────────────────────────────────────────
  app.post("/api/catalog/custom", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const input = customHabitSchema.parse(req.body);

      const [assignment] = await db
        .insert(userAssignedHabits)
        .values({
          userId,
          title: input.title,
          description: input.description || null,
          cadence: input.cadence,
          recommendedTime: input.recommendedTime || null,
          isCustom: true,
        })
        .returning();

      const today = new Date();
      const habitRows = buildCustomHabitRows(userId, input, today);
      if (habitRows.length > 0) {
        await db.insert(habits).values(habitRows);
      }

      res.status(201).json({ assignment, habitsScheduled: habitRows.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Unassign (soft-delete) ───────────────────────────────────────────
  app.delete("/api/catalog/assigned/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const assignedId = param(req, "id");

      const [updated] = await db
        .update(userAssignedHabits)
        .set({ isActive: false })
        .where(
          and(eq(userAssignedHabits.id, assignedId), eq(userAssignedHabits.userId, userId))
        )
        .returning();

      if (!updated) return res.status(404).json({ message: "Assignment not found" });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN ROUTES (Part 6)
  // ═══════════════════════════════════════════════════════════════════════

  // ── List all routines ────────────────────────────────────────────────
  app.get("/api/admin/routines", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    try {
      const all = await db.select().from(wellnessRoutines).orderBy(wellnessRoutines.sortOrder);
      res.json(all);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Create routine ───────────────────────────────────────────────────
  app.post("/api/admin/routines", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const slug = await uniqueSlug(body.name || "routine");
      const input = insertWellnessRoutineSchema.parse({ ...body, id: slug });
      const [created] = await db.insert(wellnessRoutines).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Update routine ───────────────────────────────────────────────────
  app.patch("/api/admin/routines/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const routineId = param(req, "id");
      const input = insertWellnessRoutineSchema.partial().parse(req.body);
      const { id: _id, ...updateData } = input;

      const [updated] = await db
        .update(wellnessRoutines)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(wellnessRoutines.id, routineId))
        .returning();

      if (!updated) return res.status(404).json({ message: "Routine not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Delete routine (cascade) ─────────────────────────────────────────
  app.delete("/api/admin/routines/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const routineId = param(req, "id");
      await db.delete(habitRoutineAssignments).where(eq(habitRoutineAssignments.routineId, routineId));
      await db.delete(routineHabits).where(eq(routineHabits.routineId, routineId));
      await db.delete(wellnessRoutines).where(eq(wellnessRoutines.id, routineId));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── List habits for routine (merged FK + junction) ───────────────────
  app.get("/api/admin/routines/:id/habits", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const routineId = param(req, "id");

      // Direct FK habits
      const directHabits = await db
        .select()
        .from(routineHabits)
        .where(eq(routineHabits.routineId, routineId));

      // Junction-table habits
      const junctionRows = await db
        .select({ habitId: habitRoutineAssignments.habitId })
        .from(habitRoutineAssignments)
        .where(eq(habitRoutineAssignments.routineId, routineId));

      let junctionHabits: (typeof directHabits)[number][] = [];
      if (junctionRows.length > 0) {
        const results = await Promise.all(
          junctionRows.map((r) =>
            db.select().from(routineHabits).where(eq(routineHabits.id, r.habitId))
          )
        );
        junctionHabits = results.flat();
      }

      // Merge + deduplicate
      const merged = new Map<string, (typeof directHabits)[number]>();
      for (const h of [...directHabits, ...junctionHabits]) merged.set(h.id, h);

      const allHabits = Array.from(merged.values()).sort((a, b) => a.orderIndex - b.orderIndex);
      res.json(allHabits);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Create habit template ────────────────────────────────────────────
  app.post("/api/admin/habits", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const input = insertRoutineHabitSchema.parse(req.body);
      const [created] = await db.insert(routineHabits).values(input).returning();

      // Multi-routine assignment via junction table
      const routineIds: string[] = req.body.routineIds || [];
      if (routineIds.length > 0) {
        await db.insert(habitRoutineAssignments).values(
          routineIds.map((rid: string) => ({ habitId: created.id, routineId: rid }))
        );
      }

      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Update habit template ────────────────────────────────────────────
  app.patch("/api/admin/habits/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const habitId = param(req, "id");
      const input = insertRoutineHabitSchema.partial().parse(req.body);

      const [updated] = await db
        .update(routineHabits)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(routineHabits.id, habitId))
        .returning();

      if (!updated) return res.status(404).json({ message: "Habit not found" });

      // Re-sync junction table if routineIds provided
      const routineIds: string[] | undefined = req.body.routineIds;
      if (routineIds !== undefined) {
        await db.delete(habitRoutineAssignments).where(eq(habitRoutineAssignments.habitId, habitId));
        if (routineIds.length > 0) {
          await db.insert(habitRoutineAssignments).values(
            routineIds.map((rid: string) => ({ habitId, routineId: rid }))
          );
        }
      }

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Delete habit template ────────────────────────────────────────────
  app.delete("/api/admin/habits/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const habitId = param(req, "id");
      await db.delete(habitRoutineAssignments).where(eq(habitRoutineAssignments.habitId, habitId));
      await db.delete(routineHabits).where(eq(routineHabits.id, habitId));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // COACHING MESSAGES (member ↔ coach)
  // ═══════════════════════════════════════════════════════════════════════

  // ── Get my messages ──────────────────────────────────────────────────
  app.get("/api/coaching/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const messages = await db
        .select()
        .from(coachingMessages)
        .where(eq(coachingMessages.userId, userId))
        .orderBy(coachingMessages.createdAt);
      res.json(messages);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Send a message ───────────────────────────────────────────────────
  app.post("/api/coaching/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const { content, messageType, imageUrl, metadata } = z.object({
        content: z.string().min(1).max(5000),
        messageType: z.enum(["text", "progress_update", "photo"]).default("text"),
        imageUrl: z.string().optional(),
        metadata: z.string().optional(),
      }).parse(req.body);

      const [msg] = await db.insert(coachingMessages).values({
        userId,
        senderRole: "member",
        messageType,
        content,
        imageUrl: imageUrl || null,
        metadata: metadata || null,
      }).returning();

      res.status(201).json(msg);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Admin: get all conversations (grouped by user) ───────────────────
  app.get("/api/admin/coaching/messages", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    try {
      const messages = await db
        .select()
        .from(coachingMessages)
        .orderBy(desc(coachingMessages.createdAt));

      // Group by userId + include user info
      const userIds = Array.from(new Set(messages.map((m) => m.userId)));
      const usersData = await Promise.all(
        userIds.map((uid) =>
          db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users).where(eq(users.id, uid)).then((rows) => rows[0])
        )
      );
      const userMap: Record<string, { firstName?: string | null; lastName?: string | null; email?: string | null }> = {};
      usersData.forEach((u) => { if (u) userMap[u.id] = u; });

      const threads = userIds.map((uid) => {
        const userMessages = messages.filter((m) => m.userId === uid);
        const sorted = userMessages.sort((a, b) =>
          new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
        );
        const last = sorted[sorted.length - 1];
        return {
          userId: uid,
          userName: [userMap[uid]?.firstName, userMap[uid]?.lastName].filter(Boolean).join(" ") || userMap[uid]?.email || uid,
          userEmail: userMap[uid]?.email || null,
          lastMessage: last?.content || "",
          lastMessageAt: last?.createdAt?.toISOString?.() ?? last?.createdAt ?? null,
          totalMessages: userMessages.length,
          unreadCount: userMessages.filter((m) => m.senderRole === "member" && !m.readAt).length,
        };
      });

      res.json(threads);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Admin: get messages for a specific user ──────────────────────────
  app.get("/api/admin/coaching/messages/:userId", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = param(req, "userId");
      const messages = await db
        .select()
        .from(coachingMessages)
        .where(eq(coachingMessages.userId, userId))
        .orderBy(coachingMessages.createdAt);
      res.json(messages);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Admin: reply to a user ───────────────────────────────────────────
  app.post("/api/admin/coaching/messages/:userId", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = param(req, "userId");
      const { content } = z.object({
        content: z.string().min(1).max(5000),
      }).parse(req.body);

      const [msg] = await db.insert(coachingMessages).values({
        userId,
        senderRole: "coach",
        messageType: "text",
        content,
      }).returning();

      res.status(201).json(msg);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Admin: mark messages as read ─────────────────────────────────────
  app.patch("/api/admin/coaching/messages/:userId/read", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = param(req, "userId");
      await db
        .update(coachingMessages)
        .set({ readAt: new Date() })
        .where(and(
          eq(coachingMessages.userId, userId),
          eq(coachingMessages.senderRole, "member"),
          sql`${coachingMessages.readAt} IS NULL`
        ));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });
}

// ─── Standalone Habit Row Builders (Part 4) ─────────────────────────────

function buildStandaloneHabitRows(
  userId: string,
  template: { id: string; title: string; shortDescription: string | null; description: string | null; cadence: string },
  startDate: Date
) {
  const rows: Array<{
    userId: string;
    userRoutineId: null;
    routineHabitId: string;
    title: string;
    description: string | null;
    cadence: string;
    completed: boolean;
    scheduledDate: string;
    dayNumber: number;
    isFromRoutine: boolean;
  }> = [];

  const desc = template.shortDescription || template.description;

  if (template.cadence === "daily") {
    for (let i = 0; i < 30; i++) {
      rows.push({
        userId,
        userRoutineId: null,
        routineHabitId: template.id,
        title: template.title,
        description: desc,
        cadence: "daily",
        completed: false,
        scheduledDate: formatLocalDateString(addDays(startDate, i)),
        dayNumber: i + 1,
        isFromRoutine: false,
      });
    }
  } else if (template.cadence === "weekly") {
    for (let i = 0; i < 4; i++) {
      rows.push({
        userId,
        userRoutineId: null,
        routineHabitId: template.id,
        title: template.title,
        description: desc,
        cadence: "weekly",
        completed: false,
        scheduledDate: formatLocalDateString(addDays(startDate, i * 7)),
        dayNumber: i * 7 + 1,
        isFromRoutine: false,
      });
    }
  } else {
    rows.push({
      userId,
      userRoutineId: null,
      routineHabitId: template.id,
      title: template.title,
      description: desc,
      cadence: "as-needed",
      completed: false,
      scheduledDate: formatLocalDateString(startDate),
      dayNumber: 1,
      isFromRoutine: false,
    });
  }

  return rows;
}

function buildCustomHabitRows(
  userId: string,
  input: { title: string; description?: string; cadence: string },
  startDate: Date
) {
  const rows: Array<{
    userId: string;
    userRoutineId: null;
    routineHabitId: null;
    title: string;
    description: string | null;
    cadence: string;
    completed: boolean;
    scheduledDate: string;
    dayNumber: number;
    isFromRoutine: boolean;
  }> = [];

  if (input.cadence === "daily") {
    for (let i = 0; i < 30; i++) {
      rows.push({
        userId,
        userRoutineId: null,
        routineHabitId: null,
        title: input.title,
        description: input.description || null,
        cadence: "daily",
        completed: false,
        scheduledDate: formatLocalDateString(addDays(startDate, i)),
        dayNumber: i + 1,
        isFromRoutine: false,
      });
    }
  } else if (input.cadence === "weekly") {
    for (let i = 0; i < 4; i++) {
      rows.push({
        userId,
        userRoutineId: null,
        routineHabitId: null,
        title: input.title,
        description: input.description || null,
        cadence: "weekly",
        completed: false,
        scheduledDate: formatLocalDateString(addDays(startDate, i * 7)),
        dayNumber: i * 7 + 1,
        isFromRoutine: false,
      });
    }
  } else {
    rows.push({
      userId,
      userRoutineId: null,
      routineHabitId: null,
      title: input.title,
      description: input.description || null,
      cadence: "as-needed",
      completed: false,
      scheduledDate: formatLocalDateString(startDate),
      dayNumber: 1,
      isFromRoutine: false,
    });
  }

  return rows;
}

// ─── Streak Calculator ──────────────────────────────────────────────────

async function updateStreak(userId: string): Promise<void> {
  const completedDates = await db
    .selectDistinct({ date: habits.scheduledDate })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.completed, true)))
    .orderBy(desc(habits.scheduledDate));

  if (completedDates.length === 0) {
    await db
      .update(users)
      .set({ currentStreak: 0, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return;
  }

  // Use local date handling (Part 9)
  const today = parseLocalDate(formatLocalDateString());
  const yesterday = addDays(today, -1);

  let streak = 0;
  let expectedDate = today;

  for (const row of completedDates) {
    const rowDate = parseLocalDate(row.date);

    if (streak === 0) {
      if (rowDate.getTime() === today.getTime() || rowDate.getTime() === yesterday.getTime()) {
        streak = 1;
        expectedDate = addDays(rowDate, -1);
      } else {
        break;
      }
    } else {
      if (rowDate.getTime() === expectedDate.getTime()) {
        streak++;
        expectedDate = addDays(expectedDate, -1);
      } else {
        break;
      }
    }
  }

  const user = await storage.getUser(userId);
  const longestStreak = Math.max(user?.longestStreak ?? 0, streak);

  await db
    .update(users)
    .set({ currentStreak: streak, longestStreak, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
