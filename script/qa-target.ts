/**
 * Refusing to write synthetic data into somebody's real body record.
 *
 * ── What this is protecting ───────────────────────────────────────────────
 *
 * The QA harness seeds fixtures: invented workouts, invented health days,
 * invented Room posts. Every one of those is destructive in the specific sense
 * that matters here — not that it drops a table, but that it becomes
 * indistinguishable from a member's own record the moment it lands in the
 * wrong database. A member's Terrain is computed from those rows. Seeding
 * production would not look like an accident; it would look like the product
 * telling somebody something false about their own body.
 *
 * There is exactly one way this happens in practice: a harness that believes
 * it is running against QA, run by someone who set half the configuration.
 *
 * ── Fail closed, at four independent points ───────────────────────────────
 *
 * Every check below is sufficient on its own to refuse. None of them is a
 * fallback for another, and there is deliberately no path that resolves a
 * usable target from partial configuration:
 *
 *   1. an explicit opt-in flag, which nothing else sets;
 *   2. a variable name the application itself never reads, so the app's own
 *      connection string cannot be picked up by accident;
 *   3. the production project ref, refused by host;
 *   4. equality with whatever the application is configured to use.
 *
 * The fourth is the one that catches the realistic mistake. Someone copies the
 * connection string they already have into `.env.qa` because it is the one on
 * their clipboard. The ref check catches that for this project; the equality
 * check catches it for any project, including one nobody thought to name here.
 *
 * A fifth check lives at runtime rather than in configuration — see
 * `looksLikeRealMembers`. Configuration can be wrong in ways nobody predicted;
 * a database with real people in it is recognisable regardless.
 */

/** Public in CLAUDE.md, so naming it here reveals nothing. */
export const PRODUCTION_REF = "zcvanbozvtojmnyuzsjh";

/** The one variable the QA harness reads. The application never reads it. */
export const QA_URL_VAR = "SAKREDBODY_QA_DATABASE_URL";

/** Nothing sets this but a person who meant to. */
export const QA_OPT_IN_VAR = "SAKRED_QA";

/** Emails the fixtures own. Anything else in `users` is somebody real. */
export const QA_EMAIL_DOMAIN = "@sakred.local";

export type TargetVerdict = { ok: true; url: string } | { ok: false; reason: string };

export function resolveQaTarget(env: Record<string, string | undefined>): TargetVerdict {
  if (env[QA_OPT_IN_VAR] !== "1") {
    return { ok: false, reason: `${QA_OPT_IN_VAR} is not set to 1 — QA fixtures are opt-in` };
  }

  // Belt and braces. A harness has no business running under a production
  // NODE_ENV even if every other variable is right.
  if (env.NODE_ENV === "production") {
    return { ok: false, reason: "NODE_ENV=production" };
  }

  const url = env[QA_URL_VAR];
  if (!url) {
    // Deliberately not falling back to DATABASE_URL. A fallback is the whole
    // bug: it turns "QA is not configured" into "use whatever is configured",
    // and what is configured is production.
    return { ok: false, reason: `${QA_URL_VAR} is not set — and nothing is substituted for it` };
  }

  if (!/^postgres(ql)?:\/\//.test(url)) {
    return { ok: false, reason: `${QA_URL_VAR} is not a postgres URL` };
  }

  if (url.includes(PRODUCTION_REF)) {
    return { ok: false, reason: `${QA_URL_VAR} points at the production project` };
  }

  for (const appVar of ["DATABASE_URL", "SAKREDBODY_DATABASE_URL"]) {
    const configured = env[appVar];
    if (configured && sameTarget(configured, url)) {
      return { ok: false, reason: `${QA_URL_VAR} is the same database as ${appVar}` };
    }
  }

  return { ok: true, url };
}

/**
 * Same database, allowing for the ways one connection string is written twice.
 *
 * Credentials and query parameters differ between a pooled and a direct URL to
 * the same instance, so comparing whole strings would miss the case this
 * exists to catch. Host and database name are what identify the target.
 */
export function sameTarget(a: string, b: string): boolean {
  try {
    const pa = new URL(a);
    const pb = new URL(b);
    return pa.hostname === pb.hostname && pa.pathname === pb.pathname;
  } catch {
    // An unparseable string is not provably different, and this function is
    // only ever consulted to refuse.
    return a === b;
  }
}

/**
 * Does this database contain people?
 *
 * The last line, and the only one that does not depend on somebody having
 * configured something correctly. Fixtures own `@sakred.local`; a row outside
 * that domain is a real account, and finding one means the target is not what
 * the harness thinks it is no matter what the environment says.
 *
 * An empty database passes — that is the expected state of a fresh branch.
 */
export function looksLikeRealMembers(emails: string[]): boolean {
  return emails.some((e) => !e.toLowerCase().endsWith(QA_EMAIL_DOMAIN));
}

/** The single call a harness makes. Throws rather than returning a falsy value. */
export function requireQaTarget(env: Record<string, string | undefined>): string {
  const verdict = resolveQaTarget(env);
  if (!verdict.ok) {
    throw new Error(
      `Refusing to run QA fixtures: ${verdict.reason}.\n` +
        `  Set ${QA_OPT_IN_VAR}=1 and ${QA_URL_VAR} to the Supabase QA branch in .env.qa.\n` +
        `  Never point either at ${PRODUCTION_REF}.`,
    );
  }
  return verdict.url;
}
