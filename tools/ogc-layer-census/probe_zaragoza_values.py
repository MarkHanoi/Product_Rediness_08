# §ZGZ-VALUES — an attribute NAME proves nothing; the VALUES decide.
#
# `urbanismo:Portales` carries a column literally called `calificacion`. Whether that closes
# Zaragoza depends entirely on whether its values read `A1` (useless — the same truncation the
# gate already refuses on) or `A1/3.2` (the subgrado, which closes it). Nobody can tell from the
# schema. So: fetch real features and PRINT THE DISTINCT VALUES.
#
# Also interrogates the WMS-ONLY plans by GetFeatureInfo. A layer with no WFS is not a layer with
# no attributes — GetFeatureInfo returns the underlying row, and `Plano_Calificacion`
# ("Plano de calificación y regulación del suelo") is exactly where a subgrado would live.
#
# ⛔ Every layer name below came out of GetCapabilities. None was guessed.

from __future__ import annotations

import io
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from ogccensus import _with_params, fetch, get_feature_json, write_json  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
GS = "https://idezar-sig.zaragoza.es/servicios/geoserver"
WFS = f"{GS}/wfs"
WMS = f"{GS}/wms"

# Enumerated, not guessed — every one appeared in GetCapabilities.
WFS_SAMPLE = [
    "urbanismo:Portales", "urbanismo:Parcelas", "urbanismo:Manzanas",
    "urbanismo:Lineas_Edificaciones", "urbanismo:IDEZar_Ordenacion_lineas",
    "urbanismo:Alturas_Edificios", "urbanismo:Areas_Referencia",
    "urbanismo:Textos_Edificaciones", "urbanismo:PLA_1_Instrumentos_ambito",
    "urbanismo:PLA_1_Ambitos_desarrollo", "urbanismo:PLA_1_Ambitos_recogido",
    "urbanismo:suelos_vacantes", "urbanismo:hoja_pgou_2000", "urbanismo:hoja_pgou_5000",
    "urbanismo:hoja_pgou_chc", "urbanismo:hoja_pgou_chr", "urbanismo:Vias",
    "urbanismo:v_ambitos_desarrollo_etiquetas", "urbanismo:Clavos_Topograficos",
    "elu:ExistingLandUseObject", "cp:CadastralParcel", "cp:CadastralZoning",
]

WMS_ONLY = ["Plano_Calificacion", "urbanismo:Plano_Clasificacion",
            "urbanismo:Plano_Estructura", "urbanismo:Parcelario_Ordenacion",
            "urbanismo:Parcelario_Integral"]


def sample_wfs() -> dict:
    out = {}
    for tn in WFS_SAMPLE:
        doc, f = get_feature_json(WFS, tn, count=60)
        if doc is None:
            out[tn] = {"status": f.status, "error": f.error}
            print(f"\n### {tn}: status={f.status} error={f.error}")
            continue
        feats = doc.get("features", [])
        props: dict[str, Counter] = {}
        for ft in feats:
            for k, v in (ft.get("properties") or {}).items():
                props.setdefault(k, Counter())[str(v)[:60]] += 1
        out[tn] = {
            "status": f.status,
            "returned": len(feats),
            "totalFeatures": doc.get("totalFeatures", doc.get("numberMatched")),
            "crs": (doc.get("crs") or {}).get("properties", {}).get("name"),
            "sample_values": {k: [v for v, _ in c.most_common(8)] for k, c in props.items()},
        }
        print(f"\n### {tn}  total={out[tn]['totalFeatures']} crs={out[tn]['crs']}")
        for k, c in props.items():
            if k.lower() in ("geom", "the_geom", "wkb_geometry"):
                continue
            print(f"    {k:<26} -> {[v for v, _ in c.most_common(6)]}")
    return out


def probe_wms_featureinfo(x: float, y: float) -> dict:
    """GetFeatureInfo at one ETRS89/UTM30N point. Returns the underlying ROW for a WMS-only
    layer — the only way to see whether `Plano_Calificacion` carries a subgrado."""
    out = {}
    d = 40.0
    bbox = f"{x-d},{y-d},{x+d},{y+d}"
    for lay in WMS_ONLY:
        for fmt in ("application/json", "text/plain"):
            url = _with_params(WMS, {
                "service": "WMS", "version": "1.1.1", "request": "GetFeatureInfo",
                "layers": lay, "query_layers": lay, "srs": "EPSG:25830", "bbox": bbox,
                "width": "101", "height": "101", "x": "50", "y": "50",
                "info_format": fmt, "feature_count": "20",
            })
            f = fetch(url, timeout=45)
            body = f.text()[:4000]
            if f.ok and body.strip():
                out[lay] = {"format": fmt, "status": f.status, "body": body}
                print(f"\n### GetFeatureInfo {lay}  [{fmt}] -> {f.status}")
                print("    " + body[:1800].replace("\n", "\n    "))
                break
            out.setdefault(lay, {"format": fmt, "status": f.status, "error": f.error,
                                 "body": body[:600]})
        else:
            print(f"\n### GetFeatureInfo {lay} -> {out[lay].get('status')} "
                  f"{out[lay].get('error')}")
    return out


def main() -> None:
    print("══════ WFS FEATURE VALUES ══════")
    wfs_out = sample_wfs()

    # A point inside the consolidated urban core (Plaza del Pilar area), ETRS89 / UTM 30N.
    # Taken from the WFS `urbanismo:Parcelas` bbox centre rather than typed from memory.
    print("\n\n══════ WMS GetFeatureInfo (WMS-only plans) ══════")
    pts = [(676200.0, 4614600.0), (675800.0, 4613900.0), (677000.0, 4615200.0)]
    fi = {}
    for (px, py) in pts:
        print(f"\n───── point E{px} N{py} (EPSG:25830) ─────")
        fi[f"{px},{py}"] = probe_wms_featureinfo(px, py)

    write_json(os.path.join(OUT, "zaragoza_values.json"), {"wfs": wfs_out, "featureinfo": fi})


if __name__ == "__main__":
    main()
