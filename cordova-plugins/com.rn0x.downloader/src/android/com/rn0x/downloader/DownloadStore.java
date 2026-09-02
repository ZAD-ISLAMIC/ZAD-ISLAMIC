package com.rn0x.downloader;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lightweight download state persistence using SharedPreferences.
 * Stores per-download metadata: url, path, bytes downloaded, state.
 */
public class DownloadStore {

    private static final String PREFS_NAME = "rn0x_downloader";
    private static final String KEY_PREFIX = "dl_";

    private final SharedPreferences prefs;

    public DownloadStore(Context context) {
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public void save(DownloadInfo info) {
        try {
            JSONObject json = new JSONObject();
            json.put("id", info.id);
            json.put("url", info.url);
            json.put("path", info.path);
            json.put("fileName", info.fileName);
            json.put("bytesDownloaded", info.bytesDownloaded);
            json.put("totalBytes", info.totalBytes);
            json.put("state", info.state);
            json.put("createdAt", info.createdAt);
            json.put("updatedAt", System.currentTimeMillis());
            prefs.edit().putString(KEY_PREFIX + info.id, json.toString()).apply();
        } catch (Exception ignored) {}
    }

    public DownloadInfo load(String id) {
        String raw = prefs.getString(KEY_PREFIX + id, null);
        if (raw == null) return null;
        try {
            JSONObject json = new JSONObject(raw);
            DownloadInfo info = new DownloadInfo();
            info.id = json.getString("id");
            info.url = json.getString("url");
            info.path = json.optString("path", "");
            info.fileName = json.optString("fileName", "");
            info.bytesDownloaded = json.optLong("bytesDownloaded", 0);
            info.totalBytes = json.optLong("totalBytes", 0);
            info.state = json.optString("state", "pending");
            info.createdAt = json.optLong("createdAt", 0);
            return info;
        } catch (Exception e) {
            return null;
        }
    }

    public void remove(String id) {
        prefs.edit().remove(KEY_PREFIX + id).apply();
    }

    public JSONArray listAll() {
        JSONArray result = new JSONArray();
        for (var entry : prefs.getAll().entrySet()) {
            if (entry.getKey().startsWith(KEY_PREFIX) && entry.getValue() instanceof String) {
                try {
                    result.put(new JSONObject((String) entry.getValue()));
                } catch (Exception ignored) {}
            }
        }
        return result;
    }

    public void clear() {
        prefs.edit().clear().apply();
    }

    public static class DownloadInfo {
        public String id;
        public String url;
        public String path;
        public String fileName;
        public long bytesDownloaded;
        public long totalBytes;
        public String state;
        public long createdAt;
    }
}
