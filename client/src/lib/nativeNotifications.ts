import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { apiFetch } from "./apiFetch";

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
 * Remote push is not enabled, and asking for permission would be dishonest.
 *
 * ── What is missing, precisely ────────────────────────────────────────────
 *
 *   · No Firebase server credentials — nothing can send.
 *   · iOS ships `aps-environment: development`, so no TestFlight or App Store
 *     build would receive a push even if something could send one.
 *   · No delivery adapter on the server.
 *   · No notification-tap handling in either shell, so a tap can only
 *     cold-open the app.
 *
 * iOS lets an app ask exactly once, ever. Spending that on a prompt that
 * cannot be honoured — "Allow Sakred to send notifications?" followed by
 * nothing, forever — costs the permission and the member's trust in the same
 * moment, and it cannot be taken back.
 *
 * The registration path below is built and correct so that flipping this is a
 * one-line change once delivery genuinely exists. Until then the durable
 * notifications the server writes are the truth, and members see them when
 * they open Sakred.
 */
export const PUSH_DELIVERY_ENABLED = false;

/** Stable id so re-scheduling replaces the reminder rather than stacking them. */
const DAILY_RITUAL_ID = 1;

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
