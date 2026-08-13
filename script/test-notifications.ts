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
import { isDeadToken } from "../server/notifications/fcmErrors.js";
import { destinationFor, viewerFromRole } from "../client/src/lib/notificationRoutes.js";

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
 * `a` appears before `b`, and both actually appear.
 *
 * `indexOf(a) < indexOf(b)` is true when `a` is missing entirely, so an
 * ordering assertion written that way passes loudest exactly when the thing it
 * guards has been deleted.
 */
const before = (haystack: string, a: string, b: string) => {
  const i = haystack.indexOf(a);
  const j = haystack.indexOf(b);
  return i >= 0 && j >= 0 && i < j;
};
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
  check("push delivery is on", /export const PUSH_DELIVERY_ENABLED = true;/.test(native));
  /**
   * The gate stays in the code with the prompt behind it, so turning delivery
   * off again is one line rather than an excavation — and so nothing can ask
   * for permission if it is ever turned off.
   */
  check(
    "and init still returns before asking for anything when it is off",
    /if \(!PUSH_DELIVERY_ENABLED\) return null;/.test(nativeCode),
  );
  {
    const init = nativeCode.slice(nativeCode.indexOf("export async function initNativeNotifications"));
    const gate = init.indexOf("PUSH_DELIVERY_ENABLED");
    const ask = init.indexOf("requestPermissions");
    check("the gate comes before the prompt", gate >= 0 && gate < ask);
  }
  /**
   * The OS dialog is reached from exactly one place: a member pressing a button
   * on a panel that told them what it is for. Not from boot, not from sign-in,
   * not from mounting a dashboard.
   */
  check("nothing asks at launch or sign-in", !/initNativeNotifications\(\)/.test(
    [
      "client/src/pages/MemberDashboard.tsx",
      "client/src/hooks/use-auth.ts",
      "client/src/main.tsx",
    ].map(code).join("\n"),
  ));
  check(
    "only the pre-prompt does",
    /await initNativeNotifications\(\)/.test(code("client/src/components/portal/NotificationPrompt.tsx")),
  );

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
    before(auth, "unregisterPushToken", "clearAuthToken()"),
  );
}

console.log("\nDelivery\n");

/**
 * One provider, and the smallest thing that talks to it.
 *
 * `firebase-admin` would arrive with Firestore, Storage and Realtime Database
 * for the sake of a single POST. No direct-APNs client either: iOS push rides
 * FCM through the Firebase bridge, so a second sender would be a second thing
 * to keep in step with the first.
 */
{
  const pkg = JSON.parse(src("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  check("the token signer is installed", "google-auth-library" in deps);
  check("without the whole Admin SDK", !("firebase-admin" in deps));
  check("and no second, direct APNs sender", !("apn" in deps) && !("@parse/node-apn" in deps));
}

/**
 * A dead token is a narrow thing.
 *
 * These are the assertions that matter most in the file: every false positive
 * here is a member who silently stops receiving anything.
 */
{
  check("an uninstalled app retires its token", isDeadToken(404, '{"errorCode":"UNREGISTERED"}'));
  check(
    "so does a token that was never valid",
    isDeadToken(400, '{"status":"INVALID_ARGUMENT","message":"Invalid registration token"}'),
  );

  check("but a bad credential does not", !isDeadToken(401, "UNAUTHENTICATED"));
  check("nor a permission problem", !isDeadToken(403, "SENDER_ID_MISMATCH"));
  check("nor being rate limited", !isDeadToken(429, "QUOTA_EXCEEDED"));
  check("nor Google having a bad day", !isDeadToken(503, "UNAVAILABLE"));
  check("nor a 500", !isDeadToken(500, "INTERNAL"));
  /** A 404 that is not about the registration is about the request. */
  check("nor a 404 that says nothing about the token", !isDeadToken(404, "NOT_FOUND"));
  /** INVALID_ARGUMENT is also how a malformed *payload* comes back. */
  check(
    "nor a rejected payload",
    !isDeadToken(400, '{"status":"INVALID_ARGUMENT","message":"Invalid JSON payload"}'),
  );
}

/** The push waits for the commit, and the row is what survives either way. */
{
  const create = code("server/notifications/create.ts");
  const dbc = code("server/db.ts");

  check("delivery is queued, not sent inline", /onCommit\(tx, \(\) =>\s*pushToUser\(/.test(create));
  check(
    "and nothing sends outside that queue",
    (create.match(/pushToUser\(/g) ?? []).length === 1,
  );
  /**
   * The dedupe is the same dedupe. A retried request inserts no row, returns
   * early, and therefore queues no push — one notification, one buzz, enforced
   * by the unique index rather than by anyone remembering.
   */
  check(
    "a deduped notification sends nothing",
    before(create, "if (!rows.length) return false;", "onCommit(tx"),
  );

  check("committed work runs only after the transaction resolves", /await runAfterCommit\(opened\)/.test(dbc));
  check(
    "after the events, in the same order the reader was promised",
    before(dbc, "publishPending(opened)", "await runAfterCommit(opened)"),
  );
  check("and a rollback drops it", /discardAfterCommit\(opened\)/.test(dbc));
  check(
    "the queue is held against the transaction, not a module global",
    /new WeakMap<object, Array<\(\) => Promise<void>>>\(\)/.test(dbc),
  );
  /**
   * A push that fails must not tell a coach their message did not send. The
   * transaction has already committed by then; there is nothing to undo and
   * nothing useful for the caller to do.
   */
  check("a failed send cannot fail the request", /catch \(err\)/.test(dbc.slice(dbc.indexOf("runAfterCommit"))));
}

/** Nothing about a body, and nothing that could send on our behalf, in a log. */
{
  const push = src("server/notifications/push.ts");
  const pushCode = code("server/notifications/push.ts");

  check("a token is only ever traced by its tail", /token\.slice\(-6\)/.test(pushCode));
  check("never logged whole", !/\$\{token\}/.test(push) && !/\$\{device\.token\}/.test(push));
  check("and the credential is never printed", !/private_key["'\s:]*\$\{/.test(push));

  /** The payload is the safe copy the row already holds, plus ids to route by. */
  const create = code("server/notifications/create.ts");
  const payload = create.slice(create.indexOf("pushToUser("), create.indexOf("return true;"));
  check("the push carries the notification's own copy", /title: copy\.title/.test(payload));
  check("and ids, not content", /resourceId: input\.resourceId/.test(payload));
  check(
    "no message body reaches a lock screen",
    !/\bcontent\b|\bmessage\.body\b|answers/.test(payload),
  );

  /** Absent credentials are a normal state, not a crash. */
  check("a missing credential degrades to in-app only", /notifications are in-app only/.test(push));
  check("and is reported once, not per send", /configured = null/.test(pushCode));
  check("pushToUser never throws at its caller", !/^\s*throw /m.test(
    pushCode.slice(pushCode.indexOf("export async function pushToUser")),
  ));
}

console.log("\nWhere a tap lands\n");

/**
 * The same event, read from each end.
 *
 * A coach and a member both receive `coaching.message`, and it means opposite
 * things — "your coach wrote to you" and "your client wrote to you". Getting
 * this backwards would send a coach into their own member dashboard looking for
 * a thread that is not there.
 */
{
  check("a member's message opens the coach thread", (() => {
    const d = destinationFor({ type: "coaching.message" }, "member");
    return d.app === "member" && d.section === "coaching" && d.tab === "coach";
  })());

  check("a coach's message opens that client", (() => {
    const d = destinationFor({ type: "coaching.message", actorUserId: "m1" }, "coach");
    return d.app === "coach" && d.clientUserId === "m1";
  })());

  check("a completed check-in opens the client who answered", (() => {
    const d = destinationFor({ type: "coaching.checkin_completed", actorUserId: "m2" }, "coach");
    return d.app === "coach" && d.clientUserId === "m2";
  })());

  /** Both are things to do today, and Today is where current state lives. */
  for (const type of ["coaching.checkin_requested", "coaching.plan_activated"]) {
    const d = destinationFor({ type }, "member");
    check(`${type} lands on Today`, d.app === "member" && d.tab === "today");
  }

  /** A build that ships a type before the screen for it must still open. */
  const unknown = destinationFor({ type: "coaching.something_new" }, "member");
  check("an unknown type still lands somewhere real", unknown.app === "member");
  check("and never nowhere", Boolean((unknown as { section?: string }).section));

  /** An actor-less event cannot fabricate a client to open. */
  const noActor = destinationFor({ type: "coaching.message" }, "coach");
  check("no actor means no client opened", (noActor as { clientUserId?: string | null }).clientUserId === null);

  /** Which end of the relationship, from the account rather than the payload. */
  check("a coach reads as a coach", viewerFromRole("coach") === "coach");
  check("an admin supervising reads as a coach", viewerFromRole("admin") === "coach");
  check("an owner too", viewerFromRole("owner") === "coach");
  check("a member reads as a member", viewerFromRole("member") === "member");
  check("and so does an unknown role", viewerFromRole(null) === "member");
}

/** A notification names a destination. It never carries authority. */
{
  const routes = code("client/src/lib/notificationRoutes.ts");
  const workspace = code("client/src/pages/CoachWorkspace.tsx");
  const dash = code("client/src/pages/MemberDashboard.tsx");

  check("nothing is fetched to decide a destination", !/fetch\(|useQuery/.test(routes));
  check(
    "a coach's tap is checked against the current roster",
    /roster\.find\(\(c\) => c\.id === destination\.clientUserId\)/.test(workspace),
  );
  check(
    "and opens nothing when that client is gone",
    /if \(client\) setOpenClient/.test(workspace),
  );
  check(
    "the name shown comes from the roster, not the push",
    /name: client\.name/.test(workspace) && !/destination\.name/.test(workspace),
  );
  check("the member claims a destination only once signed in", /if \(!isAuthenticated\) return;/.test(dash));
  check("a destination is removed as it is claimed", before(routes, "Preferences.remove", "JSON.parse(value)"));
  check("and expires rather than ambushing a later launch", /PENDING_TTL_MS/.test(routes));

  /** Sign-out must not leave a destination for the next person. */
  const authSrc = code("client/src/hooks/use-auth.ts");
  check("sign-out drops any pending destination", /forgetDestination\(\)/.test(authSrc));
}

/** We ask once, in context, of people it would serve. */
{
  const prompt = code("client/src/components/portal/NotificationPrompt.tsx");
  const native = code("client/src/lib/nativeNotifications.ts");
  const today = code("client/src/components/portal/TodayBody.tsx");

  check("the prompt is gated on relevance", /if \(!relevant/.test(prompt));
  check("and on the platform being able to honour it", /PUSH_DELIVERY_ENABLED/.test(prompt));
  check("a self-guided member is never asked", /relevant=\{hasCoach \|\| hasCoachingToShow\}/.test(today));
  check("a declined permission is not re-asked", /=== "denied"\) return null;/.test(native));
  check("the ask is recorded before the dialog, not after", before(native, "await markAsked();", "LocalNotifications.requestPermissions()"));
  check("'not now' actually defers", /deferPushPrompt\(\)/.test(prompt));
  check("for a fixed window rather than forever", /DEFER_MS/.test(native));

  /** One channel, not one per event type. */
  check("android gets a single coaching channel", (native.match(/createChannel\(/g) ?? []).length === 1);
  check("named for what it is", /name: "Sakred Coaching"/.test(native));

  /** Foreground arrival refreshes counts and shows nothing over the screen. */
  const received = native.slice(native.indexOf('"notificationReceived"'));
  check("an in-app arrival raises no banner", !/toast|alert\(|LocalNotifications\.schedule/.test(received.slice(0, 400)));
  check("but does reconcile the badge", /invalidateQueries/.test(received.slice(0, 400)));
}

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
