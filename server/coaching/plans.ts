/**
 * Turning a plan into contracts.
 *
 * ── The rule this whole file exists to keep ───────────────────────────────
 *
 * The coach configures the existing Habit OS. There is no second engine here:
 * activation calls `addTrackedHabit`, `reconfigure` and `completePhase` — the
 * same writers a member's own actions go through — and every guarantee they
 * already carry comes along. Idempotent adds, so a practice the member already
 * keeps does not become a second standing habit. Frozen history, so yesterday
 * still grades against yesterday's target. Server-side attribution, so
 * `assignedByUserId` can never come from a request body.
 *
 * ── Why activation is one transaction ─────────────────────────────────────
 *
 * A plan is a coordinated change: four practices added, one retargeted, one
 * stopped. Applied one at a time, a failure halfway leaves a member carrying
 * half of one plan and half of another, with no record of which half and no way
 * to finish or undo it. Either the whole transition happens or the member's day
 * is exactly as it was.
 *
 * ── And why a draft touches nothing ───────────────────────────────────────
 *
 * A phase is live by construction. If a draft were phases, a coach thinking out
 * loud on a Tuesday afternoon would be changing what the member is asked to do
 * that evening, one click at a time. Intent lives in `coaching_plan_items`
 * until somebody deliberately activates it.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, transactionally } from "../db.js";
import {
  coachingPlans,
  coachingPlanItems,
  type CoachingPlan,
} from "../../shared/models/coachingPlans.js";
import {
  trackedHabits,
  trackedHabitPhases,
  trackedHabitLinks,
  habitRelations,
} from "../../shared/models/trackedHabits.js";
import { routineHabits } from "../../shared/models/coaching.js";
import { unitFor } from "../../shared/models/habitTracking.js";
import {
  reviewPlan,
  type LiveContract,
  type PlanReview,
  type ReviewHabit,
} from "../../shared/models/planReview.js";
import { addTrackedHabit, reconfigure, completePhase, ContractError } from "../habits/contracts.js";
import { terrainFor } from "../terrain/read.js";
import { memberToday } from "./enrollment.js";
import { habitEventOnCommit } from "../habits/log.js";

/** The catalogue rows a review needs, for the habits a plan names. */
async function catalogueFor(routineHabitIds: string[]): Promise<ReviewHabit[]> {
  if (!routineHabitIds.length) return [];
  const rows = await db
    .select({
      id: routineHabits.id,
      title: routineHabits.title,
      emphasis: routineHabits.emphasis,
      trackingType: routineHabits.trackingType,
      defaultTarget: routineHabits.defaultTarget,
      loadClass: routineHabits.loadClass,
      terrainFit: routineHabits.terrainFit,
      maxPerWeek: routineHabits.maxPerWeek,
      priorityLevel: routineHabits.priorityLevel,
    })
    .from(routineHabits)
    .where(inArray(routineHabits.id, routineHabitIds));
  return rows;
}

/**
 * What the member is contracted to right now, per catalogue habit.
 *
 * Read through the live phase rather than the tracked habit, because the
 * tracked habit says *that* they keep it and the phase says *what they owe* —
 * and the review is about the second.
 */
async function liveContracts(memberUserId: string): Promise<{
  contracts: LiveContract[];
  loadClasses: string[];
}> {
  const rows = await db
    .select({
      routineHabitId: trackedHabits.routineHabitId,
      trackedHabitId: trackedHabits.id,
      target: trackedHabitPhases.target,
      scheduleKind: trackedHabitPhases.scheduleKind,
      scheduleCount: trackedHabitPhases.scheduleCount,
      loadClass: routineHabits.loadClass,
    })
    .from(trackedHabits)
    .innerJoin(
      trackedHabitPhases,
      and(
        eq(trackedHabitPhases.trackedHabitId, trackedHabits.id),
        eq(trackedHabitPhases.status, "active"),
      ),
    )
    .innerJoin(routineHabits, eq(routineHabits.id, trackedHabits.routineHabitId))
    .where(and(eq(trackedHabits.userId, memberUserId), eq(trackedHabits.status, "active")));

  return {
    contracts: rows.map((r) => ({
      routineHabitId: r.routineHabitId,
      trackedHabitId: r.trackedHabitId,
      target: r.target,
      scheduleKind: r.scheduleKind,
      scheduleCount: r.scheduleCount,
    })),
    loadClasses: rows.map((r) => r.loadClass).filter((c): c is string => Boolean(c)),
  };
}

/**
 * What activating this plan would do, and whether it may.
 *
 * The same object the review screen renders and the activation executes. Two
 * computations of this would eventually differ, and the day they did a coach
 * would approve one thing and a member would be asked for another.
 */
export async function reviewOf(plan: CoachingPlan): Promise<PlanReview> {
  const items = await db
    .select()
    .from(coachingPlanItems)
    .where(eq(coachingPlanItems.planId, plan.id))
    .orderBy(coachingPlanItems.orderIndex);

  const ids = items.map((i) => i.routineHabitId);
  const [catalogue, live, conflicts] = await Promise.all([
    catalogueFor(ids),
    liveContracts(plan.memberUserId),
    ids.length
      ? db
          .select({
            habitId: habitRelations.habitId,
            relatedHabitId: habitRelations.relatedHabitId,
            note: habitRelations.note,
          })
          .from(habitRelations)
          .where(and(eq(habitRelations.relation, "conflicts"), inArray(habitRelations.habitId, ids)))
      : Promise.resolve([]),
  ]);

  /**
   * The live terrain, not a frozen note.
   *
   * A plan reviewed against this morning's stored reading would be reviewed
   * against a body that has since run five miles. Same `terrainFor` the member
   * and the coach workspace read — one body, one underlying state.
   */
  let terrainLean: Parameters<typeof reviewPlan>[0]["terrainLean"] = null;
  try {
    const onDate = await memberToday(plan.memberUserId);
    const terrain = await terrainFor(plan.memberUserId, onDate);
    terrainLean = terrain.hasBody ? terrain.lean : null;
  } catch {
    // No synced body is a normal state, not an error. The review says which
    // checks it managed to run rather than pretending it ran them all.
    terrainLean = null;
  }

  const byId = new Map(catalogue.map((h) => [h.id, h]));

  return reviewPlan({
    items: items.map((i) => ({
      routineHabitId: i.routineHabitId,
      intent: i.intent as "add" | "change" | "end",
      target: i.target,
      schedule: i.scheduleKind
        ? {
            kind: i.scheduleKind,
            days: i.scheduleDays ?? undefined,
            count: i.scheduleCount ?? undefined,
          }
        : null,
    })),
    catalogue,
    live: live.contracts,
    terrainLean,
    carryingLoadClasses: live.loadClasses,
    declaredConflicts: conflicts,
    unitOf: (h) => {
      const row = byId.get(h.id);
      return row ? ` ${unitFor(row.trackingType) ?? ""}`.trimEnd() : "";
    },
  });
}

/**
 * Make the plan true, or change nothing.
 *
 * ── What is deliberately not done ─────────────────────────────────────────
 *
 * Habits the plan does not mention are left completely alone. A Coach's Plan is
 * not a replacement for the member's life: Sarah's own morning walk is hers,
 * and reading "absent from the plan" as "stop it" would quietly delete
 * practices nobody asked to end.
 */
export async function activatePlan(opts: {
  plan: CoachingPlan;
  actorId: string;
}): Promise<CoachingPlan> {
  const { plan, actorId } = opts;

  if (plan.status !== "draft") {
    throw new ContractError(409, "That plan isn't a draft.");
  }

  const review = await reviewOf(plan);
  if (!review.canActivate) {
    const first = review.findings.find((f) => f.level === "block");
    throw new ContractError(422, first?.message ?? "That plan can't be activated yet.");
  }

  const items = await db
    .select()
    .from(coachingPlanItems)
    .where(eq(coachingPlanItems.planId, plan.id))
    .orderBy(coachingPlanItems.orderIndex);

  const today = await memberToday(plan.memberUserId);
  const { contracts } = await liveContracts(plan.memberUserId);
  const liveBy = new Map(contracts.map((c) => [c.routineHabitId, c]));
  const byId = new Map(review.changes.map((c) => [c.routineHabitId, c]));

  /**
   * One transaction for the whole transition — and one *connection*.
   *
   * `addTrackedHabit`, `reconfigure` and `completePhase` are each transactional
   * on their own, and it is tempting to read that as enough. It is not. They
   * transact against the pool, so calling them from in here would check out
   * separate connections and commit independently of this block — leaving, on a
   * failure partway through, a member carrying the first three changes of a plan
   * that is still a draft.
   *
   * Passing `tx` is what makes the guarantee real: their statements run on this
   * connection, in this transaction, and roll back with it. That is also why
   * none of them were reimplemented here — every rule they enforce still applies.
   *
   * `transactionally` rather than `db.transaction` for the same reason one step
   * out: the events this earns are held until the commit returns. A member
   * should never be told about a change the database refused.
   */
  await transactionally(async (tx) => {
    for (const item of items) {
      const change = byId.get(item.routineHabitId);
      if (!change || change.action === "keep") continue;

      const live = liveBy.get(item.routineHabitId);
      const config = {
        target: item.target ?? undefined,
        schedule: item.scheduleKind
          ? ({
              kind: item.scheduleKind,
              days: item.scheduleDays ?? undefined,
              count: item.scheduleCount ?? undefined,
            } as never)
          : undefined,
        recommendedTime: item.recommendedTime ?? undefined,
        memberReason: item.memberReason ?? undefined,
        coachNote: item.coachNote ?? undefined,
      };

      if (change.action === "end") {
        if (live) {
          /**
           * `then: "stop"` — the coach said end this practice, so it ends.
           *
           * The Habit OS already distinguishes this from a fixed phase running
           * out and carrying on (`then: "continue"`), which is exactly the
           * "end with plan / continue" question, already answered. The phase is
           * completed and kept; nothing is deleted, so February still shows in
           * their history.
           */
          await completePhase({
            subjectId: plan.memberUserId,
            trackedHabitId: live.trackedHabitId,
            then: "stop",
            today,
            actorId,
            tx,
          });
        }
        continue;
      }

      let trackedHabitId: string;
      if (change.action === "change" && live) {
        // Ends the old contract and opens a new one. The old row is frozen by
        // the database trigger — history keeps saying 140g for the days it was.
        await reconfigure({
          subjectId: plan.memberUserId,
          trackedHabitId: live.trackedHabitId,
          config,
          today,
          actorId,
          source: "plan",
          tx,
        });
        trackedHabitId = live.trackedHabitId;
      } else {
        const result = await addTrackedHabit({
          subjectId: plan.memberUserId,
          routineHabitId: item.routineHabitId,
          config,
          today,
          actorId,
          source: "plan",
          tx,
        });
        trackedHabitId = result.tracked.id;
      }

      /**
       * Membership, not ownership.
       *
       * The link says this habit is part of this plan. It does not overwrite
       * the fact that the member may have started it themselves — that lives on
       * `tracked_habits.first_added_by` and is never rewritten here.
       */
      await tx
        .insert(trackedHabitLinks)
        .values({
          trackedHabitId,
          contextType: "plan",
          contextId: plan.id,
          addedByUserId: actorId,
        })
        .onConflictDoNothing();
    }

    await tx
      .update(coachingPlans)
      .set({
        status: "active",
        activatedAt: new Date(),
        activatedByUserId: actorId,
        startsOn: plan.startsOn ?? today,
        updatedAt: new Date(),
      })
      .where(eq(coachingPlans.id, plan.id));

    // Held, not emitted. It publishes with everything else the activation
    // earned, once — and only if the whole transition survived.
    habitEventOnCommit(tx, "plan.activated", {
      subjectId: plan.memberUserId,
      planId: plan.id,
      actorId,
      changes: review.changes.filter((c) => c.action !== "keep").length,
    });
  });

  const [updated] = await db.select().from(coachingPlans).where(eq(coachingPlans.id, plan.id));
  return updated;
}

/**
 * Stop a plan.
 *
 * Deliberately does not touch the member's habits. A plan ending is a change in
 * who is directing the work, not an instruction to stop practising — and the
 * alternative, cancelling every linked phase at midnight, would take somebody's
 * whole routine away because a coaching arrangement finished. Ending individual
 * practices is a decision a coach makes practice by practice, through the
 * normal path.
 */
export async function endPlan(opts: { planId: string; actorId: string }): Promise<CoachingPlan | null> {
  const [row] = await db
    .update(coachingPlans)
    .set({
      status: "ended",
      endedAt: new Date(),
      endedByUserId: opts.actorId,
      updatedAt: new Date(),
    })
    .where(and(eq(coachingPlans.id, opts.planId), sql`${coachingPlans.status} <> 'ended'`))
    .returning();
  return row ?? null;
}

/** The member's live plan, if they have one. */
export async function activePlanFor(memberUserId: string): Promise<CoachingPlan | null> {
  const [row] = await db
    .select()
    .from(coachingPlans)
    .where(and(eq(coachingPlans.memberUserId, memberUserId), eq(coachingPlans.status, "active")))
    .limit(1);
  return row ?? null;
}
