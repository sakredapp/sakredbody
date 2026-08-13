/**
 * Where a tapped notification lands.
 *
 * ── A notification is not authorization ───────────────────────────────────
 *
 * Nothing here opens anything. It names a destination, and the destination
 * fetches under whatever authorization the member currently has. That ordering
 * is the whole design:
 *
 *     app opens  →  auth resolves  →  current state is fetched  →  route
 *
 * So a `plan_activated` tapped a month after the plan ended lands on Today and
 * finds no plan, rather than resurrecting one. A coach who taps a message
 * notification about a client since reassigned away reaches a workspace whose
 * client list no longer contains them, and the thread does not open. The push
 * carries ids; the server decides what those ids are still allowed to mean.
 *
 * ── Why the destination is persisted ──────────────────────────────────────
 *
 * A tap on a cold-started app can arrive before auth has resolved, and if the
 * session has expired the app does a full page load to /login — which discards
 * anything held in a module variable. The destination therefore goes to
 * Preferences, survives the round trip, and is claimed exactly once on the
 * other side.
 *
 * It expires. A destination that has sat unclaimed for an hour is not somebody
 * finishing an interrupted journey, it is a stale instruction that would hijack
 * an unrelated launch.
 */

import { Preferences } from "@capacitor/preferences";

const PENDING_KEY = "sakred.notification.pending";

/** Long enough to survive a login, short enough not to ambush a later launch. */
const PENDING_TTL_MS = 60 * 60 * 1000;

/**
 * Which shell, and where inside it.
 *
 * `section` and `tab` are the member dashboard's own vocabulary rather than a
 * new routing language — see MemberSection / CoachingTab in MemberNav. The
 * coach side names a client by id only; the workspace supplies the name from
 * its authorized list, because a name that arrived in a push is a name nobody
 * checked.
 */
export type Destination =
  | { app: "member"; section: string; tab?: string }
  | { app: "coach"; clientUserId: string | null };

/** What the server puts in the FCM `data` block. Ids and types, never content. */
export type NotificationData = {
  notificationId?: string;
  type?: string;
  resourceType?: string;
  resourceId?: string;
  /** The person who acted. For a coach, this is which client to open. */
  actorUserId?: string;
};

/**
 * Who is holding the phone.
 *
 * Derived from the signed-in account rather than sent in the payload: the same
 * `coaching.message` type means "your coach wrote to you" or "your client wrote
 * to you" depending entirely on which end you are, and the device already knows
 * which end it is. Sending it would be asking the server to describe the reader
 * to themselves.
 */
export type Viewer = "member" | "coach";

export function viewerFromRole(role: string | null | undefined): Viewer {
  return role === "coach" || role === "admin" || role === "owner" ? "coach" : "member";
}

/**
 * The destination for an event, from the reader's side of it.
 *
 * Unknown types fall through to the member's Today rather than nowhere: a build
 * that ships a new notification type before it ships the screen for it should
 * open the app somewhere sensible, not appear broken.
 */
export function destinationFor(data: NotificationData, viewer: Viewer): Destination {
  if (viewer === "coach") {
    switch (data.type) {
      // Both of these are a client doing something. The workspace opens that
      // client — if they are still a client.
      case "coaching.message":
      case "coaching.checkin_completed":
        return { app: "coach", clientUserId: data.actorUserId || null };
      default:
        return { app: "coach", clientUserId: null };
    }
  }

  switch (data.type) {
    case "coaching.message":
      return { app: "member", section: "coaching", tab: "coach" };
    // A request to answer, and a plan that changed, are both things to do
    // today — and Today is where the card that actually reflects current state
    // lives. Neither notification is allowed to assert that state itself.
    case "coaching.checkin_requested":
    case "coaching.plan_activated":
      return { app: "member", section: "coaching", tab: "today" };
    default:
      return { app: "member", section: "coaching", tab: "today" };
  }
}

type Stored = { destination: Destination; at: number };

/**
 * Hold a destination across whatever the app has to do before it can honour it.
 *
 * Written before auth is known to be good, because the alternative is losing
 * the tap of somebody whose session happened to expire overnight — the single
 * most likely moment for a coaching message to be waiting.
 */
export async function rememberDestination(destination: Destination): Promise<void> {
  try {
    await Preferences.set({
      key: PENDING_KEY,
      value: JSON.stringify({ destination, at: Date.now() } satisfies Stored),
    });
  } catch {
    // Storage refused. The app still opens; it just opens where it usually does.
  }
}

/**
 * Claim it, once.
 *
 * Removed before it is returned, not after it is used: a destination that
 * survives being acted on is a destination that re-fires on the next mount, and
 * a member who cannot navigate away from a screen they already read.
 */
export async function claimDestination(): Promise<Destination | null> {
  try {
    const { value } = await Preferences.get({ key: PENDING_KEY });
    if (!value) return null;
    await Preferences.remove({ key: PENDING_KEY });

    const parsed = JSON.parse(value) as Stored;
    if (!parsed?.destination) return null;
    if (!Number.isFinite(parsed.at) || Date.now() - parsed.at > PENDING_TTL_MS) return null;
    return parsed.destination;
  } catch {
    return null;
  }
}

/** Drop a pending destination — on sign-out, so it cannot follow the next person in. */
export async function forgetDestination(): Promise<void> {
  try {
    await Preferences.remove({ key: PENDING_KEY });
  } catch {
    // Nothing to do; the TTL collects it.
  }
}
