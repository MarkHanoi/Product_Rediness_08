"""WHICH CÓRDOBA SHEETS TO READ, AND WHAT THE SHEET SAYS ABOUT ITSELF.

This is DATA for the engine in `tools/plan-sheet-extract/` — the same shape
`cities.py` uses there. It lives here rather than in that registry on purpose:
`cities.py` is another agent's in-flight file on another branch, and two
branches adding entries to one dict is an add/add conflict for whoever merges.
Registering Córdoba there is a one-line follow-up once both have landed.

⚠ EVERYTHING BELOW WAS MEASURED OR TRANSCRIBED, NOTHING WAS GUESSED.
   Sheet URLs come from the published index, not from a filename pattern
   extrapolated past what the index lists. Legend captions were read off a
   render of the sheet's own panel. Grid anchors were read off the printed
   graticule. Where a value has not been read, it is absent and the probe says
   so — a missing anchor is a TRANSCRIPTION GAP, never a finding of absence.
"""

from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────────────
# LEGEND — transcribed VERBATIM from the panel printed on sheet ar05.
#
# ⚠ THE COLLISION IS THE POINT. Rows R2 and R3 print two DIFFERENT legal
#   meanings — the street alignment and the building alignment — and the sheet
#   draws both in ONE stroke class: RGB(1,0,0), width 0.84, no dash array. The
#   building line is broken into short strokes BY HAND rather than by a PDF dash
#   pattern, so it is invisible to stroke-class comparison. Detection of the
#   family is certain; attribution between the two is NOT.
#
#   This is the same failure the Aragón sheet showed with «CAMBIO DE ALTURA Y
#   USO / FONDO EDIFICABLE», and it is handled the same way: the family is
#   reported, the split is bounded by measurement, and no individual line is
#   promoted to a constraint on a guess.
#
#   The sheet itself notes, under R3: «La alineación de la edificación la
#   definirá la ordenanza de zona asignada a cada parcela o el planeamiento
#   remitido» — the building line is normally NOT graphed here at all.
# ─────────────────────────────────────────────────────────────────────────────
CORDOBA_LEGEND_ROWS = [
    {
        "row": "R1",
        "label_es": "DELIMITACIÓN DE CALZADA",
        "meaning_en": "carriageway edge — the PHYSICAL road, not a legal line",
        "captions": 1,
        "swatch": (1880, 2020, 1960, 2040),
    },
    {
        "row": "R2",
        "label_es": "ALINEACIÓN DEL VIAL",
        "meaning_en": "official street alignment — the legal frontage line",
        "captions": 1,
        "swatch": (1880, 2044, 1960, 2058),
    },
    {
        "row": "R3",
        "label_es": "ALINEACIÓN DE EDIFICACIÓN",
        "meaning_en": (
            "official building line; per the sheet's own note, normally defined "
            "by the zone ordinance rather than graphed here"
        ),
        "captions": 1,
        "swatch": (1880, 2064, 1960, 2078),
    },
]

_BASE = (
    "https://www.gmucordoba.es/documentos/Gerencia_de_Urbanismo/"
    "imagenes_planos/planos/PDF_ar"
)

# ⚠ TRANSCRIBED, NOT GUESSED. Read off high-resolution renders of the printed
#   graticule labels. `*_tick_pt` are display-space page positions of the tick
#   the value belongs to; the comb fit re-derives everything else.
#   ONLY ar05 has been transcribed. Every other sheet is a TRANSCRIPTION GAP —
#   the graticule is present and measurable on all 49.
CORDOBA_GRID_ANCHORS = {
    "ar05": {
        "east_tick_pt": 373.8,
        "east_value": 341200.0,
        "north_tick_pt": 204.68,
        "north_value": 4199000.0,
        # The neatline corner values the sheet PRINTS, held back as an
        # INDEPENDENT check on the fit — deliberately not an input to it.
        "printed_corner": [341041.0, 4199101.0],
    },
}

CORDOBA = {
    "city": "Córdoba",
    "ine": "14021",
    # §CATASTRO-DGC-NOT-INE — Catastro bulk feeds key on the DGC code. Keyed on
    # the INE code they answer HTTP 200 with ZERO matches, which is
    # indistinguishable from "no coverage".
    "catastro_dgc": "14900",
    "status": (
        "TESTED — 49/49 sheets vector; legend bound by measurement; grid "
        "georeference measured on ar05; DATUM unresolved"
    ),
    "instrument": (
        "PGOU Córdoba 2001, texto refundido octubre 2002 — plano «Alineaciones y "
        "Rasantes» 1:2000, 49 hojas. Normativa: «Las alineaciones y rasantes del "
        "Suelo Urbano serán las grafiadas en el plano de Alineaciones y Rasantes a "
        "escala 1/2000», and that sheet PREVAILS where it is more precise — it is "
        "the superior instrument, not one source among several."
    ),
    "sheet_index_url": "https://www.gmucordoba.es/planos/alineaciones-y-rasantes",
    # ⚠ PRINTED, AND FALSE OF THE PDF. The title block says 1:2000; the delivered
    #   A0 page measures ~1:1687 against its own graticule. See TRAP 5 in
    #   plangrid.py. Kept here only so the disagreement is REPORTABLE — it must
    #   never be used to derive metres.
    "printed_scale_denominator": 2000.0,
    "grid_interval_m": 200.0,
    "declared_crs": None,
    "declared_crs_note": (
        "NOT DECLARED anywhere on the sheet or in its PDF metadata. The graticule "
        "fixes UTM 30N coordinates but not the DATUM. A 2002 plan predates "
        "RD 1071/2007, so ED50 (EPSG:23030) is the probable frame and ETRS89 "
        "(EPSG:25830) the probable error — the two are ~200 m apart."
    ),
    "legend_sheet": "ar05",
    "legend_panel": (1580, 2010, 2400, 2100),
    "legend_rows": CORDOBA_LEGEND_ROWS,
    "sheet_grid_anchors": CORDOBA_GRID_ANCHORS,
    # The stroke class the alignment family is drawn in, MEASURED off the legend
    # swatch on ar05 rather than assumed.
    "alignment_stroke_key": (
        '{"dashes": "[] 0", "stroke_rgb": [1.0, 0.0, 0.0], "width": 0.84}'
    ),
    # Length of ONE stroke of the R3 swatch's hand-broken dash, measured on ar05
    # (1888.1 → 1898.2 pt); the gaps run ~5.1 pt. Used ONLY to bound how much of
    # the red family could be the building line — never to label a line.
    "legend_dash_pt": 10.1,
    # All 49 sheets are LISTED on the published index page; the pattern is
    # confirmed against that list, not extrapolated beyond it.
    "sheets": {f"ar{i:02d}": f"{_BASE}/ar{i:02d}.pdf" for i in range(1, 50)},
    "notes": (
        "⚠ The red family is NOT the callejero. On ar05 the red lines run as PAIRS "
        "bounding each street corridor and visibly depart from the black kerb "
        "linework — which is exactly why `idecordoba:ejes_red_viaria` (centreline, "
        "16.7 % on-frontage) and `idecordoba:sup_viales` (kerb, 83.9 %) cannot "
        "substitute for them. The PGOU forbids the substitution outright."
    ),
}

CITIES = {"cordoba": CORDOBA}
