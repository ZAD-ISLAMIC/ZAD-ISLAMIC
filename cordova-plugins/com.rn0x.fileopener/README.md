# com.rn0x.fileopener

Open files with the appropriate app using Android Intent chooser.

## Installation

```bash
cordova plugin add com.rn0x.fileopener
```

Or add to `package.json`:

```json
"com.rn0x.fileopener": "file:cordova-plugins/com.rn0x.fileopener"
```

## API

### `cordova.plugins.FileOpener.open(opts)`

Opens a file with the best available app (shows a chooser if multiple apps can handle it).

```js
var FileOpener = cordova.plugins.FileOpener

FileOpener.open({
  path: '/data/data/com.rn0x.altaqwaa/files/downloads/quran-card.pdf',
  mimeType: 'application/pdf'  // optional — auto-detected if omitted
})
.then(function (result) {
  console.log('Opened:', result.mimeType)
})
.catch(function (err) {
  console.error(err.code, err.message)
})
```

### `cordova.plugins.FileOpener.openWith(opts)`

Opens a file with a specific app.

```js
FileOpener.openWith({
  path: '/data/data/com.rn0x.altaqwaa/files/downloads/quran-card.pdf',
  packageName: 'com.adobe.reader',
  mimeType: 'application/pdf'
})
```

### `cordova.plugins.FileOpener.getMimeType(path)`

Returns the detected MIME type for a file path.

```js
FileOpener.getMimeType('/data/.../file.pdf')
  .then(function (mime) {
    console.log(mime) // 'application/pdf'
  })
```

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `path` | string | Yes | Absolute file path on the device |
| `mimeType` | string | No | MIME type (auto-detected from extension if omitted) |
| `packageName` | string | No | Android package name (only for `openWith`) |

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| `file-not-found` | الملف غير موجود | File does not exist at the given path |
| `no-app-found` | لا يوجد برنامج مناسب | No app installed can open this file type |
| `open-error` | (varies) | Unexpected error during open |

## MIME Types

Common MIME types handled automatically:

| Extension | MIME Type |
|-----------|-----------|
| `.pdf` | `application/pdf` |
| `.mp3` | `audio/mpeg` |
| `.mp4` | `video/mp4` |
| `.txt` | `text/plain` |
| `.doc` | `application/msword` |
| `.zip` | `application/zip` |
| `.png` | `image/png` |
| `.jpg` | `image/jpeg` |

## Requirements

- Android 7.0+ (API 24) — uses FileProvider for secure file sharing
- Android 6.0 and below — uses file:// URIs directly

## License

MIT
