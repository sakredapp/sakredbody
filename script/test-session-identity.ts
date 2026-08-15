/**
 * The client is not allowed a second opinion about which session exists.
 *
 * ── The failure these were written from ───────────────────────────────────
 *
 * 15 Aug, one member, from the production logs:
 *
 *   16:37:32  POST   /api/training/sessions                 201
 *   16:38:00  DELETE /api/training/sessions/b8cf16d2…       200
 *   16:38:01  DELETE /api/training/sessions/b8cf16d2…       404
 *   16:40:47  POST   /api/training/sessions/b8cf16d2…/sets  404
 *
 * Two discards went out a second apart. The first one worked. React Query
 * gives a `useMutation` observer exactly one current mutation, so the second
 * call orphaned the first one's `onSuccess` — the session was deleted and the
 * only callback that ran was the error one. The screen stayed up. Sixteen
 * minutes later it was still showing a workout, a movement and a set waiting
 * to be logged, all pointing at a row that no longer existed.
 *
 * Nothing on the server was wrong. Every 404 was correct. The defect was that
 * the client treated a session id as something it remembered rather than
 * something it checks, and treated a write failure as a toast rather than as
 * information.
 *
 * ── What is held here ─────────────────────────────────────────────────────
 *
 *   the id is the server's       every surface reads one query, and the mirror
 *                                clears as well as sets
 *   a 404 is reconciled          re-ask, adopt the truth, take the screen down
 *   and never papered over       no surface may create a session to replace
 *                                one that vanished under it
 *
 * Run: tsx script/test-session-identity.ts
 */

import { readFileSync } from "node:fs";
import { isMissingSession } from "../client/src/lib/missingSession.js";

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

console.log("\nA vanished session is recognised, and nothing else is\n");

{
  /** The exact string the app got, twice, on 15 Aug. */
  const real = new Error('404: {"message":"No such session"}');
  check("the production error is recognised", isMissingSession(real));
  check("and the same text without an Error wrapper", isMissingSession('404: {"message":"No such session"}'));

  /**
   * A 404 from somewhere else is not permission to tear down the workout.
   * `DELETE /sets/:id` answers "Not found", and an exercise that is missing is
   * a 400 about the exercise.
   */
  check("a set that is not found is not this", !isMissingSession(new Error('404: {"message":"Not found"}')));
  check("nor a missing exercise", !isMissingSession(new Error('400: {"message":"No such exercise"}')));
  check("nor a server error", !isMissingSession(new Error("500: Internal Server Error")));
  /**
   * The status has to be there too. A 500 whose body happens to quote the
   * phrase must not be read as "the session is gone" — that would clear a live
   * workout off the screen because the database had a bad second.
   */
  check("the phrase alone is not enough", !isMissingSession(new Error("500: No such session")));
  check("and nothing at all is not it", !isMissingSession(undefined));
}

console.log("\nA new session is written into the cache, not announced to it\n");

{
  const hook = code("client/src/hooks/use-open-workout.ts");

  /**
   * The race that made a one-way mirror tempting: `GET /sessions/open` was
   * issued at 16:37:33, one second *after* the session was created. An answer
   * computed before the row existed must not be allowed to land on top of it
   * and report that nothing is running.
   */
  check("in-flight reads are cancelled first", /cancelQueries[\s\S]{0,120}setQueryData/.test(hook));
  check("and the session is written directly", /setQueryData<OpenAnswer>/.test(hook));
  check("reconciling asks the server, not the cache", /export async function reconcileOpenWorkout/.test(hook));
  /**
   * A failed reconcile is not evidence of anything. Dropping a live workout
   * because a reconnect was mid-flight is the same bug pointing the other way.
   */
  check("a network failure leaves the cache alone", /catch\s*\{[\s\S]{0,400}return null/.test(hook));

  /** Every creator seeds. A single one that only invalidates reopens the race. */
  for (const [name, path] of [
    ["the prescribed start", "client/src/components/BuildTab.tsx"],
    ["the ad-hoc start", "client/src/components/build/MemberBuild.tsx"],
    ["a Restore session", "client/src/components/RestoreTab.tsx"],
  ] as const) {
    check(`${name} seeds it`, /seedOpenWorkout\(qc,/.test(code(path)));
  }
}

console.log("\nThe mirror clears as well as sets\n");

{
  const tab = code("client/src/components/BuildTab.tsx");
  const start = tab.indexOf("useEffect(() => {");
  const effect = tab.slice(start, tab.indexOf("}, [openSession.isSuccess", start));

  check("the rehydration effect exists", start > -1);
  /**
   * This was `if (!open) return;` — the one line that let a screen keep a
   * session the server had already forgotten. It is now an unconditional
   * assignment rather than a branch that can be given an early exit, which is
   * the shape that cannot regress the same way: there is no path through it
   * that leaves the old id in place.
   */
  check("the prescribed id follows the server", /const mine = open\?\.habitId \? open\.id : null/.test(effect));
  check("and is assigned, not merely set when present", /if \(sessionId !== mine\) setSessionId\(mine\)/.test(effect));
  check("nothing open resolves to nothing held", /: null/.test(effect));
  check("it does not bail out on an empty answer", !/if \(!open\) return/.test(effect));
  /** A cleared cache is not an answer. Only a successful read is. */
  check("and only acts on a real answer", /openSession\.isSuccess/.test(effect));

  /**
   * The layer mirrors the other kind, from the same query, and comes down when
   * the server says nothing is running.
   */
  const sheetSrc = code("client/src/components/build/WorkoutSheet.tsx");
  check("the layer reads the same query", /useOpenWorkout\(\)/.test(sheetSrc));
  check("and closes itself when nothing is open",
    /if \(!session && expanded && !justFinished\) collapse\(\)/.test(sheetSrc));
  check("and renders nothing without one", /if \(!expanded \|\| !session/.test(sheetSrc));
}

console.log("\nA 404 takes the screen down, and never invents a session\n");

{
  const sheet = code("client/src/components/build/WorkoutSheet.tsx");
  const tab = code("client/src/components/BuildTab.tsx");

  /** One handler, so no write can be the one that forgot. */
  check("the workout layer has one failure path", /const failed = \(e: Error\)/.test(sheet));
  check("logging a set uses it", /sets`, body\),[\s\S]{0,120}onError: failed/.test(sheet));
  check("finishing uses it", /finish`, \{ shareWithCoach \}\)[\s\S]{0,600}onError: failed/.test(sheet));
  check("removing a movement uses it", /exercises\/\$\{exerciseId\}`\)[\s\S]{0,600}onError: failed/.test(sheet));
  check("it re-asks the server", /reconcileOpenWorkout\(qc\)/.test(sheet));
  /** And the layer comes down rather than staying up over a dead id. */
  check("and the layer comes down", /const gone = async \(\) => \{[\s\S]{0,300}collapse\(\)/.test(sheet));

  /** The prescribed path writes to a session id too, and had the same hole. */
  check("the prescribed path reconciles as well", /reconcileOpenWorkout\(qc\)/.test(tab));
  check("its set logging uses it", /sets`, body\),\s*onError: writeFailed/.test(tab));

  /**
   * The rule Jace set, checked rather than trusted: recovery may adopt what is
   * open and may clear what is not. It may not start anything.
   */
  const recovery = tab.slice(tab.indexOf("const sessionGone"), tab.indexOf("const today = useQuery"));
  /** A negative assertion over an empty string is not an assertion. */
  check("there is a recovery path to read", recovery.length > 100, `${recovery.length} chars`);
  check("recovery starts nothing", !/startSession\(|startFocus\.mutate|start\.mutate/.test(recovery));
  check("it clears the session", /setSessionId\(null\)/.test(recovery));
  check("a replacement is offered, not assumed", /setCollision\(replacement\)/.test(recovery));
  /** And the layer's own recovery invents nothing either. */
  const layerGone = sheet.slice(sheet.indexOf("const gone = async"), sheet.indexOf("const failed ="));
  check("there is a layer recovery path to read", layerGone.length > 80, `${layerGone.length} chars`);
  check("the layer starts nothing either", !/startSession|beginSession|POST", "\/api\/training\/sessions"/.test(layerGone));
  /** And says which of the two happened, because they are different facts. */
  check("it says so either way", /replacement\s*\?[\s\S]{0,200}no longer open/.test(recovery));

  /**
   * And there is exactly one surface that writes sets to an ad-hoc session.
   * Two would be two places to forget this in.
   */
  for (const path of [
    "client/src/components/BuildTab.tsx",
    "client/src/components/RestoreTab.tsx",
    "client/src/components/build/MemberBuild.tsx",
  ]) {
    check(`${path.split("/").pop()} does not log sets itself`,
      !/sessions\/\$\{[^}]+\}\/sets/.test(code(path).replace(/\$\{sessionId\}\/sets/g, "PRESCRIBED")));
  }
}

console.log("\nAnd finishing says so to the cache\n");

{
  const sheet = code("client/src/components/build/WorkoutSheet.tsx");

  /**
   * Found by putting it on a phone-shaped screen, not by reading it.
   *
   * Finishing invalidated the history, today and terrain, and left the
   * open-session answer alone — so for its full `staleTime` the resume strip
   * went on offering a workout that had ended, which is the exact failure the
   * strip's own file names as the reason it reads one shared query. Then the
   * eventual refetch pulled the confirmation screen out from under whoever was
   * reading it.
   */
  check("finishing ends the session in the cache",
    /qc\.setQueryData\(OPEN_WORKOUT_KEY, \{ session: null \}\)/.test(sheet));
  /**
   * And the confirmation outlives the session it is about, held until the
   * member presses Done rather than until a background refetch says otherwise.
   */
  check("the confirmation is held outside the session", /justFinished/.test(sheet));
  check("and rendered when nothing is open", /if \(justFinished\) return <Logged \/>/.test(sheet));
  check("the collapse-on-empty rule stands aside for it",
    /if \(!session && expanded && !justFinished\) collapse\(\)/.test(sheet));
  check("and only Done clears it", /setJustFinished\(null\);\s*collapse\(\)/.test(sheet));
}

console.log("\nOne discard, however fast the taps\n");

{
  const sheet = code("client/src/components/build/WorkoutSheet.tsx");

  /**
   * `discard.isPending` is React state and is not true in the same tick as the
   * call that starts it, so two taps close together both read it as false.
   * That is what put two DELETEs on the wire a second apart.
   */
  check("a ref latches the first one", /discardSent = useRef\(false\)/.test(sheet));
  check("and the handler checks it", /discardSent\.current\) return/.test(sheet));
  check("and sets it before firing", /discardSent\.current = true;\s*discard\.mutate\(\)/.test(sheet));
  /** Discarding something already absent has got what it asked for. */
  check("a 404 on discard is the outcome, not the failure",
    /onError: \(e: Error\) => \{\s*if \(isMissingSession\(e\)\) return void gone\(\)/.test(sheet));

  /**
   * The boxes clear only once the server has the set. `mutateAsync` rejects,
   * and letting that out of a click handler is an unhandled rejection under a
   * row that looks like it emptied because it saved.
   */
  check("a failed set does not clear the row", /catch \{\s*return;\s*\}\s*[\s\S]{0,200}patch\(g\.movement\.id/.test(sheet));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
