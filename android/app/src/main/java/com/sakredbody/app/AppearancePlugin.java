package com.sakredbody.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The parts of the screen the WebView does not draw.
 *
 * ── What @capacitor/status-bar leaves undone ──────────────────────────────
 *
 * That plugin sets `setAppearanceLightStatusBars` and stops. On a phone with
 * gesture navigation there is a second bar at the bottom, and from Android 15
 * it is transparent by platform decision — so the pill is drawn straight onto
 * whatever the web layer painted, in whatever contrast the system was last
 * told to use. In Dark that is light-on-dark and correct by accident. The
 * moment a member picks Light it is a light pill on limestone: still there,
 * still swipeable, and invisible.
 *
 * ── Why this is an app-local plugin ───────────────────────────────────────
 *
 * It could have been a package under plugins/ next to health-sync. It is a
 * dozen lines of platform call with no npm surface, no iOS/Android shared
 * contract worth versioning and nothing another app would install, so it
 * lives in the app module and is registered by hand in MainActivity.
 *
 * ── Why the window background is written down ─────────────────────────────
 *
 * A cold launch has no WebView yet. `styles.xml` names one windowBackground
 * for every member, and it has to be ink because the splash is ink — but the
 * frames *after* the splash tears down and before the first paint arrives use
 * the same value, and for a member in Light that is a dark flash at the end of
 * a launch rather than the beginning. So the resolved ground is stored here
 * and MainActivity reads it back on the next launch, which is the only place
 * the choice can be known before the web layer exists to say it.
 */
@CapacitorPlugin(name = "SakredAppearance")
public class AppearancePlugin extends Plugin {

    static final String PREFS = "sakred.appearance";
    static final String KEY_DARK = "dark";
    static final String KEY_INK = "ink";

    @PluginMethod
    public void apply(PluginCall call) {
        final String theme = call.getString("theme", "dark");
        final boolean dark = !"light".equals(theme);
        final String ink = call.getString("ink");

        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity.");
            return;
        }

        // Parsed on this side of the bridge, so a malformed colour is a
        // rejected call rather than a crash on the UI thread.
        int ground = 0;
        boolean haveGround = false;
        if (ink != null && !ink.isEmpty()) {
            try {
                ground = Color.parseColor(ink);
                haveGround = true;
            } catch (IllegalArgumentException e) {
                call.reject("Not a colour: " + ink);
                return;
            }
        }

        final int groundColor = ground;
        final boolean paintGround = haveGround;

        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            View decor = window.getDecorView();

            WindowInsetsControllerCompat controller =
                new WindowInsetsControllerCompat(window, decor);
            // "Light bars" means light *background*, therefore dark icons —
            // the same inversion @capacitor/status-bar's Style names carry,
            // and the same trap. Light theme → light bars → dark pill.
            controller.setAppearanceLightNavigationBars(!dark);
            // Set here as well as by the status-bar plugin. The two calls
            // agree, and a member who has never opened the health screen has
            // never caused that plugin to load.
            controller.setAppearanceLightStatusBars(!dark);

            if (paintGround) {
                // Behind the WebView, so a keyboard opening or the recents
                // card resuming shows this rather than the launch ink.
                window.setBackgroundDrawable(new ColorDrawable(groundColor));
            }
        });

        SharedPreferences.Editor edit =
            activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE).edit();
        edit.putBoolean(KEY_DARK, dark);
        if (haveGround) edit.putString(KEY_INK, ink);
        edit.apply();

        JSObject result = new JSObject();
        result.put("applied", true);
        result.put("dark", dark);
        call.resolve(result);
    }
}
