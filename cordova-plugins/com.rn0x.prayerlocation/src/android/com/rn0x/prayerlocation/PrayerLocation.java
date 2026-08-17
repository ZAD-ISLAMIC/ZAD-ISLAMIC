package com.rn0x.prayerlocation;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Minimal, self-contained GPS provider for prayer times.
 *
 * <p>Never depends on Google Play Services. Uses the classic
 * {@link LocationManager} single-update API and classifies failures into
 * stable codes: permission-denied, permission-permanent, gps-off, timeout.</p>
 */
public class PrayerLocation extends CordovaPlugin {

    private static final int REQ_LOCATION = 4201;
    private static final long DEFAULT_TIMEOUT_MS = 30_000L;

    private CallbackContext pending;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutTask = new Runnable() {
        @Override
        public void run() {
            if (pending == null) return;
            Activity a = cordova.getActivity();
            LocationManager lm = a != null
                    ? (LocationManager) a.getApplicationContext().getSystemService(Context.LOCATION_SERVICE)
                    : null;
            Location stale = lm != null ? bestLastKnown(lm) : null;
            if (stale != null) {
                // Prefer a stale-but-real fix over failing outright; caller sees weak.
                stopListening();
                CallbackContext c = pending;
                pending = null;
                publishFix(c, stale);
            } else {
                finishError("timeout");
            }
        }
    };
    private LocationListener activeListener;
    private LocationManager activeManager;
    private boolean locSvcEnabled;
    private boolean permDeniedPermanent;

    /* ------------------------------------------------------------------ */

    @Override
    public boolean execute(String action, org.json.JSONArray args, CallbackContext ctx) throws JSONException {
        switch (action) {
            case "getCurrentPosition":
                getCurrentPosition(ctx);
                return true;
            case "requestPermission":
                requestPermission(ctx);
                return true;
            case "permissionStatus":
                permissionStatus(ctx);
                return true;
            case "isEnabled":
                isEnabled(ctx);
                return true;
            case "openSettings":
                openSettings(ctx);
                return true;
        }
        return false;
    }

    /* ------------------------------------------------------------------ */

    private void getCurrentPosition(CallbackContext ctx) {
        Activity a = cordova.getActivity();
        if (a == null) {
            callError(ctx, "error", "no activity");
            return;
        }
        Context c = a.getApplicationContext();
        LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
        locSvcEnabled = lm != null
                && (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));

        if (!locSvcEnabled) {
            callError(ctx, "gps-off", null);
            return;
        }
        if (!hasPermission(a)) {
            pending = ctx;
            permDeniedPermanent = false;
            cordova.requestPermissions(this, REQ_LOCATION, new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
            });
            return;
        }
        acquireFix(ctx);
    }

    private void acquireFix(CallbackContext ctx) {
        Activity a = cordova.getActivity();
        if (a == null) {
            callError(ctx, "error", null);
            return;
        }
        LocationManager lm = (LocationManager) a.getApplicationContext()
                .getSystemService(Context.LOCATION_SERVICE);

        // Fresh cached fix is a fast, legitimate result — use it if available.
        Location cached = bestLastKnown(lm);
        if (cached != null && System.currentTimeMillis() - cached.getTime() < 90_000L) {
            publishFix(ctx, cached);
            return;
        }

        LocationListener listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location loc) {
                if (loc == null) return;
                stopListening();
                publishFix(ctx, loc);
            }

            @Override
            public void onStatusChanged(String p, int status, Bundle extras) {
            }

            @Override
            public void onProviderEnabled(String p) {
            }

            @Override
            public void onProviderDisabled(String p) {
            }
        };

        activeListener = listener;
        activeManager = lm;
        handler.removeCallbacks(timeoutTask);
        handler.postDelayed(timeoutTask, DEFAULT_TIMEOUT_MS);

        int providers = 0;
        // Subscribe to GPS + network at once; whichever reports first wins.
        if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            providers++;
            requestUpdate(lm, LocationManager.GPS_PROVIDER, listener, ctx);
        }
        if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            providers++;
            requestUpdate(lm, LocationManager.NETWORK_PROVIDER, listener, ctx);
        }
        if (providers == 0) {
            stopListening();
            Location stale = bestLastKnown(lm);
            if (stale != null) {
                publishFix(ctx, stale);
            } else {
                callError(ctx, "gps-off", null);
            }
        }
    }

    private void requestUpdate(LocationManager lm, String provider, LocationListener listener, CallbackContext ctx) {
        try {
            lm.requestSingleUpdate(provider, listener, Looper.getMainLooper());
        } catch (SecurityException ex) {
            // one provider banned; try the next one via the caller loop
        } catch (IllegalArgumentException ignored) {
            // provider no longer available
        }
    }

    /** Prefer the newest, most accurate enabled-provider cache. */
    private Location bestLastKnown(LocationManager lm) {
        Location best = null;
        for (String p : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
            try {
                Location l = lm.getLastKnownLocation(p);
                if (l == null) continue;
                if (best == null || l.getTime() > best.getTime()) best = l;
            } catch (SecurityException | IllegalArgumentException ignored) {
            }
        }
        return best;
    }

    private void publishFix(CallbackContext ctx, Location loc) {
        pending = null;
        stopListening();
        try {
            JSONObject coords = new JSONObject()
                    .put("latitude", loc.getLatitude())
                    .put("longitude", loc.getLongitude())
                    .put("accuracy", loc.hasAccuracy() ? (double) loc.getAccuracy() : JSONObject.NULL)
                    .put("altitude", loc.hasAltitude() ? (double) loc.getAltitude() : JSONObject.NULL)
                    .put("provider", loc.getProvider());
            boolean weak = !loc.hasAccuracy() || loc.getAccuracy() > 3000f;
            ctx.success(new JSONObject()
                    .put("ok", true)
                    .put("weak", weak)
                    .put("coords", coords));
        } catch (JSONException e) {
            callError(ctx, "error", e.getMessage());
        }
    }

    private void stopListening() {
        handler.removeCallbacks(timeoutTask);
        if (activeManager != null && activeListener != null) {
            try {
                activeManager.removeUpdates(activeListener);
            } catch (Exception ignored) {
            }
        }
        activeManager = null;
        activeListener = null;
    }

    /* ------------------------------------------------------------------ */

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQ_LOCATION || pending == null) return;
        Activity a = cordova.getActivity();
        boolean granted = hasPermission(a);
        if (granted) {
            acquireFix(pending);
            pending = null;
            return;
        }
        permDeniedPermanent =
                a != null
                        && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && !a.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION);
        finishError(permDeniedPermanent ? "permission-permanent" : "permission-denied");
    }

    private void requestPermission(CallbackContext ctx) {
        Activity a = cordova.getActivity();
        if (a == null) {
            callError(ctx, "error", null);
            return;
        }
        if (hasPermission(a)) {
            permSuccess(ctx, true);
            return;
        }
        pending = ctx;
        cordova.requestPermissions(this, REQ_LOCATION, new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
        });
    }

    private void permissionStatus(CallbackContext ctx) {
        Activity a = cordova.getActivity();
        permSuccess(ctx, a != null && hasPermission(a));
    }

    private void isEnabled(CallbackContext ctx) {
        Activity a = cordova.getActivity();
        boolean gps = false, network = false;
        if (a != null) {
            LocationManager lm = (LocationManager) a.getApplicationContext()
                    .getSystemService(Context.LOCATION_SERVICE);
            if (lm != null) {
                gps = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
                network = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
            }
        }
        try {
            ctx.success(new JSONObject()
                    .put("enabled", gps || network)
                    .put("gps", gps)
                    .put("network", network));
        } catch (JSONException ignored) {
            ctx.error("json");
        }
    }

    private void openSettings(CallbackContext ctx) {
        Activity a = cordova.getActivity();
        if (a == null) {
            callError(ctx, "error", null);
            return;
        }
        Intent intent;
        if (permDeniedPermanent || !hasPermission(a)) {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + a.getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        }
        try {
            a.startActivity(intent);
            ctx.success(true);
        } catch (Exception ex) {
            callError(ctx, "error", ex.getMessage());
        }
    }

    /* ------------------------------------------------------------------ */

    private boolean hasPermission(Activity a) {
        return a != null
                && (ActivityCompat.checkSelfPermission(a, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ActivityCompat.checkSelfPermission(a, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED);
    }

    private void finishError(String code) {
        if (pending != null) {
            callError(pending, code, null);
            pending = null;
        }
        stopListening();
    }

    private static void permSuccess(CallbackContext ctx, boolean granted) {
        try {
            ctx.success(new JSONObject()
                    .put("granted", granted)
                    .put("status", granted ? "granted" : "denied"));
        } catch (JSONException ignored) {
            ctx.error("json");
        }
    }

    private static void callError(CallbackContext ctx, String code, String detail) {
        try {
            JSONObject o = new JSONObject().put("ok", false).put("code", code);
            if (detail != null) o.put("detail", detail);
            ctx.success(o);
        } catch (JSONException ignored) {
            ctx.error(code);
        }
    }
}