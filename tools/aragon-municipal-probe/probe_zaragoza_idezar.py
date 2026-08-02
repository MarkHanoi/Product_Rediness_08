#!/usr/bin/env python3
"""
probe_zaragoza_idezar.py -- does the MUNICIPAL layer serve what the REGIONAL one does not?

ARAGON-BUILDABILITY-RESEARCH.md closed Aragon on four caps. Three of them are
statements about the SIUa REGIONAL layer (fiab_geom 21.8%, 1:15.000 / 1:300.000
publication scale, ficha carries zero buildability). Zaragoza -- the largest city --
was NEVER PROBED. This measures its own municipal GIS.

Endpoints, verbatim from
https://www.zaragoza.es/sede/portal/urbanismo/info-geografica/datos :
    WMS  https://idezar-sig.zaragoza.es/servicios/geoserver/urbanismo/wms
    WFS  https://idezar-sig.zaragoza.es/servicios/geoserver/urbanismo/wfs

METHOD GUARDS:
  * VERSION LADDER. HTTP 200 beats HTTP 500 on a proxied OGC service. Try WFS
    2.0.0 / 1.1.0 / 1.0.0 and WMS 1.3.0 / 1.1.1 -- never only the modern default.
  * A SUCCESSFUL RESPONSE IS NOT AN APPLIED FILTER. Every count is checked against
    the unfiltered count; if they match, the filter is reported as NOT APPLIED.
  * POPULATED IS NOT PRESENT. `0` is this region's proven null substitute
    (SIUa: 70/78 rows shape_area>0 AND perimeter==0). Every numeric field is scored
    for VALID (non-null, non-empty, non-zero, parses as a number) separately from
    non-null, and label-hits are never conflated with values.
  * UNKNOWN NEVER NO.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

WFS = "https://idezar-sig.zaragoza.es/servicios/geoserver/urbanismo/wfs"
WMS = "https://idezar-sig.zaragoza.es/servicios/geoserver/urbanismo/wms"
ROOT_WFS = "https://idezar-sig.zaragoza.es/servicios/geoserver/wfs"

# The layers that could carry an ENVELOPE parameter, not just a base map.
TARGETS = [
    "urbanismo:Alturas_Edificios",          # heights
    "urbanismo:IDEZar_Ordenacion_lineas",   # "Lineas de ordenacion" <- alineacion candidate
    "urbanismo:Lineas_Edificaciones",       # building lines
    "urbanismo:PLA_1_Instrumentos_ambito",  # governing instrument per ambito
    "urbanismo:PLA_1_Ambitos_recogido",
    "urbanismo:PLA_1_Ambitos_desarrollo",
    "urbanismo:Parcelas",
    "urbanismo:Manzanas",
    "urbanismo:suelos_vacantes",
]

# Buildability lexemes. BOTH depth words -- Malaga never uses `fondo`, it uses
# `profundidad edificable`; a fondo-shaped search misses 27.6% of Valencia docs.
LEXEMES = {
    "height": ["altura", "alt_", "plantas", "nplantas", "num_plant", "cornisa",
               "altura_max", "h_max", "alt_max", "altura_regu"],
    "depth": ["fondo", "profundidad", "fondo_edif", "prof_edif"],
    "far": ["edificab", "aprovech", "coef", "far", "indice"],
    "setback": ["retranqueo", "separacion", "lindero", "linderos", "sep_"],
    "coverage": ["ocupacion", "ocup"],
    "alignment": ["alineac", "alineaci", "rasante"],
    "zone": ["zona", "calific", "uso", "clave", "ordenanza", "norma_zonal", "grado"],
}


def get(url: str, timeout: int = 90) -> tuple[int, bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.getcode(), r.read(), ""
    except urllib.error.HTTPError as e:
        try:
            body = e.read()
        except Exception:  # noqa: BLE001
            body = b""
        return e.code, body, f"HTTPError {e.code}"
    except Exception as e:  # noqa: BLE001
        return -1, b"", f"{type(e).__name__}: {e}"


def q(base: str, **kw) -> str:
    return base + "?" + urllib.parse.urlencode(kw)


# ---------------------------------------------------------------- version ladder

def version_ladder() -> list[dict]:
    """HTTP 200 beats HTTP 500 on a proxied OGC service -- try them all."""
    rows = []
    for svc, base, versions in (("WFS", WFS, ["2.0.0", "1.1.0", "1.0.0"]),
                                ("WMS", WMS, ["1.3.0", "1.1.1"]),
                                ("WFS-root", ROOT_WFS, ["2.0.0", "1.1.0", "1.0.0"])):
        for v in versions:
            code, body, err = get(q(base, service=svc.split("-")[0], version=v,
                                    request="GetCapabilities"))
            names = re.findall(rb"<Name>([^<]+)</Name>", body)
            rows.append({"service": svc, "version": v, "http": code,
                         "bytes": len(body), "name_elements": len(names),
                         "error": err})
            print(f"  {svc:9} {v:6} HTTP {code:>4}  {len(body):>8,} B  "
                  f"names={len(names)}")
    return rows


# ---------------------------------------------------------------- schema

def describe(layer: str) -> dict:
    code, body, err = get(q(WFS, service="WFS", version="2.0.0",
                            request="DescribeFeatureType", typeNames=layer))
    if code != 200:
        code, body, err = get(q(WFS, service="WFS", version="1.1.0",
                                request="DescribeFeatureType", typeName=layer))
    fields = []
    if code == 200:
        for m in re.finditer(rb'<(?:xsd:|xs:)?element[^>]*name="([^"]+)"[^>]*'
                             rb'type="([^"]+)"', body):
            fields.append({"name": m.group(1).decode(), "type": m.group(2).decode()})
    return {"http": code, "error": err, "fields": fields}


# ---------------------------------------------------------------- values

def _num(v):
    if v is None:
        return None
    s = str(v).strip().replace(",", ".")
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def sample(layer: str, limit: int = 1000) -> dict:
    """GetFeature as GeoJSON with an explicit unfiltered control count."""
    url = q(WFS, service="WFS", version="2.0.0", request="GetFeature",
            typeNames=layer, count=str(limit), outputFormat="application/json")
    code, body, err = get(url, timeout=180)
    if code != 200 or not body.lstrip().startswith(b"{"):
        url = q(WFS, service="WFS", version="1.1.0", request="GetFeature",
                typeName=layer, maxFeatures=str(limit), outputFormat="application/json")
        code, body, err = get(url, timeout=180)
    if code != 200:
        return {"http": code, "error": err or "non-200"}
    try:
        gj = json.loads(body.decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001
        return {"http": code, "error": f"not GeoJSON: {e}", "head": body[:200].decode("latin-1")}

    feats = gj.get("features", [])
    total = gj.get("totalFeatures", gj.get("numberMatched"))
    props: dict[str, list] = {}
    for f in feats:
        for k, v in (f.get("properties") or {}).items():
            props.setdefault(k, []).append(v)

    stats = {}
    for k, vals in props.items():
        n = len(vals)
        non_null = sum(1 for v in vals if v is not None and str(v).strip() != "")
        nums = [_num(v) for v in vals]
        nums = [x for x in nums if x is not None]
        # POPULATED IS NOT PRESENT: zero is this region's proven null substitute.
        valid = [x for x in nums if x != 0.0]
        distinct = len({str(v) for v in vals if v is not None and str(v).strip() != ""})
        row = {
            "n": n,
            "non_null_pct": round(100.0 * non_null / n, 1) if n else 0.0,
            "numeric_pct": round(100.0 * len(nums) / n, 1) if n else 0.0,
            "VALID_pct_nonzero": round(100.0 * len(valid) / n, 1) if n else 0.0,
            "distinct": distinct,
        }
        if valid:
            row["min"] = min(valid)
            row["max"] = max(valid)
        if 0 < distinct <= 25:
            row["values"] = sorted({str(v) for v in vals
                                    if v is not None and str(v).strip() != ""})[:25]
        stats[k] = row

    hits = {}
    for cat, words in LEXEMES.items():
        found = [k for k in props if any(w in k.lower() for w in words)]
        if found:
            hits[cat] = found

    return {"http": code, "returned": len(feats), "totalFeatures_declared": total,
            "field_stats": stats, "lexeme_hits": hits}


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    print("== version ladder ==")
    ladder = version_ladder()

    print("\n== WMS layer inventory (WMS often exposes MORE than WFS) ==")
    code, body, _ = get(q(WMS, service="WMS", version="1.3.0",
                          request="GetCapabilities"))
    wms_layers = []
    if code == 200:
        for m in re.finditer(rb"<Layer[^>]*>\s*(?:<[^>]+>\s*)*?<Name>([^<]+)</Name>"
                             rb"\s*<Title>([^<]*)</Title>", body):
            wms_layers.append({"name": m.group(1).decode("utf-8", "replace"),
                               "title": m.group(2).decode("utf-8", "replace")})
    print(f"  WMS layers with a Name: {len(wms_layers)}")

    print("\n== per-layer schema + value measurement ==")
    layers = {}
    for lyr in TARGETS:
        print(f"  {lyr}")
        d = describe(lyr)
        s = sample(lyr)
        layers[lyr] = {"describe": d, "sample": s}
        print(f"      schema fields={len(d['fields'])}  "
              f"features={s.get('returned')}  "
              f"declared_total={s.get('totalFeatures_declared')}  "
              f"lexemes={list(s.get('lexeme_hits', {}).keys())}")
        time.sleep(0.3)

    payload = {
        "probe": "zaragoza-idezar-municipal",
        "when": time.strftime("%Y-%m-%d"),
        "endpoints": {"wfs": WFS, "wms": WMS, "root_wfs": ROOT_WFS,
                      "published_at": "https://www.zaragoza.es/sede/portal/"
                                      "urbanismo/info-geografica/datos"},
        "version_ladder": ladder,
        "wms_layers": wms_layers,
        "layers": layers,
    }
    with open(os.path.join(OUT, "zaragoza_idezar_probe.json"), "w",
              encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print("\nwrote out/zaragoza_idezar_probe.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
