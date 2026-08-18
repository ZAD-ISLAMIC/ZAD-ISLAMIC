#!/usr/bin/env python3
"""Generate all Android launcher / native-splash / notification assets.

All raster output is derived from the single master icon in
src/resources/icons/ (512x512 white card + dark-green crescent). The script
publishes the Cordova-standard source folders tree:

    res/icon/android/        per-density launcher layers referenced by the
                             <icon> entries in config.xml
    res/screen/android/      native splash image referenced by the
                             AndroidWindowSplashScreenAnimatedIcon preference

and writes only the notification small icons directly into
platforms/android/app/src/main/res/ (config.xml has no story for them).

`cordova prepare` (or a normal build) then copies the launcher/splash layers
into the platform, so a clean `cordova platform add android` reproduces
everything without running this script first.

Run:  python3 scripts/generate-icons.py
"""

import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "src" / "resources" / "icons" / "icon@2x.png"
ICON_DIR = ROOT / "res" / "icon" / "android"
SCREEN_DIR = ROOT / "res" / "screen" / "android"
PLATFORM_RES = ROOT / "platforms" / "android" / "app" / "src" / "main" / "res"

# Density buckets → dp scale (px per 160-dpi mdpi bucket)
DENSITIES = {
    "ldpi": 0.75,
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}


def load_master():
    """Return (RGBA master, crescent white-on-transparent 512 image)."""
    img = Image.open(MASTER).convert("RGBA")
    if img.size != (512, 512):
        raise SystemExit(f"master icon must be 512x512, got {img.size}")
    w, h = img.size
    px = img.load()
    cres = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cpx = cres.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            # 1 for fully dark crescent, 0 for the white card, soft ramp
            # across the antialiased edge between the two.
            t = max(0.0, min(1.0, (235.0 - lum) / 40.0))
            cpx[x, y] = (255, 255, 255, int(round(a * t)))
    return img, cres


def crop_bbox(img):
    """Crop an RGBA image to its non-transparent bounding box."""
    px = img.load()
    w, h = img.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                xs.append(x)
                ys.append(y)
    if not xs:
        return img
    return img.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def transparent(size):
    return Image.new("RGBA", (size, size), (0, 0, 0, 0))


def center_paste(canvas, sub):
    """Paste `sub` centered onto `canvas` (both RGBA squares)."""
    cw, ch = canvas.size
    sw, sh = sub.size
    x = (cw - sw) // 2
    y = (ch - sh) // 2
    canvas.alpha_composite(sub, (x, y))
    return canvas


def save_squared(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGBA").save(path, "PNG")
    print(f"  ✓ {path.relative_to(ROOT)}")


def gen_launcher_layers(master, cres):
    print("[1/4] launcher layers (res/icon/android/)")
    # Legacy fallback: full master at the classic 48dp launcher size.
    for density, scale in DENSITIES.items():
        size = round(48 * scale)
        save_squared(
            master.resize((size, size), Image.LANCZOS),
            ICON_DIR / f"ic-{density}.png",
        )

    # Adaptive: foreground holds the white card at 66dp on the 108dp canvas;
    # background is fully transparent so the card "floats" on the launcher
    # wallpaper exactly like the original PNG. Monochrome = crescent.
    CARD_DP = 66.0
    CANVAS_DP = 108.0
    card_width_px = 436.0  # measured across the 512 master
    crez_span = 299.0  # crescent footprint in the 512 master
    for density, scale in DENSITIES.items():
        canvas_px = round(CANVAS_DP * scale)
        master_scale = (CARD_DP * scale) / card_width_px
        scaled_master = master.resize(
            (round(512 * master_scale), round(512 * master_scale)), Image.LANCZOS
        )
        fg = transparent(canvas_px)
        center_paste(fg, scaled_master)
        save_squared(fg, ICON_DIR / f"fg-{density}.png")

        bg = transparent(canvas_px)
        save_squared(bg, ICON_DIR / f"bg-{density}.png")

        mono_cres = crop_bbox(cres).resize(
            (round(canvas_px * master_scale * (crez_span / 512.0)),) * 2,
            Image.LANCZOS,
        )
        mono = transparent(canvas_px)
        center_paste(mono, mono_cres)
        save_squared(mono, ICON_DIR / f"mono-{density}.png")


def gen_splash(master):
    print("[2/4] native splash images (res/screen/android/)")
    # Kept as the app-icon visual reference, but no longer referenced by the
    # native splash (see splash-transparent.png below).
    save_squared(master.copy(), SCREEN_DIR / "splash.png")
    # Fully transparent 512x512 image: the Android 12+ system splash is
    # mandatory, so we paint it as a bare navy screen (windowSplashScreenBackground
    # = #0a1428, icon background = same navy). With this transparent icon the
    # system splash carries no artwork of its own, and the in-app splash is the
    # only branded screen the user ever sees.
    save_squared(transparent(512), SCREEN_DIR / "splash-transparent.png")


def gen_notification(cres):
    print("[3/4] notification small icons (platform drawable-*/)")
    glyph_dp = 20.0  # glyph inside the 24dp canvas
    for density, scale in DENSITIES.items():
        canvas = round(24 * scale)
        glyph = round(glyph_dp * scale)
        ic = transparent(canvas)
        ic = center_paste(ic, crop_bbox(cres).resize((glyph, glyph), Image.LANCZOS))
        save_squared(ic, PLATFORM_RES / f"drawable-{density}" / "ic_stat_taqwa.png")
    # density-less fallback
    ic = transparent(24)
    ic = center_paste(ic, crop_bbox(cres).resize((20, 20), Image.LANCZOS))
    save_squared(ic, PLATFORM_RES / "drawable" / "ic_stat_taqwa.png")


def cleanup_stale_platform_assets():
    print("[4/4] clean stale platform assets")
    # Old density-layered native splash pngs (pre config-driven) would shadow
    # the single drawable-nodpi copy made by cordova prepare.
    removed = 0
    for folder in sorted(PLATFORM_RES.glob("drawable-*/")):
        p = folder / "ic_cdv_splashscreen.png"
        if p.exists():
            p.unlink()
            removed += 1
    for p in [PLATFORM_RES / "drawable" / "ic_cdv_splashscreen.png"]:
        if p.exists():
            p.unlink()
            removed += 1
    if removed:
        print(f"  ✓ removed {removed} stale ic_cdv_splashscreen.png")


def main():
    if not MASTER.exists():
        raise SystemExit(f"missing master icon: {MASTER}")
    master, cres = load_master()
    gen_launcher_layers(master, cres)
    gen_splash(master)
    gen_notification(cres)
    cleanup_stale_platform_assets()
    print("\nDone. Run `cordova prepare` (or a full build) to place the assets.")


if __name__ == "__main__":
    sys.exit(main())