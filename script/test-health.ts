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
import {
  METRIC_DISPLAY,
  GROUP_ORDER,
  groupsWithData,
  summarise,
  pickSwatches,
  SWATCH_PRIORITY,
  METRIC_TARGET,
  seriesFor,
  planTiles,
  trendOf,
} from "../client/src/lib/healthDisplay.js";

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

// ── 8. The native background implementations ──────────────────────────────
section("Build numbers");

/**
 * Every iOS target carries the same build number.
 *
 * App Store Connect rejects an upload whose extension build number differs
 * from the app's, and it rejects it *after* the upload — the slowest possible
 * place to learn. These two have now drifted apart twice in one day, in two
 * different ways: once because a new target starts its numbering at 1 rather
 * than inheriting the app's, and once because bumping the number in Xcode's
 * UI edits the selected target and leaves the other behind.
 *
 * Twice is a pattern, so this is an assertion rather than a paragraph in
 * docs/widget-setup.md, which is where the warning lived while both failures
 * happened.
 */
const PBXPROJ = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
const buildNumbers = Array.from(
  new Set(Array.from(PBXPROJ.matchAll(/CURRENT_PROJECT_VERSION = ([0-9]+);/g)).map((m) => m[1]))
);
check(
  "every iOS target shares one build number",
  buildNumbers.length === 1,
  `found ${buildNumbers.join(", ")} — App Store Connect rejects a mismatch after the upload`
);

/** Both targets must also agree on the App Group, or the widget reads nothing. */
const APP_ENT = readFileSync("ios/App/App/App.entitlements", "utf8");
const WIDGET_ENT = readFileSync("ios/App/SakredWidgetExtension.entitlements", "utf8");
const APP_GROUP = "group.com.sakredbody.app";
check("the app declares the App Group", APP_ENT.includes(APP_GROUP));
check("the widget declares the same App Group", WIDGET_ENT.includes(APP_GROUP));
check(
  "the Swift engine writes to that same group",
  readFileSync(
    "plugins/health-sync/ios/Sources/HealthSyncPlugin/HealthSyncEngine.swift",
    "utf8"
  ).includes(APP_GROUP),
  "a mismatch is silent — UserDefaults(suiteName:) returns nil and the widget shows its placeholder forever"
);

section("Background sync (native)");

/**
 * The unit table now exists three times: TypeScript, Swift and Kotlin. That is
 * the real cost of syncing from a background wake — the WebView is suspended,
 * so the mapping has to be repeated in each native language.
 *
 * Three copies drift. These assertions are the thing that makes the drift loud
 * instead of silent, because the failure mode is not a crash: a Swift table
 * missing an entry falls back to "count", the server rejects the sample for a
 * unit mismatch, and the member simply never sees that metric.
 */
const swift = readFileSync("plugins/health-sync/ios/Sources/HealthSyncPlugin/HealthSyncEngine.swift", "utf8");
const kotlin = readFileSync(
  "plugins/health-sync/android/src/main/java/com/sakredbody/healthsync/HealthSyncWorker.kt",
  "utf8"
);

for (const m of METRICS) {
  const unit = HEALTH_UNITS[m];
  check(
    `Swift knows ${m} is in ${unit}`,
    new RegExp(`"${m}"\\s*:\\s*"${unit.replace(/[/*]/g, "\\$&")}"`).test(swift),
    "missing or wrong in HealthSyncEngine.swift"
  );
  check(
    `Kotlin knows ${m} is in ${unit}`,
    new RegExp(`"${m}"\\s+to\\s+"${unit.replace(/[/*]/g, "\\$&")}"`).test(kotlin),
    "missing or wrong in HealthSyncWorker.kt"
  );
}

const reader = readFileSync(
  "plugins/health-sync/android/src/main/java/com/sakredbody/healthsync/HealthReader.kt",
  "utf8"
);

/**
 * Sleep is attributed to the date the session ENDS on, in all three. This is
 * the single easiest thing to get differently in three languages, and getting
 * it wrong on one platform means iPhone and Android members' sleep sits on
 * different days in the same table.
 */
check("Swift files sleep by end date", /localDate\(sample\.endDate\)/.test(swift));
check("Kotlin files sleep by end date", /localDate\(session\.endTime\)/.test(reader));

/** HealthKit's percent() is a fraction; Health Connect's is already 0–100. */
check("Swift scales HealthKit percentages to 0-100", /scale:\s*100/.test(swift));
check(
  "Swift applies the scale rather than storing it unused",
  /doubleValue\(for:\s*plan\.unit\)\s*\*\s*plan\.scale/.test(swift)
);

/** Both native paths must dedupe before posting, for the same Postgres reason. */
check("Swift dedupes by date and metric", /byKey\[/.test(swift));
check("Kotlin dedupes by date and metric", /byKey\[/.test(kotlin));

/** Neither native path may write to the health store. */
/**
 * Read-only means no WRITE call, not "does not mention workouts". The original
 * form of this assertion used the absence of HKObjectType.workoutType as a
 * proxy, which was simply wrong — reading a member's workouts requires exactly
 * that symbol, so the check would have blocked a legitimate read while still
 * permitting an actual save.
 */
check("Swift never writes to HealthKit", !/store\.save\(/.test(swift));
check("Swift does read workouts in the background", /HKObjectType\.workoutType\(\)/.test(swift));
check(
  "background workouts carry a stable idempotency key",
  /externalId:\s*workout\.uuid\.uuidString/.test(swift)
);
check("Kotlin never writes records", !/insertRecords/.test(reader));

/** A 401 must not be retried forever — nothing native can refresh a token. */
check("Swift stops on 401", /status == 401/.test(swift));
check("Kotlin stops on 401", /401 ->\s*PostResult\.Unauthorized/.test(kotlin));

/**
 * The iOS observers must be re-registered on every launch. An HKObserverQuery
 * does not survive process death, so a plugin that registers once at first
 * grant works right up until iOS kills the app, and then never again.
 */
const swiftPlugin = readFileSync("plugins/health-sync/ios/Sources/HealthSyncPlugin/HealthSyncPlugin.swift", "utf8");
check(
  "iOS re-registers observers in load()",
  /override public func load\(\)[\s\S]{0,220}enableBackgroundDelivery/.test(swiftPlugin)
);

const appEntitlements = readFileSync("ios/App/App/App.entitlements", "utf8");
check(
  "the background delivery entitlement is present",
  appEntitlements.includes("com.apple.developer.healthkit.background-delivery")
);

const pluginManifestAndroid = readFileSync(
  "plugins/health-sync/android/src/main/AndroidManifest.xml",
  "utf8"
);
check(
  "Android asks for background read",
  pluginManifestAndroid.includes("android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND")
);

/**
 * Health Connect's client declares minSdk 26. A library floor above the
 * application's stops the Android build outright, so this is a build break
 * rather than a warning.
 */
const variables = readFileSync("android/variables.gradle", "utf8");
const minSdk = Number(/minSdkVersion\s*=\s*(\d+)/.exec(variables)?.[1] ?? 0);
check("the app's minSdk clears Health Connect's floor", minSdk >= 26, `minSdk is ${minSdk}`);


// ── 9. Everything we store has somewhere to be shown ───────────────────────
section("Display");

/**
 * The gap this closes: the sync collected twenty-two metrics and the UI
 * hard-coded four, so eighteen were stored and rendered nowhere. Nothing
 * failed — a missing metric looks exactly like a member having no data for it,
 * which is why it survived review.
 */
for (const m of METRICS) {
  const d = METRIC_DISPLAY[m];
  check(`${m} has a display definition`, Boolean(d));
  if (!d) continue;
  check(`${m} has a label`, d.label.length > 0);
  check(`${m} sits in a known group`, GROUP_ORDER.includes(d.group), d.group);
  check(`${m} formats a number without throwing`, typeof d.format(1) === "string");
  check(`${m} declares how a window collapses`, ["average", "latest"].includes(d.summarise));
}

/** Formatting has to be readable, not merely produced. */
check("442 minutes reads as 7h 22m", METRIC_DISPLAY.sleepMinutes.format(442) === "7h 22m",
  METRIC_DISPLAY.sleepMinutes.format(442));
check("45 minutes drops the hour", METRIC_DISPLAY.exerciseMinutes.format(45) === "45m",
  METRIC_DISPLAY.exerciseMinutes.format(45));
check("6200 metres reads as 6.2 km", METRIC_DISPLAY.distanceMeters.format(6200) === "6.2 km",
  METRIC_DISPLAY.distanceMeters.format(6200));
check("2500 mL reads as 2.5 L", METRIC_DISPLAY.waterMl.format(2500) === "2.5 L",
  METRIC_DISPLAY.waterMl.format(2500));
check("resting HR carries its unit", METRIC_DISPLAY.restingHeartRate.format(54) === "54 bpm",
  METRIC_DISPLAY.restingHeartRate.format(54));
check("weight keeps one decimal", METRIC_DISPLAY.weightKg.format(78.64) === "78.6 kg",
  METRIC_DISPLAY.weightKg.format(78.64));

/**
 * Direction of "better" is per metric and gets colour applied to it, so a
 * wrong one is an actively misleading green arrow rather than a missing tile.
 */
check("a rising resting heart rate is not an improvement",
  METRIC_DISPLAY.restingHeartRate.higherIsBetter === false);
check("more time awake in the night is not an improvement",
  METRIC_DISPLAY.sleepAwakeMinutes.higherIsBetter === false);
check("more HRV is an improvement", METRIC_DISPLAY.heartRateVariability.higherIsBetter === true);
check("weight takes no position", METRIC_DISPLAY.weightKg.higherIsBetter === null);
check("body fat takes no position", METRIC_DISPLAY.bodyFatPercent.higherIsBetter === null);

/** Measured values must never be summed across a window. */
for (const m of NEVER_SUMMED) {
  check(`${m} is summarised, not totalled`,
    METRIC_DISPLAY[m as keyof typeof METRIC_DISPLAY].summarise !== ("total" as never));
}

// ── 10. The shape the API actually returns ─────────────────────────────────
section("Pivot → UI");

/**
 * Built to match what /api/health/summary emits: one object per day, metric
 * names as keys. If the server's pivot and this ever disagree, every tile
 * silently renders "no data".
 */
const series = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 6, 1 + i);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    onDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    // Last week deliberately worse than the weeks before it.
    steps: i >= 23 ? 6000 : 10000,
    sleepMinutes: 430,
    restingHeartRate: 54,
    weightKg: 78 + i * 0.01,
  };
});

const stepStat = summarise(series, "steps");
check("a metric present every day is summarised", stepStat !== null);
check("the headline is the recent window", Math.round(stepStat?.value ?? 0) === 6000,
  String(stepStat?.value));
check("the baseline excludes the recent window", Math.round(stepStat?.baseline ?? 0) === 10000,
  String(stepStat?.baseline));

const weightStat = summarise(series, "weightKg");
check("a 'latest' metric takes the last value, not a mean",
  Math.abs((weightStat?.value ?? 0) - 78.29) < 0.001, String(weightStat?.value));
check("a 'latest' metric shows no trend", weightStat?.baseline === null);

check("a metric with no data yields nothing", summarise(series, "vo2Max") === null);

const shown = groupsWithData(series);
const shownMetrics = shown.flatMap((g) => g.metrics);
check("only metrics with data are grouped", shownMetrics.length === 4, shownMetrics.join(", "));
check("groups come back in display order",
  shown.map((g) => g.group).join(",") === "Movement,Sleep,Heart,Body",
  shown.map((g) => g.group).join(","));
check("an empty series renders nothing", groupsWithData([]).length === 0);

/**
 * A short history must not fabricate a trend. Two days is not a baseline, and
 * an arrow drawn from it is a number the member will act on.
 */
const short = series.slice(-4);
check("four days produce no baseline", summarise(short, "steps")?.baseline === null);

/** Both surfaces read the same table — no second source of truth. */
const card = readFileSync("client/src/components/portal/HealthCard.tsx", "utf8");
const coach = readFileSync("client/src/components/admin/MemberHealth.tsx", "utf8");
for (const [name, src] of [["member card", card], ["coach panel", coach]] as const) {
  check(`the ${name} uses METRIC_DISPLAY`, src.includes("METRIC_DISPLAY"));
  check(`the ${name} renders every group with data`, src.includes("groupsWithData"));
  check(`the ${name} hard-codes no metric list`, !/const\s+(HEADLINE|TRACKED)\s*=/.test(src));
}



// ── 11. What the model is told ─────────────────────────────────────────────
section("The model gets no name");

/**
 * The daily note is generated by a third-party model. Before this, the prompt
 * carried `Name: Nick` next to that member's protocol and intention — and now
 * it would have carried their sleep and heart data too. That is a named
 * person's health information leaving our infrastructure on every generation.
 */
const VOICE = readFileSync("server/daily/voice.ts", "utf8");
const GENERATE = readFileSync("server/daily/generate.ts", "utf8");

check("the prompt no longer carries a name", !/Name:\s*\$\{ctx\.firstName\}/.test(VOICE));
check("NoteContext has no firstName", !/firstName\??:/.test(VOICE));
check("the prompt carries a ref instead", /Member:\s*\$\{ctx\.memberRef\}/.test(VOICE));
check(
  "the model is told not to write the ref back",
  /never write it/.test(VOICE),
  "a bare id in a note reads as a bug to the member"
);
check(
  "the context is built with a ref",
  /memberRef:\s*memberRef\(userId\)/.test(GENERATE)
);
/**
 * The name IS read again — deliberately, and this assertion had to change to
 * say so honestly rather than fail.
 *
 * The first version of this rule was "do not select it at all", which was right
 * while nothing consumed it. It now has one consumer: sanitisePrompt needs the
 * exact values to remove them from the member's own free text with certainty
 * rather than by pattern. So the rule is no longer "never read it" but the
 * stronger and more useful "read it only to remove it".
 */
check(
  "the name is read only to be scrubbed",
  /identifiers:\s*\[user\?\.firstName/.test(GENERATE),
  "if it is selected it must flow into the scrub list and nowhere else"
);
check(
  "no prompt line interpolates a name field",
  !/lines\.push\([^)]*(firstName|lastName|\bemail\b)/.test(VOICE),
  "reading it for redaction is fine; writing it into a prompt is not"
);

/**
 * The ref must be an HMAC, not the user id. The user id is a join key printed
 * beside the member's name in every other table, so a prompt log carrying it
 * could be re-identified by anyone who also had a database dump.
 */
const REF = readFileSync("server/daily/memberRef.ts", "utf8");
check("the ref is an HMAC", /createHmac\(/.test(REF));
check("the ref is not the raw user id", !/return\s+userId/.test(REF));
check("the secret is never logged", !/console\.(log|warn|error)\([^)]*SECRET/.test(REF));

const { memberRef } = await import("../server/daily/memberRef.js");
const a = memberRef("user-alpha");
const b = memberRef("user-beta");
check("a ref is stable for the same member", memberRef("user-alpha") === a);
check("two members get different refs", a !== b);
check("a ref contains no part of the user id", !a.includes("alpha"));
check("a ref is short enough to read as a label", a.length <= 16, a);

/** Health reaches the model as signals, not as raw arithmetic to do. */
const SIGNALS = readFileSync("server/daily/healthSignals.ts", "utf8");
check("signals are reduced server-side", /reduce\(/.test(SIGNALS));
check(
  "a short history produces no claim about them",
  /points\.length < 3/.test(SIGNALS),
  "one night presented as 'lately' is a claim that isn't true"
);
check(
  "the model is told these are not a diagnosis",
  /not a diagnosis/.test(VOICE) && /Do not give medical advice/.test(VOICE)
);



// ── 12. An assumption we hold on a library internal ────────────────────────
section("date columns come back as strings");

/**
 * Postgres `date` columns are read as strings all over this codebase — the
 * pivot in server/health/routes.ts keys a Map by one, and both
 * server/coaching/enrollment.ts and server/training/strength.ts call
 * localeCompare on one. TypeScript agrees, because Drizzle types date() as
 * string.
 *
 * But node-postgres does NOT parse a DATE to a string by default: pg-types
 * returns a Date object for OID 1082. The only reason the string type is true
 * is that drizzle-orm/node-postgres installs its own getTypeParser and returns
 * identity for DATE, TIMESTAMP, TIMESTAMPTZ and INTERVAL.
 *
 * That is a library internal, not a documented contract, and the failure if a
 * future version drops it is not a type error — it is `.localeCompare is not a
 * function` inside daily-note generation, and a Map keyed by Date whose lookups
 * silently miss so one day's metrics split across several rows.
 *
 * This assertion is the tripwire. If it fails after an upgrade, the fix is to
 * normalise every date read, not to delete the check.
 */
const DRIZZLE_SESSION = readFileSync(
  "node_modules/drizzle-orm/node-postgres/session.js",
  "utf8"
);
check(
  "drizzle still overrides the DATE parser",
  /types\.builtins\.DATE\)\s*\{\s*return\s*\(val\)\s*=>\s*val;/.test(
    DRIZZLE_SESSION.replace(/\s+/g, " ").replace(/if \(typeId === /g, "if (typeId === ")
  ) || /builtins\.DATE[\s\S]{0,80}\(val\) => val/.test(DRIZZLE_SESSION),
  "date columns would start arriving as Date objects"
);
check(
  "and the timestamp parsers too",
  /builtins\.TIMESTAMP[\s\S]{0,80}\(val\) => val/.test(DRIZZLE_SESSION)
);



// ── 13. Nothing identifying reaches the model ──────────────────────────────
section("What leaves for inference");

const { sanitisePrompt, findLeaks, redactFree, scrubKnown } = await import(
  "../server/daily/redact.js"
);
const { buildUserPrompt } = await import("../server/daily/voice.js");

const IDS = ["Nicholas", "Russell", "nick@sakredhealth.com"];

/** The exact pass: values we hold, so certainty rather than a guess. */
check(
  "a member's own name is removed",
  !scrubKnown("Nicholas should rest", IDS).includes("Nicholas")
);
check(
  "a name inside a longer word survives",
  scrubKnown("Sameness matters", ["Sam"]).includes("Sameness"),
  "over-eager scrubbing turns a note into [redacted] soup"
);
check("case does not matter", !scrubKnown("nicholas here", IDS).toLowerCase().includes("nicholas"));

/** The pattern pass: shapes we recognise without knowing the person. */
check("an email is removed", !redactFree("write to a@b.com today").includes("a@b.com"));
check("a phone number is removed", !redactFree("call 555 123 4567 now").includes("4567"));
check("a URL is removed", !redactFree("see https://example.com/x").includes("example.com"));
check("a handle is removed", !redactFree("ask @drnguyen about it").includes("@drnguyen"));
check(
  "a record number is removed",
  !redactFree("policy 883921144 renews").includes("883921144")
);
check("ordinary numbers survive", redactFree("8 hours and 54 bpm").includes("54"));

/**
 * The whole assembled prompt, for a member with everything filled in and an
 * intention written the way a real person eventually will.
 */
const prompt = buildUserPrompt({
  almanac: {
    date: "2026-08-10",
    moon: { phase: "waning gibbous", direction: "waning", illumination: 0.72, age: 18 },
    sunSign: "Leo",
    season: "summer",
    elemental: { season: "late summer", element: "earth", organ: "spleen" },
    universalDay: 7,
    personal: { depth: 0.8, personalDay: 4, personalYear: 9, lifePath: 3 },
  } as never,
  memberRef: "m-9f2a1c7d40",
  identifiers: IDS,
  polarity: "balanced",
  health: [{ label: "Sleep", recent: "6h 40m a night", direction: "down, and worth noticing" }],
  protocol: { name: "Liver Clear", dayNumber: 3, durationDays: 28, phase: "clear" },
  intention: "Text Nicholas at 555 123 4567 and email nick@sakredhealth.com about the biopsy",
  recentCompletion: { done: 9, total: 21 },
} as never);

const { prompt: safe, redacted } = sanitisePrompt(prompt, IDS);

check("the raw prompt did contain identifiers", findLeaks(prompt, IDS).length > 0);
check("the sanitised prompt contains none", redacted.length === 0, redacted.join(", "));
check("the member's name is gone", !/Nicholas/i.test(safe));
check("their email is gone", !/sakredhealth\.com/i.test(safe));
check("their phone number is gone", !/555\s?123\s?4567/.test(safe));

/** And the note is still worth generating from what remains. */
check("the protocol survives", /Liver Clear/.test(safe));
check("the health signal survives", /6h 40m/.test(safe));
check("the ref survives", /m-9f2a1c7d40/.test(safe));
check("the moon survives", /waning gibbous/.test(safe));

/** Nothing in the prompt builder may read the scrub list. */
const VOICE_SRC = readFileSync("server/daily/voice.ts", "utf8");
const builderBody = VOICE_SRC.slice(VOICE_SRC.indexOf("export function buildUserPrompt"));
check(
  "buildUserPrompt never prints the identifiers it is given",
  !/ctx\.identifiers/.test(builderBody),
  "they exist to be removed, not written"
);

/** The generator must sanitise, not merely have the ability to. */
const GEN_SRC = readFileSync("server/daily/generate.ts", "utf8");
check("every generation is sanitised", /sanitisePrompt\(built/.test(GEN_SRC));
check(
  "the redacted value is never logged",
  !/console\.(warn|log|error)\([^)]*\bbuilt\b/.test(GEN_SRC)
);



// ── 14. A tile only ever appears for data we hold ──────────────────────────
section("Swatches are deterministic");

/**
 * The rule the member can see: never show a stat card for something we do not
 * have for that person. An empty or zeroed tile reads as the app being broken,
 * and from the outside a member cannot tell that apart from "I never shared
 * that category".
 */
const onlyTwo = [
  { onDate: "2026-08-08", steps: 8100, sleepMinutes: 430 },
  { onDate: "2026-08-09", steps: 9300, sleepMinutes: 455 },
];
const picked = pickSwatches(onlyTwo as never, 4);
check("only metrics with data are picked", picked.length === 2, picked.join(", "));
check("sleep outranks steps", picked[0] === "sleepMinutes", picked.join(", "));
check("nothing unheld appears", !picked.includes("vo2Max" as never));
check("no data means no tiles", pickSwatches([], 4).length === 0);

/** A metric the device reports but nobody records. */
const allZero = [
  { onDate: "2026-08-08", steps: 8100, waterMl: 0 },
  { onDate: "2026-08-09", steps: 9300, waterMl: 0 },
];
const zeroPicked = pickSwatches(allZero as never, 4);
check(
  "an all-zero metric is not shown",
  !zeroPicked.includes("waterMl" as never),
  "\"Water 0.0 L\" is the tile that looks like a bug"
);
check("its neighbours still are", zeroPicked.includes("steps" as never));

/** One real reading among zeros is still a reading. */
const oneReal = [
  { onDate: "2026-08-08", waterMl: 0 },
  { onDate: "2026-08-09", waterMl: 1800 },
];
check("a single non-zero day counts", pickSwatches(oneReal as never, 4).includes("waterMl" as never));

/** Never more than asked for, however much data there is. */
const everything: Record<string, number | string> = { onDate: "2026-08-09" };
for (const m of METRICS) everything[m] = 42;
check("the limit is respected", pickSwatches([everything] as never, 4).length === 4);
check("a different limit is respected", pickSwatches([everything] as never, 2).length === 2);

/** Same input, same output — it is a pure function of the data. */
const a1 = pickSwatches(onlyTwo as never, 4).join(",");
const a2 = pickSwatches(onlyTwo as never, 4).join(",");
check("the same data yields the same tiles", a1 === a2);

/** Priority must name only real metrics, or it silently ranks nothing. */
for (const m of SWATCH_PRIORITY) {
  check(`${m} in the swatch priority is a real metric`, METRICS.includes(m));
}

/** Non-finite values are not data. */
const broken = [{ onDate: "2026-08-09", steps: Number.NaN, sleepMinutes: 400 }];
check(
  "NaN does not earn a tile",
  !pickSwatches(broken as never, 4).includes("steps" as never)
);

/** The component must not re-implement the rule it was extracted from. */
const SWATCH_SRC = readFileSync("client/src/components/portal/HealthSwatches.tsx", "utf8");
const DISPLAY_SRC = readFileSync("client/src/lib/healthDisplay.ts", "utf8");
// The component now asks planTiles, which asks pickSwatches — so the rule is
// still the single source of truth, one layer further in. Both links are
// asserted, because "the component calls planTiles" is worth nothing if
// planTiles has quietly stopped consulting the eligibility rule.
check("the component plans its tiles from the data", SWATCH_SRC.includes("planTiles("));
check(
  "the component does not select metrics itself",
  !SWATCH_SRC.includes("pickSwatches("),
  "selection belongs in planTiles; two callers of the rule is two places to change it"
);
check("planTiles is built on pickSwatches", /planTiles[\s\S]{0,600}pickSwatches\(/.test(DISPLAY_SRC));
check(
  "the component keeps no second priority list",
  !/const\s+PRIORITY\s*[:=]/.test(SWATCH_SRC),
  "two orderings drift and the home screen stops matching Stats"
);

// ─── The home board ────────────────────────────────────────────────────────
//
// The layout is derived, so the layout is testable. These pin the rules that
// keep a richer home screen from becoming a dishonest one: no tile without
// data, no chart without enough points to be a shape, no ring without a target
// that exists outside this app.

section("The home board");

/** A metric with no data can never reach the board, whatever its shape. */
const boardSparse = [
  { onDate: "2026-08-07", steps: 8000 },
  { onDate: "2026-08-08", steps: 9100 },
  { onDate: "2026-08-09", steps: 7400 },
];
const sparseTiles = planTiles(boardSparse as never, 5);
check(
  "no tile for a metric with no readings",
  sparseTiles.every((t) => t.metric === "steps"),
  "a tile the member has no data for reads as the app being broken"
);
check("every tile carries a finite value", sparseTiles.every((t) => Number.isFinite(t.value)));

/** Three points is not a chart. */
check(
  "too little history draws no line",
  sparseTiles.every((t) => t.shape !== "spark" || t.points.length >= 4),
  "a three-point line is a shape with no information in it"
);

/** A ring asserts a goal, so it may only appear where a goal is defined. */
const everyMetricDay: Record<string, number | string> = { onDate: "2026-08-09" };
for (const m of METRICS) everyMetricDay[m] = 42;
const wideTiles = planTiles([everyMetricDay] as never, 5);
check(
  "a ring only appears where a target exists",
  wideTiles.every((t) => t.shape !== "ring" || t.target !== null)
);
check(
  "no target is invented for a metric without one",
  wideTiles.every((t) => t.target === null || t.target === METRIC_TARGET[t.metric])
);
for (const metric of Object.keys(METRIC_TARGET)) {
  check(`${metric} carrying a target is a real metric`, METRICS.includes(metric));
}

/** Fourteen days of one metric earns the hero slot; the shape follows the data. */
const fortnight = Array.from({ length: 14 }, (_, i) => ({
  onDate: `2026-07-${String(20 + i).padStart(2, "0")}`,
  sleepMinutes: 420 + i * 3,
}));
const heroTiles = planTiles(fortnight as never, 5);
check("a fortnight of history earns the hero", heroTiles[0].shape === "hero");
check("the hero spans the row", heroTiles[0].span === 4);
check("the hero has points to draw", heroTiles[0].points.length >= 7);
check(
  "one hero at most",
  heroTiles.filter((t) => t.shape === "hero").length <= 1,
  "a screen with two heroes has no hero"
);

/** The grid must not be left with a hole beside an odd tile. */
for (let n = 1; n <= 5; n++) {
  const cols = planTiles([everyMetricDay] as never, n).reduce((sum, t) => sum + t.span, 0);
  check(`a board of ${n} tiles fills whole rows`, cols % 4 === 0);
}

/** Same data, same board — it is a pure function, like the rule beneath it. */
const b1 = JSON.stringify(planTiles(fortnight as never, 5));
const b2 = JSON.stringify(planTiles(fortnight as never, 5));
check("the same data yields the same board", b1 === b2);

/** Gaps are skipped, never filled — a zero-filled day is a fabricated day. */
const gappy = [
  { onDate: "2026-08-05", steps: 9000 },
  { onDate: "2026-08-06" },
  { onDate: "2026-08-07", steps: 11000 },
];
check("a missing day is not read as zero", !seriesFor(gappy as never, "steps" as never).includes(0));
check("only real readings are plotted", seriesFor(gappy as never, "steps" as never).length === 2);
check(
  "the series is capped",
  seriesFor(fortnight as never, "sleepMinutes" as never, 7).length === 7
);

/** Trend is against the member's own past, and silent when it is noise. */
const flat = Array.from({ length: 14 }, (_, i) => ({
  onDate: `2026-07-${String(20 + i).padStart(2, "0")}`,
  restingHeartRate: 60,
}));
check("an unchanged metric shows no trend", trendOf(planTiles(flat as never, 1)[0]) === null);

const climbing = Array.from({ length: 14 }, (_, i) => ({
  onDate: `2026-07-${String(20 + i).padStart(2, "0")}`,
  restingHeartRate: i < 7 ? 55 : 65,
}));
const rhrTrend = trendOf(planTiles(climbing as never, 1)[0]);
check("a real change shows a trend", rhrTrend !== null && rhrTrend.pct > 0);
check(
  "rising resting heart rate is not celebrated",
  rhrTrend !== null && rhrTrend.good === false,
  "higherIsBetter is false for resting HR — the trend colour must follow it"
);

const heavier = Array.from({ length: 14 }, (_, i) => ({
  onDate: `2026-07-${String(20 + i).padStart(2, "0")}`,
  weightKg: i < 7 ? 80 : 86,
}));
const weightTiles = planTiles(heavier as never, 5);
const weightTrend = weightTiles.length ? trendOf(weightTiles[0]) : null;
check(
  "weight is reported without a verdict",
  weightTrend === null || weightTrend.good === null,
  "weight is a goal, not a virtue — colouring it takes a position we have no business taking"
);

/** The prompt only ever appears where it can be acted on. */
const ONBOARD_SRC = readFileSync("client/src/components/portal/Onboarding.tsx", "utf8");
check("onboarding waits for the native probe", /available !== true/.test(ONBOARD_SRC));
check("a connected member skips the health step", /if \(connected\) setStep/.test(ONBOARD_SRC));
check("leaving early is remembered", /SNOOZE_KEY/.test(ONBOARD_SRC));
check(
  "the widget step gives instructions, not a button that cannot work",
  /Touch and hold/.test(ONBOARD_SRC),
  "neither platform lets an app add its own widget"
);
check(
  "notification permission is requested only after a choice",
  /chooseDepth[\s\S]{0,400}requestMorningNotice/.test(ONBOARD_SRC)
);
check(
  "choosing off never raises the system sheet",
  /next === "off"[\s\S]{0,120}return;/.test(ONBOARD_SRC)
);



// ── 15. The morning banner ─────────────────────────────────────────────────
section("Morning notification");

const { morningBody, morningDates, morningNotice } = await import(
  "../client/src/lib/morningNoticeContent.js"
);

/**
 * A notification that says "Open Sakred Body" is an advert for an app the
 * member already installed. Every rule here is about it carrying something
 * they could not have guessed, or not firing.
 */
const withRoutine = morningBody(
  { routine: { name: "Liver Clear" }, dayNumber: 3 } as never,
  5,
  1
);
check("an active protocol names itself", withRoutine?.title === "Day 4 — Liver Clear", withRoutine?.title);
check("the day number advances for tomorrow", /Day 4/.test(withRoutine?.title ?? ""));
check("the practices are counted", withRoutine?.body === "5 practices today.", withRoutine?.body);

const oneHabit = morningBody({ routine: { name: "Liver Clear" }, dayNumber: 1 } as never, 1, 1);
check("one practice is singular", /1 practice today/.test(oneHabit?.body ?? ""), oneHabit?.body);

const noRoutine = morningBody(null, 3, 1);
check("without a protocol it still counts practices", noRoutine?.title === "Today's practice");
check("and says how many", /3 practices waiting/.test(noRoutine?.body ?? ""), noRoutine?.body);

/**
 * The important one. A member with nothing assigned gets nothing — telling
 * someone "0 practices today" every morning is how an app earns a permanent
 * "off" in Settings.
 */
check("nothing assigned means no banner at all", morningBody(null, 0, 1) === null);

const routineOnly = morningBody({ routine: { name: "Reset" }, dayNumber: 9 } as never, 0, 1);
check("a protocol with no practices still has something to say", routineOnly !== null);
check("and does not claim practices it does not have", !/0 practice/.test(routineOnly?.body ?? ""));

/** Scheduling advances a day at a time, at a fixed local hour. */
const from = new Date(2026, 7, 10, 22, 30);
const dates = morningDates(from, 5);
check("five mornings are scheduled", dates.length === 5);
check("the first is tomorrow", dates[0].getDate() === 11, String(dates[0]));
check("at 07:00 local", dates[0].getHours() === 7 && dates[0].getMinutes() === 0);
check("they are consecutive", dates[4].getDate() === 15, String(dates[4]));
check(
  "scheduling from late at night does not fire the same night",
  dates[0].getTime() > from.getTime()
);

/** Re-scheduling must replace, not stack. */
const NOTICE_SRC = readFileSync("client/src/lib/morningNotice.ts", "utf8");
const NOTICE_CONTENT_SRC = readFileSync("client/src/lib/morningNoticeContent.ts", "utf8");
check(
  "ids are fixed so re-scheduling replaces",
  /NOTIFICATION_ID\s*=\s*\d+/.test(NOTICE_CONTENT_SRC)
);
check("previous ones are cancelled first", /LocalNotifications\.cancel/.test(NOTICE_SRC));
/**
 * scheduleMorningNotice runs on every app open, so it must never raise the
 * system permission dialog — an unexplained prompt on launch is the one people
 * refuse, and on iOS a refusal cannot be re-asked in-app.
 */
const scheduler = NOTICE_SRC.slice(
  NOTICE_SRC.indexOf("export async function scheduleMorningNotice"),
  NOTICE_SRC.indexOf("export async function requestMorningNotice")
);
check("the scheduler checks permission", /checkPermissions/.test(scheduler));
check("the scheduler never requests it", !/requestPermissions/.test(scheduler));
check(
  "requesting is its own function, called from Settings",
  /export async function requestMorningNotice/.test(NOTICE_SRC)
);



// ── 16. How much they asked for ────────────────────────────────────────────
section("Notification depth");

const FACTS = {
  routine: { routine: { name: "Liver Clear" }, dayNumber: 3 },
  habitCount: 5,
  sleepMinutes: 400,
  sleepBaseline: 470,
};

check("off schedules nothing", morningNotice(FACTS as never, "off", 1) === null);

const brief = morningNotice(FACTS as never, "brief", 1);
check("brief is one line", brief?.body === "5 practices today.", brief?.body);
check("brief says nothing about sleep", !/slept/.test(brief?.body ?? ""));

const full = morningNotice(FACTS as never, "full", 1);
check("full keeps the practices", /5 practices today/.test(full?.body ?? ""), full?.body);
check("full adds last night", /slept 6h 40m/.test(full?.body ?? ""), full?.body);
check("and reads it against their own baseline", /under your usual/.test(full?.body ?? ""));

const steady = morningNotice(
  { ...FACTS, sleepMinutes: 465, sleepBaseline: 470 } as never,
  "full",
  1
);
check(
  "a normal night is not dressed up as a finding",
  /about your usual/.test(steady?.body ?? ""),
  steady?.body
);

const noBaseline = morningNotice(
  { ...FACTS, sleepBaseline: null } as never,
  "full",
  1
);
check(
  "without a baseline it states the fact and no comparison",
  /You slept/.test(noBaseline?.body ?? "") && !/usual/.test(noBaseline?.body ?? ""),
  noBaseline?.body
);

const noSleep = morningNotice({ ...FACTS, sleepMinutes: null } as never, "full", 1);
check("no sleep data means no sleep sentence", !/slept/.test(noSleep?.body ?? ""), noSleep?.body);

/** Both depths must agree about when there is nothing worth saying. */
check(
  "full stays silent when brief would",
  morningNotice({ routine: null, habitCount: 0 } as never, "full", 1) === null
);

const NOTICE_LIB = readFileSync("client/src/lib/morningNotice.ts", "utf8");
check(
  "switching to off cancels what is already on the device",
  /depth === "off"[\s\S]{0,400}LocalNotifications\.cancel/.test(NOTICE_LIB),
  "those notifications live on the phone, not the server"
);
check(
  "only the full brief pays for the health fetch",
  /depth === "full"[\s\S]{0,120}api\/health\/summary/.test(NOTICE_LIB)
);


console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
