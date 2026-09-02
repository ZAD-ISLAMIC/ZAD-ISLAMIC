package com.rn0x.downloader;

import android.content.Context;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.PluginResult;

import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class DownloaderPlugin extends CordovaPlugin {

    private DownloadStore store;
    private final ConcurrentHashMap<String, UUID> activeWorkIds = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CallbackContext> progressCallbacks = new ConcurrentHashMap<>();

    @Override
    public void pluginInitialize() {
        super.pluginInitialize();
        store = new DownloadStore(cordova.getContext());
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext ctx) throws JSONException {
        switch (action) {
            case "download":
                startDownload(args.getJSONObject(0), ctx);
                return true;
            case "cancel":
                cancelDownload(args.getJSONObject(0).getString("id"), ctx);
                return true;
            case "cancelAll":
                cancelAll(ctx);
                return true;
            case "list":
                listDownloads(ctx);
                return true;
            case "getContentUri":
                getContentUri(args.getJSONObject(0).getString("path"), ctx);
                return true;
            case "httpGet":
                httpGet(args.getJSONObject(0), ctx);
                return true;
            default:
                return false;
        }
    }

    private void startDownload(JSONObject opts, CallbackContext ctx) throws JSONException {
        String id = opts.getString("id");
        String url = opts.getString("url");
        String fileName = opts.getString("fileName");
        String dir = opts.optString("dir", "downloads");

        // Resolve file path
        File filesDir = cordova.getContext().getFilesDir();
        File downloadDir = new File(filesDir, dir);
        if (!downloadDir.exists()) downloadDir.mkdirs();
        File file = new File(downloadDir, fileName);
        String path = file.getAbsolutePath();

        // Check for existing partial download
        long offset = 0;
        DownloadStore.DownloadInfo existing = store.load(id);
        if (existing != null && file.exists() && "paused".equals(existing.state)) {
            offset = file.length();
        }

        // Save download info
        DownloadStore.DownloadInfo info = new DownloadStore.DownloadInfo();
        info.id = id;
        info.url = url;
        info.path = path;
        info.fileName = fileName;
        info.bytesDownloaded = offset;
        info.totalBytes = 0;
        info.state = "running";
        info.createdAt = System.currentTimeMillis();
        store.save(info);

        // Build WorkManager request
        Data inputData = new Data.Builder()
                .putString("id", id)
                .putString("url", url)
                .putString("path", path)
                .putLong("offset", offset)
                .build();

        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        OneTimeWorkRequest workRequest = new OneTimeWorkRequest.Builder(DownloadWorker.class)
                .setInputData(inputData)
                .setConstraints(constraints)
                .build();

        // Store progress callback
        progressCallbacks.put(id, ctx);

        // Track work
        UUID workId = workRequest.getId();
        activeWorkIds.put(id, workId);

        // Observe progress
        WorkManager wm = WorkManager.getInstance(cordova.getContext());
        wm.enqueue(workRequest);

        wm.getWorkInfoByIdLiveData(workId).observe(cordova.getActivity(), workInfo -> {
            if (workInfo == null) return;

            CallbackContext progressCtx = progressCallbacks.get(id);
            if (progressCtx == null) return;

            // Progress update
            Data progress = workInfo.getProgress();
            if (progress.getLong("loaded", 0) > 0) {
                try {
                    JSONObject progressEvent = new JSONObject();
                    progressEvent.put("event", "progress");
                    progressEvent.put("loaded", progress.getLong("loaded", 0));
                    progressEvent.put("total", progress.getLong("total", 0));

                    PluginResult result = new PluginResult(PluginResult.Status.OK, progressEvent);
                    result.setKeepCallback(true);
                    progressCtx.sendPluginResult(result);
                } catch (JSONException ignored) {}
            }

            // Work finished
            if (workInfo.getState().isFinished()) {
                activeWorkIds.remove(id);
                progressCallbacks.remove(id);

                if (workInfo.getState() == WorkInfo.State.SUCCEEDED) {
                    Data output = workInfo.getOutputData();
                    try {
                        JSONObject successResult = new JSONObject();
                        successResult.put("success", true);
                        successResult.put("path", output.getString("path"));
                        successResult.put("id", id);
                        successResult.put("bytesDownloaded", output.getLong("bytesDownloaded", 0));
                        successResult.put("totalBytes", output.getLong("totalBytes", 0));

                        PluginResult result = new PluginResult(PluginResult.Status.OK, successResult);
                        progressCtx.sendPluginResult(result);
                    } catch (JSONException e) {
                        progressCtx.error("Failed to parse result");
                    }
                } else if (workInfo.getState() == WorkInfo.State.FAILED) {
                    Data output = workInfo.getOutputData();
                    try {
                        JSONObject errorResult = new JSONObject();
                        errorResult.put("success", false);
                        errorResult.put("code", output.getString("code"));
                        errorResult.put("message", output.getString("message"));
                        long httpStatus = output.getLong("httpStatus", 0);
                        if (httpStatus > 0) {
                            errorResult.put("httpStatus", httpStatus);
                        }

                        PluginResult result = new PluginResult(PluginResult.Status.OK, errorResult);
                        progressCtx.sendPluginResult(result);
                    } catch (JSONException e) {
                        progressCtx.error("Download failed");
                    }
                }
            }
        });
    }

    private void cancelDownload(String id, CallbackContext ctx) {
        UUID workId = activeWorkIds.remove(id);
        if (workId != null) {
            WorkManager.getInstance(cordova.getContext()).cancelWorkById(workId);
        }
        CallbackContext progressCtx = progressCallbacks.remove(id);
        if (progressCtx != null) {
            try {
                JSONObject result = new JSONObject();
                result.put("success", true);
                PluginResult pr = new PluginResult(PluginResult.Status.OK, result);
                progressCtx.sendPluginResult(pr);
            } catch (JSONException ignored) {}
        }

        // Update store
        DownloadStore.DownloadInfo info = store.load(id);
        if (info != null) {
            info.state = "cancelled";
            store.save(info);
        }

        ctx.success(new JSONObject());
    }

    private void cancelAll(CallbackContext ctx) {
        for (Map.Entry<String, UUID> entry : activeWorkIds.entrySet()) {
            WorkManager.getInstance(cordova.getContext()).cancelWorkById(entry.getValue());
            CallbackContext progressCtx = progressCallbacks.remove(entry.getKey());
            if (progressCtx != null) {
                try {
                    JSONObject result = new JSONObject();
                    result.put("success", true);
                    PluginResult pr = new PluginResult(PluginResult.Status.OK, result);
                    progressCtx.sendPluginResult(pr);
                } catch (JSONException ignored) {}
            }
        }
        activeWorkIds.clear();
        ctx.success(new JSONObject());
    }

    private void listDownloads(CallbackContext ctx) {
        try {
            JSONArray downloads = store.listAll();
            ctx.success(downloads);
        } catch (Exception e) {
            ctx.error(e.getMessage());
        }
    }

    private void getContentUri(String path, CallbackContext ctx) {
        try {
            File file = new File(path);
            if (!file.exists()) {
                ctx.error("File not found");
                return;
            }

            Uri uri;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                uri = FileProvider.getUriForFile(
                        cordova.getContext(),
                        cordova.getContext().getPackageName() + ".downloader.fileprovider",
                        file
                );
            } else {
                uri = Uri.fromFile(file);
            }

            JSONObject result = new JSONObject();
            result.put("uri", uri.toString());
            ctx.success(result);
        } catch (Exception e) {
            ctx.error(e.getMessage());
        }
    }

    /**
     * Native HTTP GET that bypasses WebView CORS.
     * Follows redirects manually and writes the response to a destination file.
     * Params: { url: string, dest: string }
     */
    private void httpGet(JSONObject opts, CallbackContext ctx) throws JSONException {
        final String urlStr = opts.getString("url");
        final String rawDest = opts.optString("dest", null);
        final String destPath = rawDest != null ? stripFilePrefix(rawDest) : null;

        cordova.getThreadPool().execute(() -> {
            HttpURLConnection conn = null;
            try {
                conn = openConnection(urlStr);
                int status = conn.getResponseCode();

                if (status < 200 || status >= 300) {
                    JSONObject err = new JSONObject();
                    err.put("httpStatus", status);
                    ctx.error(err);
                    return;
                }

                String contentType = conn.getContentType() != null ? conn.getContentType() : "application/octet-stream";
                long contentLength = conn.getContentLengthLong();
                InputStream is = conn.getInputStream();

                if (destPath != null) {
                    File destFile = new File(destPath);
                    File parent = destFile.getParentFile();
                    if (parent != null && !parent.exists()) parent.mkdirs();

                    FileOutputStream fos = new FileOutputStream(destFile);
                    byte[] buf = new byte[8192];
                    int len;
                    while ((len = is.read(buf)) != -1) {
                        fos.write(buf, 0, len);
                    }
                    fos.close();
                    is.close();

                    JSONObject result = new JSONObject();
                    result.put("path", destPath);
                    result.put("contentType", contentType);
                    result.put("contentLength", destFile.length());
                    ctx.success(result);
                } else {
                    byte[] buf = new byte[8192];
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    int len;
                    while ((len = is.read(buf)) != -1) {
                        baos.write(buf, 0, len);
                    }
                    is.close();

                    JSONObject result = new JSONObject();
                    result.put("contentType", contentType);
                    result.put("contentLength", baos.size());
                    result.put("dataLength", baos.size());
                    ctx.success(result);
                }
            } catch (Exception e) {
                ctx.error(e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    /**
     * Strip file:// or file:/// prefix from a path returned by Cordova's File API.
     * Also handles URL-encoded characters (e.g. Arabic file names).
     */
    private static String stripFilePrefix(String path) {
        if (path == null) return null;
        String p = path;
        if (p.startsWith("file://")) p = p.substring(7);
        try {
            p = java.net.URLDecoder.decode(p, "UTF-8");
        } catch (Exception ignored) {}
        return p;
    }

    private HttpURLConnection openConnection(String urlStr) throws Exception {
        int redirects = 0;
        HttpURLConnection conn = null;
        String currentUrl = urlStr;

        while (redirects < 10) {
            conn = (HttpURLConnection) new URL(currentUrl).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "Altaqwaa/1.0");

            int status = conn.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) break;
                if (!location.startsWith("http")) {
                    location = new URL(new URL(currentUrl), location).toString();
                }
                currentUrl = location;
                redirects++;
            } else {
                break;
            }
        }
        return conn;
    }

    @Override
    public void onDestroy() {
        // Don't cancel work — let downloads continue in background
        progressCallbacks.clear();
        super.onDestroy();
    }
}
