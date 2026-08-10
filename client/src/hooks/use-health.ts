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
import { healthAvailability, healthPlatform, requestHealthAccess, syncHealth } from "@/lib/health";
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
      return syncHealth();
    },
    onSuccess: invalidate,
  });

  const sync = useMutation<SyncResult>({
    mutationFn: syncHealth,
    onSuccess: invalidate,
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/health/connection");
      return res.json();
    },
    onSuccess: invalidate,
  });

  return { available, reason, platform, connect, sync, disconnect };
}

/**
 * Sync once when the app comes to the foreground, at most every SYNC_MIN_MS.
 *
 * Neither plugin path gives us background delivery, so "when they open the
 * app" is the only moment we have. The throttle exists because a member
 * switching to Messages and back would otherwise re-read ninety days of
 * samples on every return, which on Android is slow enough to feel like a
 * frozen screen.
 */
const SYNC_MIN_MS = 15 * 60 * 1000;

export function useHealthAutoSync(enabled = true) {
  const lastRun = useRef(0);
  const running = useRef(false);
  const { available, sync } = useHealthSync();

  useEffect(() => {
    if (!enabled || !available) return;

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
    return () => document.removeEventListener("visibilitychange", onVisible);
    // `sync` is a stable mutation object from react-query; including it would
    // re-subscribe on every render and defeat the throttle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, available]);
}
