import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { apiFetch } from "./apiFetch";
import { queryClient } from "./queryClient";
import {
  destinationFor,
  rememberDestination,
  viewerFromRole,
  type NotificationData,
  type Viewer,
} from "./notificationRoutes";

/**
 * Notifications for the iOS/Android shells.
 *
 * Two mechanisms, deliberately kept apart:
 *
 *   - The daily ritual reminder is a *local* notification. It is scheduled on
 *     the device, fires with no network, costs nothing to deliver, and keeps
 *     working if the server is down. This is the bulk of our volume and it
 *     should never touch FCM.
 *
 *   - The coach thread is *remote*, over FCM. A message from a coach is the
 *     one thing that genuinely originates on the server, so it is the one
 *     thing that earns a push token.
 *
 * Everything here no-ops on the web build, so calling it from shared client
 * code is safe — the PWA keeps its existing behaviour.
 */

export const isNative = () => Capacitor.isNativePlatform();

/**
 * Remote push is live. Every part of the chain exists.
 *
 * This constant stayed `false` for as long as any link was missing, because iOS
 * lets an app ask for notification permission exactly once, ever — and a prompt
 * that cannot be honoured spends both the permission and the member's trust in
 * the same moment. What it was waiting for, and what is now true:
 *
 *   · An APNs auth key uploaded to Firebase, so FCM can reach Apple.
 *   · A service account in the server environment, verified to mint a real
 *     OAuth token for the messaging scope — not merely present.
 *   · A delivery adapter that sends post-commit and retires dead tokens.
 *   · Tap handling in the shells, so a notification leads somewhere rather
 *     than only cold-opening the app.
 *
 * The distribution entitlement was never the blocker it appeared to be: the
 * source file says `development` and the exported, store-signed IPA carries
 * `production`, because Xcode rewrites it from the provisioning profile at
 * signing time. Do not "fix" that file.
 *
 * Turning this off again is a safe thing to do. The durable notifications the
 * server writes remain the truth, and members still see everything when they
 * open Sakred; only the tap on the shoulder stops.
 */
export const PUSH_DELIVERY_ENABLED = true;

/** Stable id so re-scheduling replaces the reminder rather than stacking them. */
const DAILY_RITUAL_ID = 1;

/** Remembers that we asked, so a decline is not asked again on the next launch. */
const ASKED_KEY = "sakred.push.asked";

// ─── Taps ──────────────────────────────────────────────────────────────────

/**
 * Listen for notification taps, from the moment the app has JavaScript.
 *
 * Registered at boot and not behind permission or sign-in, because a tap is the
 * *first* thing that happens on a cold start: the OS launches the app because
 * somebody tapped, and the event is delivered as soon as something is listening.
 * Register it late and the launch that mattered most is the one that lands on
 * the default screen.
 *
 * This only records where to go. It never navigates, never fetches, and never
 * decides anybody is allowed to see anything — see notificationRoutes.ts.
 */
export async function installNotificationTapRouting(): Promise<void> {
  if (!isNative()) return;

  await ensureCoachingChannel();

  await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
    const data = (event.notification?.data ?? {}) as NotificationData;
    void rememberDestination(destinationFor(data, currentViewer()));
  });

  /**
   * Arriving while the app is open.
   *
   * Deliberately does not show anything. The screen the member is looking at is
   * more current than any banner we could raise over it, and a notification
   * about the conversation already on screen is noise. What it does do is
   * refresh the counts, so the badge agrees with what just arrived rather than
   * waiting out its stale window.
   */
  await FirebaseMessaging.addListener("notificationReceived", () => {
    for (const key of ["/api/notifications/unread-count", "/api/notifications"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  });
}

/**
 * One channel, named for what it actually is.
 *
 * Android 8+ gives the member the switches, not us: a channel is the unit they
 * can silence. One called "Sakred Coaching" is a decision they can make — mute
 * the coach, keep everything else — where four channels split across message,
 * check-in requested, check-in completed and plan activated would be four
 * decisions nobody asked for, about distinctions only the schema cares about.
 * If a real reason to separate them appears, splitting later is additive.
 *
 * Created here rather than in the manifest so the name and description sit
 * beside the rest of the notification copy. Creating a channel that already
 * exists is a no-op, and its importance cannot be raised afterwards — Android
 * hands that control to the member the moment it exists, which is the right
 * place for it.
 */
async function ensureCoachingChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    await LocalNotifications.createChannel({
      id: "coaching",
      name: "Sakred Coaching",
      description: "Messages from your coach, check-in requests, and plan changes.",
      // High, because these are person-to-person and time-bound: a coach's reply
      // batched until the next maintenance window is a reply that arrived
      // tomorrow. Matches the priority the server sends.
      importance: 4,
      // Shown on the lock screen, with content hidden when the member has asked
      // the system to hide sensitive notifications. The copy is already safe to
      // read over a shoulder; this respects the choice anyway.
      visibility: 0,
    });
  } catch {
    // An older device or a refused channel. Firebase falls back to its default
    // channel, which still delivers — the member simply gets one less switch.
  }
}

/**
 * Which side of a coaching relationship this device is on.
 *
 * Read from the cached account rather than the payload; the same event means
 * different things to each end, and the device knows which end it is. Defaults
 * to `member`, which is the larger population and the safer place to land.
 */
function currentViewer(): Viewer {
  const cached = queryClient.getQueryData<{ role?: string }>(["/api/auth/user"]);
  return viewerFromRole(cached?.role);
}

// ─── Permission ────────────────────────────────────────────────────────────

/** What the OS currently thinks, without asking it to prompt. */
export async function pushPermissionState(): Promise<"granted" | "denied" | "prompt"> {
  if (!isNative()) return "denied";
  try {
    const { receive } = await FirebaseMessaging.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "denied";
  }
}

/**
 * Have we already spent the one ask?
 *
 * iOS grants exactly one system prompt per install: after a decline, calling
 * `requestPermissions` again returns denied without showing anything. Asking
 * again is therefore not persistence, it is a no-op the member never sees — so
 * the only honest follow-up is a Settings link, offered once somewhere calm,
 * never a dialog on every launch.
 */
export async function hasAskedForPush(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const { value } = await Preferences.get({ key: ASKED_KEY });
    return value === "1";
  } catch {
    return false;
  }
}

/** Where a "not now" is remembered, so it means something. */
const DEFERRED_KEY = "sakred.push.deferred";
const DEFER_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * "Not now" has to actually mean not now.
 *
 * A dismissal that reappears on the next launch is the nag with better manners,
 * and it teaches people to dismiss without reading. Two weeks is long enough
 * that the next time is a fresh question rather than the same one repeated,
 * and the OS prompt has still not been spent — so it remains available if they
 * change their mind.
 */
export async function deferPushPrompt(): Promise<void> {
  try {
    await Preferences.set({ key: DEFERRED_KEY, value: String(Date.now()) });
  } catch {
    // The panel reappears next launch. Mildly annoying, never harmful.
  }
}

export async function pushPromptDeferred(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: DEFERRED_KEY });
    const at = Number(value);
    return Number.isFinite(at) && at > 0 && Date.now() - at < DEFER_MS;
  } catch {
    return false;
  }
}

async function markAsked(): Promise<void> {
  try {
    await Preferences.set({ key: ASKED_KEY, value: "1" });
  } catch {
    // A lost flag costs one extra prompt on a device that has already answered
    // it; `checkPermissions` above still prevents a second dialog appearing.
  }
}

/**
 * Ask for notification permission and register for remote push.
 *
 * Returns the FCM token, or null if the user declined or we're on web.
 * Call this *after* the member has seen why we want to notify them — both
 * stores treat a permission prompt on first launch as a dark pattern, and iOS
 * only ever lets you ask once.
 */
export async function initNativeNotifications(): Promise<string | null> {
  if (!isNative()) return null;
  // Deliberate. See PUSH_DELIVERY_ENABLED — do not remove this to "turn
  // notifications on"; there is nothing on the other end yet.
  if (!PUSH_DELIVERY_ENABLED) return null;

  // Asking a device that has already refused shows nothing and returns denied,
  // so the only effect of trying again is to hide that fact from us.
  if ((await pushPermissionState()) === "denied") return null;

  // Recorded before the prompt, not after. If the app is killed mid-dialog, the
  // ask has still been spent, and a flag written only on success would send us
  // back to a prompt the OS will never show again.
  await markAsked();

  // Local and remote permissions are separate grants on iOS; Android 13+
  // funnels both through the single POST_NOTIFICATIONS runtime permission.
  const local = await LocalNotifications.requestPermissions();
  if (local.display !== "granted") return null;

  const remote = await FirebaseMessaging.requestPermissions();
  if (remote.receive !== "granted") return null;

  // On iOS this resolves only once APNs registration has come back, which is
  // why it can reject on a device with no network even when permission is
  // granted. A null token is recoverable — the tokenReceived listener below
  // will deliver one later.
  let token: string | null = null;
  try {
    ({ token } = await FirebaseMessaging.getToken());
  } catch {
    token = null;
  }

  // FCM rotates tokens (reinstall, restore from backup, ~monthly refresh). A
  // token captured once at login goes stale silently, and stale tokens fail
  // delivery without erroring, so we re-register on every rotation.
  await FirebaseMessaging.addListener("tokenReceived", ({ token: fresh }) => {
    void registerPushToken(fresh);
  });

  if (token) await registerPushToken(token);
  return token;
}

/**
 * Hand the token to the server so it can be stored against the member.
 *
 * ── Why this must be `apiFetch` and not `fetch` ───────────────────────────
 *
 * It used to be a bare `fetch(apiUrl(...))`, which looked fine and could never
 * have worked. Native builds authenticate with a bearer token — the session
 * cookie cannot ride cross-site from `capacitor://localhost`, and WebKit drops
 * it regardless — and the global fetch patch that adds that header only touches
 * *relative* `/api/...` paths. `apiUrl()` had already made this one absolute,
 * so it sailed past the patch and arrived at an `isAuthenticated` route with no
 * credentials at all. Every registration would have 401'd, inside a catch that
 * said nothing.
 *
 * The endpoint upserts on the token, so several devices per member is the
 * normal case and a resold phone re-points to whoever is signed in now.
 */
async function registerPushToken(token: string): Promise<void> {
  try {
    const res = await apiFetch("/api/notifications/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    });
    // Status only, never the token — a push token in a log is a way to send a
    // member notifications. A silent failure here is a device that quietly
    // never receives anything, which is exactly the bug that hid for months.
    if (!res.ok) console.warn(`push registration failed: ${res.status}`);
  } catch {
    // Offline at launch is normal. The tokenReceived listener re-fires on the
    // next rotation, and login re-runs init, so this self-heals.
  }
}

/**
 * Detach this device on sign-out.
 *
 * Without it a shared or resold phone keeps a token pointed at whoever signed
 * in last, and the next person's coach messages arrive on it. That is the one
 * notification failure that is a privacy incident rather than an inconvenience,
 * and the server route for it has existed with nothing calling it.
 *
 * Called before the bearer token is cleared, because the route is
 * authenticated — after, and it silently 401s.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!isNative()) return;
  try {
    const { token } = await FirebaseMessaging.getToken();
    if (!token) return;
    const res = await apiFetch("/api/notifications/token", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) console.warn(`push unregistration failed: ${res.status}`);
  } catch {
    // No token to remove, or offline. The server also re-points a token to
    // whoever registers it next, so this is a belt to that brace.
  }
}

/**
 * Schedule the daily protocol reminder at a wall-clock time.
 *
 * `repeats: true` with `on: { hour, minute }` gives a daily recurrence that
 * survives reboot (the plugin declares RECEIVE_BOOT_COMPLETED).
 *
 * We deliberately do not request SCHEDULE_EXACT_ALARM. Android 12+ restricts
 * it to alarm-clock and calendar apps, and Play review asks a wellness app to
 * justify it. A reminder that lands within the OS's batching window is fine
 * for this; an exact-alarm declaration is a review risk for no benefit.
 */
export async function scheduleDailyRitual(hour: number, minute = 0): Promise<void> {
  if (!isNative()) return;

  await LocalNotifications.cancel({ notifications: [{ id: DAILY_RITUAL_ID }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_RITUAL_ID,
        title: "Your protocol is waiting",
        body: "A few minutes with the practice you set for yourself.",
        schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
      },
    ],
  });
}

export async function cancelDailyRitual(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_RITUAL_ID }] });
}
