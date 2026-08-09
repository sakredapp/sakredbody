import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { apiUrl } from "./apiBase";

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
 * NOTE: POST /api/notifications/token does not exist yet — see the note in
 * this file's PR. It needs to upsert (user_id, token, platform) and must be
 * keyed on the token, since one member can hold several devices.
 */
async function registerPushToken(token: string): Promise<void> {
  try {
    await fetch(apiUrl("/api/notifications/token"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    });
  } catch {
    // Offline at launch is normal. The tokenReceived listener re-fires on the
    // next rotation, and login re-runs init, so this self-heals.
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
