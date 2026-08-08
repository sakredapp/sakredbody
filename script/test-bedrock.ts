/**
 * Live Bedrock smoke test.
 *
 * The one thing the unit tests cannot answer: does GLM-5, in practice, write
 * notes that survive the filter? A different model family has different habits,
 * and if it fails every time then every note is silently a fallback and the
 * feature quietly doesn't work.
 *
 * This makes real calls and costs real (trivial) money. It touches no database.
 *
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-west-2 \
 *     npx tsx script/test-bedrock.ts
 *
 * Or, if you have a profile configured:
 *   AWS_PROFILE=your-profile npx tsx script/test-bedrock.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { getModelClient } from "../server/daily/model.js";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  judge,
  anchorsFor,
  fallbackNote,
  type NoteContext,
} from "../server/daily/voice.js";
import { almanacFor } from "../shared/utils/almanac.js";

/**
 * Load a local .env if there is one.
 *
 * The credentials live in Vercel, which a terminal can't see, and Vercel marks
 * them sensitive so `vercel env pull` returns them empty. So the path of least
 * friction is a local .env — which is gitignored, and which nothing else in
 * this script writes to.
 *
 * Hand-rolled rather than adding a dependency: this is twelve lines and only
 * a test script needs it.
 */
function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return false;
  let loaded = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip one layer of matching quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // A real environment variable always wins over the file.
    if (value && process.env[key] === undefined) {
      process.env[key] = value;
      loaded++;
    }
  }
  return loaded > 0;
}

loadDotEnv();

const today = new Date().toISOString().slice(0, 10);

/** Four members with different amounts known about them. */
const SCENARIOS: { label: string; ctx: NoteContext }[] = [
  {
    label: "knows nothing — no chart, no protocol",
    ctx: { almanac: almanacFor(today) },
  },
  {
    label: "mid-protocol, full chart, masculine register",
    ctx: {
      almanac: almanacFor(today, {
        birthDate: "1988-03-22",
        birthName: "James Robert Hale",
        lifePathNumber: 7,
        sunSign: "Aries",
        moonSign: "Capricorn",
        risingSign: "Scorpio",
      }),
      firstName: "James",
      polarity: "masculine",
      protocol: { name: "Liver Support", dayNumber: 9, durationDays: 21, phase: "clear" },
      centre: { id: "gut", name: "Gut", aspect: "Terrain" },
      recentCompletion: { done: 31, total: 35 },
    },
  },
  {
    label: "behind on habits, feminine register, has set an intention",
    ctx: {
      almanac: almanacFor(today, {
        birthDate: "1993-11-02",
        birthName: "Amara Joy Okafor",
        lifePathNumber: 9,
        sunSign: "Scorpio",
      }),
      firstName: "Amara",
      polarity: "feminine",
      protocol: { name: "Full Gut Reset", dayNumber: 3, durationDays: 28, phase: "prepare" },
      centre: { id: "gut", name: "Gut", aspect: "Terrain" },
      intention: "Stop eating after 8pm",
      recentCompletion: { done: 9, total: 28 },
    },
  },
  {
    label: "name only, no protocol",
    ctx: {
      almanac: almanacFor(today, { birthName: "Lynn Marie Castellano" }),
      firstName: "Lynn",
      polarity: "balanced",
    },
  },
];

async function main() {
  const client = await getModelClient();

  if (!client) {
    console.log("\n✗ No model client.\n");
    console.log("  Set AWS credentials (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY,");
    console.log("  or AWS_PROFILE), or ANTHROPIC_API_KEY for the direct API.\n");
    console.log("  Every note would currently be the computed fallback:\n");
    const fb = fallbackNote(SCENARIOS[0].ctx);
    console.log(`    ${fb.headline}`);
    console.log(`    ${fb.body}\n`);
    process.exit(1);
  }

  console.log(`\nProvider : ${client.provider}`);
  console.log(`Model    : ${client.model}`);
  console.log(`Region   : ${process.env.AWS_REGION || "us-west-2"}`);
  console.log(`Date     : ${today}\n`);

  let accepted = 0;
  let rejected = 0;

  for (const { label, ctx } of SCENARIOS) {
    console.log("─".repeat(74));
    console.log(label.toUpperCase());

    const a = ctx.almanac;
    console.log(
      `  moon ${a.moon.phase}, ${a.elemental.season} (${a.elemental.element}), ` +
        `${a.elemental.organ}, universal day ${a.universalDay}` +
        (ctx.protocol ? `, day ${ctx.protocol.dayNumber}/${ctx.protocol.durationDays}` : ""),
    );
    console.log("");

    const anchors = anchorsFor(ctx);

    try {
      const started = Date.now();
      const { text } = await client.complete({
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(ctx) }],
        maxTokens: 600,
      });
      const ms = Date.now() - started;

      // Same parsing the generator uses.
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const raw = (fenced ? fenced[1] : text).trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");

      if (start === -1 || end === -1) {
        console.log("  ✗ not JSON. Raw output:");
        console.log(`    ${text.slice(0, 300)}`);
        rejected++;
        continue;
      }

      const parsed = JSON.parse(raw.slice(start, end + 1));
      const candidate = {
        headline: String(parsed.headline ?? "").trim(),
        body: String(parsed.body ?? "").trim(),
        invitation: parsed.invitation ? String(parsed.invitation).trim() : null,
      };

      console.log(`  ${candidate.headline}`);
      console.log("");
      console.log(`  ${candidate.body}`);
      if (candidate.invitation) console.log(`\n  → ${candidate.invitation}`);
      console.log("");

      const verdict = judge(candidate, anchors);
      const cited = anchors.filter((x) =>
        new Set(
          `${candidate.headline} ${candidate.body} ${candidate.invitation ?? ""}`
            .toLowerCase()
            .split(/[^a-z0-9]+/),
        ).has(x),
      );

      if (verdict.ok) {
        accepted++;
        console.log(`  ✓ passed  (${ms}ms, ${candidate.body.split(/\s+/).length} words)`);
        console.log(`    grounded in: ${cited.slice(0, 6).join(", ") || "—"}`);
      } else {
        rejected++;
        console.log(`  ✗ REJECTED (${ms}ms)`);
        for (const r of verdict.reasons) console.log(`    · ${r}`);
      }
    } catch (err) {
      rejected++;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ call failed: ${message}`);
      if (/AccessDenied|not authorized|don't have access/i.test(message)) {
        console.log("");
        console.log("    This usually means model access isn't enabled.");
        console.log("    Bedrock console → Model access → enable zai.glm-5 in this region.");
      }
    }
    console.log("");
  }

  console.log("─".repeat(74));
  console.log(`\n${accepted} passed the filter, ${rejected} did not.\n`);

  if (rejected > accepted) {
    console.log("More rejections than passes. The filter is doing its job, but if this");
    console.log("holds up, most notes will be falling back. Worth loosening a rule or");
    console.log("tightening the prompt — send me the output above.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
