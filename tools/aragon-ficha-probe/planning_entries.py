#!/usr/bin/env python3
"""
ARAGON FICHA — THE TWO PLANNING ENTRIES  (A1, decisive follow-up)

The ficha is an EXHAUSTIVE per-municipality catalogue of everything IDEAragon
publishes for that municipality. That makes it a far stronger instrument than a
keyword search: it is an ENUMERATION. If a buildability layer existed for the
municipality, it would be listed here.

Exactly two of the ~80 catalogue sections are planning-related:

    "Planeamiento urbanistico: figura de planeamiento, clasificacion de suelo
     y uso global."
    "Regimen Urbanistico del Suelo"

This script prints their full dataset listings so the CONTENTS decide the
verdict, not the section titles.
"""

from __future__ import annotations

import html
import os
import re
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

TARGETS = ("planeamiento", "regimen urban")


def deaccent(s: str) -> str:
    for a, b in zip("áéíóúñÁÉÍÓÚÑ", "aeiounAEIOUN"):
        s = s.replace(a, b)
    return s


def main() -> None:
    code = sys.argv[1] if len(sys.argv) > 1 else "22112"
    with open(os.path.join(OUT, f"ficha_{code}.html"), encoding="utf-8") as fh:
        raw = fh.read()

    # Split the document on <h3> boundaries; each h3 starts a catalogue section.
    parts = re.split(r"(?is)(<h3[^>]*>.*?</h3>)", raw)

    print("=" * 78)
    print(f"PLANNING SECTIONS OF THE FICHA — {code}")
    print("=" * 78)

    for i in range(1, len(parts), 2):
        heading_html = parts[i]
        body = parts[i + 1] if i + 1 < len(parts) else ""
        heading = re.sub(r"\s+", " ",
                         html.unescape(re.sub(r"(?s)<[^>]+>", "", heading_html))).strip()
        if not any(t in deaccent(heading).lower() for t in TARGETS):
            continue

        print(f"\n### {heading}")
        print("-" * 74)

        text = re.sub(r"\s+", " ",
                      html.unescape(re.sub(r"(?s)<[^>]+>", " ", body))).strip()
        print("  BODY TEXT:")
        print(f"    {text[:1800]}")

        hrefs = re.findall(r'(?i)href="([^"]+)"', body)
        if hrefs:
            print(f"\n  {len(hrefs)} LINK(S):")
            for h in hrefs[:40]:
                print(f"    {h[:150]}")

        # Does THIS section carry any buildability parameter?
        print("\n  BUILDABILITY TERMS INSIDE THIS SECTION:")
        for term in ("altura", "plantas", "edificabilidad", "ocupaci",
                     "aprovechamiento", "retranqueo", "fondo edificable",
                     "alineaci", "densidad"):
            n = len(re.findall(term, deaccent(text).lower()))
            print(f"    {term:<20} {n}")


if __name__ == "__main__":
    main()
