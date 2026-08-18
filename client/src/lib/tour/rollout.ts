/**
 * Whether the walkthrough is allowed to take the screen on its own.
 *
 * ── Why this is a separate file with one meaningful line in it ────────────
 *
 * Because the decision it holds is not an engineering one. The walkthrough can
 * be complete, tested, and correct in every mechanical sense and still not be
 * ready to be the first thing every member of Sakred Body meets on opening the
 * app — that judgement needs a person who has walked it end to end on a phone,
 * in both atmospheres, and read the copy as somebody who does not already know
 * what it is trying to say.
 *
 * Until that has happened, a bad tutorial would become a *mandatory* bad
 * tutorial, which is meaningfully worse than no tutorial at all: it is the
 * product's first impression, it cannot be skipped, and it would arrive for
 * existing members who are currently perfectly happy.
 *
 * So the flag is off, it is off explicitly rather than by omission, and the
 * test suite asserts it is off. Turning it on is one line and one deliberate
 * commit, which is the correct amount of ceremony for "every member of the
 * product now sees this".
 *
 * ── What being off does and does not mean ─────────────────────────────────
 *
 * Off disables *automatic* start only. Replay from Settings and the QA reset
 * both run the same tour through the same engine, so the thing being rehearsed
 * is the thing that will ship — not a demo build of it.
 */

/**
 * The version every member is expected to have completed once rollout begins.
 *
 * Held separately from the tour's own `version` so that shipping a v2 does not
 * automatically require it of everybody. A tour can be improved without that
 * improvement becoming a compulsory interruption for people who already
 * learned the app from v1.
 *
 * ── Why this is 2 ────────────────────────────────────────────────────────
 *
 * Because v1 was, for most of its life, unusable in a way nobody could see
 * from the source: the overlay's own wrapper intercepted every highlighted
 * control, so a member could read the lessons and not act on any of them. That
 * is not a walkthrough somebody has been taught by, whatever their stored
 * record says — so anyone carrying a v1 record is offered this one from the
 * beginning. Their old record stays where it is, under its own key.
 */
export const REQUIRED_TOUR_VERSION = 2;

/**
 * Automatic first-run start.
 *
 * OFF until the dedicated walkthrough QA pass has been run: every step
 * exercised on a device, spotlight geometry measured rather than eyeballed,
 * both atmospheres, both platforms, and a comprehension pass with somebody who
 * has never seen Sakred.
 */
export const AUTO_START_ENABLED = false;

/**
 * Whether an existing member is owed the required walkthrough.
 *
 * Deliberately compares versions rather than reading a boolean, so the initial
 * rollout can require v1 of *this* walkthrough from everybody — including
 * accounts carrying older onboarding flags from a product that has changed
 * substantially since. Nothing else about those accounts is touched: this is
 * education state and nothing more.
 */
export function owesRequiredTour(lastCompletedRequiredVersion: number | null): boolean {
  if (!AUTO_START_ENABLED) return false;
  return (lastCompletedRequiredVersion ?? 0) < REQUIRED_TOUR_VERSION;
}

/**
 * QA and replay: running the real walkthrough without requiring it of anybody.
 *
 * The first time this feature mounts should be through here, not through a
 * rollout. Same tour, same engine, same overlay — so what gets rehearsed on a
 * device is what will eventually ship, rather than a demo build of it.
 *
 * Opt-in per device and never automatic: `?tour=replay` turns it on, which is
 * something a person does deliberately with a URL, and cannot happen to a
 * member. Replay from Settings will set the same flag.
 */
export const QA_REPLAY_KEY = "sakred.tour.replay";

export function qaReplayRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("tour") === "replay") {
      window.localStorage.setItem(QA_REPLAY_KEY, "1");
      return true;
    }
    return window.localStorage.getItem(QA_REPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

export function endQaReplay(): void {
  try {
    window.localStorage.removeItem(QA_REPLAY_KEY);
  } catch {
    // Nothing stored; nothing to clear.
  }
}
