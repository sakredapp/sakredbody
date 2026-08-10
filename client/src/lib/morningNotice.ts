/**
 * The morning notification, carrying something worth reading.
 *
 * A notification that says "Open Sakred Body" is an advert for an app the
 * member already installed. This one carries the day itself: where they are in
 * their protocol, and how many practices are waiting. If it does not say
 * something they could not have guessed, it should not fire.
 *
 * LOCAL, not push. Three reasons:
 *
 *   1. It needs no server, no FCM round trip, and no device token — so it
 *      works for a member who never granted push, and on a build where the
 *      Firebase config is missing.
 *   2. It fires at the member's own 7am, not the server's. A cron would have
 *      to know every member's timezone and schedule per zone; the device
 *      already knows.
 *   3. server/notifications is the other session's file this week.
 *
 * The cost of local is that the content is decided in advance, so tomorrow's
 * banner is written from what we know today. Everything it says is stable
 * overnight — a protocol's day number advances predictably, and the practices
 * assigned to a member do not change while they sleep.
 */

import { Capacitor } from "@capacitor/core";
import { apiFetch } from "./apiFetch";
import {
  morningNotice,
  morningDates,
  NOTIFICATION_ID,
  DAYS_AHEAD,
  type NoticeDepth,
} from "./morningNoticeContent";

const DEPTH_KEY = "sakred.notice.depth";

/** What the member chose. Defaults to brief — the least they could have meant. */
export function getNoticeDepth(): NoticeDepth {
  try {
    const raw = localStorage.getItem(DEPTH_KEY);
    return raw === "off" || raw === "full" || raw === "brief" ? raw : "brief";
  } catch {
    return "brief";
  }
}

export function setNoticeDepth(depth: NoticeDepth): void {
  try {
    localStorage.setItem(DEPTH_KEY, depth);
  } catch {
    /* the default stands */
  }
}

/**
 * Ask, schedule, and replace whatever was scheduled before.
 *
 * Safe to call on every app open — that is how the content stays current, and
 * the fixed id is what stops it stacking up.
 */
export async function scheduleMorningNotice(): Promise<{ scheduled: number; reason?: string }> {
  if (!Capacitor.isNativePlatform()) return { scheduled: 0, reason: "web" };

  let LocalNotifications;
  try {
    ({ LocalNotifications } = await import("@capacitor/local-notifications"));
  } catch {
    return { scheduled: 0, reason: "plugin unavailable" };
  }

  try {
    // Never prompt here. Asking for notification permission the moment the app
    // opens is the ask people refuse; this only schedules if they have already
    // said yes somewhere it was explained.
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return { scheduled: 0, reason: "not granted" };

    const depth = getNoticeDepth();
    if (depth === "off") {
      // Still cancel — a member switching to "off" must stop getting the ones
      // already scheduled, which are sitting on the device, not the server.
      await LocalNotifications.cancel({
        notifications: morningDates(new Date(), DAYS_AHEAD).map((_, i) => ({
          id: NOTIFICATION_ID + i,
        })),
      }).catch(() => {});
      return { scheduled: 0, reason: "off" };
    }

    const [routine, habits, health] = await Promise.all([
      apiFetch("/api/routines/active")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      apiFetch("/api/habits/today")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // Only the full brief needs this, so only the full brief pays for it.
      depth === "full"
        ? apiFetch("/api/health/summary?days=30")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const habitCount: number = Array.isArray(habits?.habits) ? habits.habits.length : 0;

    // Last night, and their own average to read it against.
    const days: { sleepMinutes?: number }[] = Array.isArray(health?.days) ? health.days : [];
    const slept = days.map((d) => d.sleepMinutes).filter((v): v is number => typeof v === "number");
    const sleepMinutes = slept.length ? slept[slept.length - 1] : null;
    const sleepBaseline = slept.length >= 3 ? slept.reduce((a, b) => a + b, 0) / slept.length : null;

    // Cancel first, always — including when there is nothing to say. A member
    // who finishes a protocol should stop getting yesterday's banner.
    await LocalNotifications.cancel({
      notifications: morningDates(new Date(), DAYS_AHEAD).map((_, i) => ({
        id: NOTIFICATION_ID + i,
      })),
    }).catch(() => {});

    const dates = morningDates(new Date(), DAYS_AHEAD);
    const notifications = dates
      .map((at, i) => {
        const content = morningNotice(
          { routine, habitCount, sleepMinutes, sleepBaseline },
          depth,
          i + 1,
        );
        if (!content) return null;
        return {
          id: NOTIFICATION_ID + i,
          title: content.title,
          body: content.body,
          schedule: { at, allowWhileIdle: true },
        };
      })
      .filter(Boolean) as {
      id: number;
      title: string;
      body: string;
      schedule: { at: Date; allowWhileIdle: boolean };
    }[];

    if (!notifications.length) return { scheduled: 0, reason: "nothing worth saying" };

    await LocalNotifications.schedule({ notifications });
    return { scheduled: notifications.length };
  } catch (err) {
    return { scheduled: 0, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Ask for permission. Called from Settings, where the member chose to. */
export async function requestMorningNotice(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const res = await LocalNotifications.requestPermissions();
    if (res.display !== "granted") return false;
    await scheduleMorningNotice();
    return true;
  } catch {
    return false;
  }
}
