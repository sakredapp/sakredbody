/**
 * A guided walkthrough, described as data.
 *
 * ── Why this is a state machine and not a sequence of components ──────────
 *
 * The obvious build is a component per step that renders a card and a Next
 * button. It falls apart at the first real requirement: the member has to
 * advance by doing the thing being taught, which means a step ends when the
 * *application* reaches a state, not when a button in the tutorial is pressed.
 * Steps therefore have to observe the app, wait, and sometimes give up — and a
 * component that owns its own advancement cannot be paused, resumed at step 9
 * three days later, replayed without altering a completion record, or tested
 * without a browser.
 *
 * So a tour is data, the engine is pure, and the only thing the UI does is
 * report what it can see and render what it is told.
 *
 * ── The anchor rule ───────────────────────────────────────────────────────
 *
 * Targets are named, never selected. `document.querySelector(".flex >
 * div:nth-child(3)")` is a tutorial that breaks the next time somebody adds a
 * wrapper — silently, in production, on the first screen a new member sees.
 * Every target here is a `data-tour-id`, and the test suite asserts that each
 * one a step names actually exists in the source.
 */

/**
 * Canonical target names.
 *
 * ── Why an array and not a union ──────────────────────────────────────────
 *
 * It was a union, which gave the type safety and nothing else — and a type
 * does not exist at runtime, so no test could count it. The denominator was
 * therefore prose, and prose is how a report ends up saying "13 of 15" while
 * listing fifteen things. Two unimplemented targets can hide behind an
 * arithmetic slip in exactly that way.
 *
 * As a `const` array it is the same type (derived below, so a typo is still a
 * type error) *and* a value the suite can enumerate. Total, placed and pending
 * are now measured rather than asserted, and they have to add up.
 */
export const TOUR_ANCHORS = [
  "nav-home",
  "nav-restore",
  "nav-build",
  "nav-community",
  "nav-body",
  "nav-more",
  "nav-more-settings",
  "nav-more-wins",
  "terrain-now",
  "health-context",
  "restore-practice",
  "build-today",
  "build-start-session",
  "workout-add-exercise",
  "workout-set-row",
  "workout-rpe",
  "workout-set-style",
  "workout-last-time",
  "workout-close",
  "body-map",
  "body-territory",
  "room-feed",
  "more-sheet",
  "appearance-control",
  "atmosphere-choice",
  "role-coach",
] as const;

export type TourAnchor = (typeof TOUR_ANCHORS)[number];

/**
 * How a step ends.
 *
 * `section` is the workhorse. The member is told to open Build and the step
 * ends when the app is showing Build — however they got there. Requiring the
 * specific tap would be stricter and worse: a member who opens Build from a
 * card on Home has done exactly what was asked and would be left staring at a
 * spotlight on a tab they are no longer looking at.
 */
export type Advance =
  /** Explanatory. The panel offers the only way forward. */
  | { kind: "continue" }
  /** The spotlit target is activated. For controls that open something. */
  | { kind: "tap" }
  /** The app is showing a given section. */
  | { kind: "section"; section: string }
  /** Something has appeared — a sheet opened, an exercise chosen. */
  | { kind: "present"; anchor: TourAnchor }
  /** Something has gone — the demo workout closed. */
  | { kind: "absent"; anchor: TourAnchor };

export type TourStep = {
  id: string;
  /**
   * Where the step expects the app to be. The engine will not spotlight a
   * target on a screen the member has navigated away from; it waits, and the
   * panel says what to reopen.
   */
  section?: string;
  /** What to cut out of the scrim. Absent means a full-width panel and no hole. */
  anchor?: TourAnchor;
  title: string;
  body: string;
  advance: Advance;
  /**
   * A step that may legitimately have nothing to point at.
   *
   * LAST TIME needs a previous session; a Restore practice needs one to be
   * offered today. Rather than fabricate either, these are skipped when their
   * anchor does not appear — which is why the copy for them must not refer to
   * a step the member might never see.
   */
  optional?: boolean;
  /** Named for the quest log, which lists phases rather than every step. */
  objective?: string;
  /**
   * Where the rehearsal's write barrier opens and closes.
   *
   * Scoped to these two steps rather than to the whole walkthrough on purpose.
   * The barrier intercepts the global `fetch`, and holding it up for the full
   * five minutes would mean the rest of the tour — Home, Restore, Body, Room —
   * runs with the application's networking rerouted through a tutorial. The
   * guarantee we want is "the tutorial workout writes nothing", not "the app
   * stops working while somebody is being taught".
   */
  rehearsal?: "begin" | "end";
  /**
   * A step that asks for a decision rather than pointing at a control.
   *
   * The panel renders the chooser itself, so there is nothing on the page to
   * cut a hole around — which is right: the member is not being shown where
   * something lives, they are choosing, and the answer changes the whole screen
   * underneath them.
   */
  choice?: "appearance";
};

export type GuidedTour = {
  id: string;
  /**
   * Bumped only when the existing steps stop being true.
   *
   * A member who completed v1 is not dragged through v2 — see `resumeAt`. New
   * features get their own short tour instead, which is the whole reason this
   * is versioned rather than a boolean.
   */
  version: number;
  steps: TourStep[];
};

/** What the engine is allowed to know about the running application. */
export type TourWorld = {
  /** The section the app is showing, or null if it isn't showing one yet. */
  section: string | null;
  /** Anchors currently mounted and measurable. */
  present: ReadonlySet<TourAnchor>;
  /** How long the current step has been waiting for its anchor, in ms. */
  waitedMs: number;
};

export type TourStatus = "idle" | "running" | "paused" | "complete";

/**
 * What is persisted.
 *
 * `completed` is a list rather than a count because steps can be skipped — an
 * optional step that never had anything to point at is not "not yet done", and
 * a resume that treated an index as a count would replay the wrong step.
 */
export type TourProgress = {
  tourId: string;
  version: number;
  stepId: string | null;
  completed: string[];
  completedAt: string | null;
};
