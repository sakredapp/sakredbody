/**
 * Cycle rhythm.
 *
 * The assertion that matters most is the one at the bottom: a woman in late
 * luteal with good sleep, good recovery and a good check-in must still read as
 * primed. If that ever fails, the app has started telling women how they feel
 * from a calendar, which is the failure this whole model exists to prevent.
 */

import {
  estimatePhase,
  cycleLean,
  phaseLabel,
  SELF_GUIDE,
  PARTNER_GUIDE,
  CYCLE_PHASES,
} from "../shared/models/rhythm.js";
import { readReadiness } from "../shared/models/recommend.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean) => {
  if (cond) passed++;
  else failures.push(name);
};

const spontaneous = { model: "spontaneous_cycle" as const, today: "2026-08-11" };

// ─── Estimating ────────────────────────────────────────────────────────────

const bleeding = estimatePhase({ ...spontaneous, lastPeriodStart: "2026-08-09" });
check("day 3 reads menstrual", bleeding.phase === "menstrual");
check("day 3 counts the cycle day", bleeding.cycleDay === 3);
check("a fresh count is only ever 'likely'", bleeding.confidence === "likely");

const follicular = estimatePhase({ ...spontaneous, lastPeriodStart: "2026-07-31" });
check("day 12 reads follicular", follicular.phase === "follicular");

const luteal = estimatePhase({ ...spontaneous, lastPeriodStart: "2026-07-20" });
check("day 23 reads luteal", luteal.phase === "luteal");

// Counting days must never earn the language reserved for her own statement.
check(
  "no date-derived estimate is ever 'confirmed'",
  [bleeding, follicular, luteal].every((e) => e.confidence !== "confirmed"),
);

const said = estimatePhase({ ...spontaneous, confirmedPhase: "luteal", confirmedOn: "2026-08-10" });
check("her own statement is confirmed", said.confidence === "confirmed");
check("her own statement outranks any count", said.provenance === "self_reported");

const oldStatement = estimatePhase({
  ...spontaneous,
  confirmedPhase: "luteal",
  confirmedOn: "2026-07-01",
});
check("a month-old statement goes stale", oldStatement.stale);
check("a stale statement stops being confirmed", oldStatement.confidence !== "confirmed");

// Phases are not meaningful on hormonal contraception — counting anyway would
// produce a confident number about a physiology the model does not describe.
const onPill = estimatePhase({
  model: "hormonal_contraception",
  lastPeriodStart: "2026-07-20",
  today: "2026-08-11",
});
check("no phase is estimated on hormonal contraception", onPill.phase === null);
check("and it says it is uncertain", onPill.confidence === "uncertain");

const irregular = estimatePhase({
  ...spontaneous,
  lastPeriodStart: "2026-07-20",
  regular: false,
});
check("a known-irregular cycle softens to approximate", irregular.confidence === "approximate");

const forgotten = estimatePhase({ ...spontaneous, lastPeriodStart: "2026-06-01" });
check("a long-stale period date estimates nothing", forgotten.phase === null);
check("and marks itself stale", forgotten.stale);

const unknown = estimatePhase({ ...spontaneous, lastPeriodStart: null });
check("no date means no phase", unknown.phase === null);

// ─── Labels carry the confidence ───────────────────────────────────────────

check("a confirmed phase is named plainly", phaseLabel(said) === "Luteal");
check("a counted phase is hedged", phaseLabel(luteal)?.startsWith("Likely") === true);
check("an uncertain estimate is not named at all", phaseLabel(onPill) === null);
check("a stale estimate says so", /out of date/.test(phaseLabel(oldStatement) ?? ""));

// ─── The bound that defines the feature ────────────────────────────────────

for (const phase of CYCLE_PHASES) {
  const lean = cycleLean({
    phase,
    cycleDay: 10,
    confidence: "likely",
    provenance: "estimated",
    stale: false,
  });
  check(`${phase}: never contributes more than ±1`, Math.abs(lean) <= 1);
}

check("a stale estimate contributes nothing", cycleLean(oldStatement) === 0);
check("an uncertain estimate contributes nothing", cycleLean(onPill) === 0);

// THE assertion. Her own signals must outrank the phase, every time.
const lateLutealButStrong = readReadiness({
  sleepMinutes: 510,
  sleepBaselineMinutes: 450,
  hrv: 62,
  hrvBaseline: 55,
  terrainLean: 2,
  cycleLean: cycleLean(luteal),
});
check(
  "late luteal with good sleep, recovery and energy still reads primed",
  lateLutealButStrong.level === "primed",
);

// And the phase must never be able to manufacture a bad day on its own.
const phaseAlone = readReadiness({ cycleLean: -1 });
check("a phase on its own cannot make a day depleted", phaseAlone.level !== "depleted");
check("a phase on its own is not grounds to claim we read the day", phaseAlone.confidence === "none");
check("a phase never writes a reason a member reads", phaseAlone.reasons.length === 0);

// It should still be able to tip a genuinely borderline day.
const borderline = readReadiness({ sleepMinutes: 390, sleepBaselineMinutes: 450, cycleLean: -1 });
check("but it can tip a borderline day", borderline.level === "depleted");

// ─── The guides ────────────────────────────────────────────────────────────

for (const phase of CYCLE_PHASES) {
  for (const [name, guide] of [
    ["self", SELF_GUIDE[phase]],
    ["partner", PARTNER_GUIDE[phase]],
  ] as const) {
    check(`${name}/${phase}: complete`, Boolean(guide.summary && guide.goodMove && guide.worthAsking));
    // Hedged, because the variation between women is larger than the pattern.
    check(
      `${name}/${phase}: never states how she feels`,
      !/you will feel|she will be|she'll be|women are|makes her/i.test(
        `${guide.summary} ${guide.goodMove}`,
      ),
    );
    check(`${name}/${phase}: asks rather than assumes`, guide.worthAsking.includes("?"));
  }
  // Nothing in here may read as fertility or contraception guidance.
  check(
    `${phase}: no fertility framing`,
    !/fertile|conceive|pregnan|contracept|safe day/i.test(
      `${SELF_GUIDE[phase].summary} ${PARTNER_GUIDE[phase].summary}`,
    ),
  );
}

check(
  "the partner guide offers actions, not mood predictions",
  Object.values(PARTNER_GUIDE).every((g) => !/emotional|moody|irrational|hormonal/i.test(g.summary)),
);

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log(`✓ ${passed} rhythm assertions passed`);
