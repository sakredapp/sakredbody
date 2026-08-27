# Google Play — Health apps declaration

Everything Play Console asks for when an app reads Health Connect, with the
answer for this app. Copy the wording; it is written to match what the code
actually does, and a justification that overstates is worse than a thin one —
the reviewer compares it against the permissions in the APK.

**Order matters.** Organization verification gates the declaration form, the
declaration gates the release. Start at step 1 even if it looks like paperwork.

---

## 0. What version 59 was rejected for

Google rejected `com.sakredbody.app` versionCode 59 for **excessive data access
for the declared feature**, naming six types: BodyFat, FloorsClimbed, Height,
Nutrition, TotalCaloriesBurned, Vo2Max.

All six were read, averaged and rendered on the health screen, and consumed by
nothing else. Three more were in exactly that position and were not named —
BodyTemperature, OxygenSaturation, RespiratoryRate — so they went with them.
Removing only what was caught answers the letter of the finding and leaves the
rule in place for the next review.

`READ_HEALTH_DATA_HISTORY` was removed separately, for the same reason: it
widened every read past any window the product displays.

Nine data types and one additional-access permission out; eleven permissions
remain. Every one of them has a consumer that is not the health screen, listed
below. 59 cannot be resubmitted — the fix ships as a new versionCode.

---

## 1. Organization account verification

Health apps must be published from a **verified organization account**, not a
personal one. If `sakredapp` is a personal developer account, this is the long
pole — Google's review takes days and nothing else can proceed.

Play Console → **Settings → Developer account → Account details**.

You will need the legal entity name, address, a D-U-N-S number, and a phone
number Google can call. The D-U-N-S is free from Dun & Bradstreet but can take
a week or two on its own, so request it first if there isn't one.

## 2. Data safety section

Play Console → **App content → Data safety**.

Declare, under **Health and fitness**:

| Field | Answer |
|---|---|
| Data collected | Health info — fitness info |
| Collected or shared | Collected. **Not** shared |
| Processed ephemerally | No — it is stored |
| Required or optional | Optional |
| Purpose | App functionality; Personalization |
| Encrypted in transit | Yes |
| Users can request deletion | Yes |

The deletion answer is true because of the disconnect button — it deletes every
`health_days` and `health_workouts` row for that member rather than unlinking.

## 3. Health apps declaration form

Play Console → **App content → Health apps**.

### Health features

Tick, under **Health and fitness** only:

- **Activity and fitness** — steps, distance, exercise sessions, active calories
- **Nutrition and weight management** — hydration, weight
- **Sleep management** — sleep sessions and stages
- **Stress management, relaxation, mental acuity** — mindfulness

Derived from the permission list Play reports for the uploaded bundle, not from
how we describe the product. A declaration narrower than the manifest is the one
that gets bounced; a declaration wider than it is scope we would have to defend.

If a category here is unwanted, the fix is to drop the permission and the code
that reads it, not to leave the box unticked.

Do **not** tick anything under **Medical**, **Human subjects research**, or
**Other**. Nothing here is clinical decision support, and a medical category
invites a far stricter review.

### The eleven permissions in the bundle

This is the whole list. It is computed from the merged manifest — the plugin's
declarations, plus ours, minus the `tools:node="remove"` entries in
`android/app/src/main/AndroidManifest.xml` — and `script/test-health.ts`
asserts in both directions that it matches what
`client/src/lib/healthMetrics.ts` actually asks the device for.

| Permission | Read by | Shown to the member as |
|---|---|---|
| `READ_STEPS` | `HealthReader.kt` → daily total | Steps tile and ring; the measured source for a steps habit |
| `READ_DISTANCE` | daily total, and per exercise session | Distance on an imported run or walk |
| `READ_ACTIVE_CALORIES_BURNED` | daily total, and per session | The Active Burn card |
| `READ_EXERCISE` | sessions as events | Movement history; recent activity in Restore and Build guidance |
| `READ_SLEEP` | session length and stages | Sleep card, and the sleep line in Terrain |
| `READ_RESTING_HEART_RATE` | daily average | Recovery context in Terrain, against the member's own 28-day baseline |
| `READ_HEART_RATE_VARIABILITY` | daily average | Recovery context in Terrain, against the same baseline |
| `READ_WEIGHT` | daily average | Bodyweight in the load calculation for bodyweight movements |
| `READ_HYDRATION` | daily total | The measured source for a hydration habit |
| `READ_MINDFULNESS` | daily total | The measured source for a mindfulness habit |
| `READ_HEALTH_DATA_IN_BACKGROUND` | `HealthSyncWorker` | Last night's sleep is there before the member opens the app |

### Per data type justification

One box per Health Connect category.
`plugins/health-sync/android/src/main/java/com/sakredbody/healthsync/HealthReader.kt`
is the list of record types actually read; anything not read was explicitly
removed from the merged manifest.

**Activity and fitness** — steps, distance, exercise sessions, active calories

> Sakred Body is a coaching app. A coach assigns a member a protocol of daily
> practices, and needs to see whether the member's actual movement matches what
> was prescribed. Reading steps, distance, exercise sessions and active energy
> lets the app show the member their own movement and lets their coach adjust
> the protocol to what is really happening rather than to what the member
> remembered to log by hand. A member can also choose steps as the measured
> source for a daily step practice, so it is counted from what their phone
> already recorded instead of by hand. Only a daily total and the session is
> stored; no raw samples are retained.

**Nutrition and weight management** — hydration, weight

> Hydration is one of the daily practices a coach commonly assigns, and reading
> it from Health Connect means a member who already logs water in another app
> does not log it twice. Weight is used to calculate training load: a set of
> pull-ups is scored against what the member weighed that day, and without it
> the app cannot say what a bodyweight movement cost them.

**Vitals** — resting heart rate, heart rate variability

> Resting heart rate and HRV are the two recovery signals the app's daily
> reading uses to decide whether it should suggest a member train hard or
> restore. Both are compared only against that member's own recent average, and
> neither is presented as a medical measurement.

**Sleep management** — sleep sessions and stages

> Sleep is one of the practices coaches assign most often, and the strongest
> single input to the app's daily reading. Reading session length and stage
> breakdown lets the app show the member the result of a sleep protocol and lets
> their coach see whether it is working, without relying on the member's own
> morning estimate.

**Stress management, relaxation, mental acuity** — mindfulness

> A member can choose a daily mindfulness practice and have it counted from
> sessions they already record elsewhere, rather than marking it complete by
> hand.

### Background reading

There is a separate justification box for
`READ_HEALTH_DATA_IN_BACKGROUND`. Answer:

> Wearables write health data hours after the fact — a ring typically writes
> last night's sleep during the following morning or afternoon. Reading in the
> background lets the app pick up that data shortly after it is written, so a
> member's coach sees an accurate picture without the member having to remember
> to open the app. The background task reads only a daily summary of the same
> categories declared above, runs at most every fifteen minutes, and stops
> entirely when the member disconnects.

The claim is checkable in the code, and `script/test-health.ts` checks it: a
periodic `HealthSyncWorker` is enqueued through WorkManager when the member
connects, reads the same window, posts to `/api/health/sync`, and is cancelled
by `disableBackgroundSync` on disconnect.

### History — deliberately not requested

`READ_HEALTH_DATA_HISTORY` is **not** in the bundle, and there is nothing to
answer. Health Connect reads back thirty days without it, and no surface in the
app reads a member's health further than that: the daily reading baselines on 28
days, and every summary a member or a coach can open asks for 30. Requesting a
window wider than anything we draw would be scope we could not defend.

Version 59 did request it. `client/src/lib/health.ts` now clamps the Health
Connect read to thirty days to match — necessary, not cosmetic, because Health
Connect throws on a read reaching further back rather than truncating it.

## 4. Privacy policy

The URL must be identical in two places, or the form is rejected:

- Play Console → **App content → Privacy policy**
- Health Connect's own permission sheet, which reads
  `health_connect_privacy_policy_url` from
  `android/app/src/main/res/values/strings.xml`

Both currently point at **https://sakredbody.com/privacy**, whose
"Health data specifically" section names Apple Health and Health Connect
explicitly, states that data is never sold or used for advertising, and
describes both revocation and deletion.

---

## After submission

- A version change does not need a new declaration; the allowlist is per
  package name.
- **Adding a data type does.** If a future release reads something not listed
  above, the form has to be resubmitted and approved before that release ships.
  This is why the unused read permissions were stripped rather than left in
  place: everything declared is something the app genuinely uses.
