"""Render a region of a plan sheet to PNG so a HUMAN can read what no text
extractor can.

The sheets are OUTLINED_TEXT_VECTOR: every glyph is a filled path, so
`extract text` returns zero characters while the sheet renders perfectly. That
is precisely the case where rendering + a human read is the CHEAPEST correct
method, not a fallback. The coordinate-grid labels and the title block are on
the sheet; they are just not characters.

Usage:
  python tools/aragon-plan-georef/render_sheet.py H-01 full 1.0
  python tools/aragon-plan-georef/render_sheet.py H-01 x0,y0,x1,y1 6.0
"""

from __future__ import annotations

import os
import sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "out", "pdf_cache")
RENDERS = os.path.join(HERE, "out", "renders")


def main() -> None:
    sheet = sys.argv[1] if len(sys.argv) > 1 else "H-01"
    region = sys.argv[2] if len(sys.argv) > 2 else "full"
    zoom = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    tag = sys.argv[4] if len(sys.argv) > 4 else region.replace(",", "_")

    os.makedirs(RENDERS, exist_ok=True)
    path = os.path.join(CACHE, f"plano5_{sheet}.pdf")
    if not os.path.exists(path):
        raise SystemExit(f"not cached: {path} -- run pdf_metadata_probe.py first")

    doc = fitz.open(path)
    page = doc[0]
    clip = None
    if region != "full":
        x0, y0, x1, y1 = (float(v) for v in region.split(","))
        clip = fitz.Rect(x0, y0, x1, y1)

    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
    out = os.path.join(RENDERS, f"{sheet}_{tag}.png")
    pix.save(out)
    print(f"page rect (pt): {page.rect}")
    print(f"clip: {clip}")
    print(f"wrote {out}  ({pix.width}x{pix.height}px)")


if __name__ == "__main__":
    main()
