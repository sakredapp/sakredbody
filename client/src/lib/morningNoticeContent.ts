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
/**
 * How much the member asked for.
 *
 *   brief — one line. "Day 4 — Liver Clear / 5 practices today."
 *   full  — the morning brief: protocol, practices, and how they slept, so the
 *           notification is worth reading without opening anything.
 *   off   — nothing is scheduled at all.
 *
 * A single default would be wrong in both directions: some members want a
 * nudge and treat anything longer as noise, and some want the day laid out
 * before they are upright. Asking once is cheaper than guessing.
 */
export type NoticeDepth = "off" | "brief" | "full";

export type MorningFacts = {
  routine: ActiveRoutine;
  habitCount: number;
  /** Last night, in minutes, when we have it. */
  sleepMinutes?: number | null;
  /** Their own recent average, so the comparison is theirs and not a norm. */
  sleepBaseline?: number | null;
};

function sleepLine(minutes: number, baseline: number | null | undefined): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const slept = `${h}h ${m}m`;
  if (!baseline || baseline <= 0) return `You slept ${slept}.`;
  const delta = (minutes - baseline) / baseline;
  // Under 8% is inside a normal night's variation; calling it out would invent
  // a finding, and a member who reads "below your usual" every morning stops
  // reading it at all.
  if (Math.abs(delta) < 0.08) return `You slept ${slept}, about your usual.`;
  return delta > 0 ? `You slept ${slept}, more than usual.` : `You slept ${slept}, under your usual.`;
}

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


/**
 * The full morning brief.
 *
 * Built on top of morningBody rather than beside it, so the two can never
 * disagree about whether there is anything worth saying — "off" and "nothing
 * assigned" have to mean the same thing in both.
 */
export function morningNotice(
  facts: MorningFacts,
  depth: NoticeDepth,
  dayOffset = 1
): { title: string; body: string } | null {
  if (depth === "off") return null;

  const base = morningBody(facts.routine, facts.habitCount, dayOffset);
  if (!base) return null;
  if (depth === "brief") return base;

  const lines = [base.body];
  if (typeof facts.sleepMinutes === "number" && facts.sleepMinutes > 0) {
    lines.push(sleepLine(facts.sleepMinutes, facts.sleepBaseline));
  }
  return { title: base.title, body: lines.join(" ") };
}
