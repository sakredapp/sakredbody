/**
 * How long this workout has been running.
 *
 * ── Derived, never counted ────────────────────────────────────────────────
 *
 * The elapsed time is `now - startedAt`, recomputed every tick from the
 * server's own timestamp. It is deliberately not a counter this component
 * increments, because a counter is state that lives inside a React component
 * and a React component does not survive a member walking to the water
 * fountain: navigate away, come back, and an incremented counter restarts at
 * zero while the workout is forty minutes old.
 *
 * The same applies to the app being backgrounded, the phone locking, and the
 * webview being evicted and rebuilt — all of which happen constantly during an
 * hour in a gym, and none of which touch a subtraction against a fixed point.
 *
 * The interval here only decides how often the screen redraws. If it stops,
 * pauses or drifts, the next render is still correct.
 */

import { useEffect, useState } from "react";

/** `41:07`, or `1:12:30` once an hour is on the clock. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export function Elapsed({ startedAt, className }: { startedAt: string; className?: string }) {
  const started = new Date(startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // A clock that has not been set yet, or a timestamp we cannot read, is worth
  // saying nothing about rather than rendering "NaN:NaN" over somebody's set.
  if (!Number.isFinite(started)) return null;

  return (
    <span className={className} data-testid="session-elapsed">
      {formatElapsed(now - started)}
    </span>
  );
}
