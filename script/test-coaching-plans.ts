/**
 * The Coach's Plan — what activation would do, and whether it may.
 *
 * ── The rule these exist to hold ──────────────────────────────────────────
 *
 * A human coach does not get a bypass. The constraints that govern what Sakred
 * suggests govern what a coach may activate, because the member's body does not
 * know the difference between a recommendation and an instruction.
 *
 * And the review is the plan of record: the screen a coach approves and the
 * transaction that runs are the same object. These pin the resolution — most
 * importantly that a client's stated `intent` is never trusted over what is
 * actually true of the member.
 *
 * Pure functions only. The live behaviour of activation is verified separately
 * against Postgres.
 *
 * Run: tsx script/test-coaching-plans.ts
 */

import { readFileSync } from "node:fs";
import { reviewPlan, weeklyFrequency, type ReviewHabit } from "../shared/models/planReview.js";
import {
  planDraftSchema,
  planItemSchema,
  planRanItsCourse,
  PLAN_STATUSES,
} from "../shared/models/coachingPlans.js";
import { stressLoadOf } from "../shared/models/loadClass.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const habit = (over: Partial<ReviewHabit> & { id: string; title: string }): ReviewHabit => ({
  emphasis: "yang",
  trackingType: "quantity",
  defaultTarget: null,
  loadClass: "supportive",
  terrainFit: "either",
  maxPerWeek: null,
  priorityLevel: "supportive",
  ...over,
});

const PROTEIN = habit({ id: "h-protein", title: "Protein", defaultTarget: 140, loadClass: "building" });
const MINERALS = habit({ id: "h-minerals", title: "Morning minerals", trackingType: "boolean", emphasis: "yin" });
const COLD = habit({ id: "h-cold", title: "Cold exposure", loadClass: "adaptive-stressor", terrainFit: "build", maxPerWeek: 3, trackingType: "boolean" });
const SAUNA = habit({ id: "h-sauna", title: "Sauna", loadClass: "adaptive-stressor", terrainFit: "build", trackingType: "boolean" });
const FASTING = habit({ id: "h-fast", title: "Extended fast", loadClass: "adaptive-stressor", terrainFit: "build", maxPerWeek: 1, trackingType: "boolean" });
const CATALOGUE = [PROTEIN, MINERALS, COLD, SAUNA, FASTING];

const base = {
  catalogue: CATALOGUE,
  live: [] as never[],
  terrainLean: "either" as const,
  carryingLoadClasses: [] as string[],
  declaredConflicts: [] as never[],
};

console.log("\nWhat activation would actually do\n");

{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-protein", intent: "add", target: 165, schedule: null }],
  });
  check("a practice they don't keep is an add", r.changes[0].action === "add");
  check("with no 'from'", r.changes[0].from === null);
  check("and it may activate", r.canActivate);
}

/**
 * The most load-bearing resolution in the file. A coach adding something the
 * member already keeps means *change* — honouring the literal `add` would
 * create a second standing habit and split their history in two.
 */
{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-protein", intent: "add", target: 165, schedule: null }],
    live: [
      { routineHabitId: "h-protein", trackedHabitId: "t1", target: 140, scheduleKind: "daily", scheduleCount: null },
    ] as never,
  });
  check("'add' for something they already keep resolves to change", r.changes[0].action === "change");
  check("and says what it is changing from", r.changes[0].from === "140");
  check("and to", r.changes[0].to === "165");
}

{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-protein", intent: "add", target: 140, schedule: null }],
    live: [
      { routineHabitId: "h-protein", trackedHabitId: "t1", target: 140, scheduleKind: "daily", scheduleCount: null },
    ] as never,
  });
  check("the same contract restated is a keep", r.changes[0].action === "keep");
}

{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-cold", intent: "end", target: null, schedule: null }],
    live: [
      { routineHabitId: "h-cold", trackedHabitId: "t2", target: null, scheduleKind: "daily", scheduleCount: null },
    ] as never,
  });
  check("ending something they keep is an end", r.changes[0].action === "end");
  check("with no 'to'", r.changes[0].to === null);
}

{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-cold", intent: "end", target: null, schedule: null }],
  });
  check("ending something they never had changes nothing", r.changes[0].action === "keep");
}

/**
 * A Coach's Plan is not a replacement for the member's life. Sarah's own
 * morning walk is hers, and absence from a plan is not an instruction to stop.
 */
{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-protein", intent: "add", target: 165, schedule: null }],
    live: [
      { routineHabitId: "h-protein", trackedHabitId: "t1", target: 140, scheduleKind: "daily", scheduleCount: null },
      { routineHabitId: "h-minerals", trackedHabitId: "t9", target: null, scheduleKind: "daily", scheduleCount: null },
    ] as never,
  });
  check("a habit the plan never mentions is untouched", r.changes.length === 1);
  check("and it is not the one they kept themselves", r.changes[0].routineHabitId === "h-protein");
}

/**
 * A second revision on top of the first.
 *
 * 140 → 165 was verified against Postgres. The thing worth pinning here is that
 * the review reads *what is live*, not what the plan previously said: after
 * activation the live contract is 165, so 175 is a change from 165, not another
 * change from 140. A review that reasoned from the old plan would keep offering
 * to make a change the member is already on.
 */
{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-protein", intent: "change", target: 175, schedule: null }],
    live: [
      { routineHabitId: "h-protein", trackedHabitId: "t1", target: 165, scheduleKind: "daily", scheduleCount: null },
    ] as never,
  });
  check("a revision on top of a revision is still one change", r.changes.length === 1);
  check("measured from the live contract, not the old plan", r.changes[0].from === "165");
  check("to the new number", r.changes[0].to === "175");
  check("and it may activate", r.canActivate);
}

console.log("\nThe catalogue's own ceilings are not the coach's to raise\n");

{
  const r = reviewPlan({
    ...base,
    items: [
      {
        routineHabitId: "h-cold",
        intent: "add",
        target: null,
        schedule: { kind: "times_per_week", count: 5 },
      },
    ],
  });
  check("5× a week against a cap of 3 is refused", !r.canActivate);
  check("and it is a block, not a warning", r.findings.some((f) => f.level === "block"));
  check("naming the practice", r.findings[0].routineHabitId === "h-cold");
}

{
  const r = reviewPlan({
    ...base,
    items: [
      {
        routineHabitId: "h-cold",
        intent: "add",
        target: null,
        schedule: { kind: "times_per_week", count: 3 },
      },
    ],
  });
  check("exactly at the cap is fine", r.canActivate);
}

/** Daily is seven, and seven exceeds a cap of one. */
{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-fast", intent: "add", target: null, schedule: { kind: "daily" } }],
  });
  check("daily fasting against a cap of one is refused", !r.canActivate);
}

check("daily counts as seven a week", weeklyFrequency({ kind: "daily" }) === 7);
check("three named days count as three", weeklyFrequency({ kind: "days_of_week", days: [1, 3, 5] }) === 3);
check("times-per-week counts itself", weeklyFrequency({ kind: "times_per_week", count: 4 }) === 4);
check("no schedule at all is daily", weeklyFrequency(null) === 7);

console.log("\nStacking stressors on a body that is already short\n");

{
  const r = reviewPlan({
    ...base,
    terrainLean: "restore",
    // Within cold's weekly cap, so the only thing this can raise is the load
    // warning — otherwise the cap blocks and the test proves nothing about it.
    items: [
      { routineHabitId: "h-cold", intent: "add", target: null, schedule: { kind: "times_per_week", count: 2 } },
    ],
  });
  check("an adaptive stressor into a restore lean warns", r.findings.some((f) => f.level === "warn"));
  /**
   * A warning, not a block. The coach may have a reason, and the reading is
   * about this week while the plan covers a fortnight — so the tension is shown
   * and the human decides. There is no override system to invent here.
   */
  check("but does not block a human's judgement", r.canActivate);
}

{
  const r = reviewPlan({
    ...base,
    terrainLean: "build",
    items: [
      { routineHabitId: "h-cold", intent: "add", target: null, schedule: { kind: "times_per_week", count: 2 } },
      { routineHabitId: "h-sauna", intent: "add", target: null, schedule: null },
    ],
    carryingLoadClasses: ["adaptive-stressor"],
  });
  check("three stressors at once warns even on a build lean", r.findings.some((f) => f.level === "warn"));
  check("and still lets a human decide", r.canActivate);
}

{
  const r = reviewPlan({
    ...base,
    terrainLean: "restore",
    items: [{ routineHabitId: "h-minerals", intent: "add", target: null, schedule: null }],
  });
  check("something supportive into a restore lean is quiet", r.findings.length === 0);
}

/** The canonical numbers, used rather than re-derived. */
check("a stressor costs more than something supportive",
  stressLoadOf(["adaptive-stressor"]) > stressLoadOf(["supportive"]));
check("and supportive costs nothing", stressLoadOf(["supportive"]) === 0);

console.log("\nTerrain fit is shown, not enforced\n");

{
  const r = reviewPlan({
    ...base,
    terrainLean: "restore",
    items: [{ routineHabitId: "h-sauna", intent: "add", target: null, schedule: null }],
  });
  check("a build-fit practice into a restore week warns", r.findings.some((f) => f.level === "warn"));
  check("the message names both sides", /restore/.test(r.findings.map((f) => f.message).join(" ")));
}

{
  const r = reviewPlan({
    ...base,
    terrainLean: null,
    items: [{ routineHabitId: "h-sauna", intent: "add", target: null, schedule: null }],
  });
  check("with no synced body, terrain is not guessed at", !r.checked.terrainFit);
  check("and nothing is claimed about fit", r.findings.length === 0);
}

console.log("\nDeclared conflicts, and honesty about what was checked\n");

{
  const r = reviewPlan({
    ...base,
    items: [
      { routineHabitId: "h-fast", intent: "add", target: null, schedule: { kind: "times_per_week", count: 1 } },
      { routineHabitId: "h-cold", intent: "add", target: null, schedule: null },
    ],
    declaredConflicts: [
      { habitId: "h-fast", relatedHabitId: "h-cold", note: "Two stressors competing for the same recovery." },
    ] as never,
  });
  check("a declared conflict blocks", !r.canActivate);
  check("using the catalogue's own wording", r.findings.some((f) => /competing/.test(f.message)));
  check("and says the question was asked", r.checked.declaredConflicts);
}

/**
 * `habit_relations` is empty in production. A review that printed "no conflicts
 * found" on the strength of an empty table would be a check-shaped
 * reassurance, so the screen is told which questions were actually asked.
 */
{
  const r = reviewPlan({
    ...base,
    items: [
      { routineHabitId: "h-cold", intent: "add", target: null, schedule: { kind: "times_per_week", count: 2 } },
    ],
  });
  check("with no relations declared, it does not claim to have checked", !r.checked.declaredConflicts);
  check("but the catalogue limits were checked", r.checked.catalogueLimits);
  check("and the load always is", r.checked.stressLoad);
}

console.log("\nA missing practice is a refusal, not a skip\n");

{
  const r = reviewPlan({
    ...base,
    items: [{ routineHabitId: "h-deleted", intent: "add", target: null, schedule: null }],
  });
  check("an unknown practice blocks activation", !r.canActivate);
  check("and produces no change line", r.changes.length === 0);
}

console.log("\nWhat a client may say about a plan\n");

check("a title is required", !planDraftSchema.safeParse({}).success);
check("a title is enough", planDraftSchema.safeParse({ title: "Restore capacity" }).success);
{
  const parsed = planDraftSchema.safeParse({
    title: "x",
    status: "active",
    activatedAt: "2026-01-01",
    memberUserId: "somebody-else",
    coachUserId: "me",
  });
  check("status is not client-settable", parsed.success && !("status" in parsed.data));
  check("nor activation", parsed.success && !("activatedAt" in parsed.data));
  check("nor who it is for", parsed.success && !("memberUserId" in parsed.data));
  check("nor whose it is", parsed.success && !("coachUserId" in parsed.data));
}

check("a practice must be a catalogue id", !planItemSchema.safeParse({ routineHabitId: "protein" }).success);
check(
  "a real one is accepted",
  planItemSchema.safeParse({ routineHabitId: "11111111-2222-3333-4444-555555555555" }).success,
);
/** No free-text practice anywhere in the API. */
{
  const parsed = planItemSchema.safeParse({
    routineHabitId: "11111111-2222-3333-4444-555555555555",
    title: "Do 200 burpees",
  });
  check("a typed-in practice name is dropped", parsed.success && !("title" in parsed.data));
}

console.log("\nStatuses we can define, and nothing else\n");

check("three of them", PLAN_STATUSES.length === 3);
/**
 * No `completed`. Whether a plan ran its course is `ended_at >= ends_on` —
 * derivable, and a derivable fourth state is one two code paths eventually
 * disagree about. Same reasoning that kept `classification_source` off imported
 * workouts and `paused` off coach relationships.
 */
check("and none of them is 'completed'", !PLAN_STATUSES.includes("completed" as never));
check(
  "a plan ended on its last day ran its course",
  planRanItsCourse({ endedAt: "2026-08-27T10:00:00Z", endsOn: "2026-08-27" }),
);
check(
  "one stopped early did not",
  !planRanItsCourse({ endedAt: "2026-08-20T10:00:00Z", endsOn: "2026-08-27" }),
);
check("an open-ended plan never claims to have finished",
  !planRanItsCourse({ endedAt: "2026-08-20T10:00:00Z", endsOn: null }));

console.log("\nActivation is one transaction — and one connection\n");

/**
 * ── Why this is checked in source rather than exercised ───────────────────
 *
 * The failure these guard against is not a Postgres question. Postgres rolls
 * back what is in a transaction; that was never in doubt. The question is
 * whether activation's writes are *in* one — and the answer turned on a detail
 * invisible at every call site: `db` is a pool, so `db.transaction()` checks out
 * a fresh connection, and a `db.transaction` invoked from inside another one
 * commits independently of it.
 *
 * Which is what activation used to do. Each writer was transactional, the
 * activation block was transactional, every comment said atomic, and a failure
 * on the fifth change would still have committed the first four to the member's
 * live routine while the plan rolled back to a draft.
 *
 * The fix is one word at three call sites, and nothing about the code's shape
 * makes its absence visible — no type breaks, no test fails, the transaction is
 * right there in the diff. So the guard is the word itself.
 *
 * These cannot run the code: `contracts.ts` reaches the database at import, and
 * there is no database here. The live rollback was verified separately against
 * Postgres.
 */
const contractsSrc = readFileSync(new URL("../server/habits/contracts.ts", import.meta.url), "utf8");
const plansSrc = readFileSync(new URL("../server/coaching/plans.ts", import.meta.url), "utf8");
const activation = plansSrc.slice(plansSrc.indexOf("export async function activatePlan"));

check("activation opens a transaction", /await db\.transaction\(async \(tx\) => \{/.test(activation));

for (const writer of ["addTrackedHabit", "reconfigure", "completePhase"] as const) {
  const at = activation.indexOf(`${writer}({`);
  const call = at < 0 ? "" : activation.slice(at, activation.indexOf("});", at));
  check(`activation calls ${writer}`, at >= 0);
  check(
    `and hands it the transaction, so its writes roll back with the plan`,
    /\btx,/.test(call),
    `${writer} is called on the pool — it would commit on its own`,
  );

  // The other half: the writer has to honour what it is handed.
  const decl = contractsSrc.slice(contractsSrc.indexOf(`export async function ${writer}(`));
  // Signature through the line that opens the transaction — the two halves
  // that have to agree.
  const opens = decl.slice(0, decl.indexOf("=> {"));
  check(`${writer} accepts a caller's transaction`, /tx\?: Tx;/.test(opens));
  check(
    `${writer} joins it rather than opening its own`,
    /return inTransaction\(opts\.tx,/.test(opens),
    "still calls db.transaction — a second connection, committing independently",
  );
}

/**
 * And the helper itself. `fn(tx)` — the caller's transaction, used directly.
 * Anything that reaches for `db` here is a new connection again.
 */
{
  const helper = contractsSrc.slice(
    contractsSrc.indexOf("function inTransaction"),
    contractsSrc.indexOf("function inTransaction") + 400,
  );
  const body = helper.slice(helper.indexOf("{")).replace(/\s+/g, " ");
  check(
    "a supplied transaction is used as-is",
    body.includes("return tx ? fn(tx) : db.transaction(fn);"),
  );
}

/**
 * Nothing outside a coordinated change should be passing one. A route handler
 * that opened a transaction to wrap a single write would be holding a
 * connection for the length of an HTTP request for no reason.
 */
{
  const routes = readFileSync(new URL("../server/habits/routes.ts", import.meta.url), "utf8");
  check("ordinary member and coach writes still transact for themselves", !/\btx,/.test(routes));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
