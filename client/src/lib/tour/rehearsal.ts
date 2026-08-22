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

export type RehearsalSet = {
  id: string;
  sessionExerciseId: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  setStyle: string | null;
  toFailure: boolean;
  position: number;
};

export type RehearsalExercise = {
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
  /*
    The open-session route answers `{ session: … }`, not a bare session.

    This returned the bare object, so the workout screen read `data.session`,
    found `undefined`, concluded the workout had ended and closed itself — one
    tap after the tutorial asked the member to add a movement. Nothing threw
    and nothing was written; the lesson simply became impossible.

    A rehearsal that serves a different shape from the route it is imitating is
    not a rehearsal of that route. So the shape is matched here, and the sets
    the store holds are flattened into the same `logged` array the real route
    builds.
  */
  if (/\/sessions\/open$/.test(path)) return { session: openSession(store) };
  return session(store);
}

/**
 * What `/api/training/sessions/open` returns, from the rehearsal's own store.
 *
 * Field-for-field with the real route where the store knows the answer. What
 * it cannot know — a movement's category, whether it takes load — was never
 * sent by the client, which posts only an id; those stay undefined rather than
 * being invented, and the screen renders them exactly as it would for a
 * movement whose catalogue row had not arrived yet.
 */
function openSession(store: RehearsalStore) {
  const logged = store.exercises.flatMap((e) =>
    e.sets.map((set, i) => ({
      id: set.id,
      exerciseId: e.exerciseId,
      name: e.name,
      setIndex: set.position || i + 1,
      reps: set.reps,
      durationSeconds: null,
      distanceM: null,
      weight: set.weight,
      isWarmup: set.setStyle === "warmup",
      setStyle: set.setStyle ?? "normal",
      toFailure: set.toFailure,
      rpe: set.rpe,
    })),
  );

  return {
    id: store.sessionId,
    title: "Rehearsal",
    onDate: store.startedAt.slice(0, 10),
    habitId: null,
    startedAt: store.startedAt,
    rehearsal: true,
    sets: logged.length,
    unit: "lb",
    logged,
    exercises: session(store).exercises,
    observations: [],
    /*
      What LAST TIME is drawn from.

      `REHEARSAL_LAST_TIME` has existed since the lesson was written and was
      hung on each exercise as `lastTime` — a field the workout screen does not
      read. It reads `session.previous`, keyed by exercise id, so the panel
      never rendered and the lesson pointed at nothing.

      Keyed for every movement in the rehearsal rather than one: whichever the
      member picked from six hundred is the one the lesson has to teach on, and
      a rehearsal that only works for bench press is a rehearsal of bench press.
    */
    previous: Object.fromEntries(
      store.exercises.map((e) => [
        e.exerciseId,
        {
          exerciseId: e.exerciseId,
          onDate: REHEARSAL_LAST_TIME.performedAt.slice(0, 10),
          sets: REHEARSAL_LAST_TIME.sets.map((set) => ({
            reps: set.reps,
            durationSeconds: null,
            distanceM: null,
            weight: set.weight,
            rpe: set.rpe,
            isWarmup: false,
          })),
        },
      ]),
    ),
  };
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

/**
 * Background writes that are real, safe, and nothing to do with the rehearsal.
 *
 * ── Why deferred rather than refused ──────────────────────────────────────
 *
 * The barrier is up for about a minute while the member practises logging a
 * set. Things carry on underneath it: health sync pushes what the phone
 * actually measured, a notification token registers. Those are real member
 * data, not invented — refusing them would drop them on the floor and fill the
 * error paths with 403s that mean nothing to anybody reading a log later.
 *
 * So they are held and replayed when the barrier comes down. During the
 * interval nothing reaches the network, which is the guarantee; afterwards the
 * genuine writes land, a minute late, which for a background sync is no
 * difference at all.
 *
 * ── Why this is a list and not a rule ─────────────────────────────────────
 *
 * Because deferral is permission. A route matched here goes out eventually,
 * and if an unknown route were deferred by default then a workout mutation
 * added next year would be queued during the rehearsal and posted the moment
 * it ended — which is the contamination this whole file exists to prevent,
 * arriving sixty seconds later than it otherwise would.
 *
 * Refusal stays the default. This is the enumerated exception, it is short,
 * and nothing that touches training or a member's body record belongs in it.
 */
const DEFERRED_WRITES: RegExp[] = [
  // Real measurements from the device. The member's own data, already
  // collected; the rehearsal has no business discarding it.
  /^\/api\/health\/(?!workouts\/confirm)/,
  // Push token registration and read receipts. No body record involved.
  /^\/api\/notifications\//,
];

type Deferred = { input: RequestInfo | URL; init?: RequestInit };

let store: RehearsalStore | null = null;
let original: typeof globalThis.fetch | null = null;
let installed: typeof globalThis.fetch | null = null;
let refused: RefusedWrite[] = [];
let deferred: Deferred[] = [];

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
export function beginRehearsal(
  startedAt: string,
  fetchImpl?: typeof globalThis.fetch,
  /*
    A store rebuilt from the tutorial script, when the member is resuming into
    the middle of the workout lesson rather than walking there. Still purely in
    memory — resume reconstructs, it never restores something that was saved.
  */
  seeded?: RehearsalStore,
): void {
  if (store) return;
  store = seeded ?? createStore(startedAt);
  refused = [];
  deferred = [];

  /*
    Held as the reference we were given, not as a bound copy of it.

    `base.bind(globalThis)` returns a *new* function, so restoring it on the
    way out would leave a wrapper in place of whatever was there before —
    forever, and one layer thicker after every rehearsal. Natively that
    "whatever" is `installNativeApiFetch`'s patch, which every raw
    `fetch("/api/…")` in the app depends on; quietly replacing it with a bound
    proxy of itself is the kind of thing that works until it doesn't.
  */
  original = fetchImpl ?? globalThis.fetch;

  const wrapper = async (input: RequestInfo | URL, init?: RequestInit) => {
    const active = store;
    const base = original;
    if (!base) throw new Error("rehearsal boundary lost its original fetch");
    if (!active) return base.call(globalThis, input as RequestInfo, init);

    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
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
    if (verdict.kind === "passthrough") return base.call(globalThis, input as RequestInfo, init);
    if (verdict.kind === "serve") return json(verdict.status, verdict.body);

    if (DEFERRED_WRITES.some((r) => r.test(path))) {
      deferred.push({ input, init });
      // 202: accepted, not yet acted on. Which is exactly true.
      return json(202, { deferred: true, rehearsal: true });
    }

    refused.push({ method: method.toUpperCase(), path });
    /*
      A refusal is a 403 rather than a thrown error. A thrown fetch surfaces as
      "you appear to be offline", which is a lie that sends the member to check
      their wifi during a tutorial; a 403 is handled by the app's existing error
      paths and says something true.
    */
    return json(403, { error: verdict.reason, rehearsal: true });
  };

  installed = wrapper as typeof globalThis.fetch;
  globalThis.fetch = installed;
}

/**
 * End it, and let go of everything.
 *
 * ── Called from more places than it is started from ───────────────────────
 *
 * Deliberately. The rehearsal begins in one place and can end in six: the
 * member closes the sheet, pauses the walkthrough, backs out with the Android
 * gesture, navigates away, the component unmounts, or something throws. Every
 * one of those has to bring the barrier down, so this is idempotent, safe to
 * call when nothing is running, and safe to call twice — an effect cleanup and
 * an explicit close will both fire, and the second must not restore a
 * `null` over somebody else's fetch.
 *
 * The store is dropped rather than cleared, so nothing is left holding invented
 * sets and there is nothing to submit later even by mistake.
 */
export function endRehearsal(): void {
  if (!store && !installed) return;

  /*
    Only unwind what we put there.

    If something else has patched `fetch` on top of ours since — a debug tool,
    a future interceptor — then blindly assigning `original` would silently
    remove theirs. Leaving ours in place is worse, so the store is dropped
    either way: the wrapper checks `store` on every call and passes everything
    through once it is null, so an un-restorable barrier degrades to a
    transparent one rather than to a stuck one.
  */
  if (installed && globalThis.fetch === installed && original) {
    globalThis.fetch = original;
  }

  const held = deferred;
  installed = null;
  original = null;
  store = null;
  deferred = [];

  /*
    Replay what was held back. After the reset above, so these go out through
    the restored fetch rather than back into the barrier — which would queue
    them again, forever.
  */
  for (const { input, init } of held) {
    void Promise.resolve(globalThis.fetch(input as RequestInfo, init)).catch(() => undefined);
  }
}

/** How many real background writes are waiting for the barrier to come down. */
export function deferredWrites(): number {
  return deferred.length;
}
