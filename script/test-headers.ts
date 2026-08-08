/**
 * The security policy is written twice. This makes sure it stays one policy.
 *
 * Express handles only `/api/*` in production — Vercel's CDN serves every HTML
 * document and static asset without ever invoking the function. So the policy
 * has to be declared in `vercel.json` as well, and `vercel.json` is JSON and
 * cannot import a TypeScript constant.
 *
 * That is exactly the shape of the worst bug found in this codebase: a rule
 * written in more than one place, where the copies drifted and the weaker one
 * was the one that mattered. The duplication here is forced by the platform,
 * so instead of pretending otherwise, this fails the build the moment the two
 * disagree.
 *
 * Run: tsx script/test-headers.ts
 */

import { readFileSync } from "fs";
import { CSP } from "../server/security/headers.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

interface VercelHeader {
  key: string;
  value: string;
}
interface VercelConfig {
  headers?: Array<{ source: string; headers: VercelHeader[] }>;
}

console.log("\nThe policy Express sends and the policy Vercel sends are the same policy\n");

const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;
const rule = config.headers?.find((h) => h.source === "/(.*)");

check("vercel.json has a header rule covering every path", !!rule);

const byKey = new Map((rule?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));

const vercelCsp = byKey.get("content-security-policy");
check("vercel.json declares a CSP", !!vercelCsp);
check(
  "it is character-for-character the one in server/security/headers.ts",
  vercelCsp === CSP,
  vercelCsp === CSP ? undefined : `\n     express: ${CSP}\n     vercel:  ${vercelCsp}`,
);

// The headers whose entire job is to protect the *document*. If one of these
// is only ever sent by Express, it is not protecting anything a browser
// renders, because Express never serves the document.
for (const [key, expected] of [
  ["x-frame-options", "DENY"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
] as const) {
  check(`vercel.json sends ${key}`, byKey.get(key) === expected, byKey.get(key));
}

console.log("\nThe policy itself still says the things that make it worth having\n");

check("scripts are restricted to our own origin", CSP.includes("script-src 'self'"));
check("no 'unsafe-inline' in script-src", !/script-src[^;]*unsafe-inline/.test(CSP));
check("no 'unsafe-eval' anywhere", !CSP.includes("unsafe-eval"));
check("the page cannot be framed", CSP.includes("frame-ancestors 'none'"));
check("forms cannot be repointed off-site", CSP.includes("form-action 'self'"));
check("no plugin content", CSP.includes("object-src 'none'"));
check("there is a default to fall back to", CSP.includes("default-src 'self'"));

// The one deliberate relaxation. If this ever disappears, either Framer
// Motion and Radix stopped writing inline styles — in which case, good — or
// somebody tightened the policy without checking, and every animation and
// every dropdown in the app is now broken.
check(
  "style-src still allows inline (Framer Motion and Radix need it)",
  /style-src[^;]*'unsafe-inline'/.test(CSP),
);

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
