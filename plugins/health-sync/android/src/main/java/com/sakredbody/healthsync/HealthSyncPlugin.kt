package com.sakredbody.healthsync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.TimeUnit

@CapacitorPlugin(name = "HealthSync")
class HealthSyncPlugin : Plugin() {

    private fun prefs() = context.getSharedPreferences(
        HealthSyncWorker.PREFS, Context.MODE_PRIVATE
    )

    @PluginMethod
    fun configure(call: PluginCall) {
        val origin = call.getString("apiOrigin")
        if (origin.isNullOrEmpty()) {
            call.reject("apiOrigin is required.")
            return
        }
        prefs().edit()
            .putString(HealthSyncWorker.KEY_ORIGIN, origin)
            .putString(HealthSyncWorker.KEY_TOKEN, call.getString("token"))
            .putInt(HealthSyncWorker.KEY_OVERLAP, call.getInt("overlapDays") ?: 7)
            .apply()
        call.resolve(JSObject().put("configured", true))
    }

    @PluginMethod
    fun enableBackgroundSync(call: PluginCall) {
        if (!HealthReader.isAvailable(context)) {
            call.resolve(
                JSObject().put("enabled", false).put("reason", "Health Connect is not available.")
            )
            return
        }

        val request = PeriodicWorkRequestBuilder<HealthSyncWorker>(
            // WorkManager's floor. Asking for less is silently rounded up, and
            // the real cadence is whatever Doze allows — which the server's
            // trailing re-read window makes harmless.
            15, TimeUnit.MINUTES
        )
            .setConstraints(
                Constraints.Builder()
                    // There is nothing to do without a network, and a run that
                    // fails to post still costs a Health Connect read.
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            HealthSyncWorker.WORK_NAME,
            // KEEP, not UPDATE: re-enqueuing on every launch with REPLACE
            // resets the periodic timer, so an app opened often would never
            // reach the end of an interval and the job would never run.
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )

        prefs().edit().putBoolean(HealthSyncWorker.KEY_ENABLED, true).apply()
        call.resolve(JSObject().put("enabled", true))
    }

    @PluginMethod
    fun disableBackgroundSync(call: PluginCall) {
        WorkManager.getInstance(context).cancelUniqueWork(HealthSyncWorker.WORK_NAME)
        prefs().edit().putBoolean(HealthSyncWorker.KEY_ENABLED, false).apply()
        call.resolve(JSObject().put("enabled", false))
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val p = prefs()
        call.resolve(
            JSObject()
                .put("enabled", p.getBoolean(HealthSyncWorker.KEY_ENABLED, false))
                .put("lastRunAt", p.getString(HealthSyncWorker.KEY_LAST_RUN, null))
                .put("lastResult", p.getString(HealthSyncWorker.KEY_LAST_RESULT, null))
        )
    }

    /**
     * Run the native path once, now.
     *
     * For proving it works on a device. Enqueued through WorkManager rather
     * than called directly so it exercises the same code path the periodic job
     * does — a syncNow that worked while the scheduled run was broken would be
     * worse than not having it.
     */
    @PluginMethod
    fun syncNow(call: PluginCall) {
        val request = androidx.work.OneTimeWorkRequestBuilder<HealthSyncWorker>().build()
        WorkManager.getInstance(context).enqueue(request)
        call.resolve(JSObject().put("ran", true).put("reason", "enqueued"))
    }
}
