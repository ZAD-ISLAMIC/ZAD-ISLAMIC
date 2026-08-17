package com.rn0x.prayerwatch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Re-arms the exact prayer alarms after a reboot / app update. No foreground
 * service is involved — alarm-based scheduling survives process death, and
 * the periodic {@link PrayerWatchWorker} keeps it fresh afterwards.
 */
public class PrayerWatchBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context c, Intent intent) {
        if (intent == null) return;
        String a = intent.getAction();
        if (a == null
                || (!a.equals(Intent.ACTION_BOOT_COMPLETED)
                && !a.equals(Intent.ACTION_MY_PACKAGE_REPLACED)
                && !a.equals(Intent.ACTION_TIME_CHANGED)
                && !a.equals(Intent.ACTION_TIMEZONE_CHANGED))) {
            return;
        }
        if (!PrayerAlarmScheduler.isAdhanEnabled(c)) return;
        PrayerAlarmScheduler.scheduleAlarms(c);
    }
}