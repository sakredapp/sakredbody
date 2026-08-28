/**
 * Getting a browser into the member portal, and moving around it.
 *
 * ── Why this is a module and not four copies ──────────────────────────────
 *
 * Three harnesses have now needed to log in and open a section, and each
 * learned the same lessons separately and at cost:
 *
 *   · Radix keeps a closed sheet mounted at zero size, so "the row exists" is
 *     true before the sheet has opened and a tap at that moment lands on
 *     whatever is underneath.
 *   · Sized and on screen is not reachable. Five sections once reported as one
 *     screen because every tap was landing on the walkthrough's scrim — the
 *     nav was visible underneath it, correctly positioned, and completely
 *     unreachable. `elementFromPoint` is the only thing that knows.
 *   · Tapped is not arrived. A coordinate click is a press and a release at
 *     one point; if the layout shifts between them the browser dispatches the
 *     click on the common ancestor instead, and a swallowed tap looks exactly
 *     like a broken handler until you ask whether anything actually changed.
 *
 * The fourth harness should not have to learn them again. This is the shared
 * boundary the section-readiness attributes were introduced for — see
 * `use-guided-tour.ts` — and the whole point of that work was that a harness
 * gets to ask the document what happened rather than wait longer and hope.
 *
 * No sleeps anywhere in here. Every wait is for a stated condition, and every
 * failure says what it saw.
 */

import type { Browser } from "./cdp.js";

/** The QA fixtures' member. Nothing here will run against anything else. */
export const QA_MEMBER = "qa.member@sakred.local";
export const QA_PASSWORD = process.env.SAKRED_QA_PASSWORD ?? "SakredQA!2026";

export const PRIMARY_SECTIONS = ["home", "restore", "build", "community", "body"] as const;

/**
 * Everything else a member can open from More, and Goals.
 *
 * Here rather than in one harness because two now walk it: the presentation
 * crawl looking for machine values on screen, and the contrast harness asking
 * whether the text can be read on the ground behind it. A section added to one
 * list and not the other is a screen that gets checked for one of those and
 * not the other, which is the kind of gap nobody notices until it ships.
 */
export const SECONDARY_SECTIONS = [
  "goals",
  "retreat", "apothecary", "library", "masterclass", "wins", "help", "settings",
] as const;

export const ALL_SECTIONS = [...PRIMARY_SECTIONS, ...SECONDARY_SECTIONS] as const;

/**
 * The element that would actually receive a tap on this anchor.
 *
 * Returns why not, rather than null, because "the tap did not happen" and "the
 * tap happened and nothing moved" need completely different fixes and are
 * indistinguishable without it.
 */
const SIZED = (id: string) => `
  const els = [...document.querySelectorAll('[data-tour-id="${id}"]')];
  let why = "";
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit) { why = "nothing at the point"; continue; }
    if (hit !== el && !el.contains(hit) && !hit.contains(el)) {
      why = "covered by " + (hit.getAttribute("data-testid") || hit.getAttribute("data-tour-id") || hit.tagName);
      continue;
    }
    return { x, y, why: "" };
  }
  return { x: -1, y: -1, why: why || (els.length ? "all instances unsized or off screen" : "no such anchor") };
`;

export class Portal {
  /** Why the last tap could not be made. Reported, never guessed at. */
  lastFailure = "";
  /** Sections that needed a synthetic click after a real tap went nowhere. */
  readonly swallowed: string[] = [];

  constructor(
    private readonly b: Browser,
    private readonly base: string,
  ) {}

  async login(email = QA_MEMBER, password = QA_PASSWORD): Promise<void> {
    await this.b.goto(`${this.base}/login`);
    await this.b.waitFor("document.querySelectorAll('input').length >= 2", "the login form", 25_000);
    await this.b.evaluate(`
      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const [e, p] = document.querySelectorAll("input");
      set(e, ${JSON.stringify(email)}); set(p, ${JSON.stringify(password)});
      return true;
    `);
    await this.b.settle();
    const at = await this.b.evaluate<{ x: number; y: number }>(`
      const q = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Sign In").getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    `);
    await this.b.clickAt(at.x, at.y);
    await this.b.waitFor("location.pathname === '/member'", "the portal", 25_000);
  }

  /** Tap an anchor by its tour id, hit-tested. */
  async tap(id: string): Promise<boolean> {
    const at = await this.b.evaluate<{ x: number; y: number; why: string }>(SIZED(id));
    if (!at || at.x < 0) {
      this.lastFailure = `${id}: ${at?.why ?? "no result"}`;
      return false;
    }
    await this.b.clickAt(at.x, at.y);
    await this.b.settle();
    return true;
  }

  /**
   * Tap something identified by an arbitrary selector — a form control, a
   * button inside a sheet — retrying until it is genuinely reachable.
   *
   * The retry is not padding. A sheet is mounted at zero size before it opens
   * and mid-slide while it does, so a hit test run the instant after the
   * opening tap finds the control at coordinates it will not be at a frame
   * later. A sleep would only be guessing how long the animation is, and would
   * still be wrong on a slower machine.
   */
  async tapSelector(selector: string, tries = 12): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      const at = await this.b.evaluate<{ x: number; y: number } | null>(`
        for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.y < 0 || r.y > innerHeight) el.scrollIntoView({ block: "center" });
          const rr = el.getBoundingClientRect();
          const x = rr.x + rr.width / 2, y = rr.y + rr.height / 2;
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return { x, y };
        }
        return null;`);
      if (at) {
        await this.b.clickAt(at.x, at.y);
        await this.b.settle();
        return true;
      }
      await this.b.settle();
    }
    this.lastFailure = `${selector}: never became reachable`;
    return false;
  }

  /**
   * Tap something, and check the app actually did what the tap was for.
   *
   * ── Why a plain tap is not enough ────────────────────────────────────────
   *
   * A coordinate click is a press and a release at one point. If anything
   * moves between them — a sheet still rising, a re-render, a scroll the tap
   * itself caused — the browser dispatches the click on the common ancestor
   * instead, which typically does nothing at all. `tapSelector` returns true
   * in that case, because from its side the gesture was delivered; the button
   * simply never heard it.
   *
   * `openSection` already learned this and answers it with
   * `data-tour-section-wanted`. Everything else needs the same shape, so this
   * takes the condition that says the tap worked, and falls back to a
   * synthetic click only after the real gesture has had its chance — a harness
   * that reaches for `el.click()` first has stopped testing what a finger
   * does, and would hide a control no finger can reach.
   */
  async tapUntil(selector: string, condition: string, what: string, tries = 3): Promise<boolean> {
    for (let attempt = 0; attempt < tries; attempt++) {
      if (!(await this.tapSelector(selector))) return false;
      if (await this.holds(condition, what)) return true;
    }
    const dispatched = await this.b.evaluate<boolean>(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;`);
    if (dispatched && (await this.holds(condition, what))) {
      this.swallowed.push(selector);
      return true;
    }
    this.lastFailure = `${selector} was tapped but ${what} never happened`;
    return false;
  }

  /** Wait for a condition and say so, rather than throwing. */
  waitFor(condition: string, what: string, timeoutMs = 10_000): Promise<boolean> {
    return this.holds(condition, what, timeoutMs).then(async (ok) => {
      if (!ok) this.lastFailure = `${what} never became true`;
      return ok;
    });
  }

  private holds(condition: string, what: string, timeoutMs = 6_000): Promise<boolean> {
    return this.b
      .waitFor(condition, what, timeoutMs)
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Wait for a section to be on screen, not merely asked for.
   *
   * `openSection` returns when the app has *requested* the section — that is
   * what makes a swallowed tap cost one attempt instead of a whole section —
   * and the screen mounts a beat later, after the outgoing one has finished
   * leaving. Three harnesses have tripped over the gap between those two, all
   * of them reading state that said one thing while the old screen was still
   * up. `data-tour-section` is the mounted one and `data-tour-settled` is the
   * one whose enter animation has finished; see use-guided-tour.ts.
   */
  async awaitSection(id: string, settled = true): Promise<boolean> {
    const attr = settled ? "data-tour-settled" : "data-tour-section";
    const held = await this.holds(
      `document.documentElement.getAttribute(${JSON.stringify(attr)}) === ${JSON.stringify(id)}`,
      `the ${id} screen`,
      15_000,
    );
    if (!held) {
      this.lastFailure = await this.b.evaluate<string>(`
        const d = document.documentElement;
        return "wanted=" + d.getAttribute("data-tour-section-wanted") +
          " mounted=" + d.getAttribute("data-tour-section") +
          " settled=" + d.getAttribute("data-tour-settled");`);
    }
    return held;
  }

  /** Type into a field the way a person does — React's setter, then an input event. */
  async type(selector: string, value: string): Promise<boolean> {
    return this.b.evaluate<boolean>(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
      set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;`);
  }

  /**
   * Leave no sheet open behind us.
   *
   * The More sheet is how every secondary section is reached and it does not
   * always close on its own, so the next tap on More lands on the sheet it
   * already has open. That presented as "covered by more-sheet", "covered by
   * svg", "covered by H2" — seven sections unreachable for one reason wearing
   * seven different names.
   *
   * Escape rather than a click on the backdrop: a backdrop click is a
   * coordinate, and coordinates are what got us here.
   */
  /**
   * Wait until the screen has stopped arriving.
   *
   * `awaitSection` answers when the section is mounted and its enter animation
   * has finished, which is the earliest a tap can land — and several tabs are
   * still fetching at that moment. Reading then finds a nav bar and nothing
   * else, and a harness that measures an empty screen reports it clean.
   *
   * Two identical samples rather than one, because a screen that is painting
   * in stages passes through moments of stillness between them.
   */
  async settleText(unlike?: number, timeoutMs = 12_000): Promise<number> {
    const read = `return document.body.innerText.trim().length;`;
    let last = -1;
    let same = 0;
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const now = await this.b.evaluate<number>(read);
      same = now === last ? same + 1 : 0;
      last = now;
      /*
        Stability alone is not arrival. A screen showing nothing but the nav
        is perfectly stable, and two harnesses read one that way — reporting
        seven runs of text on a tab that has a hundred. So the caller can say
        what the screen looked like *before* it asked for this one, and the
        wait continues until the answer is something else.
      */
      if (same >= 2 && now > 0 && now !== unlike) return now;
      await this.b.settle();
    }
    return last;
  }

  async closeSheets(): Promise<void> {
    const open = () =>
      this.b.evaluate<boolean>(
        `return [...document.querySelectorAll('[data-tour-id="more-sheet"], [role="dialog"]')]
           .some(e => e.getBoundingClientRect().height > 0);`,
      );
    for (let attempt = 0; attempt < 4 && (await open()); attempt++) {
      await this.b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await this.b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await this.b.settle();
      await this.b.settle();
    }
  }

  /** Put the walkthrough away if it is running. Idempotent; safe when it is not. */
  async dismissTour(): Promise<void> {
    /*
      It auto-starts for an account that has not finished it and mounts a
      second or so after the portal does — so a dismissal attempted the instant
      we arrive finds nothing, returns happily, and every tap afterwards lands
      on a scrim that appeared later.
    */
    await this.b
      .waitFor(`!!document.querySelector('[data-testid="tour-overlay"]')`, "the walkthrough", 8_000)
      .catch(() => undefined);
    for (let attempt = 0; attempt < 4; attempt++) {
      const at = await this.b.evaluate<{ x: number; y: number } | null>(`
        const el = document.querySelector('[data-testid="button-tour-pause"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
      if (!at) break;
      await this.b.clickAt(at.x, at.y);
      await this.b.settle();
    }
    await this.b
      .waitFor(`!document.querySelector('[data-testid="tour-overlay"]')`, "the walkthrough to close", 8_000)
      .catch(() => undefined);
  }

  /**
   * Land on a section, from wherever the browser currently is.
   *
   * A section is not a route — `MemberDashboard` says so out loud, and every
   * one of them lives at /member switched by state — so this opens them the
   * way a member does. That also puts the sheet itself under whatever the
   * caller is measuring, which matters: a sheet is precisely the kind of
   * surface nobody screenshots.
   */
  async openSection(id: string): Promise<boolean> {
    await this.closeSheets();
    if ((PRIMARY_SECTIONS as readonly string[]).includes(id)) return this.tap(`nav-${id}`);

    /*
      Twice if need be. Opening the sheet is a two-step gesture and the first
      step is not reliable from every starting point: the first secondary
      section of a run opened fine and every one after it failed — the sheet
      had been asked to open and had not finished, or had opened and closed
      again behind the row we were waiting for. Retrying the whole gesture is
      honest about that; waiting longer inside it was not, because the row
      genuinely was not there.
    */
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await this.closeSheets();
      if (!(await this.tap("nav-more"))) {
        this.lastFailure = `nav-more: ${this.lastFailure}`;
        continue;
      }

      /* The sheet itself, before its contents. An expression, not a statement:
         `waitFor` wraps what it is given in `return (…)`, so a trailing
         semicolon is a syntax error that looks exactly like a sheet that never
         opened — six seconds of it, every time. */
      const opened = await this.b
        .waitFor(
          `[...document.querySelectorAll('[data-tour-id="more-sheet"]')].some(e => e.getBoundingClientRect().height > 100)`,
          "the More sheet",
          6_000,
        )
        .then(() => true)
        .catch(() => false);
      if (!opened) {
        this.lastFailure = await this.b.evaluate<string>(`
          const sheets = [...document.querySelectorAll('[data-tour-id="more-sheet"]')];
          const dialogs = [...document.querySelectorAll('[role="dialog"]')];
          return "the More sheet never opened at " + innerWidth + "x" + innerHeight + " — " + sheets.length + " sheet(s) at [" +
            sheets.map(e => Math.round(e.getBoundingClientRect().height)).join(",") + "], " +
            dialogs.length + " dialog(s) at [" +
            dialogs.map(e => (e.getAttribute("data-testid") || e.getAttribute("data-tour-id") || "?") + ":" +
              Math.round(e.getBoundingClientRect().height)).join(",") + "]";`);
        continue;
      }

      /*
        Wait for the row to have stopped moving, not merely to be visible.

        The sheet animates up from nothing, so its rows are mounted and sized
        zero, then sized and below the fold, then finally where a finger could
        reach them — and this check used to stop one step early. A row at
        y=847 on an 852-tall screen passes "on screen and hit-testable" and is
        475px from where it will end up, so a press and a release straddling
        the animation land on two different elements and the browser dispatches
        the click on their common ancestor. That was reported for months as "a
        real tap went nowhere on retreat and goals", and it was the truth: the
        tap went to the sheet.

        `data-tour-settled` is the sheet saying its own entry animation has
        ended — see MemberNav, which now also withholds pointer events until
        then, so this is waiting for the same fact the product waits for rather
        than for a duration guessed from the outside.
      */
      const reachable = await this.b
        .waitFor(
          `[...document.querySelectorAll('[data-tour-id="nav-more-${id}"]')].some(e => {
             const sheet = e.closest('[data-tour-id="more-sheet"]');
             if (sheet && sheet.getAttribute("data-tour-settled") !== "true") return false;
             const r = e.getBoundingClientRect();
             if (!r.width || !r.height) return false;
             const x = r.x + r.width / 2, y = r.y + r.height / 2;
             if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return false;
             const hit = document.elementFromPoint(x, y);
             return !!hit && (hit === e || e.contains(hit) || hit.contains(e));
           })`,
          `the ${id} row`,
          8_000,
        )
        .then(() => true)
        .catch(() => false);
      if (!reachable) {
        this.lastFailure = `the ${id} row never became reachable in the open sheet`;
        continue;
      }

      if (!(await this.tap(`nav-more-${id}`))) {
        this.lastFailure = `nav-more-${id}: ${this.lastFailure}`;
        continue;
      }

      /*
        Tapped is not arrived.

        `data-tour-section-wanted` is set the instant the member's tap reaches
        state, before any animation, so a swallowed tap costs one more attempt
        instead of a section — and is not misreported twenty-five seconds later
        as "the section never settled", which points at the wrong thing
        entirely.
      */
      if (await this.arrived(id)) return true;

      /*
        Which half failed: the delivery, or the handler.

        A coordinate click is a press and a release at one point, and if the
        layout shifts between them the browser dispatches the click on the
        common ancestor instead — the sheet, which does nothing. That is
        indistinguishable from a broken handler until you dispatch one directly
        and see whether the app moves. Only after the real gesture has had its
        chance: a harness that reaches for a synthetic click first stops
        testing the thing a finger does.
      */
      const dispatched = await this.b.evaluate<boolean>(`
        const el = document.querySelector('[data-tour-id="nav-more-${id}"]');
        if (!el) return false;
        el.click();
        return true;`);
      if (dispatched && (await this.arrived(id))) {
        this.swallowed.push(id);
        return true;
      }
      this.lastFailure = `the ${id} row was tapped but the app never asked for it`;
    }
    return false;
  }

  /** Did the app actually ask for this section? Asked of the document, not guessed. */
  private arrived(id: string): Promise<boolean> {
    return this.b
      .waitFor(
        `document.documentElement.getAttribute("data-tour-section-wanted") === ${JSON.stringify(id)}`,
        `the tap on ${id} to register`,
        3_000,
      )
      .then(() => true)
      .catch(() => false);
  }
}
