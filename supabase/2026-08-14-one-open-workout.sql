/*
 * One open workout per member, as a fact rather than a convention.
 *
 * Nothing enforced this and it had already happened: five unfinished sessions
 * across two accounts. Because the open-session route returns the newest, an
 * older one becomes unreachable the moment a newer starts — never finishable,
 * never reaching movementEvents, and invisible to every reading built on the
 * member's history.
 *
 * Applied 2026-08-14 through the Management API and verified afterwards:
 * 0 rows with finished_at null, and the index present in pg_indexes. Recorded
 * here so the schema is reproducible from the repository rather than only
 * existing in the database.
 *
 * The repair, by evidence rather than by guess:
 *   - four sessions held no sets at all and were closed at their created_at
 *   - one held two sets of Standing Chest Press and was closed at the
 *     timestamp of its own last set, so the training it contains becomes
 *     history instead of staying invisible
 *
 * Nothing was deleted. Closing a session preserves it; deleting it would have
 * thrown away somebody's training to tidy a table.
 */

update workout_sessions ws
set finished_at = ws.created_at
where ws.finished_at is null
  and not exists (select 1 from workout_sets s where s.session_id = ws.id);

update workout_sessions ws
set finished_at = (select max(s.created_at) from workout_sets s where s.session_id = ws.id)
where ws.finished_at is null
  and exists (select 1 from workout_sets s where s.session_id = ws.id);

create unique index if not exists uniq_open_workout_per_member
  on workout_sessions (user_id)
  where finished_at is null;
