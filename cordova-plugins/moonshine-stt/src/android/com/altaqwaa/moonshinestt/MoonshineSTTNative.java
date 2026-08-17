package com.altaqwaa.moonshinestt;

/**
 * JNI bridge to the bundled transcribe.cpp (ggml) native engine.
 * Loads the five native libraries in dependency order.
 */
public final class MoonshineSTTNative {

    static {
        System.loadLibrary("ggml-base");
        System.loadLibrary("ggml");
        System.loadLibrary("ggml-cpu");
        System.loadLibrary("transcribe");
        System.loadLibrary("moonshine_stt");
    }

    private MoonshineSTTNative() {}

    public static native void nativeInit(String modelPath, int threads);

    public static native byte[] nativeTranscribe(float[] pcm, int nSamples);

    public static native void nativeClose();

    public static native String nativeVersion();
}
