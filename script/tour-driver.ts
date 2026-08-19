/**
 * Driving the walkthrough the way a member does, from its own definitions.
 *
 * ── Why this replaces "click Continue until something happens" ────────────
 *
 * Because that is a different program from the one under test. A loop that
 * clicks Continue stops at the first step which advances on the member being
 * in a section, reports "the tour didn't move", and sends somebody looking for
 * a bug in the tour. That happened, and it cost a turn.
 *
 * ── The contract is the type, not today's steps ───────────────────────────
 *
 * `Advance` is a union in `client/src/lib/tour/types.ts`. This handles every
 * variant of it and ends with an assignment to `never`, so adding a sixth kind
 * stops compiling here rather than silently falling through to a default that
 * clicks Continue and calls it a pass. The definitions are the contract; this
 * file is the thing that must keep up with them.
 *
 * ── One rule covers almost all of it ──────────────────────────────────────
 *
 * The overlay highlights the control the member is meant to touch. So unless
 * the step is asking for Continue, the member action IS "tap the anchor" — and
 * if the step's condition is already true when it opens, the member does
 * nothing and the tour advances on its own. Those two cases, plus a typed
 * timeout, are the whole driver.
 *
 * Nothing here calls into the tour's internals. No setStep, no setSection. If
 * a step cannot be satisfied by doing what it asks, that is a finding.
 */

import type { Browser } from "./cdp.js";
import { SAKRED_INTRO } from "../client/src/lib/tour/sakredIntro.js";
import type { Advance, TourStep } from "../client/src/lib/tour/types.js";

export type Point = { x: number; y: number };

/** How a step was satisfied. The distinction is the useful half of the log. */
export type Satisfaction = "by-app" | "by-member";

export type Traversal = {
  stepId: string;
  objective?: string;
  advance: Advance["kind"];
  satisfiedBy: Satisfaction;
  anchor: string | null;
  nextExpected: string | null;
  nextActual: string | null;
};

export class TourDriverError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
  }
}

const STEP_TIMEOUT_MS = 15_000;

/** How long a chooser gets to fill before the driver gives up on it. */
const CHOOSER_TIMEOUT_MS = 8_000;

/**
 * How long a member spends looking at a lesson before touching anything.
 *
 * The driver was pressing Continue within a few milliseconds of the panel
 * mounting, which no hand can do — and the overlay now ignores a press that
 * arrives before its control has plausibly been seen, because that is the tail
 * of the gesture that mounted it rather than a new decision.
 *
 * So this is not tuning the test to the guard. It is the driver modelling a
 * member instead of a script: an instrument that acts faster than a hand
 * cannot tell you what a hand will experience. A quarter of a second is still
 * far quicker than anybody reads.
 */
const READ_PAUSE_MS = 250;


/**
 * Which of the newly-appeared controls is an *answer* rather than an escape.
 *
 * A chooser puts many siblings on screen at once — five hundred movements, a
 * list of saved workouts — and they share a testid prefix because that is how
 * a list gets named. The Cancel beside it is a singleton.
 *
 * So: group by prefix, take the largest group, take its first member. Picking
 * whatever appeared first in the DOM instead was tried, and it closed the
 * workout sheet — the driver pressed the picker's own dismiss control and then
 * reported the lesson broken.
 *
 * A tie, or nothing but singletons, means the app did not ask a question this
 * driver can answer. Better to leave the step failing with a name than to
 * press an arbitrary button and report whatever happens next.
 */
export function optionFrom(appeared: readonly string[]): string | null {
  const groups = new Map<string, string[]>();
  for (const id of appeared) {
    const prefix = id.split("-")[0];
    groups.set(prefix, [...(groups.get(prefix) ?? []), id]);
  }
  let best: string[] | null = null;
  let tied = false;
  for (const members of groups.values()) {
    if (!best || members.length > best.length) {
      best = members;
      tied = false;
    } else if (members.length === best.length) {
      tied = true;
    }
  }
  if (!best || best.length < 2 || tied) return null;
  return best[0];
}

export class TourDriver {
  constructor(private readonly b: Browser, private readonly tour = SAKRED_INTRO) {}

  stepId(): Promise<string | null> {
    return this.b.evaluate<string | null>(
      `return document.querySelector('[data-testid="tour-overlay"]')?.getAttribute("data-tour-step") ?? null;`,
    );
  }

  private section(): Promise<string | null> {
    return this.b.evaluate<string | null>(
      `return document.documentElement.getAttribute("data-tour-section");`,
    );
  }

  private present(anchor: string): Promise<boolean> {
    return this.b.evaluate<boolean>(
      `return !!document.querySelector('[data-tour-id="${anchor}"]');`,
    );
  }

  /** Centre of the visible instance, or null. The resolver's rule, not `[0]`. */
  private async pointFor(
    anchor: string,
    instance: string | null,
    anyInstance = false,
  ): Promise<Point | null> {
    return this.b.evaluate<Point | null>(`
      const all = [...document.querySelectorAll('[data-tour-id="${anchor}"]')];
      const visible = all.filter(e => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
      });
      const named = ${instance ? `visible.filter(e => e.getAttribute("data-tour-instance") === ${JSON.stringify(instance)})` : "visible"};
      /*
        A step that accepts any of several like controls gets the first one on
        screen, which is what a member choosing freely would land on. Every
        other step still requires exactly one, so an ambiguous target stays a
        finding rather than becoming a coin toss.
      */
      if (named.length !== 1 && !${JSON.stringify(!!anyInstance)}) return null;
      if (named.length === 0) return null;
      const r = named[0].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    `);
  }

  private pause(ms: number): Promise<unknown> {
    return this.b.evaluate(`return new Promise(r => setTimeout(() => r(true), ${ms}));`);
  }

  /**
   * The way forward, whichever one the lesson is offering.
   *
   * A lesson whose subject never appeared offers "Continue for now" under a
   * different test id, deliberately, so that a degraded lesson is never
   * mistaken for a taught one. A member presses it and moves on; a driver that
   * only knew the ordinary button reported the walkthrough as dead at the
   * first lesson with no subject on this layout.
   */
  private continuePoint(): Promise<Point | null> {
    return this.b.evaluate<Point | null>(`
      const el = document.querySelector('[data-testid="button-tour-continue"]')
        ?? document.querySelector('[data-testid="button-tour-continue-degraded"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    `);
  }

  /** Whether this lesson has given up looking for its subject. */
  degraded(): Promise<boolean> {
    return this.b.evaluate<boolean>(
      `return !!document.querySelector('[data-testid="button-tour-continue-degraded"]');`,
    );
  }

  /**
   * Is the step's own condition already true?
   *
   * If it is, the member is meant to do nothing — the tour advances on them
   * simply being where they already are. Treating that as "needs a click" is
   * what broke the previous driver.
   */
  private async alreadySatisfied(advance: Advance): Promise<boolean> {
    switch (advance.kind) {
      case "continue":
      case "tap":
        return false;
      case "section":
        return (await this.section()) === advance.section;
      case "present":
        return await this.present(advance.anchor);
      case "absent":
        return !(await this.present(advance.anchor));
      default: {
        /* Adding a variant to `Advance` fails here rather than in production. */
        const unreachable: never = advance;
        throw new TourDriverError("UNKNOWN_ADVANCE", JSON.stringify(unreachable));
      }
    }
  }

  /**
   * Do what the step is asking.
   *
   * The overlay highlights the control to touch, so for everything except a
   * Continue step the member action is a real tap on that anchor.
   */
  private async act(step: TourStep, instance: string | null): Promise<void> {
    /*
      A member does not tap Continue at a lesson pointing somewhere blank —
      they wait for the thing being explained to appear, and so does this. The
      overlay renders an enabled Continue during that wait which does nothing
      when pressed (a defect in its own right), so a driver that clicks
      immediately reports the step as broken when it is merely still loading.
    */
    if (step.anchor) {
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline && !(await this.present(step.anchor))) {
        await this.b.settle();
        /* A lesson that has already given up is not going to start finding
           its subject, and waiting the full twelve seconds for a verdict the
           overlay has reached is the harness disagreeing with the product. */
        if (await this.degraded()) break;
      }
      if (!(await this.present(step.anchor)) && !(await this.degraded())) {
        throw new TourDriverError(
          "TARGET_NEVER_RENDERED",
          `step ${step.id}: ${step.anchor} never appeared for this member`,
        );
      }
    }
    await this.pause(READ_PAUSE_MS);

    /*
      A degraded lesson has exactly one way forward regardless of what it would
      otherwise have asked for: its subject is not on screen to be tapped.
    */
    if (await this.degraded()) {
      const at = await this.continuePoint();
      if (!at) throw new TourDriverError("NO_CONTINUE", `step ${step.id} degraded and offers no way on`);
      await this.b.clickAt(at.x, at.y);
      return;
    }

    if (step.advance.kind === "continue") {
      const at = await this.continuePoint();
      if (!at) throw new TourDriverError("NO_CONTINUE", `step ${step.id} advances on Continue and offers none`);
      await this.b.clickAt(at.x, at.y);
      return;
    }
    if (!step.anchor) {
      throw new TourDriverError(
        "NO_ANCHOR",
        `step ${step.id} advances on ${step.advance.kind} but highlights nothing to touch`,
      );
    }
    await this.scrollTo(step.anchor, instance);
    const at = await this.pointFor(step.anchor, instance, step.anyInstance ?? false);
    if (!at) {
      throw new TourDriverError(
        "TARGET_UNRESOLVED",
        `step ${step.id}: ${step.anchor}${instance ? `[${instance}]` : ""} is absent, hidden or ambiguous`,
      );
    }

    /*
      Some controls ask a question back.

      "Add one" is a lesson pointing at a button that opens a list of five
      hundred movements — the member's action is the tap *and* the choice, and
      a driver that only taps sits waiting for a set row that cannot exist
      until something has been chosen.

      Rather than teach this file that `add-exercise` opens a picker, it
      notices the general shape: a tap that was supposed to satisfy the step
      did not, and controls appeared that were not on screen a moment ago. The
      first of those is the answer to whatever was asked. That covers a
      movement picker, and it covers the next chooser somebody adds without
      this file needing to hear about it.
    */
    let seen = await this.selectable();
    await this.b.clickAt(at.x, at.y);
    await this.b.settle();

    /*
      Keep answering until the lesson's own condition is met.

      One follow-through is not enough: the movement picker asks twice — a
      group, then a movement inside it — and stopping after the first leaves
      the tour waiting for a set row behind one more tap. Bounded at four so a
      chooser that never resolves fails with a name rather than clicking
      forever.
    */
    for (let depth = 0; depth < 4; depth++) {
      const answer = await this.waitForOptions(step.advance, seen);
      if (!answer) return;
      seen = await this.selectable();
      await this.choose(answer);
      await this.b.settle();
    }
  }

  /**
   * Wait for the chooser to actually fill, then name the answer.
   *
   * The movement picker asks the server for six hundred and sixty-six
   * movements; the request takes about four hundred milliseconds and the list
   * renders after that. Sampling once, immediately after the tap, sees the
   * category chips that render instantly and nothing else — which is how this
   * driver spent a session reporting that the catalogue "never loads" when it
   * loads perfectly well half a second later.
   *
   * A hand would wait. So does this, and it stops the moment there is either
   * an answer or a satisfied step, rather than sleeping a fixed amount.
   */
  private async waitForOptions(advance: Advance, before: readonly string[]): Promise<string | null> {
    const deadline = Date.now() + CHOOSER_TIMEOUT_MS;
    let best: string | null = null;
    while (Date.now() < deadline) {
      if (await this.alreadySatisfied(advance)) return null;
      const now = await this.selectable();
      const fresh = now.filter((id) => !before.includes(id));
      /*
        A list item is an answer. Anything else that appeared alongside it is
        chrome — a filter, a dismiss, a heading control — and pressing chrome
        is how this driver used to close the sheet and blame the lesson.
      */
      const inList = (await this.listOptions()).filter((id) => fresh.includes(id));
      const answer = inList.length ? inList[0] : optionFrom(fresh);
      /*
        Keep looking after the first answer appears. The chips arrive before
        the list does, and both are "new" — so the first plausible answer is
        the wrong one for as long as something larger is still on its way.
      */
      if (answer && answer === best) return answer;
      best = answer;
      await this.b.settle();
    }
    return best;
  }

  /**
   * Every enabled control on screen that can be identified, as testids.
   *
   * The identity is `data-testid` because that is what this codebase gives its
   * controls; anything without one is invisible to this comparison, which is
   * the right failure — an unnamed control is one no test can talk about.
   */
  private selectable(): Promise<string[]> {
    return this.selectableIn("");
  }

  /**
   * The same controls, but only those the page has put in a list.
   *
   * The distinction is doing real work. A picker shows filter chips and
   * results together, and both were named `movement-…` — so a prefix
   * heuristic chose "Strength" (a filter) over "Cobra" (an answer), forever.
   * The page already says which is which: results are `<li>` inside a `<ul>`,
   * filters are a row of chips. That is a structural fact about the markup
   * rather than a guess about naming, and it holds for any list this app
   * renders.
   */
  private listOptions(): Promise<string[]> {
    return this.selectableIn("li ");
  }

  private selectableIn(scope: string): Promise<string[]> {
    const q = (tag: string) => `${scope}${tag}[data-testid]`;
    return this.b.evaluate<string[]>(`
      return [...document.querySelectorAll('${q("button")}, ${q("a")}, ${scope}[role="button"][data-testid]')]
        .filter(e => {
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden"
            && Number(s.opacity) > 0.05 && !e.hasAttribute("disabled");
        })
        .map(e => e.getAttribute("data-testid"));
    `);
  }

  /**
   * Put the target on screen before touching it.
   *
   * A member scrolls; a driver that taps a coordinate 450px below the fold
   * taps the page's background and reports the lesson broken. The overlay
   * scrolls too, so this is usually a no-op — but the driver must not depend
   * on the thing it is testing to do it.
   */
  private async scrollTo(anchor: string, instance: string | null): Promise<void> {
    /*
      Finish anything still animating in.

      Headless Chrome produces no compositor frames, so a CSS enter animation
      never advances: the More sheet reported `data-state="open"` while parked
      at its opening keyframe, translated 484px down, with its contents
      measurably below the fold and untappable. That is the instrument, not the
      product — a real phone composites and the sheet arrives.

      So rather than sleeping and hoping, the driver finishes in-flight
      animations outright. A member sees the animation; a test does not need
      to, and must not be at the mercy of whether the harness draws frames.
    */
    await this.b.evaluate(`
      for (const a of document.getAnimations()) {
        try { a.finish(); } catch { /* infinite or unfinishable; leave it */ }
      }
      return true;
    `);
    await this.b.evaluate(`
      const all = [...document.querySelectorAll('[data-tour-id="${anchor}"]')];
      const visible = all.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const named = ${instance ? `visible.filter(e => e.getAttribute("data-tour-instance") === ${JSON.stringify(instance)})` : "visible"};
      const el = named[0];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= window.innerHeight) return true;
      el.scrollIntoView({ block: "center", behavior: "auto" });
      return true;
    `);
    await this.b.settle();
  }

  private async choose(testId: string): Promise<void> {
    const at = await this.b.evaluate<Point | null>(`
      const el = document.querySelector('[data-testid=' + JSON.stringify(${JSON.stringify(testId)}) + ']');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    `);
    if (at) await this.b.clickAt(at.x, at.y);
  }

  /** One step: satisfy it, then observe where the tour actually went. */
  async step(instance: string | null = null): Promise<Traversal> {
    const id = await this.stepId();
    if (!id) throw new TourDriverError("NOT_MOUNTED", "no tour overlay in the document");
    const index = this.tour.steps.findIndex((s) => s.id === id);
    if (index < 0) throw new TourDriverError("UNKNOWN_STEP", `${id} is not in this tour`);
    const step = this.tour.steps[index];

    const auto = await this.alreadySatisfied(step.advance);
    if (!auto) await this.act(step, instance);

    const deadline = Date.now() + STEP_TIMEOUT_MS;
    let now = id;
    while (Date.now() < deadline) {
      await this.b.settle();
      now = (await this.stepId()) ?? "";
      if (now !== id) break;
    }
    if (now === id) {
      throw new TourDriverError(
        auto ? "AUTO_STEP_STALLED" : "ACTION_DID_NOT_ADVANCE",
        `step ${id} (${step.advance.kind}) never advanced within ${STEP_TIMEOUT_MS}ms`,
      );
    }

    return {
      stepId: id,
      objective: step.objective,
      advance: step.advance.kind,
      satisfiedBy: auto ? "by-app" : "by-member",
      anchor: step.anchor ?? null,
      nextExpected: this.tour.steps[index + 1]?.id ?? null,
      nextActual: now || null,
    };
  }

  /**
   * Walk until the tour is on `target`, doing only what the steps ask.
   *
   * The prerequisite for every fixture that needs to start somewhere specific —
   * the input hazard at `terrain`, the rehearsal at `start-session`, each
   * resume checkpoint — so there is one traversal implementation rather than a
   * hand-written path per test.
   */
  async driveUntil(target: string, max = 40): Promise<Traversal[]> {
    const log: Traversal[] = [];
    for (let i = 0; i < max; i++) {
      const at = await this.stepId();
      if (at === target) return log;
      if (at === null) throw new TourDriverError("TOUR_ENDED", `reached the end without seeing ${target}`);
      log.push(await this.step());
    }
    throw new TourDriverError("TOO_MANY_STEPS", `${max} steps without reaching ${target}`);
  }
}
