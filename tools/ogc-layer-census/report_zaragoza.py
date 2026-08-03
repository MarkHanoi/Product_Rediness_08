# §ZGZ-REPORT — mine the enumerated census for the two things Zaragoza is blocked on:
#   (1) the A1 SUBGRADO attribute, and
#   (2) an ALIGNMENT (alineación oficial) geometry layer.
# Reads only the JSON the census wrote. No network.

from __future__ import annotations

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from ogccensus import norm  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

TERMS = [
    "alineac", "rasante", "edificab", "aprovech", "ordenanza", "calificac", "clasificac",
    "fondo", "retranqueo", "altura", "planta", "pgou", "normativ", "subgrado", "grado",
    "ordenacion", "vial", "viaria", "fachada", "manzana", "parcel", "estructura", "hoja",
    "plano", "zonific", "uso", "unidad", "suelo",
]


def load(fn: str):
    with open(os.path.join(OUT, fn), encoding="utf-8") as fh:
        return json.load(fh)


def main() -> None:
    wms = load("zaragoza_wms_layers_full.json")
    wfs = load("zaragoza_wfs_layers_full.json")
    print(f"WMS layers enumerated: {len(wms)}   WFS typenames enumerated: {len(wfs)}")

    wfs_names = {d["name"] for d in wfs}

    print("\n══ TERM FREQUENCY ACROSS ALL 4,565 WMS LAYER name/title/abstract ══")
    hits: dict[str, list[dict]] = {}
    for d in wms:
        s = norm(f"{d['name']} {d.get('title','')} {d.get('abstract','')}")
        for t in TERMS:
            if t in s:
                hits.setdefault(t, []).append(d)
    for t in TERMS:
        print(f"  {t:<12} {len(hits.get(t, [])):>5}")

    for key in ("alineac", "rasante", "edificab", "aprovech", "ordenanza", "subgrado",
                "grado", "fondo", "retranqueo", "calificac", "estructura", "hoja", "zonific"):
        v = hits.get(key, [])
        if not v:
            print(f"\n── '{key}': ZERO layers ──")
            continue
        print(f"\n── '{key}': {len(v)} layers ──")
        for d in v[:40]:
            mark = "WFS+WMS" if d["name"] in wfs_names else "WMS-only"
            print(f"   [{mark}] {d['name']:<52} | {d.get('title','')[:64]}")
        if len(v) > 40:
            print(f"   ... and {len(v)-40} more")


if __name__ == "__main__":
    main()
