/**
 * The health state machine, including the timings a phone makes awkward.
 *
 * ── What is being defended ────────────────────────────────────────────────
 *
 * A member with Apple Health connected launched the app and was shown
 * "Connect Apple Health" on the Home screen, while the Settings screen said
 * Connected — same account, same launch, same second. About a minute later
 * the numbers appeared and everything agreed again.
 *
 * The cause was one expression, repeated on five screens:
 *
 *     const connected = data?.connected ?? false;
 *
 * read from the *summary* query. While that query is in flight `data` is
 * undefined, so `?? false` converted "we have not been told yet" into "there
 * is no connection". The two are not similar states — one is a fact about the
 * member, the other is a fact about a network request — and once they share a
 * value nothing downstream can separate them again.
 *
 * The fix is `resolveHealthView`: a pure function from named inputs to a closed
 * union. This file exercises it at the timings that produced the bug, plus the
 * ones that would produce its mirror image (blanking data that was already on
 * screen, or telling somebody they have no health data before looking).
 *
 * ── Why these tests need no device and no browser ─────────────────────────
 *
 * A physical phone is required to measure how long HealthKit takes. It is not
 * required to test what the UI does while HealthKit is taking that long — and
 * that second question is where the defect lived. A sync taking sixty seconds
 * is a number in a variable here, which is why every case below can assert on
 * behaviour that would otherwise need a stopwatch and a member complaining.
 *
 * The resolver is imported directly rather than parsed out of source: it has
 * no React and no `import.meta.env`, which was a deliberate constraint on
 * where the decision lives.
 */

import {
  offersConnect,
  resolveConnection,
  resolveHealthView,
  showsData,
  type HealthView,
  type HealthViewInput,
} from "../client/src/lib/healthState.js";
import { HealthOrchestrator } from "../client/src/lib/healthOrchestrator.js";
import { SingleFlight } from "../client/src/lib/singleFlight.js";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** A connected phone, mid-launch, with nothing resolved yet. */
const base: HealthViewInput = {
  connection: "unknown",
  available: null,
  hasData: false,
  refreshing: false,
  summarySettled: false,
};

const view = (over: Partial<HealthViewInput>): HealthView =>
  resolveHealthView({ ...base, ...over });

// ─── The axes are separate ───────────────────────────────────────────────

check(
  "an unanswered status is unknown, not disconnected",
  resolveConnection({ isLoading: true }) === "unknown",
  resolveConnection({ isLoading: true }),
);

check(
  "and an unanswered status with no loading flag is still unknown",
  resolveConnection({ isLoading: false }) === "unknown",
  "a disabled or unsubscribed query is not evidence of a missing connection",
);

check(
  "a failed status is an error, not a disconnection",
  resolveConnection({ isLoading: false, error: new Error("offline") }) === "error",
);

/*
  react-query keeps the last good answer through a failed refetch. A member
  whose connection we have already read does not become unknown — or worse,
  disconnected — because a later poll timed out on a train.
*/
check(
  "a failed refetch over a known answer keeps the answer",
  resolveConnection({ isLoading: false, error: new Error("timeout"), data: { connected: true } }) ===
    "connected",
);

check("the server saying no is a disconnection", resolveConnection({ isLoading: false, data: { connected: false } }) === "disconnected");

// ─── Case A — the reported bug, at the timings that produced it ──────────
//
// status resolves in ~50ms, the persisted summary in ~100ms, and the native
// sync takes sixty seconds. Every assertion here is about the 59.9 seconds in
// between, which is the window the member was complaining about.

const caseA_at50ms = view({ connection: "connected", available: true, refreshing: true });
check(
  "A · status connected, summary still loading — never offers Connect",
  !offersConnect(caseA_at50ms),
  caseA_at50ms.kind,
);
check("A · and says it is loading rather than empty", caseA_at50ms.kind === "hydrating", caseA_at50ms.kind);

const caseA_at100ms = view({
  connection: "connected",
  available: true,
  hasData: true,
  summarySettled: true,
  refreshing: true,
});
check("A · persisted data renders the moment it arrives", showsData(caseA_at100ms), caseA_at100ms.kind);
check(
  "A · while the sixty-second sync is still running",
  caseA_at100ms.kind === "ready" && caseA_at100ms.refreshing,
  "Updating… is a caption, not a curtain",
);
check("A · and still never offers Connect", !offersConnect(caseA_at100ms));

const caseA_at60s = view({
  connection: "connected",
  available: true,
  hasData: true,
  summarySettled: true,
  refreshing: false,
});
check(
  "A · the sync finishing only drops the caption",
  caseA_at60s.kind === "ready" && !caseA_at60s.refreshing,
);

// ─── Case B — connected, nothing persisted, slow sync ────────────────────

const caseB = view({ connection: "connected", available: true, refreshing: true });
check("B · says loading, not disconnected", caseB.kind === "hydrating", caseB.kind);
check("B · offers no Connect button", !offersConnect(caseB));

/*
  The distinction "nothing yet" versus "nothing at all" is what `summarySettled`
  exists for. Telling a member with a full Health app that they have no data,
  because we had not finished looking, is the same species of wrong as the
  original bug pointed at a different question.
*/
const caseB_settled = view({
  connection: "connected",
  available: true,
  refreshing: false,
  summarySettled: true,
});
check("B · becomes 'no data yet' only once we have looked", caseB_settled.kind === "empty", caseB_settled.kind);

// ─── Case C — genuinely disconnected ─────────────────────────────────────

const caseC = view({ connection: "disconnected", available: true, summarySettled: true });
check("C · a disconnected phone is the only thing that offers Connect", offersConnect(caseC), caseC.kind);

const caseC_probing = view({ connection: "disconnected", available: null });
check(
  "C · but not before the device probe answers",
  caseC_probing.kind === "unknown",
  "a Connect button that cannot raise the system sheet is worse than no button",
);

const caseC_web = view({ connection: "disconnected", available: false, summarySettled: true });
check(
  "C · a browser is told why rather than offered a button it cannot honour",
  caseC_web.kind === "unavailable",
  caseC_web.kind,
);

// ─── Case D — one metric stalls, the rest resolve ────────────────────────
//
// The sync collects twenty-odd record families and a single withheld
// permission or unreachable type must not suppress the others. At the state
// level that means: partial data is data.

const caseD = view({
  connection: "connected",
  available: true,
  hasData: true,
  summarySettled: false,
  refreshing: true,
});
check(
  "D · valid data shows while a slow family is still outstanding",
  showsData(caseD),
  "one stalled metric cannot hold the whole screen hostage",
);

// ─── The invariants, stated as invariants ────────────────────────────────
//
// The cases above are examples. These are the properties, checked across
// every combination the machine can be in — which is the only way to know a
// sixth state was not introduced by a later edit.

const CONNECTIONS = ["unknown", "connected", "disconnected", "error"] as const;
const AVAILABILITIES = [true, false, null] as const;
const BOOLS = [true, false];

const all: { input: HealthViewInput; out: HealthView }[] = [];
for (const connection of CONNECTIONS)
  for (const available of AVAILABILITIES)
    for (const hasData of BOOLS)
      for (const refreshing of BOOLS)
        for (const summarySettled of BOOLS) {
          const input = { connection, available, hasData, refreshing, summarySettled };
          all.push({ input, out: resolveHealthView(input) });
        }

const describe = (i: HealthViewInput) =>
  `${i.connection}/avail=${i.available}/data=${i.hasData}/refresh=${i.refreshing}/settled=${i.summarySettled}`;

/*
  The headline invariant, and the one that would have prevented all of this:
  there is no combination of inputs where not-yet-known produces the CTA.
*/
const wrongConnect = all.filter(
  ({ input, out }) => offersConnect(out) && input.connection !== "disconnected",
);
check(
  "Connect is offered only to a confirmed disconnection — in every state, not just the tested ones",
  wrongConnect.length === 0,
  wrongConnect.map(({ input }) => describe(input)).join(" | "),
);

const connectWhileUnknown = all.filter(
  ({ input, out }) => input.connection === "unknown" && out.kind !== "unknown" && !input.hasData,
);
check(
  "an unresolved status with nothing to draw resolves to neutral and nothing else",
  connectWhileUnknown.length === 0,
  connectWhileUnknown.map(({ input, out }) => `${describe(input)} → ${out.kind}`).join(" | "),
);

/*
  Data we hold is never hidden by a state about a request. This is the
  mirror-image failure: not a false Connect button, but a member's real sleep
  and HRV blinking out while we check whether there is more of it.
*/
const blanked = all.filter(
  ({ input, out }) =>
    input.hasData && input.connection !== "disconnected" && !showsData(out),
);
check(
  "known data is never blanked by a refresh, an error, or an unfinished probe",
  blanked.length === 0,
  blanked.map(({ input, out }) => `${describe(input)} → ${out.kind}`).join(" | "),
);

const prematureEmpty = all.filter(
  ({ input, out }) => out.kind === "empty" && (!input.summarySettled || input.refreshing),
);
check(
  "nobody is told they have no health data before we finished looking",
  prematureEmpty.length === 0,
  prematureEmpty.map(({ input }) => describe(input)).join(" | "),
);

const KINDS = ["unknown", "ready", "hydrating", "empty", "disconnected", "unavailable", "error"];
const unknownKind = all.filter(({ out }) => !KINDS.includes(out.kind));
check("every input resolves to a named state", unknownKind.length === 0);

check(
  "and every named state is reachable",
  KINDS.every((k) => all.some(({ out }) => out.kind === k)),
  KINDS.filter((k) => !all.some(({ out }) => out.kind === k)).join(", ") || "",
);

// ─── Case E — mount, visibility and appStateChange, together ─────────────
//
// On a cold native launch these three arrive within a few hundred
// milliseconds, because becoming visible, becoming active and mounting the
// dashboard are the same event described three ways. What must come out the
// far side is one native read and one completion refresh — not three, and not
// one plus two silently dropped.

async function orchestration() {
  const o = new HealthOrchestrator();

  let syncStarts = 0;
  let hydrates = 0;
  let releaseSync!: () => void;
  const pending = new Promise<void>((res) => {
    releaseSync = res;
  });

  const trigger = (name: string) =>
    o.refresh({
      trigger: name,
      sync: () => {
        syncStarts++;
        return pending;
      },
      hydrate: async () => {
        hydrates++;
      },
      now: () => 1_000,
    });

  // All three, before the sync has a chance to settle. This is the launch.
  const a = trigger("mount");
  const b = trigger("visibility");
  const c = trigger("appState");

  check("E · three simultaneous triggers start one native sync", syncStarts === 1, `${syncStarts}`);
  check("E · the other two joined rather than being dropped", o.joinCount === 2, `${o.joinCount}`);
  check("E · and they are the same run, not three promises", a === b && b === c);

  releaseSync();
  await Promise.all([a, b, c]);

  check("E · one completion refresh, not a storm", hydrates === 1, `${hydrates}`);
  check("E · and the orchestrator is free again afterwards", !o.busy);

  /*
    A later resume inside the throttle window must not re-read the phone.
    Note what it does not govern: hydration is a separate path with no throttle
    at all, which is the point of the split.
  */
  const soon = await o.refresh({
    trigger: "resume",
    sync: async () => {
      syncStarts++;
    },
    hydrate: async () => {
      hydrates++;
    },
    now: () => 1_000 + 60_000,
  });
  check("E · a resume inside the throttle window reads no phone", syncStarts === 1, `${syncStarts}`);
  check("E · and resolves rather than hanging the caller", soon === undefined);

  // Past the window, the phone is read again.
  await o.refresh({
    trigger: "later",
    sync: async () => {
      syncStarts++;
    },
    hydrate: async () => {
      hydrates++;
    },
    now: () => 1_000 + 16 * 60_000,
  });
  check("E · past the window it syncs again", syncStarts === 2, `${syncStarts}`);

  /*
    A sync that rejects must still hydrate and must still release ownership.
    Otherwise one unreachable store poisons every later refresh for the life of
    the process — the failure mode that looks exactly like the bug this whole
    pass is about.
  */
  const failing = new HealthOrchestrator();
  let hydratedAfterFailure = false;
  await failing.refresh({
    trigger: "mount",
    sync: async () => {
      throw new Error("Health Connect didn't respond");
    },
    hydrate: async () => {
      hydratedAfterFailure = true;
    },
    now: () => 1_000,
  });
  check("E · a failed sync still hydrates from the server", hydratedAfterFailure);
  check("E · and does not leave the orchestrator wedged", !failing.busy);
}

// ─── The probe: shared, not frozen ───────────────────────────────────────

/*
  Two behaviours that look identical until the answer changes.

  Collapsing five per-component probes into one shared promise was the right
  fix and it carried a hazard: the simplest implementation — hold the promise
  forever — makes the device's answer permanent for the life of the app
  process. On Android that is wrong in a way a member can walk into. Health
  Connect is a separate app; when it is missing the probe resolves `false`
  with a reason telling them to install it. They install it. They come back to
  the same message, and only force-quitting clears it.

  So every assertion below is about the distinction rather than about either
  behaviour on its own: concurrent callers must share one run, *and* a
  lifecycle change must be able to produce a second one. A test that proved
  only the first would pass just as happily against the frozen version.
*/
async function probeSharing() {
  const settle: Array<(v: { available: boolean }) => void> = [];
  const cell = new SingleFlight<{ available: boolean }>(
    () => new Promise((resolve) => settle.push(resolve)),
  );

  // ── Single-flight: three callers, one bridge call ──
  const a = cell.get();
  const b = cell.get();
  const c = cell.get();
  check("probe · concurrent callers run the device once", cell.runs === 1, `${cell.runs} runs`);
  check("probe · and all of them await the same answer", a === b && b === c);

  settle[0]({ available: false });
  await a;
  check("probe · the answer is held once it lands", cell.peek()?.available === false);

  // ── Held: a later caller costs nothing ──
  const later = await cell.get();
  check("probe · a caller arriving afterwards does not re-ask", cell.runs === 1, `${cell.runs}`);
  check("probe · and is served what we already know", later.available === false);

  /*
    ── Invalidated: the whole point ──

    Told as the sequence a member actually performs, because the assertion in
    the middle is the one worth staring at: after they install Health Connect
    the cell is still, correctly, serving the old answer. Nothing is wrong
    with the cell — it was never told. That is exactly why something in the
    product has to tell it, and why the source assertions in `test-health.ts`
    check that a resume, a connect and a disconnect all do.

    Nothing here awaits a promise that a broken `invalidate` would never
    settle. A memoized version must fail these, not hang on them.
  */
  let deviceHasHealthConnect = false;
  const changing = new SingleFlight<{ available: boolean }>(async () => ({
    available: deviceHasHealthConnect,
  }));

  check("probe · the phone answers no", (await changing.get()).available === false);
  deviceHasHealthConnect = true; // the member goes and installs it
  check(
    "probe · and until it is told otherwise, no is what the app keeps showing",
    (await changing.get()).available === false,
    "not a defect — the cell has not been told anything changed",
  );

  changing.invalidate();
  check("probe · invalidation discards the held answer", changing.peek() === undefined);
  check("probe · so the next asker re-runs it", (await changing.get()).available === true);
  check("probe · which took a second device call, not a cached one", changing.runs === 2, `${changing.runs}`);

  /*
    A run that was already in flight when the world changed is answering the
    old question. It must resolve its own callers — they asked in good faith
    and are owed an answer — but it must not install that answer as the truth,
    or invalidating during a probe would look fixed and then unfix itself a
    moment later.
  */
  const stale = new SingleFlight<{ available: boolean }>(
    () => new Promise((resolve) => settle.push(resolve)),
  );
  const inflight = stale.get();
  stale.invalidate();
  settle[1]({ available: false });
  check(
    "probe · a superseded run still answers its own callers",
    (await inflight).available === false,
  );
  check("probe · but does not write back over the invalidation", stale.peek() === undefined);

  /*
    Nobody re-asks a cell they were never told about. Without this the
    invalidation above is theatre: the value is discarded and every screen
    keeps rendering the state it read on mount, which is the same outcome as
    never invalidating at all.
  */
  let woken = 0;
  const watched = new SingleFlight<{ available: boolean }>(async () => ({ available: true }));
  const unsubscribe = watched.subscribe(() => {
    woken++;
  });
  await watched.get();
  const wokenOnAnswer = woken;
  check("probe · subscribers are woken when an answer lands", wokenOnAnswer >= 1, `${woken}`);
  watched.invalidate();
  check("probe · and woken again when it is discarded", woken > wokenOnAnswer, `${woken}`);
  unsubscribe();
  watched.invalidate();
  check("probe · an unsubscribed listener stops being woken", woken === wokenOnAnswer + 1, `${woken}`);

  /*
    A failure is not an answer. Caching a rejection forever is the memoization
    trap in its worst form — one unlucky bridge timeout at launch and the
    feature is gone until the app is killed.
  */
  let attempts = 0;
  const flaky = new SingleFlight<{ available: boolean }>(async () => {
    attempts++;
    if (attempts === 1) throw new Error("Health Connect didn't respond");
    return { available: true };
  });
  await flaky.get().catch(() => {});
  check("probe · a rejection is not held", flaky.peek() === undefined);
  check(
    "probe · and the next asker tries again",
    (await flaky.get()).available === true,
    `${attempts} attempts`,
  );
}

// ─── Result ──────────────────────────────────────────────────────────────

await orchestration();
await probeSharing();

if (failures.length) {
  console.error("\n✗ health state\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ ${passed} health state assertions passed`);
