/**
 * Who is allowed to move the page while a lesson is being taught, and when.
 *
 * ── What the trace showed ─────────────────────────────────────────────────
 *
 * Recorded on the real transition — tap Restore, "This changes with you" —
 * at 393×852, every scroll command logged with its caller and the page
 * sampled every frame:
 *
 *     276ms  window.scrollTo [0,0]        MemberDashboard, on section change
 *     281ms  lesson          → This changes with you
 *     492ms  document 852 → 1356          Restore's content mounts
 *     496ms  scrollIntoView  restore-practice top=974  {block:center,smooth}
 *     863ms  scroll lands at 504, target at 462
 *    1575ms  document 1356 → 1441
 *    1986ms  document 1441 → 1489         target drifts 966 → 1014
 *    2277ms  document 1493 → 1919
 *
 * The two scroll owners never overlapped, so the fight was not between them.
 * The defect is that the walkthrough spends its one scroll at 496ms against a
 * document that is still growing at 2277ms. Restore's history and memory
 * panels resolve their queries after the lesson has already committed, each
 * one pushing the highlighted card further down: the member watches the thing
 * they were told to look at slide 52px out from under its own halo, nearly two
 * seconds after arriving, with nothing left to correct it — the tour had used
 * its scroll and gone quiet.
 *
 * ── Why this is a state machine and not a delay ───────────────────────────
 *
 * Waiting 2.3 seconds for the layout to settle before scrolling would fix the
 * drift by making the member stare at a lesson whose subject is off screen,
 * which is worse. Retrying every 350ms — what this replaced — restarts an
 * in-flight smooth scroll with a new one from wherever it had reached, which
 * is how a page ends up feeling possessed.
 *
 * So: scroll once, promptly, then *hold*. Once the directed scroll has landed,
 * the target's document position is remembered, and any later change to it —
 * content arriving above it — is answered by moving the scroller by exactly
 * the same amount. The content grows; the highlighted control does not move a
 * pixel. Nothing is timed. Every transition is a consequence of something
 * observed: the scroll offset going still, the target's position changing, or
 * the member taking over.
 *
 * The member always wins. One wheel, one touch, one arrow key and the hold is
 * released for the rest of the step — a tutorial that scrolls you back is not
 * a tutorial, it is a fight.
 */

/** Frames a scroll offset must be unchanged before it counts as landed. */
export const STILL_FRAMES = 3;

/** Directed scrolls a single lesson may spend, however badly it goes. */
export const MAX_DIRECTED = 3;

/**
 * The largest content shift the hold will absorb in one frame.
 *
 * A panel resolving above the target moves it tens of pixels. A whole section
 * changing underneath moves it hundreds, and matching that would fling the
 * page — at which point the honest thing is to stop holding and let the step's
 * own resolution deal with it.
 */
export const HOLD_LIMIT = 240;

/** Scroll offsets are fractional on some devices. Below this is not a move. */
const EPSILON = 1;

export type MotionPhase =
  /** The target is not in the document yet. Nothing may move. */
  | "seeking"
  /** A scroll has been asked for and has not gone still. */
  | "directing"
  /** Landed. The target's position is being kept where the member found it. */
  | "holding"
  /** The member took over, or the lesson ran out of attempts. */
  | "released";

export type MotionState = {
  phase: MotionPhase;
  /** Consecutive frames the scroll offset has been unchanged. */
  still: number;
  /** The last offset seen, to notice stillness. */
  seen: number | null;
  /**
   * Where the scroller should be if nobody but the hold has touched it.
   *
   * Null for one frame after the hold adjusts, because the browser clamps at
   * the end of the document and the adjustment does not always land in full.
   * Adopting the real value on the next frame is how a clamped hold avoids
   * being mistaken for the member scrolling.
   */
  expect: number | null;
  /** The target's document position at the moment the hold began. */
  anchoredAt: number | null;
  /** Directed scrolls spent on this lesson. */
  spent: number;
  /**
   * The offset at the moment the outstanding scroll was asked for.
   *
   * A smooth scroll does not begin on the frame it is requested. Without this,
   * "the offset has been unchanged for three frames" is true twice — once
   * before the animation starts and once after it lands — and the first one
   * was read as "landed, still not visible, ask again", which restarted the
   * scroll 25ms after requesting it. Measured on the real Restore transition:
   * two `scrollIntoView` calls, at 687ms and 712ms, for one lesson.
   *
   * So a scroll counts as finished only once the page has actually moved. If
   * it never moves, nothing is retried — re-issuing an identical command that
   * did nothing the first time is superstition, and the lesson still has its
   * halo, its panel and its own degrade path.
   */
  issuedAt: number | null;
  /**
   * Why the lesson stopped steering, in one word.
   *
   * Published on the document alongside the phase. A motion defect is two
   * seconds long and invisible in any single frame, and "released" on its own
   * does not distinguish the member taking over — which is correct and
   * desirable — from the machine giving up, which is a bug. Guessing between
   * those two cost a full re-trace.
   */
  reason: string | null;
};

export type MotionReading = {
  /** The offset of whichever element actually scrolls the target. */
  scroll: number;
  /** The target's position in document space, or null if it is not there. */
  targetDoc: number | null;
  /** Whether the target is wholly inside the visible viewport. */
  visible: boolean;
  /** The member scrolled, by gesture or key, since the last reading. */
  memberMoved: boolean;
};

export type MotionCommand =
  | { do: "nothing" }
  | { do: "scroll-into-view" }
  /** Move the scroller by exactly this, instantly, to cancel a content shift. */
  | { do: "hold"; by: number };

export function initialMotion(): MotionState {
  return { phase: "seeking", still: 0, seen: null, expect: null, anchoredAt: null, spent: 0, issuedAt: null, reason: null };
}

const NOTHING: MotionCommand = { do: "nothing" };

/**
 * One frame of the machine. Pure, so the transitions are testable without a
 * browser — which matters, because the failure this exists to prevent is
 * two seconds long and only visible on a phone.
 */
export function nextMotion(
  state: MotionState,
  reading: MotionReading,
): { state: MotionState; command: MotionCommand } {
  const still =
    state.seen !== null && Math.abs(reading.scroll - state.seen) <= EPSILON ? state.still + 1 : 0;
  const base: MotionState = { ...state, still, seen: reading.scroll };

  /* The member's own scrolling ends the tour's claim on the page, in every
     phase. Not "for this frame" — for the rest of the lesson. */
  if (reading.memberMoved) {
    return { state: { ...base, phase: "released", expect: null, reason: "member" }, command: NOTHING };
  }

  if (state.phase === "released") return { state: base, command: NOTHING };

  /* No target: nothing to scroll to, and nothing to hold in place. A step can
     arrive here after holding — a sheet closes, the control unmounts — and
     must not carry a stale anchor into whatever appears next. */
  if (reading.targetDoc === null) {
    return {
      state: { ...base, phase: "seeking", anchoredAt: null, expect: null, issuedAt: null },
      command: NOTHING,
    };
  }

  if (state.phase === "seeking") {
    if (reading.visible) {
      return {
        state: { ...base, phase: "holding", anchoredAt: reading.targetDoc, expect: reading.scroll },
        command: NOTHING,
      };
    }
    if (base.spent >= MAX_DIRECTED) {
      return { state: { ...base, phase: "released", reason: "spent" }, command: NOTHING };
    }
    return {
      state: { ...base, phase: "directing", spent: base.spent + 1, still: 0, issuedAt: reading.scroll },
      command: { do: "scroll-into-view" },
    };
  }

  if (state.phase === "directing") {
    /* The request has not taken effect yet. See `issuedAt`. */
    const started = base.issuedAt === null || Math.abs(reading.scroll - base.issuedAt) > EPSILON;
    if (!started) {
      /* Nothing has moved and the target is already in view: the command was a
         no-op and there is nothing left to wait for. */
      if (reading.visible) {
        return {
          state: { ...base, phase: "holding", anchoredAt: reading.targetDoc, expect: reading.scroll },
          command: NOTHING,
        };
      }
      return { state: base, command: NOTHING };
    }

    /*
      Still moving. Two things must not happen here.

      Asking again restarts the animation from mid-flight — the mistake this
      machine replaced. And *arriving* early is just as wrong: a target passes
      into the viewport partway through a five-hundred-pixel scroll, and
      holding from that moment records an anchor against an offset the browser
      is still changing. The very next frame the offset has moved for reasons
      the hold did not cause, which reads exactly like the member taking over,
      and the lesson lets go a third of the way through its own scroll.
      Measured: released at 870ms with the page still travelling from 6 to 504.
    */
    if (still < STILL_FRAMES) return { state: base, command: NOTHING };

    /* Landed. Now visibility means something. */
    if (reading.visible) {
      return {
        state: { ...base, phase: "holding", anchoredAt: reading.targetDoc, expect: reading.scroll },
        command: NOTHING,
      };
    }

    /* Landed short. The layout moved under the scroll — a sheet finished
       opening, a list resolved — so the same request will land somewhere
       else. Worth one more ask, not an argument. */
    if (base.spent >= MAX_DIRECTED) {
      return { state: { ...base, phase: "released", reason: "spent" }, command: NOTHING };
    }
    return {
      state: { ...base, phase: "directing", spent: base.spent + 1, still: 0, issuedAt: reading.scroll },
      command: { do: "scroll-into-view" },
    };
  }

  // holding
  if (base.expect === null) {
    return { state: { ...base, expect: reading.scroll, anchoredAt: reading.targetDoc }, command: NOTHING };
  }
  if (Math.abs(reading.scroll - base.expect) > EPSILON) {
    /* Somebody moved the page and it was not this. Momentum from a flick
       arrives without another gesture event, so the offset itself is the
       evidence. */
    return { state: { ...base, phase: "released", expect: null, reason: "momentum" }, command: NOTHING };
  }

  const drift = base.anchoredAt === null ? 0 : reading.targetDoc - base.anchoredAt;
  if (Math.abs(drift) <= EPSILON) return { state: base, command: NOTHING };
  if (Math.abs(drift) > HOLD_LIMIT) {
    return { state: { ...base, phase: "released", expect: null, reason: "upheaval" }, command: NOTHING };
  }

  return {
    state: { ...base, anchoredAt: reading.targetDoc, expect: null },
    command: { do: "hold", by: drift },
  };
}

/**
 * Which side of the screen the panel sits on, once, rather than every frame.
 *
 * The rect this is derived from travels five hundred pixels during a single
 * directed scroll, and recomputing the side from it each frame lets the panel
 * cross the threshold mid-flight and swap ends of the screen while the page is
 * still moving. So the decision is latched: it is made when there is finally
 * something to make it about, and revisited only when the side it chose has
 * genuinely stopped fitting and the other one does.
 *
 * `current` is null before the first decision — which is also the state an
 * anchored step is in while its target is still mounting, so nothing is
 * latched from a rect that does not exist yet.
 */
export function settleSide(
  current: boolean | null,
  fit: { above: number; below: number; need: number },
): boolean {
  const fitsAbove = fit.above >= fit.need;
  const fitsBelow = fit.below >= fit.need;

  if (current === null) {
    if (fitsBelow) return false;
    if (fitsAbove) return true;
    return fit.above > fit.below;
  }

  const fitsHere = current ? fitsAbove : fitsBelow;
  const fitsThere = current ? fitsBelow : fitsAbove;
  return fitsHere || !fitsThere ? current : !current;
}

// ── Where the halo is drawn ──────────────────────────────────────────────

/** Breathing room around the cutout so the halo doesn't clip the control. */
export const PAD = 8;

/**
 * How much room to leave around a control's halo.
 *
 * ── Why two answers ───────────────────────────────────────────────────────
 *
 * Most controls get eight pixels, so the ring reads as being *around* the
 * thing rather than drawn on its edge.
 *
 * The six primary navigation cells and the role tiles get none. They sit
 * shoulder to shoulder in a bar spanning the full width, so eight pixels in
 * every direction reaches into both neighbours and past the screen edge at the
 * ends — on a real iPhone the ring around Home began off the left of the
 * display and the one around More ended off the right.
 *
 * Deliberately matched on the whole name and not the `nav-` prefix. The rows
 * inside the More sheet are named that way too, and they are full-width items
 * with space around them where the padding reads correctly; hugging them put
 * the ring exactly on the row's own edge, which is the failure this rule
 * exists to prevent, in the other direction.
 */
export function padFor(anchor: string | undefined): number {
  if (!anchor) return PAD;
  return /^(nav|role)-[a-z]+$/.test(anchor) ? 0 : PAD;
}
