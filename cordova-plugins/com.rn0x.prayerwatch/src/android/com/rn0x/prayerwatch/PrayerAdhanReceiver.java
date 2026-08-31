package com.rn0x.prayerwatch;

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
 * Receives the exact prayer alarms plus the minute-refresh and stop actions.
 * Rings the adhan with {@link AdhanPlayback} (MediaPlayer + WakeLock — no
 * foreground service), posts/refreshes the standard notification, and answers
 * the "stop" action / swipe-dismiss.
 */
public class PrayerAdhanReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context c, Intent intent) {
        final PendingResult pendingResult = goAsync();
        try {
            if (intent == null) return;
            String action = intent.getAction();
            if (AdhanPlayback.ACTION_STOP.equals(action)) {
                boolean dismissed = intent.getBooleanExtra("dismissed", true);
                if (dismissed) {
                    // Swipe-dismiss: remove the notification ONLY — the adhan
                    // keeps playing so the user can close it from the in-app
                    // modal. The tick chain will skip re-posting because the
                    // notificationDismissed flag is now set.
                    AdhanPlayback.dismissNotificationOnly(c);
                    PrayerAlarmScheduler.cancelAdhanTicks(c);
                } else {
                    // Explicit stop from in-app modal: stop everything.
                    AdhanPlayback.stop(c, true);
                    PrayerAlarmScheduler.cancelAdhanTicks(c);
                }
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
        // posts the simple notification, and pushes the event so the in-app
        // window opens immediately (SILENT — the WebView never replays it).
        // Foreground or background, one ring, one notification, one window.
        AdhanPlayback.start(c, id, label, ts, force);
        PrayerWatch.pushAdhanToJs(id, label, ts);
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
            // refresh() skips automatically if the notification was dismissed.
            AdhanPlayback.refresh(c, id, label, ts);
            PrayerAlarmScheduler.scheduleTick(c, id, label, ts, remaining - 1);
        } else {
            // The window is over — clean up: stop everything.
            AdhanPlayback.stop(c, true);
        }
    }
}