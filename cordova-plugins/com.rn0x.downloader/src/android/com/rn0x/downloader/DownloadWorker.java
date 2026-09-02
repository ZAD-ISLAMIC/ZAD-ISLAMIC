package com.rn0x.downloader;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Background file downloader using WorkManager.
 * Supports: progress notifications, resume via Range header, cancel.
 */
public class DownloadWorker extends Worker {

    private static final String CHANNEL_ID = "rn0x_download";
    private static final int NOTIFICATION_ID = 9999;
    private static final int BUFFER_SIZE = 8192;
    private static final int PROGRESS_INTERVAL = 256 * 1024; // update every 256KB

    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    public DownloadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Data input = getInputData();
        String url = input.getString("url");
        String path = input.getString("path");
        String id = input.getString("id");
        long offset = input.getLong("offset", 0);

        if (url == null || path == null) {
            return Result.failure(new Data.Builder()
                    .putString("code", "invalid-args")
                    .putString("message", "Missing url or path")
                    .build());
        }

        // Show foreground notification
        createNotificationChannel();
        setForegroundAsync(createForegroundInfo("جاري التحميل..."));

        HttpURLConnection conn = null;
        InputStream in = null;
        FileOutputStream out = null;

        try {
            File file = new File(path);
            File parentDir = file.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                parentDir.mkdirs();
            }

            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "rn0x-downloader/1.0");

            // Resume support
            if (offset > 0 && file.exists()) {
                conn.setRequestProperty("Range", "bytes=" + offset + "-");
            }

            conn.connect();

            int status = conn.getResponseCode();
            boolean isResumed = (status == 206);

            if (status < 200 || status >= 300) {
                return Result.failure(new Data.Builder()
                        .putString("code", "http-error")
                        .putString("message", "HTTP " + status)
                        .putInt("httpStatus", status)
                        .build());
            }

            long totalBytes = isResumed
                    ? offset + conn.getContentLengthLong()
                    : conn.getContentLengthLong();

            in = conn.getInputStream();
            out = new FileOutputStream(file, isResumed); // append if resumed

            byte[] buffer = new byte[BUFFER_SIZE];
            long received = isResumed ? offset : 0;
            long lastProgressUpdate = 0;

            int read;
            while ((read = in.read(buffer)) != -1) {
                if (cancelled.get() || isStopped()) {
                    // Save progress for resume
                    saveProgress(id, received, totalBytes);
                    return Result.failure(new Data.Builder()
                            .putString("code", "cancelled")
                            .putString("message", "Download cancelled")
                            .build());
                }

                out.write(buffer, 0, read);
                received += read;

                // Update progress periodically
                if (received - lastProgressUpdate >= PROGRESS_INTERVAL) {
                    lastProgressUpdate = received;
                    setProgressAsync(new Data.Builder()
                            .putLong("loaded", received)
                            .putLong("total", totalBytes)
                            .build());
                    updateNotification(received, totalBytes);
                }
            }

            out.flush();
            out.close();
            in.close();
            conn.disconnect();

            // Final progress
            setProgressAsync(new Data.Builder()
                    .putLong("loaded", received)
                    .putLong("total", totalBytes)
                    .build());

            // Save final state
            DownloadStore store = new DownloadStore(getApplicationContext());
            DownloadStore.DownloadInfo info = store.load(id);
            if (info != null) {
                info.bytesDownloaded = received;
                info.totalBytes = totalBytes;
                info.path = path;
                info.state = "done";
                store.save(info);
            }

            // Return success
            Data output = new Data.Builder()
                    .putString("path", path)
                    .putLong("bytesDownloaded", received)
                    .putLong("totalBytes", totalBytes)
                    .build();

            // Remove notification
            NotificationManager nm = getApplicationContext().getSystemService(NotificationManager.class);
            nm.cancel(NOTIFICATION_ID);

            return Result.success(output);

        } catch (Exception e) {
            // Save progress for potential resume
            if (path != null) {
                File file = new File(path);
                long currentSize = file.exists() ? file.length() : 0;
                saveProgress(id, currentSize, -1);
            }

            String code = "network";
            int httpStatus = 0;
            if (e instanceof java.net.SocketTimeoutException) {
                code = "timeout";
            } else if (e instanceof java.net.UnknownHostException) {
                code = "no-network";
            } else if (e instanceof java.io.IOException) {
                code = "io-error";
            }

            return Result.retry();

        } finally {
            try { if (out != null) out.close(); } catch (Exception ignored) {}
            try { if (in != null) in.close(); } catch (Exception ignored) {}
            try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
        }
    }

    @Override
    public void onStopped() {
        cancelled.set(true);
        super.onStopped();
    }

    private void saveProgress(String id, long bytes, long total) {
        try {
            DownloadStore store = new DownloadStore(getApplicationContext());
            DownloadStore.DownloadInfo info = store.load(id);
            if (info != null) {
                info.bytesDownloaded = bytes;
                if (total > 0) info.totalBytes = total;
                info.state = "paused";
                store.save(info);
            }
        } catch (Exception ignored) {}
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "التحميل",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("تنبيهات تحميل الملفات");
            NotificationManager nm = getApplicationContext().getSystemService(NotificationManager.class);
            nm.createNotificationChannel(channel);
        }
    }

    private ForegroundInfo createForegroundInfo(String text) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
                .setContentTitle("التقوى")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setOngoing(true)
                .setSilent(true);

        return new ForegroundInfo(NOTIFICATION_ID, builder.build());
    }

    private void updateNotification(long loaded, long total) {
        int percent = total > 0 ? (int) ((loaded * 100) / total) : 0;
        String text = total > 0
                ? percent + "% — " + formatSize(loaded) + " / " + formatSize(total)
                : formatSize(loaded);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
                .setContentTitle("جاري التحميل")
                .setContentText(text)
                .setProgress(total > 0 ? 100 : 0, percent, total <= 0)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setOngoing(true)
                .setSilent(true);

        NotificationManager nm = getApplicationContext().getSystemService(NotificationManager.class);
        nm.notify(NOTIFICATION_ID, builder.build());
    }

    private String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024));
        return String.format("%.2f GB", bytes / (1024.0 * 1024 * 1024));
    }
}
