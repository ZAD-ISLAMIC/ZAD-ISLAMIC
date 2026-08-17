#include <jni.h>
#include <cstring>
#include <string>
#include <mutex>

#include "transcribe.h"

// JNI bridge exposing the transcribe.cpp C API to the MoonshineSTT plugin.
//
// A single session is kept alive across calls. All blocking work (model
// load, transcribe) happens on the caller's thread; the plugin already
// runs these on background threads, so the UI thread is never blocked.

static struct transcribe_session * g_session = nullptr;
static std::mutex g_mutex;

static jclass throwClass(JNIEnv * env, const char * clsName) {
    jclass cls = env->FindClass(clsName);
    if (cls != nullptr) {
        env->ThrowNew(cls, "");
    }
    return cls;
}

static void throwErr(JNIEnv * env, const char * message) {
    jclass cls = env->FindClass("java/lang/RuntimeException");
    if (cls != nullptr) {
        env->ThrowNew(cls, message);
    }
}

static std::string statusMessage(transcribe_status st) {
    const char * s = transcribe_status_string(st);
    return s != nullptr ? std::string(s) : std::string("unknown error");
}

extern "C" {

JNIEXPORT void JNICALL
Java_com_altaqwaa_moonshinestt_MoonshineSTTNative_nativeInit(JNIEnv * env, jclass, jstring modelPath, jint threads) {
    std::lock_guard<std::mutex> lock(g_mutex);

    if (g_session != nullptr) {
        transcribe_session_free(g_session);
        g_session = nullptr;
    }

    const char * path = env->GetStringUTFChars(modelPath, nullptr);
    if (path == nullptr) {
        throwErr(env, "null model path");
        return;
    }
    std::string pathStr(path);
    env->ReleaseStringUTFChars(modelPath, path);

    struct transcribe_model_load_params loadParams;
    transcribe_model_load_params_init(&loadParams);
    loadParams.backend = TRANSCRIBE_BACKEND_CPU;

    struct transcribe_session_params sessParams;
    transcribe_session_params_init(&sessParams);
    sessParams.n_threads = threads > 0 ? threads : 4;

    struct transcribe_session * session = nullptr;
    transcribe_status st = transcribe_open(pathStr.c_str(), &loadParams, &sessParams, &session);
    if (st != TRANSCRIBE_OK) {
        throwErr(env, ("model load failed: " + statusMessage(st)).c_str());
        return;
    }

    g_session = session;
}

JNIEXPORT jbyteArray JNICALL
Java_com_altaqwaa_moonshinestt_MoonshineSTTNative_nativeTranscribe(JNIEnv * env, jclass, jfloatArray pcm, jint nSamples) {
    std::lock_guard<std::mutex> lock(g_mutex);

    if (g_session == nullptr) {
        throwErr(env, "engine not initialized");
        return nullptr;
    }
    if (pcm == nullptr || nSamples <= 0) {
        throwErr(env, "invalid pcm input");
        return nullptr;
    }

    jfloat * samples = env->GetFloatArrayElements(pcm, nullptr);
    if (samples == nullptr) {
        throwErr(env, "cannot read pcm buffer");
        return nullptr;
    }

    transcribe_status st = transcribe_run(g_session, samples, nSamples, nullptr);
    env->ReleaseFloatArrayElements(pcm, samples, JNI_ABORT);

    if (st != TRANSCRIBE_OK && st != TRANSCRIBE_ERR_OUTPUT_TRUNCATED) {
        throwErr(env, ("transcribe failed: " + statusMessage(st)).c_str());
        return nullptr;
    }

    // Return the raw UTF-8 bytes instead of NewStringUTF. NewStringUTF
    // requires strict Modified UTF-8 and aborts the whole process when the
    // model output is truncated mid-multibyte-character (frequent on partial
    // decodes of a sliding audio window). The Java side decodes these bytes
    // leniently, replacing malformed sequences with U+FFFD.
    const char * text = transcribe_full_text(g_session);
    if (text == nullptr) text = "";
    jsize len = (jsize) strlen(text);
    jbyteArray out = env->NewByteArray(len);
    if (out == nullptr) {
        throwErr(env, "out of memory building result");
        return nullptr;
    }
    env->SetByteArrayRegion(out, 0, len, reinterpret_cast<const jbyte *>(text));
    return out;
}

JNIEXPORT void JNICALL
Java_com_altaqwaa_moonshinestt_MoonshineSTTNative_nativeClose(JNIEnv *, jclass) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_session != nullptr) {
        transcribe_session_free(g_session);
        g_session = nullptr;
    }
}

JNIEXPORT jstring JNICALL
Java_com_altaqwaa_moonshinestt_MoonshineSTTNative_nativeVersion(JNIEnv * env, jclass) {
    const char * v = transcribe_version();
    return env->NewStringUTF(v != nullptr ? v : "unknown");
}

} // extern "C"
