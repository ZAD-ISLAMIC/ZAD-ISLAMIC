#!/usr/bin/env node
// strip-exif: remove EXIF / metadata chunks from images referenced by F-Droid
// metadata so that `tools/check-exif-in-images.sh` passes. Pure JS, no deps.
// Usage: node scripts/strip-exif.mjs <dir-or-file> [<more>...]

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

function listImages(entry) {
  const out = [];
  const st = statSync(entry);
  if (st.isDirectory()) {
    for (const name of readdirSync(entry)) {
      const p = join(entry, name);
      if (statSync(p).isDirectory()) out.push(...listImages(p));
      else if (/\.(png|jpe?g)$/i.test(p)) out.push(p);
    }
  } else if (/\.(png|jpe?g)$/i.test(entry)) {
    out.push(entry);
  }
  return out;
}

// Strip EXIF from a PNG by dropping eXIf / ancillary text chunks that carry
// EXIF-style metadata. Returns true if the file was modified.
function stripPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return false;
  let out = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let i = 8;
  let changed = false;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const dataStart = i + 8;
    const dataEnd = dataStart + len;
    const isExifChunk = type === 'eXIf';
    const isTextChunk = type === 'iTXt' || type === 'tEXt' || type === 'zTXt';
    let isExifText = false;
    if (isTextChunk && len > 0) {
      const keyEnd = buf.indexOf(0, dataStart);
      const key = buf.toString('ascii', dataStart, keyEnd < 0 ? dataStart : keyEnd).toLowerCase();
      isExifText = key.includes('exif') || key.includes('photoshop') || key.includes('xml:com.adobe');
    }
    if (isExifChunk || isExifText) {
      changed = true;
      i = dataEnd + 4; // skip chunk + CRC
      continue;
    }
    out = Buffer.concat([out, buf.subarray(i, dataEnd + 4)]);
    if (type === 'IEND') break;
    i = dataEnd + 4;
  }
  return changed ? out : null;
}

// Strip EXIF APP1 (0xFFE1 "Exif\0\0") segments from a JPEG. Returns buffer or null.
function stripJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let out = Buffer.from([0xff, 0xd8]);
  let i = 2;
  let changed = false;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) {
      // SOS or EOI: copy the rest verbatim
      out = Buffer.concat([out, buf.subarray(i)]);
      i = buf.length;
      break;
    }
    const segLen = buf.readUInt16BE(i + 2);
    const segStart = i;
    const segEnd = i + 2 + segLen;
    if (marker === 0xe1) {
      const id = buf.toString('ascii', i + 4, i + 4 + 6);
      if (id.startsWith('Exif') || id.toLowerCase().startsWith('http://ns.adobe')) {
        changed = true;
        i = segEnd;
        continue;
      }
    }
    out = Buffer.concat([out, buf.subarray(segStart, segEnd)]);
    i = segEnd;
  }
  return changed ? out : null;
}

function processFile(path) {
  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return false;
  }
  const ext = extname(path).toLowerCase();
  let result = null;
  if (ext === '.png') result = stripPng(buf);
  else if (ext === '.jpg' || ext === '.jpeg') result = stripJpeg(buf);
  if (result && result.length !== buf.length) {
    writeFileSync(path, result);
    return true;
  }
  return false;
}

const entries = process.argv.slice(2);
if (entries.length === 0) {
  console.error('usage: strip-exif <dir-or-file> [...]');
  process.exit(2);
}
let stripped = 0;
for (const e of entries) {
  if (!existsSync(e)) continue;
  for (const f of listImages(e)) {
    if (processFile(f)) stripped++;
  }
}
console.log(`strip-exif: removed EXIF from ${stripped} image(s)`);
