/**
 * A coach's view of a client — API.
 *
 *   GET /api/coach/clients                        my roster, and only mine
 *   GET /api/coach/clients/:memberId/overview     terrain now, plan, check-in
 *   GET /api/coach/clients/:memberId/activity     unified movement history
 *   GET /api/coach/clients/:memberId/habits       what they are actually on
 *   GET /api/coach/clients/:memberId/plan         the Coach's Plan, read-only
 *   GET /api/coach/clients/:memberId/trends       health context
 *   GET /api/coach/clients/:memberId/messages     the existing conversation
 *
 * ── This file computes nothing about a body ───────────────────────────────
 *
 * Every number below comes from a reader the member's own screens already use:
 * `terrainFor`, `recentMovement`, `resolveDay`, `summaryFor`, `healthReadings`.
 * There is no coach sleep average, no coach training load, no coach readiness.
 *
 * That is a rule with a history rather than a preference. Movement had two
 * implementations once, and on the evening of a five-mile run Restore said the
 * member had trained nine times that week while Today said their movement was
 * down — same database, four seconds apart. A coach's third implementation
 * would put that contradiction between two people trying to talk to each other
 * about one body, which is worse than a member disbelieving a screen.
 *
 * So: one body, one underlying state, several authorized projections. This file
 * is a projection. What it adds is a boundary and a shape, not arithmetic.
 *
 * ── The boundary ──────────────────────────────────────────────────────────
 *
 * Every route that names a member goes through a gate — `requireCoachOf` for
 * the client projections, `requireConversation` for the thread, and they agree
 * for a current coach. Not the entry route with the rest trusting it: each one,
 * because the twelfth handler is the one somebody forgets, and here the twelfth
 * handler returns somebody's sleep.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { isAuthenticated } from "../auth/index.js";
import { users } from "../../shared/models/auth.js";
import {
  coachRelationships,
  coachingMessages,
  wellnessRoutines,
  userRoutines,
} from "../../shared/models/coaching.js";
import { healthWorkouts } from "../../shared/models/health.js";
import { trackedHabits, trackedHabitPhases } from "../../shared/models/trackedHabits.js";
import { terrainCheckins } from "../../shared/models/terrainSignals.js";
import { categoryOrientation } from "../../shared/models/training.js";
import { requireCoachOf, clientsOf } from "./relationships.js";
import { requireConversation } from "./conversation.js";
import { threadFor } from "./messageRoutes.js";
import { getActiveEnrollment, memberToday, settleRoutines } from "./enrollment.js";
import { terrainFor, RECENT_DAYS } from "../terrain/read.js";
import { recentMovement } from "../movement/history.js";
import { resolveDay } from "../habits/resolve.js";
import { summaryFor } from "../health/routes.js";
import { addDaysToString } from "../../shared/utils/dates.js";

/** What a coach may see of a person. Never the whole user row. */
const personColumns = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  profileImageUrl: users.profileImageUrl,
};

function displayName(p: { firstName: string | null; lastName: string | null }) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "This member";
}

function fail(res: Response, where: string, err: unknown) {
  console.error(`[coach] ${where} failed`, err);
  res.status(500).json({ message: "Internal Server Error" });
}

/** The member this request is about, already proven by `requireCoachOf`. */
function memberIdOf(req: Request): string {
  return String((req.params as Record<string, unknown>).memberId ?? "");
}

/**
 * The plan a member is on, and who put them on it.
 *
 * ── On attribution ────────────────────────────────────────────────────────
 *
 * `assigned_by_user_id` is only populated on phases written since the column
 * existed, and nothing back-filled it — there was no coaching history to
 * recover, and inventing one would put a coach's name on work they did not do.
 * So `assignedBy` is null for older phases and the UI says nothing rather than
 * guessing.
 */
async function planFor(memberId: string) {
  // Settle first so a plan that ran out yesterday is not reported as running.
  await settleRoutines(memberId);
  const enrollment = await getActiveEnrollment(memberId);
  if (!enrollment) return null;

  const [routine] = await db
    .select({ name: wellnessRoutines.name, description: wellnessRoutines.description })
    .from(wellnessRoutines)
    .where(eq(wellnessRoutines.id, enrollment.routineId));

  const start = new Date(enrollment.startDate);
  const end = new Date(enrollment.endDate);
  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );
  const currentDay = Math.min(
    totalDays,
    Math.max(1, Math.round((Date.now() - start.getTime()) / 86_400_000) + 1),
  );

  return {
    name: routine?.name ?? null,
    description: routine?.description ?? null,
    intensity: enrollment.intensity,
    startedAt: enrollment.startDate,
    currentDay,
    totalDays,
  };
}

/**
 * The live contracts behind a member's habits, with the coach's own notes.
 *
 * ── Why this is a coach endpoint and not the member's ─────────────────────
 *
 * `coachNote` is stripped from `/api/habits/tracked/:id/phases` because the
 * member is not its audience. Getting it to the coach is not a matter of
 * relaxing that — it is a different endpoint, behind the relationship, that
 * says which fields it returns.
 *
 * Reusing the member's object and adding the note back would have been fewer
 * lines and is the exact shape of the accident this avoids: an admin object
 * containing everything, handed to a screen that was only supposed to show some
 * of it.
 */
async function phasesFor(memberId: string) {
  const rows = await db
    .select({
      trackedHabitId: trackedHabitPhases.trackedHabitId,
      status: trackedHabitPhases.status,
      startsOn: trackedHabitPhases.startsOn,
      endsOn: trackedHabitPhases.endsOn,
      target: trackedHabitPhases.target,
      source: trackedHabitPhases.source,
      assignedByUserId: trackedHabitPhases.assignedByUserId,
      memberReason: trackedHabitPhases.memberReason,
      coachNote: trackedHabitPhases.coachNote,
    })
    .from(trackedHabitPhases)
    .innerJoin(trackedHabits, eq(trackedHabits.id, trackedHabitPhases.trackedHabitId))
    .where(
      and(
        eq(trackedHabitPhases.userId, memberId),
        eq(trackedHabitPhases.status, "active"),
        inArray(trackedHabits.status, ["active", "paused"]),
      ),
    );

  const assignerIds = Array.from(
    new Set(rows.map((r) => r.assignedByUserId).filter((v): v is string => Boolean(v))),
  );
  const people = assignerIds.length
    ? await db.select(personColumns).from(users).where(inArray(users.id, assignerIds))
    : [];
  const byId = new Map(people.map((p) => [p.id, displayName(p)]));

  return rows.map((r) => ({
    ...r,
    /** Null where the phase predates attribution. Never a guess. */
    assignedByName: r.assignedByUserId ? (byId.get(r.assignedByUserId) ?? null) : null,
  }));
}

/** The member's most recent subjective check-in, however old it is. */
async function latestCheckin(memberId: string) {
  const [row] = await db
    .select()
    .from(terrainCheckins)
    .where(eq(terrainCheckins.userId, memberId))
    .orderBy(desc(terrainCheckins.onDate))
    .limit(1);
  return row ?? null;
}

/**
 * How much the week asked of this body, and how much it gave back.
 *
 * Counted from the same `recentMovement` entries the terrain reading used, and
 * classified through the same `categoryOrientation`, so this can never disagree
 * with the sentence printed above it.
 *
 * Deliberately two counts and not a ratio. Restore and Build are complementary
 * capacities in this model, not opposing scores, and a single number invites a
 * coach to chase it.
 */
function buildRestore(movement: { category: string }[]) {
  let build = 0;
  let restore = 0;
  for (const m of movement) {
    const o = categoryOrientation(m.category);
    if (o === "yang" || o === "both") build++;
    if (o === "yin" || o === "both") restore++;
  }
  return { build, restore, days: RECENT_DAYS };
}

export function registerCoachClientRoutes(app: Express): void {
  /**
   * My clients — the ones assigned to me, and no others.
   *
   * Scoped by the authenticated coach's own id rather than by anything in the
   * request, so there is no parameter to tamper with and no filtering the
   * client could get wrong. An admin calling this gets their own roster, which
   * is usually empty; the administrative view of everybody is a different
   * endpoint behind a different capability.
   *
   * ── What each card carries, and what it does not ────────────────────────
   *
   * Enough to answer "who needs me today" — the terrain headline, whether a
   * plan is running, when they last spoke. Not a wall of biometrics. A roster
   * that shows ten metrics per member is a monitoring station, and it invites
   * the kind of watching that this product is explicitly not for.
   */
  /**
   * "I have looked at this client."
   *
   * Explicit, and the only thing that moves the cursor. Rendering the page does
   * not — see the note on the column in shared/models/coaching.ts.
   *
   * `requireCoachOf` rather than the narrower relationship check: an
   * administrator standing in for a coach is doing something legitimate, and
   * `coachAccess` records which of the two it was rather than writing an admin
   * into the roster as somebody's coach.
   */
  app.post(
    "/api/coach/clients/:memberId/reviewed",
    isAuthenticated,
    requireCoachOf("memberId"),
    async (req: Request, res: Response) => {
      try {
        const userId = req.session!.userId!;
        const now = new Date();
        await db
          .update(coachRelationships)
          .set({ lastReviewedAt: now, updatedAt: now })
          .where(
            and(
              eq(coachRelationships.coachUserId, userId),
              eq(coachRelationships.memberUserId, String(req.params.memberId)),
              eq(coachRelationships.status, "active"),
            ),
          );
        res.json({ lastReviewedAt: now.toISOString() });
      } catch (err) {
        fail(res, "reviewed", err);
      }
    },
  );

  app.get("/api/coach/clients", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const rows = await clientsOf(userId);
      if (!rows.length) return res.json({ clients: [] });

      const reviewedAt = new Map(rows.map((r) => [r.memberUserId, r.lastReviewedAt]));

      const memberIds = rows.map((r) => r.memberUserId);

      const [people, lastMessages] = await Promise.all([
        db.select(personColumns).from(users).where(inArray(users.id, memberIds)),
        db
          .select({
            userId: coachingMessages.userId,
            createdAt: coachingMessages.createdAt,
            senderRole: coachingMessages.senderRole,
            readAt: coachingMessages.readAt,
          })
          .from(coachingMessages)
          .where(inArray(coachingMessages.userId, memberIds))
          .orderBy(desc(coachingMessages.createdAt)),
      ]);

      const byId = new Map(people.map((p) => [p.id, p]));
      /** Rows arrive newest-first, so the first one seen per member is theirs. */
      const latestMessage = new Map<string, { createdAt: Date | null; senderRole: string }>();
      /**
       * What the coach has not read — their client's messages, not their own.
       *
       * One count per client and nothing else. Not presence, not typing, not
       * delivery receipts: the roster answers "who needs me today", and a
       * number is the whole of what that question needs.
       */
      const unread = new Map<string, number>();
      for (const m of lastMessages) {
        if (!latestMessage.has(m.userId)) {
          latestMessage.set(m.userId, { createdAt: m.createdAt, senderRole: m.senderRole });
        }
        if (m.senderRole === "member" && !m.readAt) {
          unread.set(m.userId, (unread.get(m.userId) ?? 0) + 1);
        }
      }

      /**
       * Per-client reads run together rather than in sequence.
       *
       * A roster of twelve resolved one at a time is twelve round trips of
       * terrain and plan before anything renders.
       */
      const clients = await Promise.all(
        rows.map(async (r) => {
          const person = byId.get(r.memberUserId);
          if (!person) return null;

          const onDate = await memberToday(r.memberUserId);
          const [terrain, plan] = await Promise.all([
            terrainFor(r.memberUserId, onDate).catch(() => null),
            planFor(r.memberUserId).catch(() => null),
          ]);

          const message = latestMessage.get(r.memberUserId) ?? null;

          return {
            ...person,
            name: displayName(person),
            since: r.startedAt,
            /** The headline only. The reasoning is on the client's own page. */
            terrain: terrain
              ? { headline: terrain.headline, lean: terrain.lean ?? null, onDate: terrain.onDate }
              : null,
            plan: plan ? { name: plan.name, currentDay: plan.currentDay, totalDays: plan.totalDays } : null,
            lastMessage: message
              ? { at: message.createdAt, from: message.senderRole }
              : null,
            unread: unread.get(r.memberUserId) ?? 0,
            /**
             * When this coach last said they had looked, and whether anything
             * has happened since.
             *
             * "Since" is deliberately message-shaped for now: it is the one
             * signal that already arrives on this route, and a needs-attention
             * flag built on a number the roster does not have would be a second
             * query per client on the screen a coach opens most. A client with
             * an unread message or a message newer than the mark is the honest
             * answer to "has anything changed since I looked".
             */
            lastReviewedAt: reviewedAt.get(r.memberUserId)?.toISOString() ?? null,
          };
        }),
      );

      res.json({ clients: clients.filter(Boolean) });
    } catch (err) {
      fail(res, "clients", err);
    }
  });

  /**
   * Everything the coach needs before saying anything — in one request.
   *
   * The alternative shape, a screen firing six unrelated queries and stitching
   * them together, puts the decision about what a client "is" into a React
   * component. That decision belongs on the server, where it is the same for
   * every reader of it.
   */
  app.get(
    "/api/coach/clients/:memberId/overview",
    isAuthenticated,
    requireCoachOf("memberId"),
    async (req: Request, res: Response) => {
      try {
        const memberId = memberIdOf(req);
        const onDate = await memberToday(memberId);

        const [person] = await db.select(personColumns).from(users).where(eq(users.id, memberId));
        if (!person) return res.status(404).json({ message: "No such member" });

        const [terrain, plan, checkin] = await Promise.all([
          terrainFor(memberId, onDate),
          planFor(memberId),
          latestCheckin(memberId),
        ]);

        /**
         * Today's imported sessions, live.
         *
         * The reading above is computed now, not read from this morning's
         * frozen note — so a run after breakfast is in it, and this list is the
         * evidence for that rather than a second opinion about it.
         */
        const todaysWorkouts = await db
          .select()
          .from(healthWorkouts)
          .where(and(eq(healthWorkouts.userId, memberId), eq(healthWorkouts.onDate, onDate)))
          .orderBy(desc(healthWorkouts.startAt));

        res.json({
          member: { ...person, name: displayName(person) },
          onDate,
          terrain,
          weekBalance: buildRestore(terrain.movement),
          todaysWorkouts,
          plan,
          /**
           * What the member said about themselves, kept separate from what a
           * sensor recorded and from what Sakred concluded. All three are on
           * this response and none of them is dressed as either of the others.
           */
          checkin,
          /** How access was granted, so the UI can say when it is admin-wide. */
          access: req.coachAccess ?? "relationship",
        });
      } catch (err) {
        fail(res, "overview", err);
      }
    },
  );

  /**
   * Unified movement — imported and logged, with the member's own reading.
   *
   * `workouts` are the imported sessions in full, carrying `userResponse` and
   * `userOrientationOverride`: the member's answers, which a coach should see
   * as the member's answers. `movement` is the deduplicated day-and-category
   * history the terrain reading counted, which is a different question — what
   * the week cost — and neither overwrites the other.
   *
   * A hard run somebody says restored them is `taxed` by the model and
   * `restored` by them at the same time, and both are true. Flattening that
   * into one field would delete the most interesting thing on the screen.
   */
  app.get(
    "/api/coach/clients/:memberId/activity",
    isAuthenticated,
    requireCoachOf("memberId"),
    async (req: Request, res: Response) => {
      try {
        const memberId = memberIdOf(req);
        const onDate = await memberToday(memberId);
        const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
        const since = addDaysToString(onDate, -days);

        const [imported, movement] = await Promise.all([
          db
            .select()
            .from(healthWorkouts)
            .where(and(eq(healthWorkouts.userId, memberId), gte(healthWorkouts.onDate, since)))
            .orderBy(desc(healthWorkouts.startAt))
            .limit(200),
          recentMovement(memberId, since),
        ]);

        res.json({
          onDate,
          days,
          workouts: imported,
          movement: movement.map((m) => ({
            ...m,
            orientation: categoryOrientation(m.category),
          })),
          /**
           * The last seven days, from the same entries — so the Build/Restore
           * counts here and on the overview are one calculation, not two that
           * happen to agree today.
           */
          weekBalance: buildRestore(movement.filter((m) => m.onDate >= addDaysToString(onDate, -RECENT_DAYS))),
        });
      } catch (err) {
        fail(res, "activity", err);
      }
    },
  );

  /**
   * What the member is actually on — resolved exactly as their own screen
   * resolves it.
   *
   * `resolveDay` answers ten inputs' worth of question: is it due today, what
   * is the number, which contract is live, what counts as done. A coach view
   * that worked any of that out itself would eventually call a Wednesday missed
   * that the member's screen never scheduled.
   */
  app.get(
    "/api/coach/clients/:memberId/habits",
    isAuthenticated,
    requireCoachOf("memberId"),
    async (req: Request, res: Response) => {
      try {
        const memberId = memberIdOf(req);
        const onDate = await memberToday(memberId);
        const [all, phases] = await Promise.all([resolveDay(memberId, onDate), phasesFor(memberId)]);

        res.json({
          onDate,
          restore: all.filter((h) => h.emphasis === "yin"),
          build: all.filter((h) => h.emphasis === "yang"),
          /** Contracts and coach notes, keyed by habit for the UI to join. */
          phases,
        });
      } catch (err) {
        fail(res, "habits", err);
      }
    },
  );

  /** The Coach's Plan as it stands. Read-only — authoring is a later slice. */
  app.get(
    "/api/coach/clients/:memberId/plan",
    isAuthenticated,
    requireCoachOf("memberId"),
    async (req: Request, res: Response) => {
      try {
        const memberId = memberIdOf(req);
        const onDate = await memberToday(memberId);
        const [plan, all, phases, history] = await Promise.all([
          planFor(memberId),
          resolveDay(memberId, onDate),
          phasesFor(memberId),
          db
            .select({
              id: userRoutines.id,
              routineId: userRoutines.routineId,
              status: userRoutines.status,
              startDate: userRoutines.startDate,
              endDate: userRoutines.endDate,
            })
            .from(userRoutines)
            .where(eq(userRoutines.userId, memberId))
            .orderBy(desc(userRoutines.startDate))
            .limit(10),
        ]);

        res.json({ onDate, plan, habits: all, phases, history });
      } catch (err) {
        fail(res, "plan", err);
      }
    },
  );

  /**
   * Health context — the same normalized metrics the member's own trends read.
   *
   * `summaryFor` is the member's `/api/health/summary` reader, exported rather
   * than copied. A coach's sleep average that differed from the member's by a
   * rounding rule would be a genuinely bad conversation to have.
   */
  app.get(
    "/api/coach/clients/:memberId/trends",
    isAuthenticated,
    requireCoachOf("memberId"),
    async (req: Request, res: Response) => {
      try {
        const memberId = memberIdOf(req);
        const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
        res.json(await summaryFor(memberId, days));
      } catch (err) {
        fail(res, "trends", err);
      }
    },
  );

  /**
   * The client's conversation, with the files in it.
   *
   * `coaching_messages` stays the messaging system — this is a way in, not a
   * second one, and it returns exactly what the member's own thread returns so
   * the two sides cannot render different histories.
   *
   * Gated by `requireConversation` rather than `requireCoachOf`. They agree for
   * a current coach and differ for a former one: `requireCoachOf` asks whether
   * an active relationship exists, which is also what conversation access
   * requires, but the conversation gate is the rule that owns this question and
   * having one of the five conversation routes ask a different one is how they
   * drift apart. Sending and reading now pass the same check.
   */
  app.get(
    "/api/coach/clients/:memberId/messages",
    isAuthenticated,
    requireConversation("memberId"),
    async (req: Request, res: Response) => {
      try {
        res.json(await threadFor(req.conversationMemberId!));
      } catch (err) {
        fail(res, "messages", err);
      }
    },
  );
}
