/**
 * How much of the screen a lesson is allowed to take.
 *
 * ── The defect this is built from ─────────────────────────────────────────
 *
 * Real iPhone screenshots, four different lessons, one complaint:
 *
 *   Restore        the panel sat over the row of practices the lesson says
 *                  "open one if you're curious" about
 *   Today's Build  half the recommendation card was behind the explanation
 *                  of what the recommendation card is
 *   Body Map       "Territories, not parts" covered the territories
 *   Room           "Read before you write" covered what there is to read
 *
 * Each looks like its own placement bug and none of them is. The panel is one
 * size — rich enough for "Welcome to Sakred Body", and that same richness is
 * spent on "Tap Restore." A lesson whose whole content is four words does not
 * need 35% of a phone, and the cost of giving it that is paid by the product
 * underneath.
 *
 * ── Why weight is derived and not typed out 26 times ──────────────────────
 *
 * A field on every step is a field somebody forgets on the twenty-seventh, and
 * the failure is silent: the new lesson simply gets the heavy treatment and
 * covers whatever it was teaching. The structure already knows the answer —
 * a step with no anchor has nothing to cover, a step with an anchor is
 * pointing at something the member has to see — so the default comes from
 * that, and `weight` on the step is an override for the cases structure cannot
 * see.
 *
 * ── The three weights ─────────────────────────────────────────────────────
 *
 *   concept    Nothing to point at, or the lesson *is* the reading. The full
 *              panel is right here: there is no product underneath being
 *              hidden, because the panel is the content.
 *
 *   action     "Tap Restore." The member needs to see the thing and the
 *              sentence, and the sentence is short. Less padding, no expanded
 *              checklist, and a ceiling on height so a long line cannot grow
 *              back into the space this exists to protect.
 *
 *   workspace  The member is *working* — the movement picker, the composer,
 *              the Body Map. The panel is an instruction beside a task, not a
 *              page. Tightest of the three, and it carries the veil rule as
 *              well: see `veilFor`, because dimming a surface while telling
 *              somebody to use it is the same mistake in another medium.
 */

import type { TourStep } from "./types.js";

export const LESSON_WEIGHTS = ["concept", "action", "workspace"] as const;
export type LessonWeight = (typeof LESSON_WEIGHTS)[number];

/**
 * What this lesson should weigh.
 *
 * An explicit `weight` always wins — it is how a lesson says "I am a workspace
 * lesson" when nothing about its shape reveals that.
 */
export function lessonWeight(step: TourStep): LessonWeight {
  if (step.weight) return step.weight;
  /*
    A choice is the content. Atmosphere renders two cards inside the panel and
    there is nothing behind it to protect, so it keeps the full treatment.
  */
  if (step.choice) return "concept";
  /* Nothing to point at means nothing to cover. */
  if (!step.anchor) return "concept";
  return "action";
}

export type PanelMetrics = {
  /** Tailwind for the panel box itself. */
  padding: string;
  /** Vertical rhythm between the panel's blocks. */
  gap: string;
  /**
   * The most of the viewport this lesson may occupy, as a fraction.
   *
   * A ceiling rather than a height: a short lesson stays short. It exists so
   * that copy which wraps to five lines on a 360px phone cannot quietly
   * reclaim the room the weight was chosen to give back.
   */
  maxViewportShare: number;
  /**
   * Whether the checklist may be opened here.
   *
   * `LEARNING SAKRED · 3 / 7` is one line and orients; seven items is six more
   * and, on the Body Map, is the largest object on a screen about a map. The
   * summary always shows — this decides whether expanding is offered.
   */
  expandableChecklist: boolean;
};

export const PANEL: Readonly<Record<LessonWeight, PanelMetrics>> = {
  concept: {
    padding: "px-5 py-4",
    gap: "space-y-3",
    maxViewportShare: 0.62,
    expandableChecklist: true,
  },
  action: {
    padding: "px-4 py-3",
    gap: "space-y-2",
    /*
      A third of the screen for a sentence and a button. Derived from the
      screenshots rather than picked: the Restore panel that covered the
      practices measured 363px of a 780px phone — 47% — and the practices it
      hid began 20px below where it ended.
    */
    maxViewportShare: 0.34,
    expandableChecklist: false,
  },
  workspace: {
    padding: "px-4 py-3",
    gap: "space-y-2",
    /*
      The member is doing something. A quarter is enough for an instruction and
      leaves the picker, the composer or the map as the thing on screen.
    */
    maxViewportShare: 0.26,
    expandableChecklist: false,
  },
};

/**
 * How dark the world outside the lesson should go.
 *
 * ── The screenshot this exists because of ─────────────────────────────────
 *
 * The Add Movement sheet, with search, categories and a list of movements, all
 * of it dimmed to near-black — while the lesson asked the member to pick a
 * movement from it. The walkthrough had made the workspace look disabled at
 * exactly the moment it was meant to be used.
 *
 * A teaching veil and a modal scrim are not the same object. A scrim says
 * "not this, over here"; a veil says "start here". On a workspace lesson the
 * surface the member is working in has to stay legible, so the veil is light
 * enough to read through and the emphasis comes from the halo instead.
 */
export function veilFor(weight: LessonWeight): number {
  /*
    1 is "unchanged" — the scrim token already carries its own alpha, tuned
    per atmosphere, and this multiplies it. Concept and action lessons keep
    exactly the treatment that shipped; only the workspace case is lightened,
    because only the workspace case was wrong.
  */
  return weight === "workspace" ? 0.45 : 1;
}
