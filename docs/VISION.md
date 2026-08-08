# Sakred Body — Product Doctrine

The working brief for the app being built at `/Users/sakredbody22/sakredbody`.
This is not marketing copy. It's the decision record: what this product is, who
it serves, and what it refuses to be — so every build decision has an argument
behind it.

Last revised: 2026-08-08

---

## 1. Two apps, one business

There are two products and they are deliberately not the same product.

| | **Sakred Health** (`sakredportal`) | **Sakred Body** (this repo) |
|---|---|---|
| Audience | everybody | high-net-worth individuals, founders, executives |
| Price | free / low-tier subscription | $2,000 – $10,000 engagements |
| Posture | professional, macro, defensible | specialised, opinionated, ours |
| Content | what the field broadly accepts | what **we** believe |
| Depth | the overview | the nitty-gritty |
| Coaching | none | the centre of the product |
| Stack | Expo (iOS/Android/web from one codebase) | Vite + React + Express + Supabase |

**Why the split exists.** You cannot build one app for everyone and also build
an app for a client paying five figures. The macro app has to stay legible to a
stranger who found it in the App Store. This one is allowed to assume a coach in
the room. That assumption is the entire product.

The concrete example that settles every borderline call: my partner does not
believe in cancer as a discrete thing — he holds that everything is energy, and
that how energy moves through the body is what heals it or doesn't. **That belief
does not belong in the macro app.** Without a coach explaining it, a stranger
reads it and leaves. **It belongs here**, because here there is always a coach,
and the coaching is what makes it land.

So the filter is not "is this true." It's: **does this land without a coach?**
If yes → it can live in either app. If no → it lives here, and only here.

---

## 2. What this app is

A daily instrument for a small number of people who are paying a lot for
attention.

Four things happen inside it:

1. **Practice** — protocols and habits, tracked daily. The engine.
2. **Supply** — the products a protocol actually requires, sourced. Ours is
   called **The Apothecary**.
3. **Study** — guides, ebooks, masterclasses. Paired to protocols, not floating.
4. **Gather** — retreats, masterminds, cohorts. Booked in-app.

And running underneath all four: **direct coaching**. Not a support inbox — the
thread is the product. A member should never be more than one screen from their
coach.

---

## 3. The four territories

The site already commits to these. The app inherits them.

```
RESTORE  →  BUILD  →  EMBODY  →  GATHER
 clear      capacity   daily      together
```

- **RESTORE** — drainage, detox, terrain. Protocols live here.
- **BUILD** — strength, capacity, the masculine half of the duality. Not monk mode.
- **EMBODY** — the daily practice. Habits, streaks, the body map.
- **GATHER** — retreats, masterminds, cohorts, the room.

Every feature should be placeable in one of the four. If it isn't, it probably
doesn't belong.

---

## 4. The esoteric layer

This is the part the macro app cannot have, and therefore the part that makes
this app worth what it costs.

- **Energy centres.** The body read as regions and flows, not organs and labs.
  Protocols and habits map onto them.
- **The terrain.** Nine stages, a closed loop — elimination feeds back into
  digestion. Already built on the site as `TerrainWheel`.
- **Cosmology.** Astrology and numerology as *timing and disposition*, not
  fortune-telling. Billionaires already use this; it is a vibe that is genuinely
  there, and it sits comfortably next to a luxury retreat.
- **Duality.** Traditional principle plus physical strength. Eastern reading of
  the body plus a barbell. The whole brand is the refusal to pick one.

**Guardrail.** The esoteric layer is *interpretive*, never a medical claim and
never a substitute for care. It explains what a member is doing and why it is
sequenced that way. It does not diagnose and it does not promise outcomes.

---

## 5. Voice

Radical minimalism. The aesthetic is old-money — south of France, eastern
philosophy, luxury and tropical — crossed with antique astronomy. Gilt on ink.

**Banned outright:**

- `01 / 02 / 03` counters and step numbers
- "X without Y is Z" constructions
- explanatory subtitles under a section name (if the name needs a subtitle, the name is wrong)
- "Are you ready to…" questions
- stacked headers — one header per section
- three-clause slogans ("clear the terrain, build its capacity, live inside it consciously")
- the word "journey" in any user-facing string

**Wanted:**

- one word where a sentence was
- scale contrast — a hero should be much larger than a heading, which should be much larger than body
- gold reserved for the eyebrow and exactly one word in a headline
- hairline rules instead of boxes
- photography that is actually visible, not a 4%-opacity ghost under a scrim

---

## 6. What is already built (2026-08-08)

**Practice engine — done.**
`wellness_routines`, `routine_habits`, `habit_routine_assignments`,
`user_routines`, `habits`, `user_assigned_habits`, `rewards`.
Enrollment materialises every habit row up front (`server/coaching/enrollment.ts`),
which is why this app needs no hourly cron — a genuine improvement on the macro app.

**Coaching thread — done.** `coaching_messages`, member ↔ coach, with progress
attachments.

**Masterclass — done.** Categories, videos, per-user subscriptions.

**Gather — partly done.** `retreats`, `properties`, `booking_requests`,
`partners`, `partner_services`. Booking requests work; masterminds as a cohort
product do not exist yet.

**Sakred Executive — done except pricing.** 34-question application, server-side
scoring, admin review queue.

**The Apothecary — done.** `products`, `product_links`, `habit_products`,
`routine_products`, `user_shop_checkoffs`. Supply list staged prepare → clear →
rebuild; full shelf with search; admin editor with buy links and protocol
attachment.

**The Library — done.** `ebooks`, `ebook_sections`, `ebook_entitlements`,
`ebook_progress`. Access is an entitlement row. The reader hands off to the
paired protocol from the last chapter.

**The Body Map — done.** `energy_centres` (nine seeded), `centre_habits`,
`centre_routines`, `user_centre_readings`, `user_cosmology`. Readings are
append-only so a coach sees movement rather than a snapshot.

**Masterminds — done.** `cohorts`, `cohort_members`, `cohort_sessions`,
`cohort_attendance`. Schedule visible only to confirmed members.

## 7. What is missing

1. **Admin surfaces for Library, Body Map and Masterminds.** The APIs are
   complete and the member UIs are built; only the Apothecary has an admin
   screen so far. Everything else is currently seeded or curl'd.
2. **Habit removal tombstones in the app layer.** `user_removed_habits` exists
   in SQL; nothing writes to it yet, because nothing regenerates habits after
   enrollment. It matters the moment a top-up job is added.
3. **Payment.** Nothing anywhere takes money. Prices are display-only.
4. **Pricing figures** for Sakred Executive and the masterminds.
5. **Native app.** The member portal is still web-only.

## 8. Defects inherited from the macro app — do not copy forward

Carried over from the teardown of `sakredportal`, with the local status:

| Defect | Status here |
|---|---|
| `habits` has no uniqueness constraint; dedup done in app code | **fixed** — `supabase/habit-integrity.sql` |
| `habits.user_routine_id` has no FK, orphans silently | **fixed** — `ON DELETE CASCADE` |
| Coin award guarded only by in-memory `Set`; restart re-awards | **fixed** — `rewards.habit_id` + partial unique index; balance moves only when a ledger row inserts |
| `day_start` stored as TEXT | **fixed** — integer here |
| `user_routines.current_day` stored but never incremented | **avoided** — not stored here; computed from `start_date` |
| Two disagreeing sources of habit↔routine truth | **fixed** — `fetchFilteredHabits` merges both and dedups by id |
| Generation runs past `end_date` | **avoided** — no cron; materialised once at enroll |
| Content tables writable by any authenticated user | **must verify** in `supabase/rls-policies.sql` |
| `tasks` legacy fallback table | **avoided** — never existed here |

---

## 9. Non-goals

- No insurance, no CRM, no `healthcare_clients`. That is the other business.
- No free tier that dilutes the coaching. Membership is the floor.
- No webview wrapper if this becomes a native app. Native design or nothing.
- No feature that only makes sense at ten thousand users. This app is for tens.
