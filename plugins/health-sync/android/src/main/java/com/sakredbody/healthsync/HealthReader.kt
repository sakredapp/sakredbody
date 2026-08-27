package com.sakredbody.healthsync

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Reading Health Connect and folding it into one value per day per metric.
 *
 * Everything here uses readRecords and aggregates in Kotlin, rather than
 * Health Connect's aggregate() with its per-type metric constants. Two
 * reasons, and the second is the real one:
 *
 *   1. One API surface instead of thirty constants, several of which do not
 *      exist for the types we care about (there is no aggregate for HRV, VO2
 *      max, SpO2 or body temperature — those would need this path anyway).
 *   2. The window is seven days. The volume that makes aggregate() worth its
 *      complexity is months, not a week, and doing it in one place means the
 *      averaging rule for a metric is visible next to the metric.
 *
 * Sums and averages are NOT interchangeable and the distinction is set per
 * metric below. A day of resting heart rate summed is 1,400 bpm.
 */
class HealthReader(private val context: Context) {

    data class Sample(val onDate: String, val metric: String, val value: Double)

    /**
     * One session, as an event rather than a daily total.
     *
     * ── The gap this closes ───────────────────────────────────────────────
     *
     * `collect()` below has always read ExerciseSessionRecord and folded it
     * into `exerciseMinutes` — a single number per day. Everything else about
     * the session was then discarded: what it was, when it started, how far,
     * which app recorded it. So an Android member who ran 10km with Strava had
     * "62 exercise minutes" in Sakred and nothing that could be placed in
     * Build, counted toward training load, or shown to a coach. iOS has posted
     * full workout events since it was written; Android never did, and the
     * server has accepted a `workouts` array the whole time.
     *
     * `externalId` is the idempotency key. Health Connect's metadata id is
     * stable across reads, so the server's unique index on (user, externalId)
     * turns the trailing re-read window into an update rather than a second
     * run every fifteen minutes.
     */
    data class Workout(
        val externalId: String,
        val workoutType: String,
        val startAt: String,
        val endAt: String,
        val onDate: String,
        val durationSeconds: Int,
        val distanceMeters: Double?,
        val activeCalories: Double?,
        val sourceApp: String?,
        val title: String?,
    )

    private val zone: ZoneId get() = ZoneId.systemDefault()

    private fun localDate(instant: Instant): String =
        LocalDate.ofInstant(instant, zone).toString()

    /** Accumulates either a running total or a running mean, never both. */
    private class Fold {
        private val sums = HashMap<String, Double>()
        private val counts = HashMap<String, Int>()

        fun add(date: String, metric: String, value: Double) {
            if (!value.isFinite()) return
            val key = "$date|$metric"
            sums[key] = (sums[key] ?: 0.0) + value
            counts[key] = (counts[key] ?: 0) + 1
        }

        fun result(averaged: Set<String>): List<Sample> = sums.map { (key, total) ->
            val (date, metric) = key.split("|", limit = 2)
            val value = if (metric in averaged) total / (counts[key] ?: 1) else total
            Sample(date, metric, Math.round(value * 1000.0) / 1000.0)
        }
    }

    private val averaged = setOf(
        "restingHeartRate", "heartRateVariability", "weightKg",
    )

    private suspend fun <T : Record> read(
        client: HealthConnectClient,
        type: KClass<T>,
        start: Instant,
        end: Instant,
    ): List<T> = try {
        client.readRecords(
            ReadRecordsRequest(recordType = type, timeRangeFilter = TimeRangeFilter.between(start, end))
        ).records
    } catch (e: Throwable) {
        // A single refused type must not take down the run. A member who
        // granted steps and withheld weight is the normal case, and on Health
        // Connect a withheld type throws rather than returning empty.
        emptyList()
    }

    /**
     * Health Connect's exercise type, in the same words iOS uses.
     *
     * The vocabulary is deliberately identical to HealthSyncEngine.activityName
     * on the iOS side, because one shared table in shared/models/training.ts
     * maps these onto Sakred movement categories. Two platform-specific
     * vocabularies would mean two mapping tables and, eventually, a run that is
     * Build on an iPhone and something else on a Pixel.
     *
     * Anything unlisted becomes "other" rather than a number. "other" is not in
     * the mapping table either, so it contributes no load — an activity we
     * could not identify is shown to the member and counted by nothing, which
     * is the honest treatment.
     */
    private fun exerciseName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"

        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "cycling"

        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"

        ExerciseSessionRecord.EXERCISE_TYPE_ROWING,
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "rowing"

        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "elliptical"

        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING,
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "stairs"

        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_BOOT_CAMP -> "hiit"

        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING,
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "strength"

        ExerciseSessionRecord.EXERCISE_TYPE_BOXING,
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS -> "boxing"

        ExerciseSessionRecord.EXERCISE_TYPE_TENNIS,
        ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS,
        ExerciseSessionRecord.EXERCISE_TYPE_SQUASH,
        ExerciseSessionRecord.EXERCISE_TYPE_RACQUETBALL,
        ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON -> "tennis"

        ExerciseSessionRecord.EXERCISE_TYPE_GOLF -> "golf"
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "dance"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "pilates"
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "flexibility"
        ExerciseSessionRecord.EXERCISE_TYPE_GUIDED_BREATHING -> "cooldown"

        // A class, not necessarily a hard one. This returned "hiit", which maps
        // to `explosive` — the heaviest bracket in the model — so a gentle
        // studio class counted the same as sprint intervals. "class" carries a
        // moderate load and no claim about intensity we cannot support.
        ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS -> "class"

        else -> "other"
    }

    /**
     * Sessions in the window, with the metrics that overlap them.
     *
     * Health Connect keeps distance and energy in their own record types rather
     * than on the session, so a run's distance has to be gathered by summing
     * DistanceRecord over the session's own time range. That is why this reads
     * those two types again rather than reusing the daily fold — the fold has
     * already collapsed them to one number per day, which cannot be attributed
     * back to a particular session.
     *
     * Heart rate is absent on purpose. READ_HEART_RATE is stripped from the
     * merged manifest (see android/app/src/main/AndroidManifest.xml) because
     * nothing consumed it, and asking for a permission in order to fill a field
     * is the wrong way round — the Play health declaration has to justify every
     * type we request.
     */
    suspend fun workouts(start: Instant, end: Instant): List<Workout> {
        val client = HealthConnectClient.getOrCreate(context)

        val sessions = read(client, ExerciseSessionRecord::class, start, end)
        if (sessions.isEmpty()) return emptyList()

        val distances = read(client, DistanceRecord::class, start, end)
        val calories = read(client, ActiveCaloriesBurnedRecord::class, start, end)

        return sessions.mapNotNull { session ->
            val id = session.metadata.id
            if (id.isEmpty()) return@mapNotNull null

            val from = session.startTime
            val to = session.endTime
            // A record counts toward the session when it starts inside it.
            // Whole-record attribution rather than proportional splitting: the
            // alternative invents a figure for a record straddling the boundary,
            // and these are summaries, not a billing system.
            val within = { s: Instant -> !s.isBefore(from) && s.isBefore(to) }

            val metres = distances.filter { within(it.startTime) }.sumOf { it.distance.inMeters }
            val kcal = calories.filter { within(it.startTime) }.sumOf { it.energy.inKilocalories }

            Workout(
                externalId = id,
                workoutType = exerciseName(session.exerciseType),
                startAt = from.toString(),
                endAt = to.toString(),
                onDate = localDate(from),
                durationSeconds = (to.epochSecond - from.epochSecond).toInt().coerceAtLeast(0),
                distanceMeters = metres.takeIf { it > 0 },
                activeCalories = kcal.takeIf { it > 0 },
                sourceApp = session.metadata.dataOrigin.packageName.takeIf { it.isNotEmpty() },
                title = session.title,
            )
        }
    }

    /**
     * The daily metrics, for the types Android still asks for.
     *
     * Nine used to be read here that are not any more: floors, total calories,
     * nutrition, VO2 max, body fat, height, respiratory rate, blood oxygen and
     * body temperature. Play rejected versionCode 59 for requesting the first
     * six under the minimum-scope rule, and the last three fail the same test —
     * each was read, averaged and shown on the health screen, and consumed by
     * nothing. See the block in android/app/src/main/AndroidManifest.xml.
     *
     * They are gone from the request set rather than merely unread. A
     * permission the app holds and does not use is one we would still have to
     * justify on the declaration form, and `read()` swallowing the refusal
     * would have hidden the difference from us.
     */
    suspend fun collect(start: Instant, end: Instant): List<Sample> {
        val client = HealthConnectClient.getOrCreate(context)
        val fold = Fold()

        read(client, StepsRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "steps", it.count.toDouble()) }

        read(client, DistanceRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "distanceMeters", it.distance.inMeters) }

        read(client, ActiveCaloriesBurnedRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "activeCalories", it.energy.inKilocalories) }

        read(client, HydrationRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "waterMl", it.volume.inMilliliters) }

        read(client, ExerciseSessionRecord::class, start, end).forEach {
            val minutes = (it.endTime.epochSecond - it.startTime.epochSecond) / 60.0
            fold.add(localDate(it.startTime), "exerciseMinutes", minutes)
        }

        read(client, RestingHeartRateRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "restingHeartRate", it.beatsPerMinute.toDouble()) }

        read(client, HeartRateVariabilityRmssdRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "heartRateVariability", it.heartRateVariabilityMillis) }

        read(client, WeightRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "weightKg", it.weight.inKilograms) }

        val samples = fold.result(averaged).toMutableList()
        samples.addAll(sleep(client, start, end))
        return samples
    }

    /**
     * Sleep, attributed to the date the session ENDS on.
     *
     * Same rule as iOS and as the TypeScript path, and for the same reason: a
     * session from 23:40 to 07:10 is the morning's sleep, and bucketing by
     * start moves it between days depending on which side of midnight someone
     * fell asleep.
     */
    private suspend fun sleep(client: HealthConnectClient, start: Instant, end: Instant): List<Sample> {
        val sessions = read(client, SleepSessionRecord::class, start, end)

        // Intervals rather than durations — see `unionedMinutes`. Health
        // Connect returns every writing app's copy of the same night, so
        // adding the durations multiplies a member's sleep by however many
        // apps they happen to have installed.
        val spans = HashMap<String, HashMap<String, MutableList<Span>>>()

        fun record(date: String, metric: String, from: Instant, to: Instant) {
            if (!to.isAfter(from)) return
            spans.getOrPut(date) { HashMap() }
                .getOrPut(metric) { mutableListOf() }
                .add(Span(from, to))
        }

        for (session in sessions) {
            val date = localDate(session.endTime)
            if (session.stages.isNotEmpty()) {
                for (stage in session.stages) {
                    when (stage.stage) {
                        SleepSessionRecord.STAGE_TYPE_DEEP -> {
                            record(date, "sleepMinutes", stage.startTime, stage.endTime)
                            record(date, "sleepDeepMinutes", stage.startTime, stage.endTime)
                        }
                        SleepSessionRecord.STAGE_TYPE_REM -> {
                            record(date, "sleepMinutes", stage.startTime, stage.endTime)
                            record(date, "sleepRemMinutes", stage.startTime, stage.endTime)
                        }
                        SleepSessionRecord.STAGE_TYPE_LIGHT,
                        SleepSessionRecord.STAGE_TYPE_SLEEPING ->
                            record(date, "sleepMinutes", stage.startTime, stage.endTime)
                        SleepSessionRecord.STAGE_TYPE_AWAKE,
                        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED ->
                            record(date, "sleepAwakeMinutes", stage.startTime, stage.endTime)
                        // OUT_OF_BED and UNKNOWN are neither sleep nor time
                        // awake in the session, so they are counted as neither.
                        else -> Unit
                    }
                }
            } else {
                record(date, "sleepMinutes", session.startTime, session.endTime)
            }
        }

        return spans.flatMap { (date, metrics) ->
            metrics.mapNotNull { (metric, intervals) ->
                val minutes = unionedMinutes(intervals)
                if (minutes <= 0) null
                else Sample(date, metric, Math.round(minutes * 100.0) / 100.0)
            }
        }
    }

    /** A stretch of wall-clock time a source claims the member was in some state. */
    private data class Span(val start: Instant, val end: Instant)

    /**
     * Total minutes covered by these spans, counting overlaps once.
     *
     * The question is never "how much sleep was reported" but "how much of the
     * clock was covered". Two apps agreeing about the same 3am add nothing to
     * each other — agreement is not extra sleep. Sort by start, walk once,
     * extending the open span while the next begins before the current ends.
     */
    private fun unionedMinutes(spans: List<Span>): Double {
        if (spans.isEmpty()) return 0.0
        val sorted = spans.sortedBy { it.start }
        var total = 0L
        var openStart = sorted[0].start
        var openEnd = sorted[0].end

        for (span in sorted.drop(1)) {
            if (span.start.isAfter(openEnd)) {
                total += openEnd.epochSecond - openStart.epochSecond
                openStart = span.start
                openEnd = span.end
            } else if (span.end.isAfter(openEnd)) {
                // Overlapping or touching — absorb it rather than add it.
                openEnd = span.end
            }
        }
        total += openEnd.epochSecond - openStart.epochSecond
        return total / 60.0
    }

    companion object {
        fun isAvailable(context: Context): Boolean =
            HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }
}
