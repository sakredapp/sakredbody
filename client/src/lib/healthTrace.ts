/**
 * How long the first health screen actually takes, stage by stage.
 *
 * ── Why this exists as code rather than as a debugging session ────────────
 *
 * The report was: Settings says Connected, the app launches showing nothing,
 * and about a minute later the numbers appear. A minute is long enough that
 * every plausible cause is *also* about a minute — a serial native read, a
 * cold bridge, a query waiting on a probe, two syncs queued behind each other
 * — and no amount of reading the code separates them, because they are all
 * true statements about the same launch. Only elapsed time separates them.
 *
 * So the marks go in before the phone is available, and the next TestFlight or
 * Play run produces the evidence on its own. The alternative is a build to add
 * instrumentation, a run to collect it, and a second build to act on it.
 *
 * ── What is recorded, and what is refused ─────────────────────────────────
 *
 * Durations, counts, and the shape of the dependency chain. Never a
 * measurement: not a step count, not a heart rate, not a sleep minute. A
 * telemetry table is not the place where somebody's resting heart rate ends
 * up, and there is no diagnostic question here that a health value would
 * answer better than a duration does.
 *
 * Bucket counts per record family are kept, because "this family returned
 * 8,000 buckets" is the difference between a slow store and an over-broad
 * window, and a count of rows is not a reading.
 *
 * Timing is monotonic — `performance.now()`, not a clock. A phone that adjusts
 * its wall clock mid-launch, or a member who crosses a timezone, must not be
 * able to produce a negative stage.
 *
 * The origin is the first health-related mark of the process, not process
 * start. Every number here is therefore *relative to the app beginning to care
 * about health*, which is the span being investigated — but it means these are
 * not a substitute for a cold-launch-to-first-paint measurement, and reading
 * them as one would understate the wait a member actually experiences.
 */

import { Capacitor } from "@capacitor/core";
import { track } from "./track";

/** Long enough for a genuinely slow first backfill; short enough to arrive. */
const FLUSH_DEADLINE_MS = 120_000;

type Marks = Record<string, number>;

interface Trace {
  /** Monotonic origin. Every mark is relative to this. */
  origin: number;
  marks: Marks;
  facts: Record<string, unknown>;
  /** Per record family: how long it took and how much came back. */
  families: Record<string, { ms: number; buckets?: number; error?: string }>;
  sent: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * One trace per app process, held at module scope.
 *
 * Deliberately not React state. The stages being measured are spread across a
 * hook, a bridge module and a mutation, they start before the first render
 * that would own the state, and the whole point is to catch a launch that
 * happens once — so a value that survives re-renders and unmounts is the only
 * shape that works.
 */
let trace: Trace | null = null;

function now(): number {
  // `performance` exists in every browser and WKWebView/Chromium shell we
  // ship into, but a guard costs nothing and a trace must never be the reason
  // a launch throws.
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : 0;
}

/** Begin the launch trace. Safe to call repeatedly; only the first one counts. */
export function beginHealthTrace(): void {
  if (trace) return;
  trace = { origin: now(), marks: { launch: 0 }, facts: {}, families: {}, sent: false, timer: null };
  trace.timer = setTimeout(() => flushHealthTrace("deadline"), FLUSH_DEADLINE_MS);
}

/**
 * Record that a stage happened.
 *
 * First write wins. A stage that fires on every resume would otherwise
 * overwrite the launch value with a number measured from the wrong origin,
 * and the trace would quietly describe a later, faster visit.
 */
export function markHealth(stage: string): void {
  // Auto-started rather than requiring a call at app entry. The status query
  // fires from the first render that mounts a health surface, which can be
  // before the dashboard's own effect runs — and a stage that arrives before
  // the clock starts is a stage silently missing from the trace, which is
  // worse than an origin a few milliseconds early.
  if (!trace) beginHealthTrace();
  if (!trace || trace.sent) return;
  if (trace.marks[stage] !== undefined) return;
  trace.marks[stage] = Math.round(now() - trace.origin);
}

/** A fact about this launch — platform, trigger, whether data was already held. */
export function noteHealth(key: string, value: unknown): void {
  if (!trace) beginHealthTrace();
  if (!trace || trace.sent) return;
  trace.facts[key] = value;
}

/**
 * One native record family's read.
 *
 * This is the measurement the Android question turns on: whether the minute is
 * one slow family or twenty-two adequate ones read one after another. Only a
 * per-family duration can tell those apart, and they call for opposite fixes.
 */
export function noteHealthFamily(
  family: string,
  detail: { ms: number; buckets?: number; error?: string },
): void {
  if (!trace || trace.sent) return;
  trace.families[family] = { ...detail, ms: Math.round(detail.ms) };
}

/** Elapsed ms since launch, for callers timing their own span. */
export function sinceLaunch(): number {
  return trace ? Math.round(now() - trace.origin) : 0;
}

/**
 * Send it, once.
 *
 * Native only. In a browser there is no native store, so the stages that
 * matter cannot happen and the event would be a row of nulls diluting the
 * platform comparison this is meant to support.
 */
export function flushHealthTrace(reason: string): void {
  if (!trace || trace.sent) return;
  trace.sent = true;
  if (trace.timer) clearTimeout(trace.timer);

  if (!Capacitor.isNativePlatform()) return;

  const m = trace.marks;
  const span = (from: string, to: string) =>
    m[from] !== undefined && m[to] !== undefined ? m[to] - m[from] : null;

  track("health.startup", {
    surface: "health",
    props: {
      reason,
      platform: Capacitor.getPlatform(),
      ...trace.facts,
      marks: m,
      families: trace.families,

      /*
        The two numbers the release is judged on, computed here so that every
        run reports them the same way rather than being re-derived by whoever
        reads the table next.

        A — how long until the member sees something we already knew. This
            should owe nothing to the native store, and if it does, that is
            the finding.
        B — how long the native refresh itself took, end to end.
      */
      persisted_visible_ms: m.persisted_visible ?? null,
      native_refresh_ms: span("native_sync_started", "native_sync_resolved"),
      fresh_visible_ms: m.refreshed_summary_visible ?? null,

      // Where the native time went, split at the seams that call for
      // different fixes: the store's own reads, versus our upload.
      native_read_ms: span("native_sync_started", "native_read_resolved"),
      native_write_ms: span("write_started", "write_resolved"),
      probe_ms: span("native_probe_started", "native_probe_resolved"),
    },
  });
}

/** Test seam. Discards the current trace so a fresh launch can be measured. */
export function resetHealthTrace(): void {
  if (trace?.timer) clearTimeout(trace.timer);
  trace = null;
}
