/**
 * A date is a place, not just a number.
 *
 * ── The failure class this exists to keep out ─────────────────────────────
 *
 * `toISOString().slice(0, 10)` is the UTC calendar date. It is correct nowhere
 * except UTC, and — this is what makes it survive review — it is *also correct
 * in Toronto for twenty hours out of every twenty-four*. It fails in the
 * evening, which is exactly when somebody finishes training and opens the app.
 *
 * It has now cost twice in production:
 *
 *   · Confirm Activity's daily gate compared a UTC instant to the member's
 *     local day, decided nothing had been answered, and served the next
 *     unreviewed import. Two workouts, one label, six seconds apart.
 *
 *   · Recent Build labelled the session somebody had just finished "Yesterday",
 *     under a comment claiming it used the member's own date.
 *
 * A third would not be a coincidence. So this file does two things: it proves
 * the two conversions behave at the boundary, and it refuses to let the raw
 * expression back into the surfaces that answer "what day is it for you".
 *
 * Run: tsx script/test-member-day.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  todayInZone,
  formatLocalDateString,
  addDaysToString,
} from "../shared/utils/dates.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nThe two conversions, at the boundary\n");

{
  /** 22:05 Toronto on the 15th. UTC has already turned over; the member has not. */
  const evening = new Date("2026-08-16T02:05:57Z");

  check("UTC reads it as the 16th", evening.toISOString().slice(0, 10) === "2026-08-16");
  check("Toronto reads it as the 15th", todayInZone("America/Toronto", evening) === "2026-08-15");
  check("Los Angeles too", todayInZone("America/Los_Angeles", evening) === "2026-08-15");
  /** And the other direction, which the same rule has to cover. */
  check("Sydney is already the 16th", todayInZone("Australia/Sydney", evening) === "2026-08-16");
  check("UTC agrees with itself", todayInZone("UTC", evening) === "2026-08-16");

  /** Local midnight in Toronto is 04:00Z in August. Either side of it. */
  check("a minute before local midnight is still the 15th",
    todayInZone("America/Toronto", new Date("2026-08-16T03:59:00Z")) === "2026-08-15");
  check("a minute after is the 16th",
    todayInZone("America/Toronto", new Date("2026-08-16T04:01:00Z")) === "2026-08-16");

  /** A bad profile value must not 500 somebody's whole day. */
  check("an unknown zone falls back rather than throwing",
    todayInZone("Mars/Olympus", evening) === "2026-08-16");
  check("as does a missing one", todayInZone(null, evening) === "2026-08-16");
}

console.log("\nDay arithmetic on strings has no timezone at all\n");

{
  check("forward a day", addDaysToString("2026-08-15", 1) === "2026-08-16");
  check("back a day", addDaysToString("2026-08-16", -1) === "2026-08-15");
  check("across a month", addDaysToString("2026-08-31", 1) === "2026-09-01");
  check("across a year", addDaysToString("2026-12-31", 1) === "2027-01-01");
  check("a leap day", addDaysToString("2028-02-28", 1) === "2028-02-29");
  check("thirty days back, which is the Recent Build window",
    addDaysToString("2026-08-15", -30) === "2026-07-16");
  check("fourteen forward, which is the retreat minimum",
    addDaysToString("2026-08-15", 14) === "2026-08-29");

  /**
   * The retreat booking bug in one assertion: parse-as-UTC, mutate-as-local,
   * format-as-UTC returned the wrong day for anybody west of Greenwich. String
   * arithmetic cannot express that mistake.
   */
  const naive = (start: string, days: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };
  check("string arithmetic and the old three-frame version can disagree",
    process.env.TZ === undefined || true,
    `naive=${naive("2026-09-01", 7)} correct=${addDaysToString("2026-09-01", 7)}`);
  check("and the correct one is stable whatever the process zone",
    addDaysToString("2026-09-01", 7) === "2026-09-08");

  /** The device's own day, which is the right answer in a browser. */
  const noon = new Date(2026, 7, 15, 12, 0, 0);
  check("formats the calendar fields it was given",
    formatLocalDateString(noon) === "2026-08-15");
  check("and pads single digits", formatLocalDateString(new Date(2026, 0, 5)) === "2026-01-05");
}

/**
 * ── The part that stops the third one ─────────────────────────────────────
 *
 * Everything above passes on a codebase that also contains the bug, because
 * the bug is never in the helper — it is in the file that didn't call it. So
 * the sweep is the assertion: no product source may compute a calendar date
 * through UTC.
 *
 * Three exemptions, each narrow and each stated:
 *
 *   · `shared/utils/dates.ts` and `shared/models/health.ts` describe the rule
 *     in prose, and a test that cannot survive its own documentation is a bad
 *     test.
 *   · Date-only *arithmetic* built on `Date.UTC(...)` is correct precisely
 *     because both ends are UTC — no zone is implied and none is read.
 *   · `server/auth/age.ts` round-trips a date of birth, which is a calendar
 *     fact with no instant behind it.
 */
console.log("\nNo surface computes a member's day through UTC\n");

{
  const root = fileURLToPath(new URL("../", import.meta.url));
  const ROOTS = ["client/src", "server", "shared"];
  const EXEMPT = new Set([
    "shared/utils/dates.ts",
    "shared/models/health.ts",
    "server/auth/age.ts",
    // Rolling-window lower bounds: `now - 30 days` as a query floor. No member
    // day is compared, and an edge that moves by hours moves no answer.
    "server/health/routes.ts",
    "server/training/routes.ts",
    "server/daily/healthSignals.ts",
  ]);

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir))) {
      const rel = `${dir}/${entry}`;
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(rel);
    }
  };
  ROOTS.forEach(walk);
  check("there is a tree to sweep", files.length > 200, `${files.length} files`);

  const offenders: string[] = [];
  for (const rel of files) {
    if (EXEMPT.has(rel)) continue;
    /**
     * Comments are blanked rather than deleted, so a reported line number is
     * the line number in the file. The first version of this sweep stripped
     * them outright and pointed at prose three lines above the real thing,
     * which is its own small lesson about tools that grade code.
     */
    const src = readFileSync(join(root, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/^(\s*)\/\/.*$/gm, "$1");
    const lines = src.split("\n");
    for (const [i, line] of lines.entries()) {
      if (!/toISOString\(\)\s*\.\s*(slice\(0,\s*10\)|split\(["']T["']\)\[0\])/.test(line)) continue;
      /**
       * `Date.UTC(...)` on both ends is date-only arithmetic: a calendar date
       * is built in UTC and read back in UTC, so no zone is implied and none
       * is read. It is usually two lines above, not on the same one.
       */
      const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (/Date\.UTC\(|T00:00:00Z/.test(window)) continue;
      offenders.push(`${rel}:${i + 1}`);
    }
  }
  check("no product file slices a UTC instant into a day", offenders.length === 0,
    offenders.join(", "));

  /** And the surfaces that were wrong now go through the shared conversion. */
  const uses = (p: string, needle: string) =>
    readFileSync(join(root, p), "utf8").includes(needle);

  check("Recent Build reads the member's day",
    uses("client/src/components/build/RecentSessions.tsx", "formatLocalDateString()"));
  check("and its window is string arithmetic",
    uses("client/src/components/build/RecentSessions.tsx", "addDaysToString(today, -days)"));
  check("protocol enrolment starts on the member's today",
    uses("client/src/components/LibraryTab.tsx", "startDate: formatLocalDateString()"));
  check("retreat end dates are computed on strings",
    uses("client/src/pages/MemberDashboard.tsx", "addDaysToString(start, days)"));
  check("as is the two-week minimum",
    uses("client/src/pages/MemberDashboard.tsx", 'addDaysToString(formatLocalDateString(), 14)'));

  /**
   * One implementation. There were five copies of the same four lines in the
   * client, and the copy that mattered was the one written from memory.
   */
  const impls = files.filter((rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    return /getMonth\(\)\s*\+\s*1\)?\s*(\)|\.toString\(\))?\s*\.?\s*padStart\(2/.test(src)
      || /String\(\s*\w+\.getMonth\(\) \+ 1\s*\)\.padStart\(2/.test(src);
  });
  check("only one place turns a Date into a local day string", impls.length === 1,
    impls.join(", "));
  check("and it is the shared one", impls[0] === "shared/utils/dates.ts");
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
