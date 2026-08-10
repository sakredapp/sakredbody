package com.sakredbody.healthsync

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Vo2MaxRecord
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
        "restingHeartRate", "heartRateVariability", "vo2Max",
        "weightKg", "bodyFatPercent", "respiratoryRate",
        "oxygenSaturation", "bodyTemperatureC", "heightCm",
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

    suspend fun collect(start: Instant, end: Instant): List<Sample> {
        val client = HealthConnectClient.getOrCreate(context)
        val fold = Fold()

        read(client, StepsRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "steps", it.count.toDouble()) }

        read(client, DistanceRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "distanceMeters", it.distance.inMeters) }

        read(client, FloorsClimbedRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "flightsClimbed", it.floors) }

        read(client, ActiveCaloriesBurnedRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "activeCalories", it.energy.inKilocalories) }

        read(client, TotalCaloriesBurnedRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "totalCalories", it.energy.inKilocalories) }

        read(client, HydrationRecord::class, start, end)
            .forEach { fold.add(localDate(it.startTime), "waterMl", it.volume.inMilliliters) }

        read(client, NutritionRecord::class, start, end).forEach { record ->
            record.energy?.let { fold.add(localDate(record.startTime), "dietaryCalories", it.inKilocalories) }
        }

        read(client, ExerciseSessionRecord::class, start, end).forEach {
            val minutes = (it.endTime.epochSecond - it.startTime.epochSecond) / 60.0
            fold.add(localDate(it.startTime), "exerciseMinutes", minutes)
        }

        read(client, RestingHeartRateRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "restingHeartRate", it.beatsPerMinute.toDouble()) }

        read(client, HeartRateVariabilityRmssdRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "heartRateVariability", it.heartRateVariabilityMillis) }

        read(client, Vo2MaxRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "vo2Max", it.vo2MillilitersPerMinuteKilogram) }

        read(client, WeightRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "weightKg", it.weight.inKilograms) }

        // Health Connect's Percentage is already 0–100, unlike HealthKit's
        // fraction. The two platforms disagree and both call it a percentage.
        read(client, BodyFatRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "bodyFatPercent", it.percentage.value) }

        read(client, HeightRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "heightCm", it.height.inMeters * 100) }

        read(client, RespiratoryRateRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "respiratoryRate", it.rate) }

        read(client, OxygenSaturationRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "oxygenSaturation", it.percentage.value) }

        read(client, BodyTemperatureRecord::class, start, end)
            .forEach { fold.add(localDate(it.time), "bodyTemperatureC", it.temperature.inCelsius) }

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
        val totals = HashMap<String, HashMap<String, Double>>()

        fun add(date: String, metric: String, minutes: Double) {
            if (minutes <= 0 || !minutes.isFinite()) return
            val day = totals.getOrPut(date) { HashMap() }
            day[metric] = (day[metric] ?: 0.0) + minutes
        }

        for (session in sessions) {
            val date = localDate(session.endTime)
            if (session.stages.isNotEmpty()) {
                for (stage in session.stages) {
                    val minutes = (stage.endTime.epochSecond - stage.startTime.epochSecond) / 60.0
                    when (stage.stage) {
                        SleepSessionRecord.STAGE_TYPE_DEEP -> {
                            add(date, "sleepMinutes", minutes)
                            add(date, "sleepDeepMinutes", minutes)
                        }
                        SleepSessionRecord.STAGE_TYPE_REM -> {
                            add(date, "sleepMinutes", minutes)
                            add(date, "sleepRemMinutes", minutes)
                        }
                        SleepSessionRecord.STAGE_TYPE_LIGHT,
                        SleepSessionRecord.STAGE_TYPE_SLEEPING -> add(date, "sleepMinutes", minutes)
                        SleepSessionRecord.STAGE_TYPE_AWAKE,
                        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> add(date, "sleepAwakeMinutes", minutes)
                        // OUT_OF_BED and UNKNOWN are neither sleep nor time
                        // awake in the session, so they are counted as neither.
                        else -> Unit
                    }
                }
            } else {
                val minutes = (session.endTime.epochSecond - session.startTime.epochSecond) / 60.0
                add(date, "sleepMinutes", minutes)
            }
        }

        return totals.flatMap { (date, metrics) ->
            metrics.map { (metric, value) ->
                Sample(date, metric, Math.round(value * 100.0) / 100.0)
            }
        }
    }

    companion object {
        fun isAvailable(context: Context): Boolean =
            HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }
}
