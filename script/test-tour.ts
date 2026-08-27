/**
 * The walkthrough's state machine, tested as the fifteen ways it goes wrong.
 *
 * ── Why the failures and not the happy path ───────────────────────────────
 *
 * The happy path of a tutorial is the part that gets built first and demoed
 * often, and it is not where the damage is. The damage is a member who took a
 * phone call at step nine and comes back to step one; a card that never loads
 * and a scrim that never lifts; a version bump that replays an hour of
 * education for somebody who finished it in March; and a rehearsal workout that
 * turns out to have written eleven sets into a real training history.
 *
 * That last one is the reason this file exists at all. Every other failure here
 * is an annoyance. Writing invented sets into somebody's record is the product
 * lying to them about their own body, and it is not recoverable by apologising.
 *
 * ── The overlay half ──────────────────────────────────────────────────────
 *
 * The engine is imported and exercised directly. The overlay cannot be — it
 * needs a DOM — so the last few scenarios are asserted against its source. That
 * is a weaker guarantee and is stated rather than glossed: it proves the
 * component still contains the handler, not that the handler works on a phone.
 * The device gates cover the rest.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  ANCHOR_TIMEOUT_MS,
  complete,
  emptyProgress,
  isSatisfied,
  objectives,
  pause,
  replay,
  resolve,
  resumeAt,
  mayAutoStart,
  shouldStart,
  unseenSteps,
} from "../client/src/lib/tour/engine.js";
import {
  SAKRED_COACH_INTRO,
  SAKRED_INTRO,
  roleTours,
} from "../client/src/lib/tour/sakredIntro.js";
import { isProgress, progressKey } from "../client/src/lib/tour/progress.js";
import { AUTO_START_ENABLED, REQUIRED_TOUR_VERSION, owesRequiredTour } from "../client/src/lib/tour/rollout.js";
import { TOUR_ANCHORS } from "../client/src/lib/tour/types.js";
import {
  HOLD_LIMIT,
  MAX_DIRECTED,
  STILL_FRAMES,
  initialMotion,
  nextMotion,
  padFor,
  settleSide,
  PAD,
  type MotionCommand,
  type MotionReading,
  type MotionState,
} from "../client/src/lib/tour/motion.js";
import type { GuidedTour, TourAnchor, TourProgress, TourWorld } from "../client/src/lib/tour/types.js";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const TOUR = SAKRED_INTRO;
const NOW = "2026-08-17T12:00:00.000Z";

const READY = {
  authenticated: true,
  intakeComplete: true,
  homeReady: true,
  redirecting: false,
  systemDialogOpen: false,
};

function world(over: Partial<TourWorld> = {}): TourWorld {
  return { section: null, present: new Set<TourAnchor>(), seen: new Set<TourAnchor>(), waitedMs: 0, ...over };
}

const stepAt = (i: number) => TOUR.steps[i];
const indexOf = (id: string) => TOUR.steps.findIndex((s) => s.id === id);

// ─── 1. A new member gets it once ────────────────────────────────────────

check("a member who just finished intake is offered the walkthrough", shouldStart(null, TOUR, READY));

/*
  Every one of these is a real way to ruin the first screen. A tour that starts
  over skeletons spotlights a rectangle about to move; one that starts mid
  redirect teaches the wrong screen; one that starts under the OS health prompt
  dims an app the member cannot see and waits for a tap the system is
  intercepting — a dead end on launch day, with no way back.
*/
check("but not before they are signed in", !shouldStart(null, TOUR, { ...READY, authenticated: false }));
check("nor before intake is finished", !shouldStart(null, TOUR, { ...READY, intakeComplete: false }));
check("nor while Home is still skeletons", !shouldStart(null, TOUR, { ...READY, homeReady: false }));
check("nor mid-redirect", !shouldStart(null, TOUR, { ...READY, redirecting: true }));
check(
  "nor underneath a native permission dialog",
  !shouldStart(null, TOUR, { ...READY, systemDialogOpen: true }),
);

/*
  And then the product's question, which is a different one.

  `shouldStart` answers an engineering question — are the preconditions met —
  and it is true above. `mayAutoStart` answers whether the walkthrough is meant
  to take the screen at all, which was false for as long as it took to measure
  it: geometry at four viewports, every checkpoint reconstructed after the app
  is destroyed, both atmospheres applied to the real app, and the coach
  extension. It is now true, and these assert what that means rather than
  restating the flag.
*/
check("automatic rollout is on, and on explicitly", AUTO_START_ENABLED === true);
check("a member who has never seen it is offered it", mayAutoStart(null, TOUR, READY));
check(
  "and so is one part-way through",
  mayAutoStart(complete(emptyProgress(TOUR), TOUR, 0, NOW), TOUR, READY),
);
check(
  "somebody who finished this version is not",
  !mayAutoStart(
    { ...emptyProgress(TOUR), stepId: null, completedAt: NOW, completed: TOUR.steps.map((s) => s.id) },
    TOUR,
    READY,
  ),
);
/*
  The preconditions still decide. Rollout removes the product's hold, not the
  rule that a walkthrough must not start over a screen of skeletons.
*/
check("and nothing starts over an unready Home", !mayAutoStart(null, TOUR, { ...READY, homeReady: false }));
check(
  "an account owing the required version is owed it",
  owesRequiredTour(null) && owesRequiredTour(0) && owesRequiredTour(REQUIRED_TOUR_VERSION - 1),
);
check(
  "and one that has it is not",
  !owesRequiredTour(REQUIRED_TOUR_VERSION),
);
/*
  Pinned rather than derived, which is the property that matters — writing
  `REQUIRED_TOUR_VERSION = TOUR.version` would make every improvement to the
  walkthrough a compulsory interruption for everybody who already sat through
  it. Asserted against the source rather than the value, so the number is free
  to move when somebody decides it should.
*/
check(
  "the required version is a literal, not the tour's own version",
  /REQUIRED_TOUR_VERSION = \d+;/.test(
    readFileSync("client/src/lib/tour/rollout.ts", "utf8"),
  ),
);

/* You cannot require a version of the walkthrough that has not been written. */
check(
  "and never asks for a version that does not exist",
  REQUIRED_TOUR_VERSION >= 1 && REQUIRED_TOUR_VERSION <= TOUR.version,
  `required ${REQUIRED_TOUR_VERSION}, tour ${TOUR.version}`,
);

/*
  ── The required bump, which is what resets the walkthrough for everybody ──

  A member who finished v1 has a record saying so. When the required version
  moves past theirs they are offered the walkthrough again, from the start —
  not from "the first step you have not done", which for a completed record is
  past the end.
*/
{
  const finishedV1 = { ...emptyProgress(TOUR), version: 1, completed: TOUR.steps.map((s) => s.id), completedAt: NOW, stepId: null };
  check(
    "a record older than the required version is owed the walkthrough again",
    shouldStart(finishedV1, TOUR, READY),
  );
  check(
    "and is taken to the beginning rather than past the end",
    resumeAt(finishedV1, TOUR) === 0,
    String(resumeAt(finishedV1, TOUR)),
  );
  const finishedCurrent = { ...emptyProgress(TOUR), completed: TOUR.steps.map((s) => s.id), completedAt: NOW, stepId: null };
  check(
    "a record at the required version is left alone",
    !shouldStart(finishedCurrent, TOUR, READY),
  );
}
check(
  "the hook asks the product question, not the engineering one",
  /mayAutoStart\(/.test(readFileSync("client/src/hooks/use-guided-tour.ts", "utf8")),
);

// ─── 2. A returning member is left alone ─────────────────────────────────

const finished: TourProgress = {
  tourId: TOUR.id,
  version: TOUR.version,
  stepId: null,
  completed: TOUR.steps.map((s) => s.id),
  completedAt: NOW,
};
check("a member who finished it is never shown it again", !shouldStart(finished, TOUR, READY));

// ─── 3. Leaving at step four returns to step four ────────────────────────

/*
  The single most important behaviour in the file. A member who is interrupted
  four steps in and restarted at step one does not do it twice; they close the
  app. Phone call, force-quit, permission sheet, put the phone down — all the
  same event as far as the record is concerned.
*/
let held = emptyProgress(TOUR);
for (let i = 0; i < 3; i++) held = complete(held, TOUR, i, NOW);
held = pause(held, TOUR, 3);

check("pausing records the step they were on", held.stepId === stepAt(3).id);
check("and resuming lands there, not at the beginning", resumeAt(held, TOUR) === 3);
check("with the three completed lessons still recorded", held.completed.length === 3);
check("and a paused tour is not a finished one", held.completedAt === null);
check("so it is offered again", shouldStart(held, TOUR, READY));

/*
  Ids, not indices. A step inserted into the middle of the tour shifts every
  index after it, and a resume keyed on position would silently teach the wrong
  lesson to everybody mid-walkthrough at the moment of the deploy.
*/
const shifted: GuidedTour = {
  ...TOUR,
  steps: [TOUR.steps[0], { ...TOUR.steps[1], id: "inserted" }, ...TOUR.steps.slice(1)],
};
check(
  "an inserted step does not move a paused member onto a different lesson",
  shifted.steps[resumeAt(held, shifted)].id === stepAt(3).id,
);

// ─── 4. The app reaching a section is what advances the step ─────────────

const buildStep = stepAt(indexOf("build"));
check(
  "being told to open Build does not advance while the app is on Home",
  !isSatisfied(buildStep.advance, world({ section: "home" }), false),
);
check(
  "and does advance the moment Build is showing",
  isSatisfied(buildStep.advance, world({ section: "build" }), false),
);

/*
  Deliberately satisfied by the section rather than by the tap. A member who
  opens Build from a card on Home has done exactly what was asked, and pinning
  the step to the specific control would leave them staring at a spotlight on a
  tab they are no longer looking at.
*/
check(
  "however they got there",
  isSatisfied(buildStep.advance, world({ section: "build" }), false),
);

const tapStep = stepAt(indexOf("body-territory"));
check("a tap step needs the tap", !isSatisfied(tapStep.advance, world({ section: "body" }), false));
check("and is satisfied by it", isSatisfied(tapStep.advance, world({ section: "body" }), true));

const closeStep = stepAt(indexOf("close-workout"));
check(
  "closing the rehearsal is waiting for the set row to go away",
  !isSatisfied(closeStep.advance, world({ present: new Set(["workout-set-row"] as TourAnchor[]) }), false),
);
check(
  "and completes when it has",
  isSatisfied(closeStep.advance, world({ seen: new Set(["workout-set-row"] as TourAnchor[]) }), false),
);
/*
  The distinction that matters on resume: "gone" and "not arrived yet" look
  identical from one frame. A reconstructed workout takes a moment to rebuild,
  and without this the lesson whose whole instruction is to make something
  disappear taught itself before the thing existed.
*/
check(
  "but not before the row has ever been there",
  !isSatisfied(closeStep.advance, world(), false),
);

// ─── 5. A target that is merely late is waited for ───────────────────────

const terrain = stepAt(indexOf("terrain"));
const late = resolve(terrain, world({ section: "home", waitedMs: 1200 }));
check("a card that has not loaded yet is waited for", late.kind === "waiting", late.kind);
check(
  "and nothing is spotlighted while waiting",
  late.kind === "waiting" && !("anchor" in late),
);
check(
  "once it arrives it is spotlighted",
  resolve(terrain, world({ section: "home", present: new Set(["terrain-now"] as TourAnchor[]) })).kind === "ready",
);

/*
  Wandering off mid-step is waiting, not failure — a member is allowed to look
  at something. What must not happen is a spotlight drawn on a screen they are
  no longer on.
*/
check(
  "a member who navigates away mid-step is waited for, not failed",
  resolve(terrain, world({ section: "community", waitedMs: 500 })).kind === "waiting",
);

// ─── 6. A target that never appears does not freeze the app ──────────────

/*
  The failure that turns a tutorial into a support ticket. The app is visibly
  there, dimmed, and cannot be touched — which reads as a crash on the first
  screen after signing up. Every wait is bounded and every bound has an exit.
*/
const never = world({ section: "home", waitedMs: ANCHOR_TIMEOUT_MS + 1 });
const stuck = resolve(terrain, never);
check("a required target that never arrives degrades rather than hanging", stuck.kind === "degraded", stuck.kind);

const optional = stepAt(indexOf("last-time"));
check(
  "an optional one is skipped in silence",
  resolve(optional, world({ waitedMs: ANCHOR_TIMEOUT_MS + 1 })).kind === "skip",
);
check(
  "a member with no training history is never shown the LAST TIME lesson",
  optional.optional === true,
);

check(
  "no resolution can be 'waiting' once the bound has passed",
  TOUR.steps.every((s) => resolve(s, world({ section: s.section ?? null, waitedMs: 60_000 })).kind !== "waiting"),
);

/*
  Degraded is not a dead end either: the panel has to offer a way forward.
  Asserted at the component, since that is where the button lives.
*/
const overlay = readFileSync("client/src/components/tour/GuidedTourOverlay.tsx", "utf8");
/*
  Comments stripped, for the assertions phrased as absences. This file argues
  at length against synthetic clicks and against XP counters, and searching the
  prose for the words it is arguing against would fail on the argument itself.
*/
const overlayCode = overlay.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check(
  "a degraded step still offers a way onward",
  /resolution\.kind === "degraded"/.test(overlay) && /button-tour-continue/.test(overlay),
);

// ─── 7. The permission sheet interrupts and the tour survives it ─────────

let interrupted = emptyProgress(TOUR);
interrupted = complete(interrupted, TOUR, 0, NOW);
interrupted = pause(interrupted, TOUR, 1);
check(
  "the tour does not restart while the OS dialog is up",
  !shouldStart(interrupted, TOUR, { ...READY, systemDialogOpen: true }),
);
check("and picks up where it was once the dialog closes", shouldStart(interrupted, TOUR, READY));
check("on the same step", resumeAt(interrupted, TOUR) === 1);

// ─── 8. The rehearsal writes nothing ─────────────────────────────────────

/*
  Not an annoyance. Invented sets in a real training history are the product
  telling somebody something false about their own body, and Terrain computes
  from those rows. The rehearsal is therefore not "a workout that gets cleaned
  up afterwards" — cleanup implies a window in which it existed.
*/
const intro = readFileSync("client/src/lib/tour/sakredIntro.ts", "utf8");
check(
  "the walkthrough tells the member the session is a rehearsal",
  /rehearsal/i.test(intro) && /Nothing in here is recorded/i.test(intro),
);
check(
  "and says plainly that closing it keeps nothing",
  /no sets, no history/i.test(intro),
);

// ─── 9 & 10. Roles ───────────────────────────────────────────────────────

check("an ordinary member is never offered the coaching walkthrough", roleTours("member").length === 0);
check("nor is somebody with no role at all", roleTours(null).length === 0);
check("a coach is", roleTours("coach")[0]?.id === SAKRED_COACH_INTRO.id);

/*
  Rank is the wrong test here, and it is the mistake that would be made. An
  admin outranks a coach in every permission check in the product, and still
  should not be handed a walkthrough about clients they do not have.
*/
check("and an admin is not, despite outranking one", roleTours("admin").length === 0);

check(
  "the coach extension is its own tour rather than a branch in the member one",
  SAKRED_COACH_INTRO.id !== SAKRED_INTRO.id &&
    !SAKRED_INTRO.steps.some((s) => s.id.startsWith("coach")),
);
check(
  "so a new role registers a tour without editing the member walkthrough",
  /export const ROLE_TOURS/.test(intro),
);

// ─── 11. Both atmospheres resolve every tutorial token ───────────────────

const css = readFileSync("client/src/index.css", "utf8");
const used = [...overlay.matchAll(/--tour-[a-z-]+/g)].map((m) => m[0]);
check("the overlay uses tour tokens rather than literal colours", used.length > 0, used.join(", "));

for (const token of Array.from(new Set(used))) {
  const inRoot = new RegExp(`:root[\\s\\S]*?${token}:`).test(css);
  const inDark = new RegExp(`\\[data-theme="dark"\\][\\s\\S]*?${token}:`).test(css);
  const inLight = new RegExp(`\\[data-theme="light"\\][\\s\\S]*?${token}:`).test(css);
  check(`${token} resolves in every atmosphere`, inRoot && inDark && inLight,
    `root:${inRoot} dark:${inDark} light:${inLight}`);
}

/*
  The specific mistake worth naming: a scrim tuned for ink, reused in daylight,
  turns a light app dark for the length of the tutorial. That is changing the
  member's theme without asking. Light gets a warm veil at roughly half the
  strength, and the panel stays parchment rather than inverting to ink.
*/
const lightBlock = css.slice(css.indexOf('[data-theme="light"]'));
const lightScrim = lightBlock.match(/--tour-scrim:[^;]*\/\s*([\d.]+)/)?.[1];
const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
const darkScrim = darkBlock.match(/--tour-scrim:[^;]*\/\s*([\d.]+)/)?.[1];
check(
  "the daylight scrim is materially lighter than the nocturnal one",
  !!lightScrim && !!darkScrim && Number(lightScrim) < Number(darkScrim) * 0.7,
  `light ${lightScrim} vs dark ${darkScrim}`,
);
check(
  "and the daylight panel is parchment, not ink",
  /--tour-panel:\s*4\d /.test(lightBlock.slice(0, lightBlock.indexOf("}"))),
);

// The halo is decoration. Reduced motion drops it, which costs no information
// because the target is already the only lit thing on the screen.
check(
  "the spotlight pulse is held under reduced motion",
  /prefers-reduced-motion[\s\S]*?\.tour-pulse\s*\{\s*animation:\s*none/.test(css) &&
    /!reduced && "tour-pulse"/.test(overlay),
);

// ─── 12. Replay changes nothing ──────────────────────────────────────────

check("replaying does not rewrite the completion record", replay(finished) === finished);
check(
  "and a completed member is still recorded as completed afterwards",
  replay(finished).completedAt === NOW && replay(finished).completed.length === TOUR.steps.length,
);

// ─── 13. A version bump does not replay the whole thing ──────────────────

/*
  The reason the walkthrough is versioned rather than a boolean. Sakred will
  change; a member who learned it in March should be shown what is new, not
  taught the Body Map again.
*/
const v2: GuidedTour = {
  ...TOUR,
  version: 2,
  steps: [...TOUR.steps, { id: "new-thing", title: "New", body: "New.", advance: { kind: "continue" } }],
};
const fresh = unseenSteps(finished, v2);
check("a bump offers only what is actually new", fresh.length === 1 && fresh[0].id === "new-thing");
check("and there is nothing to offer when nothing changed", unseenSteps(finished, TOUR).length === 0);
check(
  "an unfinished member on the old version resumes rather than restarting",
  resumeAt(held, v2) === 3,
);
check(
  "progress is keyed by version so the old record survives the bump",
  progressKey(TOUR.id, 1) !== progressKey(TOUR.id, 2),
);

// ─── 14. Back cannot leave a stale scrim over the app ────────────────────

/*
  Android's back gesture does not go through the router on its way out, so
  without this the screen underneath is dismissed and the scrim stays over
  whatever it landed on: an app that is dimmed, unresponsive, and has no visible
  way out of it.
*/
check(
  "the hardware back button is handled and pauses rather than abandoning",
  /addListener\("backButton"[\s\S]{0,80}onPause\(\)/.test(overlay),
);
check("Escape does the same on the web", /e\.key === "Escape"[\s\S]{0,40}onPause/.test(overlay));
check(
  "and pausing keeps everything already completed",
  pause(held, TOUR, 3).completed.length === 3,
);

// ─── 14b. A step is judged on its own readings ───────────────────────────

/*
  The frame loop runs after render, so for one render after a step change the
  world in state describes the previous step. Two lessons were lost to reading
  it anyway, and the second is the worse one: `waitedMs` belongs to the step the
  member was just reading, so lingering over one lesson made the *next* one
  give up before it had looked. Anything over six seconds — an ordinary read —
  silently skipped the health lesson and degraded required ones.

  The guard is that measurements carry the step they were taken for, and a step
  with no measurements of its own is treated as having waited no time and seen
  nothing. Asserted at the call site rather than by behaviour, because the
  behaviour needs a browser; script/qa-walkthrough.ts is where it is proved.
*/
{
  const hook = readFileSync("client/src/hooks/use-guided-tour.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    "measurements record which step they describe",
    /stepId: step\.id/.test(hook) && /world\.stepId === step\.id/.test(hook),
  );
  /*
    Matched on the fields that carry the meaning — no anchors, no time waited —
    rather than on the whole literal. The literal spelling broke when `loading`
    was added to the world, on a change that did not touch this behaviour at
    all, which is how a test ends up relaxed by whoever is in a hurry.
  */
  check(
    "and a step is never resolved against another step's readings",
    /measured \? world : \{[^}]*present: EMPTY[^}]*seen: EMPTY[^}]*waitedMs: 0/.test(hook),
  );
  check(
    "nor completed from them",
    /if \(measured && isSatisfied\(/.test(hook),
  );
}

// ─── 15. The hole stays over the target ──────────────────────────────────

/*
  A rect measured once is wrong a moment later: a lazy chunk arrives, an image
  loads, a list resolves and pushes the card down, the keyboard opens, the phone
  rotates.
*/
check(
  "the target is re-measured continuously rather than once",
  /requestAnimationFrame\(measure\)/.test(overlay) && /getBoundingClientRect/.test(overlay),
);
check(
  "and state is only set when the rect actually moved",
  /if \(!published \|\| !SAME\(last, next\)\)/.test(overlay),
);
/*
  Except the first frame of a step, which must publish whatever it found —
  including nothing. `last` starts null, so a step whose target cannot be
  resolved compared null to null, never called `setRect`, and left the previous
  lesson's halo on screen: the panel explained RPE while the spotlight sat on
  the set row above it.
*/
check(
  "and a step that resolves nothing clears the last one's halo",
  /let published = false/.test(overlay) && /published = true/.test(overlay),
);
check(
  "an offscreen target is brought into view before it is pointed at",
  /scrollIntoView\(\{\s*block: "center"/.test(overlay),
);
/*
  Placement is a fit test, not a fraction of the screen.

  This used to assert `viewportH * 0.58` — the rule that asked where the target
  was and never how tall the panel is. It has been replaced by a measurement:
  does the panel fit above, does it fit below, and it is clamped by the
  lesson's weight so a long line cannot grow into the product underneath.
  Asserting the constant would now pin the exact heuristic that put the Restore
  panel over the practices it was pointing at.
*/
check(
  "the panel moves out of the way when the target is low on the screen",
  /panelAtTop/.test(overlay) && /settleSide\(/.test(overlay),
);
/*
  Asserted as the room it is given, not as the spelling of the comparison.
  This read `below >= h + GAP` and broke on a refactor that preserved the
  behaviour exactly — and a test that fails on a rename it does not care about
  is one whoever is in a hurry relaxes. The decision itself is covered directly
  against `settleSide`, below.
*/
check(
  "and decides by whether it fits, using its own measured height",
  /above: rect\.top/.test(overlay) &&
    /below: viewportH - \(rect\.top \+ rect\.height\)/.test(overlay) &&
    /need,/.test(overlay) &&
    /panelH \|\| maxPanelH/.test(overlay),
);
/*
  The keyboard changes the usable height and never fires a resize on window.
  Measuring against innerHeight is how a panel "below the target" ends up
  behind the keyboard on the Add Movement lesson.
*/
check(
  "the usable height comes from the visual viewport, not the window",
  /visualViewport/.test(overlay) && /vv\.addEventListener\("resize"/.test(overlay),
);
/*
  The four screenshots that made this pass necessary were all one defect: the
  teaching panel taking more room than the lesson needed and covering what it
  was teaching.
*/
check(
  "a lesson's weight caps how much of the screen it may take",
  /maxViewportShare/.test(overlay) || /maxPanelH/.test(overlay),
);
check(
  "and the cap is enforced as a real height, not hoped for",
  /style=\{\{ maxHeight: maxPanelH \}\}/.test(overlay),
);
/*
  Edge nav targets. Home ran off the left of a real iPhone and More off the
  right, because 8px of breathing room around a cell flush to the viewport is
  drawn off screen.
*/
check(
  "the halo is one clamped rectangle shared by the cutout and the ring",
  /const halo = rect/.test(overlay) && /Math\.min\(viewportW/.test(overlay),
);
/*
  Asserted against the rule itself, on the anchor names the tour really uses.
  This matched the source for the string "nav-|role-" and broke the moment the
  rule was corrected to stop hugging the More sheet's rows — a test failing on
  a change that fixed the thing it was guarding.
*/
check("and nav targets are hugged rather than padded outward", /padFor/.test(overlay));
for (const cell of ["nav-home", "nav-restore", "nav-build", "nav-community", "nav-body", "nav-more", "role-coach"]) {
  check(`  ${cell} is hugged`, padFor(cell) === 0);
}
/*
  The rows inside the More sheet are named `nav-…` too and are not navigation
  cells. Hugging them put the ring exactly on the row's own edge.
*/
for (const row of ["nav-more-settings", "nav-more-wins", "terrain-now", "restore-practice"]) {
  check(`  ${row} keeps its breathing room`, padFor(row) === PAD, `got ${padFor(row)}`);
}
check("a step with no anchor still has a padding answer", padFor(undefined) === PAD);
/*
  The keyboard. On the Add Movement lesson the picker autofocused its search
  box, so the keyboard took half the phone and the movement list the lesson was
  pointing at went behind it.
*/
{
  const picker = readFileSync("client/src/components/build/MovementPicker.tsx", "utf8");
  check(
    "the picker does not summon the keyboard during a lesson",
    /autoFocus=\{!isTourActive\(\)\}/.test(picker),
  );
  check(
    "…and still does when a member opens it themselves",
    !/autoFocus=\{false\}/.test(picker) && /isTourActive/.test(picker),
  );
  check(
    "the overlay publishes that a lesson is on screen",
    /setAttribute\("data-tour-active", "true"\)/.test(overlay) &&
      /removeAttribute\("data-tour-active"\)/.test(overlay),
  );
}

check(
  "and both positions clear the home indicator and the gesture area",
  /safe-area-inset-bottom/.test(overlay) && /safe-area-inset-top/.test(overlay),
);

/*
  The interaction rule, which is the reason for the four-rectangle scrim rather
  than a mask or a giant box-shadow. Either of those leaves an element over the
  target, so the tap the tutorial is waiting for lands on the scrim; the usual
  patch — pointer-events: none — fixes that and makes every other control live
  again, which is the thing the scrim existed to prevent.
*/
check(
  "the scrim is four rectangles around the target rather than a mask over it",
  (overlay.match(/<Scrim/g) ?? []).length >= 4,
);
check(
  "so the real control receives the real tap, with no forwarding",
  !/dispatchEvent|synthetic|\.click\(\)/.test(overlayCode),
);
check(
  "and the halo drawn over the gap never intercepts it",
  /rounded-xl pointer-events-none/.test(overlay),
);

// ─── The tour itself ─────────────────────────────────────────────────────

/*
  Targets are named, never selected. A CSS path breaks the next time somebody
  adds a wrapper — silently, in production, on the first screen a new member
  sees.
*/
check(
  "no step locates its target by CSS path",
  !/querySelector\(['"`][.#]/.test(overlay) && !/nth-child/.test(overlay + intro),
);

/*
  Every target a step names must exist on a real control.

  This is what makes named anchors worth more than CSS paths. A path breaks
  silently in production on the first screen a new member sees; a name that
  nothing carries fails here, at the moment it is typed.

  `PENDING` is the wiring still to be placed, enumerated rather than assumed —
  an anchor is either on a control or on this list. That is a deliberately
  awkward place to leave work, which is the point.
*/
const PENDING = new Set<TourAnchor>([]);

/*
  Resume reconstruction: not built yet.

  A hand-set flag, and deliberately not inferred from the source — there is no
  regex that honestly answers "does resume rebuild the world". It flips when the
  work lands and the tests below it exist, and until then it holds the mounting
  gate shut on its own.
*/
const RESUME_RECONSTRUCTS = /test-resume/.test(readFileSync("package.json", "utf8"));

const begins = TOUR.steps.filter((s) => s.rehearsal === "begin").length;
const ends = TOUR.steps.filter((s) => s.rehearsal === "end").length;

const placed = new Set(
  execSync('grep -rho \'data-tour-id="[a-z-]*"\' client/src || true', { encoding: "utf8" })
    .split("\n")
    .map((l) => l.match(/data-tour-id="([a-z-]*)"/)?.[1])
    .filter((v): v is string => !!v),
);

/*
  The nav and the role pills build their anchor from an id, so the literal
  string never appears in the source and a grep cannot see it. Their shape is
  asserted here instead, once, and the ids they produce are then known.
*/
const navSrc = readFileSync("client/src/components/MemberNav.tsx", "utf8");
const navGenerates = /data-tour-id=\{`nav-\$\{id\}`\}/.test(navSrc);
const moreGenerates = /data-tour-id=\{`nav-more-\$\{d\.id\}`\}/.test(navSrc);
const roleGenerates = /data-tour-id=\{`role-\$\{id\}`\}/.test(navSrc);
check("the primary bar carries a tour anchor per destination", navGenerates);
check("the More sheet carries one per row", moreGenerates);
check("and the role pills carry one each", roleGenerates);
if (navGenerates) for (const a of ["nav-home", "nav-restore", "nav-build", "nav-community", "nav-body"]) placed.add(a);
if (moreGenerates) for (const a of ["nav-more-settings", "nav-more-wins"]) placed.add(a);
if (roleGenerates) placed.add("role-coach");

const named = new Set<TourAnchor>(
  [...TOUR.steps, ...SAKRED_COACH_INTRO.steps].flatMap((s) => {
    const a: TourAnchor[] = [];
    if (s.anchor) a.push(s.anchor);
    if ("anchor" in s.advance) a.push(s.advance.anchor);
    return a;
  }),
);

const missing = [...named].filter((a) => !placed.has(a) && !PENDING.has(a));
check("every anchor a step names exists on a real control", missing.length === 0, missing.join(", "));

/*
  The arithmetic, asserted rather than reported.

  The previous version of this file had the enum as a type, which cannot be
  counted at runtime — so the denominator lived in prose, and prose is how a
  status report says "13 of 15" while listing fifteen items. Two unplaced
  targets fit comfortably inside a slip like that.

  Now every anchor in `TOUR_ANCHORS` is in exactly one of three buckets and the
  buckets have to account for all of it. An anchor added to the enum and
  forgotten fails here rather than being quietly absent from a count.
*/
const unaccounted = TOUR_ANCHORS.filter((a) => !placed.has(a) && !PENDING.has(a));
check(
  "every anchor in the enum is either placed or explicitly pending",
  unaccounted.length === 0,
  unaccounted.join(", "),
);
const placedFromEnum = TOUR_ANCHORS.filter((a) => placed.has(a));
check(
  "placed + pending accounts for the whole enum",
  placedFromEnum.length + PENDING.size === TOUR_ANCHORS.length,
  `${placedFromEnum.length} placed + ${PENDING.size} pending ≠ ${TOUR_ANCHORS.length} total`,
);
check(
  "and no anchor is claimed both placed and pending",
  ![...PENDING].some((a) => placed.has(a)),
);

const staleP = [...PENDING].filter((a) => placed.has(a));
check("and nothing lingers on the pending list once it is wired", staleP.length === 0, staleP.join(", "));

const unusedP = [...PENDING].filter((a) => !named.has(a));
check("the pending list holds only anchors a step actually wants", unusedP.length === 0, unusedP.join(", "));

/*
  The mounting gate.

  Anchors were the whole gate when anchors were the whole remaining work. They
  are not any more, and leaving the condition as `PENDING.size === 0` would
  have meant the overlay became mountable the moment the last anchor landed —
  with resume still unable to reconstruct a section, which is the failure that
  looks worst: a member reopens the app, the tutorial restores step eleven onto
  Home, and the spotlight waits forever for a control that only exists inside a
  workout.

  So the gate is the list, every item is measured rather than asserted, and the
  overlay may not be rendered anywhere until all of them are true.
*/
const usesResolver = /resolveTarget\(/.test(overlay) && !/querySelector\(`\[data-tour-id/.test(overlay);
const teaches = (needle: RegExp) => needle.test(intro);

const GATES: Record<string, boolean> = {
  "25+ anchors placed": PENDING.size === 0 && unaccounted.length === 0,
  "visible-instance resolver in use": usesResolver,
  "rehearsal zero-write proven": /test-rehearsal/.test(readFileSync("package.json", "utf8")),
  "rehearsal barrier scoped to the workout": begins === 1 && ends === 1,
  "resume reconstructs route and section": RESUME_RECONSTRUCTS,
  "intelligence-loop copy complete":
    teaches(/whole terrain/i) &&
    teaches(/don't get the final vote/i) &&
    teaches(/what that effort cost/i) &&
    teaches(/Restore creates room/i) &&
    teaches(/useful demand when the terrain can support it/i) &&
    teaches(/map behind the signals/i) &&
    teaches(/Your rhythm with Sakred/i),
};

/*
  An unmet gate is a status, not a failure. Failing the suite for work that is
  honestly outstanding trains people to run it with a flag, and then the one
  assertion that matters below stops being run at all. The gate list is
  reported; only mounting under an unmet gate is an error.
*/
const unmet = Object.entries(GATES).filter(([, met]) => !met).map(([name]) => name);
passed += Object.values(GATES).filter(Boolean).length;

const mountedIn = execSync(
  'grep -rlE "GuidedTourOverlay|<TourHost" client/src --include=*.tsx | grep -v components/tour/ || true',
  { encoding: "utf8" },
).trim();
const allGatesMet = Object.values(GATES).every(Boolean);
check(
  "the walkthrough is mounted nowhere until every gate is met",
  allGatesMet || mountedIn === "",
  `unmet: ${unmet.join(", ")} — mounted in: ${mountedIn || "nothing"}`,
);

const anchored = TOUR.steps.filter((s) => s.anchor);
const unanchored = TOUR.steps.filter((s) => !s.anchor);
check(
  "every step without a target is deliberately explanatory or a choice",
  unanchored.every((s) => s.advance.kind === "continue"),
  unanchored.filter((s) => s.advance.kind !== "continue").map((s) => s.id).join(", "),
);
check(
  "and they are the few they should be",
  unanchored.length <= 4,
  unanchored.map((s) => s.id).join(", "),
);
check(
  "every step has somewhere to go",
  TOUR.steps.every((s) => s.advance.kind !== "continue" || s.title.length > 0),
);
check(
  "the walkthrough covers the whole primary navigation",
  ["nav-home", "nav-restore", "nav-build", "nav-community", "nav-body", "nav-more"].every((a) =>
    TOUR.steps.some((s) => s.anchor === a),
  ),
);
check(
  "and ends on the completion moment rather than trailing off",
  TOUR.steps[TOUR.steps.length - 1].id === "complete",
);

const log = objectives(TOUR, new Set<string>());
check("the objective list is short enough to be orientation", log.length >= 5 && log.length <= 7,
  `${log.length}: ${log.map((o) => o.name).join(", ")}`);
check("nothing is done at the start", log.every((o) => !o.done));
check(
  "an objective completes only when every step under it is done",
  objectives(TOUR, new Set([indexOf("home") !== -1 ? "home" : ""])).every((o) => !o.done),
);
check(
  "and all of them are done at the end",
  objectives(TOUR, new Set(TOUR.steps.map((s) => s.id))).every((o) => o.done),
);

/*
  No XP, no currency, no streak. The list exists so a member can see that this
  ends and roughly when — the commonest reason people abandon a tutorial is not
  knowing how much of it there is.
*/
check(
  "the quest log is orientation and not a scoreboard",
  !/\bXP\b|points|streak|coins/i.test(overlayCode),
);


// ─── Motion: who is allowed to move the page ─────────────────────────────

/*
  Replayed as frames, because the defect these describe is two seconds long and
  invisible in any single one of them. The numbers are from the recorded trace
  of the real transition at 393×852 — tap Restore, "This changes with you" —
  where the document grew from 852 to 1919 over 1.8s and pushed the highlighted
  card 52px out from under its own halo after the tour had already scrolled.
*/
function replayMotion(frames: MotionReading[]): { commands: MotionCommand[]; state: MotionState } {
  let state = initialMotion();
  const commands: MotionCommand[] = [];
  for (const f of frames) {
    const turn = nextMotion(state, f);
    state = turn.state;
    if (turn.command.do !== "nothing") commands.push(turn.command);
  }
  return { commands, state };
}

const frame = (over: Partial<MotionReading> = {}): MotionReading => ({
  scroll: 0,
  targetDoc: null,
  visible: false,
  memberMoved: false,
  ...over,
});

/** Nothing to point at yet — the first 490ms of the trace. */
check(
  "a lesson whose target has not mounted does not move the page",
  replayMotion([frame(), frame(), frame(), frame()]).commands.length === 0,
);

/**
 * The target appears below the fold, the page carries it up, and that is the
 * whole of the tour's intervention — one command across sixteen frames.
 */
{
  const arriving: MotionReading[] = [
    frame({ targetDoc: 974, scroll: 0 }),
    ...[0, 30, 148, 303, 430, 490, 504].map((y) => frame({ targetDoc: 974, scroll: y })),
    ...Array.from({ length: 8 }, () => frame({ targetDoc: 966, scroll: 504, visible: true })),
  ];
  const { commands } = replayMotion(arriving);
  check(
    "an off-screen target is scrolled to once, however many frames pass",
    commands.length === 1 && commands[0].do === "scroll-into-view",
    `got ${JSON.stringify(commands)}`,
  );
}

/**
 * The bug this replaced. A smooth scroll takes ~340ms; the old code asked
 * again every 350ms whether the target was visible yet, and restarted the
 * animation from mid-flight when it wasn't.
 */
{
  const travelling = [0, 2, 5, 11, 19, 30, 47, 71, 101, 148, 194, 235, 272, 303].map((y) =>
    frame({ scroll: y, targetDoc: 974 }),
  );
  const { commands } = replayMotion(travelling);
  check(
    "a scroll in flight is never restarted by a second one",
    commands.filter((c) => c.do === "scroll-into-view").length === 1,
    `got ${commands.length} commands`,
  );
}

/** Landing is observed — the offset going still — never waited out. */
{
  const frames: MotionReading[] = [
    ...[0, 100, 300, 480].map((y) => frame({ scroll: y, targetDoc: 974 })),
    ...Array.from({ length: STILL_FRAMES + 1 }, () => frame({ scroll: 504, targetDoc: 966, visible: true })),
  ];
  const { state } = replayMotion(frames);
  check("a landed scroll settles into a hold", state.phase === "holding", state.phase);
  check("and remembers where the target came to rest", state.anchoredAt === 966, String(state.anchoredAt));
}

/**
 * The drift. Restore's history and memory panels resolve after the lesson has
 * committed, each one pushing the card further down.
 */
{
  const frames: MotionReading[] = [
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    // content arrives above the target
    frame({ scroll: 504, targetDoc: 1014, visible: true }),
  ];
  const { commands } = replayMotion(frames);
  check(
    "content arriving above the target is cancelled, not watched",
    commands.length === 1 && commands[0].do === "hold" && commands[0].by === 48,
    JSON.stringify(commands),
  );
}

/** A hold that clamps at the end of the document is not a member scrolling. */
{
  let state = initialMotion();
  for (const f of [
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: 1014, visible: true }),
  ]) state = nextMotion(state, f).state;
  // asked for 552, the document only allowed 540
  state = nextMotion(state, frame({ scroll: 540, targetDoc: 1014, visible: true })).state;
  check("a clamped hold keeps holding", state.phase === "holding", state.phase);
}

/** The member always wins, and wins for the rest of the lesson. */
{
  const frames: MotionReading[] = [
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 380, targetDoc: 966, visible: true, memberMoved: true }),
    frame({ scroll: 380, targetDoc: 1014, visible: true }),
    frame({ scroll: 380, targetDoc: 1100, visible: false }),
  ];
  const { commands, state } = replayMotion(frames);
  check("a member's scroll releases the hold", state.phase === "released", state.phase);
  check("and nothing scrolls after they have taken over", commands.length === 0, JSON.stringify(commands));
}

/** Momentum after a flick arrives with no further gesture events at all. */
{
  const frames: MotionReading[] = [
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 462, targetDoc: 966, visible: true }),
  ];
  check(
    "an unexplained change in the offset releases it too",
    replayMotion(frames).state.phase === "released",
  );
}

/** A whole section changing underneath is not a shift worth matching. */
{
  const frames: MotionReading[] = [
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: 966 + HOLD_LIMIT + 1, visible: true }),
  ];
  const { commands, state } = replayMotion(frames);
  check("a shift too large to be content settling is let go", state.phase === "released", state.phase);
  check("rather than flung after", commands.length === 0);
}

/**
 * A request that had no effect at all is not repeated.
 *
 * The page never moves, so the scroll did everything it was ever going to do,
 * and asking again would produce the same nothing. The lesson keeps its halo
 * and its own degrade path; it does not stand there pulling a dead lever.
 */
{
  const frames: MotionReading[] = [];
  for (let i = 0; i < 60; i++) frames.push(frame({ scroll: 100, targetDoc: 2000 }));
  const { commands } = replayMotion(frames);
  check(
    "a scroll that moves nothing is asked for once and not again",
    commands.length === 1,
    `got ${commands.length}`,
  );
}

/**
 * Landing short is different, and is the case the retry exists for: the
 * Settings row sits inside a sheet that is still laying out, so the scroll
 * moves the page as far as the layout then allows and the target comes to
 * rest below the fold. Measured at 360×780, 22px under the navigation.
 */
{
  const frames: MotionReading[] = [];
  let y = 0;
  for (let round = 0; round < 8; round++) {
    // the page moves, then goes still, and the target is still not in view
    for (const step of [40, 120, 180]) frames.push(frame({ scroll: (y += step), targetDoc: 2000 }));
    for (let i = 0; i < STILL_FRAMES + 1; i++) frames.push(frame({ scroll: y, targetDoc: 2000 }));
  }
  const { commands, state } = replayMotion(frames);
  check(
    `a scroll that lands short is retried, at most ${MAX_DIRECTED} times`,
    commands.length === MAX_DIRECTED,
    `got ${commands.length}`,
  );
  check("and then the lesson stops trying", state.phase === "released", state.phase);
}

/**
 * The 25ms restart. Recorded on the real transition before this was gated:
 * `scrollIntoView` at 687ms and again at 712ms, because the offset had not
 * changed yet — a smooth scroll does not begin on the frame it is asked for.
 */
{
  const frames: MotionReading[] = [
    frame({ targetDoc: 974, scroll: 0 }),
    // the animation has not started; the offset is unchanged for longer than
    // the stillness threshold
    ...Array.from({ length: STILL_FRAMES + 3 }, () => frame({ targetDoc: 970, scroll: 0 })),
  ];
  const { commands } = replayMotion(frames);
  check(
    "a scroll that has not begun moving yet is not mistaken for one that has landed",
    commands.length === 1,
    `got ${commands.length}`,
  );
}

/** A target that unmounts must not leave a stale anchor behind. */
{
  const frames: MotionReading[] = [
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: 966, visible: true }),
    frame({ scroll: 504, targetDoc: null }),
  ];
  const { state } = replayMotion(frames);
  check("a vanished target returns the lesson to seeking", state.phase === "seeking", state.phase);
  check("with nothing anchored", state.anchoredAt === null);
}


/**
 * Arriving early is as wrong as asking twice.
 *
 * A target passes into the viewport partway through a five-hundred-pixel
 * scroll. Holding from that moment records an anchor against an offset the
 * browser is still changing, and the next frame's movement — the tour's own
 * scroll, still running — reads exactly like the member taking over. Measured
 * on the real transition: released at 870ms with the page still travelling
 * from 6 to 504.
 */
{
  const frames: MotionReading[] = [
    frame({ targetDoc: 966, scroll: 0 }),
    frame({ targetDoc: 966, scroll: 6 }),
    // in view now, but the scroll has not finished
    frame({ targetDoc: 966, scroll: 278, visible: true }),
    frame({ targetDoc: 966, scroll: 421, visible: true }),
    frame({ targetDoc: 966, scroll: 496, visible: true }),
  ];
  const mid = replayMotion(frames);
  check("a target that comes into view mid-scroll is not held yet", mid.state.phase === "directing", mid.state.phase);
  check("so the tour's own scroll is never mistaken for the member's", mid.state.reason === null, String(mid.state.reason));

  const landed = replayMotion([
    ...frames,
    ...Array.from({ length: STILL_FRAMES + 1 }, () => frame({ targetDoc: 966, scroll: 504, visible: true })),
  ]);
  check("and it is held once the page stops", landed.state.phase === "holding", landed.state.phase);
}

/**
 * A smooth scroll does not stop. It decelerates.
 *
 * The tail of one moves about a pixel a frame for its last hundred
 * milliseconds. Compared frame to frame that reads as "unchanged" — within
 * EPSILON — three times running, so the machine called it landed with travel
 * still to come, and the travel that came was then the only thing that could
 * have moved the page. Released as `momentum`, with nobody touching anything.
 *
 * Measured on the real Restore transition at 393x852: held at 610, released
 * at 611, 898ms in, and the card then drifted 52px out from under its own
 * halo with the tour gone quiet. This is that sequence.
 */
{
  const creep = [606, 607, 608, 609, 610].map((scroll) =>
    frame({ targetDoc: 1073, scroll, visible: true }),
  );
  const arrive = [
    frame({ targetDoc: 1073, scroll: 0 }),
    frame({ targetDoc: 1073, scroll: 66 }),
    ...creep,
  ];
  const mid = replayMotion(arrive);
  check(
    "a decelerating scroll is not mistaken for a stopped one",
    mid.state.phase === "directing",
    `${mid.state.phase}:${mid.state.reason}`,
  );

  /* And the pixel it still had to travel is not the member. */
  const tail = replayMotion([...arrive, frame({ targetDoc: 1073, scroll: 611, visible: true })]);
  check(
    "so its last pixel is not read as the member taking over",
    tail.state.reason !== "momentum",
    `${tail.state.phase}:${tail.state.reason}`,
  );

  /* Once it genuinely stops, it holds — and then absorbs the content that
     arrives above it, which is the whole point of holding at all. */
  const stopped = replayMotion([
    ...arrive,
    ...Array.from({ length: STILL_FRAMES + 1 }, () =>
      frame({ targetDoc: 1073, scroll: 611, visible: true }),
    ),
  ]);
  check("and a scroll that has stopped is held", stopped.state.phase === "holding", stopped.state.phase);

  const shifted = replayMotion([
    ...arrive,
    ...Array.from({ length: STILL_FRAMES + 1 }, () =>
      frame({ targetDoc: 1073, scroll: 611, visible: true }),
    ),
    frame({ targetDoc: 1121, scroll: 611, visible: true }),
  ]);
  const answer = shifted.commands.at(-1);
  check(
    "and the content that arrives above it is answered, not watched",
    answer?.do === "hold" && answer.by === 48,
    JSON.stringify(shifted.commands),
  );
}

/**
 * The member still wins, and a real gesture must still end the hold.
 *
 * Measuring stillness across the window rather than frame to frame is what
 * fixes the deceleration above. It must not also make the machine deaf: a
 * page that is held and then moved by a hand is exactly the reading the
 * `momentum` branch exists for.
 */
{
  const settled = [
    frame({ targetDoc: 1073, scroll: 0 }),
    frame({ targetDoc: 1073, scroll: 611, visible: true }),
    ...Array.from({ length: STILL_FRAMES + 1 }, () =>
      frame({ targetDoc: 1073, scroll: 611, visible: true }),
    ),
  ];
  const flicked = replayMotion([...settled, frame({ targetDoc: 1000, scroll: 684, visible: true })]);
  check(
    "a page that moves under a settled hold still releases",
    flicked.state.phase === "released" && flicked.state.reason === "momentum",
    `${flicked.state.phase}:${flicked.state.reason}`,
  );

  const touched = replayMotion([
    ...settled,
    frame({ targetDoc: 1073, scroll: 611, visible: true, memberMoved: true }),
  ]);
  check(
    "and a gesture releases it whatever the offset did",
    touched.state.phase === "released" && touched.state.reason === "member",
    `${touched.state.phase}:${touched.state.reason}`,
  );
}

// ─── Motion: which side the panel takes ──────────────────────────────────

check(
  "the panel sits below the target when there is room",
  settleSide(null, { above: 100, below: 400, need: 300 }) === false,
);
check(
  "and moves above it when there is not",
  settleSide(null, { above: 500, below: 100, need: 300 }) === true,
);
check(
  "with neither side roomy enough, the roomier one wins",
  settleSide(null, { above: 200, below: 120, need: 300 }) === true,
);
/*
  The flip this prevents: during one directed scroll the Restore card travelled
  from 974 to 462, and a side recomputed from that rect crosses the threshold
  mid-flight and swaps ends of the screen while the page is still moving.
*/
check(
  "a decided side is kept while it still fits",
  settleSide(true, { above: 320, below: 500, need: 300 }) === true,
);
check(
  "and only given up when it genuinely stops fitting",
  settleSide(true, { above: 120, below: 500, need: 300 }) === false,
);
check(
  "a side that fits nowhere is not swapped for another that fits nowhere",
  settleSide(false, { above: 100, below: 100, need: 300 }) === false,
);

// ─── Storage ─────────────────────────────────────────────────────────────

/*
  Every failure mode here starts the tour rather than throwing. Being offered a
  walkthrough you have already seen is an annoyance; throwing during boot on the
  first screen after signup is the product not opening.
*/
check("a well-formed record is recognised", isProgress(finished));
check("a hand-edited one is not", !isProgress({ tourId: TOUR.id, version: 1 }));
check("nor is a completed list of the wrong shape",
  !isProgress({ ...finished, completed: [1, 2] }));
check("nor null", !isProgress(null));

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ guided tour\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
const placedCount = TOUR_ANCHORS.filter((a) => placed.has(a)).length;
console.log(
  `✓ ${passed} guided tour assertions passed ` +
    `(${TOUR.steps.length} steps, ${log.length} objectives, ` +
    `${placedCount}/${TOUR_ANCHORS.length} anchors placed)`,
);
if (unmet.length) {
  console.log(`  mounting gate held — outstanding: ${unmet.join(", ")}`);
}
