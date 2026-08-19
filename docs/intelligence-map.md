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

The versioned recommendation record described in the brief has **no existing
equivalent** — there is no table today that answers "what did Sakred recommend,
to whom, when, why, and which intelligence produced it". `daily_notes` comes
closest and covers one surface.

Two things follow, and they are worth being precise about:

1. Most of what needs identity is **deterministic**, so `model_provider` and
   `model_id` are null for almost every recommendation this product makes.
   `guidance_version` and `pattern_algorithm_version` are the fields that
   matter here; a schema that assumed everything was model-written would
   describe a different product.
2. The provenance to attach is largely **already computed** — Terrain reasons
   carry a `source`, habit proposals carry their decision rules. The work is
   recording it against a stable id, not inventing it.

## Not yet done

The recommendation-event layer, the feedback control, the behaviour and outcome
links, and the version fields are **not built**. This document is the audit that
was supposed to come first, and it changes what should be built: a schema
shaped around a deterministic engine with one model-backed corner, rather than
around a model with deterministic fallbacks.
