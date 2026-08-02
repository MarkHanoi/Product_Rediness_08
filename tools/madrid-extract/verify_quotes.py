#!/usr/bin/env python3
"""§MADRID-QUOTE-CONCORDANCE — re-read EVERY `verbatim` string in extracted/*.json
against the Compendio 2025 PDF the records claim they came from.

⚠ THIS IS NOT AN L-449 SIGNATURE. Signing an ordinance transcription is a human
legal act. This is a MECHANICAL CONCORDANCE CHECK and establishes exactly two
things: a string IS present in the primary document (and on which page), or it is
NOT. A present quote is still an unverified READING of the law; an absent one is a
hard defect.

METHOD. The Compendio prints a running header, a footer and numbered amendment
footnotes that interleave INSIDE sentences and across page breaks. A naive
page-local `in` test therefore reports false defects for any quote that crosses a
page boundary. So the document is flattened ONCE into a header/footnote-stripped
character stream with a char→page map, the quote is located in that stream, and
the verdict is the RELATION between where it actually is and where the record says
it is.

Verdicts (closed set — an unclassifiable case FAILS, it never defaults):
  ON-CLAIMED-PAGE    the quote starts on the page the record names.
  SPANS-FROM-CLAIMED starts on the claimed page, runs onto the next.
  ADJACENT-PAGE      starts one page either side of the claim (page-break drift).
  ELSEWHERE          present, but >1 page from the claim → the citation is wrong.
  TABLE-RECONSTRUCTION  a pipe-delimited row SYNTHESISED from a PDF table. Not a
                     quote; calling it `verbatim` is a provenance mislabel. Its
                     cells are checked individually.
  NOT-FOUND          absent verbatim. The longest matching prefix and the point of
                     divergence are reported, so truncation/terminator
                     substitution is distinguishable from fabrication.
  NO-PAGE-CLAIMED    a quote with no page citation — uncheckable, its own finding.

Usage: python verify_madrid_quotes.py <compendio.pdf> <extracted-dir> [out.json]
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz

# Running header / footer / amendment-footnote lines. NOT part of the ordinance
# text; they are what breaks a quote that runs across a page break.
RUNNING = [
    re.compile(r"EDICI[ÓO]N\s+\d+\s+DE\s+\w+\s+DE\s+\d{4}", re.I),
    re.compile(r"COMPENDIO DE LAS NORMAS URBAN[ÍI]STICAS DEL (PLAN GENERAL|PGOUM-?97)", re.I),
    re.compile(r"Documento de car[áa]cter informativo\..{0,120}?BOCM", re.I | re.S),
    re.compile(r"[ÁA]REA DE GOBIERNO DE URBANISMO,? MEDIO AMBIENTE Y MOVILIDAD", re.I),
    re.compile(r"ACTUALIZADO A \d+ DE \w+ (DE )?\d{4}", re.I),
    re.compile(r"-\s*\d{1,4}\s*[–-]"),                       # "- 370 –" page footer
    # numbered amendment footnotes, e.g. "523 Artículo modificado por la MPG 00/343
    # (aprobación definitiva 08.11.2023 BOCM 27.11.2023)."
    re.compile(r"\d{1,4}\s+(Art[íi]culo|Apartado|Cap[íi]tulo|Secci[óo]n|Norma|Ep[íi]grafe|T[íi]tulo)"
               r"\s+(modificad|a[ñn]adid|suprimid|derogad|renumerad)\w*\s+por\s+la\s+MPG[^.]*\.", re.I),
]


def norm(s: str) -> str:
    """Whitespace-collapse + NFC. Deliberately NOT accent-stripping: an accent
    difference is a transcription difference and must surface, not be hidden."""
    s = unicodedata.normalize("NFC", s)
    s = s.replace("­", "")
    s = s.replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


def build_stream(doc):
    """→ (stream, starts) where starts[i] is the stream offset of page i+1."""
    parts, starts, off = [], [], 0
    for p in doc:
        t = p.get_text()
        for r in RUNNING:
            t = r.sub(" ", t)
        t = norm(t) + " "
        starts.append(off)
        parts.append(t)
        off += len(t)
    return "".join(parts), starts


def page_of(offset, starts):
    lo, hi = 0, len(starts) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if starts[mid] <= offset:
            lo = mid
        else:
            hi = mid - 1
    return lo + 1


def walk(node, path, out):
    if isinstance(node, dict):
        if isinstance(node.get("verbatim"), str) and node["verbatim"].strip():
            out.append((path, node))
        for k, v in node.items():
            walk(v, f"{path}.{k}", out)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk(v, f"{path}[{i}]", out)


def main():
    pdf_path, ex_dir = sys.argv[1], Path(sys.argv[2])
    out_path = sys.argv[3] if len(sys.argv) > 3 else None
    doc = fitz.open(pdf_path)
    pagetext = [norm(p.get_text()) for p in doc]
    stream, starts = build_stream(doc)
    npages = len(pagetext)

    results = []
    for f in sorted(ex_dir.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        found = []
        walk(data, f.name, found)
        for path, node in found:
            v = norm(node["verbatim"]).lstrip("….").strip()
            page = node.get("pdfPage")
            if not isinstance(page, int):
                src = node.get("source")
                if isinstance(src, dict):
                    page = src.get("pdfPage")
            e = {
                "file": f.name, "path": path,
                "articulo": node.get("articulo") or (node.get("source") or {}).get("articulo"),
                "claimedPage": page if isinstance(page, int) else None,
                "chars": len(v),
            }
            if not isinstance(page, int) or not (1 <= page <= npages):
                e["verdict"] = "NO-PAGE-CLAIMED"
                e["quoteHead"] = v[:120]
                results.append(e)
                continue

            # ⚠ ALL occurrences, not the first. Ordinance prose repeats verbatim
            # across chapters ("Su uso cualificado es el residencial."; the grado
            # edificabilidad sentences are identical in Arts. 8.7.9 and 8.8.9), so a
            # first-match search reports a WRONG-PAGE defect for a quote that is on
            # the claimed page — a false positive that would have been published as
            # a cross-zone mis-citation. Nearest occurrence to the claim wins.
            occ, at = [], stream.find(v)
            while at >= 0:
                occ.append(at)
                at = stream.find(v, at + 1)
            if occ:
                spans = [(page_of(o, starts), page_of(o + len(v) - 1, starts)) for o in occ]
                start, end = min(spans, key=lambda s: abs(s[0] - page))
                e["actualStartPage"], e["actualEndPage"] = start, end
                e["occurrences"] = len(occ)
                if start == page and end == page:
                    e["verdict"] = "ON-CLAIMED-PAGE"
                elif start == page:
                    e["verdict"] = "SPANS-FROM-CLAIMED"
                elif abs(start - page) <= 1:
                    e["verdict"] = "ADJACENT-PAGE"
                else:
                    e["verdict"] = "ELSEWHERE"
                    e["allStartPages"] = sorted({s[0] for s in spans})[:8]
                    e["quoteHead"] = v[:160]
                results.append(e)
                continue

            if " | " in v:
                cells = [c.strip() for c in v.split("|") if c.strip()]
                hit = sum(1 for c in cells if c in pagetext[page - 1])
                e["verdict"] = "TABLE-RECONSTRUCTION"
                e["cells"], e["cellsOnClaimedPage"] = len(cells), hit
                e["quoteHead"] = v[:120]
                results.append(e)
                continue

            lo, hi, best = 0, len(v), 0
            while lo <= hi:
                mid = (lo + hi) // 2
                if v[:mid] and v[:mid] in stream:
                    best, lo = mid, mid + 1
                else:
                    hi = mid - 1
            e["verdict"] = "NOT-FOUND"
            e["longestPrefixInDocument"] = best
            e["matchedTail"] = v[max(0, best - 50):best]
            e["recordSaysNext"] = v[best:best + 60]
            if best:
                at = stream.find(v[:best])
                e["prefixStartsOnPage"] = page_of(at, starts) if at >= 0 else None
                e["documentSaysNext"] = stream[at + best:at + best + 60] if at >= 0 else None
            results.append(e)

    tally = {}
    for r in results:
        tally[r["verdict"]] = tally.get(r["verdict"], 0) + 1
    summary = {
        "pdf": Path(pdf_path).name, "pdfPages": npages,
        "pdfTitleMeta": doc.metadata.get("title"),
        "quotesChecked": len(results), "tally": tally,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print("\n--- ELSEWHERE / NOT-FOUND (distinct) ---")
    seen = {}
    for r in results:
        if r["verdict"] in ("NOT-FOUND", "ELSEWHERE"):
            k = (r.get("quoteHead", r.get("matchedTail", ""))[:70], r["claimedPage"])
            seen.setdefault(k, [0, r])
            seen[k][0] += 1
    for k, (n, r) in sorted(seen.items(), key=lambda x: -x[1][0]):
        print(f"\n×{n}", json.dumps(r, ensure_ascii=False))
    if out_path:
        Path(out_path).write_text(
            json.dumps({"summary": summary, "results": results}, indent=2, ensure_ascii=False),
            encoding="utf-8")


if __name__ == "__main__":
    main()
