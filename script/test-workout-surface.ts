/**
 * While it is running, the screen is the workout.
 *
 * ── What these hold ───────────────────────────────────────────────────────
 *
 * The workout used to be a panel called `YOUR SESSION`, two-thirds of the way
 * down Build, underneath a recommendation, a history list and a habits card.
 * Everything worked; it just never said anything was happening. These hold the
 * three properties that make it a mode rather than a form:
 *
 *   it is a layer          above the portal header and the bottom nav, so the
 *                          rest of the app is behind it rather than around it
 *   collapsed is not over  putting it away touches no server state, because a
 *                          workout is running iff a row has no `finished_at`
 *   its contents are the   the list of movements is derived from the sets that
 *   server's               exist, so a force-quit gives the workout back whole
 *
 * And the movement lifecycle, which had a hole at each end: nothing could be
 * taken out of a session once added, the catalogue had no loaded single-leg
 * hinge, and "Add your own" filled everything except the name in with a guess.
 *
 * Run: tsx script/test-workout-surface.ts
 */

import { readFileSync } from "node:fs";
import { catalogueRows } from "../shared/data/exerciseCatalogue.js";

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

const sheet = code("client/src/components/build/WorkoutSheet.tsx");
const routes = code("server/training/routes.ts");

console.log("\nThe workout is a layer, not a card\n");

{
  check("it covers the screen", /fixed inset-0/.test(sheet));
  /**
   * The portal header carries `zIndex: 9999`. A layer beneath that renders the
   * app's chrome over the workout, which is the difference between a mode and
   * a modal that half-worked.
   */
  const z = sheet.match(/z-\[(\d+)\]/);
  check("above the portal header", !!z && Number(z[1]) > 9999, z?.[1] ?? "no z-index");
  check("and opaque, so the nav is gone", /bg-background/.test(sheet));

  /** The clock is a subtraction against a server timestamp, never a counter. */
  check("it shows how long", /<Elapsed[\s\S]{0,120}session\.startedAt/.test(sheet));
  check("and what it is called", /session\.title\?\.trim\(\) \|\| "Your session"/.test(sheet));
}

console.log("\nCollapsed is not closed\n");

{
  /**
   * Anchored on code rather than on a comment — `code()` strips comments, so a
   * comment marker resolves to -1 and the slice silently becomes the whole
   * file, which is an assertion that reads everything and proves nothing.
   */
  const collapseFn = sheet.slice(
    sheet.indexOf("export function WorkoutSheetProvider"),
    sheet.indexOf("function movementOf"),
  );
  check("there is a provider to read", collapseFn.length > 100, `${collapseFn.length} chars`);
  /**
   * Collapsing is local state and nothing else. The moment it writes to the
   * server it becomes a second way to end a session, and the member's mental
   * model — put it away, come back to it — stops being true.
   */
  check("collapsing writes nothing", !/apiRequest|mutate|fetch/.test(collapseFn));

  check("there is a way to put it away", /data-testid="collapse-workout"/.test(sheet));
  check("and the strip is the way back", /useWorkoutSheet\(\)/.test(code("client/src/components/build/ActiveWorkoutBar.tsx")));

  /** Only two things end it, and both of them say so to the server. */
  check("finish is a server call", /sessions\/\$\{session\.id\}\/finish/.test(sheet));
  check("discard is a server call", /"DELETE", `\/api\/training\/sessions\/\$\{session\.id\}`/.test(sheet));
}

console.log("\nWhat is in the session comes from the server\n");

{
  const open = routes.slice(routes.indexOf('"/api/training/sessions/open"'));
  const body = open.slice(0, open.indexOf("app.get(", 1));

  check("the open session carries its sets", /logged: logged\.map/.test(body));
  /**
   * With enough of the movement attached to draw the row. Without these the
   * screen would have to wait on a catalogue fetch before it knew whether a
   * row takes weight, and would paint the wrong boxes in the meantime.
   */
  for (const col of ["name", "category", "trackingType", "takesLoad", "unilateral"]) {
    check(`including ${col}`, new RegExp(`${col}: exercises\\.${col}`).test(body));
  }
  check("in the order they were done", /orderBy\(asc\(workoutSets\.setIndex\)\)/.test(body));
  check("and in the member's own unit", /out\(s\.weightKg, unit\)/.test(body));
  check("the count still comes with it", /sets: logged\.length/.test(body));

  /**
   * And the client must render without any of it. A bundled native client and
   * a deployed server are never updated in the same instant — Build 23 shipped
   * dereferencing a new field unconditionally and took the whole screen down.
   */
  const hook = code("client/src/hooks/use-open-workout.ts");
  check("the client treats it as optional", /logged\?: LoggedSet\[\]/.test(hook));
  check("and the unit too", /unit\?: "kg" \| "lb"/.test(hook));
  check("the layer degrades rather than throws", /session\.logged \?\? \[\]/.test(sheet));
  check("and falls back on the unit", /session\.unit \?\? "lb"/.test(sheet));

  /**
   * Groups are derived from the sets rather than stored beside them. A second
   * copy of the session is a second thing to fall out of step with the first —
   * which is exactly how the old screen lost its movement list on a restart.
   */
  check("the movement list is derived", /const groups = useMemo<Group\[\]>/.test(sheet));
  check("from the logged sets", /for \(const s of logged\)/.test(sheet));
  /** The only local state is what has not been written down yet. */
  check("plus what has not been logged yet", /const \[extras, setExtras\]/.test(sheet));
  check("and a movement stops being extra once it is on the server",
    /const onServer = new Set\(logged\.map/.test(sheet));
}

console.log("\nA movement can be taken back out\n");

{
  const remove = routes.slice(
    routes.indexOf('app.delete(\n    "/api/training/sessions/:id/exercises/:exerciseId"'),
  );
  const body = remove.slice(0, remove.indexOf("app.post("));

  check("the route exists", body.length > 0);
  /** Ownership in the predicate: another member's id is a refusal, not a delete. */
  check("ownership is proven first", /eq\(workoutSessions\.userId, userId\)/.test(body));
  check("a stranger's id is a refusal", /status\(404\)/.test(body));
  /**
   * One statement, not one per set. Three round trips that can half-succeed
   * leave a movement somebody asked to remove still holding its later sets.
   */
  check("it removes every set at once", /delete\(workoutSets\)[\s\S]{0,300}eq\(workoutSets\.exerciseId/.test(body));
  check("scoped to this session", /eq\(workoutSets\.sessionId, id\)/.test(body));
  check("and says how much went", /removed: removed\.length/.test(body));

  /** The member is told what they are about to lose, in the sentence. */
  check("the client offers it", /data-testid=\{`remove-movement-/.test(sheet));
  check("and names the movement", /Remove \$\{m\.name\}/.test(sheet));
  check("and counts the sets it will take", /its \$\{g\.sets\.length\} logged/.test(sheet));
  /** Nothing under it is nothing to warn about. */
  check("an empty movement goes without a confirmation",
    /g\.sets\.length === 0 \|\| confirmRemove === m\.id/.test(sheet));
}

console.log("\nThe catalogue has the movement, and 'add your own' asks\n");

{
  /** Rows carry the shape the seed writes; ids are slugged from the name. */
  const slug = (n: string) =>
    n.toLowerCase().replace(/[—–]/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const byId = new Map(catalogueRows().map((r) => [slug(r.name), r]));

  /**
   * Searching "rdl" returned Landmine RDL, Romanian Deadlift and **Single-Leg
   * RDL Reach** — a bodyweight balance drill tracked in seconds. Somebody
   * doing 35 lb × 13 per side had no row to put it in.
   */
  const sl = byId.get("single-leg-romanian-deadlift");
  check("the loaded single-leg hinge exists", !!sl);
  check("it takes load", sl?.load === true);
  check("it counts reps", sl?.tracking === "reps");
  check("it is per side", sl?.uni === true);
  check("and it is leg work", sl?.category === "legs");
  check("findable by what people type", (sl?.aliases ?? []).includes("single leg rdl"));

  /** The drill it was being confused with is still itself. */
  const reach = byId.get("single-leg-rdl-reach");
  check("the balance drill is untouched", reach?.load === false && reach?.tracking === "duration");

  const form = code("client/src/components/build/NewMovement.tsx");
  /**
   * This used to send the name and guess the rest: `full_body`, `other`,
   * bilateral, reps, takes load. The guess is permanent — the row is reused
   * every time the movement is logged again.
   */
  check("the form asks what it works", /What does it work\?/.test(form));
  check("what you use", /What do you use\?/.test(form));
  check("how it counts", /How do you count it\?/.test(form));
  check("and whether it is per side", /One side at a time\?/.test(form));
  check("a category has to be chosen", /!!category/.test(form));

  check("no surface hardcodes a category any more",
    !/category: "full_body"/.test(sheet) && !/category: "full_body"/.test(code("client/src/components/build/MemberBuild.tsx")));
  /** Every answer reaches the server, or asking was theatre. */
  for (const field of ["category", "equipment", "trackingType", "takesLoad", "unilateral"]) {
    check(`${field} is sent`, new RegExp(`${field}[,:]`).test(form.slice(form.indexOf("onCreate({"))));
  }
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
