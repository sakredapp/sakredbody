# The Sakred Body brain, as it executes

Written from what ran, not from what the code looks like. The endpoint list
below is the set a real member's app actually called during the walkthrough
drives — read out of the QA server's request log — and every claim about a
model was checked by following imports from the surface inward rather than by
grepping for words that sound intelligent.

The short version, because it is the answer to the question that was asked:

> **No member-facing surface in Sakred Body calls a language model today.**
> Every adaptive thing a member sees is deterministic. The model layer exists,
> is correct, and is reachable only from a cron and an admin route.

That is a fact about this release, not a recommendation.

## What a member's app asked for

Distinct API calls observed across ten member sessions, most-called first,
with ids collapsed:

    /api/auth/user            /api/community/channels/:id   /api/health/summary
    /api/training/sessions/open                             /api/notifications
    /api/health/workouts/confirm      /api/terrain/today    /api/coaching/plan
    /api/coaching/my-coach    /api/offerings                /api/library/ebooks
    /api/health/status        /api/habits/tracked           /api/energy/cosmology
    /api/training/today       /api/booking-requests/me      /api/training/sessions
    /api/apothecary/guidance-links    /api/training/memory  /api/today
    /api/terrain/checkin      /api/rhythm                   /api/progress-photos
    /api/habits/proposals     /api/training/exercises       /api/community/blocks

`/api/daily` is **not** in that list, in any session. It is the only route in
the product that can produce model-written language.

## Where the intelligence actually is

### Deterministic — everything a member sees

| Surface | Endpoint | What produces it |
|---|---|---|
| Terrain reading on Home | `/api/terrain/today` | `server/terrain/read.ts` over measured rows; every reason carries a `source` (`measured`, and its siblings) so provenance is already in the payload |
| Today's direction | `/api/today` | `server/today/routes.ts` |
| Today's Build | `/api/training/today` | `server/training/routes.ts` |
| Rhythm | `/api/rhythm` | `server/today/routes.ts` |
| Habit proposals | `/api/habits/proposals` | `server/habits/routes.ts` — the Habit Decision Logic: terrain conflicts, scaling, state overrides, replacement rules |

None of these files imports anything under `server/daily/`. The chain from each
of them to a model is not long — it does not exist.

### Model-backed — one route, off the member path

    /api/daily                 → getDailyNoteFast      never calls a model
    /api/cron/daily-notes      → getOrCreateDailyNote  calls the model
    /api/admin/daily/notes/:id/regenerate              calls the model

`getDailyNoteFast` returns a stored note if one exists and a deterministic
placeholder if not. The comment above it says it "never blocks on the model",
and that is what it does: the member request path cannot reach `generate`.

`DailyRitual` — the component that reads `/api/daily` — is mounted in
`CoachingDashboard`, not in the member dashboard. That is why the route never
appears in a member's session.

### The provider, and what it is not

    server/daily/model.ts      the only file in the repo that mentions Bedrock
    imported by               server/daily/generate.ts, and nothing else
    provider                  AWS Bedrock, Converse API
    model                     zai.glm-5   (SAKRED_DAILY_MODEL overrides)
    region                    us-west-2   (AWS_REGION overrides)
    gate                      an explicit AWS credential must be present;
                              otherwise `getModelClient` returns null
    fallback                  `fallbackNote(ctx)` — deterministic, and recorded
                              as `source: "fallback"` beside `source: "model"`

The generator already distinguishes what wrote a note and which model did it.
That is the seed of provenance the learning layer needs, and it is currently
recorded for one kind of output only.

### Static copy

The walkthrough's lessons, the Library, the Masterclass and the Apothecary's
protocol text are written by people and stored. Nothing generates them and
nothing should read them as intelligence.

### Structured memory

Training Memory (`/api/training/memory`), terrain check-ins, health summaries
and the plan are stored, longitudinal, and read by the deterministic paths
above. This is the memory the product has. There is no vector store, no
embedding, and no conversational history.

## What this means for the learning loop

The versioned recommendation record described in the brief had **no existing
equivalent** — no table answered "what did Sakred recommend, to whom, when,
why, and which intelligence produced it". `daily_notes` came closest and
covered one surface, which no member sees.

Two things followed, and they shaped what was built:

1. Most of what needs identity is **deterministic**, so `model_provider` and
   `model_id` are null for every recommendation this product currently makes.
   `guidance_version` and `pattern_algorithm_version` are the fields that
   matter here; a schema that assumed everything was model-written would
   describe a different product.
2. The provenance to attach was largely **already computed** — Terrain reasons
   carry a `source`, the readiness read carries its grounds. The work was
   recording it against a stable id, not inventing it.

## What has since been built

`recommendation_events` and `recommendation_feedback`
(`supabase/2026-08-19-recommendation-events.sql`,
`shared/models/recommendation.ts`).

- One row per recommendation, not per render. Identity is
  (member, local date, type, key, surface), so re-deriving the same advice is
  an upsert and the table counts decisions rather than page loads.
- Written from the surfaces that decide: `GET /api/today` records the three
  options, `GET /api/terrain/today` records the direction. Both are asserted by
  call site in `script/test-recommendation.ts`, because a recorder nothing
  calls is the failure this repository has already had four times.
- `model_provider`, `model_id` and `prompt_version` are **NULL on every row**,
  and that is this document's finding rather than an unfinished field.
- Reason codes, never reason sentences. `sleep_deficit_large` is a fact about a
  decision; the hours are a fact about a body and stay in the request that
  computed them. The vocabulary is closed, in `shared/models/brain.ts`.

Version identity lives in `shared/models/brain.ts`: one `BRAIN_VERSION`, a
decision version per engine, one `GUIDANCE_VERSION`. Each engine version is
pinned to a digest of the modules it names, and `script/test-brain.ts`
recomputes those digests on every run — so a threshold cannot change without
the version that describes it changing too. That is the difference between a
version field and a version field that is true.

Feedback is 👍/👎 on Today's options and on the Terrain direction, and nowhere
else; the allow-list of surfaces is enforced by test rather than by convention.
A verdict writes one row in one table. It does not touch a rule, a threshold or
a prompt — asserted, not merely intended.

## Not yet done

Personal patterns, the personal ranking they inform, and the aggregate a person
would publish a new Brain Version from. Outcome linkage beyond completion —
Training Memory, RPE and next-day terrain are all recorded and none of them is
yet joined to the recommendation that preceded them.
