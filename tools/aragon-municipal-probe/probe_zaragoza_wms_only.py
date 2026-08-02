#!/usr/bin/env python3
"""
probe_zaragoza_wms_only.py -- the four layers WMS serves and WFS does not.

IDEZar's urbanismo WFS exposes 23 feature types. Its WMS exposes 27 -- and the
four extras are exactly the ones with planning names:

    Parcelario_Integral      Parcelario integral
    Parcelario_Ordenacion    Parcelario ordenacion     <- ZONING candidate
    Plano_Clasificacion      Plano de clasificacion del suelo
    Plano_Estructura         Plano de estructura urbanistica

⭐ WMS-ONLY IS THE SAME SHAPE AS SIUa REGIONALLY -- served for painting, not for
querying. GetFeatureInfo is then the ONLY attribute path. This measures whether
these four are QUERYABLE (attributes returned) or merely PAINTABLE (an image and
nothing else). A layer that paints but will not answer is NOT a data source.

⛔ A SUCCESSFUL RESPONSE IS NOT AN APPLIED FILTER, and a 200 with an empty
FeatureCollection is NOT proof the layer is empty -- it may be proof the pixel
missed. Every probe point is checked against a rendered tile first: if the tile
is blank at that point, the empty GetFeatureInfo is reported as UNTESTED.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
WMS = "https://idezar-sig.zaragoza.es/servicios/geoserver/urbanismo/wms"

LAYERS = ["Parcelario_Ordenacion", "Parcelario_Integral",
          "Plano_Clasificacion", "Plano_Estructura",
          "PLA_1_Equipamientos_etiquetado"]

# Zaragoza city centre, EPSG:25830. Plaza del Pilar ~ (676200, 4614600).
# A small bbox so the pixel we interrogate is unambiguous.
CRS = "EPSG:25830"
POINTS = {
    "plaza_del_pilar": (676190, 4614560),
    "gran_via": (676900, 4612900),
    "actur": (675200, 4616400),
}
HALF = 150.0
SIZE = 401  # odd -> exact centre pixel at 200,200


def get(url: str, timeout: int = 60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.getcode(), r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read(), ""
        except Exception:  # noqa: BLE001
            return e.code, b"", ""
    except Exception as e:  # noqa: BLE001
        return -1, str(e).encode(), ""


def bbox(x, y):
    return f"{x - HALF},{y - HALF},{x + HALF},{y + HALF}"


def tile_is_blank(png: bytes) -> bool | None:
    """Cheap non-blank test without an image library.

    A fully transparent/uniform PNG from GeoServer is tiny. We do not decode --
    we report SIZE and let the threshold be explicit and auditable rather than
    pretending to a pixel test we cannot do here.
    """
    if not png.startswith(b"\x89PNG"):
        return None
    return len(png) < 1500


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for lyr in LAYERS:
        for pname, (x, y) in POINTS.items():
            bb = bbox(x, y)
            common = {"service": "WMS", "version": "1.1.1", "layers": lyr,
                      "srs": CRS, "bbox": bb, "width": SIZE, "height": SIZE}
            # 1) does it PAINT?
            murl = WMS + "?" + urllib.parse.urlencode(
                dict(common, request="GetMap", format="image/png",
                     transparent="true", styles=""))
            mcode, mbody, mct = get(murl)
            blank = tile_is_blank(mbody)

            # 2) does it ANSWER?
            best = None
            for fmt in ("application/json", "text/plain", "text/html"):
                furl = WMS + "?" + urllib.parse.urlencode(
                    dict(common, request="GetFeatureInfo", query_layers=lyr,
                         info_format=fmt, x=SIZE // 2, y=SIZE // 2,
                         feature_count=10, styles="", format="image/png"))
                fcode, fbody, fct = get(furl)
                if fcode == 200 and fbody.strip():
                    best = {"info_format": fmt, "http": fcode,
                            "bytes": len(fbody),
                            "body": fbody[:1400].decode("utf-8", "replace")}
                    if fmt == "application/json":
                        break
                elif best is None:
                    best = {"info_format": fmt, "http": fcode,
                            "bytes": len(fbody),
                            "body": fbody[:300].decode("utf-8", "replace")}

            row = {"layer": lyr, "point": pname, "bbox": bb,
                   "getmap_http": mcode, "getmap_bytes": len(mbody),
                   "getmap_ctype": mct,
                   "tile_probably_blank": blank,
                   "getfeatureinfo": best}
            # ⛔ empty answer over a BLANK tile proves nothing about the layer.
            if blank and best and best.get("bytes", 0) < 60:
                row["verdict"] = "UNTESTED -- blank tile at probe point"
            elif best and best.get("http") == 200 and best.get("bytes", 0) > 60:
                row["verdict"] = "QUERYABLE"
            else:
                row["verdict"] = "PAINTS_BUT_DOES_NOT_ANSWER"
            rows.append(row)
            print(f"{lyr:32} {pname:16} map={mcode} {len(mbody):>7,}B "
                  f"blank={blank}  {row['verdict']}")
            time.sleep(0.25)

    with open(os.path.join(OUT, "zaragoza_wms_only_layers.json"), "w",
              encoding="utf-8") as f:
        json.dump({"probe": "zaragoza-wms-only-layers",
                   "when": time.strftime("%Y-%m-%d"),
                   "endpoint": WMS, "crs": CRS, "rows": rows},
                  f, indent=2, ensure_ascii=False)
    print("\nwrote out/zaragoza_wms_only_layers.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
