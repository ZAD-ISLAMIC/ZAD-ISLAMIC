package com.rn0x.prayerwatch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;

/**
 * Debug-only adhan trigger for the adb automation script.
 *
 * Listens for two actions while the app is a DEBUG build:
 *   - com.rn0x.prayerwatch.DEBUG_TEST  → force-play an adhan right now
 *   - com.rn0x.prayerwatch.DEBUG_STOP  → stop the ringing adhan + dismiss
 *
 * It is exported so `adb shell am broadcast` can reach it without touching
 * the UI, but EVERY action is ignored on release builds (the APK's debuggable
 * flag is checked first), so the extra manifest entry is inert in production.
 */
public class PrayerDebugReceiver extends BroadcastReceiver {

    public static final String ACTION_DEBUG_TEST = "com.rn0x.prayerwatch.DEBUG_TEST";
    public static final String ACTION_DEBUG_STOP = "com.rn0x.prayerwatch.DEBUG_STOP";

    private static boolean isDebuggable(Context c) {
        return (c.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (intent == null || !isDebuggable(c)) return;
        String action = intent.getAction();
        if (ACTION_DEBUG_TEST.equals(action)) {
            long ts = PrayerTime.now(c);
            String id = "debug_" + ts;
            PrayerAlarmScheduler.recordFired(c, id, "أذان تجريبي", ts);
            AdhanPlayback.start(c, id, "أذان تجريبي", ts, true);
            PrayerWatch.pushAdhanToJs(id, "أذان تجريبي", ts);
        } else if (ACTION_DEBUG_STOP.equals(action)) {
            AdhanPlayback.stop(c, true);
            PrayerAlarmScheduler.cancelAdhanTicks(c);
        }
    }
}
