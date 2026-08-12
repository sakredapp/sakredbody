package com.sakredbody.healthsync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * The background run.
 *
 * Android gives no equivalent of HealthKit's "wake me when this data changes",
 * so this is a periodic job rather than an observer. WorkManager's floor is
 * fifteen minutes and the real interval is whatever Doze decides — which is
 * fine, because the server's trailing re-read window means a late run loses
 * nothing, it only delays.
 *
 * Everything the WebView would do is repeated here in Kotlin for the same
 * reason as on iOS: at this point there is no WebView.
 */
class HealthSyncWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val origin = prefs.getString(KEY_ORIGIN, null)
        val token = prefs.getString(KEY_TOKEN, null)

        if (origin.isNullOrEmpty() || token.isNullOrEmpty()) {
            record(prefs, "not configured")
            // success(), not failure(): a logged-out member is a normal state,
            // and failure() would let WorkManager back off and eventually stop
            // scheduling the job that has to be running when they log back in.
            return@withContext Result.success()
        }

        if (!HealthReader.isAvailable(applicationContext)) {
            record(prefs, "Health Connect unavailable")
            return@withContext Result.success()
        }

        val overlapDays = prefs.getInt(KEY_OVERLAP, 7).coerceAtLeast(1)
        val end = Instant.now()
        val start = end.minus(overlapDays.toLong(), ChronoUnit.DAYS)

        val reader = HealthReader(applicationContext)

        val samples = try {
            reader.collect(start, end)
        } catch (e: Throwable) {
            record(prefs, "read failed: ${e.message}")
            // retry(), because a read that threw is usually transient — the
            // provider updating, or the client not yet bound.
            return@withContext Result.retry()
        }

        /**
         * Sessions as events, alongside the daily totals.
         *
         * Read separately and failed separately: a member who granted step data
         * and withheld exercise sessions should still get their steps, and a
         * throw here would have taken the whole run down with it.
         */
        val workouts = try {
            reader.workouts(start, end)
        } catch (e: Throwable) {
            emptyList()
        }

        if (samples.isEmpty() && workouts.isEmpty()) {
            record(prefs, "nothing to post")
            return@withContext Result.success()
        }

        return@withContext when (val outcome = post(origin, token, samples, workouts, end)) {
            is PostResult.Ok -> {
                record(prefs, "posted ${outcome.accepted} values")
                Result.success()
            }
            is PostResult.Unauthorized -> {
                // Nothing here can refresh a token. The next foreground launch
                // reconfigures with a live one; retrying would just burn the
                // battery against a 401.
                record(prefs, "unauthorized")
                Result.success()
            }
            is PostResult.Failed -> {
                record(prefs, outcome.reason)
                Result.retry()
            }
        }
    }

    private sealed class PostResult {
        data class Ok(val accepted: Int) : PostResult()
        object Unauthorized : PostResult()
        data class Failed(val reason: String) : PostResult()
    }

    private fun post(
        origin: String,
        token: String,
        samples: List<HealthReader.Sample>,
        workouts: List<HealthReader.Workout>,
        syncedThrough: Instant,
    ): PostResult {
        // Last value wins per key. Postgres cannot resolve two rows that
        // conflict with each other inside one statement — it raises "cannot
        // affect row a second time" and the whole sync fails.
        val byKey = LinkedHashMap<String, HealthReader.Sample>()
        for (sample in samples) byKey["${sample.onDate}|${sample.metric}"] = sample

        val array = JSONArray()
        for (sample in byKey.values) {
            array.put(
                JSONObject()
                    .put("onDate", sample.onDate)
                    .put("metric", sample.metric)
                    .put("value", sample.value)
                    .put("unit", UNITS[sample.metric] ?: "count")
                    .put("sourceApp", "Health Connect")
            )
        }

        // Events, not totals. Deduped by the platform's own record id here as
        // well as by the server's unique index, because the trailing re-read
        // window means the same session arrives on most runs.
        val workoutArray = JSONArray()
        val seen = HashSet<String>()
        for (w in workouts) {
            if (!seen.add(w.externalId)) continue
            workoutArray.put(
                JSONObject()
                    .put("externalId", w.externalId)
                    .put("workoutType", w.workoutType)
                    .put("startAt", w.startAt)
                    .put("endAt", w.endAt)
                    .put("onDate", w.onDate)
                    .put("durationSeconds", w.durationSeconds)
                    .apply {
                        // Absent rather than zero. A run with no distance
                        // recorded and a run of zero metres are different
                        // things, and only one of them should be shown.
                        w.distanceMeters?.let { put("distanceMeters", it) }
                        w.activeCalories?.let { put("activeCalories", it) }
                        w.sourceApp?.let { put("sourceApp", it) }
                    }
            )
        }

        val body = JSONObject()
            .put("platform", "healthconnect")
            .put("samples", array)
            .put("workouts", workoutArray)
            .put("syncedThrough", syncedThrough.toString())
            .put("deviceModel", "android-background")
            .toString()

        var connection: HttpURLConnection? = null
        return try {
            connection = (URL("$origin/api/health/sync").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("X-Client-Platform", "android")
                doOutput = true
                connectTimeout = 15_000
                readTimeout = 25_000
            }
            connection.outputStream.use { it.write(body.toByteArray()) }

            when (val status = connection.responseCode) {
                401 -> PostResult.Unauthorized
                in 200..299 -> {
                    val text = connection.inputStream.bufferedReader().use(BufferedReader::readText)
                    val accepted = try {
                        JSONObject(text).optInt("accepted", byKey.size)
                    } catch (e: Throwable) {
                        byKey.size
                    }
                    PostResult.Ok(accepted)
                }
                else -> PostResult.Failed("http $status")
            }
        } catch (e: Throwable) {
            PostResult.Failed("failed: ${e.message}")
        } finally {
            connection?.disconnect()
        }
    }

    private fun record(prefs: android.content.SharedPreferences, result: String) {
        prefs.edit()
            .putString(KEY_LAST_RUN, Instant.now().toString())
            .putString(KEY_LAST_RESULT, result)
            .apply()
    }

    companion object {
        const val PREFS = "sakred.healthsync"
        const val KEY_ORIGIN = "apiOrigin"
        const val KEY_TOKEN = "token"
        const val KEY_OVERLAP = "overlapDays"
        const val KEY_ENABLED = "enabled"
        const val KEY_LAST_RUN = "lastRunAt"
        const val KEY_LAST_RESULT = "lastResult"
        const val WORK_NAME = "sakred-health-sync"

        /** Mirrors HEALTH_UNITS in shared/models/health.ts. */
        val UNITS = mapOf(
            "steps" to "count",
            "distanceMeters" to "m",
            "flightsClimbed" to "count",
            "exerciseMinutes" to "min",
            "activeCalories" to "kcal",
            "totalCalories" to "kcal",
            "restingHeartRate" to "bpm",
            "heartRateVariability" to "ms",
            "vo2Max" to "mL/kg/min",
            "sleepMinutes" to "min",
            "sleepDeepMinutes" to "min",
            "sleepRemMinutes" to "min",
            "sleepAwakeMinutes" to "min",
            "weightKg" to "kg",
            "bodyFatPercent" to "%",
            "heightCm" to "cm",
            "respiratoryRate" to "brpm",
            "oxygenSaturation" to "%",
            "bodyTemperatureC" to "degC",
            "mindfulnessMinutes" to "min",
            "waterMl" to "mL",
            "dietaryCalories" to "kcal",
        )
    }
}
