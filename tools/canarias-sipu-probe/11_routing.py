#!/usr/bin/env python3
"""C3 - IS `R` REAL? Envelope = Geometry( P( R(parcel) ) ). Score R separately.

Tests whether a PARCEL resolves to a UNIQUE governing instrument through the
GeoBDP / IDECanarias planning services.

METHOD GUARDS APPLIED (all seven negative-proof conditions):
  browser UA (geobdp is robots-disallowed to crawlers - a robots block is
  UNKNOWN, never absence) - axis order - CRS family - alternate
  parameterisation - attribute filter never bbox - PATH SHAPE - code-space
  truncation (5-digit INE vs 3-digit truncated).
  AND the SEVENTH: a filter is only believed when a KNOWN-IMPOSSIBLE value
  returns ZERO. A successful response is not an applied filter.
  AND: read the WHOLE error string before concluding a capability is absent.
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

CANDIDATES = [
    ("geobdp-root", "https://geobdp.grafcan.es/"),
    ("geobdp-api", "https://geobdp.grafcan.es/api/"),
    ("idecan-wms-planeamiento",
     "https://idecan1.grafcan.es/ServicioWMS/Planeamiento?service=WMS&"
     "request=GetCapabilities&version=1.3.0"),
    ("idecan-wfs-planeamiento",
     "https://idecan1.grafcan.es/ServicioWMS/Planeamiento?service=WFS&"
     "request=GetCapabilities&version=2.0.0"),
    ("idecan2-wms",
     "https://idecan2.grafcan.es/ServicioWMS/Planeamiento?service=WMS&"
     "request=GetCapabilities&version=1.3.0"),
    ("grafcan-geoserver-wfs",
     "https://services.grafcan.es/geoserver/wfs?service=WFS&"
     "request=GetCapabilities&version=2.0.0"),
    ("sitcan-geoserver",
     "https://opendata.sitcan.es/geoserver/wfs?service=WFS&"
     "request=GetCapabilities"),
    ("visor-geobdp", "https://visor.grafcan.es/visorweb/"),
]


def get(url, timeout=45):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/xml,application/xml,application/json,*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return r.status, r.headers.get("Content-Type", ""), body
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", "") if e.headers else "", \
            e.read()[:4000]
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}", str(e).encode()


def main():
    os.makedirs(DATA, exist_ok=True)
    results = []
    for name, url in CANDIDATES:
        code, ct, body = get(url)
        rec = {"name": name, "url": url, "http": code, "ct": ct,
               "bytes": len(body or b"")}
        txt = (body or b"").decode("utf-8", "replace")
        # ⛔ READ THE WHOLE ERROR STRING before concluding absence
        if re.search(r"ServiceException|ExceptionReport|<ows:Exception", txt):
            rec["exception"] = re.sub(r"\s+", " ", txt)[:600]
        if "WFS_Capabilities" in txt or "wfs:WFS_Capabilities" in txt:
            rec["kind"] = "WFS"
            rec["layers"] = re.findall(r"<(?:wfs:)?Name>([^<]+)</", txt)[:400]
        elif "WMS_Capabilities" in txt or "<WMT_MS_Capabilities" in txt:
            rec["kind"] = "WMS"
            rec["layers"] = re.findall(r"<Name>([^<]+)</Name>", txt)[:400]
        else:
            rec["kind"] = "other"
            rec["head"] = re.sub(r"\s+", " ", txt)[:300]
        results.append(rec)
        print(f"{name:<26} http={code} kind={rec['kind']:<6} "
              f"bytes={rec['bytes']:<8} layers={len(rec.get('layers') or [])}")
        if rec.get("exception"):
            print(f"   EXCEPTION (full): {rec['exception'][:300]}")
        if rec.get("layers"):
            print(f"   sample layers: {rec['layers'][:12]}")
        if rec.get("head") and code:
            print(f"   head: {rec['head'][:160]}")
    with open(os.path.join(DATA, "routing.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print("\nWROTE routing.json")


if __name__ == "__main__":
    sys.exit(main())
