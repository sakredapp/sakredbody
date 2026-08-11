/**
 * The member's own side of Build.
 *
 * Three things, all of which were missing:
 *
 *   1. Movements they can add themselves, when the catalogue lacks one.
 *   2. Workouts they write for themselves and repeat.
 *   3. Syncing the shared catalogue, so it can be corrected without a console.
 *
 * The premise is one the product had backwards. Build assumed every member
 * wants to be told what to lift, so a member with no prescription got an empty
 * screen and the app's effective position was "train our way or don't log."
 * Plenty of people arrive already dialled on their lifting and want the
 * coaching for fascia, mobility and recovery — the parts they are not dialled
 * on. Those two facts have to coexist, and now they do: prescribed habits,
 * member templates and ad-hoc sessions all write to the same history.
 */

import type { Express, Request, Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { storage } from "../storage.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import {
  exercises,
  memberWorkouts,
  memberWorkoutExercises,
  memberBuildProfile,
  exerciseCategoryEnum,
  modalitiesSchema,
  BUILD_MODALITIES,
} from "../../shared/schema.js";
import { track } from "../telemetry/index.js";
import { catalogueRows, slug, arrayLiteral } from "../../shared/data/exerciseCatalogue.js";

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: zodMessage(err) });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

async function isAdminUser(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  return user?.isAdmin === "true";
}


const exerciseInput = z.object({
  name: z.string().trim().min(2, "Give it a name").max(80),
  category: exerciseCategoryEnum,
  /** Everything else has a sane default; a member should not have to think. */
  equipment: z.string().trim().max(40).optional(),
  trackingType: z.enum(["reps", "duration", "distance"]).optional(),
  takesLoad: z.boolean().optional(),
  unilateral: z.boolean().optional(),
});

const workoutInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80),
  note: z.string().max(2000).nullable().optional(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1),
        targetSets: z.number().int().min(1).max(20).optional(),
        targetRepsLow: z.number().int().min(1).max(500).nullable().optional(),
        targetRepsHigh: z.number().int().min(1).max(500).nullable().optional(),
        restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .max(40, "That's a lot for one session")
    .optional(),
});

export function registerMemberWorkoutRoutes(app: Express): void {
  // ─── Movements a member added ────────────────────────────────────────────

  /**
   * Add a movement the catalogue doesn't have.
   *
   * Owned by them and visible to them alone. The note on `exercises` argues
   * against free text and is right — "bench", "Bench Press" and "BB bench"
   * become three movements nothing can graph together — but a catalogue that
   * lacks what somebody actually does is a worse failure, because it stops
   * them logging at all. Owner-scoping keeps the fragmentation out of anything
   * shared while removing the wall.
   */
  app.post("/api/training/exercises", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = exerciseInput.parse(req.body);

      // Suffixed with the owner, so two members inventing "Sissy Squat" on the
      // same day get a row each rather than one of them silently adopting the
      // other's — including its tracking type, which may be wrong for them.
      const id = `${slug(input.name)}-u${userId.slice(0, 8)}`;

      const [existing] = await db.select().from(exercises).where(eq(exercises.id, id));
      if (existing) return res.status(200).json(existing);

      const [row] = await db
        .insert(exercises)
        .values({
          id,
          name: input.name,
          category: input.category,
          pattern: "push",
          equipment: input.equipment ?? "other",
          trackingType: input.trackingType ?? "reps",
          takesLoad: input.takesLoad ?? true,
          unilateral: input.unilateral ?? false,
          tracksOneRepMax: false,
          ownerUserId: userId,
          // Behind the catalogue in the picker: theirs is findable by name and
          // should not outrank a curated movement in a browse.
          sortOrder: 100_000,
        })
        .returning();

      res.status(201).json(row);
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── The member's saved workouts ─────────────────────────────────────────

  app.get("/api/training/workouts", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const rows = await db
        .select()
        .from(memberWorkouts)
        .where(and(eq(memberWorkouts.userId, userId), eq(memberWorkouts.isArchived, false)))
        .orderBy(asc(memberWorkouts.name));

      if (rows.length === 0) return res.json([]);

      // One query for every workout's movements rather than one per workout.
      const items = await db
        .select({
          id: memberWorkoutExercises.id,
          memberWorkoutId: memberWorkoutExercises.memberWorkoutId,
          exerciseId: memberWorkoutExercises.exerciseId,
          orderIndex: memberWorkoutExercises.orderIndex,
          targetSets: memberWorkoutExercises.targetSets,
          targetRepsLow: memberWorkoutExercises.targetRepsLow,
          targetRepsHigh: memberWorkoutExercises.targetRepsHigh,
          restSeconds: memberWorkoutExercises.restSeconds,
          note: memberWorkoutExercises.note,
          name: exercises.name,
          trackingType: exercises.trackingType,
          takesLoad: exercises.takesLoad,
          unilateral: exercises.unilateral,
          category: exercises.category,
        })
        .from(memberWorkoutExercises)
        .innerJoin(exercises, eq(exercises.id, memberWorkoutExercises.exerciseId))
        .where(
          sql`${memberWorkoutExercises.memberWorkoutId} in ${sql.raw(
            `(${rows.map((r) => `'${r.id}'`).join(",")})`,
          )}`,
        )
        .orderBy(asc(memberWorkoutExercises.orderIndex));

      const byWorkout = new Map<string, typeof items>();
      for (const i of items) {
        const list = byWorkout.get(i.memberWorkoutId) ?? [];
        list.push(i);
        byWorkout.set(i.memberWorkoutId, list);
      }

      res.json(rows.map((r) => ({ ...r, exercises: byWorkout.get(r.id) ?? [] })));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/training/workouts", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = workoutInput.parse(req.body);

      const [workout] = await db
        .insert(memberWorkouts)
        .values({ userId, name: input.name, note: input.note ?? null })
        .returning();

      if (input.exercises?.length) {
        await db.insert(memberWorkoutExercises).values(
          input.exercises.map((e, i) => ({
            memberWorkoutId: workout.id,
            exerciseId: e.exerciseId,
            orderIndex: i,
            targetSets: e.targetSets ?? 3,
            targetRepsLow: e.targetRepsLow ?? null,
            targetRepsHigh: e.targetRepsHigh ?? null,
            restSeconds: e.restSeconds ?? null,
            note: e.note ?? null,
          })),
        );
      }

      res.status(201).json(workout);
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Replace a workout's contents.
   *
   * The movements are deleted and re-inserted rather than diffed. Reordering
   * and editing in one pass is what the builder actually does, and a diff
   * against a list whose order is itself the data is more code and more ways
   * to be wrong. Nothing references these rows — the sets a member performed
   * point at `habit_exercise_id`, never at this — so nothing is orphaned.
   */
  app.put("/api/training/workouts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const id = param(req, "id");
      const input = workoutInput.parse(req.body);

      const [owned] = await db
        .select({ id: memberWorkouts.id })
        .from(memberWorkouts)
        .where(and(eq(memberWorkouts.id, id), eq(memberWorkouts.userId, userId)));
      if (!owned) return res.status(404).json({ message: "No such workout" });

      await db
        .update(memberWorkouts)
        .set({ name: input.name, note: input.note ?? null, updatedAt: new Date() })
        .where(eq(memberWorkouts.id, id));

      await db.delete(memberWorkoutExercises).where(eq(memberWorkoutExercises.memberWorkoutId, id));
      if (input.exercises?.length) {
        await db.insert(memberWorkoutExercises).values(
          input.exercises.map((e, i) => ({
            memberWorkoutId: id,
            exerciseId: e.exerciseId,
            orderIndex: i,
            targetSets: e.targetSets ?? 3,
            targetRepsLow: e.targetRepsLow ?? null,
            targetRepsHigh: e.targetRepsHigh ?? null,
            restSeconds: e.restSeconds ?? null,
            note: e.note ?? null,
          })),
        );
      }

      res.json({ id });
    } catch (err) {
      fail(res, err);
    }
  });

  /** Archived, not deleted — a past session should keep knowing where it came from. */
  app.delete("/api/training/workouts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const id = param(req, "id");
      const result = await db
        .update(memberWorkouts)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(memberWorkouts.id, id), eq(memberWorkouts.userId, userId)))
        .returning({ id: memberWorkouts.id });
      if (!result.length) return res.status(404).json({ message: "No such workout" });
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── Admin: sync the shared catalogue ────────────────────────────────────

  /**
   * Upsert the curated catalogue from shared/data/exerciseCatalogue.ts.
   *
   * An endpoint rather than a migration because the database URL is a Vercel
   * Sensitive variable and deliberately unavailable locally — there is no psql
   * to pipe the generated SQL into. This ships with the server, so correcting
   * a movement is an edit and a deploy rather than a console session.
   *
   * Never touches `owner_user_id`, so a member's own movements survive it.
   */
  app.post("/api/admin/training/catalogue/sync", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      if (!(await isAdminUser(userId))) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const rows = catalogueRows();
      let order = 0;
      // Chunked: a single statement with 657 rows and twelve columns each is a
      // large parse on a serverless connection, and a failure part-way through
      // one enormous statement tells you nothing about where.
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const values = chunk.map((r) => {
          order += 10;
          return sql`(${slug(r.name)}, ${r.name}, ${r.category}, ${r.pattern}, ${r.equipment},
            ${r.tracking ?? "reps"}, ${r.load ?? true}, ${r.uni ?? false}, ${r.bw ?? 0},
            ${r.orm ?? false}, ${arrayLiteral(r.aliases)}::text[], ${order})`;
        });
        await db.execute(sql`
          insert into exercises
            (id, name, category, pattern, equipment, tracking_type, takes_load,
             unilateral, bodyweight_factor, tracks_one_rep_max, aliases, sort_order)
          values ${sql.join(values, sql`, `)}
          on conflict (id) do update set
            name = excluded.name,
            category = excluded.category,
            pattern = excluded.pattern,
            equipment = excluded.equipment,
            tracking_type = excluded.tracking_type,
            takes_load = excluded.takes_load,
            unilateral = excluded.unilateral,
            bodyweight_factor = excluded.bodyweight_factor,
            tracks_one_rep_max = excluded.tracks_one_rep_max,
            aliases = coalesce(excluded.aliases, exercises.aliases),
            sort_order = excluded.sort_order,
            is_active = true
        `);
      }

      const counted = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from exercises where owner_user_id is null`,
      );
      res.json({ synced: rows.length, catalogue: Number(counted.rows[0]?.count ?? 0) });
    } catch (err) {
      fail(res, err);
    }
  });

  // ─── What kinds of movement are part of your life ─────────────────────────

  /**
   * Null modalities is "never asked"; an empty array is "asked, chose nothing".
   * The client needs to tell those apart — the first is a question worth
   * putting on screen, the second is a question already declined.
   */
  app.get("/api/training/modalities", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const [row] = await db
        .select()
        .from(memberBuildProfile)
        .where(eq(memberBuildProfile.userId, userId));
      res.json({ modalities: row?.modalities ?? null });
    } catch (err) {
      fail(res, err);
    }
  });

  app.put("/api/training/modalities", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const input = modalitiesSchema.parse(req.body ?? {});

      // Anything not on the list is dropped rather than rejected: this is a
      // preference, and a stale client sending a modality that has since been
      // renamed should not be unable to save the rest of its answer.
      const known = new Set(BUILD_MODALITIES.map((m) => m.id as string));
      const modalities = input.modalities.filter((m) => known.has(m));

      const [row] = await db
        .insert(memberBuildProfile)
        .values({ userId, modalities, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: memberBuildProfile.userId,
          set: { modalities, updatedAt: new Date() },
        })
        .returning();

      track("training.modalities", {
        userId,
        surface: "build",
        props: { count: modalities.length, chosen: modalities },
      });
      res.json({ modalities: row.modalities ?? [] });
    } catch (err) {
      fail(res, err);
    }
  });
}
