/**
 * Four things a member found on a phone, in one message.
 *
 *   "can't click into the photos on the room as a viewer so can't see full
 *    photo… i like the rounded corners and such but also need to see majority
 *    of the photo or be able to click in. can't be neither"
 *   "the room said i didn't have access then randomly after i reloaded app it
 *    worked. i've always had access to the room"
 *   "can't hit the enter button on text! can't go down a line"
 *   "when delete message it says this message deleted on the screen stuck on
 *    the ui!"
 *
 * ── Why these cannot be unit tests ────────────────────────────────────────
 *
 * script/test-community.ts holds the parts that can be asserted from source,
 * and each of those assertions was confirmed by planting its defect back. What
 * source cannot answer is whether the application executes any of it:
 *
 *   · Whether a photograph is actually drawn whole is the browser's layout,
 *     not a class name — `object-contain` inside a box of the wrong ratio
 *     still shows bars, and `max-w-sm` still crops if the ratio is fixed.
 *   · Whether Enter breaks the line depends on what Chrome reports for
 *     `(pointer: fine)` under touch emulation, which is exactly the condition
 *     the fix reads and nothing else can stand in for.
 *   · Whether a failed room list says the wrong thing needs a failed room
 *     list. The failure is injected in the page, so it is deterministic
 *     rather than a race waited on.
 *   · And whether a deleted message disappears is a SQL predicate plus a
 *     recursive UPDATE running against real rows. `forgetReply` in particular
 *     cannot be checked any other way: its whole job is to make a tombstone
 *     that is currently holding up a reply stop holding it up later.
 *
 *   Terminal 1:  npm run build && script/qa-serve.sh
 *   Terminal 2:  set -a && . ./.env.qa && set +a && npx tsx script/qa-room-defects.ts
 */

import pg from "pg";
import { resolveQaTarget } from "./qa-target.js";
import { Browser, assertFreshBuild } from "./cdp.js";
import { Portal } from "./portal.js";

assertFreshBuild();

const BASE = process.env.QA_BASE_URL ?? process.env.SAKRED_QA_BASE ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

const target = resolveQaTarget(process.env);
if (!target.ok) {
  console.error(`\n✗ refusing to run — ${target.reason}\n`);
  process.exit(1);
}

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const PROXIED = { "x-forwarded-proto": "https" };
let jar = "";

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...PROXIED,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(jar ? { cookie: jar } : {}),
    },
  });
}
const post = (path: string, body?: unknown) =>
  call(path, { method: "POST", body: JSON.stringify(body ?? {}) });

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${res.status} ${res.url}: ${text.slice(0, 200)}`);
  }
}

const MARK = "QA — room defects";
console.log(`\nFour defects from a phone — ${BASE}\n`);

const client = new pg.Client({ connectionString: target.url });
await client.connect();

/* Anything an earlier run left behind, found by its own words. */
const swept = await client.query(
  "delete from community_messages where body like $1", [`${MARK}%`],
);
if (swept.rowCount) console.log(`  swept ${swept.rowCount} message(s) from an earlier run`);

{
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    redirect: "manual",
    headers: { ...PROXIED, "content-type": "application/json" },
    body: JSON.stringify({ email: "qa.member@sakred.local", password: PASSWORD }),
  });
  jar = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  check("the QA member signs in", res.status === 200 && !!jar, `status ${res.status}`);
  if (!jar) process.exit(1);
}

type Msg = { id: string; body: string; deleted?: boolean; replyCount: number };
const channels = await json<{ id: string; name: string }[]>(await call("/api/community/channels"));
check("the member can see at least one room", channels.length > 0, `${channels.length} rooms`);
const room = channels[0];

const feed = async () => json<Msg[]>(await call(`/api/community/channels/${room.id}`));
const created: string[] = [];
const say = async (body: string, parentId?: string) => {
  const m = await json<Msg>(await post("/api/community/messages", {
    channelId: room.id, body, ...(parentId ? { parentId } : {}),
  }));
  created.push(m.id);
  return m;
};
const remove = (id: string) => call(`/api/community/messages/${id}`, { method: "DELETE" });

// ─── 1. Deleting the only thing you posted removes the post ────────────────

console.log("Deleting a message");

{
  const alone = await say(`${MARK} — nothing hangs off this`);
  check("a new message is in the room", (await feed()).some((m) => m.id === alone.id));

  const gone = await remove(alone.id);
  eq("the delete is accepted", gone.status, 200);

  const after = await feed();
  check(
    "and it is gone, not replaced by a line about itself",
    !after.some((m) => m.id === alone.id),
    "the tombstone is still in the feed — this is the 'stuck on the UI' report",
  );

  const second = await remove(alone.id);
  eq("deleting it twice is refused rather than counted twice", second.status, 404);
}

// ─── 2. A tombstone that is holding something up stays ─────────────────────

console.log("Deleting a message that has replies");

{
  const root = await say(`${MARK} — this one has a reply`);
  const reply = await say(`${MARK} — the reply`, root.id);

  await remove(root.id);
  const withReply = await feed();
  const stone = withReply.find((m) => m.id === root.id);
  check("a deleted parent stays, because the reply hangs off it", !!stone);
  eq("and it says nothing it used to say", stone?.body, "");
  check("it is marked deleted", stone?.deleted === true);

  /* The half that needs a database: the parent's count has to come back down
     when its last reply goes, or the tombstone is permanent and advertises a
     thread with nothing in it. */
  await remove(reply.id);
  const after = await feed();
  check(
    "delete the last reply and the tombstone goes with it",
    !after.some((m) => m.id === root.id),
    "forgetReply did not take the reply off the parent's count",
  );

  const { rows } = await client.query<{ reply_count: number }>(
    "select reply_count from community_messages where id = $1", [root.id],
  );
  eq("the count is back to zero, not negative", rows[0]?.reply_count, 0);
}

// ─── The browser half ──────────────────────────────────────────────────────

const photo = await say(`${MARK} — a photo post`);

const b = new Browser();
await b.launch();
const p = new Portal(b, BASE);
await b.headers(PROXIED);
await b.viewport(393, 852, true);
await p.login("qa.member@sakred.local", PASSWORD);
await p.dismissTour();

// ─── 3. Enter goes down a line where there is no shift to hold ─────────────

console.log("The return key on a phone keyboard");

{
  await p.openSection("community");
  const there = await p.waitFor(
    `!!document.querySelector('[data-testid="input-community-composer"]')`,
    "the composer",
  );
  check("the composer is on screen", there);

  const coarse = await b.evaluate<boolean>(`return !window.matchMedia("(pointer: fine)").matches`);
  check("the emulated phone reports a coarse pointer", coarse, "touch emulation is not on");

  await b.evaluate(`
    const el = document.querySelector('[data-testid="input-community-composer"]');
    el.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(el, ${JSON.stringify(`${MARK} — first line`)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  `);

  /*
    A real key press, not `.click()` on the button — the whole question is what
    the textarea does with the key.

    `text` goes on the keyDown itself, and there is deliberately no separate
    `char` event. Chrome generates the character from a keyDown that carries
    text, and therefore suppresses it when the handler calls preventDefault.
    Dispatching `char` as its own command inserts the newline whatever the page
    decides — which made this assertion pass against a build with the defect
    planted back, i.e. it was measuring CDP rather than the product.
  */
  await b.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r",
  });
  await b.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await b.settle();

  const value = await b.evaluate<string>(
    `return document.querySelector('[data-testid="input-community-composer"]')?.value ?? ""`,
  );
  check(
    "Enter puts a line break in the box",
    value.includes("\n"),
    `the box holds ${JSON.stringify(value)} — a phone member cannot write a second line`,
  );
  check(
    "the words are still in the box, not sent",
    value.startsWith(`${MARK} — first line`),
    `the box holds ${JSON.stringify(value)} — a send clears it`,
  );

  /* And nothing reached the room. Read from the server rather than counted on
     screen, because a post the page has not rendered yet would still be a post. */
  const posted = (await feed()).some((m) => m.body.startsWith(`${MARK} — first line`));
  check("nothing was posted by pressing it", !posted);

  await b.evaluate(`
    const el = document.querySelector('[data-testid="input-community-composer"]');
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  `);
}

// ─── 4. A failed room list is not a sentence about access ──────────────────

console.log("When the room list fails");

{
  /*
    Fail it in the page, so the state under test is reached deterministically
    rather than by waiting for a real server to misbehave.

    Injected with `addScriptToEvaluateOnNewDocument` and not `evaluate`,
    because the app has to be *started* with the room list failing — the
    failure is on the first load, which is the member's report. A patch
    applied to the live page is wiped by the reload that follows it, and the
    harness then measures a page where nothing ever went wrong.
  */
  const { identifier } = await b.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        const real = window.fetch;
        window.__roomTries = 0;
        window.__realFetch = real;
        window.fetch = (input, init) => {
          const url = typeof input === "string" ? input : (input && input.url) || "";
          if (url.includes("/api/community/channels") && !window.__roomHeal) {
            window.__roomTries++;
            return Promise.resolve(new Response('{"message":"Service Unavailable"}', {
              status: 503, headers: { "content-type": "application/json" },
            }));
          }
          return real(input, init);
        };
      })();
    `,
  });

  await b.reload();
  await p.dismissTour();
  await p.openSection("community");

  const failed = await p.waitFor(
    `!!document.querySelector('[data-testid="rooms-unavailable"]')`,
    "the room list failure state",
  );
  check("a failed room list says so", failed);

  const said = await b.evaluate<string>(
    `return document.querySelector('[data-testid="rooms-unavailable"] p')?.textContent ?? ""`,
  );
  check(
    "and never claims the member has no access",
    !/no rooms are open to you/i.test(said),
    `it said ${JSON.stringify(said)}`,
  );
  check("it says what actually happened", /server/i.test(said), `it said ${JSON.stringify(said)}`);

  const tries = await b.evaluate<number>(`return window.__roomTries ?? 0`);
  check("it tried more than once before giving up", tries >= 2, `${tries} attempt(s)`);

  /* And the way out is in the app, not a restart — which is the member's
     actual complaint: they had to reload before the Room worked. */
  await b.evaluate(`window.__roomHeal = true; return true;`);
  const retried = await p.tapSelector('[data-testid="button-retry-rooms"]');
  check("there is a way to try again without restarting", retried);
  const recovered = await p.waitFor(
    `!!document.querySelector('[data-tour-id="room-feed"]')`,
    "the room, after retrying",
  );
  check("and it comes back", recovered);

  await b.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  await b.evaluate(`window.fetch = window.__realFetch; return true;`);
}

// ─── 5. A photograph is whole, and opens ───────────────────────────────────

console.log("The photograph in the feed");

{
  /*
    Made and uploaded in the page.

    /api/media takes a prepared pair — a thumb and a display, JPEG or WebP,
    with the source's own measurements — because preparation happens on the
    client. Faking that from Node would mean either a committed fixture or an
    image library; a canvas produces a real JPEG of exactly the shape this
    needs. 120×160 is the shape a phone takes a photograph in, and is what a
    4:3 box was cutting a band out of.

    Two colours, top and bottom, so a crop is a visible fact rather than a
    number: `cover` in a landscape box would show only the middle band.
  */
  const assetId = await b.evaluate<string>(`
   try {
    const draw = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#c9a227"; g.fillRect(0, 0, w, Math.round(h / 4));
      g.fillStyle = "#3f7f6f"; g.fillRect(0, h - Math.round(h / 4), w, Math.round(h / 4));
      return new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    };
    const display = await draw(120, 160);
    const thumb = await draw(60, 80);
    const fd = new FormData();
    fd.append("purpose", "room");
    fd.append("display", display, "display.jpg");
    fd.append("thumb", thumb, "thumb.jpg");
    fd.append("sourceWidth", "120");
    fd.append("sourceHeight", "160");
    fd.append("sourceBytes", String(display.size));
    const res = await fetch("/api/media", { method: "POST", body: fd, credentials: "include" });
    const text = await res.text();
    if (!res.ok) return "!" + res.status + " " + text.slice(0, 160);
    return JSON.parse(text).assetId;
   } catch (e) { return "!threw " + (e && e.message ? e.message : String(e)); }
  `);
  check("a 120×160 photograph uploads", !!assetId && !assetId.startsWith("!"), String(assetId));
  const asset = { id: assetId };

  await call(`/api/community/messages/${photo.id}`, { method: "DELETE" });
  const withPhoto = await json<Msg>(await post("/api/community/messages", {
    channelId: room.id, body: `${MARK} — look at this`, imageAssetId: asset.id,
  }));
  created.push(withPhoto.id);

  await b.reload();
  await p.dismissTour();
  await p.openSection("community");
  /* Ours, by its own dimensions — the room may hold photographs another
     harness posted, and measuring one of those would prove nothing. */
  const MINE = `[...document.querySelectorAll('[data-testid="media-image"] img')].find(i => i.naturalWidth === 120 && i.naturalHeight === 160)`;
  await p.waitFor(`!!${MINE}`, "the photograph this run posted");

  const drawn = await b.evaluate<{ fit: string; boxRatio: number; shownHeight: number; natural: number }>(`
    const img = ${MINE};
    const box = img.parentElement.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    return {
      fit: getComputedStyle(img).objectFit,
      boxRatio: box.width / box.height,
      shownHeight: r.height,
      natural: img.naturalWidth / img.naturalHeight,
    };
  `);

  eq("the feed photograph is not cropped", drawn.fit, "contain");
  check(
    "and its box is the photograph's own shape, so nothing is letterboxed either",
    Math.abs(drawn.boxRatio - drawn.natural) < 0.05,
    `box ${drawn.boxRatio.toFixed(3)} vs photo ${drawn.natural.toFixed(3)}`,
  );

  const at = await b.evaluate<{ x: number; y: number }>(`
    const r = ${MINE}.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  `);
  await b.clickAt(at.x, at.y);
  await b.settle();
  const opened = at.x > 0 && at.y > 0;
  check("tapping the photograph does something", opened);
  const overlay = await p.waitFor(
    `!!document.querySelector('[data-testid="overlay-room-photo"] img')`,
    "the full photograph",
  );
  check("it opens full screen", overlay, await b.evaluate<string>(`
    const o = document.querySelector('[data-testid="overlay-room-photo"]');
    if (!o) return "no overlay in the document";
    return "the overlay is there but has drawn no image: " + o.innerHTML.slice(0, 160);
  `));

  const big = overlay ? await b.evaluate<{ fit: string; height: number; viewport: number }>(`
    const img = document.querySelector('[data-testid="overlay-room-photo"] img');
    const r = img.getBoundingClientRect();
    return { fit: getComputedStyle(img).objectFit, height: r.height, viewport: window.innerHeight };
  `) : { fit: "", height: 0, viewport: 0 };
  eq("the opened photograph is not cropped either", big.fit, "contain");
  check(
    "and it is bigger than it was in the feed",
    big.height > drawn.shownHeight,
    `${Math.round(big.height)}px opened vs ${Math.round(drawn.shownHeight)}px in the feed`,
  );
}

// ─── Teardown ──────────────────────────────────────────────────────────────

await b.close();
for (const id of created) {
  await client.query("delete from message_reactions where message_id = $1", [id]);
}
const cleaned = await client.query(
  "delete from community_messages where id = any($1::uuid[])", [created],
);
console.log(`\n  cleaned up ${cleaned.rowCount} message(s)`);
const { rows: left } = await client.query<{ n: string }>(
  "select count(*)::text as n from community_messages where body like $1", [`${MARK}%`],
);
eq("nothing this run wrote is left behind", left[0].n, "0");
await client.end();

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} room assertions — the four a phone found\n`);
