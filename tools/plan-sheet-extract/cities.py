"""WHICH PLAN SHEETS TO TEST, PER CITY — data for the engine in `plansheet.py`.

⚠ EVERY CITY BELOW EXCEPT HUESCA IS `UNTESTED`, AND THAT WORD IS LOAD-BEARING.
`UNTESTED` means nobody has run the anatomy probe on those sheets. It does NOT
mean "raster", it does NOT mean "unavailable", and it must never be reported as
either. Huesca's sheets were assumed unusable for years on exactly that kind of
inference, and the assumption was false.

⛔ NO SHEET URL IS GUESSED HERE. A fabricated URL that 404s would manufacture
   evidence of absence for a document that exists. Where the sheet index has not
   been located, `sheets` is empty and `status` says so.
"""

from __future__ import annotations

HUESCA_LEGEND_PANEL = (60, 1440, 1150, 1700)

# Transcribed VERBATIM from the legend panel printed on the sheet itself
# («DELIMITACIONES Y SIMBOLOGÍA»), read from a render because the glyphs are
# outlined vector. `captions` = how many distinct planning meanings the sheet
# prints against that ONE swatch.
HUESCA_LEGEND_ROWS = [
    {
        "row": "L1",
        "label_es": "LÍMITE DE TÉRMINO MUNICIPAL",
        "meaning_en": "municipal boundary",
        "captions": 1,
        "swatch": (90, 1484, 176, 1494),
    },
    {
        "row": "L2",
        "label_es": "LÍMITE DE SUELO URBANO",
        "meaning_en": "boundary of urban land",
        "captions": 1,
        "swatch": (90, 1508, 176, 1516),
    },
    {
        "row": "L3",
        "label_es": (
            "LÍMITE DE NORMA ZONAL Y GRADOS / LÍMITE DE ÁREA DE PLANEAMIENTO "
            "INCORPORADO (API) / ESPECÍFICO (APE) / REMITIDO (APR)"
        ),
        "meaning_en": "four different boundary meanings sharing one symbol",
        "captions": 4,
        "swatch": (90, 1560, 176, 1569),
    },
    {
        "row": "L4",
        "label_es": "RASANTE",
        "meaning_en": "official finished ground level, annotated in metres",
        "captions": 1,
        "swatch": (112, 1604, 176, 1628),
    },
    {
        "row": "R1",
        "label_es": "ALINEACIÓN",
        "meaning_en": "official alignment -- the front of the buildable envelope",
        "captions": 1,
        "swatch": (455, 1486, 540, 1495),
    },
    {
        "row": "R2",
        "label_es": "CAMBIO DE ALTURA Y USO / FONDO EDIFICABLE",
        "meaning_en": "height/use change OR buildable depth -- the sheet does not say which",
        "captions": 2,
        "swatch": (455, 1508, 540, 1516),
    },
    {
        "row": "R3",
        "label_es": "SOPORTAL Y PASAJES",
        "meaning_en": "arcade and passageway",
        "captions": 1,
        "swatch": (455, 1529, 540, 1538),
    },
]

_HUESCA_BASE = "https://www.huesca.es/documents/33451/300865"

CITIES = {
    "huesca": {
        "city": "Huesca",
        "ine": "22125",
        "catastro_dgc": "22901",
        "status": "TESTED",
        "instrument": (
            "PGOU Huesca, texto refundido enero 2008 — plano nº 5, «Clasificación, "
            "calificación y regulación del suelo y la edificación en suelo urbano. "
            "Red viaria, alineaciones y rasantes», 28 hojas"
        ),
        "scale_denominator": 1000.0,  # printed in the title block: "ESCALA 1 / 1.000"
        "declared_crs": "EPSG:25830",
        "legend_panel": HUESCA_LEGEND_PANEL,
        "legend_rows": HUESCA_LEGEND_ROWS,
        "sheets": {
            "H-01": f"{_HUESCA_BASE}/05+Calificacion+del+Suelo+Urbano+H-01.pdf/"
            "db40abac-6f90-7808-833f-a109f527dec0?t=1552033978540",
            "H-05": f"{_HUESCA_BASE}/05+Calificacion+del+Suelo+Urbano+H-05.pdf/"
            "1d520327-42b7-708e-8958-59be50dd8427?t=1552033986499",
            "H-13": f"{_HUESCA_BASE}/05+Calificacion+del+Suelo+Urbano+H-13.pdf/"
            "dd34684d-4346-a10e-c69c-72493272a0f1?t=1552034007875",
        },
        "notes": (
            "⚠ PLANO Nº 5 IS NOT THE WHOLE CITY. Normas zonales 1 and 2 are graphed "
            "on plano nº 12, not nº 5; NZ3 spans both. A pipeline reading only nº 5 "
            "returns 'unzoned' for the barrios — failure dressed as absence."
        ),
    },
    "valencia": {
        "city": "València",
        "ine": "46250",
        "catastro_dgc": "46900",
        "status": "UNTESTED — sheet index not located; NOT a finding of absence",
        "instrument": (
            "PGOU València (mayo 1991) — the «Plano C» series, to which arts. "
            "6.18.2 / 6.19.1 / 6.25.1 / 6.30.1 remit the buildable depth and the "
            "cornice height"
        ),
        "scale_denominator": None,
        "declared_crs": "EPSG:25830",
        "legend_panel": None,
        "legend_rows": [],
        "sheets": {},
        "notes": (
            "València is registered as a refusal jurisdiction for the SAME stated "
            "reason Huesca was — «graphed on the plano C sheets, which the city does "
            "not publish as data». That premise was measured FALSE for Huesca. Run "
            "this probe on plano C before inheriting the conclusion."
        ),
    },
    "zaragoza": {
        "city": "Zaragoza",
        "ine": "50297",
        "catastro_dgc": "50900",
        "status": "UNTESTED — tomo 11 not anatomised; NOT a finding of absence",
        "instrument": (
            "PGOU Zaragoza, texto refundido 2024 — tomo 11, calificación y "
            "regulación (≈242 MB)"
        ),
        "scale_denominator": None,
        "declared_crs": "EPSG:25830",
        "legend_panel": None,
        "legend_rows": [],
        "sheets": {},
        "notes": (
            "The A1 subgrado that blocks Zaragoza's envelope is presumed to be on "
            "this sheet. 'Presumed' is not 'measured' — anatomise it before relying "
            "on it either way."
        ),
    },
}
