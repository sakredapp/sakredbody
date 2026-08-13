/**
 * Reading what FCM said when a send failed.
 *
 * Its own module, with no imports, because the question it answers has a
 * silent wrong answer. Deleting a token on a transient failure unsubscribes a
 * member from every future notification, and nothing in the app would tell
 * them or us — they would simply stop hearing from their coach and assume that
 * was the product. So this is written to be tested directly rather than
 * asserted about from a distance, which it cannot be while it sits beside a
 * module that opens a database pool on import.
 */

/**
 * Is this a registration that will never work again, or a bad day?
 *
 * Deliberately narrow, and it fails in the safe direction. `UNREGISTERED` is
 * FCM saying the app was uninstalled or the token replaced; a 400 naming the
 * token is a value that was never valid. Everything else — 401 and 403 (our
 * credential), 429 (our rate), 404 without that code, 500 and 503 (their day) —
 * is about us or about Google, and leaves the member's device alone.
 *
 * The cost of being wrong each way is what sets the default: a stale row costs
 * one wasted request per notification, and is corrected the next time the app
 * registers. A wrongly deleted row costs a member every notification they were
 * ever going to get.
 */
export function isDeadToken(status: number, detail: string): boolean {
  if (status === 404 && detail.includes("UNREGISTERED")) return true;
  if (status === 400 && detail.includes("INVALID_ARGUMENT") && detail.includes("token")) {
    return true;
  }
  return false;
}
