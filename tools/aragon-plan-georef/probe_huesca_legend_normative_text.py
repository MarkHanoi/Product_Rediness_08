#!/usr/bin/env python3
"""
probe_huesca_legend_normative_text.py

GOAL: recover, VERBATIM, the normative definitions of every graphic element that
Huesca's "plano n. 5 -- Calificacion del Suelo Urbano" (1:1.000) carries:
alineacion oficial / linea de fondo edificable / rasante / zone-grado labels /
altura maxima-plantas, and any statement of WHICH SHEET IS NORMATIVE for WHICH
parameter.

WHY THE NORMAS AND NOT THE SHEET: a prior probe
(tools/aragon-municipal-probe/out/huesca_plano5_anatomy.json) already measured
every plano-5 sheet as OUTLINED_TEXT_VECTOR -- 0 painted-text operators. The
legend BOX on the sheet is drawn as curves. It cannot be read as characters.
So the legend's MEANING can only come from the Normas Urbanisticas text.

ENCODING DISCIPLINE (the trap this probe exists to avoid):
  * A previous run decoded these bytes as UTF-8 with errors='replace' and then
    counted lexemes -- every accented byte became U+FFFD and "altura maxima"
    scored ZERO. This probe TRIES strict codecs in order and RECORDS the winner.
    It NEVER counts text that was decoded lossily.
  * Two independent extractors are run (PyMuPDF, which yields real unicode, and
    pdftotext, whose byte output needs the codec trial). Their lexeme counts are
    reported SEPARATELY so a disagreement is visible instead of averaged away.

ARTICLE-ID DISCIPLINE:
  * Huesca numbers articles BARE -- "8.4.8." with no "Articulo"/"Art." prefix.
    The heading regex must not require the prefix.
  * The FIRST line-start occurrence of an id is the TABLE OF CONTENTS. The body
    is the LAST line-start occurrence. This probe takes the last.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")
os.makedirs(CACHE, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

DOCS = {
    # Huesca capital, PGOU Texto Refundido, Normas Urbanisticas (the volume that
    # carries Titulo 8 = the zone ordinances NZ1..NZ6 and Titulo 5 = the general
    # conditions of the edificacion where alineacion/rasante are DEFINED).
    "huesca_normas_pgou": "https://www.huesca.es/documents/33451/85658/"
        "normas_urbanisticas_pgou08.pdf/"
        "6846c65e-e78d-4a0b-4433-904840d671c8?t=1542714308255",
}

CODECS = ["utf-8", "cp1252", "latin-1"]


def fetch(name: str, url: str) -> dict:
    path = os.path.join(CACHE, name + ".pdf")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return {"file": path, "bytes": os.path.getsize(path), "source": "cache",
                "url": url, "http": None}
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/pdf,*/*"})
    with urllib.request.urlopen(req, timeout=120) as r:
        blob = r.read()
        code = r.status
    with open(path, "wb") as fh:
        fh.write(blob)
    return {"file": path, "bytes": len(blob), "source": "net", "url": url,
            "http": code}


def decode_trial(blob: bytes) -> tuple[str, str, dict]:
    """Try strict codecs in order. Record which won and why the others failed."""
    log = {}
    for c in CODECS:
        try:
            txt = blob.decode(c)          # STRICT -- no errors='replace'
        except UnicodeDecodeError as e:
            log[c] = f"UnicodeDecodeError at byte {e.start}: {e.reason}"
            continue
        # latin-1 never raises, so it is a fallback of last resort. cp1252 raises
        # only on the five undefined slots. A codec that "succeeds" but leaves
        # C1 control chars where accents belong is WRONG -- detect that.
        c1 = sum(1 for ch in txt if 0x80 <= ord(ch) <= 0x9F)
        log[c] = {"ok": True, "c1_control_chars": c1}
        if c1 > 20 and c != CODECS[-1]:
            log[c]["rejected"] = "high C1-control density => mojibake, not text"
            continue
        return c, txt, log
    return "latin-1", blob.decode("latin-1"), log


def extract_pdftotext(path: str) -> dict:
    try:
        raw = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", path, "-"],
                             capture_output=True, timeout=300).stdout
    except Exception as e:                                    # noqa: BLE001
        return {"ok": False, "why": repr(e)}
    codec, txt, log = decode_trial(raw)
    return {"ok": True, "codec_won": codec, "codec_trial": log,
            "chars": len(txt), "text": txt}


def extract_fitz(path: str) -> dict:
    try:
        import fitz
    except Exception as e:                                    # noqa: BLE001
        return {"ok": False, "why": repr(e)}
    doc = fitz.open(path)
    pages = [p.get_text("text") for p in doc]
    return {"ok": True, "codec_won": "n/a (PyMuPDF returns str, not bytes)",
            "pages": len(pages), "chars": sum(len(p) for p in pages),
            "text": "\n\f\n".join(pages), "page_texts": pages}


# ---------------------------------------------------------------- lexemes
LEX = {
    "alineacion_oficial":  r"alineaci[oó]n(?:es)?\s+oficial(?:es)?",
    "alineacion_exterior": r"alineaci[oó]n(?:es)?\s+exterior(?:es)?",
    "alineacion_fachada":  r"alineaci[oó]n(?:es)?\s+de\s+fachada",
    "alineacion_any":      r"alineaci[oó]n",
    "linea_fondo_edif":    r"l[ií]nea\s+de\s+fondo\s+edificable",
    "fondo_edificable":    r"fondo\s+edificable",
    "fondo_maximo":        r"fondo\s+m[aá]ximo",
    "rasante":             r"\brasante(?:s)?\b",
    "altura_maxima":       r"altura\s+m[aá]xima",
    "altura_reguladora":   r"altura\s+reguladora",
    "altura_cornisa":      r"altura\s+de\s+cornisa",
    "numero_plantas":      r"n[uú]mero\s+de\s+plantas",
    "plano_n5":            r"plano\s+n[.ºo°]?\s*5",
    "plano_any":           r"plano(?:s)?\s+n[.ºo°]",
    "grado":               r"\bgrado\s*\d",
    "zona_NZ":             r"\bNZ\s*-?\s*\d",
    "leyenda":             r"\bleyenda\b",
    "grafiad":             r"grafiad[oa]s?",
    "escala_1_1000":       r"1\s*[:/]\s*1\.?000",
}


def count(txt: str) -> dict:
    return {k: len(re.findall(v, txt, re.I)) for k, v in LEX.items()}


# ---------------------------------------------------------------- articles
# MEASURED, not assumed: in THIS volume (Texto Refundido, Normas Urbanisticas)
# the headings DO carry "Articulo ". The prefix is therefore OPTIONAL, never
# REQUIRED and never FORBIDDEN -- a regex that demands the prefix scores zero on
# the bare-numbered municipalities, and one that forbids it scores zero here.
ART_HEAD = re.compile(
    r"^\s*(?:Art[ií]culo|Art\.)?\s*(\d{1,2}(?:\.\d{1,3}){1,3})\.?[ \t]+(?=\S)",
    re.M | re.I)
# A TOC line is a heading followed by dot-leaders + a page number. Excluded so
# that "the last occurrence" logic is not needed as a crutch -- but it is kept
# anyway, because a cross-reference inside a body can also look like a heading.
TOC_LINE = re.compile(r"\.{4,}\s*\d{1,4}\s*$")


def article_index(txt: str) -> dict[str, list[int]]:
    idx: dict[str, list[int]] = {}
    for m in ART_HEAD.finditer(txt):
        line_end = txt.find("\n", m.start())
        line = txt[m.start(): line_end if line_end != -1 else len(txt)]
        if TOC_LINE.search(line):
            continue                     # table-of-contents entry, not the body
        idx.setdefault(m.group(1), []).append(m.start())
    return idx


def article_body(txt: str, idx: dict, art: str, max_chars: int = 6000) -> dict:
    if art not in idx:
        return {"found": False, "occurrences": 0}
    starts = idx[art]
    s = starts[-1]                       # LAST -- the first is the TOC
    # end = next article heading strictly after s
    ends = [p for a, ps in idx.items() for p in ps if p > s]
    e = min(ends) if ends else min(len(txt), s + max_chars)
    body = txt[s:e]
    return {"found": True, "occurrences": len(starts),
            "toc_occurrence_offset": starts[0], "body_offset": s,
            "chars": len(body), "text": body[:max_chars]}


def windows(txt: str, pattern: str, before=400, after=900, limit=40) -> list[str]:
    out = []
    for m in re.finditer(pattern, txt, re.I):
        out.append(txt[max(0, m.start() - before): m.end() + after])
        if len(out) >= limit:
            break
    return out


def page_of(page_texts: list[str], offset_text: str) -> int | None:
    key = re.sub(r"\s+", " ", offset_text[:60]).strip()
    for i, p in enumerate(page_texts):
        if key and key in re.sub(r"\s+", " ", p):
            return i + 1
    return None


def main() -> None:
    report: dict = {"probe": "huesca-plano5-legend-normative-text",
                    "sheet_is_unreadable_by_text": (
                        "measured previously: tools/aragon-municipal-probe/out/"
                        "huesca_plano5_anatomy.json -- every plano-5 sheet is "
                        "OUTLINED_TEXT_VECTOR, 0 painted-text ops. The legend box "
                        "on the sheet cannot be extracted as characters."),
                    "docs": {}}

    for name, url in DOCS.items():
        d = fetch(name, url)
        pt = extract_pdftotext(d["file"])
        fz = extract_fitz(d["file"])
        entry = {"url": url, "file": d["file"], "bytes": d["bytes"],
                 "source": d["source"], "http": d["http"],
                 "extract_pdftotext": {k: v for k, v in pt.items()
                                       if k != "text"},
                 "extract_fitz": {k: v for k, v in fz.items()
                                  if k not in ("text", "page_texts")}}

        # counts from BOTH extractors, never merged
        if pt.get("ok"):
            entry["lexemes_pdftotext"] = count(pt["text"])
        if fz.get("ok"):
            entry["lexemes_fitz"] = count(fz["text"])

        txt = fz["text"] if fz.get("ok") else pt["text"]
        entry["text_used_for_articles"] = "fitz" if fz.get("ok") else "pdftotext"
        pages = fz.get("page_texts", []) if fz.get("ok") else []

        idx = article_index(txt)
        entry["article_ids_seen"] = len(idx)

        targets = ["8.3.10", "8.4.8", "8.5.8"]
        # plus: hunt every article whose HEADING mentions the legend terms
        head_hits = {}
        for m in ART_HEAD.finditer(txt):
            head = txt[m.end(): m.end() + 120].split("\n")[0]
            if re.search(r"alineaci|rasante|fondo\s+edificable|altura|plantas|"
                         r"posici[oó]n\s+de\s+la\s+edificaci", head, re.I):
                head_hits.setdefault(m.group(1), []).append(head.strip())
        entry["headings_matching_legend_terms"] = head_hits
        targets += list(head_hits.keys())

        arts = {}
        for a in dict.fromkeys(targets):
            b = article_body(txt, idx, a)
            if b.get("found"):
                b["page_guess"] = page_of(pages, b["text"]) if pages else None
            arts[a] = b
        entry["articles"] = arts

        entry["windows"] = {
            "plano_n5": windows(txt, r"plano\s+n[.ºo°]?\s*5", 300, 700, 40),
            "rasante_defn": windows(txt, r"\brasante", 350, 650, 25),
            "linea_fondo": windows(txt, r"l[ií]nea\s+de\s+fondo", 350, 650, 25),
            "alineacion_oficial": windows(txt,
                                          r"alineaci[oó]n(?:es)?\s+oficial", 350, 650, 30),
            "leyenda": windows(txt, r"\bleyenda\b", 350, 900, 15),
            "grafiado": windows(txt, r"grafiad", 300, 500, 25),
        }
        report["docs"][name] = entry

        # dump the whole decoded text next to the json for grepping
        with open(os.path.join(OUT, name + ".txt"), "w", encoding="utf-8") as fh:
            fh.write(txt)

    p = os.path.join(OUT, "huesca_legend_normative_text.json")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    sys.stdout.reconfigure(encoding="utf-8")
    print("wrote", p)
    for n, e in report["docs"].items():
        print(n, e["bytes"], "bytes;",
              "pdftotext codec =", e["extract_pdftotext"].get("codec_won"),
              "; fitz chars =", e["extract_fitz"].get("chars"))
        print("  lexemes(fitz):", e.get("lexemes_fitz"))
        print("  lexemes(pdftotext):", e.get("lexemes_pdftotext"))


if __name__ == "__main__":
    main()
