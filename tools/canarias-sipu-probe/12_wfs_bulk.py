#!/usr/bin/env python3
"""C3b - TEST THE L2 PREMISE: "GetFeatureInfo point-query only, no bulk WFS".

Canarias was filed L2 on that claim. A capability recorded as absent on an
incomplete read is the same failure shape as Madrid's paging "blocker".
So: identify the ENGINE first, then test WFS properly, then test filtering with
a NEGATIVE CONTROL (a successful response is not an applied filter).
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
HOST = "https://idecan2.grafcan.es/ServicioWMS/Planeamiento"


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:6000]
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}".encode()


def show(tag, url, code, body, n=420):
    txt = body.decode("utf-8", "replace")
    print(f"\n--- {tag}\n    {url[:150]}\n    http={code} bytes={len(body)}")
    # ⛔ print the WHOLE error, not the first half
    if re.search(r"Exception|error", txt[:2000], re.I):
        print(f"    ERROR TEXT: {re.sub(r'[ \t]+',' ',txt)[:900]}")
    else:
        print(f"    head: {re.sub(r'\\s+',' ',txt)[:n]}")
    return txt


def main():
    out = {}

    # 1. ENGINE IDENTIFICATION - decides which paging dialect applies
    code, body = get(f"{HOST}?service=WMS&request=GetCapabilities&version=1.3.0")
    txt = body.decode("utf-8", "replace")
    eng = "UNKNOWN"
    if "MapServer" in txt or "mapserv" in txt.lower():
        eng = "MapServer"
    elif "GeoServer" in txt:
        eng = "GeoServer"
    elif "ArcGIS" in txt:
        eng = "ArcGIS"
    print(f"ENGINE: {eng}   (paging dialect: MapServer=startindex, "
          f"GeoServer=sortBy+startIndex, ArcGIS=resultOffset)")
    out["engine"] = eng
    layers = re.findall(r"<Name>([^<]+)</Name>", txt)
    print(f"WMS layers ({len(layers)}): {layers}")
    out["wms_layers"] = layers
    fmts = re.findall(r"<Format>([^<]+)</Format>", txt)
    print(f"GetFeatureInfo formats: "
          f"{sorted({f for f in fmts if 'gml' in f.lower() or 'json' in f.lower() or 'text' in f.lower()})}")

    # 2. IS THERE A WFS ON THE SAME ENDPOINT? (the L2 premise)
    for ver in ("2.0.0", "1.1.0", "1.0.0"):
        u = f"{HOST}?service=WFS&request=GetCapabilities&version={ver}"
        c, b = get(u)
        t = show(f"WFS GetCapabilities v{ver}", u, c, b)
        if "WFS_Capabilities" in t:
            ft = re.findall(r"<(?:wfs:)?Name>([^<]+)</", t)
            print(f"    ⭐ WFS IS PRESENT. featureTypes={ft[:40]}")
            out[f"wfs_{ver}"] = ft
            break

    # 3. resultType=hits ORACLE on the EDIF layer, if WFS answered
    if any(k.startswith("wfs_") for k in out):
        for lyr in ("EDIF", "ZUSO", "CLA"):
            u = (f"{HOST}?service=WFS&version=2.0.0&request=GetFeature&"
                 f"typeNames={lyr}&resultType=hits")
            c, b = get(u)
            t = show(f"hits oracle {lyr}", u, c, b, 300)
            m = re.search(r'numberMatched="(\d+)"', t)
            if m:
                print(f"    EXACT UNCAPPED TOTAL {lyr} = {m.group(1)}")
                out[f"hits_{lyr}"] = int(m.group(1))

    # 4. GetFeatureInfo point query - the ROUTING test
    #    Known-answer control: a point in Las Palmas de Gran Canaria centre.
    #    REGCAN95 / WGS84 UTM 28N metres.
    pts = {
        "LasPalmas-Vegueta": (458300, 3108500),
        "Telde-centro":      (457000, 3097000),
        "ATLANTIC-OCEAN(negative control)": (300000, 3050000),
    }
    for tag, (x, y) in pts.items():
        bb = f"{x-50},{y-50},{x+50},{y+50}"
        u = (f"{HOST}?service=WMS&version=1.1.1&request=GetFeatureInfo&"
             f"layers=EDIF&query_layers=EDIF&srs=EPSG:32628&bbox={bb}&"
             f"width=101&height=101&x=50&y=50&info_format=application/json&"
             f"feature_count=20")
        c, b = get(u)
        t = show(f"GetFeatureInfo {tag}", u, c, b, 600)
        try:
            j = json.loads(t)
            print(f"    features={len(j.get('features', []))}")
            for f in j.get("features", [])[:3]:
                print(f"      {json.dumps(f.get('properties'), ensure_ascii=False)[:260]}")
            out[f"gfi_{tag}"] = len(j.get("features", []))
        except Exception:  # noqa: BLE001
            pass

    with open(os.path.join(DATA, "wfs_bulk.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
