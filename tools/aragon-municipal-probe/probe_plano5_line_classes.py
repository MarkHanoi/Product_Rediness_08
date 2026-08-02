#!/usr/bin/env python3
"""
probe_plano5_line_classes.py -- CAN THE *fondo edificable* LINE BE SEPARATED?

Establishing the sheet is vector is not enough. A plano nº5 sheet carries
27k-99k subpaths mixing cadastral parcels, building outlines, contour lines,
street kerbs, hatching, outlined text -- AND the two lines that actually matter:

    * la ALINEACION OFICIAL      (the datum every Huesca norma zonal measures from)
    * la LINEA DE FONDO EDIFICABLE (art. 8.4.8 -- the graphic override on the 20 m)

If those are drawn in a distinguishable graphics state, extraction is a
classification problem with a known answer. If everything is one undifferentiated
black 0.1 pt stroke, it is an unsupervised problem and the honest answer is that
the override cannot be located automatically.

⛔ THE SHEETS ARE GREYSCALE. Measured: every paint colour on all six sampled
sheets satisfies r == g == b. So COLOUR CANNOT CARRY ZONE IDENTITY here. The
discriminating channel, if there is one, must be LINE WIDTH (`w`) and DASH
PATTERN (`d`). This measures exactly those two.
"""
from __future__ import annotations

import json
import os
import re
import sys
import zlib
from collections import Counter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
CACHE = os.path.join(OUT, "pdf_cache")

NUM = r"[-+]?\d*\.?\d+"
# graphics-state ops we care about, plus the paint ops that terminate a path
GS_RE = re.compile(
    rb"(?P<w>" + NUM.encode() + rb")\s+w(?=[\s])"
    rb"|\[(?P<dash>[^\]]*)\]\s*(?P<phase>" + NUM.encode() + rb")\s+d(?=[\s])"
    rb"|(?P<rgbs>" + NUM.encode() + rb"\s+" + NUM.encode() + rb"\s+" + NUM.encode()
    + rb")\s+RG(?=[\s])"
    rb"|(?P<gray>" + NUM.encode() + rb")\s+G(?=[\s])"
    rb"|(?P<paint>S|s|f\*|f|B\*|B|b\*|b|n)(?=[\s])"
    rb"|(?P<q>q)(?=[\s])|(?P<Q>Q)(?=[\s])"
)


def inflate(raw: bytes) -> bytes:
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


def classes(content: bytes) -> dict:
    width = 1.0
    dash = "solid"
    gray = 0.0
    stack: list = []
    combos: Counter = Counter()
    widths: Counter = Counter()
    dashes: Counter = Counter()

    for m in GS_RE.finditer(content):
        if m.group("q"):
            stack.append((width, dash, gray))
        elif m.group("Q"):
            if stack:
                width, dash, gray = stack.pop()
        elif m.group("w"):
            try:
                width = round(float(m.group("w")), 3)
            except ValueError:
                pass
        elif m.group("dash") is not None:
            arr = m.group("dash").decode("latin-1", "replace").split()
            nums = []
            for a in arr:
                try:
                    nums.append(round(float(a), 2))
                except ValueError:
                    pass  # a byte that is not a number is not a dash entry
            dash = "solid" if not nums else ",".join(str(n) for n in nums)
        elif m.group("gray"):
            try:
                gray = round(float(m.group("gray")), 2)
            except ValueError:
                pass
        elif m.group("rgbs"):
            v = [float(x) for x in m.group("rgbs").split()]
            gray = round(sum(v) / 3.0, 2)
        elif m.group("paint"):
            p = m.group("paint").decode()
            if p in ("S", "s", "B", "B*", "b", "b*"):
                combos[(width, dash, gray)] += 1
                widths[width] += 1
                dashes[dash] += 1
    return {"stroke_classes": combos, "widths": widths, "dashes": dashes}


def main() -> int:
    files = sorted(f for f in os.listdir(CACHE)
                   if f.startswith("huesca_plano5_") and f.endswith(".pdf"))
    if not files:
        print("run probe_huesca_plano5.py first")
        return 1
    sheets = []
    for fn in files:
        c = inflate(open(os.path.join(CACHE, fn), "rb").read())
        r = classes(c)
        combos = r["stroke_classes"]
        row = {
            "file": fn,
            "distinct_stroke_classes": len(combos),
            "distinct_line_widths": len(r["widths"]),
            "distinct_dash_patterns": len(r["dashes"]),
            "dash_patterns": [{"pattern": k, "strokes": v}
                              for k, v in r["dashes"].most_common(12)],
            "line_widths": [{"width_pt": k, "strokes": v}
                            for k, v in r["widths"].most_common(12)],
            "top_classes": [{"width_pt": k[0], "dash": k[1], "gray": k[2],
                             "strokes": v} for k, v in combos.most_common(15)],
        }
        # A DASHED stroke class is the strongest single candidate: Spanish
        # planning sheets conventionally draw the linea de fondo edificable /
        # alineacion interior DASHED, and the base map SOLID.
        dashed = {k: v for k, v in combos.items() if k[1] != "solid"}
        row["dashed_stroke_count"] = sum(dashed.values())
        row["dashed_classes"] = [{"width_pt": k[0], "dash": k[1], "gray": k[2],
                                  "strokes": v}
                                 for k, v in sorted(dashed.items(),
                                                    key=lambda kv: -kv[1])[:10]]
        sheets.append(row)
        print(f"{fn}: classes={row['distinct_stroke_classes']:>4} "
              f"widths={row['distinct_line_widths']:>3} "
              f"dashes={row['distinct_dash_patterns']:>3} "
              f"dashed_strokes={row['dashed_stroke_count']:>7,}")

    payload = {
        "probe": "huesca-plano5-line-classes",
        "question": ("Is the linea de fondo edificable drawn in a graphics state "
                     "distinguishable from the base map?"),
        "colour_is_ruled_out": ("all paint colours on all sampled sheets are "
                                "greyscale (r==g==b) -- zone identity is NOT "
                                "colour-coded on this plan"),
        "sheets": sheets,
    }
    with open(os.path.join(OUT, "huesca_plano5_line_classes.json"), "w",
              encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print("\nwrote out/huesca_plano5_line_classes.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
