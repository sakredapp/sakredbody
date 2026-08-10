/**
 * What the morning banner says, and when.
 *
 * Pure — no Capacitor import anywhere in this file, which is what lets
 * script/test-health.ts exercise the wording rules in node. The scheduling
 * itself lives in morningNotice.ts, which cannot be imported outside a device.
 *
 * The rules here are the whole feature. A notification that says "Open Sakred
 * Body" is an advert for an app the member already installed; every branch
 * below either carries something they could not have guessed, or returns null
 * so nothing fires.
 */

/** Local 07:00. Early enough to be the morning, late enough not to wake anyone. */
const HOUR = 7;
const MINUTE = 0;

/**
 * Fixed id so re-scheduling replaces rather than accumulates.
 *
 * Without it, every app open adds another notification and a member who opens
 * the app five times gets five identical banners the next morning.
 */
export const NOTIFICATION_ID = 4801;

/** How many mornings ahead to write, so a member who does not open the app still gets them. */
export const DAYS_AHEAD = 5;

type ActiveRoutine = { routine?: { name?: string | null } | null; dayNumber?: number | null } | null;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What tomorrow's banner should say, or null if it would say nothing.
 *
 * Null is a real outcome and the important one: a member with no protocol and
 * no practices assigned has nothing waiting, and telling them so every morning
 * is how an app earns a permanent "off".
 */
export function morningBody(
  routine: ActiveRoutine,
  habitCount: number,
  dayOffset = 1
): { title: string; body: string } | null {
  const name = routine?.routine?.name?.trim();
  const day = typeof routine?.dayNumber === "number" ? routine.dayNumber + dayOffset : null;

  if (!name && habitCount === 0) return null;

  if (name && day) {
    return {
      title: `Day ${day} — ${name}`,
      body:
        habitCount > 0
          ? `${plural(habitCount, "practice", "practices")} today.`
          : "Today's note is ready.",
    };
  }

  return {
    title: "Today's practice",
    body: `${plural(habitCount, "practice", "practices")} waiting.`,
  };
}

/** The next N mornings at 07:00 local, starting tomorrow. */
export function morningDates(from: Date, count: number): Date[] {
  const out: Date[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(HOUR, MINUTE, 0, 0);
    out.push(d);
  }
  return out;
}

