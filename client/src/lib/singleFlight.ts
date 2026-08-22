/**
 * One answer at a time, shared — but never one answer forever.
 *
 * ── The distinction this exists to hold ───────────────────────────────────
 *
 * Deduplicating concurrent callers and caching a result permanently look the
 * same in the easy case and are opposites in the interesting one. The device
 * probe was fixed from "once per component" to "once per app process", which
 * removed eighteen duplicate bridge calls per launch — and in doing so quietly
 * promised that the answer could never change for the life of the process.
 *
 * On Android that promise is false in a way a member can walk into. Health
 * Connect is a separate app: it can be missing, it can be mid-update, and it
 * can simply not answer, all of which resolve to `available: false` with a
 * reason that tells the member to go install it. They go and install it. They
 * come back. A permanently memoized probe still says "install Health Connect",
 * and the only cure is force-quitting the app — which is the same class of
 * defect as the one that started this work: a stale value with no way to
 * express that it might have moved.
 *
 * So this cell separates the two behaviours it is easy to conflate:
 *
 *   in flight   → every caller awaits the same promise. One bridge call.
 *   settled     → callers get the held value with no work at all.
 *   invalidated → the value is discarded, and the next asker runs it again.
 *
 * ── Why invalidation carries a generation ─────────────────────────────────
 *
 * A run started before a lifecycle change is answering the old question. If it
 * were allowed to fill the cache on the way out, invalidating during a probe
 * would install a pre-change answer as the post-change truth — and it would do
 * so *after* the re-run had already corrected it, so the sequence would look
 * fixed and then unfix itself. The generation counter means a run may only
 * write the cache it was started for; anything older resolves its own callers
 * and is otherwise ignored.
 *
 * Callers of a superseded run still receive its value rather than an error.
 * They asked before the world changed and an answer is owed; the subscription
 * is what corrects them a moment later.
 *
 * ── Why it notifies ───────────────────────────────────────────────────────
 *
 * Invalidation is worthless if nobody re-asks. React components read this once
 * on mount, so without a notification an invalidated cell would sit discarded
 * until something unrelated happened to ask — which for the install-and-return
 * case is never. Subscribers are woken on invalidation (they re-ask, and the
 * first of them starts the single run everyone else joins) and again when a
 * value lands (they take it).
 *
 * The counters are not diagnostics for their own sake: `runs` is the only way
 * a test can tell "shared one call" from "cached forever", which is the exact
 * distinction above.
 */

export class SingleFlight<T> {
  private inflight: Promise<T> | null = null;
  private held: { value: T } | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();

  /** How many times the work actually ran. The memoization test turns on this. */
  runs = 0;
  /** Callers that shared a run already in progress. */
  joins = 0;
  /** Callers served from the held value without any work. */
  hits = 0;

  constructor(private readonly work: () => Promise<T>) {}

  get(): Promise<T> {
    if (this.held) {
      this.hits++;
      return Promise.resolve(this.held.value);
    }
    if (this.inflight) {
      this.joins++;
      return this.inflight;
    }

    const generation = this.generation;
    this.runs++;

    const run = this.work().then(
      (value) => {
        if (generation === this.generation) {
          this.held = { value };
          this.inflight = null;
          this.notify();
        }
        return value;
      },
      (err) => {
        // A rejection is not cached: whatever went wrong may not go wrong
        // next time, and holding a failure forever is the memoization trap
        // in its worst form.
        if (generation === this.generation) this.inflight = null;
        throw err;
      },
    );

    this.inflight = run;
    return run;
  }

  /** The world changed. Discard what we hold and wake anyone who cares. */
  invalidate(): void {
    this.generation++;
    this.held = null;
    this.inflight = null;
    this.notify();
  }

  /** What we hold right now, without asking for it. */
  peek(): T | undefined {
    return this.held?.value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    // Copied before iterating: a listener is allowed to unsubscribe itself,
    // and a set mutated mid-iteration silently skips a neighbour.
    for (const listener of Array.from(this.listeners)) listener();
  }

  /** Test seam. A fresh process has asked nothing and holds nothing. */
  reset(): void {
    this.generation++;
    this.held = null;
    this.inflight = null;
    this.runs = 0;
    this.joins = 0;
    this.hits = 0;
  }
}
