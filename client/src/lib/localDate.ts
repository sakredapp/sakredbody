/**
 * The calendar date where the member is standing.
 *
 * ── Why this is not `toISOString().slice(0, 10)` ──────────────────────────
 *
 * That expression is the UTC date, and it is wrong for most of the world for
 * part of every day. A member in Toronto training at 22:00 on the 15th is
 * already the 16th in UTC, so anything comparing "today" to an `onDate` — which
 * is written in *their* calendar — silently slips a day every evening.
 *
 * It has cost twice. Recent Build labelled the session somebody had just
 * finished as "Yesterday", and on the server the same reading put a second
 * Confirm Activity card on screen after the first had been answered, which
 * ended with two workouts carrying one workout's name.
 *
 * The server has `todayInZone` for the same job against the member's stored
 * zone. This is the client's, where the device's own zone is the best available
 * answer and usually the right one.
 */
export function localToday(now: Date = new Date()): string {
  return localDate(now);
}

/** The same conversion for an arbitrary instant. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** `n` days before the member's today, in the same calendar. */
export function localDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return localDate(d);
}
