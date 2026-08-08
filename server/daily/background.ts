/**
 * Work that outlives the response.
 *
 * A live run measured note generation at 1.4s, 3.7s, 6.6s and 25.5s. The
 * function's `maxDuration` is 30s, so generating inline is not merely slow —
 * it's one bad tail-latency away from timing out and returning nothing at all.
 *
 * So a request never waits for a note. It returns whatever exists (or computed
 * fallback text), and generation continues after the response is sent.
 *
 * On Vercel that needs `waitUntil`: once the response is flushed the runtime is
 * free to freeze the instance, and a floating promise would simply never
 * finish. On a long-running server there is nothing to freeze and a floating
 * promise is correct. This picks whichever applies.
 */

type Waiter = (promise: Promise<unknown>) => void;

let waiter: Waiter | null = null;
let resolved = false;

async function resolveWaiter(): Promise<Waiter> {
  if (resolved) return waiter ?? fallbackWaiter;
  resolved = true;

  try {
    const mod = await import("@vercel/functions");
    if (typeof mod.waitUntil === "function") {
      waiter = (p) => {
        try {
          mod.waitUntil(p);
        } catch {
          // Outside a Vercel request context waitUntil throws; the promise is
          // already running either way, so just make sure it can't go unhandled.
          p.catch(() => {});
        }
      };
      return waiter;
    }
  } catch {
    // Not deployed on Vercel. Fine.
  }

  waiter = fallbackWaiter;
  return waiter;
}

const fallbackWaiter: Waiter = (p) => {
  p.catch((err) => console.error("[daily] background task failed:", err));
};

/**
 * Run something after the response, without the caller waiting.
 *
 * Deliberately swallows failures: every caller of this already has a usable
 * answer, so a failed background refresh must never turn into a failed request.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  const promise = task().catch((err) => {
    console.error("[daily] background task failed:", err);
  });

  void resolveWaiter().then((w) => w(promise));
}
