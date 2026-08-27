/**
 * Whatever workout is currently running, wherever you are in the app.
 *
 * ── One query, one truth ──────────────────────────────────────────────────
 *
 * Build already asked this question; the banner needs the same answer on every
 * other screen. Two queries would mean two answers, and the failure mode is
 * specific and bad: a member finishes a session on Build and the strip on Home
 * keeps offering to resume a workout that ended ten minutes ago.
 *
 * So it is one query key, shared. React Query dedupes the request and any
 * invalidation moves every consumer at once.
 *
 * The session is the server's, not the navigation's. Nothing here is derived
 * from where the member happens to be standing, which is the whole point — a
 * workout is running because a row has no `finished_at`, not because a
 * particular component is mounted.
 *
 * ── And the client is not allowed a second opinion ───────────────────────
 *
 * This module is also where an id stops being a fact the client remembers and
 * becomes a fact it *checks*. On 15 Aug a session was started at 16:37:32,
 * deleted by a discard the client never learned about at 16:38:00, and then
 * written to at 16:40:47 — `404 {"message":"No such session"}` — while the
 * screen went on showing a workout, a movement, and a set waiting to be
 * logged. Nothing on the server was wrong. The client was holding an id the
 * server had already forgotten.
 *
 * Two rules follow, and both live here so no surface can implement them
 * differently:
 *
 *   `seed`        a session that has just been created is written into the
 *                 cache rather than only into a component, and any `/open`
 *                 read already in flight is cancelled so a stale answer cannot
 *                 land on top of it.
 *
 *   `reconcile`   a write that comes back 404 does not toast and continue. It
 *                 re-asks the server what is open and hands back the truth —
 *                 another session to resume, or nothing at all. A caller may
 *                 adopt what it gets. No caller may invent one.
 */

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import type { RunningSession } from "@/lib/startSession";

/**
 * One set already in the open session, with enough of its movement attached to
 * draw the row it belongs to.
 *
 * The exercise columns travel with the set on purpose: the workout screen has
 * to know whether a row takes weight and whether it counts reps or seconds
 * before it can render anything, and deriving that from a separate catalogue
 * fetch would mean the screen could paint before it knew what it was painting.
 */
export type LoggedSet = {
  id: string;
  exerciseId: string;
  name: string;
  category: string;
  trackingType: "reps" | "duration" | "distance";
  takesLoad: boolean;
  unilateral: boolean;
  /** What the number in the weight box means. See exercises.loadEntry. */
  loadEntry: string;
  setIndex: number;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  weight: number | null;
  /**
   * How the set was performed. All optional for the usual reason — a phone
   * running the build before these columns existed gets `undefined`, and every
   * reader has to treat that as "a normal working set" rather than as a bug.
   */
  rpe?: number | null;
  isWarmup?: boolean;
  setStyle?: string;
  toFailure?: boolean;
};

/**
 * A movement in the session, whether or not anything has been done with it.
 *
 * This is the list the screen renders. It used to be derived from `logged`,
 * which cannot see a movement chosen a minute ago — and that minute is where
 * every "my exercise disappeared" report came from.
 */
export type SessionMovement = {
  id: string;
  exerciseId: string;
  name: string;
  category: string;
  trackingType: "reps" | "duration" | "distance";
  takesLoad: boolean;
  unilateral: boolean;
  /** What the number in the weight box means. See exercises.loadEntry. */
  loadEntry: string;
  position: number;
  supersetGroup: string | null;
  habitExerciseId: string | null;
};

/** What was done the last time this movement was trained. */
export type PriorPerformance = {
  exerciseId: string;
  onDate: string;
  sets: {
    reps: number | null;
    durationSeconds: number | null;
    distanceM: number | null;
    weight: number | null;
    rpe: number | null;
    isWarmup: boolean;
  }[];
};

export type OpenWorkout = RunningSession & {
  /**
   * The tutorial's rehearsal, not a workout.
   *
   * Set only by the walkthrough's fetch boundary — the server has no such
   * column and never sends it — so anything keyed on this cannot reach a real
   * session. Read by the workout screen to reopen an entry row a reconstructed
   * rehearsal was in the middle of.
   */
  rehearsal?: boolean;
  /** How much has been logged, so the banner can say more than "a workout". */
  sets: number;
  /**
   * What is in it.
   *
   * Optional, and the workout screen must render without it — a bundled native
   * client and a deployed server are never updated in the same instant, so
   * every field added here is absent for some members for some hours. Build 23
   * shipped dereferencing a new field unconditionally and took down the whole
   * section. See `TodaysBuild`.
   */
  logged?: LoggedSet[];
  unit?: "kg" | "lb";
  /**
   * What the member has said about it so far — one per movement at most, plus
   * one for the session as a whole. Optional for the same reason as `logged`.
   */
  observations?: {
    id: string;
    exerciseId: string | null;
    note: string | null;
    quality: string | null;
    side: string | null;
  }[];
  /**
   * The composition — what the workout is made of, in the member's order.
   *
   * Optional like everything else here, and the screen falls back to deriving
   * the list from `logged` when it is absent. That fallback is the old
   * behaviour, bug and all; it exists only so a client running against a server
   * that predates `session_exercises` shows a workout rather than an empty
   * layer.
   */
  exercises?: SessionMovement[];
  /** Keyed by exercise id. Absent for a movement never trained before. */
  previous?: Record<string, PriorPerformance>;
  /** The most recent thing said about each movement, if anything was. */
  concerns?: Record<string, { quality: string | null; side: string | null; onDate: string }>;
};

export const OPEN_WORKOUT_KEY = ["/api/training/sessions/open"] as const;

type OpenAnswer = { session: OpenWorkout | null };

async function fetchOpen({ signal }: { signal?: AbortSignal } = {}): Promise<OpenAnswer> {
  const r = await apiFetch("/api/training/sessions/open", { signal });
  if (!r.ok) throw new Error("open");
  return r.json();
}

export function useOpenWorkout() {
  return useQuery<OpenAnswer>({
    queryKey: OPEN_WORKOUT_KEY,
    queryFn: ({ signal }) => fetchOpen({ signal }),
    /**
     * Cheap, and the answer changes when the member acts on another device —
     * or when a session started on Build is finished from the banner.
     */
    staleTime: 15_000,
  });
}

/**
 * A session that has just been created is already the truth.
 *
 * Writing it into the cache rather than invalidating closes the one race that
 * would otherwise make the reconciliation rule below unsafe: a `/open` request
 * issued a moment *before* the session was created resolves a moment *after*
 * it, says "nothing is open", and a client that trusts the cache would throw
 * away a workout that had just started. The logs show exactly that ordering —
 * `POST /sessions` at 16:37:32, `GET /sessions/open` at 16:37:33.
 *
 * So anything in flight is cancelled first. Its answer was true when it was
 * asked and is not true now.
 */
export async function seedOpenWorkout(
  qc: QueryClient,
  session: RunningSession & { sets?: number },
): Promise<void> {
  await qc.cancelQueries({ queryKey: OPEN_WORKOUT_KEY });
  qc.setQueryData<OpenAnswer>(OPEN_WORKOUT_KEY, {
    session: { ...session, sets: session.sets ?? 0 },
  });
}

/**
 * Ask the server what is actually open, and believe it.
 *
 * Bypasses the cache deliberately — this is called at the moment the client has
 * been proven wrong, which is the one moment a cached answer is worth nothing.
 */
export async function reconcileOpenWorkout(qc: QueryClient): Promise<OpenWorkout | null> {
  await qc.cancelQueries({ queryKey: OPEN_WORKOUT_KEY });
  try {
    const answer = await fetchOpen();
    qc.setQueryData<OpenAnswer>(OPEN_WORKOUT_KEY, answer);
    return answer.session;
  } catch {
    /**
     * The network failed, which is not evidence that the session is gone. The
     * cache is left alone and the caller is told nothing was learned — dropping
     * a live workout because a reconnect was mid-flight would be the same class
     * of bug in the opposite direction.
     */
    return null;
  }
}

/**
 * Re-exported so call sites have one import for the whole rule, while the
 * predicate itself stays in a module with no dependencies — see
 * `lib/missingSession`, and the tests that exercise it directly.
 */
export { isMissingSession } from "@/lib/missingSession";
