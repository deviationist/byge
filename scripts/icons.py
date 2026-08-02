#!/usr/bin/env python3
"""
Generate the PWA icon set from the same geometry as components/BrandMark.tsx.

The mark is two solid bands on a diagonal and a dot where they cross — "byge"
is a shower, a band of rain passing over somewhere. Two shapes and a dot,
because a home screen shows it at 60 px against a busy wallpaper and anything
finer turns to mush.

Kept in Python (PIL) rather than an SVG toolchain because there is no
rasteriser on this machine, and because drawing rotated rectangles directly is
less machinery than SVG -> PNG would be.

If BrandMark.tsx changes, change this too — the constants below are duplicated
deliberately, and scripts/icons.test.mjs asserts they still agree.
"""

import math
import os
from PIL import Image, ImageDraw

VIEWBOX = 64
CENTRE = VIEWBOX / 2
BAND_W = 108  # wider than the tile: the bands deliberately run off both edges
ANGLE_DEG = -32
SMALL_AT = 40

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")

STANDARD = dict(bg="#0B2A3A", band="#00AAFF", band2="#0080FF", dot="#F6F4F0")
MONO = dict(bg="#000000", band="#FFFFFF", band2="#FFFFFF", dot="#FFFFFF")


def _band_polygon(y0, y1, k, inset):
    """A band as four rotated corner points, in output pixels."""
    g = lambda y: CENTRE + (y - CENTRE) * inset
    y0, y1 = g(y0), g(y1)
    mid = (y0 + y1) / 2
    half_h = (y1 - y0) / 2
    rad = math.radians(ANGLE_DEG)
    cos, sin = math.cos(rad), math.sin(rad)
    pts = []
    for dx, dy in ((-BAND_W / 2, -half_h), (BAND_W / 2, -half_h),
                   (BAND_W / 2, half_h), (-BAND_W / 2, half_h)):
        # Rotate about the tile centre, matching the design's rotate(-32 32 32).
        x = CENTRE + dx * cos - (mid - CENTRE + dy) * sin
        y = CENTRE + dx * sin + (mid - CENTRE + dy) * cos
        pts.append((x * k, y * k))
    return pts


def draw(size, variant="standard", supersample=4):
    """Render one icon. Drawn large and downsampled — PIL has no antialiasing."""
    mono = variant == "monochrome"
    maskable = variant == "maskable"
    pal = MONO if mono else STANDARD
    inset = 0.68 if maskable else 1.0
    corner = 0 if maskable else 14

    s = size * supersample
    k = s / VIEWBOX
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")

    # Rounded tile. Maskable goes full-bleed square: Android crops it to an
    # arbitrary shape, so our own corners would just be thrown away.
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=corner * k, fill=pal["bg"])

    tile = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile, "RGBA")

    # Below ~40 px the two-band reading collapses into a smudge, so small sizes
    # switch to one heavier band and a bigger dot.
    small = size <= SMALL_AT
    if small:
        bands = [(36, 48, pal["band"], 255)]
    else:
        bands = [(19, 27, pal["band2"], 191), (38, 46, pal["band"], 242)]

    for y0, y1, colour, alpha in bands:
        rgb = tuple(int(colour[i : i + 2], 16) for i in (1, 3, 5))
        td.polygon(_band_polygon(y0, y1, k, inset), fill=(*rgb, alpha))

    r = (9.6 if small else 6.2) * inset * k
    td.ellipse(
        [CENTRE * k - r, CENTRE * k - r, CENTRE * k + r, CENTRE * k + r],
        fill=pal["dot"],
    )

    # Clip the bands to the tile so they stop at its rounded edge, then lay
    # them over the background. Compositing rather than pasting keeps the bands'
    # own per-band alpha intact.
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, s - 1, s - 1], radius=corner * k, fill=255
    )
    clipped = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    clipped.paste(tile, (0, 0), mask)
    img = Image.alpha_composite(img, clipped)

    return img.resize((size, size), Image.LANCZOS)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><clipPath id="c"><rect x="0" y="0" width="64" height="64" rx="{corner}"/></clipPath></defs>
  <g clip-path="url(#c)">
    <rect x="0" y="0" width="64" height="64" rx="{corner}" fill="{bg}"/>
    <g transform="rotate(-32 32 32)">
      <rect x="-22" y="19" width="108" height="8" fill="{band2}" opacity=".75"/>
      <rect x="-22" y="38" width="108" height="8" fill="{band}" opacity=".95"/>
    </g>
    <circle cx="32" cy="32" r="6.2" fill="{dot}"/>
  </g>
</svg>
"""


def write_svg(path, pal, corner):
    """Vector versions, for browser chrome that prefers them and for the
    monochrome manifest entry (Android tints it, so it must be single-ink)."""
    with open(path, "w") as f:
        f.write(SVG.format(corner=corner, **pal))


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    for name, size, variant in [
        ("icon-192.png", 192, "standard"),
        ("icon-512.png", 512, "standard"),
        ("maskable-192.png", 192, "maskable"),
        ("maskable-512.png", 512, "maskable"),
        ("apple-touch-icon.png", 180, "standard"),
        ("mono.png", 512, "monochrome"),
        ("favicon-32.png", 32, "standard"),
        ("favicon-16.png", 16, "standard"),
    ]:
        p = os.path.join(OUT, name)
        draw(size, variant).save(p)
        made.append(f"{name} ({size}px {variant})")

    write_svg(os.path.join(OUT, "favicon.svg"), STANDARD, 14)
    write_svg(os.path.join(OUT, "mono.svg"), MONO, 0)
    made += ["favicon.svg", "mono.svg (monochrome, full-bleed for tinting)"]

    # .ico carries both raster sizes for legacy browser chrome.
    ico = os.path.join(OUT, "..", "favicon.ico")
    draw(32, "standard").save(ico, sizes=[(16, 16), (32, 32)])
    made.append("favicon.ico (16+32)")

    print("\n".join(f"  {m}" for m in made))


if __name__ == "__main__":
    main()
