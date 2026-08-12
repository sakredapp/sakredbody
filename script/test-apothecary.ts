/**
 * The Apothecary, selected rather than invented.
 *
 * The assertion that matters most is the stressor rule: sauna, cold and every
 * other genuine adaptive load must never be offered to somebody whose day is
 * already asking for less. They are all real practices, they are all in the
 * library, and "it is healthy and it is in there" is exactly how a recovery
 * feature ends up telling a wrecked person to get in an ice bath.
 */

import {
  SUPPORT_LIBRARY,
  selectSupport,
  conditionsFrom,
  SUPPORT_TYPES,
  SUPPORT_CONDITIONS,
  EVIDENCE_LEVELS,
  EVIDENCE_LANGUAGE,
  type SupportPrimitive,
} from "../shared/models/apothecary.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean) => {
  if (cond) passed++;
  else failures.push(name);
};

// ─── The safety rule ───────────────────────────────────────────────────────

const stressors = SUPPORT_LIBRARY.filter((p) => p.loadClass === "stressor");
check("the library contains real stressors to withhold", stressors.length >= 2);

const wrecked = selectSupport({
  conditions: ["low_sleep", "low_recovery", "high_training_load"],
  depleted: true,
  limit: 5,
});
check(
  "nothing demanding is offered on a depleted day",
  wrecked.every((p) => p.loadClass !== "stressor"),
);
check("but the day still gets real options", wrecked.length >= 3);

// The same state with room in it may see them.
const capable = selectSupport({ conditions: ["high_training_load"], depleted: false, limit: 8 });
check(
  "a day with room can still be offered heat or cold",
  capable.some((p) => p.loadClass === "stressor"),
);

// ─── Selection ─────────────────────────────────────────────────────────────

const badNight = selectSupport({ conditions: ["low_sleep", "trouble_winding_down"] });
check("a bad night returns three options", badNight.length === 3);

/**
 * Three teas is a shop. The point is genuinely different classes of answer —
 * something to drink, something to take, something to do.
 */
check("spread across kinds, not stacked in one", new Set(badNight.map((p) => p.type)).size === 3);
check(
  "and the herbal one is among them",
  badNight.some((p) => p.type === "herbal"),
);

check("no conditions means no suggestions", selectSupport({ conditions: [] }).length === 0);

const excluded = selectSupport({
  conditions: ["low_sleep", "trouble_winding_down"],
  exclude: ["evening_tea"],
});
check(
  "something turned off is never offered again",
  !excluded.some((p) => p.id === "evening_tea"),
);

// Every condition the model can produce must have something to answer it.
for (const condition of SUPPORT_CONDITIONS) {
  check(
    `${condition}: something in the library answers it`,
    SUPPORT_LIBRARY.some((p) => p.conditions.includes(condition)),
  );
}

// ─── Every primitive is complete, and none of them prescribe ───────────────

const text = (p: SupportPrimitive) => `${p.title} ${p.action} ${p.why} ${p.deeper}`;

/**
 * The line this library must not cross. Named preparations and how they are
 * traditionally used is honest; a dose is prescribing, and a claim to treat is
 * a medical claim a health app cannot make.
 */
const DOSAGE = /\b\d+\s?(mg|mcg|g|ml|iu|grams|milligrams)\b/i;
const CLAIMS = /\bcures?\b|\btreats?\b|\bwill fix\b|\bheals?\b|\bprevents?\b|\bdiagnos/i;

for (const p of SUPPORT_LIBRARY) {
  check(`${p.id}: complete`, Boolean(p.title && p.action && p.why && p.deeper));
  check(`${p.id}: has a need`, p.supportFor.length > 0);
  check(`${p.id}: has a condition`, p.conditions.length > 0);
  check(`${p.id}: a known type`, (SUPPORT_TYPES as readonly string[]).includes(p.type));
  check(`${p.id}: no dose`, !DOSAGE.test(text(p)));
  check(`${p.id}: no medical claim`, !CLAIMS.test(text(p)));
  // The useful consequence leads; the lineage is the third layer.
  check(
    `${p.id}: doesn't open with the tradition`,
    !/^according to|^in ayurveda|^in chinese medicine/i.test(p.action),
  );
}

// ─── Evidence bounds the language ──────────────────────────────────────────

/**
 * The failure this prevents: a long tradition of use quietly becoming a modern
 * mechanistic fact. "Long used as an evening calming herb" is honest about
 * chamomile; "shown to improve sleep" is not, because the human evidence for
 * that is limited.
 *
 * So the verbs reserved for demonstrated effects may not appear on an entry
 * whose basis is traditional or mechanistic.
 */
const DEMONSTRATED = /\b(shown to|proven|demonstrated to|clinically proven|is effective|will improve)\b/i;
/** Hedges that must be present somewhere once a claim gets specific. */
const HEDGED = /\b(some people|traditionally|long used|may |tends? to|often|usually|limited|mixed|preclinical)\b/i;

for (const p of SUPPORT_LIBRARY) {
  check(`${p.id}: declares its evidence`, (EVIDENCE_LEVELS as readonly string[]).includes(p.evidence));

  if (p.evidence === "traditional" || p.evidence === "mechanistic") {
    check(
      `${p.id}: doesn't claim a demonstrated effect`,
      !DEMONSTRATED.test(`${p.why} ${p.deeper}`),
    );
    check(`${p.id}: hedges somewhere`, HEDGED.test(`${p.why} ${p.deeper}`));
  }
}

check("every level has a language ceiling", EVIDENCE_LEVELS.every((l) => Boolean(EVIDENCE_LANGUAGE[l])));

/**
 * The specific card that prompted this. Chamomile's human evidence for sleep
 * is limited and the receptor work is preclinical and inconsistent — the copy
 * must say so rather than assert the mechanism.
 */
const tea = SUPPORT_LIBRARY.find((p) => p.id === "evening_tea")!;
check("the sleep tea is marked traditional", tea.evidence === "traditional");
check("it no longer asserts it doesn't sedate", !/don't sedate|do not sedate/i.test(tea.why));
check("it says the human evidence is limited", /limited/i.test(tea.deeper));
check("and calls the receptor work preclinical", /preclinical/i.test(tea.deeper));

// ─── Preparation is not a dose ─────────────────────────────────────────────

/**
 * "Steep for ten minutes" is a preparation instruction and has to be allowed —
 * a herbal suggestion nobody can follow is useless. What stays banned is
 * supplement dosing in mass units, which is prescribing.
 */
check(
  "preparation instructions survive the dose ban",
  /ten minutes/i.test(tea.action) && !DOSAGE.test(tea.action),
);

// Anything that can interact with a medication or a condition has to say so.
for (const id of ["evening_tea", "magnesium_glycinate", "adaptogens", "bitters", "cold", "sauna"]) {
  const p = SUPPORT_LIBRARY.find((x) => x.id === id)!;
  check(`${id}: carries its caution`, Boolean(p.cautions));
}

// ─── Deriving the state ────────────────────────────────────────────────────

check(
  "a short night is low_sleep",
  conditionsFrom({ sleepDeficit: 90 }).includes("low_sleep"),
);
check(
  "a normal night is nothing",
  conditionsFrom({ sleepDeficit: 10 }).length === 0,
);
check(
  "a wired check-in asks for winding down",
  conditionsFrom({ nervousSystem: 1 }).includes("trouble_winding_down"),
);
check(
  "three hard sessions is load",
  conditionsFrom({ hardSessionsRecently: 3 }).includes("high_training_load"),
);
check("nothing measured, nothing claimed", conditionsFrom({}).length === 0);

// The whole loop, end to end: a hard week on bad sleep must not be told to
// go and add another stressor to it.
const endToEnd = selectSupport({
  conditions: conditionsFrom({ sleepDeficit: 120, hardSessionsRecently: 3, recoveryDown: true }),
  depleted: true,
});
check("the loop returns something to actually do", endToEnd.length === 3);
check(
  "and never another stressor on top",
  endToEnd.every((p) => p.loadClass !== "stressor"),
);

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log(`✓ ${passed} support assertions passed`);
