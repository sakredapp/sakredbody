/**
 * Goals — API.
 *
 * Member:
 *   GET    /api/goals                     everything they hold, with latest and best
 *   POST   /api/goals                     add one
 *   GET    /api/goals/:id                 one, with its whole history
 *   PATCH  /api/goals/:id                 title, emphasis, status, date, order
 *   PUT    /api/goals/:id/target          move the target, keeping what it was
 *   POST   /api/goals/:id/progress        say where you are
 *
 * Coach, for a current client only:
 *   GET    /api/coach/clients/:memberId/goals
 *   POST   /api/coach/clients/:memberId/goals
 *   PUT    /api/coach/clients/:memberId/goals/:id/target
 *
 * ── The boundary ──────────────────────────────────────────────────────────
 *
 * A goal is the member's and their current coach's, and nobody else's. That
 * includes supervision: `requireCoachOf` grants an admin bypass by design, for
 * the operational work of running a coaching practice, and this file refuses
 * it. Knowing that a roster exists is a different thing from reading what
 * somebody is trying to do with their body, and a permission granted for the
 * first should not quietly deliver the second.
 *
 * A former coach, an unrelated coach and a member id that does not exist all
 * produce the same 404. Which of the three it was is not something the asker
 * is entitled to learn from a status code.
 */

import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { requireCoachOf } from "../coaching/relationships.js";
import { todayInZone } from "../../shared/utils/dates.js";
import { users } from "../../shared/models/auth.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import {
  memberGoals,
  createGoalInput,
  updateGoalInput,
  retargetGoalInput,
  recordProgressInput,
  parseTarget,
  type GoalTarget,
  type Measurement,
} from "../../shared/models/goals.js";
import {
  goalsFor,
  goalDetail,
  createGoal,
  updateGoal,
  retargetGoal,
  recordProgress,
} from "./store.js";

/** The session's own user, or null. Every handler starts here. */
function actor(req: Request): string | null {
  return req.session?.userId ?? null;
}

/**
 * A coach reaching a client's goals, or nothing.
 *
 * `requireCoachOf` has already established a live relationship *or* an
 * administrative bypass. Only the first is enough here — see the header. A
 * supervisor gets the same 404 as a stranger, which is also what stops the
 * refusal from being a hint.
 */
function clientOf(req: Request, res: Response): string | null {
  if (req.coachAccess !== "relationship") {
    res.status(404).json({ message: "No such member" });
    return null;
  }
  const raw = req.params.memberId;
  return String((Array.isArray(raw) ? raw[0] : raw) ?? "");
}

const idParam = z.string().uuid();

/**
 * The :id in the path, if it is one.
 *
 * Express 5 types a param as string | string[] — a duplicated segment arrives
 * as an array — so this normalises and validates in one place. An id that is
 * not a uuid is not "no such goal by bad luck", it is a path nobody legitimate
 * produced, and it gets the same 404 as one that simply is not theirs.
 */
function goalIdOf(req: Request): string | null {
  const raw = req.params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && idParam.safeParse(value).success ? value : null;
}

export function registerGoalRoutes(app: Express): void {
  // ─── Member ────────────────────────────────────────────────────────────

  app.get("/api/goals", isAuthenticated, async (req, res) => {
    try {
      const userId = actor(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      res.json(await goalsFor(userId));
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/goals", isAuthenticated, async (req, res) => {
    try {
      const userId = actor(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const parsed = createGoalInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });
      const input = parsed.data;

      const target = parseTarget(input.measurement, input.target);
      if (!target) return res.status(400).json({ message: "That target doesn't fit that kind of goal" });

      const goal = await createGoal({
        userId,
        title: input.title,
        description: input.description ?? null,
        emphasis: input.emphasis,
        measurement: input.measurement,
        target,
        exerciseId: input.exerciseId ?? null,
        activityType: input.activityType ?? null,
        targetDate: input.targetDate ?? null,
        actor: userId,
      });
      res.status(201).json(goal);
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/goals/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = actor(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const goalId = goalIdOf(req);
      if (!goalId) return res.status(404).json({ message: "No such goal" });

      const detail = await goalDetail(userId, goalId);
      if (!detail) return res.status(404).json({ message: "No such goal" });
      res.json(detail);
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.patch("/api/goals/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = actor(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const goalId = goalIdOf(req);
      if (!goalId) return res.status(404).json({ message: "No such goal" });

      const parsed = updateGoalInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

      const goal = await updateGoal({
        userId,
        goalId,
        actor: userId,
        patch: parsed.data,
      });
      if (!goal) return res.status(404).json({ message: "No such goal" });
      res.json(goal);
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.put("/api/goals/:id/target", isAuthenticated, async (req, res) => {
    try {
      const userId = actor(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const goalId = goalIdOf(req);
      if (!goalId) return res.status(404).json({ message: "No such goal" });

      const parsed = retargetGoalInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

      const target = parseTarget(parsed.data.measurement, parsed.data.target);
      if (!target) return res.status(400).json({ message: "That target doesn't fit that kind of goal" });

      const goal = await retargetGoal({
        userId,
        goalId,
        measurement: parsed.data.measurement,
        target,
        note: parsed.data.note ?? null,
        actor: userId,
      });
      if (!goal) return res.status(404).json({ message: "No such goal" });
      res.json(goal);
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/goals/:id/progress", isAuthenticated, async (req, res) => {
    try {
      const userId = actor(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const goalId = goalIdOf(req);
      if (!goalId) return res.status(404).json({ message: "No such goal" });

      const parsed = recordProgressInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

      const [goal] = await db
        .select({ measurement: memberGoals.measurement })
        .from(memberGoals)
        .where(and(eq(memberGoals.id, goalId), eq(memberGoals.userId, userId)));
      if (!goal) return res.status(404).json({ message: "No such goal" });

      /*
        The goal's kind decides, unless the caller states one.

        A client that has just moved the target could otherwise post a value in
        the kind it was showing a moment ago, and the row would be filed under
        a measurement the goal no longer uses. Sending the kind is how a caller
        says which one it meant; omitting it means "whatever the goal is".
      */
      const measurement = (parsed.data.measurement ?? goal.measurement) as Measurement;
      const value = parseTarget(measurement, parsed.data.value);
      if (!value) return res.status(400).json({ message: "That isn't a value this goal is measured in" });

      const observedAt = parsed.data.observedAt ? new Date(parsed.data.observedAt) : new Date();
      const row = await recordProgress({
        userId,
        goalId,
        measurement,
        value: value as GoalTarget,
        observedAt,
        onDate: await onDateFor(userId, observedAt),
        source: "member",
        note: parsed.data.note ?? null,
      });
      if (!row) return res.status(404).json({ message: "No such goal" });
      res.status(201).json(row);
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ─── Coach, for a current client only ──────────────────────────────────

  app.get("/api/coach/clients/:memberId/goals", isAuthenticated, requireCoachOf(), async (req, res) => {
    try {
      const memberId = clientOf(req, res);
      if (!memberId) return;
      res.json(await goalsFor(memberId));
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  /**
   * A coach writing a goal during a call.
   *
   * `created_by` is the coach and `user_id` is the member, which is the whole
   * of the ownership rule: the goal appears on the member's own screen the
   * moment it is written, attributed. There is deliberately no way to create
   * one the member cannot see — a private coach-only performance target would
   * be a thing being tracked about somebody without their knowledge.
   */
  app.post("/api/coach/clients/:memberId/goals", isAuthenticated, requireCoachOf(), async (req, res) => {
    try {
      const coachId = actor(req);
      const memberId = clientOf(req, res);
      if (!memberId || !coachId) return;

      const parsed = createGoalInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

      const target = parseTarget(parsed.data.measurement, parsed.data.target);
      if (!target) return res.status(400).json({ message: "That target doesn't fit that kind of goal" });

      const goal = await createGoal({
        userId: memberId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        emphasis: parsed.data.emphasis,
        measurement: parsed.data.measurement,
        target,
        exerciseId: parsed.data.exerciseId ?? null,
        activityType: parsed.data.activityType ?? null,
        targetDate: parsed.data.targetDate ?? null,
        actor: coachId,
      });
      res.status(201).json(goal);
    } catch {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.put(
    "/api/coach/clients/:memberId/goals/:id/target",
    isAuthenticated,
    requireCoachOf(),
    async (req, res) => {
      try {
        const coachId = actor(req);
        const memberId = clientOf(req, res);
        if (!memberId || !coachId) return;
        const goalId = goalIdOf(req);
        if (!goalId) return res.status(404).json({ message: "No such goal" });

        const parsed = retargetGoalInput.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

        const target = parseTarget(parsed.data.measurement, parsed.data.target);
        if (!target) return res.status(400).json({ message: "That target doesn't fit that kind of goal" });

        const goal = await retargetGoal({
          userId: memberId,
          goalId,
          measurement: parsed.data.measurement,
          target,
          note: parsed.data.note ?? null,
          actor: coachId,
        });
        if (!goal) return res.status(404).json({ message: "No such goal" });
        res.json(goal);
      } catch {
        res.status(500).json({ message: "Internal Server Error" });
      }
    },
  );
}

/**
 * The member's own calendar date for a moment.
 *
 * Their zone, not the server's and not UTC. This was written as
 * `at.toISOString().slice(0, 10)` for the backdated case, which is the same
 * bug health data had: for a member in Los Angeles, everything after 5pm is
 * filed under tomorrow, so an evening run lands on a day they had not lived
 * yet. `todayInZone` takes the instant precisely so there is one implementation
 * of this and not a second one for entries that are not today.
 */
async function onDateFor(userId: string, at: Date): Promise<string> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  return todayInZone(user?.timezone, at);
}
