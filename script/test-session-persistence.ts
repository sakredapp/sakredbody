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

  /** A finished-on-arrival log is not a competing workout. */
  check("one-shot logging is exempt", /input\.immediate \? \[\]/.test(body));
  const practice = code("client/src/components/build/LogPractice.tsx");
  check("and declares itself", /immediate: true/.test(practice));
  check("because it finishes in the same breath", /sessions\/\$\{id\}\/finish/.test(practice));
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

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
