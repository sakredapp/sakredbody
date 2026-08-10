package com.sakredbody.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

/**
 * The home-screen widget.
 *
 * Java rather than Kotlin so the app module does not have to take on the Kotlin
 * Gradle plugin for one file. RemoteViews is a Java-shaped API anyway — there
 * is no view hierarchy here, only a description of one the launcher inflates in
 * its own process.
 *
 * Everything rendered comes from SharedPreferences, written by the app on each
 * sync. A widget has no network and no access to the WebView, so what is not
 * written there cannot be shown.
 */
public class SakredWidgetProvider extends AppWidgetProvider {

    private static final String PREFS = "sakred.widget";
    /** After this long without a sync, stop implying the number is current. */
    private static final long STALE_AFTER_MS = 36L * 60L * 60L * 1000L;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    private RemoteViews build(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_sakred);

        String title = prefs.getString("title", null);
        if (title == null) {
            // Never synced. The same message as an empty App Group on iOS, and
            // for the same reason: to the member both mean "open the app".
            views.setTextViewText(R.id.widget_title, "Sakred Body");
            views.setTextViewText(R.id.widget_practices, "Open to get started.");
            views.setViewVisibility(R.id.widget_sleep, View.GONE);
            views.setViewVisibility(R.id.widget_sleep_note, View.GONE);
            views.setViewVisibility(R.id.widget_stale, View.GONE);
        } else {
            views.setTextViewText(R.id.widget_title, title);
            views.setTextViewText(R.id.widget_practices, prefs.getString("practices", ""));

            String sleep = prefs.getString("sleep", null);
            if (sleep != null) {
                views.setTextViewText(R.id.widget_sleep, sleep);
                views.setViewVisibility(R.id.widget_sleep, View.VISIBLE);
                String note = prefs.getString("sleepNote", null);
                if (note != null) {
                    views.setTextViewText(R.id.widget_sleep_note, note);
                    views.setViewVisibility(R.id.widget_sleep_note, View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.widget_sleep_note, View.GONE);
                }
            } else {
                // Hidden rather than shown as "0". A member who did not wear
                // their ring has no sleep, which is not the same as no sleep.
                views.setViewVisibility(R.id.widget_sleep, View.GONE);
                views.setViewVisibility(R.id.widget_sleep_note, View.GONE);
            }

            views.setViewVisibility(R.id.widget_stale, isStale(prefs) ? View.VISIBLE : View.GONE);
        }

        // Tapping anywhere opens the app. A widget that does nothing on tap
        // reads as a picture of the app rather than part of it.
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            PendingIntent pending = PendingIntent.getActivity(
                    context, 0, launch, PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
        }

        return views;
    }

    private boolean isStale(SharedPreferences prefs) {
        String iso = prefs.getString("updatedAt", null);
        if (iso == null) return false;
        try {
            long updated = java.time.Instant.parse(iso).toEpochMilli();
            return System.currentTimeMillis() - updated > STALE_AFTER_MS;
        } catch (Exception e) {
            // An unparseable timestamp is not evidence of staleness, and
            // claiming "not synced today" on a guess is worse than saying
            // nothing.
            return false;
        }
    }
}
