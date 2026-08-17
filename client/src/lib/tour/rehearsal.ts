/**
 * A workout the member can practise on, that cannot be written down.
 *
 * ── Why not "create it, teach against it, delete it afterwards" ───────────
 *
 * Because there is then a window in which it exists. A crash, a force-quit, a
 * dropped connection or a backgrounded app between the create and the cleanup
 * leaves invented sets in a real training history — and Terrain computes from
 * those rows, Training Memory carries them forward, and LAST TIME will show
 * them back to the member as their own previous performance months later.
 * That is the product telling somebody something false about their own body,
 * and no amount of cleanup code makes the window not exist.
 *
 * So there is no cleanup, because there is nothing to clean.
 *
 * ── Why the boundary is `fetch` and not a prop ────────────────────────────
 *
 * The obvious build is `tutorialMode` threaded into WorkoutSheet and consulted
 * at each mutation. That is a promise made in thirty places and kept in
 * twenty-nine: one `useMutation` added later without the guard writes real
 * rows, and it looks exactly like every other mutation in the file during
 * review.
 *
 * The single place every write in this application actually passes through is
 * the network. `apiFetch` is not that place — it is the intended door, but
 * roughly sixty-five raw `fetch("/api/…")` calls predate it and bypass it
 * entirely on the web (see `apiFetch.ts`). The global is the only boundary
 * nothing can go around.
 *
 * ── The invariant ─────────────────────────────────────────────────────────
 *
 * While a rehearsal is running:
 *
 *   · reads pass through, so the member sees the real exercise catalogue and
 *     the real UI rather than a mock of it;
 *   · the handful of workout writes are served from memory;
 *   · **every other write is refused** — not passed through, not queued, not
 *     retried. Including routes nobody thought of when this was written, and
 *     including ones added next year.
 *
 * That last clause is what makes this architectural. The guarantee does not
 * depend on anybody remembering anything: a mutation that this file has never
 * heard of still cannot reach the server, and it is recorded so the test suite
 * can name it.
 */

/** A write that tried to leave during a rehearsal and was stopped. */
export type RefusedWrite = { method: string; path: string };

export type RehearsalVerdict =
  /** Not a write and not ours. The real request goes out. */
  | { kind: "passthrough" }
  /** Answered from memory. */
  | { kind: "serve"; status: number; body: unknown }
  /** A write. Stopped, whatever it was for. */
  | { kind: "refuse"; reason: string };

// ── The in-memory session ────────────────────────────────────────────────

export const REHEARSAL_SESSION_ID = "rehearsal-session";

type RehearsalSet = {
  id: string;
  sessionExerciseId: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  setStyle: string | null;
  toFailure: boolean;
  position: number;
};

type RehearsalExercise = {
  id: string;
  exerciseId: string;
  name: string;
  position: number;
  sets: RehearsalSet[];
};

export type RehearsalStore = {
  sessionId: string;
  startedAt: string;
  exercises: RehearsalExercise[];
  counter: number;
};

export function createStore(startedAt: string): RehearsalStore {
  return { sessionId: REHEARSAL_SESSION_ID, startedAt, exercises: [], counter: 0 };
}

/**
 * The previous session the LAST TIME lesson needs.
 *
 * A member on their first day has no training history, so the lesson has
 * nothing to point at — and the lesson is worth teaching anyway, because LAST
 * TIME is the mechanism by which the app stops being a logbook and starts
 * being a memory.
 *
 * These numbers are deliberately plain and deliberately not a personal record:
 * the third set drops, because the honest thing LAST TIME shows you is usually
 * a session that tailed off. The copy calls it an example rather than implying
 * it is theirs — see `sakredIntro.ts` — and it exists only inside this store,
 * so it cannot survive the rehearsal being thrown away.
 */
export const REHEARSAL_LAST_TIME = {
  performedAt: "2026-08-12T00:00:00.000Z",
  sets: [
    { weight: 100, reps: 8, rpe: 7 },
    { weight: 100, reps: 7, rpe: 8 },
    { weight: 90, reps: 10, rpe: 9 },
  ],
} as const;

// ── Routing ──────────────────────────────────────────────────────────────

/**
 * The writes the rehearsal knows how to imitate.
 *
 * Anything not matched here and not a read is refused. The list is short on
 * purpose: it is the set of things the walkthrough actually asks the member to
 * do, and widening it should feel like a decision rather than a convenience.
 */
const S = REHEARSAL_SESSION_ID;
/*
  Every served write is addressed by an id the rehearsal itself minted —
  the session id above, or a `rehearsal-` prefixed row from `applyTo`.

  That constraint is doing real work. Written as `[^/]+`, a request to finish
  session `real-session-42` would match, and the rehearsal would happily answer
  it — harmlessly, since nothing is written, but it would swallow a real
  request and tell the app it had succeeded. The member's actual open session
  would then appear to have been finished and would not have been. Scoping to
  minted ids means anything naming a real row falls through to the refusal
  below, which is the correct answer for it too.
*/
const SERVED_WRITES: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/training\/sessions$/ },
  { method: "POST", pattern: new RegExp(`^/api/training/sessions/${S}/exercises$`) },
  { method: "DELETE", pattern: new RegExp(`^/api/training/sessions/${S}/exercises/[^/]+$`) },
  { method: "POST", pattern: new RegExp(`^/api/training/sessions/${S}/sets$`) },
  { method: "PATCH", pattern: /^\/api\/training\/sets\/rehearsal-[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/training\/sets\/rehearsal-[^/]+$/ },
  { method: "POST", pattern: new RegExp(`^/api/training/sessions/${S}/finish$`) },
  { method: "DELETE", pattern: new RegExp(`^/api/training/sessions/${S}$`) },
];

/**
 * Reads that must not tell the truth during a rehearsal.
 *
 * Everything else is passed through deliberately — the exercise catalogue, the
 * modalities, the member's own settings — because the point is to teach against
 * the real interface rather than a mock of it.
 *
 * The open-session read is the exception that matters most. A member who is
 * genuinely mid-workout and starts the walkthrough must not be handed their own
 * live session to practise on: they would be logging rehearsal sets into a real
 * one, which is the exact failure this whole file exists to make impossible.
 */
const SERVED_READS: RegExp[] = [
  /^\/api\/training\/sessions\/open$/,
  new RegExp(`^/api/training/sessions/${REHEARSAL_SESSION_ID}$`),
  /^\/api\/training\/memory(\?.*)?$/,
];

const isWrite = (method: string) => method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD";

export function routeRehearsal(
  method: string,
  path: string,
  body: unknown,
  store: RehearsalStore,
): RehearsalVerdict {
  const m = method.toUpperCase();

  if (!path.startsWith("/api/")) return { kind: "passthrough" };

  if (!isWrite(m)) {
    if (SERVED_READS.some((r) => r.test(path))) {
      return { kind: "serve", status: 200, body: readFrom(path, store) };
    }
    return { kind: "passthrough" };
  }

  const served = SERVED_WRITES.find((w) => w.method === m && w.pattern.test(path));
  if (!served) {
    /*
      The whole guarantee, in one branch.

      A route this file has never heard of — a new mutation, a route renamed, a
      third-party call, an analytics beacon that happens to POST — is stopped
      here rather than allowed through on the grounds that it is "probably
      fine". Being wrong in this direction breaks a rehearsal, which is
      recoverable. Being wrong in the other direction writes to a member's body
      record, which is not.
    */
    return { kind: "refuse", reason: `${m} ${path} is not part of the rehearsal` };
  }

  return { kind: "serve", status: 200, body: applyTo(m, path, body, store) };
}

function readFrom(path: string, store: RehearsalStore): unknown {
  if (/^\/api\/training\/memory/.test(path)) return [];
  return session(store);
}

function session(store: RehearsalStore) {
  return {
    id: store.sessionId,
    startedAt: store.startedAt,
    finishedAt: null,
    // Named so that anything which does reach a log, a crash report or a
    // screenshot says what it is rather than looking like a real session.
    title: "Rehearsal",
    rehearsal: true,
    exercises: store.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      name: e.name,
      position: e.position,
      sets: e.sets,
      lastTime: REHEARSAL_LAST_TIME,
    })),
  };
}

function applyTo(method: string, path: string, body: unknown, store: RehearsalStore): unknown {
  const data = (body ?? {}) as Record<string, unknown>;
  const nextId = (prefix: string) => `${prefix}-${++store.counter}`;

  if (method === "POST" && /\/exercises$/.test(path)) {
    const exercise: RehearsalExercise = {
      id: nextId("rehearsal-exercise"),
      exerciseId: String(data.exerciseId ?? nextId("rehearsal-movement")),
      name: String(data.name ?? "Movement"),
      position: store.exercises.length,
      sets: [],
    };
    store.exercises.push(exercise);
    return session(store);
  }

  if (method === "POST" && /\/sets$/.test(path)) {
    const target =
      store.exercises.find((e) => e.id === data.sessionExerciseId) ??
      store.exercises[store.exercises.length - 1];
    if (target) {
      target.sets.push({
        id: nextId("rehearsal-set"),
        sessionExerciseId: target.id,
        weight: numberOrNull(data.weight),
        reps: numberOrNull(data.reps),
        // Absent RPE stays null and is never defaulted. An unrecorded effort is
        // unknown, not easy — and a rehearsal that quietly filled it in would
        // teach the member the opposite of what the lesson says.
        rpe: numberOrNull(data.rpe),
        setStyle: typeof data.setStyle === "string" ? data.setStyle : null,
        toFailure: data.toFailure === true,
        position: target.sets.length,
      });
    }
    return session(store);
  }

  if (method === "PATCH" && /\/sets\/[^/]+$/.test(path)) {
    const id = path.split("/").pop()!;
    for (const e of store.exercises) {
      const set = e.sets.find((s) => s.id === id);
      if (!set) continue;
      if ("weight" in data) set.weight = numberOrNull(data.weight);
      if ("reps" in data) set.reps = numberOrNull(data.reps);
      if ("rpe" in data) set.rpe = numberOrNull(data.rpe);
      if ("setStyle" in data) set.setStyle = typeof data.setStyle === "string" ? data.setStyle : null;
      if ("toFailure" in data) set.toFailure = data.toFailure === true;
    }
    return session(store);
  }

  if (method === "DELETE" && /\/sets\/[^/]+$/.test(path)) {
    const id = path.split("/").pop()!;
    for (const e of store.exercises) e.sets = e.sets.filter((s) => s.id !== id);
    return session(store);
  }

  if (method === "DELETE" && /\/exercises\/[^/]+$/.test(path)) {
    const id = path.split("/").pop()!;
    store.exercises = store.exercises.filter((e) => e.id !== id && e.exerciseId !== id);
    return session(store);
  }

  // Creating, finishing or discarding. All of them return the session and none
  // of them go anywhere; the store is dropped when the rehearsal ends.
  return session(store);
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── The boundary ─────────────────────────────────────────────────────────

let store: RehearsalStore | null = null;
let original: typeof globalThis.fetch | null = null;
let refused: RefusedWrite[] = [];

export function isRehearsing(): boolean {
  return store !== null;
}

export function refusedWrites(): readonly RefusedWrite[] {
  return refused;
}

/** Test seam, so a suite can drive the boundary without a browser. */
export function rehearsalStore(): RehearsalStore | null {
  return store;
}

function pathOf(input: RequestInfo | URL): string {
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const base = typeof location === "undefined" ? "http://localhost" : location.href;
    const u = new URL(raw, base);
    return u.pathname + u.search;
  } catch {
    return raw;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Start a rehearsal, and hold the door.
 *
 * Idempotent: a second call while one is running is a no-op rather than a
 * second layer of interception, because unwinding two of these in the wrong
 * order would leave the boundary installed after the rehearsal ended — which
 * is the one failure mode of this design that would be worse than not having
 * it, since it would break the member's real workout instead.
 */
export function beginRehearsal(startedAt: string, fetchImpl?: typeof globalThis.fetch): void {
  if (store) return;
  store = createStore(startedAt);
  refused = [];

  const base = fetchImpl ?? globalThis.fetch;
  original = base.bind(globalThis) as typeof globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const active = store;
    if (!active || !original) return (original ?? base)(input as RequestInfo, init);

    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    const path = pathOf(input);

    let body: unknown;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = undefined;
      }
    }

    const verdict = routeRehearsal(method, path, body, active);
    if (verdict.kind === "passthrough") return original(input as RequestInfo, init);
    if (verdict.kind === "serve") return json(verdict.status, verdict.body);

    refused.push({ method: method.toUpperCase(), path });
    /*
      A refusal is a 403 rather than a thrown error. A thrown fetch surfaces as
      "you appear to be offline", which is a lie that sends the member to check
      their wifi during a tutorial; a 403 is handled by the app's existing error
      paths and says something true.
    */
    return json(403, { error: verdict.reason, rehearsal: true });
  };
}

/**
 * End it, and let go of everything.
 *
 * The store is dropped rather than cleared, so there is no object left holding
 * invented sets, and nothing to submit later even by mistake.
 */
export function endRehearsal(): void {
  if (original) globalThis.fetch = original;
  original = null;
  store = null;
}
