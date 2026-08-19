/**
 * What the member says back.
 *
 *   PUT    /api/recommendations/:id/feedback   — 👍 or 👎, with an optional why
 *   DELETE /api/recommendations/:id/feedback   — took it back
 *   POST   /api/recommendations/:id/accepted   — tapped it
 *
 * ── Why PUT and not POST ──────────────────────────────────────────────────
 *
 * Because a verdict is a state, not an occurrence. A member who taps 👎 and
 * then 👍 has one opinion, and the second tap replaces the first rather than
 * joining it. Appending both would make every aggregate begin by working out
 * which of a member's rows counted, which is the kind of question that gets
 * answered differently in two places six months apart.
 *
 * ── Why the 404 is opaque ─────────────────────────────────────────────────
 *
 * A recommendation id belonging to somebody else answers 404, never 403. A 403
 * confirms the id exists, which turns an id space into an oracle. Same rule as
 * the private-photo path.
 *
 * ── What this endpoint deliberately cannot do ─────────────────────────────
 *
 * Change anything. A thumb writes one row in one table and no rule anywhere
 * moves. Personal ranking reads this evidence later, weighted and decaying and
 * reversible; the global engine reads it only through an aggregate a person
 * publishes. One tap has never been a preference, and the day this endpoint
 * can edit a threshold is the day a member with a bad Tuesday can.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { track, trackError } from "../telemetry/index.js";
import {
  recommendationEvents,
  recommendationFeedback,
  feedbackSchema,
} from "../../shared/models/recommendation.js";
import { markAccepted } from "./attribute.js";

const idSchema = z.string().uuid();

function fail(res: Response, where: string, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: zodMessage(err) });
  }
  trackError(where, err);
  res.status(500).json({ message: "Internal server error" });
}

/** Theirs, or nothing. Returns the row so the caller need not ask twice. */
async function own(userId: string, id: string) {
  const [row] = await db
    .select({
      id: recommendationEvents.id,
      type: recommendationEvents.recommendationType,
    })
    .from(recommendationEvents)
    .where(and(eq(recommendationEvents.id, id), eq(recommendationEvents.userId, userId)))
    .limit(1);
  return row ?? null;
}

export function registerIntelligenceRoutes(app: Express): void {
  app.put("/api/recommendations/:id/feedback", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const id = idSchema.parse(req.params.id);
      const input = feedbackSchema.parse(req.body);

      const rec = await own(userId, id);
      if (!rec) return res.status(404).json({ message: "Not found" });

      await db
        .insert(recommendationFeedback)
        .values({
          recommendationId: id,
          userId,
          verdict: input.verdict,
          reason: input.reason ?? null,
        })
        .onConflictDoUpdate({
          target: [recommendationFeedback.recommendationId, recommendationFeedback.userId],
          set: {
            verdict: input.verdict,
            /*
              Cleared when absent rather than kept. Somebody who changes 👎
              "too difficult" to 👍 has not left a reason behind; carrying the
              old one forward would attach a complaint to an endorsement.
            */
            reason: input.reason ?? null,
            updatedAt: sql`now()`,
          },
        });

      /*
        Counted, without the verdict's subject. The event says a member gave
        feedback on a recommendation of this type; what they said and why lives
        in the table that is scoped to them and deletable with them.
      */
      track("recommendation.feedback", {
        userId,
        surface: "today",
        subjectId: rec.type,
        props: { verdict: input.verdict },
      });

      res.json({ verdict: input.verdict, reason: input.reason ?? null });
    } catch (err) {
      fail(res, "recommendation.feedback", err);
    }
  });

  app.delete("/api/recommendations/:id/feedback", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const id = idSchema.parse(req.params.id);
      if (!(await own(userId, id))) return res.status(404).json({ message: "Not found" });

      await db
        .delete(recommendationFeedback)
        .where(
          and(
            eq(recommendationFeedback.recommendationId, id),
            eq(recommendationFeedback.userId, userId),
          ),
        );
      res.status(204).end();
    } catch (err) {
      fail(res, "recommendation.unfeedback", err);
    }
  });

  /**
   * They tapped the card.
   *
   * Fire-and-forget from the client's side — it navigates to Build whether or
   * not this lands, because a member should never wait on bookkeeping to start
   * a workout.
   */
  app.post("/api/recommendations/:id/accepted", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const id = idSchema.parse(req.params.id);
      if (!(await own(userId, id))) return res.status(404).json({ message: "Not found" });
      await markAccepted(userId, id);
      res.status(204).end();
    } catch (err) {
      fail(res, "recommendation.accepted", err);
    }
  });
}
