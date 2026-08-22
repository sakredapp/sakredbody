/**
 * What can a member actually press, and does the app answer?
 *
 * ── Why this is generated rather than written ─────────────────────────────
 *
 * A list of controls maintained by hand is a list of the controls somebody
 * remembered. The two failures that produced this file were both invisible to
 * memory: a card mounted on a screen no member could reach, and a Save that
 * wrote correctly and then said nothing. Neither was missing from anyone's
 * mental model — they were present in it, and wrong.
 *
 * So the inventory is derived from source every run. If a control exists, it is
 * here; if it is here without a contract, it is reported as UNTESTED rather
 * than quietly omitted, because a gate that hides its own gaps is a worse lie
 * than no gate.
 *
 * ── What it can and cannot see ────────────────────────────────────────────
 *
 * This is static reading, not execution. It can tell you a mutation has no
 * error branch — which is a fact about the source and always true. It cannot
 * tell you the cache key it invalidates is the right one; that needs the
 * harness, against a real backend. Treat this as the denominator: the set of
 * things the interaction audit must cover, and the shape of each one.
 *
 * Run: tsx script/interaction-inventory.ts [--json]
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export type Mutation = {
  file: string;
  line: number;
  /** The const it is bound to — `save`, `log`, `finish`. */
  name: string;
  method: string | null;
  url: string | null;
  destructive: boolean;
  /**
   * Does anything reconcile client state after it succeeds, and can this
   * reader see it?
   *
   * `block`  — invalidate/seed inside the mutation itself. Visible and certain.
   * `file`   — the component reconciles, but elsewhere: a `useEffect` after a
   *            success flag, or a shared helper like `reconcileOpenWorkout`.
   *            Real, and this reader cannot prove the key is the right one.
   * `none`   — nothing in the file touches the cache. A hard gap.
   *
   * The three are kept apart because collapsing `file` into `none` would
   * report the two surfaces most recently fixed as broken, and a gate that
   * cries wolf is one people learn to skip.
   */
  reconciles: "block" | "file" | "none";
  invalidates: string[];
  seeds: string[];
  /** Can the member tell it failed? */
  handlesError: boolean;
  /** Can they tell it is working, and are they stopped from double-tapping? */
  guardsPending: boolean;
  /** Does anything say it worked, beyond the screen changing? */
  acknowledges: boolean;
};

const SRC = "client/src";

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) files(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

/** Comments blanked, never removed, so reported line numbers are real ones. */
function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1");
}

/** The braces of one `useMutation({ … })`, so nested objects don't end it early. */
function blockFrom(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

const DESTRUCTIVE_WORDS = /discard|delete|remove|unassign|abandon|cancel|clear/i;

export function inventory(): Mutation[] {
  const found: Mutation[] = [];

  for (const rel of files(SRC)) {
    const src = source(rel);
    if (!src.includes("useMutation")) continue;

    const re = /(?:const|let)\s+(\w+)\s*=\s*useMutation[<(]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const name = m[1];
      const open = src.indexOf("{", m.index + m[0].length - 1);
      if (open === -1) continue;
      const block = blockFrom(src, open);
      const line = src.slice(0, m.index).split("\n").length;

      const call =
        /apiRequest\(\s*["'](\w+)["']\s*,\s*[`"']([^`"']+)/.exec(block) ??
        /apiFetch\(\s*[`"']([^`"']+)[`"']\s*,\s*\{[^}]*method:\s*["'](\w+)["']/.exec(block);
      let method: string | null = null;
      let url: string | null = null;
      if (call) {
        if (call[0].startsWith("apiRequest")) {
          method = call[1];
          url = call[2];
        } else {
          url = call[1];
          method = call[2];
        }
      }

      const invalidates = [
        ...block.matchAll(/invalidateQueries\(\s*\{\s*queryKey:\s*([^}]+)\}/g),
      ].map((x) => x[1].trim().replace(/\s+/g, " ").slice(0, 60));
      const seeds = [...block.matchAll(/setQueryData(?:<[^>]*>)?\(\s*([^,]+),/g)].map((x) =>
        x[1].trim().replace(/\s+/g, " ").slice(0, 60),
      );

      /**
       * Usage lives outside the block: `save.isPending` on a button, an
       * `isError` branch in the JSX. Scanned across the whole file, because a
       * mutation declared in a parent is frequently rendered by a child.
       */
      const used = new RegExp(`${name}\\.(isPending|isError|error|status)`, "g");
      const usages = [...src.matchAll(used)].map((x) => x[1]);

      /** Reconciliation the block doesn't show but the file does. */
      const RECONCILERS =
        /invalidateQueries|setQueryData|reconcileOpenWorkout|seedOpenWorkout|refetch\(/;
      const reconciles: Mutation["reconciles"] =
        invalidates.length || seeds.length
          ? "block"
          : RECONCILERS.test(src)
            ? "file"
            : "none";

      found.push({
        file: rel,
        line,
        name,
        method,
        url,
        reconciles,
        destructive:
          method === "DELETE" || DESTRUCTIVE_WORDS.test(name) || DESTRUCTIVE_WORDS.test(url ?? ""),
        invalidates,
        seeds,
        handlesError:
          /onError\s*:/.test(block) ||
          usages.includes("isError") ||
          usages.includes("error"),
        guardsPending: usages.includes("isPending") || usages.includes("status"),
        acknowledges:
          /toast\(/.test(block) ||
          /setDone\(|setSaved\(|setJustFinished\(/.test(block),
      });
    }
  }

  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Every control a member can reach, by its test handle. */
export function controls(): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const rel of files(SRC)) {
    const ids = [...source(rel).matchAll(/data-testid=["'`]([^"'`$]+)["'`]/g)].map((m) => m[1]);
    if (ids.length) byFile.set(rel, [...new Set(ids)]);
  }
  return byFile;
}

if (process.argv[1] && process.argv[1].endsWith("interaction-inventory.ts")) {
  const muts = inventory();
  const ctrl = controls();
  const totalControls = [...ctrl.values()].reduce((n, v) => n + v.length, 0);

  if (process.argv.includes("--json")) {
    writeFileSync(
      join(ROOT, "script/.interaction-inventory.json"),
      JSON.stringify({ mutations: muts, controls: Object.fromEntries(ctrl) }, null, 2),
    );
    console.log(`wrote script/.interaction-inventory.json — ${muts.length} mutations`);
  }

  console.log("\nSAKRED BODY — INTERACTION INVENTORY\n");
  console.log(`Interactive controls with a test handle: ${totalControls} across ${ctrl.size} files`);
  console.log(`Server mutations: ${muts.length}`);
  console.log(`  destructive: ${muts.filter((x) => x.destructive).length}`);

  const noReconcile = muts.filter((x) => x.reconciles === "none");
  const indirect = muts.filter((x) => x.reconciles === "file");
  const noError = muts.filter((x) => !x.handlesError);
  const noPending = muts.filter((x) => !x.guardsPending);

  console.log(`\nGAPS — each is a contract the audit must either prove or close\n`);
  console.log(`  no cache reconciliation at all: ${noReconcile.length}`);
  console.log(`  reconciles indirectly (key unproven by static reading): ${indirect.length}`);
  console.log(`  no error surface:        ${noError.length}`);
  console.log(`  no pending guard:        ${noPending.length}`);

  const show = (title: string, rows: Mutation[]) => {
    if (!rows.length) return;
    console.log(`\n── ${title} ──`);
    for (const r of rows.slice(0, 40)) {
      console.log(
        `  ${r.file}:${r.line}  ${r.name}  ${r.method ?? "?"} ${r.url ?? "?"}${r.destructive ? "  [destructive]" : ""}`,
      );
    }
    if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`);
  };

  show("UNTESTED — no cache reconciliation", noReconcile);
  show("UNTESTED — no error surface", noError);
  show("UNTESTED — no pending guard (double-submit risk)", noPending);
}
