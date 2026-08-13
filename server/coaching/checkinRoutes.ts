/**
 * Coach-requested check-ins.
 *
 *   POST   /api/coach/clients/:memberId/checkin-requests   ask
 *   GET    /api/coach/clients/:memberId/checkin-requests   what has been asked
 *   DELETE /api/coach/checkin-requests/:id                 withdraw the question
 *   GET    /api/coaching/checkin-requests                  what is being asked of me
 *   POST   /api/coaching/checkin-requests/:id/complete     answer it
 *
 * ── One writer for the answers ────────────────────────────────────────────
 *
 * Completing a request writes through `saveCheckin`, the same function the
 * member's own Restore check-in uses. Not similar code — the same function. A
 * second upsert would be a second place for the conflict target, the future-date
 * refusal and the canonical event to drift, and the first divergence would show
 * up as a coach and a member reading different numbers for the same morning.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { users } from "../../shared/models/auth.js";
import { terrainCheckins, terrainCheckinSchema } from "../../shared/models/terrainSignals.js";
import {
  coachingCheckinRequests,
  checkinRequestSchema,
  type CheckinRequest,
} from "../../shared/models/checkinRequests.js";
import { isAuthenticated } from "../auth/sessionAuth.js";
import { memberToday } from "./enrollment.js";
import { activeRelationship } from "./relationships.js";
import { saveCheckin } from "../habits/checkin.js";
import { habitEvent, habitDenied } from "../habits/log.js";

/** A path segment, never trusted as anything but an opaque id. */
function param(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * The coach may ask this member, right now.
 *
 * The *current* relationship, deliberately — a former coach keeps their history
 * and loses the ability to act. There is no `superviseCoaching` bypass on
 * asking: an admin looking into an account has no business generating a
 * question in a member's Today that appears to come from their coach.
 */
async function requireClient(req: Request, res: Response): Promise<string | null> {
  const actorId = req.session!.userId!;
  const memberId = param(req.params.memberId);
  const rel = await activeRelationship(actorId, memberId);
  if (!rel) {
    habitDenied("checkin.request", { actorId, subjectId: memberId });
    // 404, not 403. A 403 confirms the account exists.
    res.status(404).json({ message: "No such member" });
    return null;
  }
  return memberId;
}

/** Names for the screen, without a join per row. */
async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(
    rows.map((r) => [r.id, [r.firstName, r.lastName].filter(Boolean).join(" ") || "Your coach"]),
  );
}

/**
 * A request, plus the check-in it was answered with — as it is *now*.
 *
 * The two timestamps are kept apart on purpose. `completedAt` is when she
 * answered him; `checkinUpdatedAt` is when the row last changed. If she revised
 * at 6pm, the coach sees the 6pm values and both times, rather than 2pm values
 * that are no longer true or 6pm values labelled 2pm.
 */
async function withAnswer(rows: CheckinRequest[]) {
  const checkinIds = rows.map((r) => r.checkinId).filter((v): v is string => Boolean(v));
  const answers = checkinIds.length
    ? await db.select().from(terrainCheckins).where(inArray(terrainCheckins.id, checkinIds))
    : [];
  const byId = new Map(answers.map((a) => [a.id, a]));
  const names = await namesFor(rows.flatMap((r) => [r.coachUserId, r.requestedByUserId]));

  return rows.map((r) => {
    const answer = r.checkinId ? (byId.get(r.checkinId) ?? null) : null;
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      coachPrompt: r.coachPrompt,
      requestedAt: r.requestedAt,
      dueOn: r.dueOn,
      completedAt: r.completedAt,
      cancelledAt: r.cancelledAt,
      coachName: names.get(r.coachUserId) ?? "Your coach",
      /**
       * Named so nobody can mistake it for a snapshot. A reader that wants to
       * print "answered at" has `completedAt`; a reader that wants to print the
       * values has these, with their own `updatedAt` beside them.
       */
      currentCheckin: answer
        ? {
            id: answer.id,
            onDate: answer.onDate,
            energy: answer.energy,
            recovery: answer.recovery,
            nervousSystem: answer.nervousSystem,
            digestion: answer.digestion,
            bodyTension: answer.bodyTension,
            mentalClarity: answer.mentalClarity,
            drive: answer.drive,
            note: answer.note,
            updatedAt: answer.updatedAt,
          }
        : null,
    };
  });
}

export function registerCheckinRequestRoutes(app: Express): void {
  // ─── The coach's side ────────────────────────────────────────────────────

  app.post(
    "/api/coach/clients/:memberId/checkin-requests",
    isAuthenticated,
    async (req: Request, res: Response) => {
      const memberId = await requireClient(req, res);
      if (!memberId) return;

      const parsed = checkinRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "That request isn't something we can ask." });
      }
      const actorId = req.session!.userId!;
      const rel = await activeRelationship(actorId, memberId);

      /**
       * A due date in the past is a mistake, not an instruction.
       *
       * Resolved against the *member's* today, because the date is a promise
       * about their day, and a coach in Lisbon setting "tomorrow" for a client
       * in Los Angeles means the client's tomorrow.
       */
      const memberDate = await memberToday(memberId);
      const dueOn = parsed.data.dueOn && parsed.data.dueOn >= memberDate ? parsed.data.dueOn : null;

      try {
        const [row] = await db
          .insert(coachingCheckinRequests)
          .values({
            memberUserId: memberId,
            coachUserId: actorId,
            relationshipId: rel?.id ?? null,
            // From the session. A coach id in a request body is a coach id
            // somebody chose.
            requestedByUserId: actorId,
            kind: parsed.data.kind,
            coachPrompt: parsed.data.coachPrompt?.trim() || null,
            dueOn,
          })
          .returning();

        habitEvent("checkin.requested", {
          subjectId: memberId,
          actorId,
          requestId: row.id,
          kind: row.kind,
        });
        return res.status(201).json(row);
      } catch (err) {
        /**
         * The partial unique index caught a second open request.
         *
         * Not an error to show as a failure — the coach's intent is already
         * true. Returning the existing one means a double-tap, a retried
         * request or two open tabs all converge on one question rather than
         * stacking three identical cards in somebody's Today.
         */
        if (String((err as { code?: string }).code) === "23505") {
          const [existing] = await db
            .select()
            .from(coachingCheckinRequests)
            .where(
              and(
                eq(coachingCheckinRequests.memberUserId, memberId),
                eq(coachingCheckinRequests.coachUserId, actorId),
                eq(coachingCheckinRequests.status, "open"),
              ),
            )
            .limit(1);
          if (existing) return res.status(200).json(existing);
        }
        throw err;
      }
    },
  );

  app.get(
    "/api/coach/clients/:memberId/checkin-requests",
    isAuthenticated,
    async (req: Request, res: Response) => {
      const memberId = await requireClient(req, res);
      if (!memberId) return;

      const rows = await db
        .select()
        .from(coachingCheckinRequests)
        .where(eq(coachingCheckinRequests.memberUserId, memberId))
        .orderBy(desc(coachingCheckinRequests.requestedAt))
        .limit(20);

      res.json(await withAnswer(rows));
    },
  );

  /**
   * Withdraw the question.
   *
   * Only an open one. A completed request cannot be un-completed by the coach —
   * the member answered, and that is a fact about her day, not a state on his
   * board. Deleting it would take her record of having replied.
   */
  app.delete("/api/coach/checkin-requests/:id", isAuthenticated, async (req, res) => {
    const actorId = req.session!.userId!;
    const [row] = await db
      .update(coachingCheckinRequests)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledByUserId: actorId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coachingCheckinRequests.id, param(req.params.id)),
          eq(coachingCheckinRequests.coachUserId, actorId),
          eq(coachingCheckinRequests.status, "open"),
        ),
      )
      .returning();

    if (!row) return res.status(404).json({ message: "No such request" });
    habitEvent("checkin.cancelled", { subjectId: row.memberUserId, actorId, requestId: row.id });
    res.json(row);
  });

  // ─── The member's side ───────────────────────────────────────────────────

  /**
   * What is being asked of me.
   *
   * Open requests only, and only from the coach who is currently mine. A
   * question from somebody who no longer coaches you is not a question you owe
   * an answer to — see the reassignment sweep below.
   */
  app.get("/api/coaching/checkin-requests", isAuthenticated, async (req, res) => {
    const userId = req.session!.userId!;
    const rows = await db
      .select()
      .from(coachingCheckinRequests)
      .where(
        and(
          eq(coachingCheckinRequests.memberUserId, userId),
          eq(coachingCheckinRequests.status, "open"),
        ),
      )
      .orderBy(desc(coachingCheckinRequests.requestedAt));

    res.json(await withAnswer(rows));
  });

  /**
   * Answer it.
   *
   * The member owns this — nobody completes a check-in on somebody else's
   * behalf, including their coach and including an admin, because the entire
   * value of the answer is that it came from the person.
   */
  app.post("/api/coaching/checkin-requests/:id/complete", isAuthenticated, async (req, res) => {
    const userId = req.session!.userId!;
    const parsed = terrainCheckinSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Those answers aren't in a range we understand." });
    }

    const [request] = await db
      .select()
      .from(coachingCheckinRequests)
      .where(
        and(
          eq(coachingCheckinRequests.id, param(req.params.id)),
          eq(coachingCheckinRequests.memberUserId, userId),
          eq(coachingCheckinRequests.status, "open"),
        ),
      )
      .limit(1);

    // Cancelled, already answered, or somebody else's — all the same 404. A
    // request that is no longer open cannot be completed as though it were.
    if (!request) return res.status(404).json({ message: "No such request" });

    const today = await memberToday(userId);
    const onDate = parsed.data.onDate ?? today;
    if (onDate > today) {
      return res.status(400).json({ message: "That day hasn't happened yet." });
    }

    const checkin = await saveCheckin({ userId, onDate, values: parsed.data });

    const [row] = await db
      .update(coachingCheckinRequests)
      .set({
        status: "completed",
        completedAt: new Date(),
        // A pointer to her canonical row. Nothing is copied out of it, so a
        // revision at 6pm is simply what this now points at.
        checkinId: checkin.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coachingCheckinRequests.id, request.id),
          eq(coachingCheckinRequests.status, "open"),
        ),
      )
      .returning();

    if (!row) return res.status(409).json({ message: "That request was already answered." });

    habitEvent("checkin.completed", {
      subjectId: userId,
      requestId: row.id,
      // Who asked, so the loop is traceable. Never what she said.
      coachUserId: row.coachUserId,
    });
    res.json((await withAnswer([row]))[0]);
  });
}

/**
 * Close out a former coach's open questions.
 *
 * Called when a member is reassigned. Sarah should not open Today tomorrow to a
 * question from somebody who no longer coaches her — she would either answer a
 * stranger or be left with a card she cannot clear.
 *
 * Cancelled rather than deleted, and *completed* requests are untouched: the
 * ones she already answered are part of her history and stay attributed to the
 * coach who asked. History remains true; access follows the live relationship.
 */
export async function closeRequestsFromFormerCoaches(
  memberUserId: string,
  keepCoachUserId: string | null,
  actorId: string,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<number> {
  const conn = tx ?? db;
  const rows = await conn
    .update(coachingCheckinRequests)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledByUserId: actorId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coachingCheckinRequests.memberUserId, memberUserId),
        eq(coachingCheckinRequests.status, "open"),
        keepCoachUserId
          ? sql`${coachingCheckinRequests.coachUserId} <> ${keepCoachUserId}`
          : sql`true`,
      ),
    )
    .returning({ id: coachingCheckinRequests.id });

  return rows.length;
}

/** Whether this member has a live question waiting. Used by nothing but the UI. */
export async function openRequestFor(memberUserId: string): Promise<CheckinRequest | null> {
  const [row] = await db
    .select()
    .from(coachingCheckinRequests)
    .where(
      and(
        eq(coachingCheckinRequests.memberUserId, memberUserId),
        eq(coachingCheckinRequests.status, "open"),
      ),
    )
    .limit(1);
  return row ?? null;
}
