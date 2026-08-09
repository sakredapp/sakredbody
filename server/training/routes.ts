/**
 * Training — API
 *
 * Member:
 *   GET    /api/training/exercises              — the catalogue, searchable
 *   GET    /api/training/today                  — today's prescribed lifts
 *   POST   /api/training/sessions               — begin one
 *   POST   /api/training/sessions/:id/sets      — record a set
 *   DELETE /api/training/sets/:id               — undo one
 *   POST   /api/training/sessions/:id/finish    — done
 *   GET    /api/training/sessions               — history
 *   GET    /api/training/exercises/:id/history  — a lift over time
 *   GET    /api/training/bodyweight             — the log
 *   POST   /api/training/bodyweight             — add to it
 *   PATCH  /api/training/preferences            — kg or lb
 *
 * Admin:
 *   GET/POST/PUT  /api/admin/exercises
 *   GET/POST      /api/admin/habits/:habitId/exercises
 *   DELETE        /api/admin/habit-exercises/:id
 *
 * ── Units are converted at the edges and nowhere else ─────────────────────
 *
 * Everything in the database is kilograms. Every request body arrives in the
 * member's unit and every response leaves in it, and the conversion happens in
 * exactly two places in this file. The alternative — passing units around and
 * converting where convenient — is how a 90 ends up in a column with nobody
 * able to say whether it was kilos or pounds.
 */

import type { Express, Request, Response } from "express";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { db } from "../db.js";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import {
  exercises,
  habitExercises,
  bodyMeasurements,
  workoutSessions,
  workoutSets,
  habits,
  routineHabits,
  users,
  insertExerciseSchema,
  prescribeExerciseSchema,
  prescribeExercisePatchSchema,
  logSetSchema,
  bodyMeasurementSchema,
  weightUnitEnum,
  lbToKg,
  displayWeight,
  type WeightUnit,
} from "../../shared/schema.js";
import {
  bestEstimates,
  progressionSeries,
  prescribedWeightKg,
  relativeStrength,
  REFERENCE_WINDOW_DAYS,
  type SetRow,
} from "./strength.js";
import { memberToday } from "../coaching/enrollment.js";
import { track, trackError } from "../telemetry/index.js";

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: zodMessage(err) });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

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

/** The member's chosen unit. Falls back to lb rather than throwing. */
async function unitFor(userId: string): Promise<WeightUnit> {
  const [row] = await db
    .select({ unit: users.weightUnit })
    .from(users)
    .where(eq(users.id, userId));
  return row?.unit === "kg" ? "kg" : "lb";
}

/** Every weight leaving this module goes through here. */
function out(kg: number | null | undefined, unit: WeightUnit): number | null {
  if (kg == null) return null;
  return displayWeight(kg, unit);
}

/** Every weight entering it goes through here. */
function inKg(weight: number, unit: WeightUnit): number {
  return unit === "kg" ? weight : lbToKg(weight);
}

/**
 * A member's sets, joined to what is needed to score them.
 *
 * `bodyweightFactor` comes from the exercise and the date from the session,
 * because a set on its own cannot be scored: a pull-up's load depends on what
 * the member weighed that day.
 */
async function setRowsFor(userId: string, exerciseId?: string): Promise<SetRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - REFERENCE_WINDOW_DAYS);
  const sinceStr = since.toISOString().slice(0, 10);

  const filters = [eq(workoutSessions.userId, userId), gte(workoutSessions.onDate, sinceStr)];
  if (exerciseId) filters.push(eq(workoutSets.exerciseId, exerciseId));

  const rows = await db
    .select({
      exerciseId: workoutSets.exerciseId,
      reps: workoutSets.reps,
      weightKg: workoutSets.weightKg,
      isWarmup: workoutSets.isWarmup,
      onDate: workoutSessions.onDate,
      bodyweightFactor: exercises.bodyweightFactor,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .where(and(...filters));

  return rows as SetRow[];
}

/**
 * Bodyweight lookup by date.
 *
 * Uses the most recent reading *at or before* the date asked for, so a lift
 * from March is scored against March's bodyweight rather than today's. Falls
 * back to the earliest known reading when a lift predates any weigh-in, which
 * is wrong but far less wrong than treating the member as weightless.
 */
async function bodyweightLookup(userId: string) {
  const rows = await db
    .select({ onDate: bodyMeasurements.onDate, weightKg: bodyMeasurements.weightKg })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.userId, userId))
    .orderBy(asc(bodyMeasurements.onDate));

  const known = rows.filter((r) => r.weightKg != null) as { onDate: string; weightKg: number }[];

  return (onDate: string): number | null => {
    if (known.length === 0) return null;
    let best: number | null = null;
    for (const r of known) {
      if (r.onDate <= onDate) best = r.weightKg;
      else break;
    }
    return best ?? known[0].weightKg;
  };
}

export function registerTrainingRoutes(app: Express) {
  // ─── Catalogue ───────────────────────────────────────────────────────────

  app.get("/api/training/exercises", isAuthenticated, async (req, res) => {
    try {
      const q = String((req.query.q as string) ?? "").trim();

      const filters = [eq(exercises.isActive, true)];
      if (q) {
        // Name or alias. The alias array is what lets somebody type "bench"
        // and find Barbell Bench Press instead of nothing.
        filters.push(
          or(
            ilike(exercises.name, `%${q}%`),
            sql`exists (select 1 from unnest(coalesce(${exercises.aliases}, '{}')) a where a ilike ${"%" + q + "%"})`,
          )!,
        );
      }

      const rows = await db
        .select()
        .from(exercises)
        .where(and(...filters))
        .orderBy(asc(exercises.sortOrder), asc(exercises.name))
        .limit(200);

      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── Today's prescription ────────────────────────────────────────────────

  /**
   * The lifts prescribed for today, with each percentage already resolved to a
   * weight from this member's own history.
   *
   * This is the screen Build exists for. It reads from the habit engine — the
   * member's materialised habits for today — rather than from any training
   * calendar, because there is no training calendar and deliberately so.
   */
  app.get("/api/training/today", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const unit = await unitFor(userId);
      const today = await memberToday(userId);

      const todays = await db
        .select({
          habitId: habits.id,
          title: habits.title,
          completed: habits.completed,
          routineHabitId: habits.routineHabitId,
        })
        .from(habits)
        .where(and(eq(habits.userId, userId), eq(habits.scheduledDate, today)));

      const templateIds = todays.map((h) => h.routineHabitId).filter(Boolean) as string[];
      if (templateIds.length === 0) return res.json({ date: today, unit, sessions: [] });

      const prescribed = await db
        .select({
          id: habitExercises.id,
          routineHabitId: habitExercises.routineHabitId,
          exerciseId: habitExercises.exerciseId,
          orderIndex: habitExercises.orderIndex,
          targetSets: habitExercises.targetSets,
          targetRepsLow: habitExercises.targetRepsLow,
          targetRepsHigh: habitExercises.targetRepsHigh,
          targetPercent1rm: habitExercises.targetPercent1rm,
          restSeconds: habitExercises.restSeconds,
          note: habitExercises.note,
          name: exercises.name,
          trackingType: exercises.trackingType,
          equipment: exercises.equipment,
        })
        .from(habitExercises)
        .innerJoin(exercises, eq(habitExercises.exerciseId, exercises.id))
        .where(inArray(habitExercises.routineHabitId, templateIds))
        .orderBy(asc(habitExercises.orderIndex));

      if (prescribed.length === 0) return res.json({ date: today, unit, sessions: [] });

      const [rows, bw] = await Promise.all([setRowsFor(userId), bodyweightLookup(userId)]);
      const best = bestEstimates(rows, bw);

      const sessions = todays
        .filter((h) => prescribed.some((p) => p.routineHabitId === h.routineHabitId))
        .map((h) => ({
          habitId: h.habitId,
          title: h.title,
          completed: h.completed,
          exercises: prescribed
            .filter((p) => p.routineHabitId === h.routineHabitId)
            .map((p) => {
              const reference = best.get(p.exerciseId);
              const kg = prescribedWeightKg(p.targetPercent1rm, reference);
              return {
                ...p,
                // Null when they have never done this lift. The screen says so
                // rather than printing a confident zero.
                suggestedWeight: out(kg, unit),
                referenceE1rm: out(reference?.e1rmKg, unit),
              };
            }),
        }));

      res.json({ date: today, unit, sessions });
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── Recording ───────────────────────────────────────────────────────────

  app.post("/api/training/sessions", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = z
        .object({
          habitId: z.string().uuid().nullable().optional(),
          title: z.string().max(120).nullable().optional(),
        })
        .parse(req.body ?? {});

      // The habit has to be this member's. Without the check, anybody could
      // attach their session to somebody else's day.
      if (input.habitId) {
        const [owned] = await db
          .select({ id: habits.id })
          .from(habits)
          .where(and(eq(habits.id, input.habitId), eq(habits.userId, userId)));
        if (!owned) return res.status(404).json({ message: "No such session" });
      }

      const [row] = await db
        .insert(workoutSessions)
        .values({
          userId,
          habitId: input.habitId ?? null,
          onDate: await memberToday(userId),
          title: input.title ?? null,
        })
        .returning();

      track("training.session_start", { userId, surface: "build", subjectId: row.id });
      res.status(201).json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/training/sessions/:id/sets", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const sessionId = param(req, "id");
      const input = logSetSchema.parse(req.body ?? {});
      const unit = await unitFor(userId);

      const [session] = await db
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
      if (!session) return res.status(404).json({ message: "No such session" });

      const [exercise] = await db
        .select({ id: exercises.id })
        .from(exercises)
        .where(eq(exercises.id, input.exerciseId));
      if (!exercise) return res.status(400).json({ message: "No such exercise" });

      // Next index, so the client never has to track it and two devices
      // logging at once can't collide on the same number.
      const [{ n }] = await db
        .select({ n: sql<number>`coalesce(max(${workoutSets.setIndex}), 0)::int` })
        .from(workoutSets)
        .where(eq(workoutSets.sessionId, sessionId));

      const [row] = await db
        .insert(workoutSets)
        .values({
          sessionId,
          exerciseId: input.exerciseId,
          habitExerciseId: input.habitExerciseId ?? null,
          setIndex: n + 1,
          reps: input.reps ?? null,
          durationSeconds: input.durationSeconds ?? null,
          distanceM: input.distanceM ?? null,
          weightKg: inKg(input.weight ?? 0, input.unit ?? unit),
          isWarmup: input.isWarmup,
          rpe: input.rpe ?? null,
          note: input.note ?? null,
        })
        .returning();

      res.status(201).json({ ...row, weight: out(row.weightKg, unit), unit });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: zodMessage(err) });
      }
      trackError("training.log_set", err, { userId: req.session?.userId });
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete("/api/training/sets/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      // Ownership proven by the join rather than by a second query: a set is
      // this member's only if its session is.
      const [gone] = await db
        .delete(workoutSets)
        .where(
          and(
            eq(workoutSets.id, param(req, "id")),
            sql`exists (select 1 from ${workoutSessions} s
                        where s.id = ${workoutSets.sessionId} and s.user_id = ${userId})`,
          ),
        )
        .returning({ id: workoutSets.id });

      if (!gone) return res.status(404).json({ message: "Not found" });
      res.json({ id: gone.id });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/training/sessions/:id/finish", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = z
        .object({
          durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
          note: z.string().max(1000).nullable().optional(),
        })
        .parse(req.body ?? {});

      const [row] = await db
        .update(workoutSessions)
        .set({
          finishedAt: new Date(),
          durationMinutes: input.durationMinutes ?? null,
          note: input.note ?? null,
        })
        .where(and(eq(workoutSessions.id, param(req, "id")), eq(workoutSessions.userId, userId)))
        .returning();

      if (!row) return res.status(404).json({ message: "No such session" });

      track("training.session_finish", { userId, surface: "build", subjectId: row.id });
      res.json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/training/sessions", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const unit = await unitFor(userId);

      const sessions = await db
        .select()
        .from(workoutSessions)
        .where(eq(workoutSessions.userId, userId))
        .orderBy(desc(workoutSessions.onDate))
        .limit(60);

      if (sessions.length === 0) return res.json({ unit, sessions: [] });

      const sets = await db
        .select({
          id: workoutSets.id,
          sessionId: workoutSets.sessionId,
          exerciseId: workoutSets.exerciseId,
          name: exercises.name,
          setIndex: workoutSets.setIndex,
          reps: workoutSets.reps,
          durationSeconds: workoutSets.durationSeconds,
          distanceM: workoutSets.distanceM,
          weightKg: workoutSets.weightKg,
          isWarmup: workoutSets.isWarmup,
          rpe: workoutSets.rpe,
        })
        .from(workoutSets)
        .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
        .where(inArray(workoutSets.sessionId, sessions.map((s) => s.id)))
        .orderBy(asc(workoutSets.setIndex));

      res.json({
        unit,
        sessions: sessions.map((s) => ({
          ...s,
          sets: sets
            .filter((x) => x.sessionId === s.id)
            .map((x) => ({ ...x, weight: out(x.weightKg, unit) })),
        })),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  /** One lift over time — the series the Sparkline was written for. */
  app.get("/api/training/exercises/:id/history", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const exerciseId = param(req, "id");
      const unit = await unitFor(userId);

      const [rows, bw] = await Promise.all([
        setRowsFor(userId, exerciseId),
        bodyweightLookup(userId),
      ]);

      const series = progressionSeries(rows, bw);
      const latest = series[series.length - 1];
      const bodyweightNow = latest ? bw(latest.onDate) : null;

      res.json({
        unit,
        points: series.map((p) => ({
          onDate: p.onDate,
          e1rm: out(p.e1rmKg, unit),
          reps: p.reps,
          weight: out(p.weightKg, unit),
        })),
        best: latest ? out(Math.max(...series.map((p) => p.e1rmKg)), unit) : null,
        relativeStrength: latest ? relativeStrength(latest.e1rmKg, bodyweightNow) : null,
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── Bodyweight and preferences ──────────────────────────────────────────

  app.get("/api/training/bodyweight", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const unit = await unitFor(userId);
      const rows = await db
        .select()
        .from(bodyMeasurements)
        .where(eq(bodyMeasurements.userId, userId))
        .orderBy(desc(bodyMeasurements.onDate))
        .limit(365);

      res.json({
        unit,
        readings: rows.map((r) => ({ ...r, weight: out(r.weightKg, unit) })),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/training/bodyweight", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = bodyMeasurementSchema.parse(req.body ?? {});
      const unit = await unitFor(userId);
      const onDate = await memberToday(userId);

      // A second weigh-in on the same day corrects the first rather than
      // adding a row every average would then double-count.
      const [row] = await db
        .insert(bodyMeasurements)
        .values({
          userId,
          onDate,
          weightKg: inKg(input.weight, input.unit ?? unit),
          heightCm: input.heightCm ?? null,
          note: input.note ?? null,
        })
        .onConflictDoUpdate({
          target: [bodyMeasurements.userId, bodyMeasurements.onDate],
          set: {
            weightKg: inKg(input.weight, input.unit ?? unit),
            heightCm: input.heightCm ?? null,
            note: input.note ?? null,
          },
        })
        .returning();

      res.status(201).json({ ...row, weight: out(row.weightKg, unit), unit });
    } catch (err) {
      fail(res, err);
    }
  });

  app.patch("/api/training/preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = z.object({ weightUnit: weightUnitEnum }).parse(req.body ?? {});

      // Only the display unit changes. Nothing stored is rewritten, because
      // everything stored is already kilograms — which is the entire reason
      // switching units is safe rather than a migration.
      const [row] = await db
        .update(users)
        .set({ weightUnit: input.weightUnit })
        .where(eq(users.id, userId))
        .returning({ weightUnit: users.weightUnit });

      res.json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  app.get("/api/admin/exercises", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(exercises)
        .orderBy(asc(exercises.pattern), asc(exercises.name));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/exercises", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = insertExerciseSchema.parse(req.body ?? {});
      const [row] = await db
        .insert(exercises)
        .values(input)
        .onConflictDoUpdate({ target: exercises.id, set: input })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/exercises/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = insertExerciseSchema.omit({ id: true }).partial().parse(req.body ?? {});
      const [row] = await db
        .update(exercises)
        .set(input)
        .where(eq(exercises.id, param(req, "id")))
        .returning();
      if (!row) return res.status(404).json({ message: "No such exercise" });
      res.json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  /** The prescription for one habit template. */
  app.get("/api/admin/habits/:habitId/exercises", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          id: habitExercises.id,
          exerciseId: habitExercises.exerciseId,
          name: exercises.name,
          equipment: exercises.equipment,
          trackingType: exercises.trackingType,
          orderIndex: habitExercises.orderIndex,
          targetSets: habitExercises.targetSets,
          targetRepsLow: habitExercises.targetRepsLow,
          targetRepsHigh: habitExercises.targetRepsHigh,
          targetPercent1rm: habitExercises.targetPercent1rm,
          restSeconds: habitExercises.restSeconds,
          note: habitExercises.note,
        })
        .from(habitExercises)
        .innerJoin(exercises, eq(habitExercises.exerciseId, exercises.id))
        .where(eq(habitExercises.routineHabitId, param(req, "habitId")))
        .orderBy(asc(habitExercises.orderIndex));
      res.json(rows);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/habits/:habitId/exercises", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const habitId = param(req, "habitId");
      const input = prescribeExerciseSchema.parse(req.body ?? {});

      const [template] = await db
        .select({ id: routineHabits.id })
        .from(routineHabits)
        .where(eq(routineHabits.id, habitId));
      if (!template) return res.status(404).json({ message: "No such habit" });

      const [row] = await db
        .insert(habitExercises)
        .values({ ...input, routineHabitId: habitId })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/admin/habit-exercises/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = prescribeExercisePatchSchema.parse(req.body ?? {});
      const [row] = await db
        .update(habitExercises)
        .set(input)
        .where(eq(habitExercises.id, param(req, "id")))
        .returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/admin/habit-exercises/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [gone] = await db
        .delete(habitExercises)
        .where(eq(habitExercises.id, param(req, "id")))
        .returning({ id: habitExercises.id });
      if (!gone) return res.status(404).json({ message: "Not found" });
      res.json({ id: gone.id });
    } catch (err) {
      fail(res, err);
    }
  });
}
