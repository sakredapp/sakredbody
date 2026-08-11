/**
 * The habit loop, over HTTP.
 *
 * Two families of route, one implementation underneath:
 *
 *   /api/habits/…                    the member, acting on themselves
 *   /api/coach/members/:userId/…     a coach, acting on somebody else
 *
 * The member routes carry no user id at all — the actor *is* the subject, so
 * there is nothing in the request to tamper with. The coach routes carry one,
 * and it passes through `subjectOf` before anything else happens. Every writer
 * beneath this file takes the subject as an argument and scopes its queries by
 * it, so a forged id in a path returns 404 rather than somebody else's data.
 */

import type { Express, Request, Response } from "express";
import { and, eq, or, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db.js";
import {
  trackedHabits,
  trackedHabitPhases,
  habitEntries,
  habitProposals,
  trackedHabitLinks,
  addTrackedHabitSchema,
  habitConfigSchema,
  logEntrySchema,
  reorderTrackedSchema,
  proposeHabitSchema,
  HABITS_THAT_TEND_TO_HOLD,
} from "../../shared/models/trackedHabits.js";
import { routineHabits } from "../../shared/models/coaching.js";
import { terrainCheckins, terrainCheckinSchema } from "../../shared/models/terrainSignals.js";
import { scheduleToColumns } from "../../shared/models/habitSchedule.js";
import { itemTypeOf, unitFor } from "../../shared/models/habitTracking.js";
import { memberToday } from "../coaching/enrollment.js";
import { isAuthenticated } from "../auth/sessionAuth.js";
import {
  actorFrom,
  subjectOf,
  trackedHabitFor,
  entryFor,
  canCoachModifyMemberHabit,
  type Actor,
} from "./authz.js";
import { habitEvent, habitDenied } from "./log.js";
import { resolveDay, resolveHistory } from "./resolve.js";
import {
  addTrackedHabit,
  reconfigure,
  pauseTracked,
  resumeTracked,
  completePhase,
  removeTracked,
  logEntry,
  acceptProposal,
  declineProposal,
  ContractError,
} from "./contracts.js";

/**
 * One place where a thrown error becomes a status code.
 *
 * ContractError carries the status it means. Anything else is ours and is a
 * 500 — leaking a Postgres message to a member tells them about our schema and
 * tells them nothing they can act on.
 */
async function handle(res: Response, fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    res.json(out ?? { ok: true });
  } catch (err) {
    if (err instanceof ContractError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    console.error("[habits]", err);
    res.status(500).json({ message: "Something went wrong on our end." });
  }
}

/**
 * Resolve actor and subject in one step.
 *
 * Returns null having already answered the request, so every handler below is
 * `const ctx = await context(req,res); if (!ctx) return;` and there is no
 * shape of handler where the check can be written after the fetch.
 */
async function context(
  req: Request,
  res: Response,
  paramUserId?: unknown,
): Promise<{ actor: Actor; subjectId: string; today: string } | null> {
  const actor = await actorFrom(req, res);
  if (!actor) return null;
  const subjectId = subjectOf(actor, paramUserId === undefined ? null : param(paramUserId));
  if (!subjectId) {
    habitDenied("subject", { actorId: actor.userId, subjectId: param(paramUserId), role: actor.role });
    res.status(403).json({ message: "You don't have access to that" });
    return null;
  }
  return { actor, subjectId, today: await memberToday(subjectId) };
}

export function registerHabitRoutes(app: Express): void {
  // ─── Reading ─────────────────────────────────────────────────────────────

  /**
   * Everything a member is on, resolved for their own today.
   *
   * Split by direction because that is how the home screen is split — one
   * request, two lists, no client-side filtering that could disagree with the
   * counts on the cards.
   */
  app.get("/api/habits/tracked", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, async () => {
      const onDate = dateParam(req.query.onDate) ?? ctx.today;
      const all = await resolveDay(ctx.subjectId, onDate);
      return {
        onDate,
        restore: all.filter((h) => h.emphasis === "yin"),
        build: all.filter((h) => h.emphasis === "yang"),
        adviceAt: HABITS_THAT_TEND_TO_HOLD,
      };
    });
  });

  app.get("/api/coach/members/:userId/habits", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res, param(req.params.userId));
    if (!ctx) return;
    await handle(res, async () => {
      const onDate = dateParam(req.query.onDate) ?? ctx.today;
      const all = await resolveDay(ctx.subjectId, onDate);
      return { onDate, restore: all.filter((h) => h.emphasis === "yin"), build: all.filter((h) => h.emphasis === "yang") };
    });
  });

  /**
   * The picker.
   *
   * Search over title, keywords and terrain tags, because a member types "mag"
   * and means magnesium, and types "sleep" and means four different items none
   * of which have the word in the title.
   */
  app.get("/api/habits/catalogue", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, async () => {
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
      const emphasis = req.query.emphasis === "yin" || req.query.emphasis === "yang"
        ? req.query.emphasis
        : null;

      const filters = [
        eq(routineHabits.published, true),
        sql`${routineHabits.emphasis} IS NOT NULL`,
      ];
      if (emphasis) filters.push(eq(routineHabits.emphasis, emphasis));
      if (q) {
        filters.push(
          or(
            sql`${routineHabits.title} ILIKE ${"%" + q + "%"}`,
            sql`${routineHabits.shortDescription} ILIKE ${"%" + q + "%"}`,
            sql`EXISTS (SELECT 1 FROM unnest(coalesce(${routineHabits.searchKeywords}, '{}')) kw WHERE kw ILIKE ${"%" + q + "%"})`,
            sql`EXISTS (SELECT 1 FROM unnest(coalesce(${routineHabits.terrainTags}, '{}')) tg WHERE tg ILIKE ${"%" + q + "%"})`,
          )!,
        );
      }

      const rows = await db
        .select()
        .from(routineHabits)
        .where(and(...filters))
        .orderBy(routineHabits.priorityLevel, routineHabits.title)
        .limit(60);

      // Which of these they're already on, so the picker can say so rather
      // than letting them add a duplicate and discover it afterwards.
      const already = await db
        .select({ id: trackedHabits.routineHabitId, status: trackedHabits.status })
        .from(trackedHabits)
        .where(
          and(
            eq(trackedHabits.userId, ctx.subjectId),
            sql`${trackedHabits.status} <> 'archived'`,
          ),
        );
      const on = new Map(already.map((a) => [a.id, a.status]));

      return rows.map((h) => ({
        id: h.id,
        habitKey: h.habitKey,
        title: h.title,
        shortDescription: h.shortDescription,
        emphasis: h.emphasis,
        trackingType: h.trackingType,
        unit: unitFor(h.trackingType),
        defaultTarget: h.defaultTarget,
        itemType: itemTypeOf(h.trackingType, h.healthMetric),
        healthMetric: h.healthMetric,
        loadClass: h.loadClass,
        priorityLevel: h.priorityLevel,
        maxPerWeek: h.maxPerWeek,
        terrainTags: h.terrainTags,
        recommendedTime: h.recommendedTime,
        durationMinutes: h.durationMinutes,
        alreadyTracking: on.get(h.id) ?? null,
      }));
    });
  });

  app.get("/api/habits/tracked/:id/history", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, () => history(ctx.subjectId, req, ctx.today));
  });

  app.get(
    "/api/coach/members/:userId/habits/:id/history",
    isAuthenticated,
    async (req, res) => {
      const ctx = await context(req, res, param(req.params.userId));
      if (!ctx) return;
      await handle(res, () => history(ctx.subjectId, req, ctx.today));
    },
  );

  /** Every contract this habit has ever been under. The audit trail, readable. */
  app.get("/api/habits/tracked/:id/phases", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, async () => {
      const tracked = await trackedHabitFor(ctx.subjectId, param(req.params.id));
      if (!tracked) throw new ContractError(404, "Not found");
      const rows = await db
        .select()
        .from(trackedHabitPhases)
        .where(eq(trackedHabitPhases.trackedHabitId, tracked.id))
        .orderBy(desc(trackedHabitPhases.startsOn));
      // coachNote is deliberately absent: it is the coach's own note and the
      // member is not its audience.
      return rows.map(({ coachNote, ...rest }) => rest);
    });
  });

  // ─── Writing: the member's own list ──────────────────────────────────────

  app.post("/api/habits/tracked", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const parsed = addTrackedHabitSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    await handle(res, () =>
      addTrackedHabit({
        subjectId: ctx.subjectId,
        routineHabitId: parsed.data.routineHabitId,
        config: parsed.data.config,
        today: ctx.today,
        actorId: ctx.actor.userId,
        source: "member",
      }),
    );
  });

  app.patch("/api/habits/tracked/:id", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const parsed = habitConfigSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    await handle(res, () =>
      reconfigure({
        subjectId: ctx.subjectId,
        trackedHabitId: param(req.params.id),
        config: parsed.data,
        today: ctx.today,
        actorId: ctx.actor.userId,
        source: "member",
      }),
    );
  });

  app.post("/api/habits/tracked/:id/pause", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, () =>
      pauseTracked({ subjectId: ctx.subjectId, trackedHabitId: param(req.params.id), today: ctx.today }),
    );
  });

  app.post("/api/habits/tracked/:id/resume", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, () =>
      resumeTracked({
        subjectId: ctx.subjectId,
        trackedHabitId: param(req.params.id),
        today: ctx.today,
        actorId: ctx.actor.userId,
      }),
    );
  });

  app.post("/api/habits/tracked/:id/complete", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const then = req.body?.then === "continue" ? "continue" : "stop";
    await handle(res, () =>
      completePhase({
        subjectId: ctx.subjectId,
        trackedHabitId: param(req.params.id),
        then,
        today: ctx.today,
        actorId: ctx.actor.userId,
      }),
    );
  });

  app.delete("/api/habits/tracked/:id", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, () =>
      removeTracked({ subjectId: ctx.subjectId, trackedHabitId: param(req.params.id), today: ctx.today }),
    );
  });

  app.post("/api/habits/tracked/reorder", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const parsed = reorderTrackedSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    await handle(res, async () => {
      // Scoped by user AND by the ids given: a foreign id in the array simply
      // matches nothing rather than reordering somebody else's list.
      const mine = await db
        .select({ id: trackedHabits.id })
        .from(trackedHabits)
        .where(
          and(
            eq(trackedHabits.userId, ctx.subjectId),
            eq(trackedHabits.emphasis, parsed.data.emphasis),
            inArray(trackedHabits.id, parsed.data.ids),
          ),
        );
      const allowed = new Set(mine.map((m) => m.id));
      await db.transaction(async (tx) => {
        let i = 0;
        for (const id of parsed.data.ids) {
          if (!allowed.has(id)) continue;
          await tx
            .update(trackedHabits)
            .set({ orderIndex: i++, updatedAt: new Date() })
            .where(eq(trackedHabits.id, id));
        }
      });
      return { ok: true, reordered: allowed.size };
    });
  });

  // ─── Writing: entries ────────────────────────────────────────────────────

  app.post("/api/habits/tracked/:id/entries", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await entryHandler(ctx, req, res, param(req.params.id));
  });

  app.post(
    "/api/coach/members/:userId/habits/:id/entries",
    isAuthenticated,
    async (req, res) => {
      const ctx = await context(req, res, param(req.params.userId));
      if (!ctx) return;
      if (!canCoachModifyMemberHabit(ctx.actor, ctx.subjectId)) {
        habitDenied("logForMember", { actorId: ctx.actor.userId, subjectId: ctx.subjectId });
        return res.status(403).json({ message: "You don't have access to that" });
      }
      await entryHandler(ctx, req, res, param(req.params.id));
    },
  );

  async function entryHandler(
    ctx: { actor: Actor; subjectId: string; today: string },
    req: Request,
    res: Response,
    trackedHabitId: string,
  ) {
    const parsed = logEntrySchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    // A back-dated entry is legitimate — people log Sunday on Monday — but not
    // an arbitrary one. Two weeks is long enough to catch up and short enough
    // that nobody rewrites a quarter.
    const onDate = parsed.data.onDate ?? ctx.today;
    if (onDate > ctx.today) {
      return res.status(400).json({ message: "You can't log a day that hasn't happened." });
    }
    if (daysApart(onDate, ctx.today) > 14) {
      return res.status(400).json({ message: "That day is too far back to change now." });
    }
    await handle(res, () =>
      logEntry({
        subjectId: ctx.subjectId,
        trackedHabitId,
        onDate,
        value: parsed.data.value,
        op: parsed.data.op,
        kind: parsed.data.kind,
        note: parsed.data.note,
        actorId: ctx.actor.userId,
      }),
    );
  }

  app.delete("/api/habits/entries/:id", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, async () => {
      const entry = await entryFor(ctx.subjectId, param(req.params.id));
      if (!entry) throw new ContractError(404, "Not found");
      await db.delete(habitEntries).where(eq(habitEntries.id, entry.id));
      habitEvent("entry.removed", {
        subjectId: ctx.subjectId,
        trackedHabitId: entry.trackedHabitId,
        onDate: entry.onDate,
      });
      return { ok: true };
    });
  });

  // ─── Coach: assigning ────────────────────────────────────────────────────

  /**
   * Assign directly.
   *
   * Same writer as the member's own path, with `source: "coach"` and the
   * actor's own id — which is where `assignedByUserId` comes from. A coach id
   * in a request body is a coach id somebody chose.
   *
   * The global catalogue row is never touched. This writes one member's
   * contract; the defaults every other member draws from stay where they are.
   */
  app.post("/api/coach/members/:userId/habits", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res, param(req.params.userId));
    if (!ctx) return;
    if (!canCoachModifyMemberHabit(ctx.actor, ctx.subjectId)) {
      habitDenied("assign", { actorId: ctx.actor.userId, subjectId: ctx.subjectId });
      return res.status(403).json({ message: "You don't have access to that" });
    }
    const parsed = addTrackedHabitSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    await handle(res, () =>
      addTrackedHabit({
        subjectId: ctx.subjectId,
        routineHabitId: parsed.data.routineHabitId,
        config: parsed.data.config,
        today: ctx.today,
        actorId: ctx.actor.userId,
        source: "coach",
      }),
    );
  });

  app.patch(
    "/api/coach/members/:userId/habits/:id",
    isAuthenticated,
    async (req, res) => {
      const ctx = await context(req, res, param(req.params.userId));
      if (!ctx) return;
      if (!canCoachModifyMemberHabit(ctx.actor, ctx.subjectId)) {
        habitDenied("reconfigure", { actorId: ctx.actor.userId, subjectId: ctx.subjectId });
        return res.status(403).json({ message: "You don't have access to that" });
      }
      const parsed = habitConfigSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, parsed.error);
      await handle(res, () =>
        reconfigure({
          subjectId: ctx.subjectId,
          trackedHabitId: param(req.params.id),
          config: parsed.data,
          today: ctx.today,
          actorId: ctx.actor.userId,
          source: "coach",
        }),
      );
    },
  );

  // ─── Proposals ───────────────────────────────────────────────────────────

  app.post("/api/coach/members/:userId/proposals", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res, param(req.params.userId));
    if (!ctx) return;
    if (!canCoachModifyMemberHabit(ctx.actor, ctx.subjectId)) {
      habitDenied("propose", { actorId: ctx.actor.userId, subjectId: ctx.subjectId });
      return res.status(403).json({ message: "You don't have access to that" });
    }
    const parsed = proposeHabitSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    await handle(res, async () => {
      const [habit] = await db
        .select()
        .from(routineHabits)
        .where(eq(routineHabits.id, parsed.data.routineHabitId))
        .limit(1);
      if (!habit?.emphasis) throw new ContractError(400, "That habit has no direction yet.");

      const cfg = parsed.data.config ?? {};
      const cols = scheduleToColumns(cfg.schedule ?? { kind: "daily" });
      const [row] = await db
        .insert(habitProposals)
        .values({
          userId: ctx.subjectId,
          routineHabitId: habit.id,
          emphasis: habit.emphasis,
          target: habit.trackingType === "boolean" ? null : (cfg.target ?? habit.defaultTarget ?? null),
          phaseType: cfg.phaseType ?? "ongoing",
          durationDays: cfg.phaseType === "fixed" ? (cfg.durationDays ?? null) : null,
          scheduleKind: cols.scheduleKind,
          scheduleDays: cols.scheduleDays,
          scheduleCount: cols.scheduleCount,
          recommendedTime: cfg.recommendedTime ?? habit.recommendedTime ?? null,
          reason: parsed.data.reason ?? null,
          proposedBy: "coach",
          proposedByUserId: ctx.actor.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        throw new ContractError(409, "You've already suggested that one and they haven't answered yet.");
      }
      habitEvent("proposal.created", {
        subjectId: ctx.subjectId,
        proposalId: row.id,
        routineHabitId: habit.id,
        byCoach: ctx.actor.userId,
      });
      return row;
    });
  });

  app.get("/api/habits/proposals", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, async () => {
      const rows = await db
        .select({ proposal: habitProposals, habit: routineHabits })
        .from(habitProposals)
        .innerJoin(routineHabits, eq(routineHabits.id, habitProposals.routineHabitId))
        .where(
          and(eq(habitProposals.userId, ctx.subjectId), eq(habitProposals.status, "proposed")),
        )
        .orderBy(desc(habitProposals.createdAt));
      return rows.map(({ proposal, habit }) => ({
        ...proposal,
        title: habit.title,
        shortDescription: habit.shortDescription,
        trackingType: habit.trackingType,
        unit: unitFor(habit.trackingType),
      }));
    });
  });

  app.post("/api/habits/proposals/:id/accept", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, () =>
      acceptProposal({
        subjectId: ctx.subjectId,
        proposalId: param(req.params.id),
        today: ctx.today,
        actorId: ctx.actor.userId,
      }),
    );
  });

  app.post("/api/habits/proposals/:id/decline", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, () =>
      declineProposal({ subjectId: ctx.subjectId, proposalId: param(req.params.id) }),
    );
  });

  // ─── Terrain signals ─────────────────────────────────────────────────────

  app.get("/api/terrain/checkin", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    await handle(res, async () => {
      const onDate = dateParam(req.query.onDate) ?? ctx.today;
      const [row] = await db
        .select()
        .from(terrainCheckins)
        .where(and(eq(terrainCheckins.userId, ctx.subjectId), eq(terrainCheckins.onDate, onDate)))
        .limit(1);
      return row ?? { onDate, empty: true };
    });
  });

  app.post("/api/terrain/checkin", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const parsed = terrainCheckinSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    await handle(res, async () => {
      const onDate = parsed.data.onDate ?? ctx.today;
      if (onDate > ctx.today) throw new ContractError(400, "That day hasn't happened yet.");
      const { onDate: _drop, ...values } = parsed.data;
      const [row] = await db
        .insert(terrainCheckins)
        .values({ userId: ctx.subjectId, onDate, ...values })
        .onConflictDoUpdate({
          target: [terrainCheckins.userId, terrainCheckins.onDate],
          set: { ...values, updatedAt: new Date() },
        })
        .returning();
      habitEvent("terrain.checkin", { subjectId: ctx.subjectId, onDate });
      return row;
    });
  });

  app.get("/api/coach/members/:userId/terrain", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res, param(req.params.userId));
    if (!ctx) return;
    await handle(res, async () => {
      const rows = await db
        .select()
        .from(terrainCheckins)
        .where(eq(terrainCheckins.userId, ctx.subjectId))
        .orderBy(desc(terrainCheckins.onDate))
        .limit(60);
      return rows;
    });
  });

  // ─── Context membership ──────────────────────────────────────────────────

  /**
   * Put an existing tracked habit into a plan, cohort or retreat.
   *
   * Deliberately not a re-add: Nick already tracks Morning Light because he
   * chose to, and his coach adding it to the Coach's Plan must not erase that
   * or give him a second copy.
   */
  app.post("/api/coach/members/:userId/habits/:id/link", isAuthenticated, async (req, res) => {
    const ctx = await context(req, res, param(req.params.userId));
    if (!ctx) return;
    if (!canCoachModifyMemberHabit(ctx.actor, ctx.subjectId)) {
      return res.status(403).json({ message: "You don't have access to that" });
    }
    const type = String(req.body?.contextType ?? "");
    const contextId = String(req.body?.contextId ?? "");
    if (!["plan", "cohort", "retreat"].includes(type) || !contextId) {
      return res.status(400).json({ message: "Say which plan, cohort or retreat." });
    }
    await handle(res, async () => {
      const tracked = await trackedHabitFor(ctx.subjectId, param(req.params.id));
      if (!tracked) throw new ContractError(404, "Not found");
      const [row] = await db
        .insert(trackedHabitLinks)
        .values({
          trackedHabitId: tracked.id,
          contextType: type,
          contextId,
          addedByUserId: ctx.actor.userId,
        })
        .onConflictDoNothing()
        .returning();
      habitEvent("tracked.linked", {
        subjectId: ctx.subjectId,
        trackedHabitId: tracked.id,
        contextType: type,
      });
      return row ?? { ok: true, alreadyLinked: true };
    });
  });
}

// ─── Small shared pieces ───────────────────────────────────────────────────

async function history(subjectId: string, req: Request, today: string) {
  const to = dateParam(req.query.to) ?? today;
  const from = dateParam(req.query.from) ?? shiftDays(to, -29);
  if (from > to) throw new ContractError(400, "That range runs backwards.");
  if (daysApart(from, to) > 366) throw new ContractError(400, "That's more than a year.");
  return resolveHistory(subjectId, param(req.params.id), from, to);
}

/** Route params are typed loosely here; one narrowing, used everywhere. */
function param(v: unknown): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

function dateParam(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function shiftDays(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
}

function daysApart(a: string, b: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(Math.round((p(b) - p(a)) / 86_400_000));
}

function badRequest(res: Response, error: { issues?: { message: string }[] }) {
  res.status(400).json({ message: error.issues?.[0]?.message ?? "That didn't look right." });
}
