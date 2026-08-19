/**
 * The digest that keeps a version constant honest.
 *
 * Shared by the test that enforces it and by nothing else — deliberately not
 * imported by the running app, because computing it needs the source files on
 * disk and the server does not have them in a bundle.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/**
 * Whitespace and comments are deliberately *included*.
 *
 * Stripping them is the obvious refinement and it is wrong here: a comment in
 * these modules is where the threshold is justified, and somebody rewriting
 * the justification without touching the number has changed what the engine
 * means even if the machine cannot tell. Erring toward "you must look at this"
 * costs one version bump; erring the other way costs the audit trail.
 */
export function digestOf(modules: readonly string[]): string {
  const h = createHash("sha256");
  for (const m of modules) h.update(readFileSync(join(ROOT, m), "utf8"));
  return h.digest("hex").slice(0, 16);
}
