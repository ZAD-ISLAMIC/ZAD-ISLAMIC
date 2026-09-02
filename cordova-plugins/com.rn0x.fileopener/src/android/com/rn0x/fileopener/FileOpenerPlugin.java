package com.rn0x.fileopener;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.URLDecoder;

public class FileOpenerPlugin extends CordovaPlugin {

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext ctx) throws JSONException {
        switch (action) {
            case "open":
                openFile(args.getJSONObject(0), false, ctx);
                return true;
            case "openWith":
                openFile(args.getJSONObject(0), true, ctx);
                return true;
            case "getMimeType":
                getMimeType(args.getString(0), ctx);
                return true;
            default:
                return false;
        }
    }

    private static String resolvePath(String raw) {
        String p = raw;
        if (p.startsWith("file://")) p = p.substring(7);
        try {
            p = URLDecoder.decode(p, "UTF-8");
        } catch (Exception ignored) {
        }
        return p;
    }

    private void openFile(JSONObject opts, boolean useSpecificApp, CallbackContext ctx) throws JSONException {
        final String rawPath = opts.getString("path");
        final String path = resolvePath(rawPath);
        final String mimeType = opts.optString("mimeType", null);
        final String packageName = useSpecificApp ? opts.optString("packageName", null) : null;

        cordova.getThreadPool().execute(() -> {
            try {
                File srcFile = new File(path);
                if (!srcFile.exists()) {
                    sendError(ctx, "file-not-found", "الملف غير موجود: " + path);
                    return;
                }

                // Copy to a temporary cache file so we can use a known FileProvider
                File cacheDir = cordova.getContext().getCacheDir();
                File tmpFile = new File(cacheDir, srcFile.getName());
                try (FileInputStream in = new FileInputStream(srcFile);
                     FileOutputStream out = new FileOutputStream(tmpFile)) {
                    byte[] buf = new byte[8192];
                    int len;
                    while ((len = in.read(buf)) != -1) {
                        out.write(buf, 0, len);
                    }
                }

                String detectedMime = mimeType != null ? mimeType : detectMimeType(tmpFile.getName());
                Uri uri = FileProvider.getUriForFile(
                        cordova.getContext(),
                        cordova.getContext().getPackageName() + ".cdv.core.file.provider",
                        tmpFile
                );

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, detectedMime);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (useSpecificApp && packageName != null) {
                    intent.setPackage(packageName);
                }

                Intent chooser = Intent.createChooser(intent, "فتح الملف بـ...");
                cordova.getActivity().startActivity(chooser);

                JSONObject result = new JSONObject();
                result.put("success", true);
                result.put("path", path);
                result.put("mimeType", detectedMime);
                ctx.success(result);

            } catch (ActivityNotFoundException e) {
                sendError(ctx, "no-app-found", "لا يوجد برنامج مناسب لفتح هذا الملف");
            } catch (Exception e) {
                sendError(ctx, "open-error", e.getMessage());
            }
        });
    }

    private void getMimeType(String path, CallbackContext ctx) {
        String mime = detectMimeType(path);
        ctx.success(mime);
    }

    private String detectMimeType(String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0) return "application/octet-stream";

        String ext = fileName.substring(dot + 1).toLowerCase();
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return mime != null ? mime : "application/octet-stream";
    }

    private void sendError(CallbackContext ctx, String code, String message) {
        try {
            JSONObject err = new JSONObject();
            err.put("success", false);
            err.put("code", code);
            err.put("message", message);
            ctx.error(err);
        } catch (JSONException e) {
            ctx.error(message);
        }
    }
}
