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
import { morningBody } from "./morningNoticeContent";

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
      apiFetch("/api/health/summary?days=30").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    const habitCount: number = Array.isArray(habits?.habits) ? habits.habits.length : 0;

    // dayOffset 0 — the widget shows TODAY, where the notification is written
    // the night before for tomorrow. Same rules, different day.
    const content = morningBody(routine, habitCount, 0);

    const days: { sleepMinutes?: number }[] = Array.isArray(health?.days) ? health.days : [];
    const slept = days.map((d) => d.sleepMinutes).filter((v): v is number => typeof v === "number");
    const last = slept.length ? slept[slept.length - 1] : null;
    const baseline = slept.length >= 3 ? slept.reduce((a, b) => a + b, 0) / slept.length : null;

    let sleepNote: string | null = null;
    if (last !== null && baseline) {
      const delta = (last - baseline) / baseline;
      // Same 8% floor as the notification. Two surfaces disagreeing about
      // whether last night was unusual is worse than neither mentioning it.
      if (Math.abs(delta) >= 0.08) {
        sleepNote = delta > 0 ? "more than usual" : "under your usual";
      } else {
        sleepNote = "about your usual";
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
