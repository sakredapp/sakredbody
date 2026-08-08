/**
 * The day-window rule.
 *
 * Whether a habit template is scheduled on a given day of a routine. There is
 * exactly one implementation, and it lives in shared/ for two reasons: the
 * audit found two server-side copies that disagreed at the boundary, and the
 * client needs the same answer to preview a protocol before enrolling.
 *
 * Pure — no database, no clock. Testable on its own.
 */

export interface SchedulableTemplate {
  dayStart: number | null;
  dayEnd: number | null;
  cadence: string;
}

export function templateRunsOnDay(
  habit: SchedulableTemplate,
  dayNumber: number,
  durationDays: number,
): boolean {
  const dayStart = habit.dayStart ?? 1;
  const dayEnd = habit.dayEnd ?? durationDays;
  if (dayNumber < dayStart || dayNumber > dayEnd) return false;

  // as-needed habits are never pre-scheduled — they're a reference, not a task.
  if (habit.cadence === "as-needed") return false;

  // Weekly recurs from its own first day, not from the routine's. A habit that
  // starts on day 3 lands on 3, 10, 17 — not 1, 8, 15.
  if (habit.cadence === "weekly") return (dayNumber - dayStart) % 7 === 0;

  return true;
}

/**
 * How many rows a routine will materialise. Useful for showing a member what
 * they're committing to before they commit to it.
 */
export function countScheduledRows(
  templates: SchedulableTemplate[],
  durationDays: number,
): number {
  let total = 0;
  for (let day = 1; day <= durationDays; day++) {
    for (const t of templates) if (templateRunsOnDay(t, day, durationDays)) total++;
  }
  return total;
}
