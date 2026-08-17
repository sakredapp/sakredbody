/**
 * Health data — client state.
 *
 * The read hooks work everywhere, including the web portal: once a phone has
 * synced, the numbers are ours and a laptop can display them. Only the sync
 * itself is native-only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { track } from "@/lib/track";
import {
  resolveConnection,
  resolveHealthView,
  type ConnectionState,
  type HealthView,
} from "@/lib/healthState";
import {
  beginHealthTrace,
  flushHealthTrace,
  markHealth,
  noteHealth,
} from "@/lib/healthTrace";
import { HealthOrchestrator } from "@/lib/healthOrchestrator";
import {
  disableBackgroundSync,
  enableBackgroundSync,
  healthAvailability,
  healthPlatform,
  healthProbeDetail,
  requestHealthAccess,
  syncHealth,
} from "@/lib/health";
import type { SyncResult } from "@/lib/health";
import type { HealthMetric, HealthWorkout } from "@shared/schema";
import type { WorkoutPlacement, WorkoutResponse } from "@shared/models/training";

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
  const query = useQuery<HealthSummary>({
    queryKey: [`/api/health/summary?days=${days}`],
  });
  // Marked from the hook rather than from inside a queryFn, because the
  // question being timed is when the *screen* asked and when the screen could
  // have drawn — not when some fetch happened to be issued.
  if (query.isFetching) markHealth("persisted_summary_started");
  if (query.isFetched) markHealth("persisted_summary_resolved");
  return query;
}

/** The same view, for a member a coach is looking at. */
export function useMemberHealth(userId: string | null, days = 30) {
  return useQuery<HealthSummary>({
    queryKey: [`/api/admin/health/${userId}/summary?days=${days}`],
    enabled: Boolean(userId),
  });
}

/**
 * Answering "how did that land", or moving a session to the other side.
 *
 * Optimistic, because the whole point of the control is that it costs nothing:
 * a member taps "Restored me" and it is simply true on screen. Waiting for a
 * round trip turns a one-tap aside into an operation, and a failed round trip
 * that has already been reflected is corrected on the next read anyway.
 *
 * Both fields distinguish `undefined` from `null` all the way down. Leaving a
 * field out means "don't touch it"; sending null clears it — which is how a
 * member takes an answer back rather than being stuck with their first tap.
 */
export function useWorkoutFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      response?: WorkoutResponse | null;
      placement?: WorkoutPlacement | null;
    }) => {
      const { id, ...body } = input;
      const res = await apiRequest("PATCH", `/api/health/workouts/${id}`, body);
      return (await res.json()) as HealthWorkout;
    },
    onMutate: async ({ id, response, placement }) => {
      const matches = (key: unknown) => String(key ?? "").startsWith("/api/health/summary");
      await queryClient.cancelQueries({ predicate: (q) => matches(q.queryKey[0]) });

      queryClient.setQueriesData<HealthSummary>(
        { predicate: (q) => matches(q.queryKey[0]) },
        (old) =>
          old
            ? {
                ...old,
                workouts: old.workouts.map((w) =>
                  w.id === id
                    ? {
                        ...w,
                        userResponse: response === undefined ? w.userResponse : response,
                        userOrientationOverride:
                          placement === undefined ? w.userOrientationOverride : placement,
                      }
                    : w,
                ),
              }
            : old,
      );
    },
    // Whatever happened, the server's copy is the one that counts. On success
    // this replaces a guess with the truth; on failure it puts back what the
    // member's tap had already overwritten on screen.
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/health/summary"),
      });
      // Placement changes what Restore and Build show, and the terrain read
      // still counts the session either way — but the screens have to catch up.
      queryClient.invalidateQueries({ queryKey: ["/api/terrain/today"] });
    },
  });
}

/**
 * Is a native store linked to this account?
 *
 * The authoritative read, and the only one. Every surface that needs to know
 * whether a member is connected asks this — never the summary, whose job is
 * to answer what data we hold. See `client/src/lib/healthState.ts` for what
 * conflating the two cost.
 */
export function useHealthStatus() {
  markHealth("status_started");
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
 * Connected, disconnected, still asking, or we could not find out.
 *
 * Four answers, because there are four. The old `data?.connected ?? false`
 * had room for two and therefore had to lie about half of them.
 */
export function useHealthConnection(): ConnectionState {
  const status = useHealthStatus();
  return resolveConnection({
    isLoading: status.isLoading,
    error: status.error,
    data: status.data,
  });
}

/**
 * Everything a health surface needs, resolved into one state it can switch on.
 *
 * The hook gathers; `resolveHealthView` decides. Keeping the decision in a
 * pure function is what lets the awkward timings be tested — a status that
 * answers in 50ms against a native sync that takes a minute is a two-line test
 * here and a stopwatch-and-a-phone exercise otherwise.
 *
 * `available` comes from the shared probe. It is only ever consulted to choose
 * between "connect this phone" and "health only reads on a phone", and never
 * to decide whether persisted data may be drawn.
 */
export function useHealthView(days = 30) {
  const connection = useHealthConnection();
  const summary = useHealthSummary(days);
  const { available, reason, platform } = useHealthSync();

  const hasData = (summary.data?.days?.length ?? 0) > 0;
  const summarySettled = summary.isFetched;

  /*
    First paint of real data, timed once.

    Deliberately measured against `hasData` rather than against the query
    resolving: a summary that comes back empty is not the member seeing their
    body's record, and counting it as such would report a fast launch on
    exactly the phones where the complaint originated.
  */
  useEffect(() => {
    if (!hasData) return;
    markHealth("persisted_visible");
    noteHealth("persisted_data_present", true);
  }, [hasData]);

  useEffect(() => {
    if (connection === "unknown") return;
    markHealth("status_resolved");
    noteHealth("connection_present", connection === "connected");
  }, [connection]);

  const view = useMemo(
    () =>
      resolveHealthView({
        connection,
        available,
        hasData,
        refreshing: summary.isFetching,
        summarySettled,
      }),
    [connection, available, hasData, summary.isFetching, summarySettled],
  );

  return {
    view,
    connection,
    available,
    reason,
    platform,
    summary,
    days: summary.data?.days ?? [],
    workouts: summary.data?.workouts ?? [],
    connections: summary.data?.connections ?? [],
  };
}

export type { HealthView };

/**
 * The device probe, run once per app process rather than once per component.
 *
 * ── Why this moved to module scope ────────────────────────────────────────
 *
 * The probe used to live in `useHealthSync`'s mount effect, and five different
 * components call that hook — the Stats card, the settings panel, the home
 * swatches, onboarding, and the auto-sync hook itself. Each mount therefore
 * fired its own bridge call and its own `health.probe` event, which is why a
 * single member's telemetry showed eighteen probes from one session. That is
 * not merely noisy: on Android each probe is a real round trip to the Health
 * Connect app, they queue behind one another, and the answer is identical
 * every time because the question — "does this device have a health store" —
 * cannot change while the app is running.
 *
 * So the work is done once and everyone shares the result. A promise is the
 * natural shape: callers arriving during the probe await the same one, and
 * callers arriving after it get a resolved value immediately with no second
 * effect and no second render.
 */
let probe: Promise<{ available: boolean; reason?: string }> | null = null;

function nativeAvailability(): Promise<{ available: boolean; reason?: string }> {
  if (probe) return probe;

  markHealth("native_probe_started");

  /**
   * The diagnostic probe is fired independently of the answer, not inside it.
   *
   * It used to sit in the `.then()` of `healthAvailability()`, which meant the
   * one piece of evidence that would explain a broken probe could only be
   * recorded when the probe worked. It never fired once, on any device, ever —
   * and that absence turned out to *be* the finding: the call was hanging
   * rather than failing. Instrumentation that can only report success is not
   * instrumentation.
   *
   * Only on a phone: a browser reporting "not a phone app" is noise.
   */
  if (Capacitor.isNativePlatform()) {
    /**
     * Reported whatever happens, including nothing happening.
     *
     * Two rounds of fixes went in and this event still never arrived — and an
     * absent event cannot distinguish "the code did not run" from "the code
     * ran and hung" from "the send failed". Racing it against a timer removes
     * the first two possibilities: something is always posted, and `stage`
     * says how far it got.
     */
    const progress = { stage: "start" };
    const stalled = new Promise<Record<string, unknown>>((resolve) =>
      setTimeout(() => resolve({ stage: `stalled:${progress.stage}` }), 6_000),
    );
    void Promise.race([
      healthProbeDetail(progress).then((d) => ({ stage: "resolved", ...d })),
      stalled,
    ])
      .catch((err) => ({ stage: "threw", error: String(err?.message ?? err) }))
      .then((props) =>
        track("health.probe", {
          surface: "health",
          props: { ...props, platform: Capacitor.getPlatform() },
        }),
      );
  }

  probe = healthAvailability()
    .then((a) => ({ available: a.available, reason: a.reason }))
    // `available` staying null is the state that hid this feature on every
    // device: null reads as "still deciding", and everything downstream waits
    // politely and forever. A rejection is a definite no.
    .catch((err) => ({ available: false, reason: String(err?.message ?? err) }))
    .then((a) => {
      markHealth("native_probe_resolved");
      noteHealth("native_available", a.available);
      return a;
    });

  return probe;
}

/** Test seam, and what a disconnect uses so a reconnect re-asks the device. */
export function resetHealthProbe(): void {
  probe = null;
}

/**
 * Connect, sync, and disconnect.
 *
 * `available` is resolved from the shared probe rather than assumed from the
 * platform: an Android phone can be a native shell and still have no Health
 * Connect provider installed, and the difference is the whole message we show.
 */
export function useHealthSync() {
  const queryClient = useQueryClient();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | undefined>();
  const platform = healthPlatform();

  useEffect(() => {
    let alive = true;
    void nativeAvailability().then((a) => {
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
/**
 * The one native refresh this app process may have in flight.
 *
 * Module scope rather than a ref, because the triggers outlive any single
 * component and a per-instance guard cannot see the other instances. The logic
 * itself lives in `healthOrchestrator.ts`, where it can be tested against
 * three simultaneous triggers without a phone.
 */
const native = new HealthOrchestrator();

/** Test seam. A fresh process has never synced. */
export function resetHealthOrchestrator(): void {
  native.reset();
}

/**
 * Read back what the server already holds.
 *
 * ── Independent of the native store, on purpose ───────────────────────────
 *
 * Two things write health data and only one of them is this webview: the
 * native worker posts from a background wake, so the database can move while
 * the app sits suspended. `staleTime: Infinity` then keeps whatever was read
 * at open for the life of the process, so nothing expires it — which is how a
 * member ends up staring at a number that is not merely stale but known to be
 * wrong.
 *
 * The important property is what this function does *not* wait for. It does
 * not wait for the bridge, the probe, permissions, or a sync. These rows were
 * normalised by our own server and belong to the account, not to the device;
 * a laptop with no health store at all displays them correctly. Making them
 * wait behind a native probe is what turned a slow sync into a blank screen.
 */
function hydrate(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  markHealth("hydrate_started");
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/health/status"] }),
    queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/health/summary"),
    }),
    // Terrain reads the same normalized rows, so it is part of hydration
    // rather than something to refresh afterwards. It is the canonical server
    // computation — there is no second client-side one and there must not be.
    queryClient.invalidateQueries({ queryKey: ["/api/terrain/today"] }),
  ]).then(() => {
    markHealth("hydrate_resolved");
  });
}

/**
 * Ask the phone for anything new — at most one run at a time.
 *
 * The throttle stays: a member switching to Messages and back would otherwise
 * re-read the window on every return, which on Android is slow enough to feel
 * like a frozen screen. What changed is that the throttle no longer decides
 * whether the *screen* updates, only whether the *phone* is read. Those were
 * the same decision before, and that is why a throttled return left the member
 * looking at a value the server had already corrected.
 */
function refreshNative(
  queryClient: ReturnType<typeof useQueryClient>,
  sync: () => Promise<unknown>,
  trigger: string,
): Promise<unknown> {
  return native.refresh({
    trigger,
    sync: () => {
      markHealth("native_sync_started");
      return sync().then((r) => {
        markHealth("native_sync_resolved");
        return r;
      });
    },
    hydrate: () => {
      markHealth("invalidation_started");
      // The sync's own onSuccess already invalidates; this also covers the
      // failure path, where a partial write still moved rows we are showing.
      return hydrate(queryClient).then(() => {
        markHealth("invalidation_resolved");
        // The refetch has settled, so whatever the phone just contributed is
        // now on screen. This is the "fresh values visible" number, measured
        // rather than assumed from when the upload returned.
        markHealth("refreshed_summary_visible");
        flushHealthTrace("native_refresh_complete");
      });
    },
    onStart: (t) => noteHealth("native_refresh_trigger", t),
    onJoin: () => noteHealth("native_refresh_joined_existing", true),
  });
}

/**
 * Two independent startups, which is the whole point.
 *
 *   hydrate        — status, persisted summary, terrain. Starts immediately.
 *   refreshNative  — probe, permissions, native reads, upload. Starts when the
 *                    bridge is ready, and is allowed to take as long as it
 *                    takes without anything on screen waiting for it.
 *
 * Previously these were one effect gated on `available`, so the dependency
 * chain read: probe → sync → refresh → *finally* show the data we already had.
 * Every stage of a native round trip sat between the member and rows that were
 * sitting in Postgres the whole time.
 */
export function useHealthAutoSync(enabled = true) {
  const { available, sync } = useHealthSync();
  const queryClient = useQueryClient();

  // ── Hydration. No native gate, deliberately. ──
  useEffect(() => {
    if (!enabled) return;
    beginHealthTrace();
    noteHealth("platform", Capacitor.getPlatform());

    hydrate(queryClient);

    const onVisible = () => {
      if (document.visibilityState === "visible") hydrate(queryClient);
    };
    document.addEventListener("visibilitychange", onVisible);

    let cancelled = false;
    let remove: (() => void) | null = null;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) hydrate(queryClient);
        }),
      )
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
  }, [enabled, queryClient]);

  // ── The native half, gated on the bridge because it genuinely needs it. ──
  useEffect(() => {
    if (!enabled || !available) return;
    let cancelled = false;

    const run = (trigger: string) => {
      if (cancelled) return;
      void refreshNative(queryClient, () => sync.mutateAsync(), trigger);
    };

    run("mount");

    const onVisible = () => {
      if (document.visibilityState === "visible") run("visibility");
    };
    document.addEventListener("visibilitychange", onVisible);

    // Dynamically imported so the web bundle never carries the native shim.
    // The listener handle arrives asynchronously, which means an unmount can
    // land before it does — hence `cancelled`, or we would leak a listener
    // that fires against a dead component every time the app resumes.
    let remove: (() => void) | null = null;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) run("appState");
        }),
      )
      .then((handle) => {
        if (cancelled) handle.remove();
        else remove = () => handle.remove();
      })
      .catch(() => {});

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
