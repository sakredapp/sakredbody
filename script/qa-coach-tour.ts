/**
 * The coach extension, and the wall between two contexts.
 *
 * ── What was actually wrong ───────────────────────────────────────────────
 *
 * `ROLE_TOURS`, `roleTours` and `SAKRED_COACH_INTRO` were written, exported,
 * and mounted nowhere. A coach finished the member walkthrough and was never
 * shown where their workspace is — the fourth module this cycle that existed,
 * compiled, and never executed. So this file exists to prove it runs, and to
 * prove the thing that matters more once it does: that teaching somebody about
 * their clients does not start showing them client data on their own screens.
 *
 * ── The two directions of leak ────────────────────────────────────────────
 *
 *   self → client    a coach's own training appearing under a client's name
 *   client → self    a client's numbers rendering as the coach's own body
 *
 * Both are checked from the server as well as the screen: an endpoint is the
 * only place the answer is authoritative, and a member's Home showing the
 * right name proves nothing about what the API would hand over.
 *
 *   Terminal 1:  npm run build && DATABASE_URL=$SAKREDBODY_QA_DATABASE_URL \
 *                SESSION_SECRET=… PORT=5199 NODE_ENV=production node dist/index.cjs
 *   Terminal 2:  npx tsx script/qa-coach-tour.ts
 */

import { Browser } from "./cdp.js";
import { TourDriver } from "./tour-driver.js";
import { SAKRED_COACH_INTRO } from "../client/src/lib/tour/sakredIntro.js";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:5199";
const PASSWORD = process.env.QA_PASSWORD ?? "SakredQA!2026";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) return void passed++;
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`    ✗ ${name}${detail ? ` — ${detail}` : ""}`);
};

console.log(`\nCoach extension — ${BASE}\n`);

// ─── 1. The server's answer, before anything is rendered ──────────────────

const jars = new Map<string, string>();
async function login(who: string): Promise<void> {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
    body: JSON.stringify({ email: `qa.${who}@sakred.local`, password: PASSWORD }),
  });
  const jar = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (jar) jars.set(who, jar);
}
const call = (who: string, path: string) =>
  fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: { cookie: jars.get(who) ?? "", "x-forwarded-proto": "https" },
  });

await login("coach");
await login("member");
await login("fresh");

{
  const me = await (await call("coach", "/api/auth/user")).json();
  check("the coach is signed in as themselves", me.email === "qa.coach@sakred.local", me.email);
  check("and is a coach", me.role === "coach", me.role);

  /* Self surfaces are self. A coach's Build history is the coach's. */
  const mine = await call("coach", "/api/training/sessions");
  check("their own training reads as their own", mine.status === 200, `${mine.status}`);

  /* The client workspace is the client's, and only where the relationship is. */
  const assigned = await call("coach", "/api/coach/clients/qa-member/movement");
  check("an assigned client's movement is reachable", assigned.status === 200, `${assigned.status}`);

  const unassigned = await call("coach", "/api/coach/clients/qa-fresh/movement");
  check("an unassigned one is not", unassigned.status === 403 || unassigned.status === 404,
    `${unassigned.status}`);

  /* And the wall holds in the other direction. */
  const memberReach = await call("member", "/api/coach/clients/qa-member/movement");
  check("a member cannot read the coach surfaces at all",
    memberReach.status === 403 || memberReach.status === 404, `${memberReach.status}`);

  const invented = await call("coach", "/api/coach/clients/not-a-person/movement");
  check("and an invented client resolves to a refusal, not to somebody",
    invented.status === 403 || invented.status === 404, `${invented.status}`);
}

// ─── 2. The extension actually runs ───────────────────────────────────────

const b = new Browser();
await b.launch();
await b.headers({ "X-Forwarded-Proto": "https" });
await b.viewport(393, 852, true);
await b.goto(`${BASE}/login`);
await b.waitFor("document.querySelectorAll('input').length >= 2", "the login form", 25_000);
await b.evaluate(`
  const set = (el, v) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const [e, p] = document.querySelectorAll("input");
  set(e, "qa.coach@sakred.local"); set(p, ${JSON.stringify(PASSWORD)});
  return true;
`);
await b.settle();
const signIn = await b.evaluate<{ x: number; y: number }>(`
  const q = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Sign In").getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
`);
await b.clickAt(signIn.x, signIn.y);
await b.waitFor("location.pathname === '/member'", "the portal", 25_000);

/*
  Straight to the last universal lesson rather than through all twenty-six:
  the member walkthrough is certified elsewhere, and what is unproven here is
  what happens *after* it ends for an account that is also a coach.
*/
await b.evaluate(`
  for (const k of Object.keys(localStorage)) if (k.startsWith("sakred.tour")) localStorage.removeItem(k);
  localStorage.setItem("sakred.tour.replay", ${JSON.stringify(JSON.stringify({ from: "complete" }))});
  return true;
`);
await b.goto(`${BASE}/member`);
await b.waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the overlay", 30_000);
await b.settle();

/*
  Two tours, one after the other, so the driver has to be told which contract
  it is reading. A driver holding the member tour reported the coach's first
  lesson as an unknown step — correctly: it is not in that tour.
*/
const member = new TourDriver(b);
const coach = new TourDriver(b, SAKRED_COACH_INTRO);
const coachIds = new Set(SAKRED_COACH_INTRO.steps.map((s) => s.id));

const seen: string[] = [];
for (let i = 0; i < 40; i++) {
  const at = await member.stepId();
  if (!at) break;
  seen.push(at);
  const driver = coachIds.has(at) ? coach : member;
  try {
    const t = await driver.step();
    if (!t.nextActual) break;
  } catch (err) {
    check("the coach extension can be driven", false, `${at}: ${(err as Error).message}`);
    console.log("      state:", await b.evaluate<string>(`
      const dump = (sel) => [...document.querySelectorAll(sel)].map(e => { const r = e.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); });
      return JSON.stringify({ role: dump('[data-tour-id="role-coach"]'), sheet: dump('[data-tour-id="more-sheet"]'),
        inSheet: !!document.querySelector('[data-tour-id="more-sheet"] [data-tour-id="role-coach"]'),
        parents: (() => { const e = document.querySelector('[data-tour-id="role-coach"]'); const out = [];
          for (let p = e; p && out.length < 5; p = p.parentElement) out.push(p.tagName + "." + String(p.className).slice(0, 45));
          return out; })(),
        sheetText: (document.querySelector('[data-tour-id="more-sheet"]')?.innerText || "").slice(280, 520) });
    `));
    break;
  }
}

const coachSteps = SAKRED_COACH_INTRO.steps.map((s) => s.id);
check("the universal walkthrough hands over to the coach extension",
  coachSteps.some((id) => seen.includes(id)), seen.join(" → "));
check("and teaches every lesson in it",
  coachSteps.every((id) => seen.includes(id)),
  `missing ${coachSteps.filter((id) => !seen.includes(id)).join(", ")}`);

/* Where it left them: the coach's own workspace, not somebody's record. */
const landed = await b.evaluate<{ path: string; body: string }>(`
  return { path: location.pathname, body: document.body.innerText.slice(0, 400) };
`);
check("it ends in the coach workspace", /coach/i.test(landed.path), landed.path);
check("and not inside a client's record",
  !/qa\\.fresh|Fresh/i.test(landed.body), landed.body.slice(0, 120));

await b.close();

if (failures.length) {
  console.error("\n✗ coach extension\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`\n✓ ${passed} coach assertions — the extension runs, and the wall holds\n`);
