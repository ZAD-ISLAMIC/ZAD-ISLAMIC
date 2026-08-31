package com.rn0x.prayerwatch;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Unified app-time source for the native layer.
 *
 * Mirrors the JS `getNowMs()` in prayerConfig.mjs:
 *   auto   -> System.currentTimeMillis()
 *   manual -> manualIso + (System.currentTimeMillis() - manualSetAt)
 *           = System.currentTimeMillis() + offset
 *           where offset = parse(manualIso) - manualSetAt
 *
 * All background scheduling, window checks and notifications MUST use
 * PrayerTime.now(c) instead of System.currentTimeMillis() so the whole
 * app (foreground + background) respects the user's chosen time source.
 */
public final class PrayerTime {

    static final String KEY_TIME_MODE = "timeMode";
    static final String KEY_MANUAL_ISO = "manualIso";
    static final String KEY_MANUAL_SET_AT = "manualSetAt";

    private PrayerTime() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PrayerWatch.PREFS, Context.MODE_PRIVATE);
    }

    /** Current offset in ms: manualBase - manualSetAt, or 0 in auto. */
    public static long offset(Context c) {
        SharedPreferences p = prefs(c);
        String mode = p.getString(KEY_TIME_MODE, "auto");
        if (!"manual".equals(mode)) return 0L;
        String iso = p.getString(KEY_MANUAL_ISO, "");
        long setAt = p.getLong(KEY_MANUAL_SET_AT, 0L);
        if (iso == null || iso.isEmpty() || setAt == 0L) return 0L;
        long base = parseIso(iso);
        if (base == 0L) return 0L;
        return base - setAt;
    }

    /** App-time now: real time + offset. */
    public static long now(Context c) {
        return System.currentTimeMillis() + offset(c);
    }

    public static boolean isManual(Context c) {
        return "manual".equals(prefs(c).getString(KEY_TIME_MODE, "auto"));
    }

    /** Persist the time source from JS — uses commit() so the next scheduleAlarms reads it instantly. */
    public static void setTimeSource(Context c, String mode, String manualIso, long manualSetAt) {
        SharedPreferences.Editor ed = prefs(c).edit();
        if ("manual".equals(mode) && manualIso != null && !manualIso.isEmpty() && manualSetAt != 0L) {
            ed.putString(KEY_TIME_MODE, "manual");
            ed.putString(KEY_MANUAL_ISO, manualIso);
            ed.putLong(KEY_MANUAL_SET_AT, manualSetAt);
        } else {
            ed.putString(KEY_TIME_MODE, "auto");
            ed.remove(KEY_MANUAL_ISO);
            ed.remove(KEY_MANUAL_SET_AT);
        }
        ed.commit();
    }

    static long parseIso(String s) {
        if (s == null || s.length() < 20) return 0L;
        try {
            return java.time.Instant.parse(s).toEpochMilli();
        } catch (Exception ignored) {
            return 0L;
        }
    }
}
