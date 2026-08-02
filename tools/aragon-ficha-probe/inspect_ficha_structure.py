#!/usr/bin/env python3
"""
ARAGON FICHA — STRUCTURE INSPECTION  (A1, follow-up)

probe_ficha.py established that fichaDescarga_<CMUNIINE>.html is CONTENT and
that the pattern generalises. It also established that the four buildability
terms are ABSENT. This script answers the obvious next question:

    WHAT IS ACTUALLY ON THE PAGE, and does it link onward to planning?

It also demonstrates the FALSE-POSITIVE TRAP that a naive keyword probe walks
into on this exact page:

    "densidad"  -> "LAS con densidad 0,5 ptos/m2"      = LIDAR POINT DENSITY
    "ocupacion" -> "Sistema de ocupacion del suelo"    = LAND COVER

Both carry numbers. A non-null / keyword-count probe would have reported
"densidad present with values on 100% of fichas". That number would have been
fabricated. This is the ninth-signal shape.
"""

from __future__ import annotations

import html
import os
import re
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")


def load(code: str) -> str:
    with open(os.path.join(OUT, f"ficha_{code}.html"), encoding="utf-8") as fh:
        return fh.read()


def main() -> None:
    code = sys.argv[1] if len(sys.argv) > 1 else "22112"
    raw = load(code)

    print("=" * 78)
    print(f"FICHA STRUCTURE — {code}")
    print("=" * 78)

    # ---- Section headings -------------------------------------------------
    print("\n--- HEADINGS (h1-h4) ---")
    for m in re.finditer(r"(?is)<h([1-4])[^>]*>(.*?)</h\1>", raw):
        t = re.sub(r"\s+", " ", html.unescape(re.sub(r"(?s)<[^>]+>", "", m.group(2)))).strip()
        if t:
            print(f"  h{m.group(1)}: {t[:120]}")

    # ---- All outbound links ----------------------------------------------
    print("\n--- LINKS ---")
    for m in re.finditer(r'(?is)<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', raw):
        href = m.group(1)
        label = re.sub(r"\s+", " ", html.unescape(re.sub(r"(?s)<[^>]+>", "", m.group(2)))).strip()
        print(f"  {label[:60]:<62} -> {href[:110]}")

    # ---- Dataset category labels -----------------------------------------
    # The ficha is a catalogue; the category names tell us what THEMES the
    # municipality's geodata covers, i.e. whether urbanismo is among them.
    print("\n--- DATASET THEME LABELS (select/option, legend, strong) ---")
    seen = set()
    for m in re.finditer(r"(?is)<(option|legend|strong|b)[^>]*>(.*?)</\1>", raw):
        t = re.sub(r"\s+", " ", html.unescape(re.sub(r"(?s)<[^>]+>", "", m.group(2)))).strip()
        if t and t not in seen and len(t) < 90:
            seen.add(t)
            print(f"  {t}")
        if len(seen) > 80:
            print("  ... (truncated at 80 distinct)")
            break

    # ---- THE FALSE-POSITIVE DEMONSTRATION --------------------------------
    print("\n--- FALSE-POSITIVE TRAP: what 'densidad' and 'ocupacion' really are ---")
    txt_path = os.path.join(OUT, f"ficha_{code}.txt")
    text = open(txt_path, encoding="utf-8").read() if os.path.exists(txt_path) else ""
    for term in ("densidad", "ocupaci"):
        ctxs = {}
        for m in re.finditer(term, text, re.I):
            c = re.sub(r"\s+", " ", text[max(0, m.start() - 45): m.end() + 45]).strip()
            key = re.sub(r"\d+", "#", c)
            ctxs[key] = ctxs.get(key, 0) + 1
        print(f"\n  '{term}' — {sum(ctxs.values())} hits, {len(ctxs)} distinct contexts:")
        for c, n in sorted(ctxs.items(), key=lambda kv: -kv[1])[:6]:
            print(f"     x{n:<5} {c[:130]}")


if __name__ == "__main__":
    main()
