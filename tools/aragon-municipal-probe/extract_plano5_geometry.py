#!/usr/bin/env python3
"""
extract_plano5_geometry.py -- turn a plano nº5 sheet into GEOMETRY.

probe_huesca_plano5.py established the sheets are OUTLINED_TEXT_VECTOR:
zero fonts, zero images, zero painted text, 111k-336k path operators.
"No text layer" is NOT "no data". This script proves the data is there by
walking the content stream as a PDF graphics machine and emitting polylines.

What it does:
  * interprets q/Q (graphics state stack) and cm (CTM concatenation)
  * walks m / l / c / v / y / re into subpaths in DEVICE space
  * records the paint operator (S/s/f/f*/B/b/n)
  * reports: subpath count, vertex count, drawing bbox, straight-run histogram

⛔ COLOUR IS NOT READ BY THIS WALKER, AND MUST NOT BE.
  This walker tracks only the DEVICE colour operators `RG`/`rg`/`G`/`g`. These
  sheets set colour through an ICCBased colourspace -- `/Cs6 CS <r> <g> <b> SCN`
  -- and on H-01 there are 52 `SCN` events and ZERO `RG`. Every coloured stroke
  therefore inherited the last DeviceGray value, and this script published a
  colour table of 7-8 pure greys that MISREPRESENTED A COLOUR SHEET AS
  MONOCHROME. That false zero is retracted.

  Resolving `SCN` needs the page resource dictionary, the colourspace object and
  its alternate space -- and a Separation or Indexed space has 1 or N components
  that are NOT rgb, so no amount of regex makes this sound. The colour inventory
  is therefore taken from the resolved engine in
  tools/plan-sheet-extract/plansheet.py (PyMuPDF `get_drawings()`), and the
  walker's own colour tracking is reported as UNRESOLVED rather than as grey.

  ⚠ The GEOMETRY below is unaffected and unchanged: it stays in UNROTATED
    mediabox space (1684 x 2384), which is what every committed artefact uses.

SCALE HONESTY -- read this before believing any metre figure:
  A 1:1.000 sheet means 1 mm on paper = 1 m on the ground. PDF user space is
  1/72 inch, so 1 pt = 0.352778 mm = 0.352778 m at 1:1.000. That conversion is
  SOUND for LENGTHS. It gives NO absolute position -- there is no georeference
  in the file. Placing the sheet in EPSG:25830 needs control points, and this
  script deliberately does NOT invent them. It reports RELATIVE geometry only.

  => metres_per_pt is an ASSUMPTION derived from the published sheet scale,
     flagged as such in the output. Everything else is measured.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")

# Colour comes from the resolved engine, never from the walker below.
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "plan-sheet-extract")))
import plansheet as ps  # noqa: E402

PT_TO_MM = 25.4 / 72.0
SHEET_SCALE = 1000.0                      # published: plano nº5 is 1/1.000
M_PER_PT = PT_TO_MM * SHEET_SCALE / 1000.0  # = 0.352778 m per pt at 1:1.000

NUM = r"[-+]?\d*\.?\d+"
TOK = re.compile(rb"(" + NUM.encode() + rb")|([A-Za-z\*'\"]+)|(\[)|(\])|(/[^\s/\[\]<>()]+)")


def inflate_all(raw: bytes) -> bytes:
    blobs, pos = [], 0
    pat = re.compile(rb"stream\r?\n")
    while True:
        m = pat.search(raw, pos)
        if not m:
            break
        s = m.end()
        e = raw.find(b"endstream", s)
        if e == -1:
            break
        pos = e + 9
        try:
            blobs.append(zlib.decompress(raw[s:e]))
        except Exception:  # noqa: BLE001
            pass
    return b"\n".join(blobs)


def mat_mul(a, b):
    a0, a1, a2, a3, a4, a5 = a
    b0, b1, b2, b3, b4, b5 = b
    return (a0 * b0 + a1 * b2, a0 * b1 + a1 * b3,
            a2 * b0 + a3 * b2, a2 * b1 + a3 * b3,
            a4 * b0 + a5 * b2 + b4, a4 * b1 + a5 * b3 + b5)


def apply(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def bezier(p0, p1, p2, p3, n=6):
    out = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        out.append((u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]))
    return out


def walk(content: bytes, max_subpaths: int = 400000) -> dict:
    ctm = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    stack: list = []
    stroke_rgb = (0.0, 0.0, 0.0)
    fill_rgb = (0.0, 0.0, 0.0)
    operands: list = []
    cur: list = []
    start_pt = None
    subpaths: list = []          # (pts, paint, stroke_rgb, fill_rgb)
    pending: list = []

    def flush(paint: str):
        nonlocal pending
        for pts in pending:
            if len(pts) >= 2:
                subpaths.append((pts, paint, stroke_rgb, fill_rgb))
        pending = []

    for m in TOK.finditer(content):
        num, op, lb, rb, name = m.groups()
        if num is not None:
            try:
                operands.append(float(num))
            except ValueError:
                operands.append(0.0)
            continue
        if lb or rb or name:
            if lb or rb:
                operands = []
            continue
        o = op.decode("latin-1")

        if o == "q":
            stack.append((ctm, stroke_rgb, fill_rgb))
        elif o == "Q":
            if stack:
                ctm, stroke_rgb, fill_rgb = stack.pop()
        elif o == "cm" and len(operands) >= 6:
            ctm = mat_mul(tuple(operands[-6:]), ctm)
        elif o == "RG" and len(operands) >= 3:
            stroke_rgb = tuple(operands[-3:])
        elif o == "rg" and len(operands) >= 3:
            fill_rgb = tuple(operands[-3:])
        elif o == "G" and len(operands) >= 1:
            stroke_rgb = (operands[-1],) * 3
        elif o == "g" and len(operands) >= 1:
            fill_rgb = (operands[-1],) * 3
        elif o == "m" and len(operands) >= 2:
            if len(cur) >= 2:
                pending.append(cur)
            start_pt = apply(ctm, operands[-2], operands[-1])
            cur = [start_pt]
        elif o == "l" and len(operands) >= 2:
            cur.append(apply(ctm, operands[-2], operands[-1]))
        elif o in ("c", "v", "y") and cur:
            p0 = cur[-1]
            if o == "c" and len(operands) >= 6:
                a, b, c = (apply(ctm, operands[-6], operands[-5]),
                           apply(ctm, operands[-4], operands[-3]),
                           apply(ctm, operands[-2], operands[-1]))
            elif len(operands) >= 4:
                a = p0 if o == "v" else apply(ctm, operands[-4], operands[-3])
                b = apply(ctm, operands[-4], operands[-3]) if o == "v" else apply(ctm, operands[-2], operands[-1])
                c = apply(ctm, operands[-2], operands[-1])
            else:
                operands = []
                continue
            cur.extend(bezier(p0, a, b, c))
        elif o == "re" and len(operands) >= 4:
            x, y, w, h = operands[-4:]
            pts = [apply(ctm, x, y), apply(ctm, x + w, y),
                   apply(ctm, x + w, y + h), apply(ctm, x, y + h), apply(ctm, x, y)]
            if len(cur) >= 2:
                pending.append(cur)
            cur = []
            pending.append(pts)
        elif o == "h":
            if start_pt and len(cur) >= 2:
                cur.append(start_pt)
        elif o in ("S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n"):
            if len(cur) >= 2:
                pending.append(cur)
            cur = []
            flush(o)
            if len(subpaths) > max_subpaths:
                break
        operands = []

    return {"subpaths": subpaths}


def analyse(subpaths) -> dict:
    if not subpaths:
        return {"subpath_count": 0}
    xs, ys, verts = [], [], 0
    runs: list[float] = []
    for pts, paint, srgb, frgb in subpaths:
        verts += len(pts)
        for (x, y) in pts:
            xs.append(x)
            ys.append(y)
        for i in range(len(pts) - 1):
            d = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
            if d > 0:
                runs.append(d)

    runs.sort()
    long_runs = [r for r in runs if r * M_PER_PT >= 5.0]
    bbox_pt = (min(xs), min(ys), max(xs), max(ys))
    w_m = (bbox_pt[2] - bbox_pt[0]) * M_PER_PT
    h_m = (bbox_pt[3] - bbox_pt[1]) * M_PER_PT

    def pct(p):
        return runs[int(len(runs) * p)] * M_PER_PT if runs else 0.0

    return {
        "subpath_count": len(subpaths),
        "vertex_count": verts,
        "bbox_pt": [round(v, 2) for v in bbox_pt],
        "sheet_extent_m_ASSUMES_1_1000": [round(w_m, 1), round(h_m, 1)],
        "segment_length_m_p50": round(pct(0.50), 3),
        "segment_length_m_p90": round(pct(0.90), 3),
        "segment_length_m_p99": round(pct(0.99), 3),
        "segment_length_m_max": round(runs[-1] * M_PER_PT, 2) if runs else 0.0,
        "segments_over_5m": len(long_runs),
        "colour_from_this_walker": {
            "status": "UNRESOLVED -- NOT MEASURED HERE",
            "why": ("this walker reads only RG/rg/G/g. The sheets paint through "
                    "`/Cs6 CS ... SCN`, so colour is invisible to it. Reporting its "
                    "greys as the colour table produced a FALSE ZERO ('the sheets "
                    "are greyscale'), now retracted. See `colour_resolved` below."),
        },
    }


def main() -> int:
    files = sorted(f for f in os.listdir(CACHE) if f.endswith(".pdf")) if os.path.isdir(CACHE) else []
    if not files:
        print("no cached sheets -- run probe_huesca_plano5.py first")
        return 1
    results = []
    for fn in files:
        path = os.path.join(CACHE, fn)
        raw = open(path, "rb").read()
        content = inflate_all(raw)
        w = walk(content)
        a = analyse(w["subpaths"])
        a["file"] = fn

        # RESOLVED colour table -- the walker cannot see SCN, so it does not try.
        if ps.fitz is None:
            a["colour_resolved"] = {
                "status": "UNKNOWN -- PyMuPDF (fitz) not installed",
                "why": "nothing was measured; this is NOT a finding of greyscale",
            }
        else:
            doc = ps.fitz.open(path)
            page = doc[0]
            census = ps.stroke_census(page)
            a["colour_resolved"] = {
                "source": "PyMuPDF get_drawings() via tools/plan-sheet-extract/plansheet.py",
                "SHEET_IS_COLOUR": census["is_colour"],
                **ps.colour_census(page),
                "distinct_stroke_classes_colour_width_dash": census["distinct_classes"],
                "top_non_grey_classes": sorted(
                    (c for c in census["classes"]
                     if c["stroke_rgb"] and not ps.is_greyscale(c["stroke_rgb"])),
                    key=lambda c: -c["n"],
                )[:10],
            }
            doc.close()

        results.append(a)
        cr = a["colour_resolved"]
        print(f"{fn}: {a.get('subpath_count'):>7,} subpaths  "
              f"{a.get('vertex_count'):>8,} verts  extent "
              f"{a.get('sheet_extent_m_ASSUMES_1_1000')} m  "
              f"colour={cr.get('SHEET_IS_COLOUR', 'UNKNOWN')} "
              f"non-grey stroke items={cr.get('non_grey_stroke_items', 'n/a')}")

    payload = {
        "probe": "huesca-plano5-geometry-extraction",
        "RETRACTION": {
            "superseded_claim": ("distinct_paint_colours = 7-8, every entry a pure "
                                 "grey -- i.e. the sheets are monochrome"),
            "status": "FALSE -- WITHDRAWN",
            "why_it_was_wrong": (
                "the content-stream walker in this file reads only RG/rg/G/g. These "
                "sheets paint through an ICCBased colourspace (`/Cs6 CS <r> <g> <b> "
                "SCN`); measured on H-01, 52 SCN events and ZERO RG. Unmatched SCN "
                "left every coloured path holding the last DeviceGray value, so a "
                "colour sheet was tabulated as greyscale."
            ),
            "corrected_by": "the `colour_resolved` block on each sheet below",
            "geometry_unaffected": (
                "only the colour table was wrong. Subpath counts, vertex counts, "
                "bboxes and segment histograms are unchanged and remain in UNROTATED "
                "mediabox space (1684 x 2384)."
            ),
        },
        "assumption_not_measurement": {
            "metres_per_pt": M_PER_PT,
            "basis": "published sheet scale 1/1.000; 1 pt = 25.4/72 mm",
            "WARNING": ("gives LENGTHS only. There is NO georeference in the file. "
                        "Absolute placement in EPSG:25830 requires control points "
                        "and is NOT attempted here."),
        },
        "sheets": results,
    }
    with open(os.path.join(OUT, "huesca_plano5_geometry.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print("\nwrote out/huesca_plano5_geometry.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
