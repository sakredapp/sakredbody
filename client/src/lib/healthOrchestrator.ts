/**
 * Who owns the health refresh that is currently happening.
 *
 * ── The problem this replaces ─────────────────────────────────────────────
 *
 * Three things ask for a refresh at launch — the dashboard mounting,
 * `visibilitychange`, and Capacitor's `appStateChange` — and on a cold native
 * launch all three arrive within a few hundred milliseconds, because becoming
 * visible, becoming active, and mounting are the same event described three
 * ways. That is not a bug in any of them; it is what those events mean.
 *
 * The old guard was a boolean ref that covered the sync but not the query
 * invalidation, so one launch produced one sync and three refetch storms. The
 * usual reach here is a debounce, and a debounce is a guess: it hides the
 * duplicates behind a timer chosen to be longer than the thing it is hiding,
 * and it is wrong the moment that thing gets slower.
 *
 * What is wanted is not "ignore the extra triggers" but "there is one refresh,
 * and everybody is talking about it". So the in-flight run is held as a
 * promise. A second trigger does not get dropped — it *joins*, and settles
 * when the run it joined settles. The caller still learns when the data is
 * current, which is the question it was actually asking, and there is exactly
 * one native read no matter how many events fire.
 *
 * ── Why this is not in the hook ───────────────────────────────────────────
 *
 * Because the interesting case is three events arriving at once during a
 * sixty-second sync, and that is a two-line test against a plain function and
 * an afternoon with a phone against a hook. No React here, and no react-query:
 * the caller passes in what to run.
 */

export interface RefreshOptions {
  /** Do the native read and upload. */
  sync: () => Promise<unknown>;
  /** Re-read what the server holds, after the sync moved it. */
  hydrate: () => Promise<unknown>;
  /** Where this trigger came from — "mount", "visibility", "appState". */
  trigger: string;
  /** Monotonic-enough clock. Injected so a test need not wait fifteen minutes. */
  now?: () => number;
  /** Skip the native read if one finished this recently. */
  minIntervalMs?: number;
  /** Told what happened, for the launch trace. */
  onJoin?: (trigger: string) => void;
  onStart?: (trigger: string) => void;
  onSettled?: () => void;
}

/**
 * At most every fifteen minutes.
 *
 * A member switching to Messages and back would otherwise re-read the window
 * on every return, which on Android is slow enough to feel like a frozen
 * screen. Note what this throttle now does *not* govern: whether the screen
 * updates. That was the same decision before, and it is why a throttled return
 * left a member looking at a value the server had already corrected.
 */
export const SYNC_MIN_MS = 15 * 60 * 1000;

export class HealthOrchestrator {
  private run: Promise<unknown> | null = null;
  private lastAt = 0;
  /** Counted rather than inferred, so a test can assert "exactly one". */
  syncCount = 0;
  joinCount = 0;

  /** Is a native refresh in flight right now? */
  get busy(): boolean {
    return this.run !== null;
  }

  refresh(opts: RefreshOptions): Promise<unknown> {
    const now = opts.now ?? Date.now;
    const minInterval = opts.minIntervalMs ?? SYNC_MIN_MS;

    if (this.run) {
      this.joinCount++;
      opts.onJoin?.(opts.trigger);
      return this.run;
    }

    const at = now();
    // A run that finished recently enough is itself the answer. Returning a
    // resolved promise rather than nothing keeps every caller's shape the same.
    if (this.lastAt !== 0 && at - this.lastAt < minInterval) return Promise.resolve();

    this.lastAt = at;
    this.syncCount++;
    opts.onStart?.(opts.trigger);

    this.run = opts
      .sync()
      .catch(() => {
        // A failed sync is not a failed launch. Whatever is persisted is still
        // on screen and still true; swallowing here keeps one unreachable
        // store from becoming an unhandled rejection at startup.
      })
      // Hydration runs either way. On the failure path a partial write may
      // still have moved rows we are displaying.
      .then(() => opts.hydrate())
      .catch(() => {})
      .finally(() => {
        this.run = null;
        opts.onSettled?.();
      });

    return this.run;
  }

  /** A fresh process has never synced. */
  reset(): void {
    this.run = null;
    this.lastAt = 0;
    this.syncCount = 0;
    this.joinCount = 0;
  }
}
