/**
 * Handing the home-screen widget its next frame.
 *
 * The widget renders in the launcher's process (Android) or its own extension
 * (iOS). It has no network, no WebView, and no way to call the API. Everything
 * it will ever show is the small blob written here, already formatted — there
 * is nobody on the other side to format it.
 *
 * Called after each sync, which is also when the numbers changed.
 */

import { Capacitor } from "@capacitor/core";
import { apiFetch } from "./apiFetch";
import { morningBody, sleepAgainst } from "./morningNoticeContent";
import { HEALTH_WINDOW_DAYS } from "./morningNotice";

function hoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

export async function updateWidget(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const { HealthSync } = await import("@sakred/health-sync");

    const [routine, habits, health] = await Promise.all([
      apiFetch("/api/routines/active").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch("/api/habits/today").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch(`/api/health/summary?days=${HEALTH_WINDOW_DAYS}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    const habitCount: number = Array.isArray(habits?.habits) ? habits.habits.length : 0;

    // dayOffset 0 — the widget shows TODAY, where the notification is written
    // the night before for tomorrow. Same rules, different day.
    const content = morningBody(routine, habitCount, 0);

    // Through the shared helper, which excludes the night being judged from its
    // own baseline. This file had its own copy that averaged it in, so a short
    // night was measured partly against itself and read less short than it was.
    const days: { sleepMinutes?: number }[] = Array.isArray(health?.days) ? health.days : [];
    const { lastNight: last, baseline, baselineDays } = sleepAgainst(days, HEALTH_WINDOW_DAYS);

    let sleepNote: string | null = null;
    if (last !== null && baseline) {
      const delta = (last - baseline) / baseline;
      // Same 8% floor as the notification. Two surfaces disagreeing about
      // whether last night was unusual is worse than neither mentioning it.
      //
      // The window is named even here, where space is tightest: "under your
      // usual" on a home-screen widget is the shortest possible way to be
      // unfalsifiable, and this is the surface a member sees most often.
      const against = `your ${baselineDays}-day average`;
      if (Math.abs(delta) >= 0.08) {
        sleepNote = delta > 0 ? `more than ${against}` : `under ${against}`;
      } else {
        sleepNote = `about ${against}`;
      }
    }

    await HealthSync.updateWidget({
      title: content?.title ?? "Sakred Body",
      practices: content?.body ?? "",
      sleep: last !== null ? hoursMinutes(last) : null,
      sleepNote,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch {
    // A widget that fails to update is not a reason to surface anything to the
    // member — it keeps its last frame, and says so once it goes stale.
    return false;
  }
}
