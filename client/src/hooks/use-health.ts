/**
 * Health data — client state.
 *
 * The read hooks work everywhere, including the web portal: once a phone has
 * synced, the numbers are ours and a laptop can display them. Only the sync
 * itself is native-only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  disableBackgroundSync,
  enableBackgroundSync,
  healthAvailability,
  healthPlatform,
  requestHealthAccess,
  syncHealth,
} from "@/lib/health";
import type { SyncResult } from "@/lib/health";
import type { HealthMetric, HealthWorkout } from "@shared/schema";

export type HealthDay = { onDate: string } & Partial<Record<HealthMetric, number>>;

export type HealthSummary = {
  days: HealthDay[];
  workouts: HealthWorkout[];
  connected: boolean;
  connections: {
    platform: string;
    lastSyncAt: string | null;
    lastSyncCount: number;
    grantedMetrics: string[];
    deviceModel: string | null;
  }[];
  metrics: string[];
};

export function useHealthSummary(days = 30) {
  return useQuery<HealthSummary>({
    queryKey: [`/api/health/summary?days=${days}`],
  });
}

/** The same view, for a member a coach is looking at. */
export function useMemberHealth(userId: string | null, days = 30) {
  return useQuery<HealthSummary>({
    queryKey: [`/api/admin/health/${userId}/summary?days=${days}`],
    enabled: Boolean(userId),
  });
}

export function useHealthStatus() {
  return useQuery<{
    connected: boolean;
    overlapDays: number;
    initialBackfillDays: number;
    connections: {
      platform: string;
      syncedThrough: string | null;
      lastSyncAt: string | null;
      lastSyncCount: number;
      lastError: string | null;
      grantedMetrics: string[];
      deviceModel: string | null;
      osVersion: string | null;
    }[];
  }>({
    queryKey: ["/api/health/status"],
  });
}

/**
 * Connect, sync, and disconnect.
 *
 * `available` is resolved once on mount rather than assumed from the platform:
 * an Android phone can be a native shell and still have no Health Connect
 * provider installed, and the difference is the whole message we show.
 */
export function useHealthSync() {
  const queryClient = useQueryClient();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | undefined>();
  const platform = healthPlatform();

  useEffect(() => {
    let alive = true;
    healthAvailability().then((a) => {
      if (!alive) return;
      setAvailable(a.available);
      setReason(a.reason);
    });
    return () => {
      alive = false;
    };
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/health/status"] });
    queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/health/summary"),
    });
  }, [queryClient]);

  const connect = useMutation<SyncResult>({
    mutationFn: async () => {
      await requestHealthAccess();
      const result = await syncHealth();
      // Enabled after the first sync, not before it. Registering observers
      // against types the member just declined is how an app ends up woken
      // repeatedly to post nothing.
      await enableBackgroundSync();
      return result;
    },
    onSuccess: invalidate,
  });

  const sync = useMutation<SyncResult>({
    mutationFn: syncHealth,
    onSuccess: invalidate,
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      // Stop the background worker FIRST. Deleting the rows while a run is
      // still scheduled means the next wake re-posts the same week, and the
      // member watches the data they just deleted come back.
      await disableBackgroundSync();
      const res = await apiRequest("DELETE", "/api/health/connection");
      return res.json();
    },
    onSuccess: invalidate,
  });

  return { available, reason, platform, connect, sync, disconnect };
}

/**
 * Sync whenever the app becomes active, at most every SYNC_MIN_MS.
 *
 * This is no longer the only moment we sync — @sakred/health-sync posts from a
 * background wake as well — but it is still the one that matters most, because
 * it is the only one guaranteed to happen. iOS coalesces background delivery
 * and Android's worker runs when Doze permits, so the foreground path is what
 * makes the numbers current at the moment a member is actually looking.
 *
 * Two listeners, not one, because they are not the same event:
 *
 *   appStateChange  — Capacitor's native signal, from applicationDidBecomeActive
 *                     on iOS and onResume on Android. This is the reliable one
 *                     in the shells.
 *   visibilitychange — the web signal. Correct in a browser, and on iOS it also
 *                     fires for things that are not a real return to the app:
 *                     pulling down Notification Centre, or the app switcher
 *                     card. Kept as the fallback so the web portal still
 *                     refreshes, since WKWebView's visibility handling has
 *                     never been something to depend on alone.
 *
 * Both funnel into the same throttled `run`, so double-firing costs nothing.
 *
 * The throttle exists because a member switching to Messages and back would
 * otherwise re-read ninety days of samples on every return, which on Android is
 * slow enough to feel like a frozen screen.
 */
const SYNC_MIN_MS = 15 * 60 * 1000;

export function useHealthAutoSync(enabled = true) {
  const lastRun = useRef(0);
  const running = useRef(false);
  const { available, sync } = useHealthSync();

  useEffect(() => {
    if (!enabled || !available) return;
    let cancelled = false;

    const run = () => {
      const now = Date.now();
      if (running.current || now - lastRun.current < SYNC_MIN_MS) return;
      running.current = true;
      lastRun.current = now;
      sync.mutateAsync().finally(() => {
        running.current = false;
      });
    };

    run();

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Dynamically imported so the web bundle never carries the native shim.
    // The listener handle arrives asynchronously, which means an unmount can
    // land before it does — hence `cancelled`, or we would leak a listener
    // that fires against a dead component every time the app resumes.
    let remove: (() => void) | null = null;
    import("@capacitor/app")
      .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) run();
      }))
      .then((handle) => {
        if (cancelled) handle.remove();
        else remove = () => handle.remove();
      })
      .catch(() => {
        // Web, or the plugin is absent. visibilitychange already covers it.
      });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      remove?.();
    };
    // `sync` is a stable mutation object from react-query; including it would
    // re-subscribe on every render and defeat the throttle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, available]);
}
