package com.rn0x.prayerwatch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Legacy action receiver kept for manifest stability; the modern stop flow
 * (notification actions / swipe-dismiss) is handled by
 * {@link PrayerAdhanReceiver}.
 */
public class PrayerWatchActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context c, Intent intent) {
        // no-op — retained so older notifications keep finding a receiver
    }
}