/**
 * The bridge to Apple Health and Health Connect.
 *
 * Native only. On the web every function here resolves to "unavailable"
 * rather than throwing — the portal is one build served to a browser and
 * wrapped in two app shells, and a browser genuinely cannot read HealthKit.
 * The Stats screen shows whatever the phone last synced; it does not pretend
 * it could sync itself.
 *
 * The plugin is loaded with a dynamic import so it never enters the web
 * entry chunk. It is ~40kB of bridge code that can only ever no-op there.
 */

import { Capacitor } from "@capacitor/core";
import { apiRequest } from "./queryClient";
import {
  METRIC_PLANS,
  READ_TYPES,
  foldSleep,
  localDate,
  toCanonical,
  type CanonicalSample,
} from "./healthMetrics";

/** Mirrors the server's constants; the server is authoritative and sends them. */
const FALLBACK_OVERLAP_DAYS = 7;
const FALLBACK_BACKFILL_DAYS = 90;
/** One POST body. See the note on healthSyncSchema — a mobile network drops big ones. */
const PAGE = 1_000;

export type HealthPlatform = "healthkit" | "healthconnect";

export function healthPlatform(): HealthPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const p = Capacitor.getPlatform();
  if (p === "ios") return "healthkit";
  if (p === "android") return "healthconnect";
  return null;
}

type Plugin = typeof import("@capgo/capacitor-health").Health;

let cached: Plugin | null = null;
async function plugin(): Promise<Plugin | null> {
  if (!healthPlatform()) return null;
  if (cached) return cached;
  try {
    const mod = await import("@capgo/capacitor-health");
    cached = mod.Health;
    return cached;
  } catch (err) {
    console.warn("[health] plugin unavailable", err);
    return null;
  }
}

export type HealthAvailability = {
  available: boolean;
  platform: HealthPlatform | null;
  /** Android: Health Connect can be absent on older devices and is installable. */
  reason?: string;
};

export async function healthAvailability(): Promise<HealthAvailability> {
  const platform = healthPlatform();
  if (!platform) return { available: false, platform: null, reason: "Not a phone app." };
  const p = await plugin();
  if (!p) return { available: false, platform, reason: "Health plugin failed to load." };
  try {
    const res = await p.isAvailable();
    return { available: res.available, platform, reason: res.reason };
  } catch (err) {
    return { available: false, platform, reason: String(err) };
  }
}

/**
 * Ask for access. Returns what was granted.
 *
 * Read-only: we ask for nothing writable. Writing into someone's Health app
 * is a much larger promise than we make — it puts our numbers in front of
 * their doctor — and both stores ask why you want write access when you
 * request it. `write: []` is the honest answer and the easier review.
 *
 * On iOS a "denied" read is indistinguishable from "no data", by design, so
 * `readAuthorized` here should be read as "asked for", not "granted".
 */
export async function requestHealthAccess(): Promise<{
  granted: string[];
  denied: string[];
  historyAccess?: boolean;
}> {
  const p = await plugin();
  if (!p) return { granted: [], denied: [] };
  const status = await p.requestAuthorization({
    read: READ_TYPES as never[],
    write: [],
    // Health Connect caps reads at ~30 days without this, which would make an
    // Android member's first sync three months shorter than an iPhone's.
    requestHistoryAccess: true,
  });
  return {
    granted: status.readAuthorized ?? [],
    denied: status.readDenied ?? [],
    historyAccess: status.historyAccessAuthorized,
  };
}

/**
 * Hand the native side what it needs to post on its own.
 *
 * Called on every sync rather than once at connect time, because the token
 * rotates. A background worker holding a token from ninety days ago posts into
 * a 401 forever, and the only symptom is data quietly stopping — so the cheap
 * refresh on every foreground sync is worth more than the call it costs.
 *
 * The token is passed in rather than read by the native code out of Capacitor
 * Preferences' own storage: that key is the Preferences plugin's private
 * contract, and a rename in one of its releases would break background sync
 * silently on an app that still compiles.
 */
export async function configureBackgroundSync(): Promise<boolean> {
  if (!healthPlatform()) return false;
  try {
    const [{ HealthSync }, { apiOrigin }, { getAuthToken }] = await Promise.all([
      import("@sakred/health-sync"),
      import("./apiBase"),
      import("./apiFetch"),
    ]);
    const token = await getAuthToken();
    await HealthSync.configure({
      apiOrigin,
      token,
      overlapDays: FALLBACK_OVERLAP_DAYS,
    });
    return true;
  } catch (err) {
    console.warn("[health] background configure failed", err);
    return false;
  }
}

export async function enableBackgroundSync(): Promise<{ enabled: boolean; reason?: string }> {
  if (!healthPlatform()) return { enabled: false, reason: "web" };
  try {
    await configureBackgroundSync();
    const { HealthSync } = await import("@sakred/health-sync");
    return await HealthSync.enableBackgroundSync();
  } catch (err) {
    return { enabled: false, reason: errText(err) };
  }
}

export async function disableBackgroundSync(): Promise<void> {
  if (!healthPlatform()) return;
  try {
    const { HealthSync } = await import("@sakred/health-sync");
    await HealthSync.disableBackgroundSync();
  } catch {
    // Nothing to undo if it was never enabled.
  }
}

export async function backgroundSyncStatus(): Promise<{
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: string | null;
}> {
  if (!healthPlatform()) return { enabled: false, lastRunAt: null, lastResult: null };
  try {
    const { HealthSync } = await import("@sakred/health-sync");
    return await HealthSync.status();
  } catch {
    return { enabled: false, lastRunAt: null, lastResult: null };
  }
}

/** Android only — deep link into Health Connect so a member can change grants. */
export async function openHealthSettings(): Promise<void> {
  const p = await plugin();
  await p?.openHealthConnectSettings().catch(() => {});
}

export type SyncResult = {
  ok: boolean;
  accepted: number;
  workouts: number;
  rejected: number;
  reasons: string[];
  skipped: string[];
  message?: string;
};

/**
 * Read the window the server asks for, and post it.
 *
 * Every read is individually guarded. A member who granted steps but not
 * heart rate is the normal case, not the edge case: iOS returns empty for the
 * denied type but Health Connect throws, and one throw taking down the whole
 * sync would mean a single withheld permission silently costs us every other
 * metric.
 */
export async function syncHealth(): Promise<SyncResult> {
  const platform = healthPlatform();
  const empty: SyncResult = {
    ok: false,
    accepted: 0,
    workouts: 0,
    rejected: 0,
    reasons: [],
    skipped: [],
  };
  if (!platform) return { ...empty, message: "Health data only syncs from the phone app." };

  const p = await plugin();
  if (!p) return { ...empty, message: "Health is unavailable on this device." };

  // Where to read from. The server owns the watermark — the phone can be
  // reinstalled, and a device-local cursor would silently restart a member's
  // history at the reinstall date.
  let overlapDays = FALLBACK_OVERLAP_DAYS;
  let backfillDays = FALLBACK_BACKFILL_DAYS;
  let syncedThrough: string | null = null;
  try {
    const res = await apiRequest("GET", "/api/health/status");
    const status = await res.json();
    overlapDays = status.overlapDays ?? overlapDays;
    backfillDays = status.initialBackfillDays ?? backfillDays;
    syncedThrough =
      status.connections?.find((c: { platform: string }) => c.platform === platform)
        ?.syncedThrough ?? null;
  } catch {
    // Offline, or the session expired. Fall back to a full backfill: the
    // unique index makes re-sending a day free, so the wrong guess here costs
    // bandwidth and never correctness.
  }

  // Keep the background worker's token current. Deliberately not awaited —
  // a slow bridge call should not delay the read the member is waiting on.
  void configureBackgroundSync();

  const end = new Date();
  const start = new Date(end);
  if (syncedThrough) {
    const mark = new Date(syncedThrough);
    start.setTime(mark.getTime());
    start.setDate(start.getDate() - overlapDays);
  } else {
    start.setDate(start.getDate() - backfillDays);
  }
  const startDate = start.toISOString();
  const endDate = end.toISOString();

  const samples: CanonicalSample[] = [];
  const skipped: string[] = [];
  const granted: string[] = [];

  for (const plan of METRIC_PLANS) {
    try {
      const res = await p.queryAggregated({
        dataType: plan.dataType as never,
        startDate,
        endDate,
        bucket: "day",
        aggregation: plan.aggregation,
      });
      let kept = 0;
      for (const bucket of res.samples ?? []) {
        const row = toCanonical(plan, {
          startDate: bucket.startDate,
          value: bucket.value,
          unit: bucket.unit,
        });
        if (row) {
          samples.push(row);
          kept++;
        } else if (bucket.unit) {
          // Named once per metric, not once per bucket — otherwise an
          // unrecognised unit produces ninety identical lines.
          const note = `${plan.metric}: unexpected unit ${bucket.unit}`;
          if (!skipped.includes(note)) skipped.push(note);
        }
      }
      if (kept) granted.push(plan.metric);
    } catch (err) {
      skipped.push(`${plan.metric}: ${errText(err)}`);
    }
  }

  // Sleep is read as samples rather than aggregated, because the stage
  // breakdown only exists on the samples — and deep and REM minutes are the
  // part a coach actually reads.
  try {
    const res = await p.readSamples({
      dataType: "sleep" as never,
      startDate,
      endDate,
      limit: 2_000,
      ascending: true,
    });
    const folded = foldSleep(res.samples ?? []);
    samples.push(...folded);
    if (folded.length) granted.push("sleepMinutes");
  } catch (err) {
    skipped.push(`sleep: ${errText(err)}`);
  }

  const workouts: {
    externalId: string;
    workoutType?: string | null;
    startAt: string;
    endAt?: string | null;
    onDate: string;
    durationSeconds?: number | null;
    activeCalories?: number | null;
    distanceMeters?: number | null;
    sourceApp?: string | null;
  }[] = [];
  try {
    const res = await p.queryWorkouts({ startDate, endDate, limit: 300 });
    for (const w of res.workouts ?? []) {
      // No platform id means no idempotency key, and re-syncing would add the
      // same session again every time. Skipping is the lesser wrong.
      if (!w.platformId) continue;
      workouts.push({
        externalId: w.platformId,
        workoutType: w.workoutType ?? null,
        startAt: new Date(w.startDate).toISOString(),
        endAt: w.endDate ? new Date(w.endDate).toISOString() : null,
        onDate: localDate(w.startDate),
        durationSeconds: Math.round(w.duration ?? 0) || null,
        activeCalories: w.totalEnergyBurned ?? null,
        distanceMeters: w.totalDistance ?? null,
        sourceApp: w.sourceName ?? null,
      });
    }
  } catch (err) {
    skipped.push(`workouts: ${errText(err)}`);
  }

  if (!samples.length && !workouts.length) {
    return {
      ...empty,
      ok: true,
      skipped,
      message: skipped.length
        ? "No health data came back — check permissions in Settings."
        : "Nothing new to sync.",
    };
  }

  let accepted = 0;
  let workoutsWritten = 0;
  let rejected = 0;
  const reasons: string[] = [];

  try {
    // Paged, and the watermark only advances on the LAST page. A run that
    // dies halfway then re-reads from the old mark next time; advancing per
    // page would leave a permanent hole where the failed pages were.
    const pages = Math.max(1, Math.ceil(samples.length / PAGE));
    for (let i = 0; i < pages; i++) {
      const slice = samples.slice(i * PAGE, (i + 1) * PAGE);
      const last = i === pages - 1;
      const res = await apiRequest("POST", "/api/health/sync", {
        platform,
        samples: slice,
        workouts: last ? workouts : [],
        grantedMetrics: Array.from(new Set(granted)),
        ...(last ? { syncedThrough: endDate } : {}),
        deviceModel: Capacitor.getPlatform(),
      });
      const body = await res.json();
      accepted += body.accepted ?? 0;
      workoutsWritten += body.workouts ?? 0;
      rejected += body.rejected ?? 0;
      for (const r of body.reasons ?? []) if (!reasons.includes(r)) reasons.push(r);
    }
  } catch (err) {
    return { ...empty, skipped, message: errText(err) };
  }

  return { ok: true, accepted, workouts: workoutsWritten, rejected, reasons, skipped };
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
