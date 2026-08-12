/**
 * Health data from the phone — API
 *
 * Member:
 *   GET    /api/health/status      — is a phone linked, how fresh, what's flowing
 *   POST   /api/health/sync        — the phone posts what it read
 *   GET    /api/health/summary     — the member's own numbers, pivoted by day
 *   PATCH  /api/health/workouts/:id — how a session landed, and where it belongs
 *   DELETE /api/health/connection  — unlink, and delete everything we hold
 *
 * Coach / admin:
 *   GET /api/admin/health/:userId/summary — the same view, for someone they coach
 *
 * There is no admin WRITE anywhere in this file, and that is deliberate. The
 * device is the source of truth; a hand-edited health row is a number nobody
 * can trace to a measurement, sitting in the same column as numbers a coach is
 * about to make a decision on.
 *
 * The PATCH above is not an exception to that. It writes two columns no sensor
 * ever had an opinion about — how a session landed, and which side of the app
 * the member wants it shown on — and it can reach nothing that was measured.
 *
 * ── On the trailing re-read window ────────────────────────────────────────
 * Health data arrives late and changes after the fact, which makes "sync
 * everything since the last sync" quietly wrong:
 *
 *   - A watch that was off the wrist backfills yesterday when it next syncs.
 *   - Sleep for Tuesday morning is written by the ring on Tuesday *afternoon*.
 *   - A member edits a weight entry three days later.
 *
 * Reading strictly forward from the last watermark misses all three, and the
 * gap is invisible — the chart just has a dip. So the client re-reads
 * SYNC_OVERLAP_DAYS behind the watermark every time, and the unique index on
 * (user, date, metric) turns the repeat into an update. Cheap, and it makes
 * "did it sync?" stop being a question.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { isAuthenticated } from "../auth/index.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import {
  healthConnections,
  healthDays,
  healthWorkouts,
  healthSyncSchema,
  workoutFeedbackSchema,
  healthMetricEnum,
  HEALTH_UNITS,
  HEALTH_RANGES,
  type HealthMetric,
} from "../../shared/schema.js";

/** How far behind the watermark the client re-reads. See the note above. */
export const SYNC_OVERLAP_DAYS = 7;
/** How far back a first sync reaches. Enough for a coach to see a baseline. */
export const INITIAL_BACKFILL_DAYS = 90;

const DEFAULT_SUMMARY_DAYS = 30;
const MAX_SUMMARY_DAYS = 400;

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
    .catch(next);
}

/**
 * Drop a sample rather than store it, with the reason.
 *
 * Returning a reason instead of silently skipping matters: a client that maps
 * a metric to the wrong unit would otherwise post happily forever and show an
 * empty chart, and there would be nothing to look at to find out why.
 */
function rejectSample(metric: HealthMetric, value: number, unit: string): string | null {
  const expected = HEALTH_UNITS[metric];
  if (unit !== expected) return `${metric}: expected ${expected}, got ${unit}`;
  const [lo, hi] = HEALTH_RANGES[metric];
  if (!Number.isFinite(value) || value < lo || value > hi)
    return `${metric}: ${value} is outside ${lo}–${hi}`;
  return null;
}

/** Turn long rows into one object per day: { onDate, steps, sleepMinutes, … }. */
function pivot(rows: { onDate: string; metric: string; value: number }[]) {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    let day = byDate.get(r.onDate);
    if (!day) {
      day = { onDate: r.onDate };
      byDate.set(r.onDate, day);
    }
    day[r.metric] = r.value;
  }
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.onDate).localeCompare(String(b.onDate))
  );
}

async function summaryFor(userId: string, days: number) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  const [rows, workouts, connections] = await Promise.all([
    db
      .select({ onDate: healthDays.onDate, metric: healthDays.metric, value: healthDays.value })
      .from(healthDays)
      .where(and(eq(healthDays.userId, userId), gte(healthDays.onDate, sinceDate))),
    db
      .select()
      .from(healthWorkouts)
      .where(and(eq(healthWorkouts.userId, userId), gte(healthWorkouts.onDate, sinceDate)))
      .orderBy(desc(healthWorkouts.startAt))
      .limit(200),
    db.select().from(healthConnections).where(eq(healthConnections.userId, userId)),
  ]);

  const live = connections.filter((c) => !c.revokedAt);
  return {
    days: pivot(rows),
    workouts,
    connected: live.length > 0,
    connections: live.map((c) => ({
      platform: c.platform,
      lastSyncAt: c.lastSyncAt,
      lastSyncCount: c.lastSyncCount,
      grantedMetrics: c.grantedMetrics ?? [],
      deviceModel: c.deviceModel,
    })),
    /** Which metrics actually have a number in this window — drives the UI. */
    metrics: Array.from(new Set(rows.map((r) => r.metric))).sort(),
  };
}

export function registerHealthRoutes(app: Express) {
  // ── Status ───────────────────────────────────────────────────────────────

  app.get("/api/health/status", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const rows = await db
        .select()
        .from(healthConnections)
        .where(eq(healthConnections.userId, userId));
      const live = rows.filter((c) => !c.revokedAt);

      res.json({
        connected: live.length > 0,
        overlapDays: SYNC_OVERLAP_DAYS,
        initialBackfillDays: INITIAL_BACKFILL_DAYS,
        connections: live.map((c) => ({
          platform: c.platform,
          syncedThrough: c.syncedThrough,
          lastSyncAt: c.lastSyncAt,
          lastSyncCount: c.lastSyncCount,
          lastError: c.lastError,
          grantedMetrics: c.grantedMetrics ?? [],
          deviceModel: c.deviceModel,
          osVersion: c.osVersion,
        })),
      });
    } catch (err) {
      console.error("[health] status failed", err);
      res.status(500).json({ message: "Could not read health status." });
    }
  });

  // ── Sync ─────────────────────────────────────────────────────────────────

  app.post("/api/health/sync", isAuthenticated, async (req, res) => {
    const parsed = healthSyncSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

    const userId = req.session!.userId!;
    const { platform, samples, workouts, grantedMetrics, syncedThrough, deviceModel, osVersion } =
      parsed.data;

    try {
      const rejected: string[] = [];

      /**
       * Deduplicate within the batch before it reaches Postgres.
       *
       * ON CONFLICT cannot resolve two rows that collide with *each other* in
       * the same statement — it raises "cannot affect row a second time" and
       * the whole sync fails. A client that reads two overlapping windows in
       * one pass produces exactly that, so the last value for a key wins here.
       */
      const byKey = new Map<string, (typeof samples)[number]>();
      for (const s of samples) {
        const reason = rejectSample(s.metric, s.value, s.unit);
        if (reason) {
          if (rejected.length < 20) rejected.push(reason);
          continue;
        }
        byKey.set(`${s.onDate}|${s.metric}`, s);
      }
      const clean = Array.from(byKey.values());

      let written = 0;
      if (clean.length) {
        // Chunked so one sync stays well inside the parameter limit — nine
        // columns per row, and Postgres caps a statement at 65,535 of them.
        for (let i = 0; i < clean.length; i += 500) {
          const chunk = clean.slice(i, i + 500);
          await db
            .insert(healthDays)
            .values(
              chunk.map((s) => ({
                userId,
                onDate: s.onDate,
                metric: s.metric,
                value: s.value,
                unit: s.unit,
                source: platform,
                sourceApp: s.sourceApp ?? null,
                syncedAt: new Date(),
              }))
            )
            .onConflictDoUpdate({
              target: [healthDays.userId, healthDays.onDate, healthDays.metric],
              set: {
                value: sql`excluded.value`,
                unit: sql`excluded.unit`,
                source: sql`excluded.source`,
                sourceApp: sql`excluded.source_app`,
                syncedAt: new Date(),
              },
            });
          written += chunk.length;
        }
      }

      const byExternal = new Map<string, (typeof workouts)[number]>();
      for (const w of workouts) byExternal.set(w.externalId, w);
      const cleanWorkouts = Array.from(byExternal.values());

      let workoutsWritten = 0;
      if (cleanWorkouts.length) {
        for (let i = 0; i < cleanWorkouts.length; i += 200) {
          const chunk = cleanWorkouts.slice(i, i + 200);
          await db
            .insert(healthWorkouts)
            .values(
              chunk.map((w) => ({
                userId,
                externalId: w.externalId,
                workoutType: w.workoutType ?? null,
                startAt: new Date(w.startAt),
                endAt: w.endAt ? new Date(w.endAt) : null,
                onDate: w.onDate,
                durationSeconds: w.durationSeconds ?? null,
                activeCalories: w.activeCalories ?? null,
                distanceMeters: w.distanceMeters ?? null,
                avgHeartRate: w.avgHeartRate ?? null,
                maxHeartRate: w.maxHeartRate ?? null,
                source: platform,
                sourceApp: w.sourceApp ?? null,
                syncedAt: new Date(),
              }))
            )
            /**
             * The platform's columns, named one at a time.
             *
             * `user_response` and `user_orientation_override` are absent from
             * this list on purpose, and the omission is load-bearing: the
             * trailing re-read window means the same session is posted again on
             * most syncs, so anything listed here is rewritten every hour or so.
             * Apple correcting a distance from 5.73 to 5.76 miles is the system
             * working. Apple erasing "that run restored me" is not — the
             * platform knows what happened, the member knows how it landed, and
             * only one of those two is entitled to the other's columns.
             *
             * This is also why it stays an explicit list rather than a spread of
             * the inserted row, which would silently swallow every column added
             * from here on.
             */
            .onConflictDoUpdate({
              target: [healthWorkouts.userId, healthWorkouts.externalId],
              set: {
                workoutType: sql`excluded.workout_type`,
                endAt: sql`excluded.end_at`,
                durationSeconds: sql`excluded.duration_seconds`,
                activeCalories: sql`excluded.active_calories`,
                distanceMeters: sql`excluded.distance_meters`,
                avgHeartRate: sql`excluded.avg_heart_rate`,
                maxHeartRate: sql`excluded.max_heart_rate`,
                syncedAt: new Date(),
              },
            });
          workoutsWritten += chunk.length;
        }
      }

      await db
        .insert(healthConnections)
        .values({
          userId,
          platform,
          grantedMetrics: grantedMetrics ?? null,
          syncedThrough: syncedThrough ? new Date(syncedThrough) : new Date(),
          lastSyncAt: new Date(),
          lastSyncCount: written + workoutsWritten,
          lastError: rejected.length ? rejected.slice(0, 5).join("; ") : null,
          deviceModel: deviceModel ?? null,
          osVersion: osVersion ?? null,
          // A sync is a re-link: the member granted access again, so a row
          // left over from a previous disconnect stops being revoked.
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: [healthConnections.userId, healthConnections.platform],
          set: {
            grantedMetrics: sql`excluded.granted_metrics`,
            syncedThrough: sql`excluded.synced_through`,
            lastSyncAt: sql`excluded.last_sync_at`,
            lastSyncCount: sql`excluded.last_sync_count`,
            lastError: sql`excluded.last_error`,
            deviceModel: sql`excluded.device_model`,
            osVersion: sql`excluded.os_version`,
            revokedAt: null,
            updatedAt: new Date(),
          },
        });

      res.json({
        accepted: written,
        workouts: workoutsWritten,
        rejected: rejected.length,
        // Named, not counted. A count tells you something is wrong; the
        // reasons tell you it was kg vs lb, which is the actual fix.
        reasons: rejected,
      });
    } catch (err) {
      console.error("[health] sync failed", err);
      res.status(500).json({ message: "Could not save health data." });
    }
  });

  // ── Read ─────────────────────────────────────────────────────────────────

  app.get("/api/health/summary", isAuthenticated, async (req, res) => {
    try {
      const days = Math.min(
        MAX_SUMMARY_DAYS,
        Math.max(1, Number(req.query.days) || DEFAULT_SUMMARY_DAYS)
      );
      res.json(await summaryFor(req.session!.userId!, days));
    } catch (err) {
      console.error("[health] summary failed", err);
      res.status(500).json({ message: "Could not read health data." });
    }
  });

  app.get("/api/admin/health/:userId/summary", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const days = Math.min(
        MAX_SUMMARY_DAYS,
        Math.max(1, Number(req.query.days) || DEFAULT_SUMMARY_DAYS)
      );
      res.json(await summaryFor(String(req.params.userId), days));
    } catch (err) {
      console.error("[health] admin summary failed", err);
      res.status(500).json({ message: "Could not read health data." });
    }
  });

  // ── How a session landed ─────────────────────────────────────────────────

  /**
   * The member's own reading of one imported session.
   *
   * Two separate answers, and they are not versions of each other:
   *
   *   response   how it landed — restored me, steady, taxed me
   *   placement  where it belongs — Restore, Build, Both
   *
   * A hard run that left somebody feeling better is `taxed`-by-the-model and
   * `restored`-by-them at the same time, and both are true. Neither answer is
   * required, neither is ever asked for twice, and either can be taken back:
   * an explicit null clears it, which is why the schema distinguishes "absent"
   * from "null" rather than treating a missing field as a clear.
   *
   * What this endpoint cannot do is change what the session cost. Duration,
   * distance and calories are not in the schema, and the terrain reading never
   * reads either of these columns — it goes through the activity's category and
   * CATEGORY_LOAD, exactly as it does for a session logged in Sakred.
   */
  app.patch("/api/health/workouts/:id", isAuthenticated, async (req, res) => {
    const parsed = workoutFeedbackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

    const userId = req.session!.userId!;
    const { response, placement } = parsed.data;

    // Checked before it reaches Postgres, which answers a malformed uuid with a
    // cast error and a 500 — an error page for what is really a 404.
    const id = String(req.params.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(404).json({ message: "No such session." });
    }

    try {
      const patch: Partial<typeof healthWorkouts.$inferInsert> = {};
      // `undefined` means the field was not sent and must be left alone; null
      // means clear it. Assigning undefined into the object would make Drizzle
      // drop the column from the UPDATE, which is right — but only if we never
      // build an empty patch, which the schema's refinement prevents.
      if (response !== undefined) patch.userResponse = response;
      if (placement !== undefined) patch.userOrientationOverride = placement;

      /**
       * Scoped by user as well as id.
       *
       * The id is a uuid and unguessable, which is not the same as private. One
       * clause is the difference between "hard to find someone else's workout"
       * and "cannot write to it", and only the second one is a rule.
       */
      const [updated] = await db
        .update(healthWorkouts)
        .set(patch)
        .where(and(eq(healthWorkouts.id, id), eq(healthWorkouts.userId, userId)))
        .returning();

      // 404 rather than 403 for somebody else's row: whether that id exists is
      // not this member's business either way.
      if (!updated) return res.status(404).json({ message: "No such session." });

      res.json(updated);
    } catch (err) {
      console.error("[health] workout feedback failed", err);
      res.status(500).json({ message: "Could not save that." });
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────

  /**
   * Unlink and delete. Not a flag — the rows go.
   *
   * Both stores require this: Apple's 5.1.1(v) and Google's Health Connect
   * policy both say revoking access has to remove the data, not just stop the
   * flow. It is also the honest reading of what a member means when they tap
   * it, which is the better reason.
   */
  app.delete("/api/health/connection", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session!.userId!;
      const [removedDays, removedWorkouts] = await Promise.all([
        db.delete(healthDays).where(eq(healthDays.userId, userId)).returning({ id: healthDays.id }),
        db
          .delete(healthWorkouts)
          .where(eq(healthWorkouts.userId, userId))
          .returning({ id: healthWorkouts.id }),
      ]);
      await db
        .update(healthConnections)
        .set({
          revokedAt: new Date(),
          syncedThrough: null,
          grantedMetrics: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(healthConnections.userId, userId));

      res.json({
        disconnected: true,
        deletedDays: removedDays.length,
        deletedWorkouts: removedWorkouts.length,
      });
    } catch (err) {
      console.error("[health] disconnect failed", err);
      res.status(500).json({ message: "Could not disconnect." });
    }
  });
}
