/**
 * The parts of a day, and which one a habit belongs to.
 *
 * The mockups lay the day out as a rhythm — morning, then midday, then
 * evening — rather than as a flat checklist. That reads as a plan instead of
 * a backlog, which is the difference between "here are eleven things" and
 * "here is your morning".
 *
 * ── Bands, not clock times ────────────────────────────────────────────────
 *
 * The mockup prints 6:00 AM, 8:00 AM, 12:00 PM. We don't have that and
 * shouldn't invent it. `routine_habits.recommendedTime` is free text —
 * "Morning", "Before bed", "Anytime" — because a protocol says "on waking",
 * not "at 06:00". Making coaches schedule to the minute would break the thing
 * that makes a protocol fit a life.
 *
 * So the day is banded. Same idea, honest version, and it degrades properly:
 * a protocol whose author never set a time still renders, everything just
 * lands in Anytime.
 *
 * ── Why matching is substring, and ordered ────────────────────────────────
 *
 * The field is typed by hand, so "Morning", "morning (on waking)" and "AM"
 * all appear. Bands are tested in the order below and the first hit wins,
 * which is why `evening` lists "before bed" — a value like "evening, before
 * bed" must not fall through to Anytime.
 */

export interface DayBand {
  key: string;
  label: string;
  match: string[];
}

/**
 * `anytime` is last despite being the default: something with no stated time
 * is what you fit around the things that have one.
 */
export const DAY_BANDS: DayBand[] = [
  { key: "morning", label: "Morning", match: ["morning", "waking", "wake", "sunrise", "am"] },
  { key: "midday", label: "Midday", match: ["midday", "afternoon", "noon", "lunch"] },
  { key: "evening", label: "Evening", match: ["evening", "night", "bed", "sunset", "pm"] },
  { key: "anytime", label: "Anytime", match: [] },
];

export function bandOf(recommendedTime?: string | null): string {
  if (!recommendedTime) return "anytime";
  const t = recommendedTime.trim().toLowerCase();
  for (const b of DAY_BANDS) {
    if (b.match.some((m) => t.includes(m))) return b.key;
  }
  return "anytime";
}

/**
 * Group anything carrying a `recommendedTime` into the bands, dropping the
 * ones nothing landed in so an empty band never prints a heading.
 */
export function groupByBand<T extends { recommendedTime?: string | null }>(
  items: T[],
): Array<{ key: string; label: string; items: T[] }> {
  return DAY_BANDS.map((b) => ({
    key: b.key,
    label: b.label,
    items: items.filter((i) => bandOf(i.recommendedTime) === b.key),
  })).filter((b) => b.items.length > 0);
}
