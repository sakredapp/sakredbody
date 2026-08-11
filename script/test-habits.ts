/**
 * The habit loop.
 *
 * These are the assertions that decide whether the architecture holds. Two of
 * them are the whole reason it exists:
 *
 *   "a target raised in week three does not fail week one"
 *   "a HealthKit step count and a typed one are never summed"
 *
 * Everything else here protects a member from being told they failed at
 * something nobody asked them to do — the failure mode that makes people
 * quietly stop opening a tracker and never say why.
 *
 * Pure functions and the resolver. No database: the parts that talk to
 * Postgres are fetching, and the parts that decide anything are here.
 *
 * Run: tsx script/test-habits.ts
 */

import {
  scheduleToColumns,
  scheduleFromColumns,
  describeSchedule,
  weeklyQuota,
  expectedOn,
  phaseDay,
  weekdayOf,
  addDays,
  dayNumber,
} from "../shared/models/habitSchedule.js";
import {
  aggregationOf,
  defaultEntryOp,
  foldEntries,
  resolveDailyValue,
  convertHealthValue,
  manualFallbackAllowed,
  progressStateOf,
  describeProgress,
} from "../shared/models/habitMeasurement.js";
import {
  LOAD_CLASSES,
  LOAD_CLASS_META,
  stressLoadOf,
  restorationOf,
  isLoadClass,
} from "../shared/models/loadClass.js";
import { TRACKING_TYPES, itemTypeOf } from "../shared/models/habitTracking.js";
import { signalLean, TERRAIN_SIGNALS, SIGNAL_KEYS } from "../shared/models/terrainSignals.js";
import { habitConfigSchema, logEntrySchema } from "../shared/models/trackedHabits.js";
import { resolveRow, weekAdherence } from "../shared/models/habitResolve.js";
import {
  canCoachAccessMember,
  canCoachModifyMemberHabit,
  canAdminManageCatalogue,
  subjectOf,
} from "../shared/models/habitAccess.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─── Schedules ─────────────────────────────────────────────────────────────

console.log("\nA schedule survives the round trip through three columns\n");

for (const s of [
  { kind: "daily" as const },
  { kind: "weekly" as const },
  { kind: "as_needed" as const },
  { kind: "days_of_week" as const, days: [1, 3, 5] },
  { kind: "times_per_week" as const, count: 3 },
]) {
  const back = scheduleFromColumns(scheduleToColumns(s));
  check(`${s.kind} round-trips`, JSON.stringify(back) === JSON.stringify(s), JSON.stringify(back));
}

check(
  "days are deduplicated and ordered, so Mon,Mon,Fri isn't a 3× week",
  JSON.stringify(scheduleToColumns({ kind: "days_of_week", days: [5, 1, 1] }).scheduleDays) ===
    "[1,5]",
);
check(
  "a half-written days_of_week reads as daily rather than showing nothing",
  scheduleFromColumns({ scheduleKind: "days_of_week", scheduleDays: [] }).kind === "daily",
);
check(
  "an unknown kind from a future migration reads as daily, not a crash",
  scheduleFromColumns({ scheduleKind: "lunar" }).kind === "daily",
);

console.log("\nWhat a member reads\n");

check("Mon/Wed/Sat reads as a sentence",
  describeSchedule({ kind: "days_of_week", days: [1, 3, 6] }) === "Mon, Wed and Sat",
  describeSchedule({ kind: "days_of_week", days: [1, 3, 6] }));
check("all seven days is 'Every day', not a list of seven",
  describeSchedule({ kind: "days_of_week", days: [0, 1, 2, 3, 4, 5, 6] }) === "Every day");
check("nothing a member sees says 'as_needed'",
  !describeSchedule({ kind: "as_needed" }).includes("_"));

check("daily asks for seven", weeklyQuota({ kind: "daily" }) === 7);
check("three days a week asks for three",
  weeklyQuota({ kind: "days_of_week", days: [1, 3, 5] }) === 3);
check("as-needed has no quota, so it can never be behind on one",
  weeklyQuota({ kind: "as_needed" }) === null);

// ─── Expectation ───────────────────────────────────────────────────────────

console.log("\nScheduled, open, off — the three states, because there are three\n");

const ongoing = { startsOn: "2026-08-01" };
// 2026-08-11 is a Tuesday; 2026-08-12 a Wednesday.
check("Tuesday is Tuesday", weekdayOf("2026-08-11") === 2);

check(
  "a Mon/Wed/Fri sauna is NOT missed on Tuesday",
  expectedOn({ kind: "days_of_week", days: [1, 3, 5] }, ongoing, "2026-08-11") === "off",
);
check(
  "and it does appear on Wednesday",
  expectedOn({ kind: "days_of_week", days: [1, 3, 5] }, ongoing, "2026-08-12") === "scheduled",
);
check(
  "a weekly habit is open on any day, owed on none",
  expectedOn({ kind: "weekly" }, ongoing, "2026-08-11") === "open",
);
check(
  "3× a week is open too — Wednesday proves nothing until Sunday",
  expectedOn({ kind: "times_per_week", count: 3 }, ongoing, "2026-08-11") === "open",
);
check(
  "a day before the phase started is off, not missed",
  expectedOn({ kind: "daily" }, ongoing, "2026-07-31") === "off",
);
check(
  "a day after a fixed phase ended is off",
  expectedOn({ kind: "daily" }, { startsOn: "2026-08-01", endsOn: "2026-08-21" }, "2026-08-22") ===
    "off",
);
check(
  "a day after a superseded phase closed is off — the new one covers it",
  expectedOn({ kind: "daily" }, { startsOn: "2026-08-01", closedOn: "2026-08-10" }, "2026-08-11") ===
    "off",
);

console.log("\nPausing does not manufacture failures\n");

const paused = { startsOn: "2026-08-01", status: "paused", closedOn: "2026-08-09" };
for (const d of ["2026-08-10", "2026-08-11", "2026-08-12"]) {
  check(`${d} is off while paused, not missed`,
    expectedOn({ kind: "daily" }, paused, d) === "off");
}

console.log("\nDay 8 of 21 is derived, never counted\n");

check("day one is day one", dayNumber("2026-08-01", "2026-08-01") === 1);
check(
  "day 8 of 21",
  JSON.stringify(phaseDay({ startsOn: "2026-08-01", endsOn: "2026-08-21" }, "2026-08-08")) ===
    JSON.stringify({ day: 8, of: 21 }),
);
check(
  "an ongoing phase has a day number and no length",
  phaseDay({ startsOn: "2026-08-01" }, "2026-08-08")?.of === null,
);
check(
  "past the end it clamps rather than reading 'day 25 of 21'",
  phaseDay({ startsOn: "2026-08-01", endsOn: "2026-08-21" }, "2026-08-25")?.day === 21,
);
check("before it starts there is no day at all",
  phaseDay({ startsOn: "2026-08-01" }, "2026-07-30") === null);
check("date arithmetic crosses a month boundary", addDays("2026-08-31", 1) === "2026-09-01");
check("and runs backwards", addDays("2026-09-01", -1) === "2026-08-31");

// ─── Measurement ───────────────────────────────────────────────────────────

console.log("\nA number means one thing, decided in one place\n");

check("water accumulates", aggregationOf("ounces") === "cumulative");
check("sleep is observed, so two naps and a night aren't eleven hours",
  aggregationOf("hours") === "observed");
check("a rating replaces rather than adds", aggregationOf("rating") === "observed");
check("cumulative habits default to add", defaultEntryOp("grams") === "add");
check("observed habits default to set", defaultEntryOp("hours") === "set");
check("every tracking type has an aggregation",
  TRACKING_TYPES.every((t) => ["cumulative", "observed"].includes(aggregationOf(t.id))));

check(
  "four taps of +20oz is 80oz",
  foldEntries([20, 20, 20, 20].map((v) => ({ value: v, op: "add" }))) === 80,
);
check(
  "'actually the total was 165' wipes the morning's adds",
  foldEntries([
    { value: 40, op: "add" },
    { value: 50, op: "add" },
    { value: 165, op: "set" },
  ]) === 165,
);
check(
  "and adds after a set build on it",
  foldEntries([
    { value: 100, op: "set" },
    { value: 20, op: "add" },
  ]) === 120,
);
check("a NaN from a broken client is skipped, not propagated",
  foldEntries([{ value: 10, op: "add" }, { value: NaN, op: "add" }]) === 10);

// ─── Health precedence: the rule that must never bend ──────────────────────

console.log("\nHealth data and typed data are never summed\n");

const steps = {
  trackingType: "steps",
  healthMetric: "steps",
};

check(
  "8,742 from the phone reads as 8,742",
  resolveDailyValue({ ...steps, healthValue: 8742, entries: [] }).value === 8742,
);
check(
  "…and stays 8,742 when a manual entry also exists",
  resolveDailyValue({
    ...steps,
    healthValue: 8742,
    entries: [{ value: 3000, op: "add", kind: "manual" }],
  }).value === 8742,
);
check(
  "the source says where it came from",
  resolveDailyValue({ ...steps, healthValue: 8742, entries: [] }).source === "health",
);
check(
  "with no health value, the manual entry is used — that's the fallback",
  resolveDailyValue({
    ...steps,
    healthValue: null,
    entries: [{ value: 3000, op: "add", kind: "manual" }],
  }).value === 3000,
);
check(
  "and it's flagged as a day the phone should have answered",
  resolveDailyValue({
    ...steps,
    healthValue: null,
    entries: [{ value: 3000, op: "add", kind: "manual" }],
  }).healthExpectedButMissing === true,
);
check(
  "an explicit override beats the phone — 'no, I walked, it was in my bag'",
  resolveDailyValue({
    ...steps,
    healthValue: 8742,
    entries: [{ value: 12000, op: "set", kind: "override" }],
  }).value === 12000,
);
check(
  "an override is labelled as one, so a coach can tell",
  resolveDailyValue({
    ...steps,
    healthValue: 8742,
    entries: [{ value: 12000, op: "set", kind: "override" }],
  }).source === "override",
);
check(
  "nothing at all is zero from nowhere, not zero from the phone",
  resolveDailyValue({ ...steps, healthValue: null, entries: [] }).source === "none",
);

console.log("\nUnits are converted once, in the domain\n");

check("462 minutes of sleep is 7.7 hours",
  Math.abs((convertHealthValue("sleepMinutes", 462, "hours") ?? 0) - 7.7) < 0.001);
check("minutes stay minutes when the habit is in minutes",
  convertHealthValue("mindfulnessMinutes", 10, "minutes") === 10);
check("2000ml is 2 litres", convertHealthValue("waterMl", 2000, "litres") === 2);
check("2000ml is about 68 fl oz",
  Math.round(convertHealthValue("waterMl", 2000, "ounces") ?? 0) === 68);
check("an unmapped pairing returns null rather than a wrong number",
  convertHealthValue("restingHeartRate", 54, "grams") === null);

console.log("\nSome things a person cannot honestly type\n");

check("steps can be entered by hand", manualFallbackAllowed("steps"));
check("water can be entered by hand", manualFallbackAllowed("waterMl"));
check("HRV cannot — a typed HRV is an invented number",
  !manualFallbackAllowed("heartRateVariability"));
check("resting heart rate cannot either", !manualFallbackAllowed("restingHeartRate"));
check("a habit with no metric was always manual", manualFallbackAllowed(null));

// ─── Progress ──────────────────────────────────────────────────────────────

console.log("\nWhat a card prints\n");

check("a practice reads Done", describeProgress("boolean", 1, null) === "Done");
check("and Not yet, never 0 / 1", describeProgress("boolean", 0, null) === "Not yet");
check("148 of 165 grams", describeProgress("grams", 148, 165) === "148 / 165 g");
check("sleep reads in hours and minutes, not 7.7",
  describeProgress("hours", 7.7, 8) === "7h 42m / 8h");
check("steps carry a thousands separator",
  describeProgress("steps", 8742, 10000).startsWith("8,742"));
check("a target habit with no target yet still prints its value",
  describeProgress("grams", 40, null) === "40 g");

check("nothing is none", progressStateOf("grams", 0, 165) === "none");
check("something is partial", progressStateOf("grams", 40, 165) === "partial");
check("the number is met", progressStateOf("grams", 165, 165) === "met");
check("well past it is over", progressStateOf("grams", 220, 165) === "over");
check("a boolean is met or none, never partial",
  progressStateOf("boolean", 1, null) === "met" && progressStateOf("boolean", 0, null) === "none");

// ─── The resolver, and the reason all of this exists ───────────────────────

console.log("\nA target raised in week three does not fail week one\n");

const proteinHabit = {
  id: "h1",
  title: "Protein",
  shortDescription: null,
  icon: null,
  trackingType: "grams",
  defaultTarget: 140,
  healthMetric: null,
  polarityStrength: "strong",
  loadClass: "building",
  recommendedTime: null,
} as never;

const tracked = {
  id: "t1",
  userId: "u1",
  routineHabitId: "h1",
  emphasis: "yang",
  status: "active",
  orderIndex: 0,
} as never;

/** Week one's contract: 140g, closed on the 14th when the coach raised it. */
const week1Phase = {
  id: "p1",
  trackedHabitId: "t1",
  userId: "u1",
  routineHabitId: "h1",
  status: "superseded",
  target: 140,
  phaseType: "ongoing",
  startsOn: "2026-08-01",
  durationDays: null,
  scheduleKind: "daily",
  scheduleDays: null,
  scheduleCount: null,
  recommendedTime: null,
  source: "coach",
  memberReason: null,
  endsOn: null,
  closedOn: "2026-08-14",
} as never;

const week3Phase = { ...(week1Phase as object), id: "p2", status: "active", target: 165, startsOn: "2026-08-15", closedOn: null } as never;

const day3 = resolveRow({
  tracked,
  phase: week1Phase,
  habit: proteinHabit,
  onDate: "2026-08-03",
  entries: [{ value: 145, op: "set", kind: "manual" }],
  healthValue: null,
  contexts: [],
});
check("145g on the 3rd met the 140g he was actually asked for",
  day3.progressState === "met", day3.progressLabel);
check("and the label shows the target he had, not the one he has now",
  day3.progressLabel === "145 / 140 g", day3.progressLabel);

const day20 = resolveRow({
  tracked,
  phase: week3Phase,
  habit: proteinHabit,
  onDate: "2026-08-20",
  entries: [{ value: 145, op: "set", kind: "manual" }],
  healthValue: null,
  contexts: [],
});
check("the same 145g is short of the new 165g",
  day20.progressState === "partial", day20.progressLabel);

console.log("\nThe resolver answers the questions a screen would otherwise guess at\n");

check("a paused member's habit is off today",
  resolveRow({
    tracked: { ...(tracked as object), status: "paused" } as never,
    phase: week3Phase,
    habit: proteinHabit,
    onDate: "2026-08-20",
    entries: [],
    healthValue: null,
    contexts: [],
  }).expected === "off");

check("a fixed phase past its last day asks the member what happens next",
  resolveRow({
    tracked,
    phase: { ...(week1Phase as object), status: "active", closedOn: null, phaseType: "fixed", durationDays: 21, endsOn: "2026-08-21" } as never,
    habit: proteinHabit,
    onDate: "2026-08-25",
    entries: [],
    healthValue: null,
    contexts: [],
  }).awaitingReview === true);

check("and does not while it is still running",
  resolveRow({
    tracked,
    phase: { ...(week1Phase as object), status: "active", closedOn: null, phaseType: "fixed", durationDays: 21, endsOn: "2026-08-21" } as never,
    habit: proteinHabit,
    onDate: "2026-08-10",
    entries: [],
    healthValue: null,
    contexts: [],
  }).awaitingReview === false);

check("the member's own emphasis wins over a retagged catalogue row",
  resolveRow({
    tracked: { ...(tracked as object), emphasis: "yang" } as never,
    phase: week3Phase,
    habit: { ...(proteinHabit as object), emphasis: "yin" } as never,
    onDate: "2026-08-20",
    entries: [],
    healthValue: null,
    contexts: [],
  }).emphasis === "yang");

const sleepResolved = resolveRow({
  tracked: { ...(tracked as object), emphasis: "yin" } as never,
  phase: { ...(week3Phase as object), target: 480 } as never,
  habit: {
    ...(proteinHabit as object),
    title: "Sleep",
    trackingType: "hours",
    defaultTarget: 8,
    healthMetric: "sleepMinutes",
  } as never,
  onDate: "2026-08-20",
  entries: [],
  healthValue: 462,
  contexts: [{ type: "plan", id: "plan-1" }],
});
check("a health-backed habit resolves through health_days without an entry row",
  sleepResolved.valueSource === "health");
check("and is expressed in the habit's own unit",
  Math.abs(sleepResolved.currentValue - 7.7) < 0.001, String(sleepResolved.currentValue));
check("a health-backed measured habit is a Metric",
  sleepResolved.itemType === "metric");
check("context membership survives resolution",
  sleepResolved.contexts[0]?.type === "plan");
check("the client is told which operation to send",
  sleepResolved.entryOp === "set" && day3.entryOp === "add");

console.log("\nItem type is derived, so it cannot contradict its own row\n");

check("a boolean is a practice", itemTypeOf("boolean", null) === "practice");
check("a number the member types is a target", itemTypeOf("grams", null) === "target");
check("a number the phone knows is a metric", itemTypeOf("steps", "steps") === "metric");
check("a boolean with a health metric is still a practice",
  itemTypeOf("boolean", "steps") === "practice");

// ─── Load class ────────────────────────────────────────────────────────────

console.log("\nLoad is a different axis from direction\n");

check("every load class has meta", LOAD_CLASSES.every((c) => Boolean(LOAD_CLASS_META[c])));
check("restorative gives and costs nothing",
  LOAD_CLASS_META.restorative.costs === 0 && LOAD_CLASS_META.restorative.gives > 0);
check("an adaptive stressor costs the most",
  LOAD_CLASS_META["adaptive-stressor"].costs === 3);
check("depleting gives nothing back", LOAD_CLASS_META.depleting.gives === 0);
check("a week of four stressors carries real load",
  stressLoadOf(["adaptive-stressor", "adaptive-stressor", "building", "building"]) === 10);
check("and a restorative week reads on the other side",
  restorationOf(["restorative", "restorative", "supportive"]) === 8);
check("an unknown class is neutral rather than an exception",
  stressLoadOf(["nonsense"]) === 0);
check("isLoadClass rejects a typo", !isLoadClass("buildling"));

// ─── Terrain signals ───────────────────────────────────────────────────────

console.log("\nSeven things a person knows that no device does\n");

check("seven signals", TERRAIN_SIGNALS.length === 7);
check("every signal has a question a person can answer",
  TERRAIN_SIGNALS.every((s) => s.question.endsWith("?")));
check("the keys match the signals", SIGNAL_KEYS.length === 7);
check("two answers is not enough to say anything",
  signalLean({ energy: 1, recovery: 1 }) === "unknown");
check("a body saying it is empty leans restore",
  signalLean({ energy: 1, recovery: 2, nervousSystem: 2, drive: 3 }) === "restore");
check("a body saying it has room leans build",
  signalLean({ energy: 5, recovery: 5, drive: 4, mentalClarity: 4 }) === "build");
check("no composite score is ever produced",
  !Object.keys(signalLean({ energy: 3, recovery: 3, drive: 3 })).includes("score"));

// ─── Input validation ──────────────────────────────────────────────────────

console.log("\nWhat the API refuses\n");

check("a fixed phase without a length is rejected",
  !habitConfigSchema.safeParse({ phaseType: "fixed" }).success);
check("an ongoing phase with a length is rejected — it's lying about its kind",
  !habitConfigSchema.safeParse({ phaseType: "ongoing", durationDays: 21 }).success);
check("a fixed 21-day phase is fine",
  habitConfigSchema.safeParse({ phaseType: "fixed", durationDays: 21 }).success);
check("a negative target is rejected",
  !habitConfigSchema.safeParse({ target: -5 }).success);
check("a days_of_week with no days is rejected at the edge, not just in Postgres",
  !habitConfigSchema.safeParse({ schedule: { kind: "days_of_week", days: [] } }).success);
check("day 7 is not a weekday",
  !habitConfigSchema.safeParse({ schedule: { kind: "days_of_week", days: [7] } }).success);
check("a 400-day phase is rejected",
  !habitConfigSchema.safeParse({ phaseType: "fixed", durationDays: 400 }).success);
check("an entry with a nonsense op is rejected",
  !logEntrySchema.safeParse({ value: 10, op: "multiply" }).success);
check("a well-formed entry passes",
  logEntrySchema.safeParse({ value: 10, op: "add", kind: "manual" }).success);
check("a malformed date is rejected",
  !logEntrySchema.safeParse({ value: 10, onDate: "Aug 3" }).success);

// ─── Nothing member-facing says the quiet part ─────────────────────────────

console.log("\nThe vocabulary stays behind the glass\n");

const memberFacing = [
  ...TRACKING_TYPES.map((t) => t.label),
  ...LOAD_CLASSES.map((c) => LOAD_CLASS_META[c].label),
  describeSchedule({ kind: "as_needed" }),
  describeSchedule({ kind: "times_per_week", count: 3 }),
  describeProgress("hours", 7.7, 8),
];
check("no member-facing string contains a snake_case enum",
  memberFacing.every((s) => !/[a-z]_[a-z]/.test(s)));
check("no member-facing string says 'terrain'",
  memberFacing.every((s) => !s.toLowerCase().includes("terrain")));


// ─── Authorization ─────────────────────────────────────────────────────────

console.log("\nWho may act on whose habits\n");

const nick = { userId: "nick", role: "member" as const };
const otherMember = { userId: "sam", role: "member" as const };
const coach = { userId: "gerard", role: "coach" as const };
const admin = { userId: "jace", role: "admin" as const };
const owner = { userId: "owner", role: "owner" as const };

check("a member reaches their own habits", canCoachAccessMember(nick, "nick"));
check("a member cannot reach another member's", !canCoachAccessMember(nick, "sam"));
check("a member cannot write to another member's",
  !canCoachModifyMemberHabit(otherMember, "nick"));
check("a coach reaches a member's", canCoachAccessMember(coach, "nick"));
check("a coach may write to a member's", canCoachModifyMemberHabit(coach, "nick"));
check("an admin reaches a member's", canCoachAccessMember(admin, "nick"));
check("an owner does too", canCoachAccessMember(owner, "nick"));

check("a member cannot edit the shared catalogue", !canAdminManageCatalogue(nick));
check("nor can a coach — one member's target is not everybody's default",
  !canAdminManageCatalogue(coach));
check("an admin can", canAdminManageCatalogue(admin));
check("an owner can", canAdminManageCatalogue(owner));

console.log("\nA tampered id in a path resolves to a refusal, not to somebody else\n");

check("no id at all means the actor themselves", subjectOf(nick) === "nick");
check("an empty id means the actor themselves", subjectOf(nick, "") === "nick");
check("their own id is fine", subjectOf(nick, "nick") === "nick");
check("somebody else's id from a member is refused", subjectOf(nick, "sam") === null);
check("a made-up id from a member is refused", subjectOf(nick, "../../admin") === null);
check("a coach passing a member id gets that member", subjectOf(coach, "nick") === "nick");
check("an unknown role is refused rather than defaulted",
  subjectOf({ userId: "x", role: "ghost" as never }, "nick") === null);

// ─── Weekly quotas ─────────────────────────────────────────────────────────

console.log("\nA 3x-a-week habit is graded by the week, not the day\n");

const week = (states: string[]) =>
  states.map((s) => ({
    expected: (s === "-" ? "off" : "open") as "off" | "open",
    progressState: (s === "y" ? "met" : "none") as "met" | "none",
  }));

check(
  "three done out of a quota of three",
  JSON.stringify(
    weekAdherence({ kind: "times_per_week", count: 3 }, week(["y", "n", "y", "n", "y", "n", "n"])),
  ) === JSON.stringify({ done: 3, of: 3 }),
);
check(
  "as-needed has nothing to be behind on",
  weekAdherence({ kind: "as_needed" }, week(["n", "n", "n", "n", "n", "n", "n"])) === null,
);
check(
  "days the habit was off never count against the quota",
  weekAdherence({ kind: "days_of_week", days: [1, 3, 5] }, week(["-", "y", "-", "y", "-", "y", "-"]))
    ?.done === 3,
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
