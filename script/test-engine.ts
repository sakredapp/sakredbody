/**
 * Engine tests — the day boundary and the day-window rule.
 *
 * These two are where the reported failures came from, and both are pure
 * functions, so they can be tested without a database.
 *
 *   npx tsx script/test-engine.ts
 */

import {
  todayInZone,
  isValidTimeZone,
  addDaysToString,
  daysBetweenStrings,
  routineDayNumber,
  DEFAULT_TIMEZONE,
} from "../shared/utils/dates.js";
import { templateRunsOnDay } from "../shared/utils/schedule.js";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ═══ 1. The day boundary ═══════════════════════════════════════════════════
// The reported bug: from late afternoon, a member west of UTC was served
// tomorrow's habits. Each case is one real instant, read from two zones.

section("Day boundary — the same instant, different days");

// 2026-08-08 23:30 UTC. Already the 9th in Sydney, still the 8th in LA.
const evening = new Date("2026-08-08T23:30:00Z");
check("UTC sees the 8th", todayInZone("UTC", evening), "2026-08-08");
check("Los Angeles sees the 8th", todayInZone("America/Los_Angeles", evening), "2026-08-08");
check("Sydney sees the 9th", todayInZone("Australia/Sydney", evening), "2026-08-09");

// 2026-08-09 00:30 UTC — the exact failure window. The server has rolled over;
// the member in LA is still on the evening of the 8th.
const justPast = new Date("2026-08-09T00:30:00Z");
check("server (UTC) has rolled to the 9th", todayInZone("UTC", justPast), "2026-08-09");
check(
  "member in LA is still on the 8th — the reported bug",
  todayInZone("America/Los_Angeles", justPast),
  "2026-08-08",
);
check("member in New York is still on the 8th", todayInZone("America/New_York", justPast), "2026-08-08");

// Midday is unambiguous everywhere in the Americas.
const midday = new Date("2026-08-08T19:00:00Z");
check("midday LA", todayInZone("America/Los_Angeles", midday), "2026-08-08");

// A retreat in the south of France, from a member normally in LA.
check("Paris", todayInZone("Europe/Paris", new Date("2026-08-08T22:30:00Z")), "2026-08-09");

section("Day boundary — bad input never throws");
check("garbage zone falls back to UTC", todayInZone("Not/AZone", evening), todayInZone(DEFAULT_TIMEZONE, evening));
check("null falls back to UTC", todayInZone(null, evening), "2026-08-08");
check("empty string falls back to UTC", todayInZone("", evening), "2026-08-08");
check("valid zone is accepted", isValidTimeZone("America/Los_Angeles"), true);
check("invalid zone is rejected", isValidTimeZone("Not/AZone"), false);

// ═══ 2. Date arithmetic on strings ═════════════════════════════════════════
// end_date was off by one: a 21-day routine starting the 1st was written as
// ending the 22nd, a day on which nothing is scheduled.

section("Routine window arithmetic");
check("21 days from Aug 1 ends Aug 21", addDaysToString("2026-08-01", 21 - 1), "2026-08-21");
check("14 days from Aug 1 ends Aug 14", addDaysToString("2026-08-01", 14 - 1), "2026-08-14");
check("start date is day 1", routineDayNumber("2026-08-01", "2026-08-01"), 1);
check("last day of a 21-day run is day 21", routineDayNumber("2026-08-01", "2026-08-21"), 21);
check("crosses a month boundary", addDaysToString("2026-08-25", 10), "2026-09-04");
check("crosses a year boundary", addDaysToString("2026-12-28", 7), "2027-01-04");
check("days between spans months", daysBetweenStrings("2026-09-04", "2026-08-25"), 10);

// Leap year, because February is where date maths goes to die.
check("leap day exists in 2028", addDaysToString("2028-02-28", 1), "2028-02-29");
check("2026 has no leap day", addDaysToString("2026-02-28", 1), "2026-03-01");

// ═══ 3. The day-window rule ════════════════════════════════════════════════
// One implementation now, called by both the initial materialisation and any
// later top-up. The audit found two that disagreed at the boundary.

section("Day windows — daily");
const daily = { dayStart: 1, dayEnd: null, cadence: "daily" as const };
check("day 1 runs", templateRunsOnDay(daily, 1, 21), true);
check("day 21 runs", templateRunsOnDay(daily, 21, 21), true);
check("day 22 does not — past the routine", templateRunsOnDay(daily, 22, 21), false);
check("day 0 does not", templateRunsOnDay(daily, 0, 21), false);

section("Day windows — phased");
const phase2 = { dayStart: 8, dayEnd: 14, cadence: "daily" as const };
check("day 7 is before the window", templateRunsOnDay(phase2, 7, 21), false);
check("day 8 opens the window", templateRunsOnDay(phase2, 8, 21), true);
check("day 14 closes it", templateRunsOnDay(phase2, 14, 21), true);
check("day 15 is past it", templateRunsOnDay(phase2, 15, 21), false);

section("Day windows — weekly recurs from its own start, not the routine's");
const weekly = { dayStart: 3, dayEnd: null, cadence: "weekly" as const };
check("day 3 — first occurrence", templateRunsOnDay(weekly, 3, 28), true);
check("day 4 — no", templateRunsOnDay(weekly, 4, 28), false);
check("day 10 — one week later", templateRunsOnDay(weekly, 10, 28), true);
check("day 17 — two weeks later", templateRunsOnDay(weekly, 17, 28), true);
check("day 24 — three weeks later", templateRunsOnDay(weekly, 24, 28), true);
check("day 1 is before it starts", templateRunsOnDay(weekly, 1, 28), false);

section("Day windows — as-needed is never pre-scheduled");
const asNeeded = { dayStart: 1, dayEnd: null, cadence: "as-needed" as const };
check("day 1", templateRunsOnDay(asNeeded, 1, 21), false);
check("day 10", templateRunsOnDay(asNeeded, 10, 21), false);

section("Day windows — a null dayStart means day 1");
const nullStart = { dayStart: null, dayEnd: null, cadence: "daily" as const };
check("day 1 runs", templateRunsOnDay(nullStart, 1, 21), true);
check("day 21 runs", templateRunsOnDay(nullStart, 21, 21), true);

// ═══ 4. A whole routine, counted ═══════════════════════════════════════════
// The member-visible question: does a 21-day protocol deliver 21 days?

section("A full 21-day run");
const templates = [
  { dayStart: 1, dayEnd: null, cadence: "daily" as const },        // every day
  { dayStart: 8, dayEnd: 14, cadence: "daily" as const },          // the clear phase
  { dayStart: 1, dayEnd: null, cadence: "weekly" as const },       // days 1, 8, 15
  { dayStart: 1, dayEnd: null, cadence: "as-needed" as const },    // never
];

const perDay: number[] = [];
for (let day = 1; day <= 21; day++) {
  perDay.push(templates.filter((t) => templateRunsOnDay(t, day, 21)).length);
}

check("21 days are covered", perDay.length, 21);
check("no day is empty", perDay.every((n) => n > 0), true);
check("day 1 — daily + weekly", perDay[0], 2);
check("day 2 — daily only", perDay[1], 1);
check("day 8 — daily + clear + weekly", perDay[7], 3);
check("day 9 — daily + clear", perDay[8], 2);
check("day 15 — daily + weekly", perDay[14], 2);
check("day 21 — daily only", perDay[20], 1);
check("total scheduled rows", perDay.reduce((a, b) => a + b, 0), 21 + 7 + 3);

// ═══ Summary ═══════════════════════════════════════════════════════════════

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
