# Sakred Body — Product Doctrine

The working brief for the app being built at `/Users/sakredbody22/sakredbody`.
This is not marketing copy. It's the decision record: what this product is, who
it serves, and what it refuses to be — so every build decision has an argument
behind it.

Last revised: 2026-08-12

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

That describes how it *looks*. What follows is how it talks, which is a
separate discipline and the one that has been got wrong more often.

### Who is being written to

A founder in his forties with a full day. Intelligent, busy, paying five
figures. He has never read a wellness book and would put one down if it started
talking like one. He wants to know what to do before lunch, and then he wants
to get on with his day.

He is not looking for a worldview. He already has one. The esoteric material in
§4 is real and it is why this app is worth what it costs — but it arrives as
*what to do today*, with the reasoning behind it, never as vocabulary he has to
learn first.

### The two registers this keeps falling into

Both are wrong, and they are opposites, which is why correcting one tends to
produce the other.

**The retreat.** The voice of someone who spent a month meditating in Ubud.
Warm, soft, unhurried, faintly reverent about ordinary things. It treats a walk
as a ritual and sleep as something you honour. It is not mysticism and it uses
no jargon, which is exactly why every earlier rule missed it — and it never
tells anyone to do anything. It describes a mood and leaves.

> "Honour what your body is asking for. Let today be lighter."

**The American.** Loud, congratulatory, sold. Exclamation marks, praise for
ordinary compliance, "let's go", "your best self". This brand is European and
understated. It does not cheer, and it does not congratulate a man for drinking
water.

> "Amazing work! You've got this — keep it up!"

**What is wanted instead** is closer to a good strength coach: direct, warm
enough, slightly blunt, never precious. Tells you what to do today and why, in
one line, and does not mind being brief.

> "You're short on steps. A ten-minute walk after lunch covers most of it."

### Banned outright

- `01 / 02 / 03` counters and step numbers
- "X without Y is Z" constructions
- explanatory subtitles under a section name (if the name needs a subtitle, the name is wrong)
- "Are you ready to…" questions
- stacked headers — one header per section
- three-clause slogans ("clear the terrain, build its capacity, live inside it consciously")
- the word "journey" in any user-facing string
- **maxims** — "Rest is not the absence of work, it is the other half of it."
  Every word is allowed and there is no reader anywhere in it. If a sentence
  would work on a poster with the brand name underneath, it is wrong here.
- **the body as a separate party** — "your body is asking for rest". State the
  condition: "you're short on recovery".
- **soft-focus vocabulary** — gently, nourish, honour, invite, ritual,
  intention, attune, presence, stillness, spacious, replenish, be kind to
  yourself, check in with yourself
- **exclamation marks**, anywhere, ever

### Wanted

- one word where a sentence was
- say "you"; subject, verb, object; one idea per sentence
- ordinary reference points — a ten-minute walk, a glass of water, bed half an
  hour earlier — not "a slower morning"
- British spelling: honour, colour, metres, practise as a verb
- approval, where any is warranted, as one dry clause and no adjective:
  "that's four days running, good". Most days warrant none.
- scale contrast — a hero should be much larger than a heading, which should be much larger than body
- gold reserved for the eyebrow and exactly one word in a headline
- hairline rules instead of boxes
- photography that is actually visible, not a 4%-opacity ghost under a scrim

### Where this is enforced

Not doctrine alone — `server/daily/voice.ts` turns the list above into
`judge()`, a deterministic filter every generated note has to survive, with the
banned phrases, the maxim patterns and the exclamation-mark rule as code.
`script/test-voice.ts` tests it against the copy it exists to stop, including
one example of each register above. Changing this section means changing both.

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
5. **Store listings.** `com.sakredbody.app` is submitted to both stores and in
   review. Until each one is approved, `APP_STORE_URL` and `PLAY_STORE_URL` in
   `client/src/lib/links.ts` are `null` and the site's download buttons read
   "soon". They previously pointed at **Sakred Health** — a different product
   under §1 — so restoring them means the real Sakred Body URLs and nothing
   else. The two stores approve independently; expect to fill them in one at a
   time.

### Shipped since this list was written

**Native app — done.** Capacitor 8, iOS and Android, both from this repo.
The client is bundled into the shell rather than loaded over the network
(`webDir: dist/public`, no `server.url`), which is what keeps it from reading
as a repackaged website under Apple's guideline 4.2 and is why it has an
offline mode at all. Consequences that follow and are handled: the WebView
origin is `capacitor://localhost`, so `/api` is cross-origin, CORS carries an
allowlist, and native auth is a bearer token rather than the `sameSite: "lax"`
session cookie, which WebKit would drop regardless.

**Health sync — done.** A first-party Capacitor plugin, `plugins/health-sync`,
reading HealthKit on iOS and Health Connect on Android, with a background
worker. The Android manifest strips the 28 permissions the plugin merges in but
the app never uses; see `docs/play-health-declaration.md` for why that is a
release requirement rather than tidying.

**Home-screen widgets — done**, both platforms, fed from the last sync through
an App Group on iOS and `SharedPreferences` on Android.

Note the §9 non-goal about a webview wrapper. It is not violated: what shipped
is a bundled native shell around the same React client, with native HealthKit
and Health Connect plugins and native widgets underneath it. The line that
matters is the one in §9 — no shell that merely loads the live site — and that
is the exact thing `capacitor.config.ts` is written to prevent.

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

---

## 10. The model

Daily notes are generated on **AWS Bedrock** via the **Converse API**, not a
vendor SDK. The model is `zai.glm-5` (Z.AI, serverless, us-west-2).

Converse rather than a vendor SDK because GLM-5 is not an Anthropic model, and
Converse is the one Bedrock interface that speaks to every provider with the
same message shape. Changing model is then `SAKRED_DAILY_MODEL`, not a rewrite.

Bedrock rather than a direct API because it is what the business already runs
on, it can sit under a BAA — which matters when the surrounding business is
health and insurance — and serverless GLM-5 is Haiku-priced for Sonnet-class
output.

| Variable | Purpose |
|---|---|
| `SAKRED_DAILY_MODEL` | Bedrock model id or inference-profile ARN. Defaults to `zai.glm-5`. |
| `AWS_REGION` | Defaults to `us-west-2`. |
| `SAKRED_MODEL_PROVIDER` | `bedrock` \| `anthropic` \| `auto` (default). |
| `ANTHROPIC_API_KEY` | Local development only, when there are no AWS credentials. |

With nothing configured, every note is the computed fallback — terse and true,
never an error.

### Why a note is allowed to exist

The filter in `server/daily/voice.ts` has three layers, and only the third is
about meaning:

1. **Banned phrases** — the house style list from §5, plus wellness filler.
2. **Shape** — length caps, no question headlines, no step numbers. The failure
   mode of generated mysticism is volume, so the caps do most of the work.
3. **Groundedness** — the note must cite at least one fact it was given: the
   moon, the season, the organ, the protocol day, one of their numbers.

The third is the one that matters. "Embrace the cosmic release" fails on
vocabulary, but "honour what is shifting" and "today asks you to slow down"
pass every word rule and still mean nothing — because they refer to nothing
that is true today. A member reads them and learns nothing.

Grounding is checkable exactly because we compute the inputs ourselves. The
form every note must take:

    the fact → what it means for today's effort
