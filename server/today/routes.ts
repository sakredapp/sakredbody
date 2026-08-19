/**
 * Today — one request, one answer to "what should I do in the next hour".
 *
 *   GET  /api/today               — the read, three options, the sky, the stats
 *   POST /api/today/dismiss       — not today, or not for me
 *   GET  /api/rhythm              — subjects the member holds, already estimated
 *   POST /api/rhythm/subjects     — start tracking a rhythm (theirs, or a partner's)
 *   PATCH/DELETE /api/rhythm/subjects/:id
 *   POST /api/rhythm/subjects/:id/events — a period started, a phase confirmed
 *
 * ── Why one endpoint and not six ──────────────────────────────────────────
 *
 * Today is the screen that has to be right on a cold open over a bad
 * connection, and the previous design had it assembling itself from four
 * requests that could each fail separately. A member with two of four resolved
 * sees a screen that contradicts itself: "we don't know much about your day"
 * above a card that has clearly read their sleep.
 *
 * So the read is computed server-side, in one round trip, from one consistent
 * snapshot. The client renders it and decides nothing.
 *
 * ── Nothing here decides anything either ──────────────────────────────────
 *
 * Every judgement — what counts as a short night, how much a phase is allowed
 * to matter, which three options to offer — lives in `shared/models/recommend.ts`
 * and is covered by tests that run without a database. This file gathers and
 * hands over. If a threshold ever appears in it, it is in the wrong place.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, desc, isNull, sql } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { zodMessage } from "../../shared/utils/zodMessage.js";
import { trackError } from "../telemetry/index.js";
import { memberToday } from "../coaching/enrollment.js";
import {
  rhythmSubjects,
  rhythmEvents,
  suggestionDismissals,
  rhythmSubjectSchema,
  rhythmEventSchema,
  dismissSchema,
} from "../../shared/schema.js";
import { users } from "../../shared/models/auth.js";
import {
  readReadiness,
  suggestToday,
  readLine,
  moonGuidance,
  seasonGuidance,
  skyLine,
} from "../../shared/models/recommend.js";
import { gatedLine } from "../../shared/models/buildToday.js";
import { terrainFor } from "../terrain/read.js";
import { record, withHandle, type RecommendationDraft } from "../intelligence/record.js";
import { markDismissed } from "../intelligence/attribute.js";
import { SELF_GUIDE, phaseLabel } from "../../shared/models/rhythm.js";
import { relationshipGuidance, selfRelationalReads } from "../../shared/models/relating.js";
import { moonState, elementalSeason } from "../../shared/utils/almanac.js";
import {
  healthReadings,
  todaysCheckin,
  terrainLeanFrom,
  trainingRead,
  rhythmReads,
  ownCycleLean,
  excludedCategories,
  toReadinessSignals,
  toSelfSignals,
  type SubjectRead,
} from "./signals.js";

function fail(res: Response, where: string, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: zodMessage(err) });
  }
  trackError(where, err);
  res.status(500).json({ message: "Internal server error" });
}

/**
 * A subject, dressed for whoever is reading it.
 *
 * Two layers, and the split is the correction that matters. `relation` decides
 * what the guidance is *for* — living it, or supporting somebody living it.
 * The subject's own context decides what knowledge is *relevant*: a female
 * partner's cycle is derivable from entered dates, a male partner's work week
 * is not derivable from anything, and the guidance layer knows the difference.
 *
 * The partner view carries guidance and never observations. No symptom, no
 * note, no measurement — a card that reads out what somebody privately
 * recorded about their own body is a different and much worse product than one
 * that says "keep tonight uncomplicated".
 */
function presentSubject(read: SubjectRead) {
  const selfGuide =
    read.relation === "self" && read.estimate.phase ? SELF_GUIDE[read.estimate.phase] : null;

  const guidance =
    read.relation === "self"
      ? []
      : relationshipGuidance({
          subjectSex: read.subjectSex,
          contexts: read.contexts,
          phase: read.estimate.phase,
          phaseConfidence: read.estimate.confidence,
        });

  return {
    id: read.id,
    relation: read.relation,
    label: read.label,
    subjectSex: read.subjectSex,
    supportPreference: read.supportPreference,
    model: read.model,
    /** Hedged or omitted by confidence — see phaseLabel. */
    phaseLabel: phaseLabel(read.estimate),
    phase: read.estimate.phase,
    cycleDay: read.estimate.cycleDay,
    confidence: read.estimate.confidence,
    stale: read.estimate.stale,
    /** What the member entered about their week, so the UI can offer to clear it. */
    contexts: read.contexts,
    /** Her own view of her own phase. Null for a partner subject. */
    guide: selfGuide
      ? {
          theme: selfGuide.theme,
          summary: selfGuide.summary,
          goodMove: selfGuide.goodMove,
          worthAsking: selfGuide.worthAsking,
        }
      : null,
    /**
     * Ordered by authority, each carrying the basis it rests on. Never more
     * than two — three is a briefing about a person rather than a nudge about
     * tonight.
     */
    guidance,
  };
}

async function ownSubject(userId: string, subjectId: string) {
  const [row] = await db
    .select()
    .from(rhythmSubjects)
    .where(and(eq(rhythmSubjects.id, subjectId), eq(rhythmSubjects.ownerUserId, userId)))
    .limit(1);
  return row ?? null;
}

export function registerTodayRoutes(app: Express): void {
  // ── The screen ───────────────────────────────────────────────────────────

  app.get("/api/today", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const today = await memberToday(userId);

      /**
       * Gathered together rather than in sequence.
       *
       * Five independent queries awaited one after another is five round trips
       * of latency on the screen that opens first. None of them depends on
       * another's result, so none of them should wait for one.
       */
      const [health, checkin, training, subjects, excluded, terrain] = await Promise.all([
        healthReadings(userId, today),
        todaysCheckin(userId, today),
        trainingRead(userId, today),
        rhythmReads(userId, today),
        excludedCategories(userId, today),
        /**
         * The canonical state, so this screen cannot contradict Home.
         *
         * Alongside the others rather than after them — it shares their inputs
         * but not their results, so making it wait would buy nothing.
         */
        terrainFor(userId, today),
      ]);

      const self = subjects.find((s) => s.relation === "self") ?? null;

      const read = readReadiness(
        toReadinessSignals({
          readings: health.readings,
          terrainLean: terrainLeanFrom(checkin),
          training,
          cycleLean: ownCycleLean(subjects),
        }),
      );

      const suggestions = suggestToday({
        read,
        recentCategories: training.recentCategories,
        excluded,
      });

      // Midday UTC, matching almanacFor — the phase must not flip because a
      // request arrived at 23:50.
      const [y, m, d] = today.split("-").map(Number);
      const at = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const moon = moonGuidance(moonState(at).phase);
      const season = seasonGuidance(elementalSeason(at).element);

      /**
       * Write down what was just decided, before saying it out loud.
       *
       * Three recommendations: the three options. The moon and the season are
       * not here — the same words go to everybody on the planet that day,
       * chosen by an ephemeris, and calling that a recommendation to this
       * member would put the largest and least personal thing on the screen
       * into the table that is supposed to measure personalisation.
       *
       * Terrain is not here either, and not because it isn't a
       * recommendation — it is the most consequential one the engine makes.
       * It is recorded where the member actually reads it, on
       * `/api/terrain/today`. The copy on this response exists so Build can
       * gate against the canonical state without a second request, and
       * recording a recommendation at the point it is passed through rather
       * than shown would count the same advice twice on the strength of an
       * implementation detail.
       *
       * `relating` is not here either, this pass. It is genuinely personal
       * and genuinely adaptive, and it is also the most sensitive thing the
       * engine says — how somebody is likely to treat the people around them
       * — so it gets recorded when there is a considered answer about what a
       * thumbs-down on it would mean, not because the loop was being wired
       * and it was nearby.
       */
      const drafts: RecommendationDraft[] = suggestions.map((s, rank) => ({
        type: "today_option" as const,
        key: s.category,
        surface: "today",
        canonicalActionType: "exercise_category" as const,
        canonicalActionId: s.category,
        reasonCodes: s.codes,
        provenance: {
          rank,
          side: s.side,
          orientation: s.orientation,
          isStretch: s.isStretch,
          readinessLevel: read.level,
          /*
            How much the engine actually knew. A recommendation made with no
            signals is a different act from the same recommendation made with
            three, and an aggregate that cannot separate them would judge the
            engine on days it openly said it could not read.
          */
          confidence: read.confidence,
        },
      }));
      const recorded = await record(userId, today, drafts);

      res.json({
        date: today,
        read,
        /**
         * Terrain has the final say on direction.
         *
         * `readLine` is generated from a readiness level that can reach
         * `primed` on a day canonical Terrain calls restore — good sleep, low
         * resting heart rate, and a check-in saying they feel wrecked. Both
         * sentences shipped, four seconds apart, off one database.
         */
        line: gatedLine(terrain.lean, readLine(read), read),
        /** Each option carries the id of the recommendation it *is*. */
        suggestions: suggestions.map((s) => withHandle(recorded, "today_option", s.category, s)),
        /**
         * The canonical state, passed through so Build can gate on it without
         * a second request — and so nothing downstream has to re-derive it.
         */
        terrain: {
          lean: terrain.lean,
          headline: terrain.headline,
          reasons: terrain.reasons,
          hasBody: terrain.hasBody,
          hasReport: terrain.hasReport,
        },
        /**
         * Practice first, names second — the ordering rule the product runs
         * on. `sky` is the subtitle: "New moon · Late summer".
         */
        moon,
        season,
        sky: skyLine(moon, season),
        stats: health.stats,
        checkedIn: Boolean(checkin),
        rhythm: subjects.map(presentSubject),
        /**
         * How their own state is likely to land on other people.
         *
         * Built entirely from their own measurements, which is what makes it
         * the one thing here that can be stated at full strength. Null on a
         * steady day — a card that appears every morning telling somebody to
         * communicate better is a nag.
         */
        relating: selfRelationalReads(
          read,
          toSelfSignals({
            readings: health.readings,
            sleepHistory: health.sleepHistory,
            checkin,
            training,
          }),
          { phase: self?.estimate.phase ?? null, phaseConfidence: self?.estimate.confidence },
        ),
      });
    } catch (err) {
      fail(res, "today.read", err);
    }
  });

  // ── Not that ─────────────────────────────────────────────────────────────

  /**
   * Dismiss a suggestion.
   *
   * `today` writes a dated row that expires on its own; `forever` writes a
   * null-dated one that feeds `excluded`. Idempotent, because the failure mode
   * of a tap on a slow connection is a second tap.
   */
  app.post("/api/today/dismiss", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const input = dismissSchema.parse(req.body);
      const today = await memberToday(userId);

      await db
        .insert(suggestionDismissals)
        .values({
          userId,
          category: input.category,
          onDate: input.scope === "today" ? today : null,
        })
        .onConflictDoNothing();

      /*
        The refusal, against the recommendation it refuses. Best-effort and
        after the dismissal itself is safely stored — a member saying "not
        this" must take effect whether or not the bookkeeping lands.
      */
      void markDismissed(userId, today, input.category);

      res.status(204).end();
    } catch (err) {
      fail(res, "today.dismiss", err);
    }
  });

  /** Take it back — used by the settings list of things they've turned off. */
  app.delete("/api/today/dismiss/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const category = String(req.params.category);
      await db
        .delete(suggestionDismissals)
        .where(
          and(
            eq(suggestionDismissals.userId, req.session!.userId!),
            eq(suggestionDismissals.category, category),
            isNull(suggestionDismissals.onDate),
          ),
        );
      res.status(204).end();
    } catch (err) {
      fail(res, "today.undismiss", err);
    }
  });

  // ── Rhythm ───────────────────────────────────────────────────────────────

  app.get("/api/rhythm", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const today = await memberToday(userId);
      const [subjects, [user]] = await Promise.all([
        rhythmReads(userId, today),
        db.select({ sex: users.sex, relationshipStatus: users.relationshipStatus })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
      ]);

      res.json({
        date: today,
        subjects: subjects.map(presentSubject),
        /**
         * Passed through so the client can order the two cards, and for
         * nothing else.
         *
         * Which card leads is an emphasis, not a gate: everybody can hold
         * both. A woman tracking a partner's hard month should see that card
         * first if it is the one with something to say, so ranking reads
         * state — what is configured, what is fresh — and uses this only to
         * break a tie on an otherwise empty screen.
         */
        sex: user?.sex ?? null,
        relationshipStatus: user?.relationshipStatus ?? null,
      });
    } catch (err) {
      fail(res, "rhythm.list", err);
    }
  });

  app.post("/api/rhythm/subjects", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const input = rhythmSubjectSchema.parse(req.body);

      /**
       * One self, enforced twice.
       *
       * The partial unique index is the guarantee; this check is what turns
       * its violation into a sentence a member can read instead of a 500.
       */
      if (input.relation === "self") {
        const [existing] = await db
          .select({ id: rhythmSubjects.id })
          .from(rhythmSubjects)
          .where(
            and(
              eq(rhythmSubjects.ownerUserId, userId),
              eq(rhythmSubjects.relation, "self"),
              isNull(rhythmSubjects.archivedAt),
            ),
          )
          .limit(1);
        if (existing) {
          return res.status(409).json({ message: "You're already tracking your own rhythm." });
        }
      }

      const [saved] = await db
        .insert(rhythmSubjects)
        .values({
          ownerUserId: userId,
          relation: input.relation,
          label: input.label ?? null,
          // Asked at setup, never inferred from the member's own sex, their
          // relationship status or a nickname. Null is a real answer.
          subjectSex: input.subjectSex ?? null,
          supportPreference: input.supportPreference ?? null,
          model: input.model ?? "spontaneous_cycle",
          cycleLength: input.cycleLength ?? null,
          periodLength: input.periodLength ?? null,
          regular: input.regular ?? null,
        })
        .returning();

      res.status(201).json(saved);
    } catch (err) {
      fail(res, "rhythm.create", err);
    }
  });

  app.patch("/api/rhythm/subjects/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const subject = await ownSubject(userId, String(req.params.id));
      if (!subject) return res.status(404).json({ message: "Not found" });

      const input = rhythmSubjectSchema.partial().parse(req.body);
      const [saved] = await db
        .update(rhythmSubjects)
        .set({
          // Conditional spread throughout: an omitted key leaves the stored
          // answer alone, an explicit null clears it. Same rule as the profile
          // route — merely optional would give nobody a way to take an answer
          // back.
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.subjectSex !== undefined ? { subjectSex: input.subjectSex } : {}),
          ...(input.supportPreference !== undefined
            ? { supportPreference: input.supportPreference }
            : {}),
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(input.cycleLength !== undefined ? { cycleLength: input.cycleLength } : {}),
          ...(input.periodLength !== undefined ? { periodLength: input.periodLength } : {}),
          ...(input.regular !== undefined ? { regular: input.regular } : {}),
          updatedAt: new Date(),
        })
        .where(eq(rhythmSubjects.id, subject.id))
        .returning();

      res.json(saved);
    } catch (err) {
      fail(res, "rhythm.update", err);
    }
  });

  /** Archived, not deleted — see the note on the column. */
  app.delete("/api/rhythm/subjects/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const subject = await ownSubject(req.session!.userId!, String(req.params.id));
      if (!subject) return res.status(404).json({ message: "Not found" });
      await db
        .update(rhythmSubjects)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(rhythmSubjects.id, subject.id));
      res.status(204).end();
    } catch (err) {
      fail(res, "rhythm.archive", err);
    }
  });

  app.post(
    "/api/rhythm/subjects/:id/events",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = req.session!.userId!;
        const subject = await ownSubject(userId, String(req.params.id));
        if (!subject) return res.status(404).json({ message: "Not found" });

        const input = rhythmEventSchema.parse(req.body);
        const today = await memberToday(userId);
        const onDate = input.onDate ?? today;

        // A date in the future is either a typo or a plan, and neither should
        // become the anchor a phase is counted from.
        if (onDate > today) {
          return res.status(400).json({ message: "That date hasn't happened yet." });
        }

        /**
         * Provenance, decided here and never sent by the client.
         *
         * A member logging their own body is the only case that earns
         * `self_reported`, which is the only value `phaseLabel` will state
         * without hedging. A man recording what he noticed about his partner
         * is `member_entered` however certain he is, because the app must
         * never show him his own guess as something she said.
         */
        const provenance = subject.relation === "self" ? "self_reported" : "member_entered";

        const [saved] = await db
          .insert(rhythmEvents)
          .values({
            subjectId: subject.id,
            type: input.type,
            onDate,
            phase: input.phase ?? null,
            contextKind: input.contextKind ?? null,
            provenance,
            note: input.note ?? null,
            recordedByUserId: userId,
          })
          .onConflictDoUpdate({
            target: [rhythmEvents.subjectId, rhythmEvents.type, rhythmEvents.onDate],
            set: {
              phase: input.phase ?? null,
              contextKind: input.contextKind ?? null,
              note: input.note ?? null,
            },
          })
          .returning();

        res.status(201).json(saved);
      } catch (err) {
        fail(res, "rhythm.event", err);
      }
    },
  );

  /** The history behind an estimate, so a member can check or correct it. */
  app.get("/api/rhythm/subjects/:id/events", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const subject = await ownSubject(req.session!.userId!, String(req.params.id));
      if (!subject) return res.status(404).json({ message: "Not found" });
      const rows = await db
        .select()
        .from(rhythmEvents)
        .where(and(eq(rhythmEvents.subjectId, subject.id), isNull(rhythmEvents.supersededBy)))
        .orderBy(desc(rhythmEvents.onDate))
        .limit(60);
      res.json(rows);
    } catch (err) {
      fail(res, "rhythm.events", err);
    }
  });

  app.delete("/api/rhythm/events/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      // The join is the authorization: an event is reachable only through a
      // subject the caller owns.
      const [row] = await db
        .select({ id: rhythmEvents.id })
        .from(rhythmEvents)
        .innerJoin(rhythmSubjects, eq(rhythmSubjects.id, rhythmEvents.subjectId))
        .where(
          and(
            eq(rhythmEvents.id, String(req.params.id)),
            eq(rhythmSubjects.ownerUserId, userId),
          ),
        )
        .limit(1);
      if (!row) return res.status(404).json({ message: "Not found" });

      await db.delete(rhythmEvents).where(eq(rhythmEvents.id, row.id));
      res.status(204).end();
    } catch (err) {
      fail(res, "rhythm.eventDelete", err);
    }
  });
}
