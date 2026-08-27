package com.sakredbody.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;

import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Launch in the atmosphere the member last chose.
 *
 * `styles.xml` can only name one windowBackground, and it has to be the ink
 * the splash is drawn on. That leaves the frames between the splash tearing
 * down and the WebView's first paint: for a member in Dark they are ink and
 * invisible, and for a member in Light they are a dark flash arriving after
 * the splash has already gone.
 *
 * The web layer knows the answer but does not exist yet, so AppearancePlugin
 * writes it down every time it is applied and this reads it back — before
 * super.onCreate, which is where the window is realised.
 *
 * First launch has nothing stored and falls through to the dark default,
 * which is both the splash's colour and the app's.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppearancePlugin.class);

        boolean dark = getSharedPreferences(AppearancePlugin.PREFS, MODE_PRIVATE)
            .getBoolean(AppearancePlugin.KEY_DARK, true);
        String ink = getSharedPreferences(AppearancePlugin.PREFS, MODE_PRIVATE)
            .getString(AppearancePlugin.KEY_INK, null);

        super.onCreate(savedInstanceState);

        if (ink != null) {
            try {
                getWindow().setBackgroundDrawable(new ColorDrawable(Color.parseColor(ink)));
            } catch (IllegalArgumentException e) {
                // Stored by us, so this cannot normally happen. Keeping the
                // theme's ink is the right answer if it ever does.
            }
        }

        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), decor);
        controller.setAppearanceLightNavigationBars(!dark);
        controller.setAppearanceLightStatusBars(!dark);
    }
}
