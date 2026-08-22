/**
 * Choosing the control the member can actually see.
 *
 * ── The bug this exists to make impossible ────────────────────────────────
 *
 * `querySelector` returns the first match in document order, and a hidden
 * element still has a bounding rect — `{0,0,0,0}`. So a control rendered twice
 * for two layouts, with the hidden one first, produces a spotlight drawn as a
 * point in the top-left corner while the member looks at a button in the middle
 * of the screen. Nothing errors. It simply looks broken.
 *
 * The repeated-control case is worse than that, because it is not obviously
 * wrong: every set in a workout has its own RPE control, and picking the first
 * one puts the spotlight on set two while the panel explains set one. The
 * member types into the wrong row and concludes the app is confused.
 *
 * These are all fabricated descriptions rather than a real DOM, which is the
 * point — the cases below are exactly the ones nobody reproduces by hand.
 */

import { chooseCandidate, type Candidate } from "../client/src/lib/tour/resolveTarget.js";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** A perfectly ordinary, visible, usable control. */
function el(over: Partial<Candidate> = {}): Candidate {
  return {
    instance: null,
    connected: true,
    rendered: true,
    opacity: 1,
    width: 120,
    height: 44,
    interactive: true,
    inViewport: true,
    fullyVisible: true,
    visibleArea: 1,
    ...over,
  };
}

/** How a `display: none` twin actually looks when measured. */
const hiddenTwin = el({ rendered: false, width: 0, height: 0 });

const TAP = { anchor: "nav-build" as const, needsInteraction: true };
const LOOK = { anchor: "terrain-now" as const, needsInteraction: false };

// ─── Responsive duplicates ───────────────────────────────────────────────

/*
  Both orders, because which one comes first is an accident of markup and the
  resolver must not care.
*/
const desktopFirst = chooseCandidate([hiddenTwin, el()], TAP);
check("a hidden desktop twin listed first is skipped", desktopFirst.ok && desktopFirst.index === 1);

const mobileFirst = chooseCandidate([el(), hiddenTwin], TAP);
check("and a hidden mobile twin listed first is too", mobileFirst.ok && mobileFirst.index === 0);

check(
  "zero geometry alone is enough to reject a candidate",
  (() => {
    const r = chooseCandidate([el({ width: 0, height: 0 }), el()], TAP);
    return r.ok && r.index === 1;
  })(),
);
check(
  "so is being fully transparent, which cannot be looked at",
  (() => {
    const r = chooseCandidate([el({ opacity: 0 }), el()], TAP);
    return r.ok && r.index === 1;
  })(),
);
check(
  "and so is being detached from the document",
  (() => {
    const r = chooseCandidate([el({ connected: false }), el()], TAP);
    return r.ok && r.index === 1;
  })(),
);

// ─── Repeated controls ───────────────────────────────────────────────────

/*
  Four set rows on screen at once, each with its own RPE control. "The first
  one" is not what the tutorial means, and there is no heuristic that recovers
  the answer — only the step knows which set it is talking about.
*/
const sets = [
  el({ instance: "rehearsal-set-1" }),
  el({ instance: "rehearsal-set-2" }),
  el({ instance: "rehearsal-set-3" }),
];

const guessing = chooseCandidate(sets, { anchor: "workout-rpe", needsInteraction: true });
check(
  "several distinct controls with no instance named is a failure, not a guess",
  !guessing.ok && guessing.reason === "ambiguous",
  guessing.ok ? "picked one" : guessing.reason,
);

const named = chooseCandidate(sets, {
  anchor: "workout-rpe",
  needsInteraction: true,
  instance: "rehearsal-set-2",
});
check("naming the instance picks exactly that one", named.ok && named.index === 1);

const gone = chooseCandidate(sets, {
  anchor: "workout-rpe",
  needsInteraction: true,
  instance: "rehearsal-set-9",
});
check(
  "and a named instance that has gone is reported rather than substituted",
  !gone.ok && gone.reason === "instance-gone",
);

/*
  The substitution is the dangerous outcome. If the named set has been deleted,
  spotlighting a different set's control while the panel talks about the first
  is worse than admitting the target is gone — the member edits the wrong row.
*/
check(
  "never falling back to a different instance",
  (() => {
    const r = chooseCandidate(sets, {
      anchor: "workout-rpe",
      needsInteraction: true,
      instance: "rehearsal-set-9",
    });
    return !r.ok;
  })(),
);

/*
  Same instance appearing twice is the responsive case again, one layer down:
  the same logical set rendered for two layouts. Either will do, so prefer the
  one already on screen.
*/
const twinnedRow = chooseCandidate(
  [
    el({ instance: "rehearsal-set-1", inViewport: false, fullyVisible: false, visibleArea: 0 }),
    el({ instance: "rehearsal-set-1", inViewport: true }),
  ],
  { anchor: "workout-rpe", needsInteraction: true, instance: "rehearsal-set-1" },
);
check("one logical control rendered twice prefers the visible copy", twinnedRow.ok && twinnedRow.index === 1);

// ─── Sheets, disabled controls, offscreen ────────────────────────────────

/*
  A closed Radix sheet keeps its rows mounted. Without rejecting them, the More
  step resolves a row inside a sheet nobody has opened, and the spotlight is
  drawn over a collapsed element behind the page.
*/
const closedSheet = chooseCandidate([el({ rendered: false })], {
  anchor: "nav-more-settings",
  needsInteraction: true,
});
check("a row inside a closed sheet is not a target", !closedSheet.ok && closedSheet.reason === "hidden");

const disabled = chooseCandidate([el({ interactive: false })], TAP);
check(
  "a visible but disabled control fails when the step needs a tap",
  !disabled.ok && disabled.reason === "disabled",
);
check(
  "though it is a perfectly good target for a step that only explains it",
  chooseCandidate([el({ interactive: false })], LOOK).ok,
);

/*
  The named instance wins over the interaction filter, so a disabled named
  control reports "disabled" rather than quietly resolving to a usable sibling.
*/
const namedDisabled = chooseCandidate(
  [el({ instance: "rehearsal-set-1", interactive: false }), el({ instance: "rehearsal-set-2" })],
  { anchor: "workout-rpe", needsInteraction: true, instance: "rehearsal-set-1" },
);
check(
  "a disabled named instance says so rather than picking its neighbour",
  !namedDisabled.ok && namedDisabled.reason === "disabled",
);

const offscreen = chooseCandidate([el({ inViewport: false, fullyVisible: false, visibleArea: 0 })], LOOK);
check("an offscreen target still resolves", offscreen.ok);
check("and asks to be scrolled to", offscreen.ok && offscreen.scrollNeeded === true);
check(
  "one already on screen does not",
  (() => {
    const r = chooseCandidate([el()], LOOK);
    return r.ok && r.scrollNeeded === false;
  })(),
);
check(
  "given a choice, the one on screen is preferred",
  (() => {
    const r = chooseCandidate(
      [el({ inViewport: false, fullyVisible: false, visibleArea: 0 }), el({ inViewport: true })],
      LOOK,
    );
    return r.ok && r.index === 1 && r.scrollNeeded === false;
  })(),
);

/*
  The case the distinction exists for: a row whose lower half is under the
  bottom navigation. It overlaps the viewport, so the old rule called it
  settled and the walkthrough pointed at a control the member could see the
  top of and could not press.
*/
const halfUnderTheNav = chooseCandidate([el({ inViewport: true, fullyVisible: false })], LOOK);
check("a half-covered target still resolves", halfUnderTheNav.ok);
check("and asks to be scrolled to anyway",
  halfUnderTheNav.ok && halfUnderTheNav.scrollNeeded === true);
check(
  "given a choice, fully visible beats merely overlapping",
  (() => {
    const r = chooseCandidate([el({ fullyVisible: false }), el()], LOOK);
    return r.ok && r.index === 1 && r.scrollNeeded === false;
  })(),
);

/*
  When a step invites a free choice, point at the one they can see most of.
  Eleven Restore cards, and the first one overlapping the viewport was a 26px
  sliver at the bottom edge that the dialogue panel then covered.
*/
{
  const ANY = { anchor: "restore-practice" as const, needsInteraction: true, anyInstance: true };
  const r = chooseCandidate(
    [
      el({ instance: "a", fullyVisible: false, visibleArea: 0.08 }),
      el({ instance: "b", fullyVisible: false, visibleArea: 0.71 }),
      el({ instance: "c", inViewport: false, fullyVisible: false, visibleArea: 0 }),
    ],
    ANY,
  );
  check("a free choice lands on the most visible instance", r.ok && r.index === 1);
  const whole = chooseCandidate(
    [el({ instance: "a", fullyVisible: false, visibleArea: 0.9 }), el({ instance: "b" })],
    ANY,
  );
  check("and prefers one that is entirely on screen over one that is nearly",
    whole.ok && whole.index === 1);
}

// ─── Nothing there ───────────────────────────────────────────────────────

const absent = chooseCandidate([], TAP);
check("nothing carrying the anchor is 'absent', not null", !absent.ok && absent.reason === "absent");
check(
  "every failure carries a typed reason the overlay can act on",
  [absent, guessing, gone, disabled, closedSheet].every((r) => !r.ok && typeof r.reason === "string"),
);
check(
  "and says how many candidates it was choosing between",
  !guessing.ok && guessing.candidates === 3,
);

// ─── Result ──────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✗ target resolver\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} target resolver assertions passed`);
