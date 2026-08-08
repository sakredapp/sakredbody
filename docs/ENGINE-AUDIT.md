# Habit & Routine Engine — audit

2026-08-08. Read of `server/coaching/enrollment.ts`, `server/coaching/routes.ts`,
`shared/utils/dates.ts`, against the failure modes reported from the first build
of the macro app.

Every defect below is real and reachable from the UI. They're ordered by how
badly they break the member's day.

---

## 1. "Today" is the server's today, not the member's — CRITICAL

`shared/utils/dates.ts` opens with:

> All dates must be in the user's local timezone.

That is true on the client and impossible on the server, where
`formatLocalDateString()` reads `date.getFullYear()` in the **process**
timezone. On Vercel that is UTC.

`/api/habits/today` computes `const today = formatLocalDateString()` server-side.
So for a member in Los Angeles, from 5pm local onwards, the server has already
rolled over to tomorrow:

| Member's clock (PDT) | Server (UTC) | Habits returned |
|---|---|---|
| Aug 8, 09:00 | Aug 8, 16:00 | Aug 8 ✅ |
| Aug 8, 16:59 | Aug 8, 23:59 | Aug 8 ✅ |
| **Aug 8, 17:00** | **Aug 9, 00:00** | **Aug 9 ❌** |
| Aug 8, 23:00 | Aug 9, 06:00 | Aug 9 ❌ |

**This is the reported "people can't click the habit they finished that day."**
From late afternoon onward the list silently becomes tomorrow's. The member
ticks something off, and the row they completed is tomorrow's row — so today
stays incomplete, the streak breaks, and the completion appears to vanish.

It also poisons `/api/habits/range`, `/api/habits/reconcile`, the enrollment's
default start date, and the streak.

The macro app solved this with `profiles.timezone`. **This app has no timezone
column at all.**

## 2. A future start date takes effect immediately — CRITICAL

`enrollInRoutine` hardcodes `status: "active"` and unconditionally pauses the
member's current routine before scheduling.

So "start next Monday" pauses what they're doing *today*, marks the new routine
active *today*, and schedules its first habit for Monday. Result: the member
has an active routine and an empty day, for as many days as they deferred.

There is no `scheduled` state anywhere in the codebase, despite
`userRoutineStatusEnum` implying a lifecycle.

## 3. A routine never ends — CRITICAL

Nothing anywhere sets `status = 'completed'`. There is no scheduler, no
end-of-routine check, no transition on read.

A 21-day protocol that finished in March is still `active` in August.
`/api/routines/active` keeps returning it, the dashboard keeps showing
"Day X of 21", and the member cannot start a new one cleanly.

**This is the reported "actually tracking… how long it was supposed to be, when
it was over."**

## 4. `end_date` is off by one

`const end = addDays(start, routine.durationDays)`.

A 21-day protocol starting Aug 1 schedules habits for days 1–21, i.e. Aug 1–21.
`end_date` is written as Aug 22 — a day on which nothing is scheduled. Every
"days remaining" calculation is one too many, and any end-of-routine logic built
on `end_date` fires a day late.

## 5. Pausing leaves every future habit in place — HIGH

`pauseRoutine` flips the status and stops. The materialised `habits` rows for
every remaining day are untouched, and `/api/habits/today` filters only on
`user_id` and `scheduled_date` — it never checks the enrollment's status.

**A paused routine keeps serving habits every single day as though nothing
happened.** Same for `abandonRoutine`.

## 6. There is no way to resume — HIGH

`/api/routines/pause` exists. There is no `/api/routines/resume`. Once paused,
the only path back is re-enrolling, which the idempotency key then rejects as a
duplicate (same user + routine + start date + intensity → same SHA-256), so the
member gets "Already enrolled" and no habits.

**Pause is a one-way door.**

## 7. There is no way to delete a habit — HIGH

No endpoint removes a habit series from an active routine.
`DELETE /api/catalog/assigned/:id` handles standalone habits only, and it
soft-deletes the *assignment* while leaving all 30 materialised `habits` rows
in place — so the habit the member just deleted keeps appearing daily.

`user_removed_habits` now exists in the database. Nothing writes to it.

## 8. Every `habits` insert can now throw — HIGH, self-inflicted

`uq_habits_user_title_date` was added yesterday to make duplicates impossible.
It does — but four insert sites were written assuming duplicates were merely
undesirable, and none of them handle a conflict:

| Site | Breaks when |
|---|---|
| `scheduleHabits` (enroll) | two templates share a title, or dates overlap an existing routine |
| `/api/catalog/assign` | assign → unassign → assign again |
| `/api/catalog/custom` | custom habit collides with a routine habit's title |
| `reconcileHabits` | guard checks `routine_habit_id`, not title |

Before the index these produced duplicate rows. Now they produce a 500.
**The constraint is right; the call sites need `ON CONFLICT DO NOTHING`.**

## 9. Nothing enforces one active routine

The single-active-routine rule is maintained by a `pause everything` UPDATE
before each insert. A concurrent double-submit, or any code path that misses the
pause, leaves two `active` rows.

`/api/routines/active`, `/api/coaching/stats` and `/api/habits/reconcile` all do
`SELECT … WHERE status='active'` with **no ORDER BY and no LIMIT**, then take
`[0]`. With two active rows the member gets an arbitrary one, and which one can
change between requests.

## 10. Rollback can resurrect the wrong routine

The enrollment failure path selects *any* paused routine
(`WHERE status='paused'`, no ordering, no limit) and re-activates it. A member
with three historical paused routines gets an arbitrary one turned back on.

## 11. `reconcileHabits` disagrees with `scheduleHabits`

`scheduleHabits` bounds a habit with `habit.dayEnd ?? durationDays`.
`reconcileHabits` uses `habit.dayEnd ?? daysBetween(endDate, startDate)`, which
is `durationDays` under the current off-by-one `end_date` and would become
`durationDays - 1` once that's fixed. Two implementations of one rule.

---

## Status — all fixed, 2026-08-08

| # | Defect | Fix |
|---|---|---|
| 1 | server timezone | `users.timezone` + `todayInZone()`; client posts its IANA zone on load |
| 2 | future start took effect now | `scheduled` status; materialises on its start day in `settleRoutines` |
| 3 | routine never ended | `settleRoutines` completes past `end_date`, called on every read path |
| 4 | `end_date` off by one | `start + duration - 1`; historic rows backfilled |
| 5 | pause left future rows | `clearFutureHabits` on pause and abandon |
| 6 | no resume | `POST /api/routines/resume`, shifting `end_date` by the days paused |
| 7 | no habit deletion | `DELETE /api/habits/series` + tombstone; restore endpoint too |
| 8 | inserts would 500 | `ON CONFLICT DO NOTHING` at all four sites |
| 9 | two active routines | partial unique indexes on `(user_id) WHERE status='active'` / `'scheduled'` |
| 10 | rollback resurrected wrong routine | most recently paused, ordered and limited |
| 11 | two day-window rules | one, in `shared/utils/schedule.ts`, covered by tests |

`npm test` — 49 assertions over the day boundary, routine window arithmetic and
the day-window rule. The timezone cases assert the reported failure directly:
at 2026-08-09 00:30 UTC the server has rolled over and a member in Los Angeles
has not.

---

## Fix order

1. Timezone — everything else is measured in days, so the day boundary has to be right first.
2. `ON CONFLICT DO NOTHING` on all four insert sites — currently a 500 in normal use.
3. Lifecycle: `scheduled` → `active` → `completed`, settled on read.
4. `end_date` off-by-one.
5. Pause/resume, with future rows cleared and restored.
6. Delete habit series, writing the tombstone.
7. Single-active-routine as a database constraint.
8. Collapse the two day-window implementations into one.
