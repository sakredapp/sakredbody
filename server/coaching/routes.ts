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
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { db } from "../db.js";
import { eq, and, desc, count, sql, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { track, trackError } from "../telemetry/index.js";
import { awardWins } from "../wins/index.js";
import {
  wellnessRoutines,
  routineHabits,
  habitRoutineAssignments,
  userRoutines,
  habits,
  rewards,
  userAssignedHabits,
  userRemovedHabits,
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
  resumeRoutine,
  abandonRoutine,
  removeHabitSeries,
  restoreHabitSeries,
  settleRoutines,
  getActiveEnrollment,
  memberToday,
} from "./enrollment.js";
import {
  formatLocalDateString,
  parseLocalDate,
  addDays,
  addDaysToString,
  isValidTimeZone,
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

/**
 * Starting a protocol.
 *
 * `startDate` is optional and defaults to the member's own today — which is
 * what somebody pressing "start" almost always means. It was required, and a
 * caller who omitted it got a 400 reading only "Required", with no field name
 * and no hint that today was an option. That is a bad answer to the most
 * common request the endpoint receives.
 *
 * It stays settable because a coach scheduling a cleanse to begin on a Monday
 * is a real thing.
 */
const enrollInputSchema = z.object({
  // `required_error`, not `.min()` — .min only fires once a string is
  // present, so its message never appears for a field that was omitted.
  routineId: z
    .string({ required_error: "Which protocol? routineId is required." })
    .min(1, "Which protocol? routineId is required."),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD")
    .optional(),
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

  // ── Record the member's timezone ─────────────────────────────────────
  // Everything in this engine is scheduled by calendar date, and the server
  // has no other way to know when a member's day starts. The client posts its
  // IANA zone on load; until it does, the member is treated as UTC.
  app.put("/api/coaching/timezone", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { timezone } = z.object({ timezone: z.string().min(1).max(64) }).parse(req.body);

      if (!isValidTimeZone(timezone)) {
        return res.status(400).json({ message: "Unrecognised timezone" });
      }

      const userId = req.session.userId!;
      const [updated] = await db
        .update(users)
        .set({ timezone, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ timezone: users.timezone });

      // A member whose zone just moved may have crossed a day boundary.
      await settleRoutines(userId);

      res.json({ timezone: updated?.timezone ?? timezone });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

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
      // Settle first: a routine whose start date arrived, or whose end date
      // passed, must move before anyone reads its status.
      await settleRoutines(userId);

      const active = await getActiveEnrollment(userId);
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
      // The member's today, not the server's. On Vercel the process runs in
      // UTC, so defaulting to the server date would start somebody in Los
      // Angeles a day early from 5pm onward.
      const begins = startDate ?? (await memberToday(userId));
      const result = await enrollInRoutine({ userId, routineId, startDate: begins, intensity });

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
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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

  // ── Resume a paused routine ──────────────────────────────────────────
  // Pause used to be a one-way door: no resume endpoint existed, and
  // re-enrolling hit the idempotency key and returned "already enrolled" with
  // no habits. The days spent paused are given back, not lost.
  app.post("/api/routines/resume", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { enrollmentId } = z
        .object({ enrollmentId: z.string().uuid().optional() })
        .parse(req.body ?? {});

      const result = await resumeRoutine(req.session.userId!, enrollmentId);
      if (!result) return res.status(404).json({ message: "No paused routine to resume" });

      res.json({
        message: "Routine resumed",
        enrollment: result.enrollment,
        habitsScheduled: result.habitsScheduled,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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
      // The member's today, not the server's. On Vercel the process runs in
      // UTC, so a member in Los Angeles would be served tomorrow's habits from
      // 5pm onward — and tick off rows belonging to a day that hasn't started.
      const today = await memberToday(userId);
      await settleRoutines(userId, today);

      // Joined to the template for `recommendedTime` and `durationMinutes`.
      //
      // Those live on routine_habits, not on the materialised row — the daily
      // row deliberately carries only what changes per day, so a template edit
      // doesn't require rewriting every future day. But the day can't be laid
      // out as a rhythm without knowing whether something belongs to the
      // morning or the evening, so the read joins them back.
      //
      // LEFT join, not inner: routineHabitId is null for a custom habit
      // somebody added themselves, and an inner join would silently drop every
      // one of those from their own day.
      const rows = await db
        .select({
          habit: habits,
          recommendedTime: routineHabits.recommendedTime,
          durationMinutes: routineHabits.durationMinutes,
          icon: routineHabits.icon,
          // Which half of the day this belongs to — Restore or Build. Comes
          // from the template, so a habit somebody wrote themselves has none,
          // which is the honest answer rather than a guessed one.
          emphasis: routineHabits.emphasis,
        })
        .from(habits)
        .leftJoin(routineHabits, eq(habits.routineHabitId, routineHabits.id))
        .where(and(eq(habits.userId, userId), eq(habits.scheduledDate, today)));

      const todayHabits = rows.map((r) => ({
        ...r.habit,
        recommendedTime: r.recommendedTime,
        durationMinutes: r.durationMinutes,
        icon: r.icon,
        emphasis: r.emphasis,
      }));

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

      // Coin economy: a habit pays exactly once, ever.
      //
      // `!habit.completed` alone is not enough — uncheck then recheck makes it
      // false again and pays a second time. The ledger's partial unique index
      // on (user_id, habit_id) WHERE type = 'earn' is the real guard, and the
      // balance only moves when a ledger row was genuinely inserted.
      if (completed && !habit.completed) {
        const awarded = await db
          .insert(rewards)
          .values({
            userId,
            habitId,
            amount: COINS_PER_HABIT_COMPLETION,
            reason: `Completed habit: ${habit.title}`,
            type: "earn",
          })
          .onConflictDoNothing()
          .returning({ id: rewards.id });

        if (awarded.length > 0) {
          await db
            .update(users)
            .set({
              sakredCoins: sql`COALESCE(${users.sakredCoins}, 0) + ${COINS_PER_HABIT_COMPLETION}`,
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));
        }
      }
      // No coin reversal when unchecking — coins are permanent once earned

      // Update streak
      await updateStreak(userId);

      // Anything just earned. Safe to call on every toggle — every award is
      // ON CONFLICT DO NOTHING against uq_wins, so this is a no-op on the
      // days nothing was crossed.
      const earned = await awardWins(userId);

      // The core engagement metric. Recorded server-side, at the point the row
      // actually changed, because that is the only place that can't lie.
      track(completed ? "habit.complete" : "habit.uncomplete", {
        userId,
        surface: "today",
        subjectId: habitId,
        onDate: habit.scheduledDate ?? undefined,
        props: {
          title: habit.title,
          routineHabitId: habit.routineHabitId,
          userRoutineId: habit.userRoutineId,
          dayNumber: habit.dayNumber,
          fromRoutine: habit.isFromRoutine,
        },
      });

      // Returned alongside so the client can celebrate without a second
      // round trip on the one interaction that happens most.
      res.json({ ...updated, earnedWins: earned });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
      trackError("habit.toggle", err, { userId: req.session.userId });
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Remove a habit from every remaining day ──────────────────────────
  // Deleting one day's row is pointless — the habit is back tomorrow. This
  // clears the series from today forward and writes a tombstone so a resume
  // or re-enrol doesn't bring it straight back. History is untouched.
  app.delete("/api/habits/series", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const input = z
        .object({
          routineHabitId: z.string().uuid().nullable().optional(),
          title: z.string().min(1).nullable().optional(),
          userRoutineId: z.string().uuid().nullable().optional(),
        })
        .refine((v) => v.routineHabitId || v.title, {
          message: "Need a habit template or a title",
        })
        .parse(req.body ?? {});

      const result = await removeHabitSeries(req.session.userId!, input);

      track("habit.remove", {
        userId: req.session.userId!,
        surface: "habits",
        subjectId: input.routineHabitId ?? input.title ?? undefined,
        props: { ...input, removed: result },
      });

      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Put a removed habit back ─────────────────────────────────────────
  app.post("/api/habits/series/restore", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const input = z
        .object({
          routineHabitId: z.string().uuid().nullable().optional(),
          title: z.string().min(1).nullable().optional(),
        })
        .refine((v) => v.routineHabitId || v.title, {
          message: "Need a habit template or a title",
        })
        .parse(req.body ?? {});

      const result = await restoreHabitSeries(req.session.userId!, input);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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
      await settleRoutines(userId);
      const active = await getActiveEnrollment(userId);

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
      const memberNow = await memberToday(userId);
      const startDate = (req.query.start as string) || addDaysToString(memberNow, -13);
      const endDate = (req.query.end as string) || memberNow;

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

      await settleRoutines(userId);
      const activeEnrollment = await getActiveEnrollment(userId);

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

      // Adding a habit back means the member wants it — clear any tombstone,
      // or fetchFilteredHabits will keep filtering it out of every routine.
      await db
        .delete(userRemovedHabits)
        .where(
          and(
            eq(userRemovedHabits.userId, userId),
            eq(userRemovedHabits.routineHabitId, routineHabitId)
          )
        );

      // Pre-schedule habit rows. ON CONFLICT because a habit is unique per
      // (user, template, date), and re-assigning after unassigning would
      // otherwise collide with rows an active routine already owns — this
      // template can legitimately be in both places at once.
      const today = parseLocalDate(await memberToday(userId));
      const habitRows = buildStandaloneHabitRows(userId, template, today);
      let scheduled = 0;
      if (habitRows.length > 0) {
        const inserted = await db
          .insert(habits)
          .values(habitRows)
          .onConflictDoNothing()
          .returning({ id: habits.id });
        scheduled = inserted.length;
      }

      res.status(201).json({ assignment, habitsScheduled: scheduled });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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

      await db
        .delete(userRemovedHabits)
        .where(and(eq(userRemovedHabits.userId, userId), eq(userRemovedHabits.title, input.title)));

      const today = parseLocalDate(await memberToday(userId));
      const habitRows = buildCustomHabitRows(userId, input, today);
      let scheduled = 0;
      if (habitRows.length > 0) {
        const inserted = await db
          .insert(habits)
          .values(habitRows)
          .onConflictDoNothing()
          .returning({ id: habits.id });
        scheduled = inserted.length;
      }

      res.status(201).json({ assignment, habitsScheduled: scheduled });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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

      // Soft-deleting the assignment alone left all 30 materialised days in
      // place, so the habit the member just removed kept appearing daily.
      const { removed } = await removeHabitSeries(userId, {
        routineHabitId: updated.routineHabitId,
        title: updated.title,
      });

      res.json({ success: true, removed });
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
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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
      if (err instanceof z.ZodError) return res.status(400).json({ message: zodMessage(err) });
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
  // ── The member's conversation ────────────────────────────────────────
  //
  // GET/POST /api/coaching/messages and the upload endpoint moved to
  // ./messageRoutes.ts, where every path through a conversation — reading,
  // sending, uploading, retrieving a file, marking read — passes one gate.
  //
  // They were three different rules living in three places: the thread read was
  // session-scoped, the send trusted a client-supplied `imageUrl` pointing
  // anywhere on the internet, and the upload was `isAuthenticated` alone. Two
  // handlers on one path is a bug Express reports by silently running the first,
  // so they are removed here rather than left as a fallback.

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
        // The actual author, so a reassignment leaves "Nick wrote this" and
        // "Gerard wrote this" intact rather than collapsing both to "a coach".
        senderUserId: req.session!.userId!,
        messageType: "text",
        content,
      }).returning();

      res.status(201).json(msg);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err) });
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

  // ── Uploads ──────────────────────────────────────────────────────────
  //
  // POST /api/coaching/upload is gone. It was `isAuthenticated` and nothing
  // else — any account could put a file in the bucket — and it answered with a
  // permanent Supabase *public* URL, so a member's progress photo or lab result
  // stayed retrievable forever by anyone holding the link.
  //
  // ./messageRoutes.ts stages files against a named conversation, into a
  // private bucket, and hands back an id. See ./attachmentStore.ts for why the
  // private bucket is a second one rather than the old bucket flipped: profile
  // photos and community voice memos share that bucket and are meant to be
  // fetchable.

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN: MEMBER COACHING SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════════

  // ── Get a member's current coaching status (for admin to view) ───────
  app.get("/api/admin/coaching/member/:userId/snapshot", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = param(req, "userId");

      // User info
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Active enrollment
      await settleRoutines(userId);
      const activeEnrollment = await getActiveEnrollment(userId);

      // Routine name if enrolled
      let routineName: string | null = null;
      if (activeEnrollment) {
        const [routine] = await db
          .select({ name: wellnessRoutines.name })
          .from(wellnessRoutines)
          .where(eq(wellnessRoutines.id, activeEnrollment.routineId));
        routineName = routine?.name || null;
      }

      // Today's habits, in the member's zone rather than the server's.
      const today = await memberToday(userId);
      const todayHabits = await db
        .select()
        .from(habits)
        .where(and(eq(habits.userId, userId), eq(habits.scheduledDate, today)));
      const completedToday = todayHabits.filter((h) => h.completed).length;

      // Overall stats
      const [completedStats] = await db
        .select({ total: count() })
        .from(habits)
        .where(and(eq(habits.userId, userId), eq(habits.completed, true)));

      const [scheduledStats] = await db
        .select({ total: count() })
        .from(habits)
        .where(eq(habits.userId, userId));

      res.json({
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
        activeRoutine: activeEnrollment ? (() => {
          const start = new Date(activeEnrollment.startDate);
          const end = new Date(activeEnrollment.endDate);
          const now = new Date();
          const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
          const currentDay = Math.min(totalDays, Math.max(1, Math.round((now.getTime() - start.getTime()) / 86400000) + 1));
          return {
            routineName,
            intensity: activeEnrollment.intensity,
            startedAt: activeEnrollment.startDate,
            currentDay,
            totalDays,
          };
        })() : null,
        today: {
          date: today,
          totalHabits: todayHabits.length,
          completed: completedToday,
          habits: todayHabits.map((h) => ({
            title: h.title,
            completed: h.completed,
            cadence: h.cadence,
          })),
        },
        stats: {
          currentStreak: user.currentStreak ?? 0,
          longestStreak: user.longestStreak ?? 0,
          totalCompleted: Number(completedStats.total),
          totalScheduled: Number(scheduledStats.total),
          completionRate: Number(scheduledStats.total) > 0
            ? Math.round((Number(completedStats.total) / Number(scheduledStats.total)) * 100)
            : 0,
        },
      });
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

async function updateStreak(userId: string, today?: string): Promise<void> {
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

  // The member's day boundary, not the process's — a streak computed against
  // UTC breaks for anyone west of it every evening.
  const todayStr = today ?? (await memberToday(userId));
  const todayDate = parseLocalDate(todayStr);
  const yesterday = addDays(todayDate, -1);

  let streak = 0;
  let expectedDate = todayDate;

  for (const row of completedDates) {
    const rowDate = parseLocalDate(row.date);

    if (streak === 0) {
      if (rowDate.getTime() === todayDate.getTime() || rowDate.getTime() === yesterday.getTime()) {
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
