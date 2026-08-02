#!/usr/bin/env python3
"""C3c - the ROUTING measurement via GetFeatureInfo (WFS is admin-disabled).

Previous attempt failed UNIFORMLY on `Unsupported INFO_FORMAT value
(application/json)` - INCLUDING the ocean negative control. A form that fails
uniformly is the WRONG FORM, not evidence about the data. Retry with the
formats the capabilities document actually advertises, and sweep BOTH AXIS
ORDERS and BOTH CRS FAMILIES before concluding anything.

R is scored as: does a parcel point resolve to a UNIQUE governing zone/instrument?
  unique / ambiguous(>1) / none
"""
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
H = "https://idecan2.grafcan.es/ServicioWMS/Planeamiento"
FORMATS = ["text/plain", "application/vnd.ogc.gml", "text/html", "text/xml"]

# lon/lat of KNOWN urban points + a KNOWN-IMPOSSIBLE point (negative control)
POINTS = {
    "LasPalmas-Vegueta":   (-15.4150, 28.0997),
    "Telde-centro":        (-15.4180, 27.9950),
    "SantaCruzTfe-centro": (-16.2518, 28.4682),
    "Arrecife-centro":     (-13.5480, 28.9630),
    "Agulo-centro":        (-17.1930, 28.1830),
    "ATLANTIC-OCEAN(neg)": (-18.5000, 27.0000),
}


def utm28(lon, lat):
    """WGS84 -> UTM 28N (EPSG:32628), sufficient accuracy for a point query."""
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    k0, lon0 = 0.9996, math.radians(-15.0)
    p, l = math.radians(lat), math.radians(lon)
    n = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    t = math.tan(p) ** 2
    c = e2 / (1 - e2) * math.cos(p) ** 2
    A = (l - lon0) * math.cos(p)
    e4, e6 = e2 * e2, e2 * e2 * e2
    M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p
             - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * p)
             + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * p)
             - (35 * e6 / 3072) * math.sin(6 * p))
    x = k0 * n * (A + (1 - t + c) * A ** 3 / 6
                  + (5 - 18 * t + t * t + 72 * c - 58 * e2 / (1 - e2))
                  * A ** 5 / 120) + 500000
    y = k0 * (M + n * math.tan(p) * (A * A / 2 + (5 - t + 9 * c + 4 * c * c)
                                     * A ** 4 / 24
                                     + (61 - 58 * t + t * t + 600 * c
                                        - 330 * e2 / (1 - e2)) * A ** 6 / 720))
    return x, y


def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}"


def query(layer, x, y, fmt, half=40):
    bb = f"{x-half},{y-half},{x+half},{y+half}"
    return (f"{H}?service=WMS&version=1.1.1&request=GetFeatureInfo&"
            f"layers={layer}&query_layers={layer}&srs=EPSG:32628&bbox={bb}&"
            f"width=101&height=101&x=50&y=50&"
            f"info_format={urllib.parse.quote(fmt)}&feature_count=25")


def nfeat(txt):
    """Count returned records across MapServer's text/gml shapes."""
    if "ServiceException" in txt:
        return -1
    n = len(re.findall(r"^\s*\w+_feature\b", txt, re.M))
    n = max(n, len(re.findall(r"<gml:featureMember", txt)))
    n = max(n, len(re.findall(r"ETIQUETA\s*=", txt, re.I)))
    return n


def main():
    import urllib.parse  # noqa: F401  (used in query())
    globals()["urllib"].parse = urllib.parse

    # --- FORMAT DISCOVERY on a single known point ---------------------
    x, y = utm28(*POINTS["LasPalmas-Vegueta"])
    print(f"format discovery at LasPalmas-Vegueta UTM28N=({x:.0f},{y:.0f})")
    good = None
    for fmt in FORMATS:
        c, t = get(query("EDIF", x, y, fmt))
        err = re.search(r"<ServiceException[^>]*>(.*?)</ServiceException>",
                        t, re.S)
        print(f"  {fmt:<28} http={c} bytes={len(t)} "
              f"{'EXC: ' + re.sub(r'[ \t]+',' ',err.group(1)).strip()[:110] if err else 'OK'}")
        if not err and good is None:
            good = fmt
    if good is None:
        print("\n  ⛔ every advertised INFO_FORMAT returned a ServiceException "
              "at a KNOWN URBAN POINT. Uniform failure = the FORM or the "
              "SERVICE, not the data. R = blocked (named blocker), NOT absent.")
    else:
        print(f"\n  usable INFO_FORMAT = {good}")

    # --- ROUTING sweep -------------------------------------------------
    res = {}
    for tag, (lon, lat) in POINTS.items():
        x, y = utm28(lon, lat)
        row = {}
        for layer in ("EDIF", "ZUSO", "AMB", "CLA", "SUSP"):
            best = None
            for fmt in ([good] if good else FORMATS):
                c, t = get(query(layer, x, y, fmt))
                n = nfeat(t)
                if n >= 0:
                    best = (n, t[:400])
                    break
            row[layer] = best[0] if best else "EXC"
        res[tag] = row
        print(f"  {tag:<24} {row}")

    print("\n=== R CLASSIFICATION ===")
    for tag, row in res.items():
        amb = row.get("AMB")
        if amb == "EXC":
            k = "blocked(service exception)"
        elif isinstance(amb, int) and amb == 1:
            k = "unique"
        elif isinstance(amb, int) and amb > 1:
            k = "ambiguous"
        else:
            k = "none"
        print(f"  {tag:<24} AMB(ambito/instrument)={amb} -> {k}")
    with open(os.path.join(DATA, "gfi_routing.json"), "w",
              encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
