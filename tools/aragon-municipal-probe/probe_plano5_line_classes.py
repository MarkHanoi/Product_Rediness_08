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

────────────────────────────────────────────────────────────────────────────
⛔ RETRACTION -- THIS PROBE ONCE PUBLISHED A FALSE ZERO.
────────────────────────────────────────────────────────────────────────────
An earlier version of this file asserted:

    "THE SHEETS ARE GREYSCALE. Measured: every paint colour on all six sampled
     sheets satisfies r == g == b. So COLOUR CANNOT CARRY ZONE IDENTITY here."

THAT IS FALSE, and it was false for a mechanical reason worth naming because it
recurs. The old implementation scanned the inflated content stream with a regex
that matched exactly two colour operators:

    `R G B RG`   (DeviceRGB stroke)      and   `GRAY G`   (DeviceGray stroke)

These sheets set colour almost entirely through an ICCBased colourspace instead:

    /Cs6 CS   1 0 0   SCN

Measured on H-01: 52 `SCN` + 32 `CS` events against 45 `G` and ZERO `RG`. The
scanner never matched `SCN`, so every coloured stroke silently inherited the last
DeviceGray value. On top of that, the one branch that DID read colour collapsed
the triple to its mean -- `gray = (r+g+b)/3` -- destroying the very channel it
had just parsed. Two independent faults, one indistinguishable artefact:
r == g == b everywhere, which looks exactly like a genuinely monochrome plot.

⚠ THE LESSON IS NOT "USE A BIGGER REGEX". Resolving `SCN` requires the page
  resource dictionary, the colourspace object and its alternate space. That is a
  PDF interpreter's job. Colour identity is therefore taken from PyMuPDF's
  `get_drawings()` via the shared engine in tools/plan-sheet-extract/plansheet.py
  -- the same engine that produced tools/plan-sheet-extract/out/huesca_plan_sheets.json
  -- and from nowhere else.

WHAT IS ACTUALLY TRUE: the sheets ARE in colour, and colour is the dominant
discriminating channel. Width and dash remain necessary as SECONDARY channels,
because the legend prints two different meanings against two reds that differ by
0.12 pt of width and nothing else.
"""
from __future__ import annotations

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")

# Reuse the city-agnostic engine; do NOT re-implement a PDF interpreter here.
ENGINE = os.path.abspath(os.path.join(HERE, "..", "plan-sheet-extract"))
sys.path.insert(0, ENGINE)

import plansheet as ps  # noqa: E402
from cities import HUESCA_LEGEND_ROWS  # noqa: E402

# The three bindings this probe MUST reproduce. They were measured from the
# graphics state with 0 collisions; if a re-run disagrees, the extractor is
# wrong, not the bindings.
EXPECTED_BINDINGS = {
    "R1": {"stroke_rgb": [1.0, 0.0, 0.0], "width": 0.72, "dashes": "[] 0"},
    "R2": {"stroke_rgb": [1.0, 0.0, 0.0], "width": 0.6, "dashes": "[] 0"},
    "R3": {"stroke_rgb": [1.0, 0.0, 0.0], "width": 0.6, "dashes": "[ 11.88 3.96 ] 0"},
}


def sheet_row(path: str, sheet: str) -> dict:
    doc = ps.fitz.open(path)
    page = doc[0]

    census = ps.stroke_census(page)
    colour = ps.colour_census(page)
    classes = census["classes"]

    # Width and dash remain measured axes -- they are what separates the two
    # reds that colour alone cannot.
    widths: dict[float, int] = {}
    dashes: dict[str, int] = {}
    for c in classes:
        widths[c["width"]] = widths.get(c["width"], 0) + c["n"]
        key = c["dashes"] if isinstance(c["dashes"], str) else "unknown"
        dashes[key] = dashes.get(key, 0) + c["n"]

    def solid(d: str) -> bool:
        return d.replace(" ", "") in ("[]0", "[]", "")

    non_grey_classes = [
        c for c in classes if c["stroke_rgb"] and not ps.is_greyscale(c["stroke_rgb"])
    ]
    unresolved_classes = [c for c in classes if c["stroke_rgb"] is None]
    dashed = [c for c in classes if isinstance(c["dashes"], str) and not solid(c["dashes"])]

    legend = ps.bind_legend(page, HUESCA_LEGEND_ROWS)
    reproduced = {}
    for row in legend["rows"]:
        exp = EXPECTED_BINDINGS.get(row["row"])
        if not exp:
            continue
        got = row["measured_stroke_classes"]
        reproduced[row["row"]] = {
            "expected": exp,
            "measured": got,
            "REPRODUCED": any(
                m["stroke_rgb"] == exp["stroke_rgb"]
                and m["width"] == exp["width"]
                and m["dashes"] == exp["dashes"]
                for m in got
            ),
        }

    row = {
        "sheet": sheet,
        "file": os.path.basename(path),
        "page_rotation": page.rotation,
        "distinct_stroke_classes": census["distinct_classes"],
        "SHEET_IS_COLOUR": census["is_colour"],
        "colour_census": colour,
        "distinct_non_grey_classes": len(non_grey_classes),
        "distinct_unresolved_colour_classes": len(unresolved_classes),
        "distinct_line_widths": len(widths),
        "distinct_dash_patterns": len(dashes),
        "line_widths": [
            {"width_pt": k, "items": v}
            for k, v in sorted(widths.items(), key=lambda kv: -kv[1])[:12]
        ],
        "dash_patterns": [
            {"pattern": k, "items": v}
            for k, v in sorted(dashes.items(), key=lambda kv: -kv[1])[:12]
        ],
        "top_classes": classes[:15],
        "non_grey_classes": sorted(non_grey_classes, key=lambda c: -c["n"])[:20],
        "dashed_item_count": sum(c["n"] for c in dashed),
        "dashed_classes": sorted(dashed, key=lambda c: -c["n"])[:10],
        "legend": {
            "counts": legend["counts"],
            "collisions": legend["collisions"],
            "rows": legend["rows"],
        },
        "expected_binding_check": reproduced,
    }
    doc.close()
    return row


def main() -> int:
    if ps.fitz is None:
        print("PyMuPDF (fitz) is not installed -- NOTHING WAS MEASURED. "
              "Refusing to write an artefact.")
        return 2
    if not os.path.isdir(CACHE):
        print("run probe_huesca_plano5.py first (it fetches the sheets)")
        return 1
    files = sorted(f for f in os.listdir(CACHE)
                   if f.startswith("huesca_plano5_") and f.endswith(".pdf"))
    if not files:
        print("run probe_huesca_plano5.py first")
        return 1

    sheets = []
    for fn in files:
        sheet = fn.replace("huesca_plano5_", "").replace(".pdf", "")
        r = sheet_row(os.path.join(CACHE, fn), sheet)
        sheets.append(r)
        cc = r["colour_census"]
        ok = sum(1 for v in r["expected_binding_check"].values() if v["REPRODUCED"])
        print(f"{sheet}: classes={r['distinct_stroke_classes']:>3} "
              f"(non-grey {r['distinct_non_grey_classes']:>3}) "
              f"colour={r['SHEET_IS_COLOUR']!s:<5} "
              f"non-grey stroke items={cc['non_grey_stroke_items']:>6,} "
              f"widths={r['distinct_line_widths']:>2} "
              f"dashes={r['distinct_dash_patterns']:>2} "
              f"legend {ok}/3")

    ocg = {}
    for fn in files:
        with open(os.path.join(CACHE, fn), "rb") as fh:
            ocg[fn] = len(ps.named_layers(fh.read()))

    payload = {
        "probe": "huesca-plano5-line-classes",
        "when": time.strftime("%Y-%m-%d"),
        "question": ("Is the linea de fondo edificable drawn in a graphics state "
                     "distinguishable from the base map?"),
        "RETRACTION": {
            "superseded_claim": ("all paint colours on all sampled sheets are "
                                 "greyscale (r==g==b) -- zone identity is NOT "
                                 "colour-coded on this plan"),
            "status": "FALSE -- WITHDRAWN",
            "why_it_was_wrong": (
                "The previous extractor scanned the content stream for the colour "
                "operators `RG` and `G` only. These sheets set colour through an "
                "ICCBased colourspace (`/Cs6 CS <r> <g> <b> SCN`): measured on H-01, "
                "52 SCN + 32 CS events and ZERO RG. Unmatched SCN left every coloured "
                "stroke holding the last DeviceGray value. Separately, the one branch "
                "that did parse RG collapsed it to gray=(r+g+b)/3, destroying colour "
                "it had already read. Both faults yield r==g==b everywhere, which is "
                "indistinguishable from a monochrome plot."
            ),
            "corrected_by": (
                "PyMuPDF get_drawings() via tools/plan-sheet-extract/plansheet.py, "
                "which resolves the page resource dictionary and the colourspace "
                "alternate. Independently corroborated by "
                "tools/plan-sheet-extract/out/huesca_plan_sheets.json."
            ),
        },
        "method": {
            "engine": "tools/plan-sheet-extract/plansheet.py (stroke_census + colour_census + bind_legend)",
            "class_identity": "(stroke_rgb, width_pt, dash_pattern) -- a triple, not a grey level",
            "unit_of_count": (
                "one get_drawings() entry = one painted path object. This is NOT the "
                "raw `S`-operator count reported by the byte-level probe in "
                "probe_huesca_plano5.py; the two are different units and must not be "
                "compared."
            ),
            "grey_tolerance": ps.GREY_TOLERANCE,
            "why_a_tolerance": (
                "8-bit source values round-trip through PDF reals unevenly: 75% grey "
                "arrives as (0.7539, 0.7540, 0.7539). An exact r==g==b test would "
                "score that as COLOUR and inflate the count with quantisation noise."
            ),
        },
        "coordinate_space": {
            "page_rotation_deg": 90,
            "mediabox": "portrait 1684 x 2384 (UNROTATED)",
            "display": "landscape 2384 x 1684",
            "NOTE": (
                "class identity (colour, width, dash) is rotation-invariant, and this "
                "artefact records NO geometry, so it introduces no coordinate change. "
                "The geometry committed in huesca_plano5_geometry.json remains in "
                "UNROTATED mediabox space and is unaffected. The legend swatch "
                "rectangles in cities.py are DISPLAY space, which is why bind_legend "
                "applies page.rotation_matrix before testing containment."
            ),
        },
        "sheets": sheets,
        "UNRESOLVED": {
            "two_meanings_one_swatch": {
                "rows": ["R2"],
                "caption": "CAMBIO DE ALTURA Y USO / FONDO EDIFICABLE",
                "status": "REFUSED -- NOT RESOLVABLE FROM THIS SHEET",
                "why": (
                    "R1 (ALINEACION) is red w0.72 solid and R2 is red w0.60 solid. The "
                    "ONLY channel separating them is 0.12 pt of line width, and R2 "
                    "itself carries TWO distinct planning meanings printed against one "
                    "swatch. A layer name would separate them, but the sheets publish "
                    "ZERO optional-content groups (measured, below), so no such name "
                    "exists. Any assignment of a given red w0.60 line to 'fondo "
                    "edificable' rather than 'cambio de altura y uso' would be a GUESS."
                ),
                "optional_content_groups_per_sheet": ocg,
                "usable_for": "DETECTION of the line, never as a numeric constraint",
            },
            "georeference": {
                "status": "REFUSED -- OUT OF SCOPE, ALREADY MEASURED ABSENT",
                "why": (
                    "no /Measure, /VP, /GPTS, /LGIDict, /Neatline, no EPSG string, no "
                    "world file, no GeoPDF. Placing these lines on the ground needs "
                    "control points that this programme does not have."
                ),
            },
        },
        "VERDICT": (
            "SEPARABLE ON COLOUR. The sheets are in colour and the line work is "
            "differentiated; the alineacion and the fondo/altura line are both "
            "findable. What remains blocked is not FINDING the line but NAMING it: "
            "one swatch, two meanings, no layer names."
        ),
    }

    with open(os.path.join(OUT, "huesca_plano5_line_classes.json"), "w",
              encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print("\nwrote out/huesca_plano5_line_classes.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
