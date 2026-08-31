package com.rn0x.prayerwatch;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Purely alarm-based scheduling (no foreground service, no persistent
 * notification). The app pushes an 8-day event schedule into the plugin; we
 * turn it into exact one-shot alarms for every adhan prayer in the next two
 * days. Worker/BootReceiver re-run this regularly so the alarms always track
 * the stored schedule even when the app is never reopened.
 */
public final class PrayerAlarmScheduler {

    static final String ACTION_ADHAN = "com.rn0x.prayerwatch.ADHAN_FIRED";
    static final String ACTION_ADHAN_TICK = "com.rn0x.prayerwatch.ADHAN_TICK";
    static final String EXTRA_PRAYER_ID = "prayerId";
    static final String EXTRA_LABEL = "label";
    static final String EXTRA_TS = "ts";
    static final String EXTRA_REMAINING = "remaining";

    /** A prayer stays in its "adhan window" (notification + count-up) for
     *  the adhan duration — matches AUTO_STOP_MS. The old 30-minute window
     *  caused the notification to linger and tick repeatedly long after the
     *  audio finished. */
    static final long ADHAN_WINDOW_MS = 5 * 60 * 1000L;
    /** How long the ringing itself may last before auto-stop. */
    static final long AUTO_STOP_MS = 5 * 60 * 1000L;

    private static final long TWO_DAYS_MS = 2L * 24L * 3600L * 1000L;

    private PrayerAlarmScheduler() {
    }

    /* ------------------------------------------------------------------ *
     * Stored state (written by PrayerWatch.start() / receivers)
     * ------------------------------------------------------------------ */

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PrayerWatch.PREFS, Context.MODE_PRIVATE);
    }

    public static boolean isAdhanEnabled(Context c) {
        return prefs(c).getBoolean(PrayerWatch.KEY_ENABLED, false);
    }

    public static boolean foregroundMute(Context c) {
        return PrayerWatch.isForeground();
    }

    /** The adhan file key the JS layer selected (may be the fallback default). */
    public static String storedAdhanSound(Context c) {
        String s = prefs(c).getString(PrayerWatch.KEY_ADHAN_SOUND, "");
        return (s == null || s.isEmpty() || "__custom__".equals(s))
                ? "عبد_الباسط.mp3"
                : s;
    }

    /** Record that an adhan fired (id/label/ts) for the in-app window pull. */
    public static void recordFired(Context c, String id, String label, long ts) {
        try {
            JSONObject o = new JSONObject();
            o.put("key", id);
            o.put("name", label);
            o.put("ts", ts);
            prefs(c).edit()
                    .putString(PrayerWatch.KEY_LAST_FIRED, o.toString())
                    .putString(PrayerWatch.KEY_DISMISSED_WINDOW, "")
                    .apply();
        } catch (Exception ignored) {
        }
    }

    /** Pull + keep the fired record (also used by the "فتح التطبيق" tap). */
    public static String peekFired(Context c) {
        return prefs(c).getString(PrayerWatch.KEY_LAST_FIRED, "");
    }

    public static void clearFired(Context c) {
        prefs(c).edit().remove(PrayerWatch.KEY_LAST_FIRED).apply();
    }

    /* ------------------------------------------------------------------ *
     * Schedule / cancel the prayer alarms
     * ------------------------------------------------------------------ */

    public static synchronized void scheduleAlarms(Context c) {
        cancelAlarms(c);
        if (!isAdhanEnabled(c)) return;

        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        List<Event> events = events(c);
        long appNow = PrayerTime.now(c);
        long realNow = System.currentTimeMillis();
        long horizon = appNow + TWO_DAYS_MS;
        long offset = PrayerTime.offset(c);
        boolean exact = PrayerWatch.canScheduleExactAlarms(c);
        boolean isManual = PrayerTime.isManual(c);
        for (Event e : events) {
            if (!e.isPrayer) continue;
            long alarmAtReal;
            // In manual testing mode, if the prayer just passed (within window) and would
            // otherwise be skipped, schedule it to fire in 2s so the user sees immediate
            // feedback when they set time to just after a prayer.
            boolean justPastWindow = e.ts > appNow - ADHAN_WINDOW_MS && e.ts <= appNow;
            if (justPastWindow && isManual) {
                alarmAtReal = realNow + 2000L;
            } else {
                if (e.ts <= appNow || e.ts > horizon) continue;
                alarmAtReal = e.ts - offset;
                // Guard: never schedule in the past real time (can happen if device clock jumps)
                if (alarmAtReal <= realNow) alarmAtReal = realNow + 1000L;
            }
            Intent i = adhanIntent(c, e.id, e.label, e.ts);
            PendingIntent pi = PendingIntent.getBroadcast(
                    c, stableRequestCode(e), i, flags());
            try {
                if (exact) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmAtReal, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmAtReal, pi);
                }
            } catch (SecurityException ignored) {
                try {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmAtReal, pi);
                } catch (Exception ignored2) {
                    /* give up on this one */
                }
            }
        }
    }

    public static synchronized void cancelAlarms(Context c) {
        cancelAlarmsFor(c, events(c));
        cancelAdhanTicks(c);
    }

    /** Cancel the exact PendingIntents for a supplied event list (used to
     *  orphan-clean the *old* schedule after a clockOffset/method change). */
    public static synchronized void cancelAlarmsFor(Context c, java.util.List<Event> list) {
        if (list == null || list.isEmpty()) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (Event e : list) {
            if (!e.isPrayer) continue;
            Intent i = adhanIntent(c, e.id, e.label, e.ts);
            // Stable code (new) + legacy ts-based code (old) for migration.
            PendingIntent piStable = PendingIntent.getBroadcast(
                    c, stableRequestCode(e), i, flags());
            am.cancel(piStable);
            PendingIntent piLegacy = PendingIntent.getBroadcast(
                    c, requestCode(e.ts), i, flags());
            am.cancel(piLegacy);
        }
    }

    /**
     * Schedule the next "+elapsed" notification update, one minute out.
     * When remaining hits 0 no further alarm is set.
     */
    public static void scheduleTick(Context c, String id, String label, long ts, int remaining) {
        if (remaining <= 0) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long at = System.currentTimeMillis() + 60_000L;
        Intent i = new Intent(c, PrayerAdhanReceiver.class)
                .setAction(ACTION_ADHAN_TICK)
                .putExtra(EXTRA_PRAYER_ID, id)
                .putExtra(EXTRA_LABEL, label)
                .putExtra(EXTRA_TS, ts)
                .putExtra(EXTRA_REMAINING, remaining);
        PendingIntent pi = PendingIntent.getBroadcast(
                c, tickRequestCode(ts), i, flags());
        try {
            if (PrayerWatch.canScheduleExactAlarms(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (Exception ignored) {
            /* tick best-effort */
        }
    }

    static synchronized void cancelAdhanTicks(Context c) {
        // Cancelled by clearing one pending intent with the same code; each
        // tick re-schedules only when outstanding. We simply cancel by the
        // known requestCode scheme once per recent fired window is overkill,
        // so we cancel the current window tick code via a stored ts placeholder:
        String fired = peekFired(c);
        if (fired == null || fired.isEmpty()) return;
        try {
            long ts = new JSONObject(fired).optLong("ts", 0L);
            if (ts == 0) return;
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(c, PrayerAdhanReceiver.class)
                    .setAction(ACTION_ADHAN_TICK)
                    .putExtra(EXTRA_PRAYER_ID, "")
                    .putExtra(EXTRA_LABEL, "")
                    .putExtra(EXTRA_TS, ts)
                    .putExtra(EXTRA_REMAINING, 0);
            PendingIntent pi = PendingIntent.getBroadcast(
                    c, tickRequestCode(ts), i, flags());
            am.cancel(pi);
        } catch (Exception ignored) {
        }
    }

    /* ------------------------------------------------------------------ */

    static Intent adhanIntent(Context c, String id, String label, long ts) {
        return new Intent(c, PrayerAdhanReceiver.class)
                .setAction(ACTION_ADHAN)
                .putExtra(EXTRA_PRAYER_ID, id)
                .putExtra(EXTRA_LABEL, label)
                .putExtra(EXTRA_TS, ts);
    }

    static int requestCode(long ts) {
        return (int) (ts % Integer.MAX_VALUE);
    }

    /** Stable code that survives small clock-offset shifts (±60min never
     *  changes the UTC day, so the same prayer on the same day keeps the
     *  same PendingIntent and an offset update correctly overwrites it). */
    static int stableRequestCode(Event e) {
        long day = e.ts / 86400000L;
        int h = e.id == null ? 0 : e.id.hashCode();
        // Mix day into the hash; keep positive for PendingIntent.
        return (h * 31 + (int) (day ^ (day >>> 32))) & 0x7fffffff;
    }

    static int tickRequestCode(long ts) {
        return (int) ((ts + 1_000_000L) % Integer.MAX_VALUE);
    }

    static int dpiFlags() {
        return android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    static int flags() {
        return dpiFlags();
    }

    /* ------------------------------------------------------------------ *
     * Schedule view (mirrors the JS event payload)
     * ------------------------------------------------------------------ */

    static List<Event> events(Context c) {
        List<Event> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(
                    prefs(c).getString(PrayerWatch.KEY_EVENTS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                long ts = o.optLong("ts", 0L);
                if (ts == 0) {
                    ts = isoMillis(o.optString("atIso", ""));
                }
                if (ts == 0) continue;
                out.add(new Event(
                        o.optString("key", ""),
                        o.optString("name", ""),
                        ts,
                        o.optBoolean("isPrayer", true)));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    /** Closest upcoming adhan prayer from the stored schedule, or null. */
    public static Event nextPrayer(Context c, long now) {
        Event best = null;
        for (Event e : events(c)) {
            if (!e.isPrayer) continue;
            if (e.ts > now && (best == null || e.ts < best.ts)) best = e;
        }
        return best;
    }

    /** Prayer whose adhan window (30 min) includes {@code now}, or null. */
    public static Event currentWindow(Context c, long now) {
        Event best = null;
        for (Event e : events(c)) {
            if (!e.isPrayer) continue;
            if (now >= e.ts && now - e.ts < ADHAN_WINDOW_MS) {
                if (best == null || e.ts > best.ts) best = e;
            }
        }
        return best;
    }

    static long isoMillis(String s) {
        if (s == null || s.length() < 20) return 0L;
        try {
            return java.time.Instant.parse(s).toEpochMilli();
        } catch (Exception ignored) {
            return 0L;
        }
    }

    /** 12-hour clock with Arabic AM/PM, e.g. "06:51 م". */
    public static String formatTime12(long ts) {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.setTimeInMillis(ts);
        int hour = cal.get(java.util.Calendar.HOUR_OF_DAY);
        int h12 = hour % 12;
        if (h12 == 0) h12 = 12;
        int minute = cal.get(java.util.Calendar.MINUTE);
        String suffix = hour < 12 ? "ص" : "م";
        return (h12 < 10 ? "0" : "") + h12 + ":" + (minute < 10 ? "0" : "") + minute + " " + suffix;
    }

    /** 24-hour clock "HH:MM", e.g. "14:30". */
    public static String formatTime24(long ts) {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.setTimeInMillis(ts);
        return pad2(cal.get(java.util.Calendar.HOUR_OF_DAY)) + ":" + pad2(cal.get(java.util.Calendar.MINUTE));
    }

    /** Time display for the notification, following the app's 12/24h setting. */
    public static String formatTime(long ts, Context c) {
        boolean twelve = prefs(c).getBoolean(PrayerWatch.KEY_TIMEFORMAT, true);
        return twelve ? formatTime12(ts) : formatTime24(ts);
    }

    /** Clock string H:MM:SS (hours always shown, like "-1:02:59"). */
    public static String formatClock(long ms) {
        long totalSec = Math.max(0, (ms + 999L) / 1000L);
        long h = totalSec / 3600;
        long m = (totalSec % 3600) / 60;
        long s = totalSec % 60;
        return h + ":" + pad2(m) + ":" + pad2(s);
    }

    private static String pad2(long v) {
        return v < 10 ? "0" + v : String.valueOf(v);
    }

    public static final class Event {
        public final String id;
        public final String label;
        public final long ts;
        public final boolean isPrayer;

        Event(String id, String label, long ts, boolean isPrayer) {
            this.id = id;
            this.label = label;
            this.ts = ts;
            this.isPrayer = isPrayer;
        }
    }
}