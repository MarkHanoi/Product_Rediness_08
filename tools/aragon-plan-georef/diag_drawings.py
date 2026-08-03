"""Diagnostic: WHY did the legend swatch band return zero drawings?

Zero-found is exactly the shape of a false negative, so it gets diagnosed
rather than reported. This dumps what geometry actually exists in and around
the legend panel, so the failure is attributed to the right cause (wrong
coordinate space? wrong band? genuinely no geometry?).
"""

from __future__ import annotations

import os
import sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "out", "pdf_cache")

sheet = sys.argv[1] if len(sys.argv) > 1 else "H-01"
doc = fitz.open(os.path.join(CACHE, f"plano5_{sheet}.pdf"))
page = doc[0]

print(f"page.rect      = {page.rect}")
print(f"page.mediabox  = {page.mediabox}")
print(f"page.cropbox   = {page.cropbox}")
print(f"page.rotation  = {page.rotation}")
print(f"page.transformation_matrix = {page.transformation_matrix}")

d = page.get_drawings()
print(f"\ntotal drawings: {len(d)}")
if not d:
    raise SystemExit("NO DRAWINGS AT ALL -- get_drawings() is the wrong reader here")

xs0 = min(x["rect"].x0 for x in d)
ys0 = min(x["rect"].y0 for x in d)
xs1 = max(x["rect"].x1 for x in d)
ys1 = max(x["rect"].y1 for x in d)
print(f"drawings bbox union: ({xs0:.1f},{ys0:.1f})-({xs1:.1f},{ys1:.1f})")

panel = fitz.Rect(60, 1440, 1150, 1690)
inside = [x for x in d if panel.intersects(x["rect"])]
print(f"\ndrawings intersecting legend panel {panel}: {len(inside)}")

# widen: what is in the BOTTOM STRIP of the page at all?
strip = fitz.Rect(0, page.rect.height * 0.82, page.rect.width, page.rect.height)
in_strip = [x for x in d if strip.intersects(x["rect"])]
print(f"drawings in bottom 18% strip {strip}: {len(in_strip)}")

print("\nfirst 25 drawings in the bottom strip:")
for x in in_strip[:25]:
    r = x["rect"]
    print(
        f"  type={x.get('type')} rect=({r.x0:.1f},{r.y0:.1f})-({r.x1:.1f},{r.y1:.1f}) "
        f"color={x.get('color')} fill={x.get('fill')} w={x.get('width')} "
        f"dashes={x.get('dashes')!r}"
    )

print("\nfirst 10 drawings anywhere:")
for x in d[:10]:
    r = x["rect"]
    print(
        f"  type={x.get('type')} rect=({r.x0:.1f},{r.y0:.1f})-({r.x1:.1f},{r.y1:.1f}) "
        f"color={x.get('color')} w={x.get('width')}"
    )
