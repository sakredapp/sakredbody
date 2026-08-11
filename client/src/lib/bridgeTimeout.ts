/**
 * A deadline for anything that crosses into native code.
 *
 * ── Why this exists as its own file ───────────────────────────────────────
 *
 * A Capacitor call is a message posted to native code, which answers by
 * resolving a promise held in a map on the JS side. If the native side never
 * answers — the method is missing on that platform, it throws before its
 * completion block runs, a class fails to load, it waits on a service that is
 * not installed — the promise is not rejected. It stays pending, forever.
 *
 * `try/catch` cannot see that. A hang is not a failure; it is the absence of
 * one, and every guard written in terms of errors will report that nothing
 * went wrong.
 *
 * That cost this app its entire health feature, invisibly, on every device:
 * the availability probe never resolved, so `available` stayed null, so the
 * onboarding step was skipped and the Connect button in Settings stayed
 * disabled behind the words "Checking…". Nothing was logged, because nothing
 * had gone wrong.
 *
 * It lives apart from health.ts so it can be tested without importing
 * Capacitor — which is the whole point, since the failure it guards against is
 * one no ordinary test would ever produce by accident.
 */

export const BRIDGE_TIMEOUT_MS = 4_000;

export class BridgeTimeout extends Error {
  constructor(
    public readonly label: string,
    public readonly ms: number,
  ) {
    super(`${label} did not answer in ${ms}ms`);
    this.name = "BridgeTimeout";
  }
}

/**
 * Resolve with the work, or reject with a BridgeTimeout. Never pend forever.
 *
 * The timer is cleared on both paths. Leaving it armed on the happy path keeps
 * a Node process alive and, in a WebView, holds a closure over whatever the
 * call captured — a small leak repeated on every sync.
 */
export function withTimeout<T>(
  work: Promise<T>,
  label: string,
  ms: number = BRIDGE_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BridgeTimeout(label, ms)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
