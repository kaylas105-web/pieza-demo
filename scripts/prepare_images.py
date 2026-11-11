"""Builds the web images for the demo from the source photos.

python -I scripts/prepare_images.py <folder with REF-*.jpg> [--cutouts]

For every product: static/img/<slug>.webp (1000 px) and <slug>-s.webp (480 px).
With --cutouts: <slug>-cut.webp with the white studio background removed,
for the products listed in CUTOUTS (only photos shot on white work).
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "static", "img")

# Checked by eye on a green background. White-on-white and grey-backdrop photos
# (AirPods 4/Pro, Echo Dot, Fire TV, Hue, iPhone 17) do not cut cleanly, so they are not here.
CUTOUTS = [
    "airpods-max", "dualsense", "switch-pro-controller", "pixel-9a", "iphone-16e",
    "galaxy-zflip6", "nikon-z50", "apple-watch-ultra-2", "airtag", "raspberry-pi-5",
    "steam-deck-oled", "kindle-paperwhite", "apple-tv-4k", "switch-2", "apple-watch-s10",
]


def resize(im, size):
    im = im.copy()
    im.thumbnail((size, size), Image.LANCZOS)
    return im


def square(im, size):
    """Square photo for the grid: studio shots (light border) are padded with their own
    background colour, so the whole product stays visible; scene photos are centre-cropped."""
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    spread = np.abs(border - bg).max(axis=1)
    w, h = im.size
    if bg.min() > 200 and (spread < 30).mean() > 0.8:
        side = max(w, h)
        canvas = Image.new("RGB", (side, side), tuple(int(c) for c in bg))
        canvas.paste(im, ((side - w) // 2, (side - h) // 2))
        out = canvas
    else:
        side = min(w, h)
        left, top = (w - side) // 2, (h - side) // 2
        out = im.crop((left, top, left + side, top + side))
    return out.resize((size, size), Image.LANCZOS) if out.size[0] > size else out


def cutout(im):
    """Removes a light background connected to the border. Returns RGBA cropped to the object."""
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    h, w, _ = rgb.shape
    # Background colour = median of the border pixels.
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.abs(rgb - bg).max(axis=2)
    light = dist < 26
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if light[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    alpha = Image.fromarray(np.where(seen, 0, 255).astype(np.uint8))
    # Soft 1-2 px edge so the object does not look cut with scissors.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert("RGB").copy()
    out.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
    return out.crop(box) if box else out, float(seen.mean())


def main():
    src = sys.argv[1]
    with_cutouts = "--cutouts" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    products = json.load(open(os.path.join(ROOT, "data", "products.json"), encoding="utf-8"))
    for p in products:
        im = Image.open(os.path.join(src, p["photo"])).convert("RGB")
        square(im, 1000).save(os.path.join(OUT, f"{p['slug']}.webp"), quality=84, method=6)
        square(im, 480).save(os.path.join(OUT, f"{p['slug']}-s.webp"), quality=80, method=6)
        if with_cutouts and p["slug"] in CUTOUTS:
            cut, share = cutout(im)
            resize(cut, 900).save(os.path.join(OUT, f"{p['slug']}-cut.webp"), quality=88, method=6)
            print(f"cutout {p['slug']}: background {share:.0%}")
    print(f"{len(products)} products done")


if __name__ == "__main__":
    main()
