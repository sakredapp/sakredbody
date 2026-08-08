/**
 * Auth — the two functions where a mistake is silent and total.
 *
 * There were no tests on this file at all, which is how it shipped with a
 * password verifier that killed the process when handed a hash it didn't
 * recognise. That crash is the first case below: before the fix, this suite
 * did not report a failure, it took the test runner down with it.
 *
 * Everything here is pure — no database, no session, no network.
 *
 * Run: tsx script/test-auth.ts
 */

import { hashPassword, verifyPassword } from "../server/auth/password.js";
import { THROTTLE } from "../shared/models/security.js";

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

async function main() {
  console.log("\nA hash we don't recognise is a failed login, not an outage\n");

  // Each of these used to reach Buffer.from(undefined) or timingSafeEqual
  // with mismatched lengths, both of which throw from inside scrypt's
  // callback — where no try/catch in the route can reach them.
  const malformed: Array<[string, string]> = [
    ["empty string", ""],
    ["no separator", "justsomething"],
    ["bcrypt hash", "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"],
    ["salt but no key", "abc123:"],
    ["key but no salt", ":deadbeef"],
    ["non-hex key of the right length", "abc:" + "z".repeat(128)],
    ["hex key of the wrong length", "abc:" + "ab".repeat(16)],
    ["only a colon", ":"],
    ["null-ish text", "null"],
  ];

  for (const [label, stored] of malformed) {
    let threw: string | null = null;
    let result: boolean | null = null;
    try {
      result = await verifyPassword("whatever", stored);
    } catch (err) {
      threw = err instanceof Error ? err.message : String(err);
    }
    check(`${label} → false, no throw`, threw === null && result === false, threw ?? `returned ${result}`);
  }

  console.log("\nA real hash still works\n");

  const hash = await hashPassword("correct horse battery staple");
  check("round-trips", await verifyPassword("correct horse battery staple", hash) === true);
  check("wrong password is false", await verifyPassword("Correct horse battery staple", hash) === false);
  check("empty password is false", await verifyPassword("", hash) === false);
  check("shape is salt:key", /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash), hash.slice(0, 20));

  // Same password twice must not produce the same stored value, or the hash
  // column tells an attacker which members share a password.
  const again = await hashPassword("correct horse battery staple");
  check("salted per call", hash !== again);
  check("both verify", await verifyPassword("correct horse battery staple", again) === true);

  console.log("\nA long passphrase is not silently truncated\n");

  const long = "a".repeat(500) + "-tail";
  const longHash = await hashPassword(long);
  check("500+ chars round-trips", await verifyPassword(long, longHash) === true);
  check(
    "differs only in the tail → false",
    await verifyPassword("a".repeat(500) + "-tale", longHash) === false,
  );

  console.log("\nThrottle limits are sane\n");

  check("an email gets fewer tries than an IP", THROTTLE.emailMax < THROTTLE.ipMax);
  check("more than one try allowed", THROTTLE.emailMax > 1);
  check("few enough to stop guessing", THROTTLE.emailMax <= 10);
  check("the window is long enough to be a window", THROTTLE.windowMs >= 60_000);
  check("a lockout ends on its own", THROTTLE.lockMs > 0 && THROTTLE.lockMs <= 60 * 60 * 1000);

  console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
