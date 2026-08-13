/**
 * Durable notifications.
 *
 * ── What these hold ───────────────────────────────────────────────────────
 *
 * A notification exists because something actually happened — not because a
 * feature exists and wants attention. It is evidence of an event, never a
 * state: an old `checkin_requested` cannot reopen a request, an old
 * `plan_activated` cannot resurrect a plan, and no notification grants access
 * to anything.
 *
 * And nothing about a body ever reaches one. These rows are written to be safe
 * on a lock screen, because one day they will be on one.
 *
 * Pure functions and source assertions. Live transactional behaviour is
 * verified against Postgres separately.
 *
 * Run: tsx script/test-notifications.ts
 */

import { readFileSync } from "node:fs";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_COPY,
  dedupeKeyFor,
  type NotificationType,
} from "../shared/models/notifications.js";
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
const code = (p: string) =>
  src(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("\nHuman events only\n");

/**
 * Every type is something a *person* did. No sleep alert, no readiness drop, no
 * step count. A coach can look at authorized terrain when they choose to; a
 * product that pushes body state at them has made the member into a monitored
 * subject rather than somebody being coached.
 */
for (const t of NOTIFICATION_TYPES) {
  check(
    `${t} is a human event`,
    !/sleep|hrv|readiness|steps|recovery|terrain|weight|heart/i.test(t),
  );
  check(`${t} is a coaching event`, t.startsWith("coaching."));
}
check("four of them, and no more", NOTIFICATION_TYPES.length === 4);

/**
 * No `coaching.plan_revised`. Revising an active plan is not an operation this
 * app has — every mutating plan route requires a draft, so a "revision" is a
 * new plan with a new id whose activation already notifies. A revision type
 * would need a stable revision identity to dedupe on, and inventing one to fill
 * the gap would be faking idempotency.
 */
check(
  "nothing claims to notify a revision we cannot identify",
  !NOTIFICATION_TYPES.includes("coaching.plan_revised" as never),
);
{
  const planRoutes = code("server/coaching/planRoutes.ts");
  const mutating = planRoutes.match(/app\.(post|patch|delete)\(/g) ?? [];
  const draftGated = planRoutes.match(/requirePlan\(\{ mustBeDraft: true \}\)/g) ?? [];
  check(
    "because every plan mutation still requires a draft",
    draftGated.length >= mutating.length - 3,
    `${draftGated.length} draft-gated of ${mutating.length} mutating`,
  );
}

console.log("\nNothing about a body reaches a notification\n");

/**
 * The copy takes a first name and nothing else. There is no parameter that
 * could carry a value — the function cannot leak what it cannot receive.
 */
for (const t of NOTIFICATION_TYPES) {
  const { title, body } = NOTIFICATION_COPY[t]("Nick");
  const text = `${title} ${body ?? ""}`;
  check(`"${title}" carries no number`, !/\d/.test(text));
  for (const signal of SIGNAL_KEYS) {
    check(`"${title}" says nothing about ${signal}`, !new RegExp(signal, "i").test(text));
  }
  check(`"${title}" says nothing about sleep or recovery`, !/sleep|recover|depleted|sore/i.test(text));
}
{
  const { title, body } = NOTIFICATION_COPY["coaching.message"]("Nick");
  check("a message notification does not quote the message", !/["\u201c]/.test(`${title} ${body ?? ""}`));
}

/**
 * Attribution and provenance must agree. An admin acting under
 * `superviseCoaching` is not the member's coach, and printing "Nick updated
 * your Coach's Plan" over somebody else's action is the same lie the plan
 * tables refuse to store.
 */
{
  const named = NOTIFICATION_COPY["coaching.plan_activated"]("Nick");
  const anon = NOTIFICATION_COPY["coaching.plan_activated"]("");
  check("a coach's own action names them", named.title.includes("Nick"));
  check("an admin's action names nobody", !/Nick|coach/i.test(anon.title.replace(/Coach's Plan/, "")));
  check("but still says what happened", /updated/.test(anon.title));
}

console.log("\nDedupe is built from things that survive a retry\n");

const key = dedupeKeyFor({
  type: "coaching.message",
  resourceId: "11111111-2222-3333-4444-555555555555",
  recipientId: "u1",
});
check("the same event twice yields the same key", key === dedupeKeyFor({
  type: "coaching.message",
  resourceId: "11111111-2222-3333-4444-555555555555",
  recipientId: "u1",
}));
check("different recipients are different notifications", key !== dedupeKeyFor({
  type: "coaching.message",
  resourceId: "11111111-2222-3333-4444-555555555555",
  recipientId: "u2",
}));
check("different events are different notifications", key !== dedupeKeyFor({
  type: "coaching.checkin_requested",
  resourceId: "11111111-2222-3333-4444-555555555555",
  recipientId: "u1",
}));
/** No clock, no randomness, no rendered copy — each would break on retry. */
{
  const modelCode = code("shared/models/notifications.ts");
  const fn = modelCode.slice(modelCode.indexOf("export function dedupeKeyFor"));
  check("the key uses no clock", !/Date\.|now\(\)/.test(fn));
  check("and no randomness", !/random|uuid/i.test(fn));
  check("and no rendered sentence", !/title|body|COPY/.test(fn));
}

console.log("\nWritten with the thing that happened\n");

const create = code("server/notifications/create.ts");
check(
  "the writer takes a transaction, and cannot be called without one",
  /export async function notify\(\s*tx: Tx,/.test(create),
  "an optional tx makes the unsafe form the one that compiles",
);
check("and defends against duplicates in the database", /onConflictDoNothing/.test(create));
check("nobody is notified about their own action", /input\.recipientId === input\.actorId/.test(create));

/**
 * Each producer writes its notification inside the same transaction as the
 * business fact. A rolled-back activation cannot notify — not because a handler
 * checked, but because the row rolls back with everything else.
 */
for (const [file, fn] of [
  ["server/coaching/messageRoutes.ts", "transactionally"],
  ["server/coaching/checkinRoutes.ts", "transactionally"],
  ["server/coaching/plans.ts", "transactionally"],
] as const) {
  const c = code(file);
  check(`${file.split("/").pop()} notifies inside a transaction`, /await notify\(tx, \{/.test(c));
  check(`${file.split("/").pop()} opens it with ${fn}`, new RegExp(`${fn}\\(async \\(tx\\)`).test(c));
  check(
    `${file.split("/").pop()} never notifies outside one`,
    !/await notify\(db,/.test(c),
  );
}

/**
 * The completion path was three independently committed truths before this:
 * the answer, the request's completion, the coach's notification. A failure
 * between the first and second saved her answer against a request still marked
 * open — she would be asked again, and he would never learn she replied.
 */
{
  const c = code("server/coaching/checkinRoutes.ts");
  const completion = c.slice(c.indexOf("checkin-requests/:id/complete"));
  check("completion saves the answer on the caller's transaction", /saveCheckin\(\{[^}]*tx \}\)/.test(completion));
  check("and marks the request complete on the same one", /await tx\s*\n?\s*\.update\(coachingCheckinRequests\)/.test(completion));
  check("and notifies on it too", /await notify\(tx, \{/.test(completion));

  const checkin = code("server/habits/checkin.ts");
  check("the shared writer accepts a caller's transaction", /tx\?: Tx;/.test(checkin));
  check("and uses it when given one", /const conn = opts\.tx \?\? db;/.test(checkin));
}

/** The answer goes to the coach who asked, not to whoever coaches her now. */
{
  const c = code("server/coaching/checkinRoutes.ts");
  check(
    "a completion answers the coach who asked",
    /recipientId: updated\.coachUserId/.test(c),
    "reading the current coach would send Gerard an answer to Nick's question",
  );
}

console.log("\nA notification is evidence, not a state\n");

/**
 * The four gates are unchanged, and a notification cannot create any of them.
 */
{
  const inbox = code("server/notifications/inbox.ts");
  check("the inbox only ever reads your own", !/req\.params\.userId|memberId/.test(inbox));
  check("with no admin surveillance route", !/superviseCoaching|manageMembers/.test(inbox));
  check(
    "every query is scoped by the session",
    (inbox.match(/eq\(notifications\.userId, userId\)/g) ?? []).length >= 3,
  );

  const hooks = code("client/src/hooks/use-notifications.ts");
  check("the client reads counts, not state", !/status|isOpen|hasPlan/.test(hooks));

  /** The request card still reads the request, and the plan card the plan. */
  const requestCard = code("client/src/components/portal/CheckinRequestCard.tsx");
  check(
    "the check-in card is still driven by the open request",
    /\/api\/coaching\/checkin-requests/.test(requestCard) && !/notifications/.test(requestCard),
  );
  const planCard = code("client/src/components/portal/CoachPlanCard.tsx");
  check("the plan card is still driven by the plan", !/notifications/.test(planCard));
}

console.log("\nTwo unread systems, reconciled in one direction\n");

/**
 * `coaching_messages.read_at` answers "has this message been seen"; a
 * notification answers "has this event been acknowledged". Both are worth
 * having. What must not happen is a badge stuck at 1 over a thread with nothing
 * unread in it, because the two never spoke.
 */
{
  const messages = code("server/coaching/messageRoutes.ts");
  const markRead = messages.slice(messages.indexOf("async function markRead"));
  check(
    "opening the conversation settles the notifications too",
    /markResourceSeen\(\{/.test(markRead.slice(0, 1600)),
  );
  check(
    "and the message rows are still the thread's own truth",
    /\.update\(coachingMessages\)/.test(markRead.slice(0, 600)),
  );
  /** Not the reverse: dismissing a badge must not mark a message read. */
  const inbox = code("server/notifications/inbox.ts");
  check("dismissing a notification does not mark a message read", !/coachingMessages/.test(inbox));
}

console.log("\nWe do not ask for permission we cannot honour\n");

{
  const native = src("client/src/lib/nativeNotifications.ts");
  const nativeCode = code("client/src/lib/nativeNotifications.ts");
  check("push delivery is explicitly off", /export const PUSH_DELIVERY_ENABLED = false;/.test(native));
  check(
    "and init returns before asking for anything",
    /if \(!PUSH_DELIVERY_ENABLED\) return null;/.test(nativeCode),
  );
  {
    const init = nativeCode.slice(nativeCode.indexOf("export async function initNativeNotifications"));
    const gate = init.indexOf("PUSH_DELIVERY_ENABLED");
    const ask = init.indexOf("requestPermissions");
    check("the gate comes before the prompt", gate >= 0 && gate < ask);
  }
  check("nothing calls init yet", !/initNativeNotifications\(\)/.test(
    [
      "client/src/pages/MemberDashboard.tsx",
      "client/src/hooks/use-auth.ts",
      "client/src/main.tsx",
    ].map(code).join("\n"),
  ));

  /** The registration bug: an absolute URL sails past the bearer-token patch. */
  check("registration authenticates", /await apiFetch\("\/api\/notifications\/token"/.test(nativeCode));
  check("and no longer uses a bare fetch", !/fetch\(apiUrl\(/.test(nativeCode));
  check("failure says something", /push registration failed/.test(native));
  check("without printing the token", !/\$\{token\}/.test(native));

  /** Sign-out detaches the device before the credential is cleared. */
  const auth = code("client/src/hooks/use-auth.ts");
  check("sign-out unregisters the device", /unregisterPushToken\(\)/.test(auth));
  check(
    "before the bearer token is cleared",
    auth.indexOf("unregisterPushToken") < auth.indexOf("clearAuthToken()"),
  );
}

/** No firebase-admin, no dead provider code that cannot authenticate. */
{
  const pkg = JSON.parse(src("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  check("no server delivery SDK is installed yet", !("firebase-admin" in deps));
  check("nor an APNs client", !("apn" in deps) && !("@parse/node-apn" in deps));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
