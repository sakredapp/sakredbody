# Google Play — Health apps declaration

Everything Play Console asks for when an app reads Health Connect, with the
answer for this app. Copy the wording; it is written to match what the code
actually does, and a justification that overstates is worse than a thin one —
the reviewer compares it against the permissions in the APK.

**Order matters.** Organization verification gates the declaration form, the
declaration gates the release. Start at step 1 even if it looks like paperwork.

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

- Activity and fitness
- Sleep management

Do **not** tick anything under **Medical**. Nothing here is clinical decision
support, and ticking a medical category invites a far stricter review.

### Per data type justification

One box per Health Connect category. These match what the app actually reads —
`plugins/health-sync/android/src/main/java/com/sakredbody/healthsync/HealthReader.kt`
is the list of record types, and anything not read was explicitly removed from
the merged manifest in `android/app/src/main/AndroidManifest.xml`.

**Activity and fitness** — steps, distance, floors climbed, exercise sessions

> Sakred Body is a coaching app. A coach assigns a member a protocol of daily
> practices, and needs to see whether the member's actual movement matches what
> was prescribed. Reading steps, distance, floors and exercise sessions lets the
> app show the member their own adherence and lets their coach adjust the
> protocol to what is really happening rather than to what the member remembered
> to log by hand. Only a daily total is stored; no raw samples are retained.

**Body composition** — weight, body fat, height

> Members are working toward body composition goals set with their coach.
> Reading weight and body fat lets the app chart progress against the protocol
> without asking the member to enter a number they already recorded on a scale.
> Height is read once to contextualise the other two.

**Energy** — active calories, total calories

> Displayed to the member alongside their assigned practices so they can see
> the energy cost of the protocol they are following, and used by their coach to
> judge whether a protocol is too demanding or too light.

**Nutrition** — hydration, calories consumed

> Hydration and dietary energy are two of the daily practices a coach commonly
> assigns. Reading them from Health Connect means a member who already logs
> them in another app does not have to log them twice.

**Respiratory system** — respiratory rate, oxygen saturation

> Shown to the member as part of their recovery picture and reviewed by their
> coach when adjusting training load. Not used for any diagnostic purpose and
> not presented as a medical measurement.

**Vitals** — resting heart rate, heart rate variability, VO2 max, body
temperature

> Resting heart rate and HRV are the primary recovery signals a coach uses to
> decide whether a member should train hard or rest on a given day. VO2 max
> tracks aerobic progress over months. Body temperature adds context when the
> other two move unexpectedly.

**Sleep management** — sleep sessions and stages

> Sleep is one of the practices coaches assign most often. Reading session
> length and stage breakdown lets the app show the member the result of a sleep
> protocol and lets their coach see whether it is working, without relying on
> the member's own morning estimate.

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

### History

`READ_HEALTH_DATA_HISTORY` is also declared. Answer:

> When a member first connects, the app reads ninety days of history so their
> coach can see a baseline rather than starting from an empty chart. Without
> this permission Health Connect caps reads at roughly thirty days.

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
