/**
 * Coach-requested check-ins.
 *
 * ── What these hold ───────────────────────────────────────────────────────
 *
 * One body, one subjective history. A coach can ask; the answer is the member's
 * own canonical check-in and does not become the coach's because he asked. And
 * the coaching machinery is invisible to the large majority of people who have
 * no coach — absence of state is absence of UI, not a card explaining the
 * absence.
 *
 * Pure functions and source assertions. The live behaviour is verified against
 * Postgres separately.
 *
 * Run: tsx script/test-checkin-requests.ts
 */

import { readFileSync } from "node:fs";
import {
  CHECKIN_KINDS,
  CHECKIN_KIND_META,
  CHECKIN_REQUEST_STATUSES,
  checkinRequestSchema,
  isAwaiting,
} from "../shared/models/checkinRequests.js";
import { SIGNAL_KEYS } from "../shared/models/terrainSignals.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * The file with its prose removed.
 *
 * These assertions are about what the code does, and every one of these files
 * explains at length what it deliberately does *not* do — so a naive search
 * finds the very words the comment exists to disclaim.
 */
const code = (p: string) =>
  src(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("\nA request asks for the check-in that already exists\n");

/**
 * The load-bearing one. Every signal a template names must be a signal Sakred
 * already understands — the moment a coach can ask about something outside this
 * list, the answer has nowhere canonical to land and the feature has grown a
 * second questionnaire.
 */
for (const kind of CHECKIN_KINDS) {
  const meta = CHECKIN_KIND_META[kind];
  check(
    `${kind} asks only about canonical signals`,
    meta.signals.every((s) => (SIGNAL_KEYS as readonly string[]).includes(s)),
    meta.signals.filter((s) => !(SIGNAL_KEYS as readonly string[]).includes(s)).join(", "),
  );
}
check(
  "an open reflection asks for words, not scores",
  CHECKIN_KIND_META.reflection.signals.length === 0,
);
check("three shapes, not a survey builder", CHECKIN_KINDS.length === 3);

console.log("\nWhat a coach may say when asking\n");

check("asking with nothing is allowed", checkinRequestSchema.safeParse({}).success);
check("and defaults to the quick read", checkinRequestSchema.parse({}).kind === "quick");
check(
  "an invented template is refused",
  !checkinRequestSchema.safeParse({ kind: "bloodwork" }).success,
);

/**
 * Nothing a client sends can name who is being asked, who is asking, or say the
 * request is already answered. All three come from the session and the route.
 */
{
  const parsed = checkinRequestSchema.safeParse({
    kind: "quick",
    memberUserId: "somebody-else",
    coachUserId: "me",
    status: "completed",
    completedAt: "2026-08-12",
    checkinId: "11111111-2222-3333-4444-555555555555",
  });
  check("who it is for is not client-settable", parsed.success && !("memberUserId" in parsed.data));
  check("nor whose it is", parsed.success && !("coachUserId" in parsed.data));
  check("nor whether it is answered", parsed.success && !("status" in parsed.data));
  check("nor what it was answered with", parsed.success && !("checkinId" in parsed.data));
}

check("three statuses", CHECKIN_REQUEST_STATUSES.length === 3);
/**
 * No `overdue`. A due date that has passed is still a question somebody asked,
 * and a state that turns it red converts "before tomorrow's session" into a
 * compliance failure — the opposite of what asking how somebody feels is for.
 */
check("and none of them is 'overdue'", !CHECKIN_REQUEST_STATUSES.includes("overdue" as never));
check("only an open request is awaiting", isAwaiting({ status: "open" }));
check("a completed one is not", !isAwaiting({ status: "completed" }));
check("nor a withdrawn one", !isAwaiting({ status: "cancelled" }));

console.log("\nThe answer stays the member's\n");

const routes = src("server/coaching/checkinRoutes.ts");
const model = src("shared/models/checkinRequests.ts");

/**
 * No answer column anywhere on the request. The table points at the canonical
 * row; the moment it holds an `energy` of its own, Sakred has two subjective
 * histories of one body and no way to say which one is the member.
 */
for (const signal of SIGNAL_KEYS) {
  check(
    `the request table stores no ${signal} of its own`,
    !new RegExp(`\\b${signal}:\\s*(smallint|integer)`).test(model),
  );
}
check("it stores a pointer instead", /checkinId: uuid\("checkin_id"\)/.test(model));

/** Completion writes through the member's own writer, not a copy of it. */
check("completing a request writes through saveCheckin", /await saveCheckin\(\{/.test(routes));
check(
  "and there is no second upsert in the coaching path",
  !/onConflictDoUpdate/.test(routes),
  "the coaching route has its own upsert — it will drift from the member's",
);
check(
  "the member's own check-in route uses the same writer",
  /return saveCheckin\(\{/.test(src("server/habits/routes.ts")),
);

/**
 * Nobody answers on somebody else's behalf — not a coach, not an admin. The
 * entire value of the answer is that it came from the person.
 */
check(
  "completion is scoped to the member themselves",
  /eq\(coachingCheckinRequests\.memberUserId, userId\)/.test(routes),
);
check(
  "and only while the request is still open",
  /eq\(coachingCheckinRequests\.status, "open"\)/.test(routes),
);

/**
 * Asking requires the *current* relationship, with no superviseCoaching bypass.
 * An admin looking into an account has no business generating a question in
 * somebody's Today that appears to come from their coach.
 */
check("asking requires an active relationship", /await activeRelationship\(actorId, memberId\)/.test(routes));
check("with no admin bypass on asking", !/superviseCoaching/.test(code("server/coaching/checkinRoutes.ts")));
check("and a refusal is a 404, not a 403", /status\(404\)\.json\(\{ message: "No such member" \}\)/.test(routes));

/** Attribution comes from the session, never the body. */
check(
  "who asked is taken from the session",
  /requestedByUserId: actorId/.test(routes) && !/requestedByUserId: (parsed|req\.body)/.test(routes),
);

console.log("\nProvenance: requested is not the same as caused\n");

/**
 * Sarah checks in at 8am. Nick asks at noon. She answers at 2pm. She revises at
 * 6pm. There is one row for that day, and two different facts about it — and
 * printing "answered at 2:03" over 6:14's values would show a coach a body state
 * she has already corrected, with a timestamp vouching for it.
 */
check(
  "the answer is exposed as current, not as a snapshot",
  /currentCheckin:/.test(routes),
  "a field named like a snapshot invites being read as one",
);
check(
  "carrying the row's own updated time",
  /updatedAt: answer\.updatedAt/.test(routes),
);
check(
  "kept separate from when the request was completed",
  /completedAt: r\.completedAt/.test(routes),
);
{
  const ui = src("client/src/components/coach/CheckinRequests.tsx");
  check(
    "the coach screen times the completion from the request",
    /Completed \$\{time\(r\.completedAt\)\}/.test(ui),
  );
  check(
    "and times the values from the check-in row",
    /updated\{" "\}\n\s*\{time\(r\.currentCheckin\.updatedAt\)\}/.test(ui),
  );
}

console.log("\nReassignment closes the former coach's questions\n");

const relationships = src("server/coaching/relationships.ts");
check(
  "assignment closes open requests from anyone else",
  /closeRequestsFromFormerCoaches\(/.test(relationships),
);
check(
  "inside the same transaction as the reassignment",
  /closeRequestsFromFormerCoaches\(\s*input\.memberUserId,\s*input\.coachUserId,\s*input\.assignedBy,\s*tx,/.test(
    relationships,
  ),
);
check(
  "ending coaching outright does the same",
  /closeRequestsFromFormerCoaches\(memberUserId, null, memberUserId\)/.test(relationships),
);
/**
 * Cancelled, never deleted — and completed ones untouched. What she already
 * answered is her history and stays attributed to the coach who asked.
 */
check(
  "the sweep only touches open ones",
  /eq\(coachingCheckinRequests\.status, "open"\)/.test(routes),
);
check("and cancels rather than deletes", !/\.delete\(coachingCheckinRequests\)/.test(routes));

console.log("\nAbsence of state is absence of UI\n");

/**
 * ── The coaching invariant ────────────────────────────────────────────────
 *
 * Most people using Sakred have no coach. Their Today must not carry a row of
 * modules explaining the features they do not have — no "no plan assigned", no
 * "no check-in requested", no greyed-out coach tab. Somebody self-guided should
 * be barely aware this machinery exists.
 */
{
  const card = src("client/src/components/portal/CheckinRequestCard.tsx");
  const cardCode = code("client/src/components/portal/CheckinRequestCard.tsx");
  check("no open request renders nothing at all", /if \(!request\) return null;/.test(card));
  check(
    "and there is no empty state explaining the absence",
    !/No check-ins? requested|Nothing requested|no open request/i.test(cardCode),
  );

  const plan = src("client/src/components/portal/CoachPlanCard.tsx");
  const planCode = code("client/src/components/portal/CoachPlanCard.tsx");
  check("no plan renders nothing at all", /if \(!plan\) return null;/.test(plan));
  check(
    "and no placeholder saying there isn't one",
    !/No plan assigned|no coach yet/i.test(planCode),
  );

  /**
   * The tension only evaluates when there is something to compare. A plan with
   * no Build item, or a terrain that is not asking for less, is not a tension —
   * it is two facts that happen to agree.
   */
  check(
    "the plan/terrain tension needs both sides",
    /const tension = buildInPlan && terrainLean === "restore";/.test(plan),
  );
}

/**
 * The self-guided check-in belongs to everybody. A coach requesting one is a
 * reason somebody completed it, not the reason the feature exists.
 */
{
  const restore = src("client/src/components/RestoreTab.tsx");
  check("the self-guided check-in is unconditional", /<TerrainCheckin \/>/.test(restore));
  check(
    "not gated on having a coach",
    !/hasCoach|coachId|useCoach\(/.test(code("client/src/components/RestoreTab.tsx")),
    "Restore reads coaching state — a member without a coach may lose their check-in",
  );
}

/**
 * ── And the invariant that matters most ───────────────────────────────────
 *
 * Having a coach is not a fact about a body. Neither is having a plan. If either
 * reached the reading, Sakred would tell coached members something different
 * about their own physiology than it tells everybody else — and a plan feeding
 * the terrain would let the plan quietly manufacture agreement with itself.
 */
{
  const terrain = src("shared/models/terrain.ts");
  const read = src("server/terrain/read.ts");
  for (const word of ["coach", "plan", "relationship", "Coaching"]) {
    check(
      `the terrain model knows nothing about ${word}`,
      !new RegExp(`\\b${word}`, "i").test(code("shared/models/terrain.ts")),
    );
  }
  check(
    "and the reading gathers no coaching input",
    !/coachingPlans|coachRelationships|coachingCheckinRequests/.test(code("server/terrain/read.ts")),
  );
  check(
    "it reads the member's own check-in and nothing else new",
    /todaysReport\(userId, onDate\)/.test(read),
  );
}

console.log("\nOne answer to 'does this member have a plan'\n");

/**
 * ── The four gates ────────────────────────────────────────────────────────
 *
 *   Coach nav              ← an active coach_relationship
 *   Coach's Plan UI        ← an active coaching_plan
 *   Requested check-in UI  ← an open coaching_checkin_request
 *   Terrain Now            ← measured + member-reported, and nothing else
 *
 * None may be inferred from the presence of another. The split this closes was
 * real: "has a plan" was answered from legacy routine enrollment — a member
 * choosing a published routine off a shelf — so somebody whose coach had
 * demonstrably given them a plan got no nav entry and no card, because a table
 * they had never touched was empty.
 */
{
  const coachingHooks = code("client/src/hooks/use-coaching.ts");
  check(
    "the legacy plan inference is gone, not deprecated",
    !/export function useHasCoachPlan/.test(coachingHooks),
    "a second runtime authority on 'has a plan' still exists",
  );

  const canonical = code("client/src/hooks/use-coach-plan.ts");
  check(
    "the canonical reader asks the plan endpoint",
    /queryKey: \["\/api\/coaching\/plan"\]/.test(canonical),
  );
  check(
    "and nothing else claims to answer it",
    !/routines\/active/.test(canonical),
  );

  for (const consumer of [
    "client/src/components/MemberNav.tsx",
    "client/src/components/PillarHome.tsx",
    "client/src/components/portal/TodayBody.tsx",
  ]) {
    const c = code(consumer);
    check(`${consumer.split("/").pop()} reads the canonical plan`, /useHasActiveCoachPlan|useCoachPlan/.test(c));
    check(
      `${consumer.split("/").pop()} no longer infers a plan from enrollment`,
      !/useActiveEnrollment/.test(c),
      "legacy enrollment is still deciding plan UI here",
    );
  }

  /**
   * Plan UI is plan-driven, coach UI is relationship-driven. A plan whose
   * contracts are still governing somebody's day does not stop existing because
   * a coaching arrangement lapsed — the habits are live, and removing the
   * explanation for them would leave a member with practices and no account of
   * where they came from.
   */
  const planRoutes = code("server/coaching/planRoutes.ts");
  const memberRead = planRoutes.slice(planRoutes.indexOf('app.get("/api/coaching/plan"'));
  check(
    "the member's plan comes from the plan, not their current coach",
    /activePlanFor\(memberId\)/.test(memberRead.slice(0, 400)),
  );
  check(
    "with no relationship check gating it",
    !/activeRelationship|coachOf\(/.test(memberRead.slice(0, 900)),
    "a lapsed relationship would hide a plan whose habits are still live",
  );
}

console.log("\nThe doorway says what is behind it\n");

/**
 * ── Five states, and none of them is a dead-state card ────────────────────
 *
 *   coach + plan        Coach available · Your Plan available
 *   coach + no plan     Coach available · Your Plan absent
 *   no coach + plan     Coach absent    · Your Plan available
 *   neither             both absent
 *   self-enrolled only  Routines reflects it · Your Plan still absent
 *
 * The third row is the one that decides the naming. A plan can outlive the
 * relationship that produced it — its habit contracts are still governing the
 * member's day — so a destination called "Coaching" would be false exactly
 * where these gates were drawn to protect. It is the member's practice either
 * way, and the attribution lives inside the plan instead of in the doorway.
 */
{
  const nav = code("client/src/components/MemberNav.tsx");
  check(
    "the plan destination is named for the member's practice",
    /label: "Your Plan"/.test(nav),
  );
  check("not for a relationship it does not require", !/label: "Coaching"/.test(nav));
  check(
    "and it is gated on the plan, not on having a coach",
    /hasPlan \? SECONDARY/.test(nav) && !/useHasCoach\b/.test(nav),
    "the plan door depends on a coach — it would vanish while its habits are live",
  );

  /** Coach stays relationship-driven, and only that. */
  const dash = code("client/src/pages/MemberDashboard.tsx");
  check(
    "the Coach tab appears only with a live relationship",
    /hasCoach \? \[\{ id: "coach" as const, label: "Coach" \}\] : \[\]/.test(dash),
  );
  check(
    "and a member sitting on it when it ends is moved, not stranded",
    /if \(!hasCoach && coachingTab === "coach"\) setCoachingTab\("today"\)/.test(dash),
  );
  check("the destination opens on the plan's own tab", /useState<CoachingTab>\("today"\)/.test(dash));

  /** Routines is self-enrollment and is never gated on, or by, a plan. */
  check(
    "Routines is offered regardless of any plan",
    /\{ id: "routines", label: "Routines" \}/.test(dash),
  );
  const home = code("client/src/components/PillarHome.tsx");
  check("and the plan door does not open the routine catalogue", !/tab: "routines"/.test(home));

  /** The plan leads the page the plan door opens. */
  const today = code("client/src/components/portal/TodayBody.tsx");
  const planAt = today.indexOf("<CoachPlanCard");
  const tilesAt = today.indexOf("<Tile key=");
  const terrainAt = today.indexOf("<TerrainNow />");
  check("the plan card is on the page at all", planAt > 0);
  check("above the body's own record", planAt < tilesAt, `${planAt} vs ${tilesAt}`);
  check("and above the live reading", planAt < terrainAt, `${planAt} vs ${terrainAt}`);
  check("the requested check-in is up there with it", today.indexOf("<CheckinRequestCard />") < tilesAt);

  /** Attribution moved inside the plan rather than being lost. */
  const card = code("client/src/components/portal/CoachPlanCard.tsx");
  check("the plan still names the human who wrote it", /coachName/.test(card));
  check("under a heading that says whose it is", /Coach's plan/.test(card));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
