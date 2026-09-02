#!/usr/bin/env node
/**
 * Post-`cordova prepare` patch for MainActivity.java
 *
 * Samsung devices (especially Android 10-12) leave stale WebView data-directory
 * lock files (SingletonLock / lockfile) when the system kills the background
 * process. On the next cold start Chromium's AwDataDirLock throws
 * "Failed to create webview" and the app crashes immediately.
 *
 * This hook replaces the stock Cordova onCreate with a version that catches
 * that specific RuntimeException, deletes the stale lock files, and retries.
 * If the retry also fails it shows a user-friendly dialog.
 *
 * Runs as a `before_compile` hook: executes AFTER cordova's internal prepare
 * (which would wipe an earlier manual edit) and right before javac.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const JAVA_DIR = resolve(
  ROOT,
  'platforms/android/app/src/main/java/com/rn0x/altaqwaa'
)
const MAIN_ACTIVITY = resolve(JAVA_DIR, 'MainActivity.java')
const ACTIVITY_PLACEHOLDER = resolve(JAVA_DIR, 'Activity.java')

// If cordova-android found a generic Activity.java placeholder but we need
// MainActivity (which AndroidManifest.xml references), rename/migrate first.
if (!existsSync(MAIN_ACTIVITY) && existsSync(ACTIVITY_PLACEHOLDER)) {
  writeFileSync(MAIN_ACTIVITY, readFileSync(ACTIVITY_PLACEHOLDER, 'utf-8'))
  try { require('node:fs').unlinkSync(ACTIVITY_PLACEHOLDER) } catch {}
  console.log('[patch-mainactivity] migrated Activity.java → MainActivity.java')
}

if (!existsSync(MAIN_ACTIVITY)) {
  console.log('[patch-mainactivity] MainActivity.java not found — skip')
  process.exit(0)
}

const MARKER = '// @altaqwaa-patched'
const src = readFileSync(MAIN_ACTIVITY, 'utf-8')

if (src.includes(MARKER)) {
  console.log('[patch-mainactivity] already patched — skip')
  process.exit(0)
}

// ── replacement source ──────────────────────────────────────────────
const patched = `/*
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/ // @altaqwaa-patched

package com.rn0x.altaqwaa;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.media.AudioManager;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;

import java.io.File;

import org.apache.cordova.*;

public class MainActivity extends CordovaActivity
{
    private static final String TAG = "Altaqwaa";

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP
                || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            // Let the user adjust the adhan volume with hardware keys while
            // the adhan is ringing — otherwise pass through to the system so
            // normal ringer/media volume changes still work.
            if (com.rn0x.prayerwatch.AdhanPlayback.isPlaying()) {
                int dir = (keyCode == KeyEvent.KEYCODE_VOLUME_UP)
                        ? AudioManager.ADJUST_RAISE
                        : AudioManager.ADJUST_LOWER;
                return com.rn0x.prayerwatch.AdhanPlayback.handleVolumeKey(this, dir);
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onCreate(Bundle savedInstanceState)
    {
        super.onCreate(savedInstanceState);

        // enable Cordova apps to be started in the background
        Bundle extras = getIntent().getExtras();
        if (extras != null && extras.getBoolean("cdvStartInBackground", false)) {
            moveTaskToBack(true);
        }

        // Set by <content src="index.html" /> in config.xml
        // Wrap in try-catch to recover from AwDataDirLock crashes on Samsung
        // devices where stale WebView lock files cause "Failed to create webview".
        try {
            loadUrl(launchUrl);
        } catch (RuntimeException e) {
            if (e.getMessage() != null && e.getMessage().contains("Failed to create webview")) {
                Log.w(TAG, "WebView lock error detected — cleaning and retrying");
                cleanWebViewLockFiles();
                try {
                    loadUrl(launchUrl);
                } catch (RuntimeException e2) {
                    Log.e(TAG, "WebView failed even after cleanup", e2);
                    showErrorDialog();
                }
            } else {
                throw e;
            }
        }
    }

    private void cleanWebViewLockFiles() {
        try {
            File dataDir = getDir("app_webview", MODE_PRIVATE);
            if (dataDir.exists()) {
                deleteFileIfExists(new File(dataDir, "lockfile"));
                deleteFileIfExists(new File(dataDir, "SingletonLock"));
                deleteFileIfExists(new File(dataDir, "SingletonSocket"));
                deleteFileIfExists(new File(dataDir, "SingletonCookie"));
            }
        } catch (Exception e) {
            Log.e(TAG, "Error cleaning WebView lock files", e);
        }
    }

    private void deleteFileIfExists(File file) {
        if (file.exists()) {
            Log.d(TAG, "Deleting stale lock file: " + file.getAbsolutePath());
            file.delete();
        }
    }

    private void showErrorDialog() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("\\u062e\\u0637\\u0623")
                    .setMessage("\\u062d\\u062f\\u062b \\u062e\\u0637\\u0623 \\u0641\\u064a \\u062a\\u0634\\u063a\\u064a\\u0644 \\u0627\\u0644\\u062a\\u0637\\u0628\\u064a\\u0642. \\u064a\\u0631\\u062c\\u0649 \\u0627\\u0644\\u0645\\u062d\\u0627\\u0648\\u0644\\u0629 \\u0645\\u0631\\u0629 \\u0623\\u062e\\u0631\\u0649.")
                    .setPositiveButton("\\u0625\\u0639\\u0627\\u062f\\u0629 \\u0627\\u0644\\u0645\\u062d\\u0627\\u0648\\u0644\\u0629", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            android.os.Process.killProcess(android.os.Process.myPid());
                            System.exit(0);
                        }
                    })
                    .setNegativeButton("\\u0625\\u063a\\u0644\\u0627\\u0642", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            finish();
                        }
                    })
                    .setCancelable(false)
                    .show();
            }
        });
    }
}
`

writeFileSync(MAIN_ACTIVITY, patched)
console.log('[patch-mainactivity] patched MainActivity.java with AwDataDirLock recovery')
