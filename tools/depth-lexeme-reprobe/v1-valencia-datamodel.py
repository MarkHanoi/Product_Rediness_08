#!/usr/bin/env python3
"""V1 - VALENCIA: re-extract the ICV published data-model PDF with a real PDF engine
and dump the FULL field union, then look for depth-SHAPED entries rather than
grepping a guessed lexeme.

The prior probe read a 5,731-byte mojibake'd .txt of this same PDF. If that extraction
was partial or the encoding mangled the accented lexemes ("profundidad", "fondaria"),
a lexeme grep over it would return nothing while the parameter sits in the table.

Writes out/v1-valencia-datamodel.txt (full text) + out/v1-valencia-datamodel.json
"""
import json
import os
import re
import sys
import unicodedata

import fitz  # pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

PDF = sys.argv[1] if len(sys.argv) > 1 else \
    r"C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/valencia-grammar-probe/_m3_datamodel.pdf"
PRIOR_TXT = r"C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/valencia-grammar-probe/_m3_datamodel.txt"


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


doc = fitz.open(PDF)
pages = []
for p in doc:
    pages.append(p.get_text("text"))
full = "\n".join(pages)

with open(os.path.join(OUT, "v1-valencia-datamodel.txt"), "w", encoding="utf-8") as f:
    f.write(full)

# --- readability class control -------------------------------------------------
# A character count is not a text layer. Count real word characters, and count
# drawing ops, so an outlined-text vector PDF is distinguishable from a text PDF.
words = re.findall(r"[A-Za-zÁÉÍÓÚÑÜÀÈÌÒÙÇáéíóúñüàèìòùç]{3,}", full)
draw_ops = sum(len(p.get_drawings()) for p in doc)
images = sum(len(p.get_images(full=True)) for p in doc)

prior_chars = None
if os.path.exists(PRIOR_TXT):
    prior_chars = len(open(PRIOR_TXT, "rb").read())

# --- DERIVE the vocabulary: dump the full term union, THEN filter --------------
# Field names in this table are ALL-CAPS tokens in the NOMBRE column.
field_tokens = sorted(set(re.findall(r"\b[A-Z][A-Z0-9_]{2,}\b", full)))

# Depth-shaped lexemes, incl. accent-stripped so encoding damage cannot hide them.
flat = strip_accents(full).lower()
DEPTH_TERMS = [
    "fondo edificable", "fondo", "profundidad edificable", "profundidad maxima",
    "profundidad de la edificacion", "profundidad", "prof. edif", "prof edif",
    "fondaria edificable", "fondaria maxima", "fondaria", "profunditat edificable",
    "profunditat", "profundidade",
]
HEIGHT_TERMS = [
    "altura reguladora", "altura maxima", "altura de cornisa", "altura total",
    "alcada reguladora", "alcaria", "numero de plantas", "num. plantas", "plantas",
    "altura",
]
SETBACK_TERMS = [
    "retranqueo", "reculada", "separacion a linderos", "separacio a llindars",
    "separacion", "recuo", "retranqueig", "linderos",
]

def hits(terms):
    out = {}
    for t in terms:
        n = flat.count(t)
        if n:
            # capture context
            ctxs = []
            for m in re.finditer(re.escape(t), flat):
                a, b = max(0, m.start() - 120), min(len(flat), m.end() + 160)
                ctxs.append(re.sub(r"\s+", " ", flat[a:b]).strip())
            out[t] = {"count": n, "contexts": ctxs[:6]}
    return out

res = {
    "pdf": PDF,
    "pages": doc.page_count,
    "readability": {
        "extractedChars": len(full),
        "wordCharTokens": len(words),
        "drawingOps": draw_ops,
        "embeddedImages": images,
        "priorProbeTxtBytes": prior_chars,
        "priorProbeCapturedFraction": round(prior_chars / len(full), 4) if prior_chars and full else None,
        "class": ("TEXT" if len(words) > 200 else
                  ("OUTLINED-VECTOR" if draw_ops > 5000 and len(words) < 200 else
                   ("SCAN" if images else "EMPTY"))),
    },
    "fieldTokenUnion": field_tokens,
    "depth": hits(DEPTH_TERMS),
    "height": hits(HEIGHT_TERMS),
    "setback": hits(SETBACK_TERMS),
}

with open(os.path.join(OUT, "v1-valencia-datamodel.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=2)

print("VALENCIA ICV data-model PDF re-extraction")
print(json.dumps(res["readability"], indent=2))
print(f"\nfield token union ({len(field_tokens)}):")
print("  " + " ".join(field_tokens))
for fam in ("depth", "height", "setback"):
    print(f"\n--- {fam.upper()} ---")
    if not res[fam]:
        print("  (no term hits)")
    for t, v in res[fam].items():
        print(f"  {t!r} x{v['count']}")
        for c in v["contexts"][:3]:
            print(f"      … {c[:230]}")
