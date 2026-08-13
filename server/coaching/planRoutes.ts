/**
 * Coach's Plan — API.
 *
 *   Coach (or an admin under superviseCoaching), for one client:
 *     GET    /api/coach/clients/:memberId/plans            active + history
 *     POST   /api/coach/clients/:memberId/plans            start a draft
 *     PATCH  /api/coach/plans/:planId                      edit the draft
 *     PUT    /api/coach/plans/:planId/items                set its practices
 *     GET    /api/coach/plans/:planId/review               what activation does
 *     POST   /api/coach/plans/:planId/activate             make it true
 *     POST   /api/coach/plans/:planId/end                  stop it
 *     DELETE /api/coach/plans/:planId                      discard a draft
 *     GET    /api/coach/catalogue                          practices to choose
 *
 *   Member:
 *     GET    /api/coaching/plan                            my plan, as I may see it
 *
 * ── Authorization, and the one thing it must not miss ─────────────────────
 *
 * `/plans` under a client goes through `requireCoachOf`, same as the rest of
 * the workspace. The plan-scoped routes carry a plan id rather than a member
 * id, so they resolve the plan first and then check the *member it belongs to*
 * — never a member named in the request. A stale draft is exactly the shape of
 * thing that would otherwise become a way around a revoked relationship: Nick
 * drafts a plan, Sarah is reassigned, Nick still holds the id.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { storage } from "../storage.js";
import { can, effectiveRole } from "../../shared/models/access.js";
import { routineHabits } from "../../shared/models/coaching.js";
import { users } from "../../shared/models/auth.js";
import {
  coachingPlans,
  coachingPlanItems,
  planDraftSchema,
  planItemSchema,
  planRanItsCourse,
  type CoachingPlan,
} from "../../shared/models/coachingPlans.js";
import { scheduleToColumns } from "../../shared/models/habitSchedule.js";
import { requireCoachOf, coachOf } from "./relationships.js";
import { activatePlan, activePlanFor, endPlan, reviewOf } from "./plans.js";
import { ContractError } from "../habits/contracts.js";
import { z } from "zod";

function fail(res: Response, where: string, err: unknown) {
  if (err instanceof ContractError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  console.error(`[plans] ${where} failed`, err);
  res.status(500).json({ message: "Internal Server Error" });
}

declare module "express-serve-static-core" {
  interface Request {
    plan?: CoachingPlan;
  }
}

/**
 * Resolve a plan and prove the caller may act on the member it belongs to.
 *
 * The check is against the plan's member, read from the row — never from
 * anything the caller supplied. And it is against the *current* relationship,
 * so a coach who has been reassigned away cannot activate a draft they still
 * hold the id for. Stale drafts must not be a back door around revocation.
 */
function requirePlan(opts: { mustBeDraft?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.session?.userId;
      if (!actorId) return res.status(401).json({ message: "Not authenticated" });

      const planId = String((req.params as Record<string, unknown>).planId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(planId)) {
        return res.status(404).json({ message: "No such plan" });
      }

      const [plan] = await db.select().from(coachingPlans).where(eq(coachingPlans.id, planId));
      if (!plan) return res.status(404).json({ message: "No such plan" });

      const actor = await storage.getUser(actorId);
      if (!actor) return res.status(401).json({ message: "Not authenticated" });

      const role = effectiveRole(actor);
      const isSupervisor = can(role, "superviseCoaching");
      const relationship = isSupervisor ? null : await coachOf(plan.memberUserId);
      const isCurrentCoach = relationship?.coachUserId === actorId;

      if (!isSupervisor && !isCurrentCoach) {
        // Same 404 whether the plan is somebody else's or does not exist.
        return res.status(404).json({ message: "No such plan" });
      }

      if (opts.mustBeDraft && plan.status !== "draft") {
        return res.status(409).json({ message: "That plan is no longer a draft." });
      }

      req.plan = plan;
      next();
    } catch (err) {
      fail(res, "plan gate", err);
    }
  };
}

/** The plan, with its items joined to the catalogue for display. */
async function planWithItems(plan: CoachingPlan) {
  const items = await db
    .select({
      id: coachingPlanItems.id,
      routineHabitId: coachingPlanItems.routineHabitId,
      intent: coachingPlanItems.intent,
      target: coachingPlanItems.target,
      scheduleKind: coachingPlanItems.scheduleKind,
      scheduleDays: coachingPlanItems.scheduleDays,
      scheduleCount: coachingPlanItems.scheduleCount,
      recommendedTime: coachingPlanItems.recommendedTime,
      memberReason: coachingPlanItems.memberReason,
      coachNote: coachingPlanItems.coachNote,
      orderIndex: coachingPlanItems.orderIndex,
      title: routineHabits.title,
      emphasis: routineHabits.emphasis,
      trackingType: routineHabits.trackingType,
      defaultTarget: routineHabits.defaultTarget,
      loadClass: routineHabits.loadClass,
    })
    .from(coachingPlanItems)
    .innerJoin(routineHabits, eq(routineHabits.id, coachingPlanItems.routineHabitId))
    .where(eq(coachingPlanItems.planId, plan.id))
    .orderBy(asc(coachingPlanItems.orderIndex));

  return { ...plan, ranItsCourse: planRanItsCourse(plan), items };
}

export function registerCoachPlanRoutes(app: Express): void {
  /**
   * The catalogue a coach may choose from.
   *
   * Published items only, and no free-text alternative anywhere in this API.
   * The Habit OS runs on defined practices with a load class, a terrain fit and
   * a tracking contract; a name typed into a box has none of those, so it
   * cannot be scheduled, graded, measured against a health metric or weighed by
   * the safety check.
   */
  app.get("/api/coach/catalogue", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: routineHabits.id,
          title: routineHabits.title,
          shortDescription: routineHabits.shortDescription,
          emphasis: routineHabits.emphasis,
          trackingType: routineHabits.trackingType,
          defaultTarget: routineHabits.defaultTarget,
          recommendedTime: routineHabits.recommendedTime,
          loadClass: routineHabits.loadClass,
          priorityLevel: routineHabits.priorityLevel,
          terrainFit: routineHabits.terrainFit,
          maxPerWeek: routineHabits.maxPerWeek,
          terrainTags: routineHabits.terrainTags,
        })
        .from(routineHabits)
        .where(eq(routineHabits.published, true))
        .orderBy(asc(routineHabits.title));
      res.json({ habits: rows });
    } catch (err) {
      fail(res, "catalogue", err);
    }
  });

  // ── A client's plans ─────────────────────────────────────────────────────

  app.get(
    "/api/coach/clients/:memberId/plans",
    isAuthenticated,
    requireCoachOf("memberId"),
    async (req: Request, res: Response) => {
      try {
        const memberId = String(req.params.memberId ?? "");
        const rows = await db
          .select()
          .from(coachingPlans)
          .where(eq(coachingPlans.memberUserId, memberId))
          .orderBy(desc(coachingPlans.createdAt));

        const active = rows.find((p) => p.status === "active") ?? null;
        const draft = rows.find((p) => p.status === "draft") ?? null;

        res.json({
          active: active ? await planWithItems(active) : null,
          draft: draft ? await planWithItems(draft) : null,
          /** History, not every phase row — a coach reads plans, not contracts. */
          history: rows
            .filter((p) => p.status === "ended")
            .map((p) => ({
              id: p.id,
              title: p.title,
              focus: p.focus,
              startsOn: p.startsOn,
              endsOn: p.endsOn,
              endedAt: p.endedAt,
              coachUserId: p.coachUserId,
              ranItsCourse: planRanItsCourse(p),
            })),
        });
      } catch (err) {
        fail(res, "plans", err);
      }
    },
  );

  /** Start a draft. Nothing about the member's day changes. */
  app.post(
    "/api/coach/clients/:memberId/plans",
    isAuthenticated,
    requireCoachOf("memberId"),
    async (req: Request, res: Response) => {
      try {
        const parsed = planDraftSchema.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

        const memberId = String(req.params.memberId ?? "");
        const actorId = req.session!.userId!;

        const existing = await db
          .select({ id: coachingPlans.id })
          .from(coachingPlans)
          .where(
            and(eq(coachingPlans.memberUserId, memberId), eq(coachingPlans.status, "draft")),
          )
          .limit(1);
        if (existing.length) {
          return res.status(409).json({ message: "There's already a draft for this member." });
        }

        /**
         * The plan belongs to the member's current coach, and records the human
         * who created it separately.
         *
         * An admin intervening under `superviseCoaching` is not the coach, and
         * writing their id into `coach_user_id` would attribute the arrangement
         * to somebody who is not in it. Where there is no coach at all — an
         * admin acting on an unassigned member — the actor stands as both,
         * which is at least true.
         */
        const relationship = await coachOf(memberId);
        const coachUserId = relationship?.coachUserId ?? actorId;
        if (coachUserId === memberId) {
          return res.status(400).json({ message: "Somebody cannot plan for themselves." });
        }

        const [plan] = await db
          .insert(coachingPlans)
          .values({
            memberUserId: memberId,
            coachUserId,
            relationshipId: relationship?.id ?? null,
            title: parsed.data.title,
            focus: parsed.data.focus ?? null,
            memberVisibleNote: parsed.data.memberVisibleNote ?? null,
            internalNote: parsed.data.internalNote ?? null,
            startsOn: parsed.data.startsOn ?? null,
            endsOn: parsed.data.endsOn ?? null,
            status: "draft",
            createdByUserId: actorId,
          })
          .returning();

        res.status(201).json(await planWithItems(plan));
      } catch (err) {
        fail(res, "create plan", err);
      }
    },
  );

  app.patch(
    "/api/coach/plans/:planId",
    isAuthenticated,
    requirePlan({ mustBeDraft: true }),
    async (req: Request, res: Response) => {
      try {
        const parsed = planDraftSchema.partial().safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

        const [plan] = await db
          .update(coachingPlans)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(coachingPlans.id, req.plan!.id))
          .returning();
        res.json(await planWithItems(plan));
      } catch (err) {
        fail(res, "edit plan", err);
      }
    },
  );

  /**
   * Set the whole list of practices at once.
   *
   * Replacing rather than patching item by item: the editor holds a list, and
   * a PUT of that list cannot drift out of step with what the coach is looking
   * at. Only a draft can be edited, so nothing live is touched by this.
   */
  app.put(
    "/api/coach/plans/:planId/items",
    isAuthenticated,
    requirePlan({ mustBeDraft: true }),
    async (req: Request, res: Response) => {
      try {
        const parsed = z
          .object({ items: z.array(planItemSchema).max(40) })
          .safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) });

        const planId = req.plan!.id;
        const items = parsed.data.items;

        if (items.length) {
          const known = await db
            .select({ id: routineHabits.id })
            .from(routineHabits)
            .where(
              and(
                inArray(routineHabits.id, items.map((i) => i.routineHabitId)),
                eq(routineHabits.published, true),
              ),
            );
          if (known.length !== new Set(items.map((i) => i.routineHabitId)).size) {
            return res.status(400).json({ message: "One of those practices isn't available." });
          }
        }

        await db.transaction(async (tx) => {
          await tx.delete(coachingPlanItems).where(eq(coachingPlanItems.planId, planId));
          if (!items.length) return;
          await tx.insert(coachingPlanItems).values(
            items.map((i, index) => {
              const cols = i.schedule ? scheduleToColumns(i.schedule as never) : null;
              return {
                planId,
                routineHabitId: i.routineHabitId,
                intent: i.intent,
                target: i.target ?? null,
                scheduleKind: cols?.scheduleKind ?? null,
                scheduleDays: cols?.scheduleDays ?? null,
                scheduleCount: cols?.scheduleCount ?? null,
                recommendedTime: i.recommendedTime ?? null,
                memberReason: i.memberReason ?? null,
                coachNote: i.coachNote ?? null,
                orderIndex: index,
              };
            }),
          );
        });

        res.json(await planWithItems(req.plan!));
      } catch (err) {
        fail(res, "set items", err);
      }
    },
  );

  /** What activation would do. The same object activation then executes. */
  app.get(
    "/api/coach/plans/:planId/review",
    isAuthenticated,
    requirePlan(),
    async (req: Request, res: Response) => {
      try {
        res.json(await reviewOf(req.plan!));
      } catch (err) {
        fail(res, "review", err);
      }
    },
  );

  app.post(
    "/api/coach/plans/:planId/activate",
    isAuthenticated,
    requirePlan({ mustBeDraft: true }),
    async (req: Request, res: Response) => {
      try {
        const plan = await activatePlan({ plan: req.plan!, actorId: req.session!.userId! });
        res.json(await planWithItems(plan));
      } catch (err) {
        fail(res, "activate", err);
      }
    },
  );

  app.post(
    "/api/coach/plans/:planId/end",
    isAuthenticated,
    requirePlan(),
    async (req: Request, res: Response) => {
      try {
        const ended = await endPlan({ planId: req.plan!.id, actorId: req.session!.userId! });
        if (!ended) return res.status(409).json({ message: "That plan has already ended." });
        res.json(await planWithItems(ended));
      } catch (err) {
        fail(res, "end plan", err);
      }
    },
  );

  /** Discard a draft. Only a draft — an activated plan is a record. */
  app.delete(
    "/api/coach/plans/:planId",
    isAuthenticated,
    requirePlan({ mustBeDraft: true }),
    async (req: Request, res: Response) => {
      try {
        await db.delete(coachingPlans).where(eq(coachingPlans.id, req.plan!.id));
        res.json({ ok: true });
      } catch (err) {
        fail(res, "discard draft", err);
      }
    },
  );

  // ── The member's own view ────────────────────────────────────────────────

  /**
   * My plan.
   *
   * Never carries `internalNote`, and never carries an item's `coachNote`. Those
   * are the coach's own and the member is not their audience — the same
   * separation `tracked_habit_phases` keeps between `member_reason` and
   * `coach_note`. The columns are named here rather than the row spread, because
   * a spread is how a private field reaches a screen the day somebody adds one.
   */
  app.get("/api/coaching/plan", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const memberId = req.session!.userId!;
      const plan = await activePlanFor(memberId);
      if (!plan) return res.json({ plan: null });

      const [coach] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(eq(users.id, plan.coachUserId));

      const items = await db
        .select({
          routineHabitId: coachingPlanItems.routineHabitId,
          title: routineHabits.title,
          emphasis: routineHabits.emphasis,
          /** The member's "why". Written to them, on purpose. */
          memberReason: coachingPlanItems.memberReason,
          orderIndex: coachingPlanItems.orderIndex,
        })
        .from(coachingPlanItems)
        .innerJoin(routineHabits, eq(routineHabits.id, coachingPlanItems.routineHabitId))
        .where(
          and(
            eq(coachingPlanItems.planId, plan.id),
            sql`${coachingPlanItems.intent} <> 'end'`,
          ),
        )
        .orderBy(asc(coachingPlanItems.orderIndex));

      res.json({
        plan: {
          id: plan.id,
          title: plan.title,
          focus: plan.focus,
          note: plan.memberVisibleNote,
          startsOn: plan.startsOn,
          endsOn: plan.endsOn,
          coach: coach
            ? {
                id: coach.id,
                name: [coach.firstName, coach.lastName].filter(Boolean).join(" ").trim() || "Your coach",
                firstName: coach.firstName,
                profileImageUrl: coach.profileImageUrl,
              }
            : null,
          items,
        },
      });
    } catch (err) {
      fail(res, "member plan", err);
    }
  });
}
