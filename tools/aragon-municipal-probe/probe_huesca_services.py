#!/usr/bin/env python3
"""
probe_huesca_services.py -- is there a MUNICIPAL service behind GeoInfoHuesca?

Huesca publishes plano nº5 (alineaciones + linea de fondo edificable, 1:1.000,
28 hojas) as VECTOR PDF -- proven by probe_huesca_plano5.py. The open question is
whether the same content is also served as DATA (SHP / DXF / GPKG / WFS), which
would remove the georeferencing problem entirely.

METHOD GUARDS:
  * PATH SHAPE. Aragon's own 404s were `fichaDescarga/` read as a DIRECTORY when
    it is a FILE PREFIX -- the resource existed all along. So probe both shapes.
  * VERSION LADDER. HTTP 200 beats HTTP 500 on a proxied OGC service: try WFS
    1.0.0 / 1.1.0 / 2.0.0 and WMS 1.1.1 / 1.3.0, never only the modern default.
  * ⛔ A TIMEOUT IS NOT A 404. Connection failures are recorded as UNREACHABLE
    (unknown), never as ABSENT. UNKNOWN NEVER NO.
"""
from __future__ import annotations

import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# sig.huesca.es and idehuesca.es do not resolve -- recorded, then dropped.
HOSTS = ["gis.huesca.es", "www.huesca.es"]
FAST_TIMEOUT = 8  # a municipal GIS that will answer, answers fast

# Both path SHAPES: as a directory, and as a file prefix.
OGC_PATHS = [
    "/geoserver/wfs", "/geoserver/ows", "/geoserver/wms",
    "/geoserver/huesca/wfs", "/geoserver/urbanismo/wfs",
    "/wfs", "/wms", "/ows", "/cgi-bin/mapserv",
    "/arcgis/rest/services", "/server/rest/services",
    "/arcgis/rest/services?f=json", "/server/rest/services?f=json",
]

BARE = ["/", "/GEOINFOHUESCA/", "/geoinfohuesca/", "/PLANEAMIENTO/", "/PGOU/",
        "/URBANISMO/", "/ITE/", "/BARRIOS/", "/ZONAZUL/"]

LADDER = [("WFS", "2.0.0"), ("WFS", "1.1.0"), ("WFS", "1.0.0"),
          ("WMS", "1.3.0"), ("WMS", "1.1.1")]


def probe(url: str, timeout: int = 20) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(400000)
            return {"http": r.getcode(), "bytes": len(body),
                    "ctype": r.headers.get("Content-Type", ""),
                    "ms": int((time.time() - t0) * 1000),
                    "head": body[:180].decode("latin-1", "replace"),
                    "state": "REACHED"}
    except urllib.error.HTTPError as e:
        return {"http": e.code, "bytes": 0, "ms": int((time.time() - t0) * 1000),
                "state": "REACHED"}
    except (socket.timeout, TimeoutError):
        # ⛔ NOT a 404. The service may exist and be firewalled from here.
        return {"http": None, "state": "UNREACHABLE_TIMEOUT",
                "ms": int((time.time() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001
        return {"http": None, "state": f"UNREACHABLE_{type(e).__name__}",
                "detail": str(e)[:160], "ms": int((time.time() - t0) * 1000)}


def dns(host: str) -> dict:
    try:
        return {"resolves": True, "addrs": sorted({a[4][0] for a in
                                                   socket.getaddrinfo(host, 443)})}
    except Exception as e:  # noqa: BLE001
        return {"resolves": False, "error": f"{type(e).__name__}: {e}"}


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    results: dict = {}
    for h in HOSTS:
        d = dns(h)
        results[h] = {"dns": d, "probes": []}
        print(f"== {h}  dns={d}")
        if not d["resolves"]:
            continue
        for path in BARE + OGC_PATHS:
            url = f"https://{h}{path}"
            r = probe(url, timeout=FAST_TIMEOUT)
            r["url"] = url
            results[h]["probes"].append(r)
            print(f"   {path:34} {r.get('state'):24} http={r.get('http')}")
        # version ladder ONLY on paths that actually REACHED -- hammering a
        # dead host through the whole ladder buys nothing and costs minutes.
        reached = {r["url"] for r in results[h]["probes"]
                   if r.get("state") == "REACHED"}
        for path in OGC_PATHS:
            base = f"https://{h}{path}"
            if "?" in base or "rest" in base or base not in reached:
                continue
            for svc, ver in LADDER:
                url = base + "?" + urllib.parse.urlencode(
                    {"service": svc, "version": ver, "request": "GetCapabilities"})
                r = probe(url, timeout=FAST_TIMEOUT)
                if r.get("http") == 200 and r.get("bytes", 0) > 800:
                    names = re.findall(rb"<Name>([^<]+)</Name>",
                                       (r.get("head") or "").encode("latin-1"))
                    r.update({"url": url, "LADDER_HIT": True,
                              "service": svc, "version": ver})
                    results[h]["probes"].append(r)
                    print(f"   LADDER HIT {svc} {ver} -> {url}")

    payload = {
        "probe": "huesca-municipal-service-discovery",
        "when": time.strftime("%Y-%m-%d"),
        "note": ("UNREACHABLE != ABSENT. A timeout from this network is an UNKNOWN, "
                 "not a negative. Only an HTTP status is evidence about the resource."),
        "hosts": results,
    }
    with open(os.path.join(OUT, "huesca_services_probe.json"), "w",
              encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print("\nwrote out/huesca_services_probe.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
