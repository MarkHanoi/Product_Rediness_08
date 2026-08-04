"""Step 2: extract polygon RINGS (for the georef vote) and raw ALIGNMENT
LINE SEGMENTS (the actual target geometry) from one AR sheet.

Mirrors tools/aragon-plan-georef/georeference_fit.py's `plan_polygons()`
subpath-chaining logic exactly, because the same trap applies here: a single
`get_drawings()` entry on these CAD plots holds many independent subpaths
concatenated into one graphics state, so naively joining every `l` item
fabricates one absurd mega-polygon and discards every real building/parcel
outline. Segments are chained only where one starts where the previous ended.

Two outputs, both in PDF DISPLAY-SPACE points (not yet georeferenced):
  - `black_rings`: closed rings from the two black buckets (0.72pt bulk detail
    + 1.44pt heavy linework) -- these are building/parcel/block outlines and
    are the CONTROL geometry matched against Catastro buildings for the vote.
  - `red_segments`: raw open polylines from the two red buckets (0.84pt +
    0.72pt) -- per the feasibility pass, "ALINEACION DEL VIAL" / "ALINEACION
    DE EDIFICACION" in the legend. These are NOT assumed closed; alignment
    lines run along street edges and are frequently open polylines, so ring
    logic must not be forced onto them.

Run:  python tools/cordoba-ar-georef/extract_ar_geometry.py ar26
Out:  tools/cordoba-ar-georef/out/ar26_extracted.json
"""

from __future__ import annotations

import json
import math
import os
import sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CORPUS = os.path.join(
    HERE,
    "..",
    "..",
    "docs",
    "04-reference",
    "jurisdictions",
    "es",
    "es-an",
    "14021-cordoba",
    "corpus",
    "alineaciones-rasantes",
)

BLACK_STYLES = {(0.0, 0.0, 0.0, 0.72), (0.0, 0.0, 0.0, 1.44)}
RED_STYLES = {(1.0, 0.0, 0.0, 0.84), (1.0, 0.0, 0.0, 0.72)}

MIN_RING_AREA_PT2 = 0.0  # filtered later once in metres; keep raw here


def _style_key(d: dict) -> tuple | None:
    col = d.get("color")
    w = d.get("width")
    if col is None or w is None:
        return None
    return (round(col[0], 2), round(col[1], 2), round(col[2], 2), round(float(w), 2))


def _chain_items(items: list, rot: "fitz.Matrix") -> list[list[tuple[float, float]]]:
    """Chain 'l'/'c' items into polylines; 're'/'qu' become their own 4-gon.

    Returns a list of point-lists in DISPLAY-SPACE points (rot applied).
    Closed vs open is NOT decided here -- caller decides based on whether
    first==last within tolerance.
    """
    chains: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []

    def flush():
        nonlocal current
        if len(current) >= 2:
            chains.append(current)
        current = []

    for item in items:
        op = item[0]
        if op == "re":
            flush()
            r = fitz.Rect(item[1]) * rot
            chains.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)])
        elif op == "qu":
            flush()
            q = item[1]
            pts = [
                (p.x, p.y)
                for p in (
                    fitz.Point(q.ul) * rot,
                    fitz.Point(q.ur) * rot,
                    fitz.Point(q.lr) * rot,
                    fitz.Point(q.ll) * rot,
                )
            ]
            pts.append(pts[0])
            chains.append(pts)
        elif op == "l":
            p1 = fitz.Point(item[1]) * rot
            p2 = fitz.Point(item[2]) * rot
            a, b = (p1.x, p1.y), (p2.x, p2.y)
            if current and math.dist(current[-1], a) <= 0.05:
                current.append(b)
            else:
                flush()
                current = [a, b]
        elif op == "c":
            p1 = fitz.Point(item[1]) * rot
            p4 = fitz.Point(item[4]) * rot
            a, b = (p1.x, p1.y), (p4.x, p4.y)
            if current and math.dist(current[-1], a) <= 0.05:
                current.append(b)
            else:
                flush()
                current = [a, b]
    flush()
    return chains


def extract(sheet: str) -> dict:
    pdf_path = os.path.join(CORPUS, f"{sheet}.pdf")
    doc = fitz.open(pdf_path)
    page = doc[0]
    rot = page.rotation_matrix

    black_rings: list[dict] = []
    red_polylines: list[dict] = []

    style_counts: dict[str, int] = {}

    for d in page.get_drawings():
        key = _style_key(d)
        if key is None:
            continue
        style_counts[str(key)] = style_counts.get(str(key), 0) + 1
        is_black = key in BLACK_STYLES
        is_red = key in RED_STYLES
        if not (is_black or is_red):
            continue

        for chain in _chain_items(d["items"], rot):
            closed = len(chain) >= 4 and math.dist(chain[0], chain[-1]) <= 1.5
            if is_black:
                if closed:
                    black_rings.append({"points": chain, "style": list(key)})
                # open black chains are discarded -- not useful for the vote
            else:  # red
                red_polylines.append(
                    {"points": chain, "style": list(key), "closed": closed}
                )

    result = {
        "sheet": sheet,
        "pdf_path": os.path.relpath(pdf_path, HERE),
        "page_rotation": page.rotation,
        "mediabox": [page.mediabox.x0, page.mediabox.y0, page.mediabox.x1, page.mediabox.y1],
        "display_rect": [page.rect.x0, page.rect.y0, page.rect.x1, page.rect.y1],
        "style_counts_raw_drawings": style_counts,
        "n_black_rings": len(black_rings),
        "n_red_polylines": len(red_polylines),
        "black_rings": black_rings,
        "red_polylines": red_polylines,
    }
    doc.close()
    return result


def main() -> None:
    sheet = sys.argv[1] if len(sys.argv) > 1 else "ar26"
    os.makedirs(OUT, exist_ok=True)
    result = extract(sheet)
    out_path = os.path.join(OUT, f"{sheet}_extracted.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False)
    print(f"sheet={sheet}")
    print(f"black closed rings: {result['n_black_rings']}")
    print(f"red polylines:      {result['n_red_polylines']}")
    print(f"style counts (raw drawings, all colors): {result['style_counts_raw_drawings']}")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
