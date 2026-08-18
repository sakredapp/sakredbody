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
  private async pointFor(anchor: string, instance: string | null): Promise<Point | null> {
    return this.b.evaluate<Point | null>(`
      const all = [...document.querySelectorAll('[data-tour-id="${anchor}"]')];
      const visible = all.filter(e => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
      });
      const named = ${instance ? `visible.filter(e => e.getAttribute("data-tour-instance") === ${JSON.stringify(instance)})` : "visible"};
      if (named.length !== 1) return null;
      const r = named[0].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    `);
  }

  private continuePoint(): Promise<Point | null> {
    return this.b.evaluate<Point | null>(`
      const el = document.querySelector('[data-testid="button-tour-continue"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    `);
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
      }
      if (!(await this.present(step.anchor))) {
        throw new TourDriverError(
          "TARGET_NEVER_RENDERED",
          `step ${step.id}: ${step.anchor} never appeared for this member`,
        );
      }
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
    const at = await this.pointFor(step.anchor, instance);
    if (!at) {
      throw new TourDriverError(
        "TARGET_UNRESOLVED",
        `step ${step.id}: ${step.anchor}${instance ? `[${instance}]` : ""} is absent, hidden or ambiguous`,
      );
    }
    await this.b.clickAt(at.x, at.y);
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
