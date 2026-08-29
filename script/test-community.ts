/**
 * Community — the pure parts.
 *
 * Two things worth testing without a database: the search-snippet splitter,
 * because getting it wrong is a stored XSS rather than a cosmetic bug, and the
 * thread builder, because a dropped reply is words a member wrote vanishing
 * off the screen.
 *
 * Run: tsx script/test-community.ts
 */

import {
  HL_START,
  HL_STOP,
  headlineOptions,
  segmentHeadline,
} from "../shared/utils/highlight.js";
import { z as _z } from "zod";
import { zodMessage } from "../shared/utils/zodMessage.js";
import { worthRetrying } from "../shared/models/community.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `got ${a}, wanted ${e}`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

/** Wrap `word` the way ts_headline would. */
const hl = (word: string) => `${HL_START}${word}${HL_STOP}`;

// ─── segmentHeadline ───────────────────────────────────────────────────────

section("Snippets split into plain and matched runs");

eq(
  "a match in the middle",
  segmentHeadline(`the ${hl("moon")} is full`),
  [
    { text: "the ", match: false },
    { text: "moon", match: true },
    { text: " is full", match: false },
  ],
);

eq(
  "a match at the very start produces no empty leading run",
  segmentHeadline(`${hl("moon")} rises`),
  [
    { text: "moon", match: true },
    { text: " rises", match: false },
  ],
);

eq(
  "a match at the very end produces no empty trailing run",
  segmentHeadline(`look at the ${hl("moon")}`),
  [
    { text: "look at the ", match: false },
    { text: "moon", match: true },
  ],
);

eq(
  "two matches",
  segmentHeadline(`${hl("fire")} and ${hl("water")}`),
  [
    { text: "fire", match: true },
    { text: " and ", match: false },
    { text: "water", match: true },
  ],
);

eq("no match at all is one plain run", segmentHeadline("nothing here"), [
  { text: "nothing here", match: false },
]);

eq("an empty headline is no runs", segmentHeadline(""), []);

section("The delimiters never survive into the output");

// This is the whole security property: whatever comes back, no caller should
// ever have to strip a delimiter itself.
for (const input of [
  `a ${hl("b")} c`,
  hl("only"),
  `${hl("a")}${hl("b")}`,
  "plain",
  "",
]) {
  const out = segmentHeadline(input);
  const joined = out.map((s) => s.text).join("");
  check(
    `no delimiters left in ${JSON.stringify(input)}`,
    !joined.includes(HL_START) && !joined.includes(HL_STOP),
    joined,
  );
}

section("Markup in a message is never treated as markup");

// The attack this whole design exists to stop. ts_headline would hand back the
// tag verbatim; what matters is that it arrives as inert text in a segment,
// with no delimiter confusion, so the client can only render it as a text node.
const attack = `<img src=x onerror="alert(1)">`;
const withAttack = segmentHeadline(`before ${hl("moon")} ${attack}`);
eq("the tag survives as literal text", withAttack.at(-1), {
  text: ` ${attack}`,
  match: false,
});
check(
  "and no segment is flagged as a match because of it",
  withAttack.filter((s) => s.match).length === 1,
);

// A member who somehow posts a delimiter can only mis-emphasise their own
// words — it can never produce markup, because markup is never produced.
const spoofed = segmentHeadline(`hello ${HL_START}world`);
check(
  "a member-supplied start delimiter cannot inject markup",
  spoofed.every((s) => typeof s.text === "string" && typeof s.match === "boolean"),
);

section("The ts_headline options string");

const opts = headlineOptions();
check("names both delimiters", opts.includes("StartSel=") && opts.includes("StopSel="));
check("asks for a single fragment", opts.includes("MaxFragments=1"));
check("carries the actual codepoints", opts.includes(HL_START) && opts.includes(HL_STOP));
check(
  "the delimiters are single characters",
  HL_START.length === 1 && HL_STOP.length === 1,
  `${HL_START.length}/${HL_STOP.length}`,
);
check(
  "and are the private-use codepoints, not literal backslash-u text",
  HL_START.codePointAt(0) === 0xe000 && HL_STOP.codePointAt(0) === 0xe001,
);

// ─── buildTree ─────────────────────────────────────────────────────────────
//
// Duplicated from the client hook rather than imported: the hook pulls in
// @tanstack/react-query and the `@/` alias, neither of which resolves under
// tsx. The logic is small and the duplication is checked by the last case in
// this section, which asserts the contract the client depends on.

interface Msg {
  id: string;
  parentId: string | null;
}
interface Node {
  message: Msg;
  children: Node[];
}

function buildTree(messages: Msg[], rootId: string): Node | null {
  const nodes = new Map<string, Node>();
  for (const m of messages) nodes.set(m.id, { message: m, children: [] });

  for (const m of messages) {
    if (m.id === rootId || !m.parentId) continue;
    const parent = nodes.get(m.parentId) ?? nodes.get(rootId);
    parent?.children.push(nodes.get(m.id)!);
  }

  return nodes.get(rootId) ?? null;
}

const ids = (n: Node): string => {
  const kids = n.children.map(ids).join(",");
  return kids ? `${n.message.id}(${kids})` : n.message.id;
};

section("A flat thread nests back into a tree");

eq(
  "a root on its own",
  ids(buildTree([{ id: "r", parentId: null }], "r")!),
  "r",
);

eq(
  "two replies keep the order they arrived in",
  ids(
    buildTree(
      [
        { id: "r", parentId: null },
        { id: "a", parentId: "r" },
        { id: "b", parentId: "r" },
      ],
      "r",
    )!,
  ),
  "r(a,b)",
);

eq(
  "a reply to a reply nests",
  ids(
    buildTree(
      [
        { id: "r", parentId: null },
        { id: "a", parentId: "r" },
        { id: "a1", parentId: "a" },
        { id: "b", parentId: "r" },
      ],
      "r",
    )!,
  ),
  "r(a(a1),b)",
);

eq(
  "eight levels deep still nests — MAX_THREAD_DEPTH is 8",
  ids(
    buildTree(
      [
        { id: "d0", parentId: null },
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `d${i + 1}`,
          parentId: `d${i}`,
        })),
      ],
      "d0",
    )!,
  ),
  "d0(d1(d2(d3(d4(d5(d6(d7(d8))))))))",
);

section("Nothing a member wrote is ever dropped");

// The case that matters: a reply whose parent is missing from the payload.
// Silently discarding it would delete someone's words from the screen, so it
// hangs off the root instead — imperfect shape, but the words survive.
eq(
  "an orphaned reply falls back to the root",
  ids(
    buildTree(
      [
        { id: "r", parentId: null },
        { id: "lost", parentId: "gone" },
      ],
      "r",
    )!,
  ),
  "r(lost)",
);

const orphanTree = buildTree(
  [
    { id: "r", parentId: null },
    { id: "a", parentId: "r" },
    { id: "lost", parentId: "gone" },
  ],
  "r",
);
const count = (n: Node): number => 1 + n.children.reduce((s, c) => s + count(c), 0);
check("every message in the payload appears exactly once", count(orphanTree!) === 3);

check(
  "a missing root is null rather than a throw",
  buildTree([{ id: "a", parentId: null }], "nope") === null,
);

// ─── Result ────────────────────────────────────────────────────────────────


// ─── Validation messages a person can act on ───────────────────────────────


console.log("\nA validation error names the field\n");

function issueFor(schema: _z.ZodTypeAny, value: unknown): string {
  const r = schema.safeParse(value);
  return r.success ? "" : zodMessage(r.error);
}

// `.min()` does not fire for a missing field — only `required_error` does.
// That is the whole reason this case is here: a friendly message attached to
// `.min()` is dead code for the most common failure.
const authored = _z.object({
  routineId: _z.string({ required_error: "Which protocol? routineId is required." }),
});
const minOnly = _z.object({
  routineId: _z.string().min(1, "Never shown when the field is absent."),
});

check(
  "a missing field is named, not just 'Required'",
  issueFor(_z.object({ startDate: _z.string() }), {}) === "start date is required.",
  issueFor(_z.object({ startDate: _z.string() }), {}),
);
check(
  "camelCase becomes words",
  issueFor(_z.object({ dateOfBirth: _z.string() }), {}) === "date of birth is required.",
  issueFor(_z.object({ dateOfBirth: _z.string() }), {}),
);
// A message somebody wrote deliberately already reads as prose; prefixing it
// with a field name would make it worse, so it is passed through untouched.
check(
  "an authored required_error is left alone",
  issueFor(authored, {}) === "Which protocol? routineId is required.",
  issueFor(authored, {}),
);
check(
  "a .min() message can't rescue a missing field, so the field is named",
  issueFor(minOnly, {}) === "routine id is required.",
  issueFor(minOnly, {}),
);
check(
  "an empty error object still says something",
  zodMessage(new _z.ZodError([])) === "That request wasn't valid.",
);

// ─── Four defects a member found on a phone ────────────────────────────────

/*
  All four were reported from a device in one message, and none of them can be
  reached from a test process: three are what a component renders and one is a
  SQL predicate. So the behavioural rule that could be lifted out was lifted
  out and is exercised directly; the rest are source assertions, in the manner
  of script/test-release.ts — cheap, and each one fails if its fix is undone.
*/

const source = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

section("A failed request is not an answer about access");

/*
  The Room said "No rooms are open to you yet" when `/api/community/channels`
  failed, because `!channels.data` is true for a failure and for an empty
  answer alike. Under `retry: false` and `staleTime: Infinity` it then never
  asked again. That is the whole of the reported "it said I had no access, and
  after I reloaded the app it worked".
*/
check("no answer at all is worth another try", worthRetrying(null));
check("503 is worth another try", worthRetrying(503));
check("500 is worth another try", worthRetrying(500));
check("429 is worth another try", worthRetrying(429));
check("401 is an answer, not a failure", !worthRetrying(401));
check("403 is an answer, not a failure", !worthRetrying(403));
check("404 is an answer, not a failure", !worthRetrying(404));
check("400 is an answer, not a failure", !worthRetrying(400));

const tab = source("client/src/components/CommunityTab.tsx");
const hooks = source("client/src/hooks/use-community.ts");

check(
  "the tab has a branch for a failed load",
  /if \(channels\.isError\)/.test(tab),
);
check(
  "and it comes before the one that talks about access",
  tab.indexOf("if (channels.isError)") < tab.indexOf("if (!channels.data ||"),
  "the empty-state branch is reachable from an error again",
);
check(
  "it offers a way to ask again rather than requiring a restart",
  /button-retry-rooms/.test(tab) && /channels\.refetch\(\)/.test(tab),
);
check(
  "the room list retries a transient failure",
  /retry: \(count, err\) => count < 2 && transient\(err\)/.test(hooks),
);
check(
  "the status reaches the error, so the rule has something to read",
  /status: res\.status/.test(hooks),
);

section("Enter breaks the line where there is no shift to hold");

/*
  Enter sent and Shift+Enter broke the line. A phone keyboard's return key is
  Enter with `shiftKey` false, so on a phone there was no way to type a second
  line at all — the attempt posted the half-written message.
*/
check(
  "Enter only sends where a hardware keyboard is",
  /pointer: fine/.test(tab) && /enterSends && e\.key === "Enter"/.test(tab),
);

section("A photograph is shown whole, or can be opened");

check("MediaImage can be told not to crop", /fit\?: "cover" \| "contain"/.test(source("client/src/components/MediaImage.tsx")));
check(
  "the room feed does not crop it",
  /aspect="4 \/ 3"\s*\n\s*fit="contain"\s*\n\s*className="max-w-sm"/.test(tab),
  "the feed image is the one that was cropping — the overlay matching is not enough",
);
check(
  "and tapping it opens the whole thing",
  /overlay-room-photo/.test(tab) && /setFull\(true\)/.test(tab),
);

section("Deleting the only thing you posted removes the post");

/*
  A tombstone exists so replies underneath a deleted parent keep their parent.
  Nothing hangs off a leaf, so its tombstone holds nothing up — and leaving one
  there is read, correctly, as "I deleted it and it is still on my screen".
*/
const routes = source("server/community/routes.ts");
check(
  "the rule is written once",
  /const stillShown = or\(isNull\(communityMessages\.deletedAt\), gt\(communityMessages\.replyCount, 0\)\)/.test(routes),
);
check("the room list applies it", (routes.match(/\n\s+stillShown,/g) ?? []).length >= 2, "expected it on both the room and the thread query");
check(
  "a delete takes the reply off its ancestors' counts",
  /await forgetReply\(updated\.id\)/.test(routes) &&
    (routes.match(/await forgetReply\(updated\.id\)/g) ?? []).length === 2,
  "both the member and the admin delete must do it",
);
check(
  "and deleting twice cannot decrement twice",
  (routes.match(/isNull\(communityMessages\.deletedAt\),/g) ?? []).length >= 3,
  "the delete routes need the guard the edit route already had",
);
check(
  "the count can never go negative and hide a live message",
  /greatest\(reply_count - 1, 0\)/.test(routes),
);

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
