# §ZGZ-SUBGRADO — the whole Zaragoza gate turns on ONE question, so answer it by census.
#
# THE RECORDED BLOCKER: "the polygon carries `A1` WITHOUT its subgrado, and the aprovechamiento
# article is selected BY subgrado (arts. 4.1.12 / 4.1.13 / 4.1.15 / 4.1.17). A 28-name typename
# sweep returned HTTP 400 on all 28."
#
# ⚠ THE 28 400s WERE TRUE AND MEANINGLESS. `urbanismo:Calificaciones_Urbanas` IS SERVED BY THE
# WFS AND ANSWERS 200 — it is simply ABSENT FROM GetCapabilities. So no enumeration could reach
# it and no guess did. Its name was recovered from a WMS **GetFeatureInfo** feature id
# (`Calificaciones_Urbanas.fid--...`), i.e. THE SERVER NAMED IT. It was never guessed.
#
# The layer the earlier probe measured — `urbanismo:Estructura`, 9,031 polygons — is a DIFFERENT
# plan: the *estructura urbanística* (coarse structural zones, `calificacion: "B"`). The
# *calificación y regulación del suelo* plan is `Calificaciones_Urbanas`, and its codes carry the
# subgrado (`B1/1*`). Two layers, similar names, opposite verdicts.
#
# This script downloads BOTH IN FULL and prints their complete code vocabularies, so the claim
# "the subgrado is / is not published" is a census, not an impression.

from __future__ import annotations

import io
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from ogccensus import get_feature_json, write_json  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
WFS = "https://idezar-sig.zaragoza.es/servicios/geoserver/wfs"

# ⛔ Server-returned names only. `Calificaciones_Urbanas` / `Clasificaciones` / `Estructura` /
#    `Elementos_Catalogados_*` / `Parcelas` / `Manzanas` all appeared as GetFeatureInfo feature-id
#    prefixes on layers the published city page links.
TARGETS = [
    ("urbanismo:Calificaciones_Urbanas", "calificacion"),
    ("urbanismo:Estructura", "calificacion"),
    ("urbanismo:Clasificaciones", "clasificacion"),
]

SUBGRADO_RE = re.compile(r"^([A-Z]+\d*)/(\S+)$")


def main() -> None:
    result = {}
    for tn, field in TARGETS:
        doc, f = get_feature_json(WFS, tn, count=100000)
        if doc is None:
            print(f"\n### {tn}: UNREACHABLE status={f.status} err={f.error}")
            result[tn] = {"status": f.status, "error": f.error}
            continue
        feats = doc.get("features", [])
        codes = Counter()
        desc: dict[str, str] = {}
        for ft in feats:
            p = ft.get("properties") or {}
            c = p.get(field)
            codes[str(c)] += 1
            if c is not None and str(c) not in desc and p.get("descripcion"):
                desc[str(c)] = p["descripcion"]
        graded = {c: n for c, n in codes.items() if SUBGRADO_RE.match(c)}
        print(f"\n{'='*92}\n### {tn}   fetched={len(feats)}  declared_total={doc.get('totalFeatures')}")
        print(f"    distinct `{field}` codes: {len(codes)}   "
              f"of which SUBGRADED (contain '/'): {len(graded)}   "
              f"polygons carrying a subgrade: {sum(graded.values())}")
        print(f"    null/None: {codes.get('None', 0)}")
        print(f"\n    ── FULL VOCABULARY ──")
        for c, n in sorted(codes.items(), key=lambda kv: (-kv[1], kv[0])):
            flag = " ◀ SUBGRADED" if SUBGRADO_RE.match(c) else ""
            print(f"      {c:<16} {n:>6}  {desc.get(c,'')[:62]}{flag}")
        result[tn] = {
            "fetched": len(feats), "declared_total": doc.get("totalFeatures"),
            "crs": (doc.get("crs") or {}).get("properties", {}).get("name"),
            "distinct_codes": len(codes), "subgraded_codes": len(graded),
            "subgraded_polygons": sum(graded.values()),
            "vocabulary": {c: {"count": n, "descripcion": desc.get(c)} for c, n in codes.items()},
        }

    # ── The A-family specifically: art. 4.1.12/4.1.13/4.1.15/4.1.17 are keyed on A1/3.x, A1/4.x ──
    cal = result.get("urbanismo:Calificaciones_Urbanas", {}).get("vocabulary", {})
    a_family = {c: v for c, v in cal.items() if c.upper().startswith("A")}
    print(f"\n{'='*92}\n### THE A-FAMILY (what arts. 4.1.12 / 4.1.13 / 4.1.15 / 4.1.17 select on)")
    if not a_family:
        print("    ZERO A-codes in Calificaciones_Urbanas.")
    for c, v in sorted(a_family.items()):
        print(f"      {c:<16} {v['count']:>6}  {(v['descripcion'] or '')[:70]}")

    write_json(os.path.join(OUT, "zaragoza_subgrado_census.json"), result)


if __name__ == "__main__":
    main()
