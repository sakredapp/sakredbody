/**
 * Proving that a rehearsal workout cannot write to anybody's body record.
 *
 * ── Why this is the strictest file in the suite ───────────────────────────
 *
 * Every other failure in the walkthrough is an annoyance a member forgets by
 * lunchtime. This one is not recoverable: invented sets in a real training
 * history are indistinguishable from the member's own on arrival, Terrain
 * computes from them, Training Memory carries them forward, and LAST TIME will
 * show them back months later as their own previous performance. The product
 * would be telling somebody something false about their own body, and there is
 * no apology that undoes it.
 *
 * ── What is actually being proven ─────────────────────────────────────────
 *
 * Not "the buttons have guards on them". The whole rehearsal is driven through
 * the real boundary — `beginRehearsal` patches the global `fetch`, and every
 * request in the script below goes through the same code path a component
 * would use — with a stub underneath that records anything reaching the
 * network. The assertion is that the recorder saw **zero writes**, including
 * for routes this file deliberately never taught the rehearsal about.
 *
 * That last part is the difference between a guarantee and a habit. A mutation
 * added next year by somebody who has never read this file is still refused,
 * because refusal is the default and permission is the enumerated exception.
 */

import {
  REHEARSAL_LAST_TIME,
  beginRehearsal,
  createStore,
  endRehearsal,
  isRehearsing,
  refusedWrites,
  rehearsalStore,
  deferredWrites,
  routeRehearsal,
} from "../client/src/lib/tour/rehearsal.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const STARTED = "2026-08-17T09:00:00.000Z";

// ─── The recorder underneath ─────────────────────────────────────────────

type Seen = { method: string; url: string };
let escaped: Seen[] = [];

const recordingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  escaped.push({ method: method.toUpperCase(), url });
  return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof globalThis.fetch;

const writesEscaped = () => escaped.filter((s) => s.method !== "GET" && s.method !== "HEAD");

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return globalThis.fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─── The scripted rehearsal ──────────────────────────────────────────────

escaped = [];
beginRehearsal(STARTED, recordingFetch);
check("a rehearsal is running", isRehearsing());

/*
  Exactly the sequence the walkthrough asks for: open a session, add a
  movement, log a set, correct it, record effort, mark it taken to failure, add
  a second movement, then close without finishing.
*/
const open = await (await call("GET", "/api/training/sessions/open")).json();
check("the open session is the rehearsal, never the member's real one", open.rehearsal === true);
check("and it is labelled as such wherever it surfaces", open.title === "Rehearsal");

await call("POST", "/api/training/sessions", { title: "Rehearsal" });
await call("POST", "/api/training/sessions/rehearsal-session/exercises", {
  exerciseId: "bench-press",
  name: "Bench press",
});

const withMovement = await (
  await call("GET", "/api/training/sessions/rehearsal-session")
).json();
check("the movement is remembered before a single set is logged", withMovement.exercises.length === 1);
check(
  "and LAST TIME has something to teach against on the member's first day",
  withMovement.exercises[0].lastTime.sets.length === REHEARSAL_LAST_TIME.sets.length,
);

const exerciseId = withMovement.exercises[0].id;
await call("POST", "/api/training/sessions/rehearsal-session/sets", {
  sessionExerciseId: exerciseId,
  weight: 100,
  reps: 8,
});

const afterSet = await (await call("GET", "/api/training/sessions/rehearsal-session")).json();
/*
  Read defensively, and deliberately.

  If a write leaks to the real adapter the rehearsal store never sees it, so
  the set is missing and every subsequent line that assumes it exists throws.
  A crash is a worse failure report than a failed assertion: it stops the suite
  before the one check that actually names the escaped route. So the id falls
  back to a placeholder and the script continues to the claim below, which is
  the assertion that matters.
*/
const loggedSet = afterSet.exercises?.[0]?.sets?.[0];
const setId: string = loggedSet?.id ?? "rehearsal-set-missing";
check("a logged set appears", afterSet.exercises?.[0]?.sets?.length === 1);

/*
  Absent RPE is unknown, not easy. A rehearsal that quietly defaulted it would
  teach the member the opposite of what the RPE lesson says, and the same
  distinction is what stops the real system reading an unlogged set as a light
  one.
*/
check("effort left unrecorded stays unknown", loggedSet?.rpe === null);

await call("PATCH", `/api/training/sets/${setId}`, { rpe: 8, toFailure: true });
const afterEdit = await (await call("GET", "/api/training/sessions/rehearsal-session")).json();
const editedSet = afterEdit.exercises?.[0]?.sets?.[0];
check("a set can be corrected afterwards", editedSet?.rpe === 8);
check("and marked as taken to failure", editedSet?.toFailure === true);

await call("POST", "/api/training/sessions/rehearsal-session/exercises", {
  exerciseId: "row",
  name: "Row",
});
await call("DELETE", `/api/training/sets/${setId}`);
await call("DELETE", "/api/training/sessions/rehearsal-session");

// ─── The claim ───────────────────────────────────────────────────────────

check(
  "not one write reached the network during the whole rehearsal",
  writesEscaped().length === 0,
  writesEscaped().map((w) => `${w.method} ${w.url}`).join(", "),
);
check("and nothing was refused, because the script only did taught things", refusedWrites().length === 0,
  refusedWrites().map((w) => `${w.method} ${w.path}`).join(", "));

// ─── Everything else is refused, including what nobody thought of ────────

/*
  The enumerated list is the permission, and refusal is the default. Each of
  these is a real mutation path in the product; none of them is part of the
  rehearsal, and none of them can be reached from inside one.
*/
const FORBIDDEN: [string, string][] = [
  ["POST", "/api/training/sessions/real-session-42/finish"],
  ["POST", "/api/training/memory"],
  ["POST", "/api/training/practice"],
  ["POST", "/api/health/workouts/confirm"],
  ["POST", "/api/community/messages"],
  ["POST", "/api/terrain/checkin"],
  ["PATCH", "/api/training/preferences"],
  ["POST", "/api/coaching/messages"],
  ["DELETE", "/api/account"],
  // The one nobody has written yet. This is the whole point: a route invented
  // after this file was last read is still refused.
  ["POST", "/api/something/invented/next/year"],
];

const before = writesEscaped().length;
for (const [method, path] of FORBIDDEN) {
  const res = await call(method, path, { anything: true });
  check(`${method} ${path} is refused`, res.status === 403);
}
check(
  "and none of them reached the network either",
  writesEscaped().length === before,
  writesEscaped().slice(before).map((w) => `${w.method} ${w.url}`).join(", "),
);
check("every refusal is recorded by route", refusedWrites().length === FORBIDDEN.length,
  `${refusedWrites().length} of ${FORBIDDEN.length}`);

/*
  Reads are deliberately not intercepted. The member is meant to browse the
  real exercise catalogue during the lesson — teaching against a mock of the
  picker would teach them a picker that does not exist.
*/
const catalogueBefore = escaped.length;
await call("GET", "/api/training/exercises");
check("reads still reach the real server", escaped.length === catalogueBefore + 1);

// ─── Ending it leaves nothing behind ─────────────────────────────────────

endRehearsal();
check("the boundary is removed when the rehearsal ends", !isRehearsing());
check("and the invented session is dropped rather than cleared", rehearsalStore() === null);

const afterEnd = escaped.length;
await call("GET", "/api/training/sessions/open");
check("so the member's real session is theirs again", escaped.length === afterEnd + 1);

/*
  There is no cleanup request, and there must never be one. A cleanup implies a
  window in which the rows existed — which is the design this file exists to
  avoid.
*/
check(
  "no cleanup request is issued, because there is nothing to clean",
  !escaped.some((s) => s.method === "DELETE" && /training/.test(s.url)),
);

// ─── Reentrancy ──────────────────────────────────────────────────────────

/*
  Two begins and one end would leave the boundary installed after the
  walkthrough finished — and then the member's real workout would be swallowed
  by a rehearsal store. That is the one failure of this design that would be
  worse than not having it, so begin is idempotent.
*/
escaped = [];
beginRehearsal(STARTED, recordingFetch);
beginRehearsal(STARTED, recordingFetch);
endRehearsal();
check("a doubled begin does not survive a single end", !isRehearsing());
await call("POST", "/api/training/sessions/real/finish");
check("and a real write goes out again immediately afterwards", writesEscaped().length === 1);

// ─── The barrier's lifecycle ─────────────────────────────────────────────

/*
  The barrier patches the global `fetch`, which makes its lifecycle the most
  dangerous thing about it. A rehearsal that fails to come down does not break
  a tutorial — it breaks the application, for everything, until the app is
  killed. So the failure modes are enumerated rather than assumed.
*/

const pristine = globalThis.fetch;

beginRehearsal(STARTED, recordingFetch);
endRehearsal();
check("a normal exit restores the exact function that was there", globalThis.fetch === pristine);

/*
  Reference identity, not "a function that behaves the same".

  The first version held `base.bind(globalThis)` and restored that — a *new*
  function each time, one layer thicker after every rehearsal. Natively the
  thing being replaced is `installNativeApiFetch`'s patch, which every raw
  fetch("/api/…") in the app depends on, so quietly swapping it for a bound
  proxy of itself is the kind of thing that works until it doesn't.
*/
beginRehearsal(STARTED, recordingFetch);
const during = globalThis.fetch;
check("the barrier really is installed while running", during !== pristine);
endRehearsal();
endRehearsal();
check("and a doubled end does not restore over the top of itself", globalThis.fetch === pristine);

// Three rehearsals in a row must not accumulate wrappers.
for (let i = 0; i < 3; i++) {
  beginRehearsal(STARTED, recordingFetch);
  endRehearsal();
}
check("repeated rehearsals leave no residue", globalThis.fetch === pristine);

/*
  Something throwing mid-rehearsal is the realistic case — a render error, a
  bad response, a component unmounting under it. The caller is expected to end
  it from a `finally` or an effect cleanup, and what this proves is that doing
  so works from a throwing path.
*/
try {
  beginRehearsal(STARTED, recordingFetch);
  throw new Error("something failed inside the rehearsal");
} catch {
  endRehearsal();
}
check("an error during a rehearsal still brings the barrier down", globalThis.fetch === pristine);

check("ending one that never started is harmless", (() => {
  endRehearsal();
  return globalThis.fetch === pristine;
})());

/*
  If something else patches on top of ours, restoring blindly would remove
  theirs. Dropping the store instead makes the barrier transparent — every call
  passes through once there is no rehearsal — so an un-restorable barrier
  degrades to a no-op rather than to a stuck one.
*/
beginRehearsal(STARTED, recordingFetch);
const foreign = (async (input: RequestInfo | URL, init?: RequestInit) =>
  globalThis.fetch === foreign ? new Response("{}") : new Response("{}")) as typeof globalThis.fetch;
globalThis.fetch = foreign;
endRehearsal();
check("a foreign patch on top is not clobbered", globalThis.fetch === foreign);
check("and the rehearsal is over regardless", !isRehearsing());
globalThis.fetch = pristine;

// ─── Background systems are decided, not left to 403 ─────────────────────

/*
  The barrier is up for about a minute. Things carry on underneath it: health
  sync pushes what the phone actually measured, a push token registers. Those
  are real member data, not invented — refusing them would drop them and fill
  the logs with 403s that mean nothing to whoever reads them later.

  So they are held and replayed when the barrier comes down. Nothing reaches
  the network during the interval, which is the guarantee; afterwards the
  genuine writes land a minute late, which for a background sync is no
  difference at all.
*/
escaped = [];
beginRehearsal(STARTED, recordingFetch);

const health = await call("POST", "/api/health/days", { steps: 8000 });
const push = await call("POST", "/api/notifications/register", { token: "abc" });
check("a real health sync is accepted rather than refused", health.status === 202);
check("and so is a push registration", push.status === 202);
check("neither creates error noise", refusedWrites().length === 0);
check("but neither reaches the network yet", writesEscaped().length === 0);
check("they are held", deferredWrites() === 2);

endRehearsal();
await new Promise((r) => setTimeout(r, 0));
check(
  "and go out once the barrier is down",
  writesEscaped().length === 2,
  writesEscaped().map((w) => `${w.method} ${w.url}`).join(", "),
);

/*
  Deferral is permission, so it is an enumerated exception and refusal stays
  the default. If an unknown route were deferred instead, a workout mutation
  added next year would be queued during the rehearsal and posted the instant
  it ended — the same contamination, sixty seconds later.
*/
escaped = [];
beginRehearsal(STARTED, recordingFetch);
const confirm = await call("POST", "/api/health/workouts/confirm", { id: "x" });
check(
  "confirming a workout is member training state and is refused, not deferred",
  confirm.status === 403,
);
const unknown = await call("POST", "/api/whatever/comes/next", {});
check("and an unknown route is refused rather than queued", unknown.status === 403);
check("nothing was held", deferredWrites() === 0);
endRehearsal();
await new Promise((r) => setTimeout(r, 0));
check("so nothing goes out afterwards either", writesEscaped().length === 0,
  writesEscaped().map((w) => `${w.method} ${w.url}`).join(", "));

// ─── The interval is the workout, not the walkthrough ────────────────────

/*
  Scope matters as much as strictness. Holding the barrier for the whole
  five-minute tour would mean Home, Restore, Body and Room all run with the
  application's networking rerouted through a tutorial. The guarantee is "the
  rehearsal workout writes nothing", not "the app stops working while somebody
  is being taught.
*/
const begins = SAKRED_INTRO.steps.filter((s) => s.rehearsal === "begin");
const ends = SAKRED_INTRO.steps.filter((s) => s.rehearsal === "end");
check("exactly one step opens the barrier", begins.length === 1, begins.map((s) => s.id).join(", "));
check("and exactly one closes it", ends.length === 1, ends.map((s) => s.id).join(", "));
check("it opens where the session is started", begins[0]?.id === "start-session");
check("and closes where the session is closed", ends[0]?.id === "close-workout");

const from = SAKRED_INTRO.steps.findIndex((s) => s.rehearsal === "begin");
const to = SAKRED_INTRO.steps.findIndex((s) => s.rehearsal === "end");
check("the interval runs forwards", from !== -1 && to > from);
check(
  "and covers only the workout lessons",
  SAKRED_INTRO.steps.slice(from, to + 1).every((s) => s.objective === "Learn Build"),
  SAKRED_INTRO.steps.slice(from, to + 1).map((s) => s.id).join(", "),
);
check(
  "the walkthrough's other two thirds run with normal networking",
  from > 3 && to < SAKRED_INTRO.steps.length - 4,
  `barrier spans ${to - from + 1} of ${SAKRED_INTRO.steps.length} steps`,
);

// ─── The router, directly ────────────────────────────────────────────────

const store = createStore(STARTED);
check(
  "anything outside /api is none of the rehearsal's business",
  routeRehearsal("POST", "https://example.com/track", {}, store).kind === "passthrough",
);
check(
  "a GET the rehearsal has no opinion on passes through",
  routeRehearsal("GET", "/api/training/exercises", undefined, store).kind === "passthrough",
);
check(
  "the open session is answered from memory",
  routeRehearsal("GET", "/api/training/sessions/open", undefined, store).kind === "serve",
);
check(
  "and any unlisted write is refused by default",
  routeRehearsal("PUT", "/api/training/anything", {}, store).kind === "refuse",
);

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ rehearsal\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} rehearsal assertions passed (0 writes escaped)`);
