/**
 * Relationship guidance — and the rule that it may never invent a person.
 *
 * The assertions that matter most are in the "no telepathy" block. Sakred holds
 * the member's own sleep and training and knows nothing at all about their
 * partner's, so a card claiming "he's coming off several high-output days"
 * with no entered context is the app making something up about a real person.
 * If those tests ever fail, that is what has started happening.
 */

import {
  relationshipGuidance,
  generalRelationshipGuidance,
  selfRelationalNote,
  selfRelationalReads,
  strongestAuthority,
  subjectName,
  type RelationalGuidance,
} from "../shared/models/relating.js";
import { readReadiness } from "../shared/models/recommend.js";

let passed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean) => {
  if (cond) passed++;
  else failures.push(name);
};

const text = (g: RelationalGuidance) =>
  `${g.title} ${g.detail} ${g.goodMove} ${g.worthAsking} ${g.dontAssume}`;

// ─── No telepathy ──────────────────────────────────────────────────────────

const nothingKnown = relationshipGuidance({ subjectSex: "male" });
check("a partner with no data still gets a card", nothingKnown.length === 1);
check("and it claims nothing", nothingKnown[0].authority === "general");
check("and it says where it stands", nothingKnown[0].basis === "General guidance");

/**
 * The specific sentence this whole file was written to prevent. With no entered
 * context there is no source for a claim about somebody's sleep, work or
 * training — so no such claim may appear anywhere in the copy.
 */
const INVENTED =
  /coming off|high-output|hard week|slept (badly|five|poorly)|short on sleep|been training|his recovery is|her recovery is|work has been/i;

for (const sex of ["male", "female", null] as const) {
  const blind = relationshipGuidance({ subjectSex: sex });
  check(
    `${sex ?? "unspecified"}: no invented claim about their week`,
    !INVENTED.test(text(blind[0])),
  );
  check(
    `${sex ?? "unspecified"}: nothing rises above general with no source`,
    blind.every((g) => g.authority === "general"),
  );
}

// A female partner with no dates entered gets no cycle guidance either —
// counting from nothing is still counting from nothing.
const femaleNoDates = relationshipGuidance({ subjectSex: "female" });
check("no dates means no cycle card", femaleNoDates[0].authority === "general");

// And an uncertain estimate is not a source.
const uncertain = relationshipGuidance({
  subjectSex: "female",
  phase: "luteal",
  phaseConfidence: "uncertain",
});
check("an uncertain phase earns no card", uncertain[0].authority === "general");

// ─── Entered context is a real source, and is labelled as one ──────────────

const entered = relationshipGuidance({ subjectSex: "male", contexts: ["work_stress"] });
check("entered context produces specific guidance", entered[0].authority === "entered_by_member");
check("and points back at the member", /you mentioned/i.test(entered[0].detail));
check("and says so on the card", entered[0].basis === "Based on context you added");
check(
  "the low-bandwidth line is allowed once there is a source",
  /distant|depleted/i.test(text(entered[0])),
);

// ─── The cycle is the one derivable specific ───────────────────────────────

const estimated = relationshipGuidance({
  subjectSex: "female",
  phase: "luteal",
  phaseConfidence: "likely",
});
check("a counted phase produces a card", estimated[0].authority === "estimated");
check("hedged as estimated", /by the dates you entered/i.test(estimated[0].detail));
check("and leads with the practical consequence", estimated[0].title === "Keep tonight uncomplicated");

const stated = relationshipGuidance({
  subjectSex: "female",
  phase: "luteal",
  phaseConfidence: "confirmed",
});
check("a stated phase outranks a counted one", stated[0].authority === "entered_by_member");
check("and drops the hedge", !/by the dates you entered/i.test(stated[0].detail));

/**
 * A man's husband must never be given cycle guidance. `subjectSex` is the only
 * thing in the model that was actually asked, so it is the only thing allowed
 * to select physiology.
 */
const maleWithPhase = relationshipGuidance({
  subjectSex: "male",
  phase: "luteal",
  phaseConfidence: "likely",
});
check("a male subject never gets cycle guidance", maleWithPhase[0].authority === "general");
const unspecifiedWithPhase = relationshipGuidance({
  subjectSex: null,
  phase: "luteal",
  phaseConfidence: "likely",
});
check(
  "and neither does an unspecified one",
  unspecifiedWithPhase[0].authority === "general",
);

// ─── Order and quantity ────────────────────────────────────────────────────

const both = relationshipGuidance({
  subjectSex: "female",
  contexts: ["short_sleep"],
  phase: "luteal",
  phaseConfidence: "likely",
});
check("context and cycle can both appear", both.length === 2);
check("what she told him leads the count", both[0].authority === "entered_by_member");
check("never more than two", both.length <= 2);

const many = relationshipGuidance({
  subjectSex: "female",
  contexts: ["short_sleep", "travel", "illness", "work_stress"],
  phase: "menstrual",
  phaseConfidence: "likely",
});
check("four contexts do not become four cards", many.length <= 2);

// ─── Every primitive is complete and hedged ────────────────────────────────

const ALL: RelationalGuidance[] = [
  generalRelationshipGuidance(),
  ...(["work_stress", "short_sleep", "training_hard", "travel", "illness", "big_event", "wants_space"] as const).flatMap(
    (k) => relationshipGuidance({ subjectSex: "male", contexts: [k] }),
  ),
  ...(["menstrual", "follicular", "ovulatory", "luteal"] as const).flatMap((p) =>
    relationshipGuidance({ subjectSex: "female", phase: p, phaseConfidence: "likely" }),
  ),
];

for (const g of ALL) {
  check(`${g.title}: complete`, Boolean(g.title && g.detail && g.goodMove && g.worthAsking && g.dontAssume));
  check(`${g.title}: asks rather than assumes`, g.worthAsking.includes("?"));
  // Telling somebody how another person feels is both frequently wrong and
  // the exact thing that makes this kind of feature insulting.
  check(
    `${g.title}: never states how they feel`,
    !/she will|he will|she's feeling|he's feeling|makes her|makes him|is emotional|being hormonal/i.test(
      text(g),
    ),
  );
  check(`${g.title}: no fertility framing`, !/fertile|conceive|pregnan|contracept|safe day/i.test(text(g)));
  check(`${g.title}: carries its basis`, Boolean(g.basis));
}

// The deeper explanation is the third layer, never the first.
const luteal = relationshipGuidance({ subjectSex: "female", phase: "luteal", phaseConfidence: "likely" })[0];
check("physiology exists for the phases that have one", Boolean(luteal.physiology));
check(
  "and is not what the card leads with",
  !/progesterone|oestrogen|estrogen/i.test(`${luteal.title} ${luteal.detail}`),
);

// ─── Their own terrain, which we genuinely do hold ─────────────────────────

const wrecked = selfRelationalNote(
  readReadiness({ sleepMinutes: 300, sleepBaselineMinutes: 460, terrainLean: -2 }),
);
check("a depleted day produces a self note", wrecked?.authority === "first_party");
check("stated at full strength", wrecked?.basis === "From your own data");
check("about their own behaviour", wrecked?.audience === "self");

const steady = selfRelationalNote(readReadiness({ sleepMinutes: 450, sleepBaselineMinutes: 455 }));
check("a steady day says nothing", steady === null);

const blind = selfRelationalNote(readReadiness({}));
check("no signals means no self note", blind === null);

/**
 * A measured signal outranks the cycle, every time.
 *
 * She slept two and a half hours under her usual AND is in the late luteal
 * phase. The card must lead with the sleep, because that is the thing she can
 * do something about tonight and the thing we actually measured — the phase is
 * context, not the headline.
 */
const withCycle = selfRelationalReads(
  readReadiness({ sleepMinutes: 300, sleepBaselineMinutes: 460, terrainLean: -2 }),
  { sleepDeficit: 160, shortNightsRunning: 1 },
  { phase: "luteal", phaseConfidence: "likely" },
);
check("a measured signal leads over the cycle", /fuse|sleep|slept/i.test(withCycle[0]?.title + withCycle[0]?.detail));
check("and it names what is actually off", withCycle[0]?.authority === "first_party");
check("never more than two at once", withCycle.length <= 2);

// The cycle still gets said when nothing measured is standing out.
const cycleOnly = selfRelationalReads(
  readReadiness({ terrainLean: -1, sleepMinutes: 450, sleepBaselineMinutes: 455 }),
  {},
  { phase: "luteal", phaseConfidence: "likely" },
);
check("the cycle is heard when nothing else is off", /bandwidth/i.test(cycleOnly[0]?.title ?? ""));
check("and it never names the phase as a verdict", !/you're luteal|because you're/i.test(cycleOnly[0]?.detail ?? ""));

/**
 * THE assertion for the half of this feature that works for everybody.
 *
 * A man with three short nights must get something specific and useful — not
 * a sentence about a setting, which is what the first version gave him.
 */
const manThreeShortNights = selfRelationalReads(
  readReadiness({ sleepMinutes: 330, sleepBaselineMinutes: 450 }),
  { sleepDeficit: 120, shortNightsRunning: 3, recoveryDown: true },
);
check("three short nights is named as such", /three short nights/i.test(manThreeShortNights[0]?.title ?? ""));
check("with something to actually do", Boolean(manThreeShortNights[0]?.goodMove));
check("and the physiology underneath it", Boolean(manThreeShortNights[0]?.physiology));
check("a second signal can also be said", manThreeShortNights.length === 2);

const wiredNervousSystem = selfRelationalReads(
  readReadiness({ terrainLean: -2, sleepMinutes: 450, sleepBaselineMinutes: 450 }),
  { nervousSystem: 1 },
);
check("a wired nervous system gets its own read", /neutral as hostile/i.test(wiredNervousSystem[0]?.title ?? ""));

const heavyBlock = selfRelationalReads(
  readReadiness({ hardSessionsRecently: 3 }),
  { hardSessionsRecently: 3 },
);
check("a hard training block is not read as disinterest", /disinterest/i.test(heavyBlock[0]?.title ?? ""));

// Nothing measured, nothing said — the rule the whole file runs on.
check("no signals still means no self note", selfRelationalReads(readReadiness({}), {}).length === 0);

// ─── Small things ──────────────────────────────────────────────────────────

check("a named subject is called by name", subjectName("Emma", "partner") === "Emma");
check("an unnamed partner is not called 'You'", subjectName(null, "partner") === "Them");
check("an unnamed self is", subjectName("  ", "self") === "You");
check(
  "the strongest source wins the badge",
  strongestAuthority(both) === "entered_by_member",
);
check("nothing to badge is null", strongestAuthority([]) === null);

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log(`✓ ${passed} relating assertions passed`);
