/**
 * Did this fail because the session no longer exists?
 *
 * Its own module, with no imports, for two reasons. It is the one piece of the
 * session-identity rule that is pure enough to be tested without a browser —
 * everything else in `use-open-workout` needs a query client and a network —
 * and it is the piece most worth testing, because the whole recovery path
 * hangs off it answering correctly.
 *
 * `apiRequest` flattens a failed response into `Error("404: {…json…}")`, so
 * both halves are checked: the status, and the server's own words. Every call
 * site is already scoped to a session id, so a 404 there can only mean one
 * thing — but requiring the message too keeps this from swallowing the other
 * 404s those screens can produce (`DELETE /sets/:id` answers "Not found"), and
 * requiring the status keeps a 500 that happens to quote the phrase from
 * clearing a live workout off somebody's screen.
 */
export function isMissingSession(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message.startsWith("404") && /no such session/i.test(message);
}
