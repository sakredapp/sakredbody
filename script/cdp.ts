/**
 * A browser, driven directly, with nothing added to package.json.
 *
 * ── Why not Playwright ────────────────────────────────────────────────────
 *
 * Because what is being measured here is geometry, and the thing measuring it
 * should be as close to the browser as possible. Every layer between the
 * assertion and `getBoundingClientRect` is a layer that can retry, auto-wait,
 * scroll-into-view or otherwise be helpful in exactly the way that hides a
 * spotlight landing in the wrong place. A framework that quietly scrolls an
 * element into view before clicking it will make a tutorial pointing off-screen
 * look like it works.
 *
 * Chrome speaks CDP over a WebSocket, Node has had a WebSocket client since 22,
 * and that is the whole dependency list. Roughly two hundred lines, and it does
 * not auto-wait for anything.
 *
 * ── What it deliberately does not do ──────────────────────────────────────
 *
 * No element handles, no selector engine, no implicit waits. Evaluate returns
 * plain JSON; clicks are real `Input.dispatchMouseEvent` at real coordinates,
 * so a click that misses the target misses it here too. `waitFor` polls a
 * predicate the caller writes and times out loudly.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell`,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Refuse to measure a product that is not the one in the working tree.
 *
 * ── The afternoon this cost ───────────────────────────────────────────────
 *
 * The QA server serves `dist/`, and a server left running from an earlier
 * build answers every request perfectly. A motion defect in the walkthrough
 * was traced, diagnosed, fixed, and re-traced — and the re-trace reproduced
 * the original behaviour exactly, because :5199 was still serving a bundle
 * from before the adaptive panel landed. The published `data-tour-weight`
 * attribute was simply absent, which is the only reason it was caught at all.
 *
 * Nothing about that run looked wrong. It is the same failure as a check that
 * silently cannot run: a green harness pointed at a stale build is worse than
 * no harness, because it is believed.
 *
 * So: the newest source file, against the built entry. Cheap, and it fails
 * loudly with the command that fixes it.
 */
export function assertFreshBuild(root = process.cwd()): void {
  const built = join(root, "dist/public/index.html");
  if (!existsSync(built)) {
    throw new Error("No build to serve — run `npm run build && script/qa-serve.sh`");
  }
  const builtAt = statSync(built).mtimeMs;

  let newest = 0;
  let culprit = "";
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css|html)$/.test(entry.name)) {
        const at = statSync(full).mtimeMs;
        if (at > newest) { newest = at; culprit = full.slice(root.length + 1); }
      }
    }
  };
  for (const dir of ["client/src", "shared"]) {
    const full = join(root, dir);
    if (existsSync(full)) walk(full);
  }

  if (newest > builtAt) {
    const behind = Math.round((newest - builtAt) / 1000);
    throw new Error(
      `The served build is ${behind}s older than ${culprit}.\n` +
        "  Whatever this run reports would be about a product that no longer exists.\n" +
        "  Fix: npm run build && script/qa-serve.sh",
    );
  }
}

export class Browser {
  private proc: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private events = new Map<string, ((params: any) => void)[]>();

  /**
   * A port and profile nobody else is holding.
   *
   * ── The flake this fixes ──────────────────────────────────────────────
   *
   * A fixed port and a fixed profile directory meant a Chrome leaked by a
   * crashed run kept both. The next run's launch could not bind, and
   * `awaitTarget` cheerfully found the OLD browser on that port and drove its
   * stale tab — which presents as "the overlay never mounted", on a first run,
   * intermittently. Two turns were spent suspecting application cold start.
   *
   * Randomising per instance makes runs independent, and `close` takes the
   * profile with it.
   */
  private readonly profile: string;

  constructor(private readonly port = 9200 + Math.floor(Math.random() * 700)) {
    this.profile = join(process.env.TMPDIR ?? "/tmp", `sakred-cdp-${this.port}-${process.pid}`);
  }

  async launch(): Promise<void> {
    /* Here rather than in each harness, because a harness that forgets is
       exactly the harness that reports a fixed defect as still broken. */
    assertFreshBuild();
    const bin = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!bin) throw new Error(`No Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`);

    mkdirSync(this.profile, { recursive: true });

    this.proc = spawn(bin, [
      "--headless=new",
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      /* Deterministic paint timing, so a screenshot is of a settled frame. */
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "about:blank",
    ], { stdio: "ignore" });

    const target = await this.awaitTarget();
    await this.connect(target);
    for (const domain of ["Page", "Runtime", "Network", "DOM"]) await this.send(`${domain}.enable`);
  }

  /** Chrome takes a moment to open the port. Poll rather than sleep and hope. */
  private async awaitTarget(): Promise<string> {
    const deadline = Date.now() + 15_000;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/list`);
        const targets = (await res.json()) as { type: string; webSocketDebuggerUrl?: string }[];
        const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      } catch (err) {
        lastError = (err as Error).message;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error(`Chrome never opened a debugging target on ${this.port}. ${lastError}`);
  }

  private connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("CDP socket failed")));
      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (!p) return;
          if (msg.error) p.reject(new Error(`${msg.error.message}${msg.error.data ? ` — ${msg.error.data}` : ""}`));
          else p.resolve(msg.result);
        } else if (msg.method) {
          for (const fn of this.events.get(msg.method) ?? []) fn(msg.params);
        }
      });
    });
  }

  on(method: string, fn: (params: any) => void): void {
    this.events.set(method, [...(this.events.get(method) ?? []), fn]);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
      }, 30_000);
    });
  }

  /**
   * Run an expression in the page and get JSON back.
   *
   * Thrown exceptions come back as thrown exceptions rather than as an
   * undefined that the caller then asserts against — a silent undefined here
   * would make every geometry assertion pass vacuously.
   */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    /*
      Retried once across a navigation.

      A tap can start a navigation the caller did not know was coming — a row
      that turns out to be a route, a session that expired into /login — and
      the next `Runtime.evaluate` lands in the middle of it. Chrome answers
      "Inspected target navigated or closed", which is not a page error and
      not a harness bug: it is a question asked of a document that no longer
      exists. Asking the new one is the correct behaviour, and it is a much
      smaller surprise than a crawl abandoning itself two thirds of the way
      through with a stack trace about a WebSocket.
    */
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.send("Runtime.evaluate", {
          /* `async`, so a probe can await inside the page. The wrapper is a
             function either way and `awaitPromise` below unwraps the result,
             so nothing that worked before behaves differently. */
          expression: `(async () => { ${expression} })()`,
          returnByValue: true,
          awaitPromise: true,
        });
        if (res.exceptionDetails) {
          const e = res.exceptionDetails;
          throw new Error(`page threw: ${e.exception?.description ?? e.text}`);
        }
        return res.result.value as T;
      } catch (err) {
        const message = (err as Error).message;
        if (attempt > 0 || !/navigated or closed|Execution context was destroyed/.test(message)) throw err;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }

  async goto(url: string): Promise<void> {
    const loaded = new Promise<void>((resolve) => {
      const done = () => resolve();
      this.on("Page.loadEventFired", done);
      setTimeout(done, 20_000);
    });
    await this.send("Page.navigate", { url });
    await loaded;
  }

  async reload(): Promise<void> {
    const loaded = new Promise<void>((resolve) => {
      this.on("Page.loadEventFired", () => resolve());
      setTimeout(resolve, 20_000);
    });
    await this.send("Page.reload", { ignoreCache: false });
    await loaded;
  }

  /** A phone, including touch — a desktop viewport at phone width is not one. */
  async viewport(width: number, height: number, mobile = true): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile,
      screenWidth: width, screenHeight: height,
    });
    /* maxTouchPoints must be 1..16 even when touch is off — 0 is rejected
       outright, which turns "measure the desktop breakpoint" into a crash. */
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  }

  /** A real click at real coordinates. If the tutorial points elsewhere, this misses. */
  async clickAt(x: number, y: number): Promise<void> {
    const at = { x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 };
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", ...at });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...at });
  }

  /**
   * Extra headers on every request.
   *
   * Used to send `X-Forwarded-Proto: https`, which is what the harness needs
   * and what production genuinely has. The session cookie is `secure: true`
   * behind `trust proxy 1`, so express-session withholds it entirely unless
   * `req.secure` — over plain http with no forwarded header the login succeeds
   * and no cookie is ever sent. That is correct behaviour and the reason to
   * imitate the proxy rather than to weaken the cookie for testing.
   */
  async headers(headers: Record<string, string>): Promise<void> {
    await this.send("Network.setExtraHTTPHeaders", { headers });
  }

  async cookies(cookies: { name: string; value: string; domain: string; path?: string }[]): Promise<void> {
    await this.send("Network.setCookies", {
      cookies: cookies.map((c) => ({ path: "/", ...c })),
    });
  }

  async screenshot(path: string): Promise<void> {
    const { data } = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, Buffer.from(data, "base64"));
  }

  /** Poll an expression until it is truthy. Loud on timeout, never silent. */
  async waitFor(expression: string, what: string, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last: unknown;
    while (Date.now() < deadline) {
      try {
        last = await this.evaluate(`return (${expression});`);
        if (last) return;
      } catch (err) {
        last = (err as Error).message;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    throw new Error(`waited ${timeoutMs}ms for ${what} — last value ${JSON.stringify(last)}`);
  }

  /** Two frames, so a measurement is of a settled layout rather than a pending one. */
  async settle(): Promise<void> {
    await this.evaluate(
      "return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))));",
    );
  }

  async close(): Promise<void> {
    try { this.ws?.close(); } catch { /* already gone */ }
    this.proc?.kill();
    /* Leave nothing for the next run to attach to by accident. */
    try {
      const { rmSync } = await import("node:fs");
      rmSync(this.profile, { recursive: true, force: true });
    } catch { /* the OS will get it */ }
  }
}
