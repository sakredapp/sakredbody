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

import { Capacitor, registerPlugin } from "@capacitor/core";
import { withTimeout, BridgeTimeout } from "./bridgeTimeout";
import { apiRequest } from "./queryClient";
import { markHealth, noteHealth, noteHealthFamily } from "./healthTrace";
import {
  exerciseMinutesFromWorkouts,
  foldSleep,
  localDate,
  plansFor,
  readTypesFor,
  toCanonical,
  type CanonicalSample,
  type HealthPlatform,
} from "./healthMetrics";

/** Mirrors the server's constants; the server is authoritative and sends them. */
const FALLBACK_OVERLAP_DAYS = 7;
const FALLBACK_BACKFILL_DAYS = 90;
/** One POST body. See the note on healthSyncSchema — a mobile network drops big ones. */
const PAGE = 1_000;
/**
 * Longer than the probe's deadline. A ninety-day aggregate read genuinely
 * takes time on a phone with years of history, and cutting it short would turn
 * a slow first sync into a permanent failure. Still finite: an unanswered read
 * must eventually become an error somebody can see.
 */
const READ_TIMEOUT_MS = 45_000;

/**
 * Re-exported rather than declared. The metric plans have to say which store
 * each of them exists in, so the union has to live where the plans live.
 */
export type { HealthPlatform };

export function healthPlatform(): HealthPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const p = Capacitor.getPlatform();
  if (p === "ios") return "healthkit";
  if (p === "android") return "healthconnect";
  return null;
}

/**
 * The bridge, obtained without loading anything.
 *
 * ── What the dynamic import actually cost ────────────────────────────────
 *
 * This module used to `await import("@capgo/capacitor-health")`, to keep ~40kB
 * of bridge code out of the web entry chunk. On a real iOS build that import
 * never settled — proven by staged telemetry from a simulator, which reported
 * `stalled:importing` on every launch while a deadline self-test in the same
 * function confirmed timers were firing normally. So the health feature was
 * dead on arrival for a saving of forty kilobytes on a platform that does not
 * use the feature at all.
 *
 * The package it was loading is three lines:
 *
 *     const Health = registerPlugin('Health', { web: () => import('./web')… })
 *
 * `registerPlugin` comes from @capacitor/core, which is statically loaded on
 * every platform already. Calling it directly is the same object with no chunk,
 * no loader, and nothing to hang on — and it is what the package would have
 * given us. The types come from the package as a `import type`, which vanishes
 * at build time and pulls in no code.
 *
 * No web fallback is registered on purpose. A browser genuinely cannot read
 * HealthKit; the proxy rejecting is the honest answer, and `healthPlatform()`
 * returns null there long before anything calls it.
 */
import type { HealthPlugin } from "@capgo/capacitor-health";

type Plugin = HealthPlugin;

let cached: Plugin | null = null;

/** Kept only so the probe can report why, if this ever fails again. */
let lastLoadError: string | null = null;

/**
 * Is a native implementation registered under this name?
 *
 * Wrapped because it is called before every `try` in this file, so anything it
 * throws rejects the whole probe before a single guarded line runs — and the
 * caller's catch then reports nothing, because the failure happened outside
 * the code that knows how to describe it.
 */
function pluginRegistered(): boolean {
  try {
    return Capacitor.isPluginAvailable("Health");
  } catch {
    return false;
  }
}

function plugin(): Plugin | null {
  if (!healthPlatform()) return null;
  if (cached) return cached;
  try {
    cached = registerPlugin<Plugin>("Health");
    lastLoadError = null;
    return cached;
  } catch (err) {
    lastLoadError = String((err as Error)?.message ?? err);
    return null;
  }
}

export type HealthAvailability = {
  available: boolean;
  platform: HealthPlatform | null;
  /** Android: Health Connect can be absent on older devices and is installable. */
  reason?: string;
};

/**
 * Can this phone read health data?
 *
 * ── Why this is not simply `isAvailable()` ────────────────────────────────
 *
 * It was, and on a real iPhone it answered false. Everything downstream is
 * gated on this — the onboarding step, the home tiles, the Connect button in
 * Settings — so one wrong answer removed the entire feature with no error
 * anywhere, on a device where the plugin is demonstrably linked into the
 * binary (`HealthPlugin` and `_TtC12HealthPlugin6Health` are both in the
 * compiled App target) and whose Swift reports `HKHealthStore
 * .isHealthDataAvailable()`, which is true on every iPhone ever made.
 *
 * So the probe is treated as evidence rather than as the verdict.
 *
 * `Capacitor.isPluginAvailable` asks the bridge whether a native
 * implementation is registered under that name, which is a different question
 * from what the plugin's own method returns and cannot be broken by the
 * plugin's internals. On iOS, a registered bridge is sufficient: HealthKit
 * ships on every iPhone, so "the bridge is there" and "HealthKit exists" are
 * the same statement. If some future iPad genuinely lacks it, the
 * authorization request fails cleanly and says so — a far better failure than
 * silently hiding the feature from everyone.
 *
 * Android keeps the probe as the verdict, because there the question is real:
 * Health Connect is a separate app that can be absent, and `reason` is what
 * tells the member to install it.
 */
export async function healthAvailability(): Promise<HealthAvailability> {
  const platform = healthPlatform();
  if (!platform) return { available: false, platform: null, reason: "Not a phone app." };

  const bridged = pluginRegistered();
  const p = plugin();
  if (!p) {
    return {
      available: false,
      platform,
      reason: bridged
        ? "The Health plugin is in this build but its code did not load."
        : "This build has no Health plugin.",
    };
  }

  // iOS is decided by the bridge, before the probe can get it wrong.
  const iosFallback = platform === "healthkit" && bridged;

  try {
    const res = await withTimeout(p.isAvailable(), "Health.isAvailable()");
    if (res?.available) return { available: true, platform };
    if (iosFallback) return { available: true, platform };
    return { available: false, platform, reason: res?.reason ?? "Health data is unavailable." };
  } catch (err) {
    if (iosFallback) return { available: true, platform };
    // A silent bridge on Android is not "no health data" — it is Health
    // Connect not answering, which is usually that it is not installed or
    // needs updating. Say the thing the member can act on rather than the
    // stack trace, and never leave this unresolved: an unresolved probe is
    // what removed the feature from every device in the first place.
    if (err instanceof BridgeTimeout) {
      return {
        available: false,
        platform,
        reason:
          platform === "healthconnect"
            ? "Health Connect didn't respond. Install or update it from the Play Store, then try again."
            : "Health didn't respond. Reopen the app and try again.",
      };
    }
    return { available: false, platform, reason: String(err) };
  }
}

/**
 * Everything the probe saw, for telemetry.
 *
 * Separate from the answer above because this is diagnosis, not behaviour. A
 * device reporting "unavailable" is the only evidence there is when the
 * developer cannot hold the phone, and an hour went into guessing at exactly
 * this because nothing was ever recorded. Sent once per app open.
 */
export async function healthProbeDetail(
  /**
   * Written to as the probe advances, so a caller that gives up on it can
   * still say how far it got.
   *
   * The probe reported `stalled` and nothing else, which narrows the fault to
   * "somewhere in this function" — three awaits, each supposedly guarded by a
   * deadline, so the answer should be impossible. When the impossible is what
   * the telemetry says, the instrument needs finer graduations, not another
   * theory.
   */
  progress: { stage: string } = { stage: "start" },
): Promise<Record<string, unknown>> {
  /**
   * Does the deadline mechanism work in this runtime at all?
   *
   * The import stalls past a deadline that the unit tests prove fires — an
   * impossibility, which means one of the two things I believe is false. This
   * runs the exact shape of the unit test inside the app: a promise nobody
   * settles, raced against a 300ms deadline. If it reports "fires", the
   * mechanism is sound and the import path is doing something specific; if it
   * reports "broken", setTimeout or the timer is not what it appears to be
   * here, and every other conclusion drawn from a deadline is void.
   */
  let deadlineWorks = "untested";
  try {
    await withTimeout(new Promise<void>(() => {}), "self-test", 300);
    deadlineWorks = "resolved-impossibly";
  } catch (err) {
    deadlineWorks = err instanceof BridgeTimeout ? "fires" : `other:${String(err)}`;
  }

  progress.stage = "platform";
  const platform = healthPlatform();
  progress.stage = "registered";
  const bridged = pluginRegistered();
  let loaded = false;
  let raw: unknown = null;
  let error: string | null = null;
  let timedOut = false;
  try {
    progress.stage = "importing";
    const p = plugin();
    loaded = Boolean(p);
    progress.stage = loaded ? "calling" : "no-plugin";
    // This awaited the bridge unguarded too — so the one call whose job is to
    // report a hanging bridge would itself hang, and the report never arrived.
    if (p) raw = await withTimeout(p.isAvailable(), "Health.isAvailable() [probe]");
    progress.stage = "answered";
  } catch (err) {
    timedOut = err instanceof BridgeTimeout;
    error = String(err);
  }
  return {
    platform,
    nativePlatform: Capacitor.getPlatform(),
    bridged,
    loaded,
    probe: raw,
    timedOut,
    error,
    loadError: lastLoadError,
    deadlineWorks,
  };
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
  const p = plugin();
  if (!p) throw new Error("This build has no Health plugin.");
  // Longer than the probe's deadline on purpose: this one legitimately waits
  // for a human to read a system sheet and tap it. What it must not do is wait
  // forever when no sheet ever appeared — which is what "just a dead button"
  // looked like from the outside.
  const status = await withTimeout(
    p.requestAuthorization({
      // This platform's types, not both platforms'. See `readTypesFor`: the
      // Android plugin rejects the whole call on the first identifier its enum
      // does not know, so asking Health Connect for an Apple-only metric was
      // enough to make Connect a button that could never work.
      read: readTypesFor(healthPlatform()) as never[],
      write: [],
      // Health Connect caps reads at ~30 days without this, which would make an
      // Android member's first sync three months shorter than an iPhone's.
      requestHistoryAccess: true,
    }),
    "Health.requestAuthorization()",
    60_000,
  );
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
  const p = plugin();
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

  const p = plugin();
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

  for (const plan of plansFor(healthPlatform())) {
    const startedAt = readClock();
    try {
      // Wrapped like every other crossing. A read that never answers hangs
      // the whole sync — the same failure as the probe, one screen further in,
      // and the member watches a spinner instead of a dead button.
      const res = await withTimeout(
        p.queryAggregated({
        dataType: plan.dataType as never,
        startDate,
        endDate,
        bucket: "day",
        aggregation: plan.aggregation,
        }),
        `Health.queryAggregated(${plan.dataType})`,
        READ_TIMEOUT_MS,
      );
      /*
        Timed per family, because the two explanations for a slow sync call
        for opposite fixes: one family taking fifty seconds is a query to
        narrow, twenty-two families taking two seconds each is a loop to
        parallelise. Only a per-family duration tells them apart, and the
        bucket count says whether the window is wider than it needs to be.

        Duration and count only. Never a value.
      */
      noteHealthFamily(plan.metric, {
        ms: readClock() - startedAt,
        buckets: res.samples?.length ?? 0,
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
      noteHealthFamily(plan.metric, { ms: readClock() - startedAt, error: errText(err) });
      skipped.push(`${plan.metric}: ${errText(err)}`);
    }
  }

  // Sleep is read as samples rather than aggregated, because the stage
  // breakdown only exists on the samples — and deep and REM minutes are the
  // part a coach actually reads.
  const sleepStartedAt = readClock();
  try {
    const res = await withTimeout(
      p.readSamples({
      dataType: "sleep" as never,
      startDate,
      endDate,
      limit: 2_000,
      ascending: true,
      }),
      "Health.readSamples(sleep)",
      READ_TIMEOUT_MS,
    );
    const folded = foldSleep(res.samples ?? []);
    // The only read here with a limit that a long window can actually reach.
    // Whether 2,000 is a ceiling being hit is a question the count answers.
    noteHealthFamily("sleep", {
      ms: readClock() - sleepStartedAt,
      buckets: res.samples?.length ?? 0,
    });
    samples.push(...folded);
    if (folded.length) granted.push("sleepMinutes");
  } catch (err) {
    noteHealthFamily("sleep", { ms: readClock() - sleepStartedAt, error: errText(err) });
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
  const workoutsStartedAt = readClock();
  try {
    const res = await withTimeout(
      p.queryWorkouts({ startDate, endDate, limit: 300 }),
      "Health.queryWorkouts()",
      READ_TIMEOUT_MS,
    );
    noteHealthFamily("workouts", {
      ms: readClock() - workoutsStartedAt,
      buckets: res.workouts?.length ?? 0,
    });
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
    noteHealthFamily("workouts", { ms: readClock() - workoutsStartedAt, error: errText(err) });
    skipped.push(`workouts: ${errText(err)}`);
  }

  /**
   * Exercise minutes on Android, derived rather than read.
   *
   * Health Connect has no exercise-time record; it has sessions with a start
   * and an end, which is the same fact recorded differently. Dropping the
   * metric on Android would have been the cheap fix and would have left an
   * Android member's terrain reading permanently missing a number an iPhone
   * member has — so it is computed from the sessions that were just read.
   *
   * After the workout read, so a failed session query produces no minutes
   * rather than a confident zero.
   */
  if (healthPlatform() === "healthconnect") {
    for (const day of exerciseMinutesFromWorkouts(workouts)) {
      samples.push({
        onDate: day.onDate,
        metric: "exerciseMinutes",
        value: day.minutes,
        unit: "minute",
      });
    }
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

  // Everything above was the phone. Everything below is our own network.
  // Splitting the trace here is what makes "Health Connect is slow" and "the
  // upload is slow" two different findings rather than one guess.
  markHealth("native_read_resolved");

  let accepted = 0;
  let workoutsWritten = 0;
  let rejected = 0;
  const reasons: string[] = [];

  markHealth("write_started");
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
    markHealth("write_resolved");
    return { ...empty, skipped, message: errText(err) };
  }
  markHealth("write_resolved");
  noteHealth("samples_posted", samples.length);
  noteHealth("workouts_posted", workouts.length);

  return { ok: true, accepted, workouts: workoutsWritten, rejected, reasons, skipped };
}

/**
 * Monotonic, for measuring a span rather than naming a moment.
 *
 * A phone can adjust its wall clock mid-sync, and a member can cross a
 * timezone during one. Either would make a stage report a negative duration
 * with `Date.now()`, which is the sort of number that gets a real finding
 * dismissed as a bug in the instrument.
 */
function readClock(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
