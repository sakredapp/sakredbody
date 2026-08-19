/**
 * The map stays true, or this fails.
 *
 * A document describing which parts of a product are model-backed is worth
 * exactly as long as it takes somebody to add an import. The claims below are
 * the load-bearing ones — the ones a reader would act on — and each is checked
 * against the source rather than trusted.
 *
 * Run: tsx script/test-intelligence-map.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

const serverFiles = walk("server");
const source = new Map(serverFiles.map((p) => [p, readFileSync(p, "utf8")]));

// ─── 1. One model layer, and one importer ─────────────────────────────────

const mentionsBedrock = serverFiles.filter((p) => /BedrockRuntimeClient|ConverseCommand/.test(source.get(p)!));
check("exactly one module speaks to a model provider",
  mentionsBedrock.length === 1 && mentionsBedrock[0] === "server/daily/model.ts",
  mentionsBedrock.join(", "));

const importers = serverFiles.filter(
  (p) => p !== "server/daily/model.ts" && /from "\.\/model\.js"|daily\/model\.js/.test(source.get(p)!),
);
check("and one module imports it",
  importers.length === 1 && importers[0] === "server/daily/generate.ts",
  importers.join(", "));

// ─── 2. The member's adaptive surfaces do not reach it ────────────────────

/*
  Named individually rather than derived, because the claim in the map is about
  these specific surfaces — Terrain, Today, Build, Rhythm, habit proposals — and
  a rule that happened to hold for every file would not say anything about them.
*/
for (const file of [
  "server/terrain/routes.ts",
  "server/today/routes.ts",
  "server/training/routes.ts",
  "server/habits/routes.ts",
]) {
  check(`${file} does not reach the model layer`, !/daily\//.test(source.get(file) ?? ""));
}

// ─── 3. The member request path never blocks on a model ───────────────────

{
  const routes = source.get("server/daily/routes.ts")!;
  const memberRoute = routes.slice(routes.indexOf('app.get("/api/daily"'), routes.indexOf('app.post("/api/daily/intention'));
  check("the member's daily route uses the fast path", /getDailyNoteFast/.test(memberRoute));
  check("and never the generating one", !/getOrCreateDailyNote/.test(memberRoute));
}

// ─── 4. What the generator records about itself ───────────────────────────

{
  const generate = source.get("server/daily/generate.ts")!;
  check("a note records whether a model wrote it",
    /source: "model"/.test(generate) && /source: "fallback"/.test(generate));
  check("and which model did", /model: client\.model/.test(generate));
}

// ─── 5. And the claim that there is nothing else ──────────────────────────

/*
  The recommendation layer now exists, and the claim that matters has moved.
  It is no longer "there is no such table" — it is that the table records
  deterministic output as deterministic. A row that named a provider would mean
  either the map is stale or somebody quietly put a model on the member path,
  and both are things this file should refuse to let pass quietly.
*/
{
  const model = readFileSync("shared/models/recommendation.ts", "utf8");
  check("the recommendation record exists", model.includes("recommendation_events"));
  check("and it can say a model produced something", model.includes('modelProvider: text("model_provider")'));
  check("but the stamp it writes claims none",
    /modelProvider: null,\s*\n\s*modelId: null,\s*\n\s*promptVersion: null,/.test(model),
    "recommendationVersions now fills in a model — either a model reached the member path or this is fiction");
}

if (failures.length) {
  console.error("\n✗ the intelligence map no longer describes the product\n");
  for (const f of failures) console.error(`    ${f}`);
  console.error("\n    Update docs/intelligence-map.md, or the change that broke it.\n");
  process.exit(1);
}
console.log(`✓ ${passed} intelligence map assertions`);
