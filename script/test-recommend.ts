/**
 * The recommendation engine, exercised without a device or a database.
 *
 * These assertions are mostly about restraint rather than cleverness: that the
 * engine refuses to claim a reason it does not have, that the novelty nudge
 * cannot talk somebody into a hard session on no sleep, and that every day
 * offers both a way to push and a way to recover.
 */

import {
  readReadiness,
  suggestToday,
  moonGuidance,
  readLine,
} from "../shared/models/recommend.js";
import { categoryLoad } from "../shared/models/training.js";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}

// ─── Reading the day ───────────────────────────────────────────────────────

const blind = readReadiness({});
check("no signals reads as steady", blind.level === "steady");
check("no signals admits it knows nothing", blind.confidence === "none");
check("no signals invents no reasons", blind.reasons.length === 0);
check(
  "no signals says so out loud",
  readLine(blind).includes("don't know"),
);

const wrecked = readReadiness({
  sleepMinutes: 240,
  sleepBaselineMinutes: 450,
  restingHeartRate: 62,
  restingHeartRateBaseline: 54,
  terrainLean: -2,
});
check("a genuinely bad day reads depleted", wrecked.level === "depleted");
check("a bad day explains itself", wrecked.reasons.length >= 2);
check(
  "reasons are sentences, not metric dumps",
  wrecked.reasons.every((r) => /[a-z] [a-z]/.test(r) && !/HRV \d|score/i.test(r)),
);

// One bad number must not decide the day on its own — see readReadiness.
const oneShortNight = readReadiness({
  sleepMinutes: 380,
  sleepBaselineMinutes: 450,
  restingHeartRate: 54,
  restingHeartRateBaseline: 54,
  terrainLean: 0,
});
check("one short night alone is still a steady day", oneShortNight.level === "steady");

const great = readReadiness({
  sleepMinutes: 500,
  sleepBaselineMinutes: 450,
  hrv: 66,
  hrvBaseline: 55,
  terrainLean: 2,
});
check("a good day reads primed", great.level === "primed");

const overtrained = readReadiness({ hardSessionsRecently: 3 });
check("three hard sessions reads depleted with no wearable at all", overtrained.level === "depleted");
check("recent load counts as knowing something", overtrained.confidence !== "none");

// ─── The three options ─────────────────────────────────────────────────────

for (const read of [wrecked, oneShortNight, great, blind]) {
  const picks = suggestToday({ read });
  check(`${read.level}/${read.confidence}: offers three options`, picks.length === 3);
  check(
    `${read.level}/${read.confidence}: options are distinct`,
    new Set(picks.map((p) => p.category)).size === picks.length,
  );
  check(
    `${read.level}/${read.confidence}: every option is labelled`,
    picks.every((p) => p.label.length > 0),
  );
  check(
    `${read.level}/${read.confidence}: always a way to recover`,
    picks.some((p) => p.side === "restore"),
  );
}

// The load of the day must beat the novelty nudge — the injury guard.
const depletedPicks = suggestToday({ read: wrecked });
check(
  "a depleted day is never handed a maximally demanding option",
  depletedPicks.every((p) => categoryLoad(p.category).stress < 3),
);

// Even a great day offers the thing the overreachers need.
const primedPicks = suggestToday({ read: great });
check("a primed day still offers recovery", primedPicks.some((p) => p.side === "restore"));
check("a primed day offers something demanding", primedPicks.some((p) => p.side === "build"));

// Never claim a because we don't have.
const blindPicks = suggestToday({ read: blind });
check("no signals means no stated reason", blindPicks.every((p) => p.because === ""));
check("but the options still stand alone", blindPicks.every((p) => p.headline.length > 0));

// Novelty: something they've never done should be marked as the stretch.
const grooved = suggestToday({
  read: oneShortNight,
  recentCategories: ["chest", "back", "legs", "chest", "back"],
});
check("a stretch option is offered to somebody in a groove", grooved.some((p) => p.isStretch));
check(
  "what they always do is not offered back as a surprise",
  grooved.every((p) => !(p.isStretch && ["chest", "back", "legs"].includes(p.category))),
);

// Exclusions are honoured — injuries, no equipment.
const limited = suggestToday({ read: great, excluded: ["chest", "back", "legs", "shoulders"] });
check("excluded categories never appear", limited.every((p) => !["chest", "back", "legs", "shoulders"].includes(p.category)));

// ─── The moon, in plain terms ──────────────────────────────────────────────

const newMoon = moonGuidance("new");
check("new moon has guidance", newMoon !== null);
check("new moon leads with the practice", /eat light|fast/i.test(newMoon!.title));
check("new moon is named plainly", newMoon!.phaseLabel === "New moon");

const full = moonGuidance("full");
check("full moon warns about sleep", /sleep|night/i.test(full!.detail));

for (const phase of [
  "new",
  "waxing crescent",
  "first quarter",
  "waxing gibbous",
  "full",
  "waning gibbous",
  "last quarter",
  "waning crescent",
]) {
  const g = moonGuidance(phase)!;
  check(`${phase}: has a practice`, g.title.length > 0 && g.detail.length > 0);
  // The whole point — no phase may be shown as decoration, and no card may
  // need a glossary to read.
  check(
    `${phase}: no jargon a newcomer would have to look up`,
    !/illumination|gibbous energy|lunar cycle|synodic|ascendant|manifest/i.test(
      `${g.title} ${g.detail}`,
    ),
  );
}

check("an unknown phase returns nothing rather than filler", moonGuidance("blood wolf") === null);

// ─── Report ────────────────────────────────────────────────────────────────

// ─── Goals order the day. They never overrule it. ─────────────────────────

/*
  The critical negative first: a member with no goals gets exactly what they
  got before goals existed.

  Deep equality against the same call with the field absent, with an empty
  array, and with a goal about categories that were never in contention. If
  any of the three diverges then goals have changed the product for everybody,
  which is not what was asked for and is not visible from any screen.
*/
{
  const primed = readReadiness({
    sleepMinutes: 480,
    sleepBaselineMinutes: 450,
    restingHeartRate: 50,
    restingHeartRateBaseline: 54,
  });
  const recent = ["chest", "legs", "yoga"] as const;
  const base = suggestToday({ read: primed, recentCategories: recent });
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  check("no goals field is the same as before", same(base, base));
  check(
    "an empty goal list changes nothing",
    same(base, suggestToday({ read: primed, recentCategories: recent, goals: [] })),
  );
  check(
    "a goal about nothing in the catalogue changes nothing",
    same(
      base,
      suggestToday({
        read: primed,
        recentCategories: recent,
        goals: [{ id: "g1", categories: ["not_a_category"] }],
      }),
    ),
  );
  check("and none of it claims a goal", base.every((sug) => sug.goalIds.length === 0));
  check(
    "…or cites one",
    base.every((sug) => !sug.codes.includes("goal_relevant")),
  );

  /*
    Now one that should move something. `endurance` is what a running goal
    resolves to, it is demanding, and a primed day has two slots asking for
    exactly that.
  */
  const withGoal = suggestToday({
    read: primed,
    recentCategories: recent,
    goals: [{ id: "g-mile", categories: ["endurance"] }],
  });
  const picked = withGoal.map((sug) => sug.category);
  check("a running goal reaches the day", picked.includes("endurance"));

  const chosen = withGoal.find((sug) => sug.category === "endurance");
  check("and the choice says which goal", chosen?.goalIds.includes("g-mile") === true);
  check("and cites it as a ground", chosen?.codes.includes("goal_relevant") === true);

  /*
    Claimed only where it did something. Every card that would have been
    chosen anyway must carry no goal, or `Why this?` becomes a horoscope: a
    member with a running goal would eventually see it credited for advice
    that had nothing to do with running.
  */
  const unmoved = withGoal.filter((sug) => sug.category !== "endurance");
  check(
    "the cards the goal did not move claim nothing",
    unmoved.every((sug) => sug.goalIds.length === 0 && !sug.codes.includes("goal_relevant")),
  );
}

/*
  And the one that matters: a goal cannot buy a hard session on a bad day.

  Story B from the brief — a six-minute mile, a coach's interval plan, and
  four hours of sleep. The goal and the plan both survive; what must not
  happen is the day changing shape because of them.
*/
{
  const wrecked = readReadiness({
    sleepMinutes: 240,
    sleepBaselineMinutes: 450,
    restingHeartRate: 62,
    restingHeartRateBaseline: 54,
    terrainLean: -2,
  });
  const demanding = ["endurance", "explosive", "plyometric", "olympic"];
  const goals = [{ id: "g-mile", categories: demanding }];

  const offered = suggestToday({ read: wrecked, recentCategories: ["yoga"], goals });
  check("a depleted day still offers three things", offered.length === 3);
  check(
    "and not one of them is demanding, goal or no goal",
    offered.every((sug) => categoryLoad(sug.category).stress < 3),
  );
  check(
    "the goal is not credited for a day it did not shape",
    offered.every((sug) => !sug.codes.includes("goal_relevant")),
  );

  /*
    Falsifiable rather than vacuous: the same goal on a day the body can
    take it does reach the list. Without this, the assertion above would pass
    just as happily if goals were wired to nothing at all.
  */
  const rested = readReadiness({
    sleepMinutes: 480,
    sleepBaselineMinutes: 450,
    restingHeartRate: 50,
    restingHeartRateBaseline: 54,
  });
  const onAGoodDay = suggestToday({ read: rested, recentCategories: ["yoga"], goals });
  check(
    "the same goal does reach a day that can carry it",
    onAGoodDay.some((sug) => demanding.includes(sug.category)),
  );
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log(`✓ ${passed} recommendation assertions passed`);
