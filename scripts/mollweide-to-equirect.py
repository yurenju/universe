"""Reproject a Mollweide all-sky map (e.g. the Planck CMB image) to an
equirectangular 2:1 map that can be wrapped on a sphere.

The ellipse is located automatically from the non-black pixels. Longitude
keeps the source convention (for sky maps: increasing to the left).

Usage: python3 scripts/mollweide-to-equirect.py in.jpg out.jpg [width]
"""
import math
import sys

from PIL import Image


def ellipse_bounds(img, threshold=12):
    w, h = img.size
    px = img.load()
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y][:3]
            if r + g + b > threshold * 3:
                xs.append(x)
                ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def main():
    src = Image.open(sys.argv[1]).convert("RGB")
    out_w = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
    out_h = out_w // 2
    x0, x1, y0, y1 = ellipse_bounds(src)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    # semi-axes in pixels (2√2 : √2 ideally), inset to stay off the dark anti-aliased rim
    inset = 0.975
    ax, ay = (x1 - x0) / 2 * inset, (y1 - y0) / 2 * inset
    print(f"ellipse x {x0}-{x1}, y {y0}-{y1}, ratio {ax / ay:.3f}")
    sp = src.load()
    dst = Image.new("RGB", (out_w, out_h))
    dp = dst.load()
    for j in range(out_h):
        lat = math.pi / 2 - (j + 0.5) / out_h * math.pi
        # solve 2θ + sin 2θ = π sin φ (Newton)
        t = lat
        for _ in range(12):
            f = 2 * t + math.sin(2 * t) - math.pi * math.sin(lat)
            d = 2 + 2 * math.cos(2 * t)
            if abs(d) < 1e-9:
                break
            t -= f / d
        for i in range(out_w):
            lon = math.pi - (i + 0.5) / out_w * 2 * math.pi  # +π at left edge, as the source
            # normalised Mollweide coordinates in [-1, 1]
            nx = -(lon / math.pi) * math.cos(t)
            ny = math.sin(t)
            sx = min(src.width - 1, max(0, int(cx + nx * ax)))
            sy = min(src.height - 1, max(0, int(cy - ny * ay)))
            dp[i, j] = sp[sx, sy]
    dst.save(sys.argv[2], quality=86)


if __name__ == "__main__":
    main()
