#!/usr/bin/env python3
"""
probe_lexeme_corpus.py -- THE DEPTH LEXEME, RE-TESTED ON ARAGON.

Malaga NEVER uses `fondo`. It defines `profundidad edificable`. Measured across
Valencia, a fondo-shaped search MISSES 27.6% of documents. Huesca's *fondo
edificable* was found -- but whether Aragon's OTHER municipalities use
`profundidad` was never tested. This tests it.

It also measures the sibling lexemes that are NOT synonyms:
  * setback  -- `separacion a linderos` / `retranqueo`
  * height   -- `altura de cornisa` is a DIFFERENT DATUM from `altura reguladora`
                and from `altura maxima`. Counted separately, never merged.

And it answers the NZ3 / NZ5 question for Huesca: are arts. 8.3.10 (Vivienda
Unifamiliar) and 8.5.8 (Bloque Abierto) SETBACK grammars that need no plan sheet?

TRAP GUARDS:
  * label_hits and hits_with_number_nearby are reported SEPARATELY. Aragon's own
    ficha probe reported `densidad` "present with numbers on 100%" -- every hit was
    "LAS con densidad 0,5 ptos/m2" = LIDAR POINT DENSITY. Both carry numbers. Both
    were fabrications.
  * A CHARACTER COUNT IS NOT A TEXT LAYER. Documents are anatomised for painted
    text before any lexeme count is believed; a zero-text vector PDF is reported
    as UNREADABLE-BY-TEXT, never as "the word is absent".
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

CORPUS = {
    # Huesca capital -- PGOU 2008 Texto Refundido, Normas Urbanisticas.
    # The document Art. 8.4.8 (NZ4 Manzana Cerrada) was already read from.
    "huesca_normas_pgou08": "https://www.huesca.es/documents/33451/85658/"
        "normas_urbanisticas_pgou08.pdf/6846c65e-e78d-4a0b-4433-904840d671c8?t=1542714308255",
    # Zaragoza -- a per-ambito ficha, surfaced from the IDEZar WFS field
    # PLA_1_Instrumentos_ambito.enlace_documentos. NOTE: this is a MUNICIPAL ficha,
    # a completely different artefact from IDEAragon's fichaDescarga_<INE>.html
    # geodata catalogue that the regional probe proved carries zero buildability.
    "zaragoza_ficha_AI_G-44-01": "https://www.zaragoza.es/pgou/fichas/AI/G-44-01.pdf",
    "zaragoza_ficha_AI_G-91-01": "https://www.zaragoza.es/pgou/fichas/AI/G-91-01.pdf",
    # ⭐ THE SECOND MUNICIPALITY -- this is what makes the lexeme test a TEST.
    # Huesca uses `fondo`. Whether Aragon's OTHER municipalities do was never
    # checked. Zaragoza PGOU Texto Refundido 2024, Titulo Cuarto = the zone
    # ordinances for suelo urbano CONSOLIDADO, i.e. exactly where a buildable
    # depth would live if it exists.
    "zaragoza_normas_titulo4_TR2024":
        "https://www.zaragoza.es/contenidos/urbanismo/pgouz/TR2024/"
        "Titulo_4_Normas_refundido_2026_con.pdf",
    "zaragoza_normas_titulo2_TR2024":
        "https://www.zaragoza.es/contenidos/urbanismo/pgouz/TR2024/"
        "Titulo_2_Normas_refundido_2026_con.pdf",
}

# ---- lexemes. NOT synonyms of each other. Never summed into one "depth" score.
LEX = {
    "depth_fondo": [r"fondo\s+edificable", r"fondo\s+m[aá]ximo", r"l[ií]nea\s+de\s+fondo",
                    r"\bfondo\b"],
    "depth_profundidad": [r"profundidad\s+edificable", r"profundidad\s+m[aá]xima",
                          r"\bprofundidad\b"],
    "setback_retranqueo": [r"retranqueo"],
    "setback_linderos": [r"separaci[oó]n\s+a\s+linderos", r"\blinderos?\b"],
    "height_reguladora": [r"altura\s+reguladora"],
    "height_cornisa": [r"altura\s+de\s+cornisa", r"\bcornisa\b"],
    "height_maxima": [r"altura\s+m[aá]xima"],
    "height_plantas": [r"n[uú]mero\s+de\s+plantas", r"\bplantas\b"],
    "alignment": [r"alineaci[oó]n\s+oficial", r"\balineaci[oó]n"],
    "far": [r"edificabilidad", r"aprovechamiento"],
    "coverage": [r"ocupaci[oó]n\s+m[aá]xima", r"ocupaci[oó]n"],
    "plan_sheet_reference": [r"plano\s+n[.ºo°]?\s*\d+", r"definid[oa]\s+gr[aá]ficamente",
                             r"grafiad[oa]"],
}

NUM_NEAR = re.compile(r"\d")


def fetch(url: str, dest: str) -> tuple[int, int]:
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return 200, os.path.getsize(dest)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
            code = r.getcode()
    except Exception as e:  # noqa: BLE001
        print(f"    fetch FAILED: {type(e).__name__}: {e}")
        return -1, 0
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "wb").write(body)
    return code, len(body)


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


def anatomy(path: str) -> dict:
    raw = open(path, "rb").read()
    c = inflate(raw)
    painted = len(re.findall(rb"[\)\]>]\s*(?:Tj|TJ)\b", c)) + \
        len(re.findall(rb"[\)>]\s*(?:'|\")", c))
    paths = len(re.findall(rb"(?:^|\s)(?:m|l|c|re)(?=\s)", c))
    imgs = len(re.findall(rb"/Subtype\s*/Image", raw))
    return {"painted_text_ops": painted, "vector_path_ops": paths,
            "image_xobjects": imgs, "objstm": len(re.findall(rb"/Type\s*/ObjStm", raw)),
            "readable_by_text": painted > 0}


def _decode(b: bytes) -> tuple[str, str]:
    """⛔ ENCODING IS A LEXEME TRAP -- measured on this very corpus.

    Reading Huesca's pdftotext output as UTF-8 with errors='replace' scored
    `altura maxima` at ZERO while the string occurs 35 times: every accented
    byte became U+FFFD and the regex `m[aá]xima` could never match. That is a
    LEXEME MISS CAUSED BY ENCODING, not by vocabulary -- and it fails SILENTLY
    in the pessimistic direction. Decode by trial, and record which won.
    """
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            s = b.decode(enc)
            if "�" not in s:
                return s, enc
        except UnicodeDecodeError:
            continue
    return b.decode("latin-1", "replace"), "latin-1-forced"


def extract_text(path: str) -> tuple[str, str]:
    """pdftotext -layout if available; else the inflated-stream fallback."""
    txt_path = path + ".txt"
    try:
        subprocess.run(["pdftotext", "-layout", path, txt_path],
                       check=True, capture_output=True, timeout=300)
        if os.path.exists(txt_path):
            s, enc = _decode(open(txt_path, "rb").read())
            return s, f"pdftotext[{enc}]"
    except Exception:  # noqa: BLE001
        pass
    # Fallback: pull literal strings out of the content stream. Lossy, but it
    # recovers enough for a LEXEME PRESENCE test. Never used for numbers.
    c = inflate(open(path, "rb").read())
    parts = re.findall(rb"\(((?:\\.|[^\\()])*)\)\s*(?:Tj|TJ|'|\")", c)
    s = b" ".join(parts).decode("latin-1", "replace")
    return s, "stream-strings-FALLBACK"


def count(text: str) -> dict:
    low = text.lower()
    res = {}
    for cat, pats in LEX.items():
        label_hits = 0
        with_number = 0
        samples = []
        for p in pats:
            for m in re.finditer(p, low):
                label_hits += 1
                window = low[m.end():m.end() + 90]
                if NUM_NEAR.search(window):
                    with_number += 1
                if len(samples) < 4:
                    ctx = text[max(0, m.start() - 60):m.end() + 110]
                    samples.append(" ".join(ctx.split()))
        res[cat] = {"label_hits": label_hits,
                    "hits_with_number_nearby": with_number,
                    "samples": samples}
    return res


# ⛔ Huesca's PGOU numbers its articles BARE -- "8.4.8. Condiciones de..." with no
# "Articulo"/"Art." prefix anywhere in the document. An `art\.?\s*N.N.N` regex
# scores ZERO on a document that contains all three target articles. Match the
# bare tri-level id and require it to sit at a line start to avoid cross-refs.
ART_RE = re.compile(r"(?m)^\s*(\d+\.\d+\.\d+)\b")
ART_ANY_RE = re.compile(r"\b(\d+\.\d+\.\d+)\b")


def articles(text: str) -> dict:
    heads = ART_RE.findall(text)
    anywhere = ART_ANY_RE.findall(text)
    want = ["8.3.10", "8.4.8", "8.5.8"]
    return {
        "distinct_article_headings": len(set(heads)),
        "distinct_ids_anywhere": len(set(anywhere)),
        "targeted_as_heading": {w: heads.count(w) for w in want},
        "targeted_anywhere": {w: anywhere.count(w) for w in want},
    }


def section(text: str, art_id: str, span: int = 3000) -> str:
    """Return the ARTICLE BODY, not its index entry.

    ⚠ The first occurrence of "8.4.8" in a PGOU is almost always the TABLE OF
    CONTENTS. Take line-start occurrences and pick the LAST one -- the index
    precedes the body in every Huesca chapter checked.
    """
    hits = [m.start() for m in
            re.finditer(r"(?m)^\s*" + re.escape(art_id) + r"\b", text)]
    if not hits:
        hits = [m.start() for m in re.finditer(re.escape(art_id), text)]
    if not hits:
        return ""
    return " ".join(text[hits[-1]:hits[-1] + span].split())


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    docs = {}
    for key, url in CORPUS.items():
        print(f"== {key}")
        dest = os.path.join(CACHE, key + ".pdf")
        code, size = fetch(url, dest)
        row: dict = {"url": url, "http": code, "bytes": size}
        if code == 200 and size:
            an = anatomy(dest)
            row["anatomy"] = an
            if not an["readable_by_text"]:
                row["lexemes"] = "UNREADABLE_BY_TEXT -- zero painted-text operators. " \
                                 "NO TEXT LAYER != NO DATA. Absence of a lexeme here " \
                                 "is NOT evidence the word is absent."
            else:
                text, how = extract_text(dest)
                row["extractor"] = how
                row["chars"] = len(text)
                row["lexemes"] = count(text)
                row["articles"] = articles(text)
                if "huesca" in key:
                    row["NZ3_art_8_3_10"] = section(text, "8.3.10")
                    row["NZ4_art_8_4_8"] = section(text, "8.4.8")
                    row["NZ5_art_8_5_8"] = section(text, "8.5.8")
            print(f"    http={code} bytes={size:,} painted_text={an['painted_text_ops']} "
                  f"paths={an['vector_path_ops']} readable={an['readable_by_text']}")
        docs[key] = row
        time.sleep(0.3)

    payload = {"probe": "aragon-lexeme-and-grammar", "when": time.strftime("%Y-%m-%d"),
               "docs": docs}
    with open(os.path.join(OUT, "aragon_lexeme_corpus.json"), "w",
              encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print("\nwrote out/aragon_lexeme_corpus.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
