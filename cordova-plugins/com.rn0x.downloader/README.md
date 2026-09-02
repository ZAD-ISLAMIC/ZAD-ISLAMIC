# com.rn0x.downloader

Background file downloader with progress, resume, and cancel support for Android.

## Features

- **Background downloads** — survives app kill using WorkManager
- **Progress callbacks** — real-time progress events with loaded/total/percent
- **Resume** — auto-resumes from where it stopped (HTTP Range header)
- **Cancel** — cancel individual or all downloads
- **Notifications** — system notification shows download progress
- **State persistence** — download state saved to SharedPreferences
- **FileProvider** — secure file sharing on Android 7+

## Installation

```bash
cordova plugin add com.rn0x.downloader
```

Or add to `package.json`:

```json
"com.rn0x.downloader": "file:cordova-plugins/com.rn0x.downloader"
```

## API

### `cordova.plugins.Downloader.download(opts)`

Download a file with progress tracking.

```js
var Downloader = cordova.plugins.Downloader

Downloader.download({
  url: 'https://archive.org/download/altaqwaa/quran-cards.pdf',
  fileName: 'quran-cards.pdf',
  dir: 'downloads',  // subdirectory inside app files
  headers: {
    'Authorization': 'Bearer token'
  },
  onProgress: function (p) {
    console.log(p.percent + '% — ' + p.loaded + ' / ' + p.total)
  }
})
.then(function (result) {
  console.log('Downloaded to:', result.path)
})
.catch(function (err) {
  console.error(err.code, err.message)
})
```

**Returns:** `Promise<{ success, path, id, bytesDownloaded, totalBytes }>`

### `cordova.plugins.Downloader.cancel(id)`

Cancel an active download.

```js
Downloader.cancel('dl_1').then(function () {
  console.log('Cancelled')
})
```

### `cordova.plugins.Downloader.cancelAll()`

Cancel all active downloads.

```js
Downloader.cancelAll()
```

### `cordova.plugins.Downloader.list()`

List all tracked downloads.

```js
Downloader.list().then(function (downloads) {
  downloads.forEach(function (dl) {
    console.log(dl.id, dl.state, dl.bytesDownloaded)
  })
})
```

### `cordova.plugins.Downloader.getContentUri(path)`

Get a `content://` URI for a local file (for sharing or opening).

```js
Downloader.getContentUri('/data/.../file.pdf').then(function (result) {
  console.log(result.uri) // content://com.rn0x.altaqwaa.downloader.fileprovider/...
})
```

## Download States

| State | Description |
|-------|-------------|
| `pending` | Queued, waiting to start |
| `running` | Download in progress |
| `paused` | Paused (app killed or network lost) |
| `done` | Download complete |
| `cancelled` | User cancelled |
| `error` | Failed |

## Error Codes

| Code | Description |
|------|-------------|
| `timeout` | Connection timed out |
| `no-network` | No internet connection |
| `http-error` | Server returned error (check `httpStatus`) |
| `io-error` | File write error |
| `cancelled` | Download was cancelled |
| `invalid-args` | Missing required arguments |

## How Resume Works

1. Download starts, partial file saved to disk
2. App is killed or network lost
3. On next `download()` call with same `id`:
   - Plugin checks if partial file exists
   - Sends `Range: bytes=<offset>-` header
   - Server responds with `206 Partial Content`
   - Download continues from where it stopped

## Requirements

- Android 5.0+ (API 21)
- `androidx.work:work-runtime:2.9.1` (included in plugin.xml)

## License

MIT
