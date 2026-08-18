package com.rn0x.qibla;

import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.Looper;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Tilt-compensated compass azimuth stream for the Qibla screen.
 *
 * <p>Primary source: {@link Sensor#TYPE_ROTATION_VECTOR} (fused
 * magnetometer + gyroscope + accelerometer). Fallback when unavailable:
 * {@link Sensor#TYPE_MAGNETIC_FIELD} + {@link Sensor#TYPE_ACCELEROMETER}
 * combined through {@link SensorManager#getRotationMatrix} with a simple
 * low-pass filter.</p>
 *
 * <p>The heading is the geographic bearing of the device's +Y (top) axis
 * projected on the horizontal plane — computed directly from the rotation
 * matrix as {@code atan2(R[1], R[4])}, without remapping. This matches the
 * JS {@code headingFromDeviceTop} convention (0 = north, clockwise), so the
 * ported math and the native stream stay in agreement. No (de)calibration
 * matrix is needed for a compass-only consumer.</p>
 *
 * <p>{@link SensorManager#SENSOR_DELAY_GAME} keeps the update rate high
 * enough for the JS-side EWMA to look smooth. No runtime permission is
 * required (the magnetometer is not a dangerous permission).</p>
 */
public class QiblaSensor extends CordovaPlugin implements SensorEventListener {

    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private Sensor magnetSensor;
    private Sensor accelerometerSensor;
    private Handler handler;

    private final float[] rotationMatrix = new float[9];
    private final float[] kGravity = new float[3];
    private final float[] kGeomagnetic = new float[3];
    private boolean hasGravity;
    private boolean hasGeomagnetic;

    private CallbackContext stream;
    private boolean streaming;
    private int lastAccuracy = SensorManager.SENSOR_STATUS_UNRELIABLE;

    /* ------------------------------------------------------------------ */

    @Override
    public boolean execute(String action, org.json.JSONArray args, CallbackContext ctx) throws JSONException {
        switch (action) {
            case "start":
                start(args.optJSONObject(0), ctx);
                return true;
            case "stop":
                stop(ctx);
                return true;
            case "isSupported":
                isSupported(ctx);
                return true;
        }
        return false;
    }

    /* ------------------------------------------------------------------ */

    private void start(JSONObject opts, CallbackContext ctx) {
        if (streaming) stopStream();
        Context c = cordova.getContext();
        if (c == null) {
            emitError(ctx, "error");
            return;
        }
        sensorManager = (SensorManager) c.getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager == null) {
            emitError(ctx, "sensor-unavailable");
            return;
        }

        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        magnetSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        if (rotationSensor == null && (magnetSensor == null || accelerometerSensor == null)) {
            emitError(ctx, "sensor-unavailable");
            return;
        }

        streaming = true;
        stream = ctx;

        if (rotationSensor != null) {
            register(rotationSensor);
        } else {
            register(magnetSensor);
            register(accelerometerSensor);
        }

        // Keep the JS callback alive; readings follow on the next sensor event.
        PluginResult ok = new PluginResult(PluginResult.Status.OK, new JSONObject());
        ok.setKeepCallback(true);
        ctx.sendPluginResult(ok);
    }

    private void register(Sensor sensor) {
        if (sensor == null || sensorManager == null) return;
        try {
            // SENSOR_DELAY_GAME (~50ms) keeps the needle smooth once the
            // JS-side EWMA is applied, at a still-acceptable battery cost.
            // A single shared Handler keeps the stream on the main looper and
            // avoids leaking a new Handler (and looper) across restart cycles.
            if (handler == null) handler = new Handler(Looper.getMainLooper());
            sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME, handler);
        } catch (RuntimeException ex) {
            // Sensor might have been unplugged/disabled mid-stream; ignore.
        }
    }

    @Override
    public void onDestroy() {
        stopStream();
        super.onDestroy();
    }

    @Override
    public void onReset() {
        stopStream();
    }

    private void stopStream() {
        if (sensorManager != null) {
            if (rotationSensor != null) sensorManager.unregisterListener(this, rotationSensor);
            if (magnetSensor != null) sensorManager.unregisterListener(this, magnetSensor);
            if (accelerometerSensor != null) sensorManager.unregisterListener(this, accelerometerSensor);
        }
        sensorManager = null;
        rotationSensor = null;
        magnetSensor = null;
        accelerometerSensor = null;
        hasGravity = false;
        hasGeomagnetic = false;
        lastAccuracy = SensorManager.SENSOR_STATUS_UNRELIABLE;
        handler = null;
        streaming = false;
        stream = null;
    }

    private void stop(CallbackContext ctx) {
        boolean was = streaming;
        stopStream();
        if (was) {
            emitError(ctx, "stopped");
        } else {
            ctx.success(true);
        }
    }

    /* ------------------------------------------------------------------ */

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!streaming || stream == null) return;

        float azimuth = Float.NaN;

        if (event.sensor.getType() == Sensor.TYPE_ROTATION_VECTOR) {
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);
            azimuth = headingFromMatrix(rotationMatrix);
        } else if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            gravityLowPass(event.values.clone());
            hasGravity = true;
        } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
            magneticLowPass(event.values.clone());
            hasGeomagnetic = true;
        }

        if (!Float.isNaN(azimuth)) {
            // Rotation vector already carries fused tilt compensation.
            publish(azimuth, event.accuracy);
            return;
        }

        if (hasGravity && hasGeomagnetic) {
            if (SensorManager.getRotationMatrix(rotationMatrix, null, kGravity, kGeomagnetic)) {
                float a = headingFromMatrix(rotationMatrix);
                if (!Float.isNaN(a)) publish(a, event.accuracy);
            }
        }
    }

    /**
     * Magnetic bearing of the device's +Y (top) axis projected onto the
     * horizontal plane, from the device→world rotation matrix (row-major).
     * Equivalent to the JS {@code headingFromDeviceTop}: the +Y axis in world
     * coordinates is {@code (R[1], R[4], R[7])}, so {@code az = atan2(R[1], R[4])}.
     * No remap is needed and there is no per-screen-orientation wobble.
     */
    private static float headingFromMatrix(float[] r) {
        return (float) Math.toDegrees(Math.atan2(r[1], r[4]));
    }

    private void publish(float rawAzimuth, int accuracy) {
        double n = ((rawAzimuth % 360) + 360) % 360;
        lastAccuracy = accuracy;
        PluginResult r = new PluginResult(PluginResult.Status.OK, readingJson(n, accuracy));
        r.setKeepCallback(true);
        stream.sendPluginResult(r);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        if (!streaming || stream == null) return;
        lastAccuracy = accuracy;
    }

    /* ------------------------------------------------------------------ */

    private void gravityLowPass(float[] values) {
        // Classic time-invariant low-pass: a=0.8 keeps the frame stable.
        final float alpha = 0.8f;
        for (int i = 0; i < 3; i++) {
            kGravity[i] = hasGravity ? alpha * kGravity[i] + (1 - alpha) * values[i] : values[i];
        }
    }

    private void magneticLowPass(float[] values) {
        final float alpha = 0.2f;
        for (int i = 0; i < 3; i++) {
            kGeomagnetic[i] = hasGeomagnetic ? values[i] + alpha * (kGeomagnetic[i] - values[i]) : values[i];
        }
    }

    /* ------------------------------------------------------------------ */

    private void isSupported(CallbackContext ctx) {
        Context c = cordova.getContext();
        boolean hasCompassFeature = false;
        if (c != null) {
            PackageManager pm = c.getPackageManager();
            hasCompassFeature = pm != null
                    && pm.hasSystemFeature(PackageManager.FEATURE_SENSOR_COMPASS);
        }
        SensorManager sm = c != null
                ? (SensorManager) c.getSystemService(Context.SENSOR_SERVICE)
                : null;
        boolean rotation = sm != null && sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null;
        boolean fallback = sm != null
                && sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null
                && sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null;

        boolean supported = rotation || fallback;
        String source = rotation ? "rotation-vector" : fallback ? "computed" : "none";
        try {
            ctx.success(new JSONObject()
                    .put("supported", supported)
                    .put("source", source)
                    .put("hasSensorFeature", hasCompassFeature));
        } catch (JSONException ignored) {
            ctx.error("json");
        }
    }

    private JSONObject readingJson(double azimuth, int accuracy) {
        boolean calibrated = accuracy > SensorManager.SENSOR_STATUS_UNRELIABLE;
        try {
            return new JSONObject()
                    .put("ok", true)
                    .put("azimuth", Math.round(azimuth * 10.0) / 10.0)
                    .put("accuracy", accuracy)
                    .put("calibrated", calibrated);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private void emitError(CallbackContext ctx, String code) {
        PluginResult r = new PluginResult(PluginResult.Status.OK, errorJson(code));
        r.setKeepCallback(false);
        ctx.sendPluginResult(r);
        stopStream();
    }

    private static JSONObject errorJson(String code) {
        try {
            return new JSONObject().put("ok", false).put("code", code);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }
}