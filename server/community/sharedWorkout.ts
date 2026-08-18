/**
 * What a workout looks like when it is posted to the Room.
 *
 * ── Why a reference and not a snapshot ────────────────────────────────────
 *
 * `community_messages.shared_session_id` points at the real session. Copying a
 * summary into the message would create a second version of the same training
 * that drifts the moment the member corrects a set — the Room would keep
 * insisting they did 100kg for an hour after they fixed the typo. The card is
 * therefore rendered from `workout_sessions`, `session_exercises` and
 * `workout_sets` every time, which is also what "keep the workout data
 * structured" means in practice: nothing here is a string somebody assembled.
 *
 * ── What a share is not allowed to carry ──────────────────────────────────
 *
 * Everything a member said privately. The session's `note` is theirs — it is
 * where "shoulder felt wrong again" goes — and so are per-set notes, RPE, and
 * whether they went to failure. None of it is selected below.
 *
 * That is a deliberate narrowing rather than an oversight: a member sharing a
 * lift is saying "I did this", not opening their training diary, and a share
 * that quietly published their discomfort notes would be the kind of surprise
 * nobody forgives. Health measurements, Terrain reasons and Training Memory
 * are not reachable from here at all, which is the strongest form of the same
 * rule.
 *
 * The caption they type is separate, in the message body, where they can see
 * exactly what they wrote.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { exercises, sessionExercises, workoutSessions, workoutSets } from "../../shared/schema.js";

export type SharedMovement = {
  exerciseId: string;
  name: string;
  /** Working sets only — a warm-up ramp is not what somebody is sharing. */
  sets: number;
  reps: number | null;
  /** The heaviest working set, in kilograms. Null for unweighted work. */
  topWeightKg: number | null;
  /** Movements performed together carry the same key. */
  supersetGroup: string | null;
};

export type SharedWorkout = {
  sessionId: string;
  title: string | null;
  onDate: string;
  durationMinutes: number | null;
  movements: SharedMovement[];
  /** Total working-set volume, kilograms. Null when nothing was weighted. */
  volumeKg: number | null;
};

/**
 * The cards for a set of messages, in three queries rather than three per row.
 *
 * A Room page renders twenty messages; a query per share is the shape that
 * makes a feed feel broken on a phone.
 */
export async function sharedWorkoutsFor(
  sessionIds: readonly string[],
): Promise<Map<string, SharedWorkout>> {
  const ids = Array.from(new Set(sessionIds.filter(Boolean)));
  if (!ids.length) return new Map();

  const sessions = await db
    .select({
      id: workoutSessions.id,
      title: workoutSessions.title,
      onDate: workoutSessions.onDate,
      durationMinutes: workoutSessions.durationMinutes,
    })
    .from(workoutSessions)
    .where(inArray(workoutSessions.id, ids));

  if (!sessions.length) return new Map();
  const found = sessions.map((s) => s.id);

  const composition = await db
    .select({
      sessionId: sessionExercises.sessionId,
      exerciseId: sessionExercises.exerciseId,
      position: sessionExercises.position,
      supersetGroup: sessionExercises.supersetGroup,
      name: exercises.name,
    })
    .from(sessionExercises)
    .leftJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(inArray(sessionExercises.sessionId, found))
    .orderBy(asc(sessionExercises.position), asc(sessionExercises.createdAt));

  /*
    Warm-ups are excluded here rather than filtered afterwards, matching every
    other derived number in the product — counting a ramp toward volume makes
    a light day look heavy.
  */
  const sets = await db
    .select({
      sessionId: workoutSets.sessionId,
      exerciseId: workoutSets.exerciseId,
      reps: workoutSets.reps,
      weightKg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .where(and(inArray(workoutSets.sessionId, found), eq(workoutSets.isWarmup, false)));

  const byMovement = new Map<string, { sets: number; reps: number | null; top: number | null; volume: number }>();
  for (const s of sets) {
    const key = `${s.sessionId}::${s.exerciseId}`;
    const acc = byMovement.get(key) ?? { sets: 0, reps: null, top: null, volume: 0 };
    acc.sets += 1;
    // The rep count shown is the one performed most recently that had any —
    // a single number on a card, not a claim about every set.
    if (s.reps != null) acc.reps = s.reps;
    if (s.weightKg > 0) {
      acc.top = Math.max(acc.top ?? 0, s.weightKg);
      acc.volume += s.weightKg * (s.reps ?? 0);
    }
    byMovement.set(key, acc);
  }

  const out = new Map<string, SharedWorkout>();
  for (const session of sessions) {
    const movements: SharedMovement[] = composition
      .filter((c) => c.sessionId === session.id)
      .map((c) => {
        const acc = byMovement.get(`${session.id}::${c.exerciseId}`);
        return {
          exerciseId: c.exerciseId,
          // The slug is a readable last resort — a card that says nothing at
          // all is worse than one that says "incline-chest-press".
          name: c.name ?? c.exerciseId,
          sets: acc?.sets ?? 0,
          reps: acc?.reps ?? null,
          topWeightKg: acc?.top ?? null,
          supersetGroup: c.supersetGroup,
        };
      });

    const volume = movements.reduce((total, m) => {
      const acc = byMovement.get(`${session.id}::${m.exerciseId}`);
      return total + (acc?.volume ?? 0);
    }, 0);

    out.set(session.id, {
      sessionId: session.id,
      title: session.title,
      onDate: session.onDate,
      durationMinutes: session.durationMinutes,
      movements,
      volumeKg: volume > 0 ? Math.round(volume) : null,
    });
  }
  return out;
}

/**
 * Whether this member may share this session — which is only ever their own.
 *
 * Checked at post time rather than at render time, so a message can never
 * exist that points at somebody else's training.
 */
export async function ownsSession(userId: string, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  return !!row;
}
