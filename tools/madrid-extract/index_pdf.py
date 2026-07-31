#!/usr/bin/env python3
"""Index the PGOUM-97 Compendio 2025 PDF by article number pattern.

Usage:
  python index_pdf.py structure        # chapter -> page map from article numbers
  python index_pdf.py page N [M]       # dump text of page N (..M)
  python index_pdf.py grep PATTERN     # regex over all pages, page-numbered
  python index_pdf.py arts PREFIX      # first page of each article matching prefix (e.g. 8.4.)
  python index_pdf.py tables N [M]     # detect tables on page N..M
"""
import re
import sys

import fitz

PDF = (
    "C:/Users/LENOVO/AppData/Local/Temp/claude/"
    "c--Users-LENOVO-OneDrive-Desktop-PRYZM-Product-Rediness-08/"
    "85d1d1c6-e522-4ce0-88a6-0945260ed2a4/scratchpad/compendio.pdf"
)

ART_RE = re.compile(r"[Aa]rt(?:ículo|iculo)?\.?\s*(\d+)\.(\d+)\.(\d+)")


def load():
    doc = fitz.open(PDF)
    return doc, [p.get_text() for p in doc]


def cmd_structure(pages):
    # Map: (titulo, capitulo) -> sorted page list where a real article HEADING occurs
    seen = {}
    for i, t in enumerate(pages, start=1):
        for m in ART_RE.finditer(t):
            key = f"{m.group(1)}.{m.group(2)}"
            seen.setdefault(key, []).append(i)
    for k in sorted(seen, key=lambda s: [int(x) for x in s.split(".")]):
        ps = sorted(set(seen[k]))
        print(f"{k:>8}  n={len(ps):4d}  pages {ps[0]}-{ps[-1]}  {ps[:60]}")


def cmd_arts(pages, prefix):
    first = {}
    for i, t in enumerate(pages, start=1):
        for m in re.finditer(
            r"[Aa]rt(?:ículo|iculo)?\.?\s*(" + re.escape(prefix) + r"\d+)", t
        ):
            a = m.group(1)
            first.setdefault(a, []).append(i)
    for a in sorted(first, key=lambda s: [int(x) for x in s.split(".")]):
        print(f"{a:>10}  pages {sorted(set(first[a]))}")


def cmd_page(pages, a, b=None):
    b = int(b) if b else int(a)
    for i in range(int(a), b + 1):
        print(f"\n=============== PDF PAGE {i} ===============")
        print(pages[i - 1])


def cmd_grep(pages, pat):
    r = re.compile(pat, re.I)
    for i, t in enumerate(pages, start=1):
        for line in t.splitlines():
            if r.search(line):
                print(f"p{i}: {line.strip()}")


def cmd_tables(doc, a, b=None):
    b = int(b) if b else int(a)
    for i in range(int(a), b + 1):
        tf = doc[i - 1].find_tables()
        print(f"--- page {i}: {len(tf.tables)} table(s)")
        for j, tb in enumerate(tf.tables):
            print(f"  table {j} bbox={tb.bbox}")
            for row in tb.extract():
                print("   |", " | ".join("" if c is None else " ".join(c.split()) for c in row))


def main():
    doc, pages = load()
    c = sys.argv[1]
    if c == "structure":
        cmd_structure(pages)
    elif c == "arts":
        cmd_arts(pages, sys.argv[2])
    elif c == "page":
        cmd_page(pages, *sys.argv[2:])
    elif c == "grep":
        cmd_grep(pages, sys.argv[2])
    elif c == "tables":
        cmd_tables(doc, *sys.argv[2:])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
