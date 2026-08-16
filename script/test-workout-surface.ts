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
import {
  priorSummary,
  referenceNote,
  reconcileSetStyle,
  topWorkingSet,
  type PriorPerformance,
} from "../shared/models/training.js";

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
const composition = code("server/training/composition.ts");
const migration = readFileSync(
  new URL("../supabase/2026-08-16-session-exercises.sql", import.meta.url), "utf8");

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

  /**
   * ── And the list itself is now the server's ──
   *
   * These two assertions used to require `const [extras, setExtras]` and the
   * effect that emptied it. They were pinning the bug: `extras` was a React
   * state array holding movements chosen and not yet logged, which is exactly
   * the window in which a locked phone lost one. The contract is now that a
   * movement is written down when it is chosen, so there is nothing local left
   * to reconcile.
   */
  check("composition comes down with the session", /session\.exercises\?\.length/.test(sheet));
  check("and there is no client-side list of movements any more",
    !/const \[extras, setExtras\]/.test(sheet));
  check("choosing a movement is a write", /apiRequest\("POST", `\/api\/training\/sessions\/\$\{session\.id\}\/exercises`/.test(sheet));
  check("the server writes it before the first set exists",
    /ensureSessionExercise\(sessionId, input\.exerciseId/.test(routes));
  /** Derivation from sets survives only as the fallback for an older server. */
  check("and deriving from sets is the fallback, not the rule",
    /for \(const s of logged\)/.test(sheet) &&
      sheet.indexOf("session.exercises?.length") < sheet.indexOf("for (const s of logged)"));
}

console.log("\nWhat happened last time is on the screen\n");

{
  /**
   * The endpoint existed and nothing called it — `GET /exercises/:id/history`
   * returns an estimated-1RM series, which answers a question about months.
   * Somebody at a bench is asking about last Tuesday, and nothing answered
   * that at all.
   */
  check("the open session carries previous performance", /priorPerformanceFor\(userId, ids/.test(routes));
  check("excluding the session being performed",
    /excludeSessionId \? sql`AND s\.id <> \$\{excludeSessionId\}`/.test(composition));
  check("and only finished ones count", /s\.finished_at IS NOT NULL/.test(composition));

  check("the screen shows it", /data-testid=\{`last-time-\$\{m\.id\}`\}/.test(sheet));
  check("with the date it was done", /Last time · \{priorDate\(prior\.onDate\)\}/.test(sheet));
  check("and the sets as performed", /priorSummary\(prior, unit as WeightUnit, m\.trackingType\)/.test(sheet));
  check("with a way to reuse the numbers", /data-testid=\{`use-last-\$\{m\.id\}`\}/.test(sheet));

  /**
   * The reference sentence is conditional on the warm-up in every branch. A
   * progression that demands more weight every week regardless of what the
   * body reported is wrong on precisely the weeks it matters.
   */
  const model = code("shared/models/training.ts");
  const note = model.slice(model.indexOf("export function referenceNote"));
  const body = note.slice(0, note.indexOf("\n}"));
  check("there is a reference to read", body.length > 100);
  check("it never instructs an increase", !/add \d|increase by|go up/i.test(body));
  check("progression is offered, not demanded", /There may be room to progress if the warm-up agrees/.test(body));
  check("a reported concern makes it gentler", /Start lighter and use the warm-up/.test(body));
  check("and it never says why anything hurt",
    !/because|due to|caused|injur|strain/i.test(body));
}

console.log("\nAnd the sentences it actually produces\n");

{
  const set = (weight: number, reps: number, rpe: number | null = null, isWarmup = false) => ({
    reps,
    durationSeconds: null,
    distanceM: null,
    weight,
    rpe,
    isWarmup,
  });

  /** The session from the brief, warm-up included. */
  const chest: PriorPerformance = {
    exerciseId: "incline-machine-chest-press",
    onDate: "2026-08-09",
    sets: [set(140, 10, null, true), set(210, 2), set(200, 4), set(200, 5)],
  };

  /** The unit once, at the end. Six repetitions of "lb" on one line is noise. */
  check("the summary is the working sets, in order",
    priorSummary(chest, "lb") === "210 × 2 · 200 × 4 · 200 × 5 lb",
    priorSummary(chest, "lb"));
  /** The ramp is recorded and does not belong on the line about the work. */
  check("the warm-up is not in it", !priorSummary(chest, "lb").includes("140"));
  check("the top working set is the heaviest", topWorkingSet(chest)?.weight === 210);

  /** A movement with only warm-ups is still something to report. */
  const rampOnly: PriorPerformance = {
    exerciseId: "x", onDate: "2026-08-09", sets: [set(95, 10, null, true)],
  };
  check("a session of nothing but warm-ups still says what happened",
    priorSummary(rampOnly, "lb") === "95 × 10 lb", priorSummary(rampOnly, "lb"));

  const easy = referenceNote(chest, "lb") ?? "";
  check("an unremarkable session offers room", /may be room to progress/.test(easy), easy);
  check("and states the reference in the member's unit", /210 lb × 2/.test(easy), easy);

  const hard = referenceNote(
    { ...chest, sets: [set(210, 2, 9.5)] }, "lb",
  ) ?? "";
  check("a session that was already near the top asks to be matched",
    /Matching it is a good session/.test(hard), hard);
  check("and does not ask for more", !/room to progress/.test(hard), hard);

  /**
   * The boundary, executed rather than described: a reported concern changes
   * what is suggested and says nothing about the body.
   */
  const guarded = referenceNote(chest, "lb", { quality: "discomfort" }) ?? "";
  check("a reported discomfort overrides the reference",
    /Start lighter/.test(guarded), guarded);
  check("it does not name a body part or a cause",
    !/back|shoulder|knee|hip|because|injur/i.test(guarded), guarded);
  check("and 'it felt good' is not a reason to hold back",
    /may be room to progress/.test(referenceNote(chest, "lb", { quality: "good" }) ?? ""));

  /** Nothing to say when there is nothing to say. */
  check("a movement never trained says nothing", referenceNote(null, "lb") === null);
  check("and neither does a bodyweight-only history",
    referenceNote({ ...chest, sets: [set(0, 12)] }, "lb") === null);

  /** The two spellings of warm-up, which a database CHECK holds equal. */
  check("a style decides the flag", reconcileSetStyle({ setStyle: "warmup" }).isWarmup === true);
  check("a drop set is not a warm-up", reconcileSetStyle({ setStyle: "dropset" }).isWarmup === false);
  check("an old client sending only the flag still agrees",
    reconcileSetStyle({ isWarmup: true }).setStyle === "warmup");
  check("and its working sets are normal",
    reconcileSetStyle({ isWarmup: false }).setStyle === "normal");
  check("saying nothing at all is a working set",
    reconcileSetStyle({}).setStyle === "normal" && reconcileSetStyle({}).isWarmup === false);
}

console.log("\nA set is finished work, and still the member's to correct\n");

{
  check("tapping a logged set opens it", /setEditing\(\{ id: s\.id, draft: draftOf\(s, m\) \}\)/.test(sheet));
  check("the server accepts a correction", /app\.patch\("\/api\/training\/sets\/:id"/.test(routes));
  /** Ownership through the session, in the predicate. */
  check("owned by the member who did it", /innerJoin\(workoutSessions[\s\S]{0,200}eq\(workoutSessions\.userId, userId\)/.test(routes));

  /**
   * The permanent empty row is gone. It made a movement with three sets under
   * it look unfinished forever.
   */
  check("the entry row is asked for once sets exist", /data-testid=\{`add-set-\$\{m\.id\}`\}/.test(sheet));
  check("and moving on is offered beside it", /data-testid=\{`next-exercise-\$\{m\.id\}`\}/.test(sheet));
  check("but a movement with nothing under it opens straight into the row",
    /entering\[m\.id\] \?\? g\.sets\.length === 0/.test(sheet));

  /** Superset is a relationship between movements, never a kind of set. */
  const model = code("shared/models/training.ts");
  check("the set styles do not include superset",
    /SET_STYLES = \["normal", "warmup", "dropset", "backoff"\]/.test(model));
  check("supersets live on the composition row", /supersetGroup: uuid\("superset_group"\)/.test(model));
  check("and are offered as a partner, not a type", /Superset with…/.test(sheet));
  check("with a way back out", /data-testid=\{`unpair-\$\{m\.id\}`\}/.test(sheet));

  /**
   * Two spellings of "warm-up" that a database CHECK holds equal. Both are kept
   * because every derived number already reads `is_warmup`.
   */
  check("the two warm-up columns are reconciled in one place",
    /export function reconcileSetStyle/.test(model));
  const migration = readFileSync(
    new URL("../supabase/2026-08-16-session-exercises.sql", import.meta.url), "utf8");
  check("and the database refuses a pair that disagrees",
    /check \(\(set_style = 'warmup'\) = is_warmup\)/.test(migration));
}

console.log("\nThe seven things that must survive a reload or a second tap\n");

{
  /**
   * ── Why these are listed rather than assumed ──────────────────────────────
   *
   * Every one of them is a mutation added this week, and every one has the same
   * two failure modes: it does not survive the app being closed, or it happens
   * twice when a finger lands twice on a gym network. The composition entity
   * makes the first class of bug impossible by construction for most of them —
   * which is worth stating explicitly, because "the row exists" is the whole
   * argument and it should be visible.
   */

  // 1. A movement added and never loaded survives being closed.
  check("adding a movement writes to the database, not to component state",
    /apiRequest\("POST", `\/api\/training\/sessions\/\$\{session\.id\}\/exercises`/.test(sheet));
  check("and the server writes it before any set exists",
    /await ensureSessionExercise\(sessionId, input\.exerciseId/.test(routes));
  check("a second tap cannot send a second request",
    /if \(addMovement\.isPending\) return;/.test(sheet));
  check("and the database would refuse it anyway",
    /uq_session_exercises_session_exercise/.test(migration) &&
    /onConflictDoNothing/.test(composition));

  // 2 & 3. A corrected set, and its metadata, come back after a reload.
  check("a correction is a server write", /app\.patch\("\/api\/training\/sets\/:id"/.test(routes));
  check("and the screen refetches rather than patching its own copy",
    /onSuccess: \(\) => \{\s*setEditing\(null\);\s*refreshSession\(\);/.test(sheet));
  for (const col of ["isWarmup", "setStyle", "toFailure", "rpe"]) {
    check(`the open session returns ${col}, so it survives a reload`,
      new RegExp(`${col}: workoutSets\\.${col}`).test(routes));
  }

  // 4. Superset grouping survives a cold reopen.
  check("a superset is stored on the composition row",
    /supersetGroup: sessionExercises\.supersetGroup/.test(composition));
  check("and comes back with the open session",
    /exercises: composition/.test(routes));

  // 5. `Use last` fills the boxes and logs nothing.
  {
    const fn = sheet.slice(sheet.indexOf("const useLast ="));
    const body = fn.slice(0, fn.indexOf("\n  };") + 5);
    check("there is a useLast to read", body.length > 100, `${body.length} chars`);
    check("it writes to the draft only", /patch\(g\.movement\.id/.test(body));
    check("and never logs a set", !/mutate|apiRequest|logSet/.test(body));
  }

  // 6. Removing a movement leaves nothing behind.
  check("removal takes the sets", /delete\(workoutSets\)/.test(composition));
  check("and the composition row with them", /delete\(sessionExercises\)/.test(composition));
  check("destructive, so it is confirmed with a count",
    /its \$\{g\.sets\.length\} logged/.test(sheet));

  // 7. Last time is never this time.
  check("prior performance excludes the session being performed",
    /excludeSessionId \? sql`AND s\.id <> \$\{excludeSessionId\}`/.test(composition));
  check("and every unfinished session", /s\.finished_at IS NOT NULL/.test(composition));
  check("the open route passes its own id as the exclusion",
    /priorPerformanceFor\(userId, ids, open\.id, unit\)/.test(routes));
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
  check("the removal itself is one call", /removeSessionExercise\(id, param\(req, "exerciseId"\)\)/.test(body));
  check("and says how much went", /res\.json\(\{ removed \}\)/.test(body));

  /**
   * The statements moved into `composition.ts` when composition stopped being
   * inferred from the sets. Both halves have to go: deleting only the sets left
   * the movement itself in `session_exercises`, so it came back empty on the
   * next reload — a movement somebody removed, returning.
   */
  check("one statement removes every set", /delete\(workoutSets\)[\s\S]{0,300}eq\(workoutSets\.exerciseId/.test(composition));
  check("scoped to this session", /eq\(workoutSets\.sessionId, sessionId\)/.test(composition));
  check("and the movement goes with them",
    /delete\(sessionExercises\)[\s\S]{0,300}eq\(sessionExercises\.exerciseId/.test(composition));

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
