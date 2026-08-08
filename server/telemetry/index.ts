/**
 * Telemetry — the recorder.
 *
 * One function, `track()`, that every call site uses. It is deliberately
 * impossible to break a request with:
 *
 *   - it never throws; a failed insert logs and returns
 *   - it never blocks; the row is written after the response
 *
 * That combination is the whole design. Telemetry that can 500 a checkout is
 * worse than no telemetry, and telemetry that adds 40ms to every request gets
 * removed the first time someone profiles the app. So the contract is: call it
 * and forget it, and accept that under catastrophe you lose events rather than
 * requests.
 *
 * The counterpart rule, from the audit: **no empty catches.** Anywhere the app
 * currently swallows a failure, it should call `track('error.server', ...)`
 * instead — an empty catch is a decision never to learn about a class of bug.
 */

import { db } from "../db.js";
import { events, type EventName, type TrackInput } from "../../shared/schema.js";
import { afterResponse } from "../daily/background.js";
import { memberToday } from "../coaching/enrollment.js";

interface TrackOptions extends Omit<TrackInput, "name"> {
  /** Omit for something that happened before sign-in. */
  userId?: string | null;
  /**
   * The member's own calendar date. Looked up when absent, which costs a
   * query — pass it when the caller already knows it.
   */
  onDate?: string;
}

/**
 * Record that something happened.
 *
 * Returns immediately. Nothing awaits this, and nothing should: a caller that
 * awaits telemetry has coupled its latency to a table nobody is reading in
 * real time.
 */
export function track(name: EventName, opts: TrackOptions = {}): void {
  afterResponse(async () => {
    // The member's own day, because every question here is per-day-per-member
    // and deriving it later means re-deciding what day it was for someone in
    // Los Angeles at 5pm — the exact bug the habit engine had.
    let onDate = opts.onDate ?? null;
    if (!onDate && opts.userId) {
      try {
        onDate = await memberToday(opts.userId);
      } catch {
        // A missing date makes the event less useful, not useless. Recording
        // it undated beats dropping it.
        onDate = null;
      }
    }

    await db.insert(events).values({
      userId: opts.userId ?? null,
      name,
      surface: opts.surface ?? null,
      subjectId: opts.subjectId ?? null,
      props: opts.props ?? {},
      onDate,
    });
  });
}

/**
 * Record a failure that would otherwise have been swallowed.
 *
 * `err` is reduced to a message and a name rather than stored whole — a raw
 * error object can carry a connection string or a bearer token in its stack,
 * and this table is queried casually.
 */
export function trackError(
  where: string,
  err: unknown,
  opts: TrackOptions = {},
): void {
  const message = err instanceof Error ? err.message : String(err);
  const kind = err instanceof Error ? err.name : typeof err;

  console.error(`[${where}]`, err);

  track("error.server", {
    ...opts,
    surface: opts.surface ?? where,
    props: { ...(opts.props ?? {}), where, kind, message: message.slice(0, 500) },
  });
}

export { registerTelemetryRoutes } from "./routes.js";
