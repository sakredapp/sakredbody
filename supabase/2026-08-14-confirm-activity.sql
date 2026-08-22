/*
 * Confirm Activity — the member's own account of an imported session.
 *
 * ── Additive to the table that already had a member section ───────────────
 *
 * health_workouts already carried `user_response` and
 * `user_orientation_override`, with the invariant that matters already
 * enforced: an override changes where a session is shown and never what it
 * cost, because terrain and load read CATEGORY_LOAD through the activity's
 * category and never look at those columns. The sync upsert names its columns
 * explicitly so a re-sync cannot overwrite them, and a test pins that.
 *
 * A separate annotations table would have been a second member-annotation
 * system beside the one already here — two places to look for what somebody
 * said, two things to exclude from the upsert, and two chances to disagree.
 * Three columns were genuinely missing; these are them.
 *
 *   user_focus    chest | back | legs | … — the one thing no watch knows
 *   user_label    their own name for it, "Back day". Typed, never generated
 *   reviewed_at   looked at, whether or not anything was added
 *
 * `reviewed_at` is separate from the answers on purpose. "Reviewed and had
 * nothing to add" and "never asked" are different states, and only the second
 * is worth prompting about again — without it the confirmation card has no way
 * to stop asking, which is how this becomes a feed of twenty cards about
 * walks.
 *
 * Applied 2026-08-14 through the Management API and verified in
 * information_schema afterwards.
 */

alter table health_workouts
  add column if not exists user_focus text,
  add column if not exists user_label text,
  add column if not exists reviewed_at timestamp;
