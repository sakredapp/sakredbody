/**
 * A history you cannot correct is a history you stop trusting.
 *
 * ── The two defects these were written from ───────────────────────────────
 *
 * **One workout, twice.** On 11 Aug one account had a Sakred session finishing
 * at 19:59 and an Apple Health `strength` import starting at 19:50. One
 * training session, two devices. `recentMovement` has always collapsed that
 * pair so load counted it once; `movementEvents` — which the member's own
 * history renders — did not, so Recent Build listed "Full body · 11 Aug" and
 * "Strength · 11 Aug" one above the other.
 *
 * **And no way to fix a gap.** A workout nothing recorded simply did not
 * exist. The member could see the day was missing and had no means to say so,
 * and every reading built on that history inherited the hole.
 *
 * ── What the collapse must not do ─────────────────────────────────────────
 *
 * The same account did two separate strength workouts on 14 Aug — fourteen
 * minutes at 15:20 and sixty-four at 17:36. Those are two things that happened
 * and must stay two rows. Only the double-*recording* case collapses, which is
 * why the rule names a source rather than a count.
 *
 * Run: tsx script/test-history-repair.ts
 */

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const code = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const history = code("server/movement/history.ts");
const routes = code("server/training/routes.ts");
const form = code("client/src/components/build/LogPractice.tsx");

console.log("\nOne workout is one row, whatever recorded it\n");

{
  const events = history.slice(
    history.indexOf("export async function movementEvents"),
    history.indexOf("export async function recentMovement"),
  );
  check("there is a reader to inspect", events.length > 500, `${events.length} chars`);

  /** The set is built from the Sakred events, which are pushed first. */
  check("what was logged in Sakred is indexed first",
    /const loggedCategories = new Set<string>\(\)/.test(events));
  check("keyed by day and category", /`\$\{e\.onDate\}\|\$\{c\}`/.test(events));
  check("and an imported duplicate is dropped",
    /if \(loggedCategories\.has\(`\$\{row\.onDate\}\|\$\{category\}`\)\) continue/.test(events));

  /**
   * Narrow on purpose. Two imported strength workouts on one day are two
   * sessions — 14 Aug on the account this was written from has exactly that —
   * so nothing may collapse imported into imported.
   */
  const importLoop = events.slice(events.indexOf("for (const row of imported)"));
  check("the survivor set is never added to while importing",
    !/loggedCategories\.add/.test(importLoop));
  check("so two imports of a kind stay two",
    (importLoop.match(/continue/g) ?? []).length === 2, "one for unmappable, one for the duplicate");

  /** The reduction still runs; it is now the second line of defence, not the first. */
  check("the projection keeps its own dedupe", /const claimed = new Set<string>\(\)/.test(history));
}

console.log("\nA day that was missed can be filled in\n");

{
  const practice = routes.slice(routes.indexOf('app.post("/api/training/practice"'));
  const body = practice.slice(0, practice.indexOf("app.delete("));
  check("there is a route to read", body.length > 500, `${body.length} chars`);

  check("a day can be named", /onDate: z\.string\(\)\.regex/.test(body));
  /** Both ends bounded: the future is not history, and memory is not evidence. */
  check("the future is refused", /onDate > today/.test(body));
  check("and so is the distant past", /addDaysToString\(today, -60\)/.test(body));
  check("today is still the default", /input\.onDate \?\? today/.test(body));
  check("a note travels with it", /input\.note \? \{ note: input\.note \}/.test(body));

  /**
   * Born finished, and on the chosen day — so it can never occupy the one
   * open-workout slot, and lands in the right week.
   */
  check("it is written whole, in one transaction", /transactionally<string>/.test(body));
  check("and born finished", /finishedAt: new Date\(\)/.test(body));
}

console.log("\nAnd never charges the same hour twice\n");

{
  const practice = routes.slice(routes.indexOf('app.post("/api/training/practice"'));
  const body = practice.slice(0, practice.indexOf("app.delete("));

  /**
   * Before writing anything, look for what the phone already has. The imported
   * row is the better record — real duration, heart rate, source — and lacks
   * only the thing the member came to add.
   */
  check("the imported side of the day is checked", /from\(healthWorkouts\)/.test(body));
  check("on the same day", /eq\(healthWorkouts\.onDate, onDate\)/.test(body));
  check("and only what has not been answered", /isNull\(healthWorkouts\.reviewedAt\)/.test(body));
  check("matched through the one mapper", /externalActivityCategory\(w\.workoutType\) === category/.test(body));

  /** A refusal that hands over what the caller needs to do the right thing. */
  check("it refuses rather than writing", /status\(409\)/.test(body));
  check("with a machine-readable reason", /already_imported/.test(body));
  check("and the workout it found", /workout: match/.test(body));

  /** And the member can overrule it, because two leg days is unusual, not impossible. */
  check("the member can say it was separate", /force: z\.boolean\(\)\.optional\(\)/.test(body));
  check("which is only checked, never assumed", /if \(!input\.force\)/.test(body));

  /** The client reads the 409 as an answer rather than as an error. */
  check("the client does not flatten it into an Error", /apiFetch\("\/api\/training\/practice"/.test(form));
  check("it reads the found workout", /res\.status === 409/.test(form));
  check("and offers to enrich that instead", /data-testid="clash-enrich"/.test(form));
  check("which is a PATCH, not a second session", /PATCH", `\/api\/health\/workouts\/\$\{clash!\.id\}`/.test(form));
  check("the other answer stays available", /data-testid="clash-separate"/.test(form));
  check("and it is the one that forces", /log\.mutate\(true\)/.test(form));

  /**
   * The three claims stay apart on this screen too: the platform's word, the
   * duration it measured, and the focus the member is adding.
   */
  check("the source is named", /clash\.sourceApp \? ` · from \$\{clash\.sourceApp\}`/.test(form));
  check("and the focus vocabulary is the canonical one", /WORKOUT_FOCUSES\.map/.test(form));
}

console.log("\nThe catalogue can name a whole session\n");

{
  const build = code("client/src/components/build/BuildToday.tsx");
  check("Recent Build offers the repair", /data-testid="add-past-activity"/.test(build));
  /** Including on a first week, which is exactly who has history the app never saw. */
  check("even with nothing in it yet",
    (build.match(/data-testid="add-past-activity"/g) ?? []).length === 2);
  check("and it opens the past form", /<LogPractice\s+past/.test(build));

  /**
   * "Tuesday was legs" needs a word for a session. Every entry in the catalogue
   * was a single movement, which is fine while logging as you go and useless
   * the next morning.
   */
  const catalogue = readFileSync(
    new URL("../supabase/exercise-catalogue.sql", import.meta.url),
    "utf8",
  );
  for (const [id, category] of [
    ["chest-session", "chest"],
    ["back-session", "back"],
    ["shoulder-session", "shoulders"],
    ["arm-session", "arms"],
    ["leg-session", "legs"],
    ["glute-session", "glutes"],
    ["core-session", "core"],
    ["full-body-session", "full_body"],
  ] as const) {
    const row = catalogue.split("\n").find((l) => l.includes(`('${id}',`)) ?? "";
    check(`${id} exists`, row.length > 0);
    check(`  and is ${category}`, row.includes(`'${category}'`));
    /** Held in time, never in kilograms — nobody logs "back day, 60 kg". */
    check(`  tracked in time`, row.includes("'duration'"));
  }

  /**
   * `full_body` is what an imported `strength` workout maps to, so a member
   * writing "Tuesday was a full-body day" and a watch reporting Strength
   * Training land on one category and weigh the same.
   */
  check("full body agrees with what an import becomes",
    /strength: "full_body"/.test(code("shared/models/training.ts")));

  /** The past form opens on the whole catalogue; today's quick log stays narrow. */
  check("history can name anything", /only=\{past \? undefined : "practices"\}/.test(form));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
