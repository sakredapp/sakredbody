/**
 * The help portal tells the truth about the walkthrough.
 *
 * ── What is worth testing here ────────────────────────────────────────────
 *
 * Not the layout. The two things that can be wrong in a way a member would
 * notice and could not explain:
 *
 *   · being told they have completed a walkthrough they paused, or offered a
 *     resume for one that is finished;
 *   · an index of the app that has quietly stopped matching the app, because
 *     somebody added a lesson and not a row.
 *
 * The second is prevented by construction — every title is read from the tour
 * — and asserted here so that a future "let's make the copy nicer" pass cannot
 * turn the index into a second source of truth without failing.
 *
 * Run: tsx script/test-help.ts
 */

import { readFileSync } from "node:fs";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";
import { chapters, stateSentence, walkthroughState } from "../client/src/lib/tour/help.js";
import { REQUIRED_TOUR_VERSION } from "../client/src/lib/tour/rollout.js";
import type { TourProgress } from "../client/src/lib/tour/types.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const progress = (over: Partial<TourProgress> = {}): TourProgress => ({
  tourId: SAKRED_INTRO.id,
  version: SAKRED_INTRO.version,
  stepId: null,
  completed: [],
  completedAt: null,
  ...over,
});

// ─── 1. What state the member is actually in ──────────────────────────────

check("no record at all is a walkthrough nobody has opened",
  walkthroughState(null, SAKRED_INTRO).kind === "new");

{
  const mid = SAKRED_INTRO.steps.find((s) => s.objective === "Learn Build")!;
  const state = walkthroughState(
    progress({ stepId: mid.id, completed: SAKRED_INTRO.steps.slice(0, 4).map((s) => s.id) }),
    SAKRED_INTRO,
  );
  check("a stored step is a paused walkthrough", state.kind === "paused");
  check("and it knows which part they were in",
    state.kind === "paused" && state.chapter === "Learn Build", JSON.stringify(state));
  check("and how far they got", state.kind === "paused" && state.completedCount === 4);
}

{
  const done = walkthroughState(
    progress({ completedAt: "2026-08-19T09:00:00.000Z", completed: SAKRED_INTRO.steps.map((s) => s.id) }),
    SAKRED_INTRO,
  );
  check("a finished walkthrough is finished", done.kind === "complete");
  check("and offers no resume", done.kind !== "paused");
}

{
  /*
    The case that would be a lie: an old record, kept, while the app intends to
    teach the walkthrough again. "You've completed this" and "we are about to
    require this of you" cannot both be on the same screen.
  */
  const old = walkthroughState(
    progress({ version: REQUIRED_TOUR_VERSION - 1, completedAt: "2026-01-01T00:00:00.000Z" }),
    SAKRED_INTRO,
  );
  check("a record from before the required version is not called complete",
    old.kind === "superseded", old.kind);
  check("and the sentence says the walkthrough has changed",
    /changed/.test(stateSentence(old, SAKRED_INTRO)));
}

for (const state of [
  walkthroughState(null, SAKRED_INTRO),
  walkthroughState(progress({ stepId: SAKRED_INTRO.steps[3].id }), SAKRED_INTRO),
  walkthroughState(progress({ completedAt: "x", completed: [] }), SAKRED_INTRO),
]) {
  check(`every state has something to say (${state.kind})`,
    stateSentence(state, SAKRED_INTRO).trim().length > 10);
}

// ─── 2. The index is the walkthrough, not a copy of it ────────────────────

{
  const list = chapters(SAKRED_INTRO, new Set());
  check("there is at least one chapter", list.length > 0);

  const listed = list.flatMap((c) => c.lessons.map((l) => l.id));
  const expected = SAKRED_INTRO.steps.filter((s) => s.objective).map((s) => s.id);
  check("every lesson with an objective is listed exactly once",
    listed.length === expected.length && expected.every((id) => listed.includes(id)),
    `${listed.length} listed, ${expected.length} expected`);

  check("no lesson is listed twice", new Set(listed).size === listed.length);

  check("every chapter can be replayed from a real lesson",
    list.every((c) => SAKRED_INTRO.steps.some((s) => s.id === c.fromStepId)));

  check("and from its own first lesson",
    list.every((c) => c.fromStepId === c.lessons[0].id));

  const titles = new Set(SAKRED_INTRO.steps.map((s) => s.title));
  check("every listed title is a title the walkthrough actually uses",
    list.every((c) => c.lessons.every((l) => titles.has(l.title))));

  const finished = chapters(SAKRED_INTRO, new Set(SAKRED_INTRO.steps.map((s) => s.id)));
  check("a chapter whose lessons are all done says so", finished.every((c) => c.done));
  check("and none of them does before that", list.every((c) => !c.done));
}

// ─── 3. One destination, three doors ──────────────────────────────────────

{
  const nav = code("client/src/components/MemberNav.tsx");
  const settings = code("client/src/components/SettingsTab.tsx");
  const library = code("client/src/components/LibraryTab.tsx");
  const dashboard = code("client/src/pages/MemberDashboard.tsx");

  check("More carries a row for it",
    /id: "help"[\s\S]{0,160}section: "help"/.test(nav));
  check("Settings links to it rather than reimplementing it",
    /onOpenHelp/.test(settings) && !/HelpPortal/.test(settings));
  check("and so does the Library",
    /onOpenHelp/.test(library) && !/HelpPortal/.test(library));
  check("both doors are wired to the same section",
    (dashboard.match(/onOpenHelp=\{\(\) => setSection\("help"\)\}/g) ?? []).length === 2);
  check("and there is exactly one portal",
    (dashboard.match(/<HelpPortal/g) ?? []).length === 1);
}

// ─── 4. Replaying is not resetting ────────────────────────────────────────

{
  const portal = code("client/src/components/HelpPortal.tsx");
  const hook = code("client/src/hooks/use-guided-tour.ts");

  /*
    `clearProgress` exists for QA and puts a completed walkthrough back to
    nothing. A member pressing Replay must never reach it — reviewing the app
    is not un-learning it, and on a required-version rollout that would also
    put them back in the queue to be taught it again.
  */
  check("the portal never clears the member's record", !/clearProgress/.test(portal));
  check("nor touches intake or any other stored state",
    !/intake/i.test(portal) && !/localStorage/.test(portal));
  check("a replay writes no progress at all",
    /if \(!forced\) writeProgress\(updated\)/.test(hook) &&
      /if \(!forced\) writeProgress\(held\)/.test(hook));
  check("and starts where it was asked to",
    /forced && replayFrom \? tour\.steps\.findIndex/.test(hook));
  check("the portal offers a resume only when there is one to offer",
    /state\.kind === "paused" \? state : null/.test(portal) && /\{paused && \(/.test(portal));
}

if (failures.length) {
  console.error("\n✗ help portal\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} help portal assertions`);
