/**
 * Password hashing and verification.
 *
 * Its own module, with no database import, for two reasons. The obvious one
 * is that it can then be tested without a connection string — when this lived
 * in `routes.ts`, importing it started a Postgres pool, so the natural thing
 * to do was not test it, and it went untested. The better one is that these
 * are the only functions here where being wrong is silent and total: a
 * verifier that returns true too easily lets anyone in, and one that throws
 * takes the whole server down. That deserves a file you can reason about
 * without reading anything else.
 *
 * ── On scrypt ─────────────────────────────────────────────────────────────
 *
 * Kept rather than swapped for argon2id. scrypt is memory-hard, it is in
 * Node's standard library, and the only real account's hash is already in
 * this format — changing algorithms would mean either a rehash-on-next-login
 * migration or locking that account out. Node's defaults (N=16384, r=8, p=1)
 * are the weak part and worth revisiting; that is a separate change.
 */

import crypto from "crypto";

/** Bytes of derived key. Also the length every stored hash must decode to. */
export const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, KEY_LEN, (err, derivedKey) => {
      // `return` on the error path. Without it this fell through and called
      // resolve() with an undefined key immediately after rejecting.
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Check a password against a stored hash.
 *
 * ── The crash this used to be ─────────────────────────────────────────────
 *
 * The previous version passed whatever `stored.split(":")` produced straight
 * to `Buffer.from(key, "hex")` and then to `timingSafeEqual`. Given a stored
 * value that isn't `salt:key` — a legacy bcrypt hash, an imported row, a
 * seeded account, anything — `key` is `undefined`, `Buffer.from` throws, and
 * because that throw happens inside scrypt's *callback* rather than the
 * Promise executor, no `.catch()` and no route-level `try/catch` can see it.
 * It surfaces as an `uncaughtException` and takes the process down. Verified
 * against that exact function with a bcrypt-shaped string: the process died
 * rather than returning false.
 *
 * Today only one account has a password and its hash is well-formed, so this
 * was latent rather than live. It would have gone live the first time an
 * account was imported or seeded with a hash in another format — precisely
 * the sort of thing done in a hurry, in production.
 *
 * So the format is checked before anything can throw, and a hash we don't
 * recognise is a failed login rather than an outage.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;

  // Buffer.from(…, "hex") does not throw on invalid hex — it stops at the
  // first bad character and returns a short buffer. So the length check has
  // to come after the conversion, not before it; checking `key.length` alone
  // would still let a 128-character non-hex string through to
  // timingSafeEqual, which throws on a length mismatch.
  const expected = Buffer.from(key, "hex");
  if (expected.length !== KEY_LEN) return false;

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, KEY_LEN, (err, derivedKey) => {
      if (err) return resolve(false);
      resolve(crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

/**
 * Burn roughly the time a real verification takes.
 *
 * Without this, "no such account" returns in about a millisecond and "wrong
 * password" returns in about a hundred, so anyone can sort a list of email
 * addresses into members and non-members by watching the clock. For a private
 * membership whose value is partly discretion, confirming who is a client is
 * itself the leak, independent of any password.
 */
export async function burnTime(password: string): Promise<void> {
  await new Promise<void>((resolve) => {
    crypto.scrypt(password, "decoy-salt-not-a-real-account", KEY_LEN, () => resolve());
  });
}
