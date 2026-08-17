/**
 * Coming back an hour later and finding the lesson where you left it.
 *
 * ── The failure ───────────────────────────────────────────────────────────
 *
 * A phone call during the RPE lesson. The member returns, the app cold-starts
 * onto Home, the tour restores step fifteen, and the spotlight waits for an RPE
 * control that only exists inside a workout they are no longer in. Six seconds
 * later it degrades to a panel explaining RPE over a screen with no sets on it.
 *
 * Nothing errors. It is simply nonsense — and interruption on a phone is not an
 * edge case, it is Tuesday.
 *
 * ── The thing being proven ────────────────────────────────────────────────
 *
 * That the state a step needs is reconstructed from the tutorial script rather
 * than restored from something saved. The distinction is the whole design: the
 * tempting fix is to persist the open session, the movement and the logged set,
 * and that means writing rehearsal rows that outlive the tutorial. Invented
 * sets surviving a restart are worse than a tutorial that resumes badly.
 */

import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";
import { restoreSpecFor, recoverStep, seedRehearsal } from "../client/src/lib/tour/restore.js";
import { REHEARSAL_SESSION_ID } from "../client/src/lib/tour/rehearsal.js";
import { complete, emptyProgress, pause } from "../client/src/lib/tour/engine.js";
import type { GuidedTour, TourProgress } from "../client/src/lib/tour/types.js";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const TOUR = SAKRED_INTRO;
const NOW = "2026-08-17T09:00:00.000Z";
const step = (id: string) => TOUR.steps.find((s) => s.id === id)!;

// ─── Every step knows where it lives ─────────────────────────────────────

/*
  The denominator is the tour, not a list somebody maintains. A step added next
  year that resumes onto the wrong screen fails here without anybody having
  remembered to add it.
*/
const specs = TOUR.steps.map((s) => ({ id: s.id, spec: restoreSpecFor(s) }));

check("every step can say what screen it belongs on", specs.every(({ spec }) => !!spec.route));

/*
  A step that points at the navigation bar deliberately names no section — the
  bar is on every screen, and "tap Build" is answerable from anywhere. What must
  name one is every step whose target lives *inside* a section, because that is
  the step that resumes onto the wrong screen and waits forever.
*/
const insideASection = TOUR.steps.filter(
  (s) => s.anchor && !s.anchor.startsWith("nav-") && s.anchor !== "more-sheet" && s.anchor !== "role-coach",
);
const homeless = insideASection.filter((s) => restoreSpecFor(s).section === null);
check(
  "every step whose target lives inside a screen names that screen",
  homeless.length === 0,
  homeless.map((s) => s.id).join(", "),
);
check(
  "and the nav steps deliberately name none, because the bar is everywhere",
  TOUR.steps.filter((s) => s.anchor?.startsWith("nav-")).every((s) => restoreSpecFor(s).section === null),
);

/*
  The workout steps are the interesting case. They carry no `section` of their
  own because the sheet covers whatever is underneath — but resuming onto Home
  with a workout sheet over it is not a state the app ever produces naturally,
  so they have to resolve to Build.
*/
for (const id of ["add-exercise", "set-row", "rpe", "set-style", "last-time", "close-workout"]) {
  check(`${id} resumes into Build, not onto whatever was last open`, restoreSpecFor(step(id)).section === "build");
}

check(
  "a More-sheet step reopens the sheet",
  restoreSpecFor(step("settings")).sheet === "more",
);
check(
  "and a step that isn't in a sheet doesn't open one",
  restoreSpecFor(step("terrain")).sheet === null,
);
check(
  "the atmosphere finale resumes into Settings",
  restoreSpecFor(step("atmosphere")).section === "settings",
);

// ─── Repeated targets name their instance ────────────────────────────────

/*
  Without this, resuming at RPE resolves "the first RPE control" — which is the
  ambiguity the target resolver refuses outright. A resumed step that cannot
  name its instance would degrade instead of teaching.
*/
check("the set-row step names which row", !!restoreSpecFor(step("set-row")).instance);
check("the RPE step names which set's control", !!restoreSpecFor(step("rpe")).instance);
check("and so does set style", !!restoreSpecFor(step("set-style")).instance);
check("and LAST TIME names its movement", !!restoreSpecFor(step("last-time")).instance);
check(
  "a step with only one possible target names no instance",
  restoreSpecFor(step("home")).instance === null,
);

// ─── The rehearsal is rebuilt, never restored ────────────────────────────

const atStart = restoreSpecFor(step("start-session")).rehearsal!;
check("resuming at Start session gives an empty rehearsal", atStart.movements === 0 && atStart.sets === 0);

const atAdd = restoreSpecFor(step("add-exercise")).rehearsal!;
check("resuming at Add exercise still has nothing added", atAdd.movements === 0);

const atRow = restoreSpecFor(step("set-row")).rehearsal!;
check("resuming at the set row has a movement to put it on", atRow.movements === 1 && atRow.sets === 0);

const atRpe = restoreSpecFor(step("rpe")).rehearsal!;
check("resuming at RPE has a completed set for effort to attach to", atRpe.movements === 1 && atRpe.sets === 1);

const atLast = restoreSpecFor(step("last-time")).rehearsal!;
check("resuming at LAST TIME has the example history", atLast.lastTime === true);

/*
  The state accumulates exactly as it would if the member had walked there,
  which is what makes a resumed tutorial indistinguishable from an
  uninterrupted one. Asserted as monotonic rather than step by step, so a
  reordering fails rather than passing on stale numbers.
*/
const ordered = ["start-session", "add-exercise", "set-row", "rpe", "set-style", "last-time", "close-workout"]
  .map((id) => restoreSpecFor(step(id)).rehearsal!);
check(
  "rehearsal state only ever accumulates through the lesson",
  ordered.every((s, i) => i === 0 || (s.movements >= ordered[i - 1].movements && s.sets >= ordered[i - 1].sets)),
  ordered.map((s) => `${s.movements}/${s.sets}`).join(" → "),
);
check(
  "every one of the seven workout steps has a snapshot",
  ordered.length === 7 && ordered.every(Boolean),
);
check(
  "and no step outside the rehearsal interval has one",
  ["welcome", "home", "terrain", "body", "room", "atmosphere", "complete"].every(
    (id) => restoreSpecFor(step(id)).rehearsal === null,
  ),
);

// ─── Seeding produces the world, not a description of it ─────────────────

const seeded = seedRehearsal(atRpe, NOW);
check("the seeded store is the rehearsal session", seeded.sessionId === REHEARSAL_SESSION_ID);
check("with the movement present", seeded.exercises.length === 1);
check("and the set on it", seeded.exercises[0].sets.length === 1);
check(
  "ids are deterministic, so the step can name an instance without saving one",
  seeded.exercises[0].id === "rehearsal-movement-1" && seeded.exercises[0].sets[0].id === "rehearsal-set-1",
);

/*
  A reconstructed set has no RPE. Filling one in would contradict the lesson the
  member is one tap away from being given — and it is the same distinction the
  real system depends on: unlogged effort is unknown, not easy.
*/
check("a reconstructed set has no invented effort", seeded.exercises[0].sets[0].rpe === null);
check(
  "and the movement is not given a name the member never chose",
  seeded.exercises[0].name === "Your movement",
);

check(
  "seeding twice from the same snapshot gives the same world",
  JSON.stringify(seedRehearsal(atRpe, NOW)) === JSON.stringify(seedRehearsal(atRpe, NOW)),
);
check(
  "and seeding an empty snapshot gives an empty one",
  seedRehearsal(atStart, NOW).exercises.length === 0,
);

/*
  The load-bearing claim. Nothing about the rehearsal is written down, so an app
  kill mid-workout cannot leave anything behind — reconstruction reads the
  script, not a saved session.
*/
const restoreSrc = (await import("node:fs")).readFileSync("client/src/lib/tour/restore.ts", "utf8");
check(
  "resume reconstructs and never persists",
  !/localStorage|sessionStorage|Preferences|writeProgress/.test(restoreSrc),
);

// ─── A tour that changed underneath somebody ─────────────────────────────

let held = emptyProgress(TOUR);
for (let i = 0; i < 5; i++) held = complete(held, TOUR, i, NOW);
held = pause(held, TOUR, 5);

check("an unchanged tour resumes exactly", recoverStep(held, TOUR).kind === "exact");

/*
  Steps get renamed, split and removed. The two obvious outcomes are both
  wrong: trapping somebody on a step that cannot resolve, and quietly marking
  the walkthrough complete so they are never taught what they had not reached.
*/
const edited: GuidedTour = {
  ...TOUR,
  version: 2,
  steps: TOUR.steps.filter((s) => s.id !== held.stepId),
};
const recovered = recoverStep(held, edited);
check("a deleted step does not trap them", recovered.kind !== "exact");
check("nor is it quietly treated as finished", recovered.kind === "checkpoint",
  recovered.kind === "restart" ? recovered.reason : "");
check(
  "they resume at the start of the lesson they were in, repeating rather than losing one",
  recovered.kind === "checkpoint" && edited.steps[recovered.index].objective !== undefined,
);
check(
  "and the reason is reported rather than left to be guessed at",
  recovered.kind === "checkpoint" && recovered.reason.includes(held.stepId ?? ""),
);

const stranger: TourProgress = { ...held, stepId: "a-step-from-another-product", completed: TOUR.steps.map((s) => s.id) };
const restart = recoverStep(stranger, TOUR);
check("an unrecognisable saved step restarts rather than completing", restart.kind === "restart");
check("with a reason", restart.kind === "restart" && restart.reason.length > 0);

check("no saved step at all is a restart, not a crash", recoverStep(null, TOUR).kind === "restart");

// ─── The checklist is objectives, not steps ──────────────────────────────

/*
  `Learning Sakred · 3 / 7` is the human mental model. Adding a technical step
  to a lesson must not turn it into 3 / 27 — objectives are named groups and
  several steps share one.
*/
const objectiveNames = new Set(TOUR.steps.map((s) => s.objective).filter(Boolean));
check("objectives are far fewer than steps", objectiveNames.size < TOUR.steps.length / 2,
  `${objectiveNames.size} objectives, ${TOUR.steps.length} steps`);
check("and several steps share one", TOUR.steps.filter((s) => s.objective === "Learn Build").length > 3);

if (failures.length) {
  console.error("\n✗ resume\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} resume assertions passed (${TOUR.steps.length} steps reconstructable)`);
