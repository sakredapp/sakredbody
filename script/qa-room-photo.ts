/**
 * A photograph reaches the room, and leaves the composer.
 *
 * ── The defect this is the regression for ─────────────────────────────────
 *
 * From a phone: "the picture I picked won't go away." The composer had two
 * sources of truth for one fact — a `preview` prop and an `attached.previewUrl`
 * — and rendered `attached?.previewUrl ?? preview`, so clearing one left the
 * other on screen. The image also sat *outside* the draft box, square-cropped,
 * giving no sign that Post would publish it.
 *
 * ── Why this cannot be a unit test ────────────────────────────────────────
 *
 * The complaint is about what is on screen after a real upload and a real
 * post: whether the preview is inside the composer, whether it survives a
 * successful publish, whether the same file can be chosen twice, and whether
 * a double tap makes two posts. Every one of those is the browser's answer,
 * not a function's — and the "same file twice" case in particular is invisible
 * to anything that does not drive a real `<input type=file>`, because it is
 * caused by the input keeping its `value` and never firing `change` again.
 *
 *   Terminal 1:  npm run build && script/qa-serve.sh
 *   Terminal 2:  npx tsx script/qa-room-photo.ts
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Browser, assertFreshBuild } from "./cdp.js";
import { Portal } from "./portal.js";

assertFreshBuild();

const BASE = process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";

const failures: string[] = [];
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
  else notes.push(`✓ ${name}`);
};

/**
 * A real PNG, written to a temp file.
 *
 * One pixel, encoded by hand rather than fetched or committed: the harness
 * needs a file the browser will accept as an image and nothing about it needs
 * to be interesting. Two files, because "the same image can be chosen again"
 * and "a different image replaces it" are different assertions.
 */
const dir = mkdtempSync(join(tmpdir(), "sakred-room-photo-"));
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const photoA = join(dir, "a.png");
writeFileSync(photoA, PNG);

const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });
await b.viewport(393, 852);

/*
  Through Portal, which every other browser harness uses. A file that rolls its
  own login and its own tap is a file that will hit-test differently from the
  rest of them, and the difference will read as a product defect.
*/
const portal = new Portal(b, BASE);
await portal.login();
await portal.dismissTour();

const tap = (selector: string) => portal.tapSelector(selector);

/**
 * Put a file into the composer's own input.
 *
 * `DOM.setFileInputFiles` is the only way to do this — the picker cannot be
 * driven, and assigning `input.files` from page script is refused. This is
 * what makes the "same file twice" case testable at all.
 */
async function choose(file: string): Promise<void> {
  const { root } = await b.send("DOM.getDocument");
  const { nodeId } = await b.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: '[data-testid="input-photo-room"]',
  });
  if (!nodeId) throw new Error("no room photo input on screen");
  await b.send("DOM.setFileInputFiles", { nodeId, files: [file] });
  await b.settle();
}

/**
 * The messages in the room the composer is pointed at.
 *
 * Through the same two endpoints the screen uses — the channel list, then that
 * channel — rather than a guessed URL. The first version of this asked for
 * `/api/community/messages?channel=general`, which is not a route: it fell
 * through to the SPA, returned index.html, and the harness died on the HTML
 * rather than reporting anything about photographs.
 */
const posts = () =>
  b.evaluate<{ id: string; body: string; imageAssetId: string | null }[]>(`
    const chans = await fetch("/api/community/channels", { credentials: "include" });
    if (!chans.ok) return [];
    const list = await chans.json();
    const room = (Array.isArray(list) ? list : list.channels ?? [])
      .find(c => !c.isReadOnly && !c.isPrivate) ?? (Array.isArray(list) ? list[0] : null);
    if (!room) return [];
    const res = await fetch("/api/community/channels/" + room.id, { credentials: "include" });
    if (!res.ok) return [];
    const body = await res.json();
    const msgs = Array.isArray(body) ? body : body.messages ?? [];
    return msgs.map(m => ({ id: m.id, body: m.body ?? "", imageAssetId: m.imageAssetId ?? null }));
  `);

const composerState = () =>
  b.evaluate<{
    draftInsideComposer: boolean;
    previews: number;
    text: string;
    sendLabel: string;
    sendDisabled: boolean;
  }>(`
    const box = document.querySelector('[data-testid="input-community-composer"]');
    const draft = document.querySelector('[data-testid="photo-draft"]');
    const send = document.querySelector('[data-testid="button-community-send"]');
    return {
      /* The draft has to be *inside* the block the composer lives in, not
         floating between it and the feed. Measured by containment rather than
         by position: a rule about ancestry cannot drift with a stylesheet. */
      draftInsideComposer: !!(draft && box && box.parentElement && box.parentElement.contains(draft)),
      previews: document.querySelectorAll('[data-testid="img-photo-preview"]').length,
      text: box ? box.value : "",
      sendLabel: send ? send.textContent.trim() : "",
      sendDisabled: send ? send.disabled : true,
    };
  `);

console.log(`\nA photograph reaches the room and leaves the composer — ${BASE}\n`);

check("the room opens", await portal.openSection("community"), portal.lastFailure);
await b.waitFor(
  `!!document.querySelector('[data-testid="input-community-composer"]')`,
  "the composer",
  20_000,
);

const before = await posts();

// ─── 1. Choosing a photo shows it, in the composer ────────────────────────

await choose(photoA);
await b.waitFor(`!!document.querySelector('[data-testid="photo-draft"]')`, "the draft photo", 20_000);
await b.waitFor(
  `(document.querySelector('[data-testid="button-community-send"]')||{}).textContent !== "Attaching…"`,
  "the upload to finish",
  30_000,
);

{
  const s = await composerState();
  check("the photo appears once", s.previews === 1, `${s.previews} previews`);
  check("inside the composer, not floating above the feed", s.draftInsideComposer);
  check("and the button says what it will do", s.sendLabel === "Post photo", s.sendLabel);
  check("which it is willing to do", !s.sendDisabled);
}

// ─── 2. Posting publishes it, once, and clears the draft ──────────────────

await b.evaluate(
  `const box=document.querySelector('[data-testid="input-community-composer"]');` +
    `Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box),"value").set.call(box,"QA — room photo");` +
    `box.dispatchEvent(new Event("input",{bubbles:true}));return true;`,
);
await b.settle();

/* Two taps, deliberately close together. A composer that clears on the tap
   rather than on the answer publishes twice. */
await tap('[data-testid="button-community-send"]');
await tap('[data-testid="button-community-send"]');
await b.waitFor(
  `!document.querySelector('[data-testid="photo-draft"]')`,
  "the draft to clear",
  20_000,
);

const after = await posts();
{
  const fresh = after.filter((m) => !before.some((x) => x.id === m.id));
  check("exactly one post is made", fresh.length === 1, `${fresh.length} new posts`);
  check("carrying the photograph", fresh[0]?.imageAssetId != null);
  check("and the words that went with it", fresh[0]?.body === "QA — room photo", fresh[0]?.body);

  const s = await composerState();
  check("the photo is gone from the composer", s.previews === 0, `${s.previews} previews`);
  check("and so are the words", s.text === "", JSON.stringify(s.text));
}

// ─── 3. The same file can be chosen again ─────────────────────────────────

/*
  The case an input that keeps its `value` gets wrong: choosing the same file
  fires no `change`, so nothing happens and the member is left tapping a button
  that appears broken. `PhotoAttach` clears the input after every selection,
  which is what this proves.
*/
await choose(photoA);
await b.waitFor(
  `!!document.querySelector('[data-testid="photo-draft"]')`,
  "the same photo, chosen a second time",
  20_000,
);
check("the same image can be attached again", (await composerState()).previews === 1);

// ─── 4. A post that fails keeps the draft ─────────────────────────────────

/*
  The server is made to refuse, in the page, by pointing the composer's own
  fetch at a route that says no. The draft has to survive that: a member on a
  gym network who loses a post *and* the photograph they chose has lost work
  the app had in its hands.
*/
await b.waitFor(
  `(document.querySelector('[data-testid="button-community-send"]')||{}).textContent !== "Attaching…"`,
  "the second upload to finish",
  30_000,
);
await b.evaluate(`
  window.__realFetch = window.fetch;
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if ((init?.method === "POST") && url.includes("/api/community/messages")) {
      return Promise.resolve(new Response('{"message":"Nope"}', { status: 500 }));
    }
    return window.__realFetch(input, init);
  };
  return true;
`);
await tap('[data-testid="button-community-send"]');
await b.settle();
{
  const s = await composerState();
  check("a refused post keeps the photograph", s.previews === 1, `${s.previews} previews`);
}
await b.evaluate(`window.fetch = window.__realFetch; return true;`);

/* And it can still be sent once the refusal stops. */
await tap('[data-testid="button-community-send"]');
await b.waitFor(
  `!document.querySelector('[data-testid="photo-draft"]')`,
  "the retried post to clear the draft",
  20_000,
);
check("and it sends on the retry", (await composerState()).previews === 0);

// ─── Teardown ─────────────────────────────────────────────────────────────

/*
  Every stateful harness owns its own setup and teardown. Both posts are
  removed through the route the member's own delete uses, so this exercises it
  rather than reaching past it into the database.
*/
const created = (await posts())
  .filter((m) => !before.some((x) => x.id === m.id))
  .map((m) => m.id);

const removed = await b.evaluate<number>(`
  const ids = ${JSON.stringify(created)};
  let gone = 0;
  for (const id of ids) {
    const del = await fetch("/api/community/messages/" + id, { method: "DELETE", credentials: "include" });
    if (del.ok) gone++;
  }
  return gone;
`);
check("every post this run made is cleaned up", removed === created.length,
  `removed ${removed} of ${created.length}`);
console.log(`  removed ${removed} fixture post(s)\n`);

await b.close();

if (failures.length) {
  console.error("✗ the room photograph\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  for (const n of notes) console.error(`    · ${n}`);
  console.error("");
  process.exit(1);
}
console.log("✓ a photograph reaches the room and leaves the composer");
for (const n of notes) console.log(`    ${n}`);
console.log("");
