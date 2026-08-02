#!/usr/bin/env python3
"""
probe_zaragoza_calificacion.py -- MEASURE the municipal calificacion code space.

probe_zaragoza_wms_only.py found that IDEZar's WMS-only layer `Plano_Estructura`
answers GetFeatureInfo with a real polygon plus

        {"calificacion": "EQ", "descripcion": "Equipamientos y Servicios"}

in EPSG:25830 at block precision. That is a MUNICIPAL zoning layer -- the thing
ARAGON-BUILDABILITY-RESEARCH.md concluded Aragon does not publish, having only
ever looked at the REGIONAL SIUa layer at 1:15.000.

Two things are measured here:

  A. THE HIDDEN TYPENAME. The returned feature ids read `Estructura.fid-...` and
     `Clasificaciones.fid-...`. GeoServer will often serve a feature type over WFS
     even when the WORKSPACE capabilities document does not advertise it.
     ⭐ PATH SHAPE, again: Aragon's own 404s were a file prefix read as a
     directory. Try the bare and qualified names before concluding WMS-only.

  B. THE CODE SPACE, by GRID SAMPLE. If WFS refuses, GetFeatureInfo over a regular
     grid still yields DISTINCT codes and a HIT RATE -- and a hit rate is the
     honest coverage number, because a miss is a genuine no-polygon-here.

⛔ POPULATED IS NOT PRESENT. `0` is this region's proven null substitute; every
numeric is scored non-zero-valid separately. And a grid HIT RATE is reported as
"fraction of sampled points inside a polygon", NEVER as "fraction of the city
covered" -- the grid includes points outside the urban area by construction.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
WMS = "https://idezar-sig.zaragoza.es/servicios/geoserver/urbanismo/wms"
WFS = "https://idezar-sig.zaragoza.es/servicios/geoserver/urbanismo/wfs"
ROOT_WFS = "https://idezar-sig.zaragoza.es/servicios/geoserver/wfs"

HIDDEN_NAMES = ["Estructura", "urbanismo:Estructura",
                "Clasificaciones", "urbanismo:Clasificaciones",
                "Plano_Estructura", "urbanismo:Plano_Estructura",
                "Plano_Clasificacion", "urbanismo:Plano_Clasificacion",
                "Parcelario_Ordenacion", "urbanismo:Parcelario_Ordenacion"]

CRS = "EPSG:25830"
# Zaragoza consolidated urban area, EPSG:25830, deliberately generous.
X0, X1 = 673500, 680500
Y0, Y1 = 4611000, 4617500
STEP = 250  # metres


def get(url: str, timeout: int = 45):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.getcode(), r.read()
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read()
        except Exception:  # noqa: BLE001
            return e.code, b""
    except Exception as e:  # noqa: BLE001
        return -1, str(e).encode()


def try_hidden_wfs() -> list[dict]:
    rows = []
    for base in (WFS, ROOT_WFS):
        for name in HIDDEN_NAMES:
            for ver, key, cnt in (("2.0.0", "typeNames", "count"),
                                  ("1.1.0", "typeName", "maxFeatures"),
                                  ("1.0.0", "typeName", "maxFeatures")):
                url = base + "?" + urllib.parse.urlencode({
                    "service": "WFS", "version": ver, "request": "GetFeature",
                    key: name, cnt: "5", "outputFormat": "application/json"})
                code, body = get(url)
                ok = code == 200 and body.lstrip().startswith(b"{") and \
                    b'"features"' in body
                n = 0
                if ok:
                    try:
                        n = len(json.loads(body.decode("utf-8", "replace"))
                                .get("features", []))
                    except Exception:  # noqa: BLE001
                        ok = False
                rows.append({"base": base, "typename": name, "version": ver,
                             "http": code, "served": bool(ok and n > 0),
                             "features": n})
                if ok and n > 0:
                    print(f"  *** HIDDEN TYPENAME SERVED: {name} @ {ver} "
                          f"on {base} -> {n} features")
                    break   # next NAME -- do NOT stop the whole sweep
    return rows


def bulk(typename: str, base: str = WFS) -> dict:
    """Full pull of an UNADVERTISED feature type.

    ⛔ PARAMETER SHAPE, MEASURED: on this endpoint `count=N` returns HTTP 200 and
    N features, but adding `startIndex=0` returns HTTP 400. A pager written the
    obvious way therefore pulls ZERO and reports the layer as empty -- which is
    exactly what the first run of this probe did. The layer was 9,031 features
    the whole time. UNKNOWN NEVER NO, and a 400 is a PARAMETER fault, never a
    statement about the data.

    So: no paging. One unbounded GetFeature, with numberMatched as the control.
    """
    url = base + "?" + urllib.parse.urlencode({
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": typename, "outputFormat": "application/json"})
    code, body = get(url, timeout=600)
    if code != 200:
        return {"typename": typename, "http": code,
                "error": "non-200 -- NOT evidence the layer is empty"}
    try:
        gj = json.loads(body.decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001
        return {"typename": typename, "error": f"not GeoJSON: {e}"}
    feats = gj.get("features", [])
    matched = gj.get("numberMatched")
    # ⛔ A SUCCESSFUL RESPONSE IS NOT A COMPLETE ONE. Reconcile explicitly.
    complete = (matched in (None, "unknown")) or (str(matched) == str(len(feats)))

    props: dict[str, Counter] = {}
    for f in feats:
        for k, v in (f.get("properties") or {}).items():
            props.setdefault(k, Counter())[str(v)] += 1

    fields = {}
    for k, c in props.items():
        total = sum(c.values())
        blank = c.get("", 0) + c.get("None", 0) + c.get("null", 0)
        zero = c.get("0", 0) + c.get("0.0", 0)
        fields[k] = {
            "n": total,
            "distinct": len([v for v in c if v not in ("", "None", "null")]),
            "non_null_pct": round(100.0 * (total - blank) / total, 1) if total else 0,
            "VALID_pct_nonzero_nonblank":
                round(100.0 * (total - blank - zero) / total, 1) if total else 0,
            "top": c.most_common(60),
        }
    return {"typename": typename, "features_pulled": len(feats),
            "numberMatched": matched, "pull_is_complete": complete,
            "response_bytes": len(body), "fields": fields}


def featureinfo(layer: str, x: float, y: float, half: float = 3.0):
    bb = f"{x - half},{y - half},{x + half},{y + half}"
    url = WMS + "?" + urllib.parse.urlencode({
        "service": "WMS", "version": "1.1.1", "request": "GetFeatureInfo",
        "layers": layer, "query_layers": layer, "srs": CRS, "bbox": bb,
        "width": 3, "height": 3, "x": 1, "y": 1, "info_format": "application/json",
        "feature_count": 10, "styles": "", "format": "image/png"})
    code, body = get(url)
    if code != 200:
        return None
    try:
        return json.loads(body.decode("utf-8", "replace")).get("features", [])
    except Exception:  # noqa: BLE001
        return None


def grid(layer: str) -> dict:
    pts = [(x, y) for x in range(X0, X1 + 1, STEP)
           for y in range(Y0, Y1 + 1, STEP)]
    hits, misses, errors = 0, 0, 0
    props: dict[str, Counter] = {}
    examples: dict[str, dict] = {}
    for i, (x, y) in enumerate(pts):
        fs = featureinfo(layer, x, y)
        if fs is None:
            errors += 1
        elif not fs:
            misses += 1
        else:
            hits += 1
            for f in fs:
                for k, v in (f.get("properties") or {}).items():
                    props.setdefault(k, Counter())[str(v)] += 1
                code = str((f.get("properties") or {}).get("calificacion", ""))
                if code and code not in examples:
                    examples[code] = {
                        "descripcion": (f.get("properties") or {}).get("descripcion"),
                        "at": [x, y],
                        "vertices": len((f.get("geometry") or {})
                                        .get("coordinates", [[]])[0])
                        if (f.get("geometry") or {}).get("type") == "Polygon" else None,
                    }
        if i % 50 == 0:
            print(f"    {i}/{len(pts)}  hits={hits} miss={misses} err={errors}")
        time.sleep(0.05)

    fields = {}
    for k, c in props.items():
        total = sum(c.values())
        blank = c.get("", 0) + c.get("None", 0) + c.get("null", 0)
        zero = c.get("0", 0) + c.get("0.0", 0)
        fields[k] = {
            "observations": total,
            "distinct": len([v for v in c if v not in ("", "None", "null")]),
            "non_null_pct": round(100.0 * (total - blank) / total, 1) if total else 0.0,
            # POPULATED IS NOT PRESENT -- zero is the proven null substitute here.
            "VALID_pct_nonzero_nonblank":
                round(100.0 * (total - blank - zero) / total, 1) if total else 0.0,
            "top": c.most_common(30),
        }
    return {
        "layer": layer,
        "grid_step_m": STEP,
        "points_sampled": len(pts),
        "points_inside_a_polygon": hits,
        "points_outside": misses,
        "errors": errors,
        "HIT_RATE_pct_of_sampled_points": round(100.0 * hits / len(pts), 1) if pts else 0,
        "HIT_RATE_CAVEAT": ("this is the fraction of GRID POINTS inside a polygon. "
                            "The grid bbox deliberately overshoots the urban area, so "
                            "this is NOT a coverage figure for the city."),
        "fields": fields,
        "calificacion_examples": examples,
    }


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    print("== A. hidden WFS typename ==")
    hidden = try_hidden_wfs()
    served = [r for r in hidden if r["served"]]
    print(f"   served: {len(served)}")

    print("== B. bulk pull of every unadvertised typename that answered ==")
    bulks = {}
    for r in served:
        name = r["typename"]
        if name in bulks:
            continue
        print(f"  bulk {name}")
        bulks[name] = bulk(name, r["base"])

    print("== C. grid control on the WMS path (independent of WFS) ==")
    est = grid("Plano_Estructura")

    payload = {"probe": "zaragoza-calificacion-code-space",
               "when": time.strftime("%Y-%m-%d"),
               "hidden_wfs_attempts": hidden,
               "hidden_wfs_served": served,
               "bulk_pulls": bulks,
               "wms_grid_control_estructura": est}
    with open(os.path.join(OUT, "zaragoza_calificacion.json"), "w",
              encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print("\nwrote out/zaragoza_calificacion.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
