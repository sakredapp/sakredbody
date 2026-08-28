/**
 * Which tables are deliberately unreachable by anybody but the server.
 *
 * ── The posture ──────────────────────────────────────────────────────────
 *
 * Everything in this product reaches Postgres one way: through Express, over a
 * direct `pg.Pool`, as the database owner. There is no browser Supabase client
 * anywhere in `client/` — the only `createClient` calls in the tree are
 * server-side with the service-role key, for object storage. Authorization is
 * decided in Express middleware against this product's own `users` table.
 *
 * Supabase nonetheless grants `anon` and `authenticated` full DML on every
 * table in `public`, and exposes them over a REST endpoint keyed by a value
 * that is public by design. So row-level security is not decoration here; it
 * is the only thing between that endpoint and the data, and the application
 * never notices what it says because owners bypass it.
 *
 * ── Why a list, and why in the repository ────────────────────────────────
 *
 * A table with row security enabled and zero policies denies everyone. That is
 * the correct answer for a table only the server should ever touch, and it is
 * indistinguishable — in the catalogue, in the dashboard, in a review — from
 * somebody having enabled RLS and forgotten to write the policies. One of
 * those is a decision and the other is a half-finished job.
 *
 * So the decision is written down. `script/test-rls-posture.ts` compares this
 * list against what the database actually holds, and fails on either
 * direction: a table that stops being denied, and a table that starts being
 * denied without anybody saying so.
 *
 * ── Why not just write policies ──────────────────────────────────────────
 *
 * There is no client identity to write one against. `auth.uid()` is a
 * Supabase-auth concept; this product's members are rows in its own `users`
 * table, authenticated by an Express session or a bearer token that Postgres
 * never sees. A policy phrased in terms of an identity that never arrives
 * either denies everything — which enabling RLS already does, honestly and
 * without pretending — or is loose enough to allow everything, which is worse
 * than no policy because it reads as protection.
 *
 * If a browser Supabase client is ever introduced, this list is the work item:
 * each of these needs a real owner-scoped policy before that client can read
 * anything, and the test below is what will say so.
 */

/**
 * Server-only. Row security enabled, no policies, nothing but the owner gets
 * through. Grouped by why.
 */
export const SERVER_ONLY_TABLES = [
  // Credentials and delivery tokens. Nothing outside the server has any
  // business reading these under any identity.
  "auth_tokens",
  "email_verification_tokens",
  "password_reset_tokens",
  "push_tokens",

  // Coaching. Who works with whom, what was said, what was planned, and what
  // was asked for — the whole relationship, which is private on both sides.
  //
  // `coaching_messages` reached this list the hard way: it carried three
  // unconditional policies — select, insert and update, all `USING (true)` for
  // `public` — so anyone with the anon key could read the thread, post into
  // it, and edit it. See supabase/2026-08-28-rls-posture.sql.
  "coach_relationships",
  "coaching_attachments",
  "coaching_checkin_requests",
  "coaching_messages",
  "coaching_plan_items",
  "coaching_plans",

  // Health. Imported from Apple Health and Health Connect, and the most
  // sensitive thing this product holds. `health_days`, `health_workouts` and
  // `health_connections` were readable by `anon` until 2026-08-28 — see
  // supabase/2026-08-28-rls-posture.sql.
  "health_connections",
  "health_days",
  "health_workouts",

  // Media. The rows behind private photographs; the objects themselves are in
  // a bucket with its own rules. See server/media/store.ts.
  "media_assets",
  "media_variants",
  "progress_photos",

  // Goals, and the trail of how a target moved.
  "goal_progress",
  "goal_target_revisions",
  "member_goals",
  "recommendation_goals",

  // A member's own training templates.
  "member_workout_exercises",
  "member_workouts",

  // Telemetry a member never reads, and messages addressed to one person.
  "notifications",
  "recommendation_events",
  "recommendation_feedback",
  "support_requests",
] as const;

/**
 * What `anon` and `authenticated` may select from any table in `public`.
 *
 * Zero. Every table has row security enabled; the ones above have no policies
 * at all, and the rest have policies written against a Supabase identity that
 * this product never issues. The number is asserted rather than assumed —
 * see script/qa-rls.ts, which asks as those roles rather than reading the
 * catalogue and inferring.
 */
export const PUBLIC_ROLES = ["anon", "authenticated"] as const;

/**
 * The two exceptions, and why each is one.
 *
 * Neither is personal, and neither is anybody's. They are reference data — the
 * same rows for every reader — and a policy that lets a role read them exposes
 * nothing about a member. They are listed rather than tolerated so that the
 * next table to appear here has to be argued for, and so a reading of "anon
 * can see two tables" is a fact somebody decided rather than a number nobody
 * noticed.
 *
 * If either ever grows a per-member column, it stops belonging here.
 */
export const PUBLICLY_READABLE: readonly {
  table: string;
  roles: readonly string[];
  why: string;
}[] = [
  {
    table: "membership_tiers",
    roles: ["anon", "authenticated"],
    why: "The tier list. The same three rows the marketing site names out loud.",
  },
  {
    table: "exercises",
    roles: ["authenticated"],
    why:
      "The movement catalogue — 666 admin-authored rows, the same for everyone. " +
      "Its policy is scoped to is_active, so a retired movement is not served.",
  },
];
