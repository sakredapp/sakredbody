/**
 * Putting the app back the way a lesson needs to find it.
 *
 * ── The thing this was missing ────────────────────────────────────────────
 *
 * `restore.ts` has computed, for every step, the route, section, sheet and
 * rehearsal state its lesson needs — carefully, with a comment explaining that
 * resuming onto Home while the panel explains RPE is the single most likely
 * way this feature embarrasses itself.
 *
 * Nothing called it. The whole file was reachable from one line in TourHost
 * that read `.instance` off it. A member who took a phone call during the
 * workout lesson came back to exactly the screen that file exists to prevent:
 * the right step, over the wrong app. Same shape as the anchor that never
 * reached the DOM and the rehearsal barrier wired to nothing — the third this
 * cycle, and the reason a call-site test now follows each of them.
 *
 * ── Why a bus and not props ───────────────────────────────────────────────
 *
 * Because the state to be restored is owned by three different components —
 * the dashboard holds the section, the navigation holds the More sheet, the
 * workout provider holds its own — and threading a tour concern through all
 * three would put a tutorial in the props of every screen in the portal. The
 * tour already reads the app through the document; this is the same
 * arrangement pointed the other way, and it stays one import per owner.
 *
 * Requests are one-shot and idempotent: asking for a section the app is
 * already on does nothing, so a resubscribe or a re-render cannot fight a
 * member who has since navigated somewhere else.
 */

export type StageRequest = {
  /** Which dashboard section the lesson happens in. */
  section: string | null;
  /** Whether the More sheet has to be open for its rows to exist. */
  sheet: "more" | null;
  /** Whether the workout sheet has to be in front. */
  workout: boolean;
};

const EVENT = "sakred.tour.stage";

/**
 * The last request, and when it was made.
 *
 * ── Why a request has to outlive its dispatch ─────────────────────────────
 *
 * Effects run child-first, and the tour lives *inside* the providers whose
 * state it is asking to change. So on the commit where the walkthrough starts,
 * its effect fires before the workout provider has subscribed, and the request
 * to bring the workout forward was delivered to nobody. The reconstruction was
 * entirely correct — the rehearsal was installed, the session was there, the
 * section was right — and the screen it was for stayed behind the dashboard.
 *
 * So a request is state for a moment rather than an event. A subscriber that
 * mounts during that moment picks it up; one that mounts a minute later, after
 * the member has put the workout away themselves, does not.
 */
const HOLD_MS = 4_000;
let latest: { request: StageRequest; at: number } | null = null;

export function requestStage(request: StageRequest): void {
  if (typeof window === "undefined") return;
  latest = { request, at: Date.now() };
  window.dispatchEvent(new CustomEvent<StageRequest>(EVENT, { detail: request }));
}

export function onStageRequest(fn: (request: StageRequest) => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (latest && Date.now() - latest.at < HOLD_MS) fn(latest.request);
  const handler = (e: Event) => fn((e as CustomEvent<StageRequest>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Forget any held request. Called when a tour ends, so nothing lingers. */
export function clearStage(): void {
  latest = null;
}
