/**
 * The member's body, reduced to what a note can actually use.
 *
 * The daily note is written by a model, so this exists to answer "what should
 * it be told" rather than "what do we have". We have twenty-two metrics and
 * thirty days of each; handing that over as numbers would mean the model doing
 * arithmetic, which is the thing it is worst at, on data where a wrong average
 * reads as a confident observation about someone's health.
 *
 * So the reduction happens here, in code, and the model receives four signals
 * with a direction attached. The direction is the part that matters — a resting
 * heart rate of 54 means nothing on its own; 54 and climbing is the note.
 */

import { and, gte, eq } from "drizzle-orm";
import { db } from "../db.js";
import { healthDays } from "../../shared/schema.js";

/** Enough days that a baseline exists, few enough that it is still "lately". */
const WINDOW_DAYS = 28;
const RECENT_DAYS = 7;
/** Below this, a change is noise and saying it out loud would be inventing one. */
const MEANINGFUL = 0.05;

type Signal = { label: string; recent: string; direction: string | null };

const TRACKED: {
  metric: string;
  label: string;
  format: (v: number) => string;
  /** Which way is worth remarking on; null where there is no such direction. */
  betterHigher: boolean | null;
  /**
   * Whether the number grows through the day.
   *
   * Steps at 7am are not a low day, they are an early one — see the note above
   * `healthSignals`.
   */
  accumulates?: boolean;
}[] = [
  {
    metric: "sleepMinutes",
    label: "Sleep",
    format: (v) => `${Math.floor(v / 60)}h ${Math.round(v % 60)}m a night`,
    betterHigher: true,
  },
  {
    metric: "restingHeartRate",
    label: "Resting heart rate",
    format: (v) => `${Math.round(v)} bpm`,
    betterHigher: false,
  },
  {
    metric: "heartRateVariability",
    label: "Heart rate variability",
    format: (v) => `${Math.round(v)} ms`,
    betterHigher: true,
  },
  {
    metric: "steps",
    label: "Daily movement",
    format: (v) => `${Math.round(v).toLocaleString()} steps`,
    betterHigher: true,
    accumulates: true,
  },
];

/**
 * ── Why today is excluded from the accumulating metrics ───────────────────
 *
 * The note is written once and stored for the day, so every claim in it has to
 * be one that stays true until midnight. A step count does not qualify while it
 * is still being counted: at 7am the row for today holds a couple of thousand
 * steps, averaging that into the last seven days drags the mean under the
 * baseline, and the note goes out saying the member's movement is down.
 *
 * It then says so all day. At six in the evening, after sixteen thousand steps
 * and a five-mile run, Today still read "your sleep and movement are both down
 * — let today be small", four seconds away from a Stats screen showing the run.
 * The member is not being told something stale so much as something that was
 * never true; the note simply read a day that had not happened yet.
 *
 * So today's own row is dropped for anything cumulative. What is left is the
 * member's completed days, and "your movement is down lately" is then a
 * sentence that survives until the day is over. Sleep, resting heart rate and
 * HRV keep today's row: those are written once, for the night that finished,
 * and they are as complete at 7am as they will ever be.
 */
export async function healthSignals(
  userId: string,
  /** The member's own date. See the note above. */
  today?: string,
): Promise<Signal[] | null> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);

  const rows = await db
    .select({
      onDate: healthDays.onDate,
      metric: healthDays.metric,
      value: healthDays.value,
    })
    .from(healthDays)
    .where(and(eq(healthDays.userId, userId), gte(healthDays.onDate, since.toISOString().slice(0, 10))));

  if (!rows.length) return null;

  const byMetric = new Map<string, { onDate: string; value: number }[]>();
  for (const row of rows) {
    const list = byMetric.get(row.metric) ?? [];
    list.push({ onDate: row.onDate, value: row.value });
    byMetric.set(row.metric, list);
  }

  const signals: Signal[] = [];

  for (const tracked of TRACKED) {
    const points = (byMetric.get(tracked.metric) ?? [])
      .filter((p) => !(tracked.accumulates && today && p.onDate === today))
      .sort((a, b) => a.onDate.localeCompare(b.onDate));
    // Fewer than three readings is not a week of anything. A single night's
    // sleep presented as "lately" is a claim about them that isn't true.
    if (points.length < 3) continue;

    const recent = points.slice(-RECENT_DAYS);
    const older = points.slice(0, Math.max(0, points.length - RECENT_DAYS));
    const mean = (xs: { value: number }[]) => xs.reduce((a, b) => a + b.value, 0) / xs.length;

    const recentMean = mean(recent);
    let direction: string | null = null;

    if (older.length >= 3) {
      const baseline = mean(older);
      if (baseline !== 0) {
        const delta = (recentMean - baseline) / baseline;
        if (Math.abs(delta) >= MEANINGFUL) {
          const rising = delta > 0;
          // Said in plain words rather than as a percentage. A model given
          // "+7.2%" tends to quote it back, and a member does not want their
          // morning note to read like a dashboard.
          const better = tracked.betterHigher === null ? null : rising === tracked.betterHigher;
          direction =
            better === null
              ? rising
                ? "higher than usual"
                : "lower than usual"
              : better
                ? rising
                  ? "up, and better"
                  : "down, and better"
                : rising
                  ? "up, and worth noticing"
                  : "down, and worth noticing";
        }
      }
    }

    signals.push({
      label: tracked.label,
      recent: tracked.format(recentMean),
      direction,
    });
  }

  return signals.length ? signals : null;
}
