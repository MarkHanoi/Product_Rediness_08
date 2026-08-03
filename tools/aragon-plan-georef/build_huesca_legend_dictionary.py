#!/usr/bin/env python3
"""
build_huesca_legend_dictionary.py

Turns the decoded Normas Urbanisticas text (produced by
probe_huesca_legend_normative_text.py) into a SYMBOL -> MEANING dictionary for
Huesca plano n.5, quoting each entry VERBATIM with its article id.

Every entry is EXTRACTED, not paraphrased: the script slices the article body
out of the decoded text and stores it as-is. Where the Normas do not define a
symbol, the entry is emitted with meaning=UNKNOWN and a stated reason -- it is
never back-filled with a plausible number.
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
SRC = os.path.join(OUT, "huesca_normas_pgou.txt")

# article id -> (printed page per the volume's own TOC, what it defines)
ENTRIES = [
    ("1.1.6", 2, "alcance normativo / prelacion de documentos"),
    ("2.1.11", 20, "solicitud de alineacion y rasante"),
    ("2.1.12", 20, "senalamiento de alineacion"),
    ("3.1.3", 34, "que plano lleva la delimitacion de zonas y usos"),
    ("3.2.2", 36, "delimitacion del suelo urbano y codigos API/APE/APR"),
    ("6.2.2", 184, "linderos: frontal / laterales / testero"),
    ("6.2.3", 184, "ALINEACIONES: actuales vs oficiales-o-exteriores"),
    ("6.2.4", 184, "parcela edificable"),
    ("6.3.3", 185, "RASANTES actuales / oficiales + cota de origen"),
    ("6.3.4", 185, "retranqueo y separacion a linderos"),
    ("6.3.6", 186, "ALINEACION INTERIOR O PRIVADA"),
    ("6.3.7", 186, "FONDO EDIFICABLE"),
    ("6.3.8", 186, "area de movimiento"),
    ("6.3.9", 186, "linea de edificacion / superficie ocupada"),
    ("6.4.5", 189, "ALTURA: definiciones + tabla plantas<->cornisa"),
    ("8.3.1", 278, "NZ3 ambito: plano 5 y 12, codigo 3, cinco grados"),
    ("8.3.10", 281, "NZ3 posicion: alineaciones del plano 5"),
    ("8.3.11", 282, "NZ3 altura"),
    ("8.4.1", 284, "NZ4 ambito: plano 5, codigo 4, dos grados"),
    ("8.4.7", 286, "NZ4 edificabilidad"),
    ("8.4.8", 286, "NZ4 OCUPACION Y FONDO EDIFICABLE"),
    ("8.4.9", 286, "NZ4 posicion: alineaciones exteriores e interiores"),
    ("8.4.10", 287, "NZ4 ALTURA -- grafiada en el plano 5"),
    ("8.5.1", 289, "NZ5 ambito: plano 5, codigo 5"),
    ("8.5.6", 291, "NZ5 edificabilidad -- altura indicada graficamente"),
    ("8.5.7", 291, "NZ5 ocupacion -- linea de edificacion grafiada"),
    ("8.5.8", 291, "NZ5 posicion"),
    ("8.5.9", 292, "NZ5 altura"),
    ("8.6.1", 294, "NZ6 ambito: plano 5, codigo 6"),
    ("8.7.1", 296, "NZ7 ambito: plano 5, codigo 7, cinco grados"),
]

UNKNOWN = [
    {"term": "leyenda / cuadro de simbolos del plano n.5",
     "meaning": "UNKNOWN",
     "why": "The word 'leyenda' occurs ZERO times in the Normas Urbanisticas "
            "(measured, both extractors). The sheet's own legend box is drawn "
            "as outlined vector curves (0 painted-text ops -- see "
            "tools/aragon-municipal-probe/out/huesca_plano5_anatomy.json), so "
            "its wording cannot be extracted as characters from the PDF. The "
            "verbatim legend text is NOT RECOVERED."},
    {"term": "line-style -> symbol mapping (which dash/weight draws the "
             "alineacion oficial vs the linea de fondo edificable)",
     "meaning": "UNKNOWN",
     "why": "The Normas never describe the graphic CONVENTION, only the "
            "planning meaning. The sheet is greyscale-only (measured: all "
            "paint colours r==g==b, huesca_plano5_line_classes.json), so zone "
            "identity is NOT colour-coded. No text in the Normas assigns a "
            "dash pattern or line weight to any term."},
    {"term": "'alineacion de fachada'",
     "meaning": "UNKNOWN -- the phrase does not occur",
     "why": "0 hits for 'alineacion de fachada' in the Normas. Huesca's terms "
            "are 'alineacion oficial o exterior' (art. 6.2.3), 'alineacion "
            "interior o privada' (art. 6.3.6) and 'linea de edificacion' "
            "(art. 6.3.9). Do not treat them as synonyms."},
    {"term": "'NZ1'..'NZ5' as a literal label on the sheet",
     "meaning": "UNKNOWN as a graphic label",
     "why": "0 hits for the token 'NZ<digit>' anywhere in the Normas. The "
            "Normas say the sheet carries the BARE CODE ('con el codigo 4'), "
            "and grade as a second bare code ('los suelos senalados con los "
            "codigos 1 y 2'). 'NZ4' is our shorthand, not the plan's."},
    {"term": "georeference of the plano n.5 sheets",
     "meaning": "UNKNOWN",
     "why": "measured in huesca_plano5_geometry.json -- no georeference of any "
            "kind in the sheet PDFs; only page coordinates."},
]


def slice_article(txt: str, art: str) -> str:
    pat = re.compile(r"^\s*Art[ií]culo\s+" + re.escape(art) + r"[.\s]", re.M)
    hits = [m.start() for m in pat.finditer(txt)
            if not re.search(r"\.{4,}\s*\d{1,4}\s*$",
                             txt[m.start(): txt.find("\n", m.start())])]
    if not hits:
        return ""
    s = hits[-1]
    nxt = re.compile(r"^\s*Art[ií]culo\s+\d", re.M)
    m = nxt.search(txt, s + 20)
    e = m.start() if m else min(len(txt), s + 8000)
    return txt[s:e].strip()


def main() -> None:
    txt = open(SRC, encoding="utf-8").read()
    doc = {
        "source_document": "Revision y Adaptacion del Plan General de "
            "Ordenacion Urbana de Huesca -- TEXTO REFUNDIDO -- NORMAS "
            "URBANISTICAS, TOMO I (tomo 2 de 8). Aprobado definitivamente por "
            "acuerdo del Consejo de Ordenacion del Territorio de Aragon de "
            "9 de mayo de 2003.",
        "source_url": "https://www.huesca.es/documents/33451/85658/"
            "normas_urbanisticas_pgou08.pdf/"
            "6846c65e-e78d-4a0b-4433-904840d671c8?t=1542714308255",
        "plano_5_official_title": "plano n. 5 — “Clasificación, "
            "calificación y regulación del suelo y la edificación "
            "en suelo urbano. Red viaria, alineaciones y rasantes”, "
            "E: 1/1.000",
        "sibling_sheet_for_the_barrios": "plano n. 12 — “Barrios. "
            "Clasificación, calificación y regulación del suelo "
            "y la edificación en suelo urbano. Red viaria, alineaciones y "
            "rasantes” -- NORMA ZONAL 1 and 2 live HERE, not on plano 5.",
        "encoding": {
            "pdftotext_default_output": "cp1252 (strict UTF-8 RAISES at byte 49; "
                "971,642 bytes; 0 C1-control chars under cp1252)",
            "pdftotext_with_-enc_UTF-8": "utf-8 (valid strict)",
            "pymupdf": "returns str; no byte decoding involved",
            "agreement": "the two extractors produce IDENTICAL lexeme counts",
        },
        "articles": {},
        "unknown": UNKNOWN,
    }
    for art, page, what in ENTRIES:
        body = slice_article(txt, art)
        doc["articles"][art] = {
            "printed_page": page,
            "defines": what,
            "found": bool(body),
            "verbatim": body,
        }
    p = os.path.join(OUT, "huesca_plano5_legend_dictionary.json")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
    sys.stdout.reconfigure(encoding="utf-8")
    miss = [a for a, v in doc["articles"].items() if not v["found"]]
    print("wrote", p, "| articles:", len(doc["articles"]), "| MISSING:", miss)


if __name__ == "__main__":
    main()
