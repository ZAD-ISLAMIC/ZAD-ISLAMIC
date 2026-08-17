package com.rn0x.systemui;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.ViewParent;
import android.view.Window;
import android.widget.FrameLayout;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaArgs;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

/**
 * SystemUI — keeps the Android status bar, navigation bar and their icon
 * appearance in sync with the app theme, with independent per-bar control.
 *
 * <p>Works with cordova-android's edge-to-edge layout: the status bar is
 * drawn by the synthetic "statusBarView" strip in the root layout, while the
 * navigation bar area shows the root view background behind the transparent
 * system bar. This plugin colours both surfaces directly and also mirrors the
 * values into the shared cordova preferences so the framework's built-in
 * {@code SystemBarPlugin} keeps applying the same colours on resume /
 * configuration changes instead of the fixed launcher defaults.</p>
 */
public final class SystemUI extends CordovaPlugin {

    private static final String TAG_STATUS_BAR = "statusBarView";
    private static final int FALLBACK_COLOR = Color.rgb(10, 20, 40);

    /** Cached state (no Activity/Context held) so nothing leaks across reassigns. */
    private int statusBarColor = FALLBACK_COLOR;
    private boolean statusDarkIcons = false;
    private int navBarColor = FALLBACK_COLOR;
    private boolean navDarkIcons = false;
    private boolean applyPending = false;

    private final Runnable applyRunnable = new Runnable() {
        @Override
        public void run() {
            applyPending = false;
            apply();
        }
    };

    @Override
    public boolean execute(String action, CordovaArgs args, CallbackContext callbackContext) throws JSONException {
        if (!"style".equals(action)) {
            return false;
        }

        JSONObject opts = args.optJSONObject(0);
        statusBarColor = parseColor(opts != null ? opts.optString("statusBarColor") : null);
        statusDarkIcons = opts != null && opts.optBoolean("statusBarDarkIcons", false);
        navBarColor = parseColor(opts != null ? opts.optString("navBarColor") : null);
        navDarkIcons = opts != null && opts.optBoolean("navBarDarkIcons", false);

        final CallbackContext cb = callbackContext;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                apply();
                cb.success();
            }
        });
        return true;
    }

    @Override
    public void onResume(boolean multitasking) {
        super.onResume(multitasking);
        requestApply();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        requestApply();
    }

    /** Coalesces apply() so only one pending UI-thread pass ever runs. */
    private void requestApply() {
        if (applyPending) return;
        applyPending = true;
        boolean posted = runOnUiThread(applyRunnable);
        if (!posted) applyPending = false;
    }

    /**
     * Posting to the UI thread from plugin callbacks can throw when the
     * activity is finishing; the bars are non-critical, so never crash.
     *
     * @return true when the task was actually scheduled.
     */
    private boolean runOnUiThread(Runnable task) {
        try {
            Activity activity = cordova.getActivity();
            if (activity != null) {
                activity.runOnUiThread(task);
                return true;
            }
        } catch (RuntimeException ignore) {
            /* activity is finishing/destroyed — safe to skip */
        }
        return false;
    }

    /** Applies the cached style immediately and mirrors it into the shared prefs. */
    @SuppressWarnings("deprecation")
    private void apply() {
        Activity activity = cordova.getActivity();
        if (activity == null) return;
        Window window = activity.getWindow();
        if (window == null) return;
        View decorView = window.getDecorView();
        if (decorView == null) return;

        // 1. Mirror into the shared cordova preferences so the framework's own
        //    SystemBarPlugin re-applies the same colours on resume / config
        //    changes instead of the fixed launcher defaults.
        try {
            String statusRgb = String.format(Locale.ROOT, "%06X", 0xFFFFFF & statusBarColor);
            String navRgb = String.format(Locale.ROOT, "%06X", 0xFFFFFF & navBarColor);
            preferences.set("StatusBarBackgroundColor", "#" + statusRgb);
            preferences.set("BackgroundColor", "0xFF" + navRgb);
        } catch (Exception ignore) {
            /* preference mirroring is best-effort */
        }

        // 2. Colour the actual surfaces behind the system bars.
        //    The nav bar area shows the root background behind the transparent
        //    system bar, so it must match the navigation colour.
        View root = activity.findViewById(android.R.id.content);
        if (root != null) root.setBackgroundColor(navBarColor);

        View statusBar = findStatusBarView();
        if (statusBar != null) statusBar.setBackgroundColor(statusBarColor);

        if (Build.VERSION.SDK_INT >= 21) {
            window.setStatusBarColor(statusBarColor);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            window.setNavigationBarColor(navBarColor);
        } else if (Build.VERSION.SDK_INT >= 21) {
            // Pre-O the navigation icons cannot be recoloured, so force a
            // dark background to keep the always-light icons readable.
            window.setNavigationBarColor(Color.BLACK);
        }

        // 3. Icon appearance per bar: white icons on a dark bg (appearance
        //    off), dark icons on a light bg (appearance on). Works on API 23+
        //    and is safe to call on older versions.
        WindowInsetsControllerCompat controllerCompat =
                WindowCompat.getInsetsController(window, decorView);
        controllerCompat.setAppearanceLightStatusBars(statusDarkIcons);
        controllerCompat.setAppearanceLightNavigationBars(navDarkIcons);
    }

    /**
     * Finds the synthetic status-bar strip cordova-android adds to the root
     * layout (tag "statusBarView") when it runs edge-to-edge.
     */
    private View findStatusBarView() {
        ViewParent parent = webView.getView().getParent();
        if (!(parent instanceof FrameLayout)) return null;
        FrameLayout root = (FrameLayout) parent;
        for (int i = 0; i < root.getChildCount(); i++) {
            View child = root.getChildAt(i);
            if (TAG_STATUS_BAR.equals(child.getTag())) {
                return child;
            }
        }
        return null;
    }

    private static int parseColor(String hex) {
        if (hex == null || hex.isEmpty()) return FALLBACK_COLOR;
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return FALLBACK_COLOR;
        }
    }
}