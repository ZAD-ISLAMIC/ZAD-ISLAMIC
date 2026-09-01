package com.rn0x.prayerwatch;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

import static com.rn0x.prayerwatch.PrayerAlarmScheduler.ACTION_ADHAN;
import static com.rn0x.prayerwatch.PrayerAlarmScheduler.ACTION_ADHAN_TICK;
import static com.rn0x.prayerwatch.PrayerAlarmScheduler.EXTRA_LABEL;
import static com.rn0x.prayerwatch.PrayerAlarmScheduler.EXTRA_PRAYER_ID;
import static com.rn0x.prayerwatch.PrayerAlarmScheduler.EXTRA_REMAINING;
import static com.rn0x.prayerwatch.PrayerAlarmScheduler.EXTRA_TS;

/**
 * Receives the exact prayer alarms plus the minute-refresh, stop, and snooze
 * actions. Rings the adhan with {@link AdhanPlayback} (MediaPlayer + WakeLock),
 * posts/refreshes the standard notification, answers the "stop" action, and
 * handles the "snooze 10 minutes" action.
 */
public class PrayerAdhanReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context c, Intent intent) {
        final PendingResult pendingResult = goAsync();
        try {
            if (intent == null) return;
            String action = intent.getAction();
            if (AdhanPlayback.ACTION_STOP.equals(action)) {
                // Stop everything: audio + notification + tick chain.
                AdhanPlayback.stop(c, true);
                PrayerAlarmScheduler.cancelAdhanTicks(c);
                return;
            }
            if (AdhanPlayback.ACTION_SNOOZE.equals(action)) {
                handleSnooze(c, intent);
                return;
            }
            if (ACTION_ADHAN.equals(action)) {
                handleAdhan(c, intent);
                return;
            }
            if (ACTION_ADHAN_TICK.equals(action)) {
                handleTick(c, intent);
                return;
            }
        } finally {
            pendingResult.finish();
        }
    }

    private void handleAdhan(Context c, Intent intent) {
        if (!PrayerAlarmScheduler.isAdhanEnabled(c)) return;
        String id = intent.getStringExtra(EXTRA_PRAYER_ID);
        String label = intent.getStringExtra(EXTRA_LABEL);
        long ts = intent.getLongExtra(EXTRA_TS, PrayerTime.now(c));
        boolean force = intent.getBooleanExtra("force", false);

        // Record the fired window for the in-app pull either way.
        PrayerAlarmScheduler.recordFired(c, id == null ? "" : id, label == null ? "" : label, ts);

        // Keep a fresh wake lock for the ring itself.
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK, "prayerwatch:adhan-receiver");
            wl.setReferenceCounted(false);
            wl.acquire(10_000L); // long enough for AdhanPlayback to take over
            try {
                wl.release();
            } catch (Exception ignored) {
            }
        }

        // The native layer is the single audio source: it always rings and
        // posts the notification, and pushes the event so the in-app window
        // opens immediately (SILENT — the WebView never replays it).
        AdhanPlayback.start(c, id, label, ts, force);
        PrayerWatch.pushAdhanToJs(id, label, ts);
    }

    /**
     * Handle snooze: stop current adhan, then schedule a new alarm 10 minutes
     * from now with the same prayer info. The snoozed alarm will fire as a
     * normal adhan with full audio + notification.
     */
    private void handleSnooze(Context c, Intent intent) {
        String id = intent.getStringExtra(EXTRA_PRAYER_ID);
        String label = intent.getStringExtra(EXTRA_LABEL);
        long ts = intent.getLongExtra(EXTRA_TS, PrayerTime.now(c));

        // Stop current adhan completely (audio + notification).
        AdhanPlayback.stop(c, true);
        PrayerAlarmScheduler.cancelAdhanTicks(c);

        // Schedule a new alarm 10 minutes from now.
        long snoozeAt = System.currentTimeMillis() + 10 * 60 * 1000L;
        String snoozeId = (id == null ? "snooze" : id + "_snooze");
        Intent i = PrayerAlarmScheduler.adhanIntent(c, snoozeId, label == null ? "الصلاة" : label, ts);
        i.putExtra("force", true);
        PendingIntent pi = PendingIntent.getBroadcast(
                c, (int) ((snoozeAt + 2_000_000L) % Integer.MAX_VALUE),
                i, PrayerAlarmScheduler.dpiFlags());

        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            try {
                if (PrayerWatch.canScheduleExactAlarms(c)) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeAt, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeAt, pi);
                }
            } catch (Exception ignored) {
            }
        }
    }

    private void handleTick(Context c, Intent intent) {
        String id = intent.getStringExtra(EXTRA_PRAYER_ID);
        String label = intent.getStringExtra(EXTRA_LABEL);
        long ts = intent.getLongExtra(EXTRA_TS, 0L);
        int remaining = intent.getIntExtra(EXTRA_REMAINING, 0);
        if (ts == 0) return;

        long now = PrayerTime.now(c);
        // Stay with the +count while inside the window.
        if (now - ts < PrayerAlarmScheduler.ADHAN_WINDOW_MS && remaining > 0) {
            // refresh() re-posts the notification with an updated +count.
            AdhanPlayback.refresh(c, id, label, ts);
            PrayerAlarmScheduler.scheduleTick(c, id, label, ts, remaining - 1);
        } else {
            // The window is over — clean up: stop everything.
            AdhanPlayback.stop(c, true);
        }
    }
}
