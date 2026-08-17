package com.rn0x.prayerwatch;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Periodic safety net (15 min): re-arms the exact prayer alarms from the
 * stored schedule so the background keeps working even if the app process is
 * killed and never reopened. WorkManager survives process death via
 * JobScheduler — no foreground service involved.
 */
public class PrayerWatchWorker extends Worker {

    public PrayerWatchWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (!PrayerAlarmScheduler.isAdhanEnabled(getApplicationContext())) {
            return Result.success();
        }
        try {
            PrayerAlarmScheduler.scheduleAlarms(getApplicationContext());
            return Result.success();
        } catch (Exception ex) {
            return Result.retry();
        }
    }
}