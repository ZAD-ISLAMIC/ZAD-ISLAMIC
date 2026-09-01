package com.rn0x.prayerwatch;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;
import org.apache.cordova.PluginResult;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/**
 * Cordova bridge for the prayer-times background stack.
 *
 * Design (no foreground service, Play-friendly):
 *  - the JS layer computes the 8-day schedule and hands it to {@code start};
 *  - {@link PrayerAlarmScheduler} turns it into exact one-shot alarms;
 *  - at the alarm time {@link PrayerAdhanReceiver} rings via
 *    {@link AdhanPlayback} (MediaPlayer + WakeLock) and posts one standard
 *    notification with a stop action and a tap → app / in-app adhan window;
 *  - {@code consumeScreen}/{@code subscribe} keep the tap navigation working.
 *  - {@code WorkManager}/{@code BOOT_COMPLETED} re-arm the alarms so the
 *    background keeps working even if the app is never reopened.
 */
public class PrayerWatch extends CordovaPlugin {

    public static final String PREFS = "prayerwatch";
    public static final String KEY_ENABLED = "enabled";
    public static final String KEY_NOTIFICATIONS = "notifications";
    public static final String KEY_ADHAN_BG = "adhanEnabled";
    public static final String KEY_EVENTS = "events";
    public static final String KEY_CITY = "city";
    public static final String KEY_HIJRI = "hijri";
    public static final String KEY_ADHAN_SOUND = "adhanSound";
    public static final String KEY_ADHAN_VOLUME = "adhanVolume";
    public static final String KEY_RESPECT_SOUND = "respectSoundMode";
    public static final String KEY_TIMEFORMAT = "timeFormat12";
    public static final String KEY_LAST_FIRED = "lastFired";
    public static final String KEY_DISMISSED_WINDOW = "dismissedWindow";
    public static final String KEY_BANNER_DISMISSED = "banner_dismissed_prayer";
    public static final String KEY_LAST_NOTIFIED = "last_notified";

    public static final String ACTION_ADHAN = "com.rn0x.prayerwatch.ADHAN_FIRED";

    public static final String EXTRA_SCREEN = "screen";
    public static final String EXTRA_PRAYER_ID = "prayerId";
    public static final String SCREEN_PRAYER = "/prayer";

    private static final int REQ_POST_NOTIFICATIONS = 4101;

    private static boolean sForeground = false;

    private CallbackContext pendingPermissionCb;
    private CallbackContext pushListener;
    private String pendingScreen = null;

    private static PrayerWatch sInstance;

    @Override
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        super.initialize(cordova, webView);
        sInstance = this;
    }

    /** Whether the app's UI is the visible foreground (used by the receiver). */
    public static boolean isForeground() {
        return sForeground;
    }

    @Override
    public boolean execute(String action, org.json.JSONArray args, CallbackContext ctx) throws JSONException {
        switch (action) {
            case "start":
                start(args != null && args.length() > 0 ? args.optJSONObject(0) : null, ctx);
                return true;
            case "stop":
                stop(ctx);
                return true;
            case "sync":
                sync(ctx); // alias of start used by refresh calls
                return true;
            case "requestNotification":
                requestPermission(ctx);
                return true;
            case "permissionStatus":
                permissionStatus(ctx);
                return true;
            case "consumeScreen":
                consumeScreen(ctx);
                return true;
            case "subscribe":
                subscribe(ctx);
                return true;
            case "stopAdhan":
                stopAdhan(ctx);
                return true;
            case "snoozeAdhan":
                snoozeAdhan(ctx);
                return true;
            case "exactAlarms":
                exactAlarms(ctx);
                return true;
            case "status":
                status(ctx);
                return true;
            case "openSettings":
                openSettings(args != null && args.length() > 0 ? args.optString(0, "") : "", ctx);
                return true;
            case "getWindow":
                getWindow(ctx);
                return true;
            case "getLastFired":
                getLastFired(ctx);
                return true;
            case "getAudioState":
                getAudioState(ctx);
                return true;
            case "setAdhanVolume":
                setAdhanVolume(args != null && args.length() > 0 ? args.optDouble(0, 1.0) : 1.0, ctx);
                return true;
            case "getAdhanVolume":
                getAdhanVolume(ctx);
                return true;
            case "testNow":
                testNow(ctx);
                return true;
        }
        return false;
    }

    /* ------------------------------------------------------------------ */

    @Override
    public void onStart() {
        sForeground = true;
    }

    @Override
    public void onStop() {
        sForeground = false;
    }

    @Override
    public void onResume(boolean multitasking) {
        super.onResume(multitasking);
        sForeground = true;
        if (pendingScreen != null && pushListener != null) {
            sendScreen(pendingScreen);
            pendingScreen = null;
        }
    }

    @Override
    public void onPause(boolean multitasking) {
        super.onPause(multitasking);
        sForeground = false;
    }

    @Override
    public void onDestroy() {
        sForeground = false;
        super.onDestroy();
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String screen = intent != null ? intent.getStringExtra(EXTRA_SCREEN) : null;
        if (screen == null) return;
        pendingScreen = screen;
        intent.removeExtra(EXTRA_SCREEN);
        if (pushListener != null) sendScreen(screen);
        pendingScreen = null;
    }

    private void sendScreen(String screen) {
        if (pushListener == null) return;
        PluginResult r = new PluginResult(PluginResult.Status.OK, screen == null ? "" : screen);
        r.setKeepCallback(true);
        pushListener.sendPluginResult(r);
    }

    /**
     * Push a just-fired adhan onto the open JS push channel so the in-app
     * adhan window opens immediately (the WebView shows it SILENT — the native
     * layer is the single audio source). Best-effort: if the app process is
     * gone or nothing subscribed, the notification window pull still covers it.
     */
    public static void pushAdhanToJs(String key, String name, long ts) {
        PrayerWatch inst = sInstance;
        if (inst == null || inst.pushListener == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("t", "adhan");
            o.put("key", key);
            o.put("name", name == null ? "" : name);
            o.put("ts", ts);
            PluginResult r = new PluginResult(PluginResult.Status.OK, o.toString());
            r.setKeepCallback(true);
            inst.pushListener.sendPluginResult(r);
        } catch (Exception ignored) {
        }
    }

    /* ------------------------------------------------------------------ */

    private void consumeScreen(CallbackContext ctx) {
        Activity a = this.cordova.getActivity();
        if (pendingScreen == null && a != null) {
            Intent i = a.getIntent();
            if (i != null) pendingScreen = i.getStringExtra(EXTRA_SCREEN);
        }
        String screen = pendingScreen;
        pendingScreen = null;
        if (a != null && a.getIntent() != null) {
            a.getIntent().removeExtra(EXTRA_SCREEN);
        }
        ctx.success(screen == null ? "" : screen);
    }

    private void subscribe(CallbackContext ctx) {
        pushListener = ctx;
        PluginResult r = new PluginResult(PluginResult.Status.NO_RESULT);
        r.setKeepCallback(true);
        ctx.sendPluginResult(r);
    }

    private void getWindow(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        String fired = PrayerAlarmScheduler.peekFired(c);
        if (fired == null || fired.isEmpty()) {
            ctx.success(new JSONObject());
            return;
        }
        try {
            JSONObject o = new JSONObject(fired);
            long ts = o.optLong("ts", 0L);
            boolean dismiss = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_DISMISSED_WINDOW, "")
                    .equals(o.optString("key", ""));
            if (ts == 0 || dismiss || PrayerTime.now(c) - ts >= PrayerAlarmScheduler.ADHAN_WINDOW_MS) {
                // Keep the record for dedupe (don't clear) — just don't show UI after window
                ctx.success(new JSONObject());
                return;
            }
            ctx.success(o);
        } catch (Exception e) {
            ctx.success(new JSONObject());
        }
    }

    private void getLastFired(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        String fired = PrayerAlarmScheduler.peekFired(c);
        if (fired == null || fired.isEmpty()) {
            ctx.success(new JSONObject());
            return;
        }
        try {
            ctx.success(new JSONObject(fired));
        } catch (Exception e) {
            ctx.success(new JSONObject());
        }
    }

    /** Read-only snapshot of the device audio state (no permission needed). */
    private void getAudioState(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        try {
            JSONObject o = new JSONObject();
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            int mode = am == null ? AudioManager.RINGER_MODE_NORMAL : am.getRingerMode();
            String ringer = "normal";
            if (mode == AudioManager.RINGER_MODE_SILENT) {
                ringer = "silent";
            } else if (mode == AudioManager.RINGER_MODE_VIBRATE) {
                ringer = "vibrate";
            }
            o.put("ringerMode", ringer);
            if (am != null) {
                o.put("alarmVolume", am.getStreamVolume(AudioManager.STREAM_ALARM));
                o.put("alarmMax", am.getStreamMaxVolume(AudioManager.STREAM_ALARM));
            } else {
                o.put("alarmVolume", 0);
                o.put("alarmMax", 0);
            }
            ctx.success(o);
        } catch (Exception e) {
            ctx.error(e.getMessage());
        }
    }

    /** Set the adhan loudness (0..1) — applies live + persists as default. */
    private void setAdhanVolume(double volume, CallbackContext ctx) {
        Context c = this.cordova.getContext();
        float v = (float) Math.min(1.0, Math.max(0.0, volume));
        if (Float.isNaN(v)) v = 1f;
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putFloat(KEY_ADHAN_VOLUME, v).apply();
        AdhanPlayback.setAdhanVolume(c, v);
        ctx.success(true);
    }

    /** Current adhan loudness + live playback info. */
    private void getAdhanVolume(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        try {
            JSONObject o = new JSONObject();
            o.put("volume", storedAdhanVolume(c));
            AdhanPlayback.VolumeState s = AdhanPlayback.volumeState(c);
            o.put("playing", s.playing);
            o.put("alarmVolume", s.alarmVolume);
            o.put("alarmMax", s.alarmMax);
            ctx.success(o);
        } catch (Exception e) {
            ctx.error(e.getMessage());
        }
    }

    /** Stored adhan loudness in 0..1 (prefs). */
    static float storedAdhanVolume(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getFloat(KEY_ADHAN_VOLUME, 1.0f);
    }

    private void testNow(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        long appAt = PrayerTime.now(c) + 20_000L;
        long realAt = System.currentTimeMillis() + 20_000L;
        String id = "test_" + appAt;
        Intent i = new Intent(c, PrayerAdhanReceiver.class)
                .setAction(PrayerAlarmScheduler.ACTION_ADHAN)
                .putExtra(PrayerAlarmScheduler.EXTRA_PRAYER_ID, id)
                .putExtra(PrayerAlarmScheduler.EXTRA_LABEL, "تجربة الأذان")
                .putExtra(PrayerAlarmScheduler.EXTRA_TS, appAt)
                .putExtra("force", true);
        PendingIntent pi = PendingIntent.getBroadcast(c, 777, i, dpiFlags());
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            ctx.error("no alarm service");
            return;
        }
        try {
            if (PrayerWatch.canScheduleExactAlarms(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, realAt, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, realAt, pi);
            }
            ctx.success(true);
        } catch (Exception ex) {
            ctx.error(ex.getMessage());
        }
    }

    /* ------------------------------------------------------------------ *
     * Sync payload (JS → native)
     * ------------------------------------------------------------------ */

    private void stopAdhan(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        // Stop the ring but keep the simple notification on screen; dismissing
        // is the user's job (swipe) or the next prayer overwrites it.
        AdhanPlayback.stop(c, false);
        PrayerAlarmScheduler.cancelAdhanTicks(c);
        PrayerAlarmScheduler.clearFired(c);
        ctx.success(true);
    }

    private void snoozeAdhan(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        // Stop the current adhan completely.
        AdhanPlayback.stop(c, true);
        PrayerAlarmScheduler.cancelAdhanTicks(c);

        // Get the last fired prayer info for snooze.
        String fired = PrayerAlarmScheduler.peekFired(c);
        String id = "snooze";
        String label = "الصلاة";
        long ts = PrayerTime.now(c);
        try {
            if (fired != null && !fired.isEmpty()) {
                org.json.JSONObject o = new org.json.JSONObject(fired);
                id = o.optString("key", id) + "_snooze";
                label = o.optString("name", label);
                ts = o.optLong("ts", ts);
            }
        } catch (Exception ignored) {}

        // Schedule a new alarm 10 minutes from now.
        long snoozeAt = System.currentTimeMillis() + 10 * 60 * 1000L;
        Intent i = PrayerAlarmScheduler.adhanIntent(c, id, label, ts);
        i.putExtra("force", true);
        PendingIntent pi = PendingIntent.getBroadcast(
                c, (int) ((snoozeAt + 2_000_000L) % Integer.MAX_VALUE),
                i, dpiFlags());
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            try {
                if (canScheduleExactAlarms(c)) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeAt, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeAt, pi);
                }
                ctx.success(true);
            } catch (Exception ex) {
                ctx.error(ex.getMessage());
            }
        } else {
            ctx.error("no alarm service");
        }
    }

    private void start(JSONObject opts, CallbackContext ctx) {
        Context c = this.cordova.getContext();
        boolean enabled = opts == null || opts.optBoolean("enabled", true);
        boolean adhanEnabled = opts == null || opts.optBoolean("adhanEnabled", true);
        String events = opts == null ? "[]" : opts.optString("events", "[]");
        // Handle events as JSONArray if passed as array (Cordova may serialize as JSONArray)
        if (opts != null && opts.has("events") && !(opts.opt("events") instanceof String)) {
            try { events = opts.getJSONArray("events").toString(); } catch (Exception ignored) {}
        }
        String city = opts == null ? "" : opts.optString("city", "");
        String hijri = opts == null ? "" : opts.optString("hijri", "");
        String adhanSound = opts == null ? "" : opts.optString("adhanSound", "");
        boolean respectSound = opts == null || opts.optBoolean("respectSoundMode", false);
        double adhanVolume = opts == null ? 1.0 : opts.optDouble("adhanVolume", 1.0);
        float vol = (float) Math.min(1.0, Math.max(0.0, adhanVolume));
        if (Float.isNaN(vol)) vol = 1f;
        String timeMode = opts == null ? "auto" : opts.optString("timeMode", "auto");
        String manualIso = opts == null ? "" : opts.optString("manualIso", "");
        long manualSetAt = opts == null ? 0L : opts.optLong("manualSetAt", 0L);
        // Also support nested timeSource object for backward compat
        if (opts != null && opts.has("timeSource")) {
            try {
                JSONObject ts = opts.getJSONObject("timeSource");
                timeMode = ts.optString("mode", timeMode);
                manualIso = ts.optString("manualIso", manualIso);
                manualSetAt = ts.optLong("manualSetAt", manualSetAt);
            } catch (Exception ignored) {}
        }

        // Capture old events BEFORE overwriting prefs so we can cancel their alarms.
        java.util.List<PrayerAlarmScheduler.Event> oldEvents = PrayerAlarmScheduler.events(c);
        long oldOffset = PrayerTime.offset(c);

        // Persist unified time source for the entire native layer (commit = sync)
        PrayerTime.setTimeSource(c, timeMode, manualIso, manualSetAt);

        SharedPreferences.Editor ed = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putBoolean(KEY_ENABLED, enabled);
        ed.putBoolean(KEY_ADHAN_BG, adhanEnabled);
        ed.putBoolean(KEY_RESPECT_SOUND, respectSound);
        ed.putBoolean(KEY_TIMEFORMAT, opts == null || opts.optBoolean("timeFormat12", true));
        ed.putString(KEY_EVENTS, events);
        ed.putString(KEY_CITY, city);
        ed.putString(KEY_HIJRI, hijri);
        ed.putString(KEY_ADHAN_SOUND, adhanSound);
        ed.putFloat(KEY_ADHAN_VOLUME, vol);
        ed.commit();

        try {
            if (!enabled) {
                // Cancel both old and new (new == old after apply) to be safe.
                PrayerAlarmScheduler.cancelAlarmsFor(c, oldEvents);
                PrayerAlarmScheduler.cancelAlarms(c);
                AdhanPlayback.stop(c, true);
                PrayerAlarmScheduler.cancelAdhanTicks(c);
                cancelWorker(c);
                ctx.success(new JSONObject().put("ok", true).put("running", false));
                return;
            }
            startWorker(c);
            // Cancel old ts-based alarms that are now stale.
            PrayerAlarmScheduler.cancelAlarmsFor(c, oldEvents);
            PrayerAlarmScheduler.scheduleAlarms(c);
            ctx.success(new JSONObject().put("ok", true).put("running", true));
        } catch (Exception ex) {
            ctx.error(ex.getMessage());
        }
    }

    private void stop(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        try {
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putBoolean(KEY_ENABLED, false).apply();
            PrayerAlarmScheduler.cancelAlarms(c);
            PrayerAlarmScheduler.cancelAdhanTicks(c);
            AdhanPlayback.stop(c, true);
            cancelWorker(c);
            ctx.success(true);
        } catch (Exception ex) {
            ctx.error(ex.getMessage());
        }
    }

    private void sync(CallbackContext ctx) {
        start(null, ctx);
    }

    /* ------------------------------------------------------------------ */

    private void startWorker(Context c) {
        PeriodicWorkRequest request =
                new PeriodicWorkRequest.Builder(PrayerWatchWorker.class, 15, TimeUnit.MINUTES)
                        .build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(
                "prayerwatch", ExistingPeriodicWorkPolicy.KEEP, request);
    }

    private void cancelWorker(Context c) {
        WorkManager.getInstance(c).cancelUniqueWork("prayerwatch");
    }

    /* ------------------------------------------------------------------ *
     * Permissions & status helpers
     * ------------------------------------------------------------------ */

    public static boolean canScheduleExactAlarms(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    public static void clearFired(Context c) {
        PrayerAlarmScheduler.clearFired(c);
    }


    private void requestPermission(CallbackContext ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            ctx.success(permResult(true));
            return;
        }
        Activity a = this.cordova.getActivity();
        if (a == null) {
            ctx.error("no activity");
            return;
        }
        if (ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            ctx.success(permResult(true));
            return;
        }
        pendingPermissionCb = ctx;
        cordova.requestPermissions(this, REQ_POST_NOTIFICATIONS,
                new String[]{Manifest.permission.POST_NOTIFICATIONS});
    }

    private void permissionStatus(CallbackContext ctx) {
        Activity a = this.cordova.getActivity();
        boolean granted = a != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED);
        ctx.success(permResult(granted));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQ_POST_NOTIFICATIONS || pendingPermissionCb == null) return;
        boolean granted = grantResults != null
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        pendingPermissionCb.success(permResult(granted));
        pendingPermissionCb = null;
    }

    private static JSONObject permResult(boolean granted) {
        try {
            return new JSONObject().put("granted", granted);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private void exactAlarms(CallbackContext ctx) {
        ctx.success(permResult(canScheduleExactAlarms(this.cordova.getContext())));
    }

    /** Aggregate runtime status for the settings UI. */
    private void status(CallbackContext ctx) {
        Context c = this.cordova.getContext();
        try {
            JSONObject o = new JSONObject();
            o.put("notifications", permissionStatusRaw(c));
            o.put("exactAlarms", canScheduleExactAlarms(c));
            o.put("batteryOptimized", isBatteryOptimized(c));
            o.put("scheduleArmed", PrayerAlarmScheduler.isAdhanEnabled(c));
            o.put("timeMode", PrayerTime.isManual(c) ? "manual" : "auto");
            o.put("timeOffsetMs", PrayerTime.offset(c));
            o.put("appNow", PrayerTime.now(c));
            o.put("oem", detectOEM());
            o.put("androidVersion", Build.VERSION.SDK_INT);
            o.put("manufacturer", Build.MANUFACTURER);
            o.put("model", Build.MODEL);
            ctx.success(o);
        } catch (JSONException e) {
            ctx.error(e.getMessage());
        }
    }

    private static boolean permissionStatusRaw(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Detect the device OEM to provide targeted battery optimization guidance.
     * Each manufacturer has different battery saving policies that can kill
     * background alarms.
     */
    private static String detectOEM() {
        String manufacturer = Build.MANUFACTURER.toLowerCase();
        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
            return "xiaomi";
        }
        if (manufacturer.contains("samsung")) {
            return "samsung";
        }
        if (manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus")) {
            return "oppo";
        }
        if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            return "huawei";
        }
        if (manufacturer.contains("vivo")) {
            return "vivo";
        }
        return "other";
    }

    private static boolean isBatteryOptimized(Context c) {
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
            return !pm.isIgnoringBatteryOptimizations(c.getPackageName());
        } catch (Exception e) {
            return true;
        }
    }

    /** Open the relevant system settings screen (no special permission needed). */
    private void openSettings(String kind, CallbackContext ctx) {
        Context c = this.cordova.getContext();
        Activity a = this.cordova.getActivity();
        try {
            Intent intent = null;
            if ("battery".equals(kind)) {
                intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            } else if ("alarms".equals(kind)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                            Uri.parse("package:" + c.getPackageName()));
                }
            } else if ("notifications".equals(kind)) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
            }
            if (intent == null) {
                ctx.error("unknown setting");
                return;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(intent);
            ctx.success(true);
        } catch (Exception ex) {
            // Fallback: app details page
            try {
                Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + c.getPackageName()));
                details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(details);
                ctx.success(true);
            } catch (Exception ignored) {
                ctx.error("cannot open settings");
            }
        }
    }

    private static int dpiFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }
}