/**
 * A workout is happening whether or not you are looking at it.
 *
 * ── What these hold ───────────────────────────────────────────────────────
 *
 * Navigating away is not cancellation. Only Finish ends a session, and the
 * elapsed time is a subtraction against a server timestamp rather than a
 * counter — because a counter lives inside a React component, and a React
 * component does not survive somebody walking to the water fountain.
 *
 * The prescribed half of this was missing: the session id lived in `useState`,
 * so leaving Build and returning left the log buttons inert on a session that
 * was still open on the server with sets already in it.
 *
 * Run: tsx script/test-session-persistence.ts
 */

import { readFileSync } from "node:fs";
import { formatElapsed } from "../client/src/components/build/Elapsed.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const code = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("\nElapsed time is derived, never counted\n");

{
  check("under a minute", formatElapsed(41_000) === "0:41", formatElapsed(41_000));
  check("minutes and seconds", formatElapsed(41 * 60_000 + 7_000) === "41:07");
  check("an hour pads the minutes", formatElapsed(72 * 60_000 + 30_000) === "1:12:30");
  check("exactly zero", formatElapsed(0) === "0:00");
  /**
   * A phone whose clock moved, or a timestamp from a moment in the future,
   * must not render a negative time over somebody's set.
   */
  check("a clock that ran backwards", formatElapsed(-5_000) === "0:00");

  const el = code("client/src/components/build/Elapsed.tsx");
  check("the time comes from a subtraction", /now - started/.test(el));
  check("and never from an increment", !/\+\+|prev \+ 1|c \+ 1/.test(el));
  check("the interval only redraws", /setNow\(Date\.now\(\)\)/.test(el));
}

console.log("\nThe server owns what is running\n");

{
  const routes = code("server/training/routes.ts");
  const open = routes.slice(routes.indexOf('"/api/training/sessions/open"'));

  check("open means unfinished", /isNull\(workoutSessions\.finishedAt\)/.test(open.slice(0, 900)));
  check("it reports when it began", /startedAt: workoutSessions\.createdAt/.test(open.slice(0, 900)));
  check("and which prescription it belongs to", /habitId: workoutSessions\.habitId/.test(open.slice(0, 900)));
}

console.log("\nNavigating away is not cancelling\n");

{
  const tab = code("client/src/components/BuildTab.tsx");

  /** Both shapes rehydrate from the one open-session answer. */
  check("a prescribed session is recovered", /if \(open\.habitId\)[\s\S]{0,120}setSessionId\(open\.id\)/.test(tab));
  check("an ad-hoc session still is too", /setFreeSession\(\{ id: open\.id/.test(tab));

  /**
   * And finishing has to invalidate that answer, or the effect immediately
   * restores the session the member just ended.
   */
  const finishIdx = tab.indexOf("Session logged.");
  const window = tab.slice(Math.max(0, finishIdx - 600), finishIdx);
  check("finishing clears the open-session cache", /sessions\/open/.test(window));
  check("and clears the local id", /setSessionId\(null\)/.test(window));

  /** Nothing else may end it. */
  check("no unmount cleanup ends a session", !/useEffect\([\s\S]{0,200}return \(\) =>[\s\S]{0,120}finish/.test(tab));
  check("no navigation handler ends one", !/onOpen\([^)]*\)[\s\S]{0,80}finish\.mutate/.test(tab));
}

console.log("\nOne open workout, refused rather than merged\n");

{
  const routes = code("server/training/routes.ts");
  const create = routes.slice(routes.indexOf('app.post("/api/training/sessions"'));
  const body = create.slice(0, 2600);

  check("a second interactive start is refused", /status\(409\)/.test(body));
  check("with a machine-readable reason", /open_session_exists/.test(body));
  /**
   * And it hands back what the caller needs to resume. A 409 that only says no
   * leaves the UI unable to offer the one useful action.
   */
  check("and the session to resume", /session: running/.test(body));
  check("including when it began", /startedAt: workoutSessions\.createdAt/.test(body));

  /**
   * Not a 200 carrying the existing session. The caller asked to start a back
   * session; a success code invites it to say "Back started" over a chest
   * workout that has been running for forty minutes.
   */
  check("never a success code", !/status\(200\)[\s\S]{0,80}running/.test(body));

  /**
   * The exemption is gone entirely. A one-shot practice is its own endpoint
   * now, so there is no flag a client could pass to sidestep this rule.
   */
  check("no bypass flag survives", !/input\.immediate/.test(routes));

  const practice = code("client/src/components/build/LogPractice.tsx");
  check("practice logging is one call", /\/api\/training\/practice/.test(practice));
  /**
   * It still *invalidates* the sessions list, which is correct — a new
   * practice belongs in history. What must be gone is creating one.
   */
  check(
    "and no longer creates a session itself",
    !/apiRequest\("POST", "\/api\/training\/sessions"/.test(practice),
  );
  check("nor finishes one", !/\/finish/.test(practice));
}

console.log("\nA half-written practice log leaves no ghost\n");

{
  /**
   * The one-shot flow is still three calls: create, write the set, finish. If
   * the second or third fails, an empty finished session is left behind — and
   * the question that matters is whether that inert row can masquerade as
   * training the member never did.
   *
   * It cannot. `movementEvents` selects FROM workout_sets and reaches the
   * session through an inner join, so a session with no sets contributes no
   * rows at all — not to history, not to the load projection, not to terrain.
   * Confirmed against production, where four finished sessions with zero sets
   * currently exist and produce zero events between them.
   *
   * So the failure mode is an inert record rather than a fabricated workout.
   * Worth removing by making the write atomic; not worth blocking on.
   */
  const history = code("server/movement/history.ts");
  check("events are selected from the sets", /\.from\(workoutSets\)/.test(history));
  check("and reach the session by inner join", /innerJoin\(workoutSessions/.test(history));
  check("so an empty session cannot contribute", !/\.from\(workoutSessions\)[\s\S]{0,200}leftJoin\(workoutSets/.test(history));
  check("a finished session is still required", /finishedAt\} is not null/.test(history));
}

console.log("\nA practice is written whole or not at all\n");

{
  const routes = code("server/training/routes.ts");
  const practiceRoute = routes.slice(routes.indexOf('app.post("/api/training/practice"'));
  const next = practiceRoute.indexOf("app.delete(");
  const body = next === -1 ? practiceRoute : practiceRoute.slice(0, next);

  check("the endpoint exists", body.length > 0);
  /**
   * One transaction. The three-call version left a finished session with
   * nothing in it whenever a request failed partway — inert, because
   * movementEvents selects FROM workout_sets, but inert is not correct.
   */
  check("session and set commit together", /transactionally/.test(body));
  // Written across lines in the source, so the match spans them.
  check("the set is written inside it", /tx\s*\.insert\(workoutSets\)/.test(body));
  check("and the session too", /tx\s*\.insert\(workoutSessions\)/.test(body));
  /** Born finished: it records something already done and must never be open. */
  check("it is never open", /finishedAt: new Date\(\)/.test(body));
  /**
   * The coach share is deliberately outside the transaction and best-effort —
   * a coach-thread failure must not roll back a practice the member did.
   */
  check("the share cannot roll it back", body.indexOf("transactionally") < body.indexOf("shareSessionWithCoach"));
}

console.log("\nA refusal is answered, not toasted\n");

{
  /**
   * The server hands back the running session so the member can be offered the
   * one useful action. A toast throws that away and leaves them on a screen
   * that just failed to do what they asked.
   */
  const helper = code("client/src/lib/startSession.ts");
  check("409 is a shape, not an exception", /status === 409/.test(helper));
  check("and carries the running session", /conflict: data\.session/.test(helper));
  check("it does not go through apiRequest", !/apiRequest/.test(helper));

  const card = code("client/src/components/build/WorkoutInProgress.tsx");
  check("the card names what is running", /session\.title/.test(card));
  check("shows how long it has been", /<Elapsed/.test(card));
  check("and offers the way back in", /Resume workout/.test(card));
  /** Ending somebody's training does not belong on a collision card. */
  check("it cannot finish the workout", !/finish|discard/i.test(card.replace(/Finish or discard it before beginning another\./, "")));

  for (const [name, path] of [
    ["the prescribed start", "client/src/components/BuildTab.tsx"],
    ["the ad-hoc start", "client/src/components/build/MemberBuild.tsx"],
  ] as const) {
    const src = code(path);
    check(`${name} handles the collision`, /"conflict" in result/.test(src));
    check(`${name} renders the card`, /<WorkoutInProgress/.test(src));
  }
}

console.log("\nEvery screen knows a workout is running\n");

{
  const hook = code("client/src/hooks/use-open-workout.ts");
  const bar = code("client/src/components/build/ActiveWorkoutBar.tsx");
  const dash = code("client/src/pages/MemberDashboard.tsx");

  /** One query key, or two screens disagree about whether training is happening. */
  check("the banner reads the same query Build does", /\/api\/training\/sessions\/open/.test(hook));
  check("and derives nothing from navigation", !/section|route|location/i.test(bar));

  check("it shows how long", /<Elapsed/.test(bar));
  check("and offers the way back", /onResume/.test(bar));
  /** "0 sets" on a workout somebody just started reads as a reproach. */
  check("it counts sets only once there are some", /sets > 0/.test(bar));

  check("it is mounted app-wide", /<ActiveWorkoutBar/.test(dash));
  check("and hides on the surface already showing it", /hidden=\{section === "build"\}/.test(dash));
}

console.log("\nOnly Finish or a confirmed Discard ends it\n");

{
  const routes = code("server/training/routes.ts");
  const discardRoute = routes.slice(routes.indexOf('app.delete("/api/training/sessions/:id"'));
  /**
   * Bounded at the next route, not by a character count — a fixed slice ran
   * into the finish handler below and found its `finishedAt`, which is how an
   * assertion about this route ends up reading a different one.
   */
  const nextRoute = discardRoute.indexOf("app.post(", 1);
  const body = nextRoute === -1 ? discardRoute : discardRoute.slice(0, nextRoute);

  check("discarding is possible at all", discardRoute.length > 0);
  /**
   * Without it, a session started by accident is permanent — the partial
   * unique index makes that stray row block every subsequent start.
   */
  check("ownership is in the predicate", /eq\(workoutSessions\.userId, userId\)/.test(body));
  check("a stranger's id is a refusal", /status\(404\)/.test(body));
  /** Deleted, not closed: an accidental tap is not training. */
  check("the sets go too", /delete\(workoutSets\)/.test(body));
  check("and it does not become history", !/finishedAt/.test(body));

  const free = code("client/src/components/build/FreeSession.tsx");
  check("the client asks first", /confirmDiscard/.test(free));
  check("and says what will happen", /Discard — tap again/.test(free));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
