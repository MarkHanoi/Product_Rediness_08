"""Diagnostic: dump every SHORT line in the legend panel, in DISPLAY space,
so the swatch bands can be transcribed from measurement instead of from pixel
estimates off a render.
"""

from __future__ import annotations

import os

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "out", "pdf_cache")

doc = fitz.open(os.path.join(CACHE, "plano5_H-01.pdf"))
page = doc[0]
rot = page.rotation_matrix
panel = fitz.Rect(60, 1440, 1150, 1700)

rows = []
for d in page.get_drawings():
    r = fitz.Rect(d["rect"]) * rot
    if not panel.contains(fitz.Point(r.x0, r.y0)):
        continue
    w, h = r.width, r.height
    if w > 260 or h > 40:  # panel rules / boxes, not swatches
        continue
    if w < 12:
        continue
    rows.append((round(r.y0, 1), round(r.x0, 1), round(r.x1, 1), round(r.y1, 1), d))

rows.sort()
print(f"{'y0':>7} {'y1':>7} {'x0':>7} {'x1':>7}  type  color                 width  dashes")
for y0, x0, x1, y1, d in rows:
    c = d.get("color")
    c = [round(v, 3) for v in c] if c else None
    print(
        f"{y0:7.1f} {y1:7.1f} {x0:7.1f} {x1:7.1f}  {d.get('type'):>4}  "
        f"{str(c):22} {d.get('width'):5}  {d.get('dashes')!r}"
    )
print(f"\n{len(rows)} candidate swatch strokes in the legend panel")
