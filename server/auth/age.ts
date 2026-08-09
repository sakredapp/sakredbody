/**
 * The age gate.
 *
 * In its own file for the same reason `password.ts` is: importing
 * `auth/routes.ts` pulls in the database, so anything left in there cannot be
 * tested without one — which is exactly how the password verifier shipped
 * untested and took the process down. This is pure, and script/test-auth.ts
 * exercises the boundaries.
 *
 * Why it exists: the App Store questionnaire ties Social Media,
 * User-Generated Content and Age Assurance together. The community channels
 * make the first two true, so this makes the third true rather than leaving a
 * declaration the product cannot support. It runs on the server because a
 * check in the browser is a suggestion.
 */

export const MINIMUM_AGE = 18;

/**
 * Whole years elapsed — not a year subtraction.
 *
 * `2026 - 2008 = 18` is true in January 2026 for someone born in December
 * 2008, and that person is seventeen. Comparing only the year leaks the gate
 * for up to a year per member, and it leaks silently: nobody reports being
 * let in.
 *
 * Everything is computed in UTC so the answer doesn't depend on where the
 * server happens to be running. A date in the future is a broken form rather
 * than a very young person, and is refused.
 */
export function isAdult(value: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const dob = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return false;

  // `new Date("2026-02-31")` rolls forward to March rather than throwing, so
  // the round-trip is what actually rejects an impossible date.
  if (dob.toISOString().slice(0, 10) !== value) return false;

  if (dob.getTime() > now.getTime()) return false;

  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age >= MINIMUM_AGE;
}
