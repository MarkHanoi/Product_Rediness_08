"""Step 4: BIND THE LEGEND. Symbology -> planning meaning, by MEASUREMENT.

THE METHOD, AND WHY IT IS THE REUSABLE PART
-------------------------------------------
A plan sheet's legend is a table: a SWATCH drawn in the sheet's own symbology,
next to a LABEL naming what it means. On these sheets the label is outlined
vector (no text layer), so a human reads it once from a render. But the SWATCH
is real geometry at a known page position, so its stroke class -- colour, width,
dash pattern -- is MEASURABLE.

So the binding is:

    human reads the LABEL once  ->  machine measures the SWATCH beside it
                                ->  that stroke class now carries that meaning
                                    everywhere else on the sheet.

That is a general capability, not a Huesca trick. Any CAD-plotted plan sheet
with an on-sheet legend can be bound this way, which is the point: Valencia's
plano C and Zaragoza's tomo 11 are untested but are the same artefact class.

>> WHAT THIS FILE MUST NOT DO. Where two legend rows are drawn with an
   INDISTINGUISHABLE stroke class, the binding is AMBIGUOUS and is recorded as
   UNKNOWN. It is not resolved by preferring the more useful meaning. An
   UNKNOWN constraint drawn as a number is how buildability gets overstated.

Run:  python tools/aragon-plan-georef/legend_swatch_binding.py
Out:  tools/aragon-plan-georef/out/legend_binding.json
"""

from __future__ import annotations

import json
import os

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")

SHEET = "H-01"

# The legend panel on plano n5, in PDF points. Established by rendering the
# sheet and reading it (see out/renders/H-01_legend_*.png).
LEGEND_PANEL = fitz.Rect(60, 1440, 1150, 1690)

# ── THE HUMAN READ. Each row: the label as it is printed on the sheet, and the
#    page-space band its SWATCH occupies. Transcribed from
#    out/renders/H-01_legend_delimitaciones.png at 3.2x.
#    ⚠ These strings are VERBATIM from the sheet. They are the citation.
#    `swatch` bands are DISPLAY-space rects transcribed from measurement
#    (diag_legend_dump.py), not estimated off pixels.
#
#    `captions` is the number of DISTINCT planning meanings the sheet prints
#    against that one swatch. >1 means the sheet itself does not distinguish
#    them, and no amount of geometry measurement can recover what was never
#    drawn differently.
LEGEND_ROWS = [
    {
        "row": "L1",
        "label_es": "LÍMITE DE TÉRMINO MUNICIPAL",
        "meaning_en": "municipal boundary",
        "planning_role": "administrative extent -- not a buildability constraint",
        "captions": 1,
        "swatch": (90, 1484, 176, 1494),
    },
    {
        "row": "L2",
        "label_es": "LÍMITE DE SUELO URBANO",
        "meaning_en": "boundary of urban land (suelo urbano)",
        "planning_role": "land CLASS boundary; inside it the urban ordinance applies",
        "captions": 1,
        "swatch": (90, 1508, 176, 1516),
    },
    {
        "row": "L3",
        "label_es": (
            "LÍMITE DE NORMA ZONAL Y GRADOS / LÍMITE DE ÁREA DE PLANEAMIENTO "
            "INCORPORADO (API) / LÍMITE DE ÁREA DE PLANEAMIENTO ESPECÍFICO (APE) "
            "/ LÍMITE DE ÁREA DE PLANEAMIENTO REMITIDO (APR)"
        ),
        "meaning_en": (
            "ONE symbol shared by FOUR different boundary meanings: zonal-norm "
            "and grade boundary, and the boundaries of the three kinds of "
            "planning area"
        ),
        "planning_role": (
            "boundary of SOMETHING -- which of the four is not recoverable from "
            "the line itself"
        ),
        "captions": 4,
        "swatch": (90, 1560, 176, 1569),
    },
    {
        "row": "L4",
        "label_es": "RASANTE",
        "meaning_en": "rasante -- the official finished ground level, in metres",
        "planning_role": (
            "the DATUM from which height is measured. Printed as a symbol plus a "
            "number (the legend's example reads 4.80)"
        ),
        "captions": 1,
        "swatch": (112, 1604, 176, 1628),
    },
    {
        "row": "R1",
        "label_es": "ALINEACIÓN",
        "meaning_en": "official alignment -- the line the façade must sit on",
        "planning_role": "the FRONT of the buildable envelope",
        "captions": 1,
        "swatch": (455, 1486, 540, 1495),
    },
    {
        "row": "R2",
        "label_es": "CAMBIO DE ALTURA Y USO / FONDO EDIFICABLE",
        "meaning_en": (
            "EITHER a change-of-height-and-use line OR the buildable depth line "
            "-- the sheet prints both captions against ONE swatch"
        ),
        "planning_role": (
            "would be the BACK of the buildable envelope IF the line is a fondo "
            "edificable -- but the same symbol also denotes a height/use change, "
            "which is NOT a depth limit"
        ),
        "captions": 2,
        "swatch": (455, 1508, 540, 1516),
    },
    {
        "row": "R3",
        "label_es": "SOPORTAL Y PASAJES",
        "meaning_en": "arcade and passageway",
        "planning_role": "ground-floor void obligation under the built volume",
        "captions": 1,
        "swatch": (455, 1529, 540, 1538),
    },
]


def stroke_class(d: dict) -> dict:
    """The measurable identity of a drawn line."""

    def rgb(c):
        if c is None:
            return None
        return [round(float(v), 4) for v in c]

    dashes = d.get("dashes")
    return {
        "type": d.get("type"),
        "stroke_rgb": rgb(d.get("color")),
        "fill_rgb": rgb(d.get("fill")),
        "width": round(float(d.get("width") or 0), 4),
        "dashes": (dashes or "").strip() if isinstance(dashes, str) else dashes,
    }


def key(sc: dict) -> str:
    return json.dumps(
        {
            "stroke_rgb": sc["stroke_rgb"],
            "width": sc["width"],
            "dashes": sc["dashes"],
        },
        sort_keys=True,
    )


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(CACHE, f"plano5_{SHEET}.pdf")
    if not os.path.exists(path):
        raise SystemExit(f"not cached: {path} -- run pdf_metadata_probe.py first")

    doc = fitz.open(path)
    page = doc[0]

    # ⛔ THE TRAP THAT COST THIS PROBE A FALSE ZERO.
    # `page.rotation` is 90 on these sheets. `page.get_pixmap()` renders in
    # DISPLAY space (2384 x 1684) but `page.get_drawings()` returns geometry in
    # UNROTATED mediabox space (1684 x 2384). Swatch bands transcribed off a
    # render are therefore in the WRONG SPACE, and every band matched ZERO
    # drawings -- indistinguishable from "the legend has no geometry".
    # `page.rotation_matrix` maps unrotated -> display, so applying it puts the
    # measured geometry in the same space as the human read.
    rot = page.rotation_matrix
    drawings = []
    for d in page.get_drawings():
        r = d.get("rect")
        if r is None:
            continue
        e = dict(d)
        e["rect"] = fitz.Rect(r) * rot
        drawings.append(e)

    bound: list[dict] = []
    for row in LEGEND_ROWS:
        rect = fitz.Rect(*row["swatch"])
        found: list[dict] = []
        for d in drawings:
            r = d.get("rect")
            if r is None:
                continue
            # ⛔ SECOND FALSE ZERO, SAME SHAPE AS THE FIRST.
            # A legend swatch is a HORIZONTAL RULE, so its rect has y0 == y1.
            # fitz classifies a zero-area rect as EMPTY and `Rect.intersects()`
            # returns False for it -- so every horizontal swatch scored zero
            # while sitting exactly where it was expected. Containment is
            # therefore tested numerically, never through `intersects()`.
            #
            # A swatch must sit INSIDE the band on both axes; that is also what
            # rejects the panel's own table rules and the full-page strokes.
            if not (rect.x0 - 6 <= r.x0 and r.x1 <= rect.x1 + 6):
                continue
            if not (rect.y0 - 6 <= r.y0 and r.y1 <= rect.y1 + 6):
                continue
            sc = stroke_class(d)
            if sc["type"] == "f" and sc["stroke_rgb"] is None:
                sc["stroke_rgb"] = sc["fill_rgb"]
            found.append(sc)

        classes: dict[str, dict] = {}
        for sc in found:
            classes.setdefault(key(sc), sc)

        bound.append(
            {
                **{k: v for k, v in row.items() if k != "swatch"},
                "swatch_rect_pt": row["swatch"],
                "measured_stroke_classes": list(classes.values()),
                "n_drawings_in_swatch": len(found),
                "measured": bool(found),
            }
        )

    # ── AMBIGUITY DETECTION. Two rows sharing a stroke class cannot be told
    #    apart on the map. That is a finding, and it downgrades BOTH to UNKNOWN.
    by_class: dict[str, list[str]] = {}
    for b in bound:
        for sc in b["measured_stroke_classes"]:
            by_class.setdefault(key(sc), []).append(b["row"])

    collisions = {k: v for k, v in by_class.items() if len(set(v)) > 1}
    colliding_rows = {r for rows in collisions.values() for r in rows}

    for b in bound:
        if not b["measured"]:
            b["BINDING"] = "UNKNOWN"
            b["why"] = "no geometry found in the swatch band; nothing measured"
        elif b["row"] in colliding_rows:
            b["BINDING"] = "UNKNOWN"
            b["why"] = (
                "this row's stroke class is INDISTINGUISHABLE from another "
                "legend row's, so a line bearing it cannot be attributed to one "
                "meaning. NOT resolved by preference."
            )
        elif b["captions"] > 1:
            # ⚠ THE STROKE CLASS IS MEASURABLE; THE MEANING IS NOT UNIQUE.
            # These two failure modes are different and must not be merged: the
            # line CAN be found on the map, but finding it does not tell you
            # which of the printed captions it carries. Usable for detection,
            # NEVER usable as a numeric constraint.
            b["BINDING"] = "CLASS_BOUND_MEANING_UNKNOWN"
            b["why"] = (
                f"the sheet prints {b['captions']} distinct planning meanings "
                "against this ONE swatch, so a line of this class cannot be "
                "attributed to a single meaning from the drawing alone"
            )
        else:
            b["BINDING"] = "BOUND"
            b["why"] = "unique measured stroke class, single legend caption"

    report = {
        "probe": "aragon-plan-georef-step4-legend-binding",
        "sheet": SHEET,
        "source_document": (
            "Ayuntamiento de Huesca, Revision y Adaptacion del Plan General de "
            "Ordenacion Urbana, TEXTO REFUNDIDO, ENERO 2008 -- Plano 5, "
            "'CLASIFICACION, CALIFICACION Y REGULACION DEL SUELO Y LA "
            "EDIFICACION EN SUELO URBANO. RED VIARIA, ALINEACIONES Y RASANTES', "
            "hoja 1 de 28, escala 1/1.000"
        ),
        "citation_basis": (
            "every label_es string is transcribed VERBATIM from the legend panel "
            "printed on the sheet itself (out/renders/H-01_legend_*.png). The "
            "sheet's own legend is the primary source for its own symbology."
        ),
        "counts": {
            "BOUND": sum(1 for b in bound if b["BINDING"] == "BOUND"),
            "CLASS_BOUND_MEANING_UNKNOWN": sum(
                1 for b in bound if b["BINDING"] == "CLASS_BOUND_MEANING_UNKNOWN"
            ),
            "UNKNOWN": sum(1 for b in bound if b["BINDING"] == "UNKNOWN"),
        },
        "verdict_meanings": {
            "BOUND": "one measurable stroke class, one planning meaning. Usable.",
            "CLASS_BOUND_MEANING_UNKNOWN": (
                "the line is findable on the map but the sheet prints more than "
                "one meaning against it. Usable for DETECTION, never as a "
                "numeric constraint."
            ),
            "UNKNOWN": "nothing measured, or indistinguishable from another row.",
        },
        "stroke_class_collisions": {
            "n": len(collisions),
            "rows_downgraded_to_unknown": sorted(colliding_rows),
            "detail": collisions,
        },
        "rows": bound,
    }

    out = os.path.join(OUT, "legend_binding.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    for b in bound:
        print(f"{b['BINDING']:8} {b['row']:3} {b['label_es'][:52]:54}")
        for sc in b["measured_stroke_classes"]:
            print(
                f"           stroke={sc['stroke_rgb']} w={sc['width']} "
                f"dash={sc['dashes']!r} type={sc['type']}"
            )
    print(f"\ncollisions: {len(collisions)} -> {sorted(colliding_rows)}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
