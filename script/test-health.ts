/**
 * Health data — the parts that are wrong without being visibly wrong.
 *
 * A health bug does not throw. It puts 82.4 in a column labelled kg when the
 * number was pounds, or files Tuesday's sleep under Monday, and the chart
 * renders beautifully either way. Nobody notices until a coach makes a call on
 * it. So this file tests the conversions, the day boundaries and the
 * permission surface rather than the plumbing.
 */

import { readFileSync } from "fs";
import { HEALTH_UNITS, HEALTH_RANGES, healthMetricEnum } from "../shared/models/health.js";
import {
  METRIC_PLANS,
  READ_TYPES,
  CANONICAL_UNITS,
  localDate,
  toCanonical,
  foldSleep,
} from "../client/src/lib/healthMetrics.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n${title}`);
}

const METRICS = healthMetricEnum.options;

// ── 1. The vocabulary agrees with itself ───────────────────────────────────
section("Vocabulary");

for (const m of METRICS) {
  check(`${m} has a canonical unit on the server`, Boolean(HEALTH_UNITS[m]));
  check(`${m} has a plausible range`, Array.isArray(HEALTH_RANGES[m]));
  const [lo, hi] = HEALTH_RANGES[m] ?? [0, 0];
  check(`${m} range is ordered`, lo < hi, `${lo} >= ${hi}`);
}

/**
 * The client keeps its own unit table on purpose (see the note on
 * CANONICAL_UNITS). This is the assertion that makes that safe: two tables
 * that must agree, and a test that fails the moment they don't.
 */
for (const m of METRICS) {
  check(
    `${m}: client and server units match`,
    CANONICAL_UNITS[m] === HEALTH_UNITS[m],
    `client ${CANONICAL_UNITS[m]} vs server ${HEALTH_UNITS[m]}`
  );
}

for (const plan of METRIC_PLANS) {
  check(`${plan.metric} is a real metric`, METRICS.includes(plan.metric));
  check(`${plan.metric} accepts at least one unit`, plan.accepts.length > 0);
}

check("no duplicate read types", new Set(READ_TYPES).size === READ_TYPES.length);
check(
  "no duplicate metrics across plans",
  new Set(METRIC_PLANS.map((p) => p.metric)).size === METRIC_PLANS.length
);

/**
 * The mistake this catches is summing a rate. A day of resting heart rate
 * readings summed is 1,400 bpm, which is inside no sane range and outside the
 * one we set — so it would be dropped rather than shown, and the metric would
 * simply be missing with nothing to explain why.
 */
const NEVER_SUMMED = [
  "restingHeartRate",
  "heartRateVariability",
  "vo2Max",
  "weightKg",
  "bodyFatPercent",
  "heightCm",
  "respiratoryRate",
  "oxygenSaturation",
  "bodyTemperatureC",
];
for (const plan of METRIC_PLANS) {
  if (NEVER_SUMMED.includes(plan.metric))
    check(`${plan.metric} is not summed over a day`, plan.aggregation !== "sum", plan.aggregation);
}

// ── 2. Conversions ─────────────────────────────────────────────────────────
section("Conversions");

function planFor(metric: string) {
  const p = METRIC_PLANS.find((x) => x.metric === metric);
  if (!p) throw new Error(`no plan for ${metric}`);
  return p;
}

const tempF = toCanonical(planFor("bodyTemperatureC"), {
  startDate: "2026-08-09T00:00:00",
  value: 98.6,
  unit: "fahrenheit",
});
check("98.6F becomes 37C", Math.abs((tempF?.value ?? 0) - 37) < 0.01, String(tempF?.value));
check("converted temperature is labelled degC", tempF?.unit === "degC");

const tempC = toCanonical(planFor("bodyTemperatureC"), {
  startDate: "2026-08-09T00:00:00",
  value: 36.8,
  unit: "celsius",
});
check("celsius passes through", tempC?.value === 36.8);

const water = toCanonical(planFor("waterMl"), {
  startDate: "2026-08-09T00:00:00",
  value: 2.5,
  unit: "liter",
});
check("2.5 litres becomes 2500 mL", water?.value === 2500, String(water?.value));

const spo2Fraction = toCanonical(planFor("oxygenSaturation"), {
  startDate: "2026-08-09T00:00:00",
  value: 0.97,
  unit: "percent",
});
check("SpO2 of 0.97 becomes 97", spo2Fraction?.value === 97, String(spo2Fraction?.value));

const spo2Percent = toCanonical(planFor("oxygenSaturation"), {
  startDate: "2026-08-09T00:00:00",
  value: 97,
  unit: "percent",
});
check("SpO2 already in percent is untouched", spo2Percent?.value === 97);

/**
 * The pounds case. There is no HealthUnit for pounds, so this cannot arrive
 * today — the assertion exists because the failure it describes is the one
 * that would be least visible if a future plugin version added one.
 */
const badWeight = toCanonical(planFor("weightKg"), {
  startDate: "2026-08-09T00:00:00",
  value: 181,
  unit: "pound",
});
check("an unrecognised unit is dropped, not relabelled", badWeight === null);

const nan = toCanonical(planFor("steps"), {
  startDate: "2026-08-09T00:00:00",
  value: Number.NaN,
  unit: "count",
});
check("NaN is dropped", nan === null);

// ── 3. Day boundaries ──────────────────────────────────────────────────────
section("Day boundaries");

/**
 * The UTC bug, stated as a test. A member in Los Angeles at 6pm on the 9th is
 * already the 10th in UTC, so `toISOString().slice(0,10)` would file that
 * evening's walk under tomorrow.
 */
const evening = new Date(2026, 7, 9, 18, 30); // local 9 Aug, 18:30
check("local evening keeps its own date", localDate(evening) === "2026-08-09", localDate(evening));

const earlyMorning = new Date(2026, 7, 9, 0, 15);
check(
  "local early morning keeps its own date",
  localDate(earlyMorning) === "2026-08-09",
  localDate(earlyMorning)
);
check("an unparseable date yields nothing", localDate("not a date") === "");

// ── 4. Sleep ───────────────────────────────────────────────────────────────
section("Sleep");

const overnight = foldSleep([
  {
    startDate: new Date(2026, 7, 8, 23, 40).toISOString(),
    endDate: new Date(2026, 7, 9, 7, 10).toISOString(),
    sleepState: "asleep",
  },
]);
check("a session is attributed to the morning it ends", overnight[0]?.onDate === "2026-08-09", overnight[0]?.onDate);
check("its length is the session length", Math.round(overnight[0]?.value ?? 0) === 450, String(overnight[0]?.value));

const inBed = foldSleep([
  {
    startDate: new Date(2026, 7, 8, 22, 0).toISOString(),
    endDate: new Date(2026, 7, 9, 6, 0).toISOString(),
    sleepState: "inBed",
  },
]);
check("time in bed is not counted as sleep", inBed.length === 0);

const staged = foldSleep([
  {
    startDate: new Date(2026, 7, 8, 23, 0).toISOString(),
    endDate: new Date(2026, 7, 9, 7, 0).toISOString(),
    stages: [
      { startDate: "", endDate: "", stage: "light", durationMinutes: 240 },
      { startDate: "", endDate: "", stage: "deep", durationMinutes: 90 },
      { startDate: "", endDate: "", stage: "rem", durationMinutes: 110 },
      { startDate: "", endDate: "", stage: "awake", durationMinutes: 40 },
    ],
  },
]);
const byMetric = new Map(staged.map((s) => [s.metric, s.value]));
check("stages sum into total sleep", byMetric.get("sleepMinutes") === 440, String(byMetric.get("sleepMinutes")));
check("deep is broken out", byMetric.get("sleepDeepMinutes") === 90);
check("REM is broken out", byMetric.get("sleepRemMinutes") === 110);
check("awake is tracked separately", byMetric.get("sleepAwakeMinutes") === 40);
check(
  "awake is excluded from the total",
  (byMetric.get("sleepMinutes") ?? 0) < 440 + 40,
  "awake was counted as sleep"
);
for (const s of staged) check(`${s.metric} is in minutes`, s.unit === "min");

// ── 5. Server-side validation matches what the client can send ─────────────
section("Client and server agree");

/**
 * Every unit the client is capable of emitting must be one the server accepts,
 * or the sample makes a round trip only to be rejected — and the member sees
 * an empty chart with a successful sync behind it.
 */
for (const plan of METRIC_PLANS) {
  const emitted = CANONICAL_UNITS[plan.metric];
  check(
    `${plan.metric}: the unit the client emits is the one the server wants`,
    emitted === HEALTH_UNITS[plan.metric],
    `${emitted} vs ${HEALTH_UNITS[plan.metric]}`
  );
}

/** A realistic day has to survive the range filter. */
const REALISTIC: Record<string, number> = {
  steps: 8_400,
  distanceMeters: 6_200,
  activeCalories: 540,
  restingHeartRate: 54,
  heartRateVariability: 62,
  sleepMinutes: 442,
  weightKg: 78.6,
  oxygenSaturation: 97,
  bodyTemperatureC: 36.7,
  vo2Max: 48,
  waterMl: 2_500,
};
for (const [metric, value] of Object.entries(REALISTIC)) {
  const [lo, hi] = HEALTH_RANGES[metric as keyof typeof HEALTH_RANGES];
  check(`a realistic ${metric} (${value}) is inside its range`, value >= lo && value <= hi);
}

/** And the cumulative-total failure has to not survive it. */
check("a lifetime step total is rejected", 4_000_000 > HEALTH_RANGES.steps[1]);
check("a summed day of resting HR is rejected", 1_400 > HEALTH_RANGES.restingHeartRate[1]);

// ── 6. The permission surface ──────────────────────────────────────────────
section("Native permission surface");

const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const strings = readFileSync("android/app/src/main/res/values/strings.xml", "utf8");
const plist = readFileSync("ios/App/App/Info.plist", "utf8");
const entitlements = readFileSync("ios/App/App/App.entitlements", "utf8");

check("the manifest declares the tools namespace", manifest.includes("xmlns:tools="));
check(
  "history access is requested, so Android is not capped at 30 days",
  manifest.includes("android.permission.health.READ_HEALTH_DATA_HISTORY")
);

/**
 * The plugin's own manifest declares a write permission for every type it
 * supports. We never write. Each one left in place is a data type Google's
 * declaration form asks us to justify, and "we do not use it" is not a
 * justification that passes.
 */
const pluginManifest = readFileSync(
  "node_modules/@capgo/capacitor-health/android/src/main/AndroidManifest.xml",
  "utf8"
);
const declaredWrites = Array.from(
  // [A-Z0-9_] — not [A-Z_]. Without the digits this stops at the 2 in
  // WRITE_VO2_MAX and then asserts that a permission named "WRITE_VO", which
  // does not exist, was removed.
  pluginManifest.matchAll(/android\.permission\.health\.(WRITE_[A-Z0-9_]+)/g)
).map((m) => m[1]);
check("the plugin does declare write permissions", declaredWrites.length > 0);
for (const w of Array.from(new Set(declaredWrites))) {
  check(
    `${w} is removed from the merged manifest`,
    new RegExp(`${w}"\\s+tools:node="remove"`).test(manifest)
  );
}

/** Reads we removed must be reads no plan asks for — and vice versa. */
const removedReads = Array.from(
  manifest.matchAll(/android\.permission\.health\.(READ_[A-Z_]+)"\s+tools:node="remove"/g)
).map((m) => m[1]);
const USED_BY_PLAN: Record<string, string> = {
  READ_STEPS: "steps",
  READ_DISTANCE: "distance",
  READ_ACTIVE_CALORIES_BURNED: "calories",
  READ_TOTAL_CALORIES_BURNED: "totalCalories",
  READ_RESTING_HEART_RATE: "restingHeartRate",
  READ_HEART_RATE_VARIABILITY: "heartRateVariability",
  READ_VO2_MAX: "vo2Max",
  READ_WEIGHT: "weight",
  READ_BODY_FAT: "bodyFat",
  READ_HEIGHT: "height",
  READ_RESPIRATORY_RATE: "respiratoryRate",
  READ_OXYGEN_SATURATION: "oxygenSaturation",
  READ_BODY_TEMPERATURE: "bodyTemperature",
  READ_HYDRATION: "dietaryWater",
  READ_NUTRITION: "dietaryEnergyConsumed",
  READ_FLOORS_CLIMBED: "flightsClimbed",
  READ_MINDFULNESS: "mindfulness",
};
for (const r of removedReads) {
  const dataType = USED_BY_PLAN[r];
  check(
    `${r} is removed and nothing reads it`,
    !dataType || !READ_TYPES.includes(dataType),
    `${r} was removed but ${dataType} is still requested`
  );
}

check(
  "Health Connect has a privacy policy URL to show",
  strings.includes("health_connect_privacy_policy_url")
);
check(
  "the HealthKit purpose string exists, or the app crashes on first prompt",
  plist.includes("NSHealthShareUsageDescription")
);
check(
  "the purpose string says what we do with it",
  /NSHealthShareUsageDescription<\/key>\s*<string>[^<]{80,}/.test(plist)
);
check("the HealthKit entitlement is present", entitlements.includes("com.apple.developer.healthkit"));
check(
  "clinical records are not requested",
  /com\.apple\.developer\.healthkit\.access<\/key>\s*<array\/>/.test(entitlements)
);

// ── 7. We only read ────────────────────────────────────────────────────────
section("Read-only");

const bridge = readFileSync("client/src/lib/health.ts", "utf8");
check("authorization asks for no write scopes", /write:\s*\[\]/.test(bridge));
check("nothing calls saveSample", !bridge.includes("saveSample"));

const routes = readFileSync("server/health/routes.ts", "utf8");
check(
  "there is no admin write route for health data",
  !/app\.(post|put|patch)\(\s*"\/api\/admin\/health/.test(routes)
);
check(
  "disconnecting deletes rather than flags",
  // Matched without the `db` prefix: the two calls are formatted differently
  // (one chained inline, one broken across lines by the formatter), so
  // "db.delete(healthWorkouts)" appears nowhere in the file even though the
  // delete is right there.
  routes.includes(".delete(healthDays)") && routes.includes(".delete(healthWorkouts)")
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
