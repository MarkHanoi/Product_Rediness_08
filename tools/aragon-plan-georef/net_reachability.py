"""Step 0 of the georeference probe: WHICH SOURCES ANSWER, AND WITH WHAT.

Ship the probe first. Every downstream claim in this directory depends on a
source being *reachable*, and the single most expensive mistake in this repo's
history of jurisdiction work is reading UNREACHABLE as ABSENT. So before any
geometry is touched, this records an HTTP STATUS for every source, and marks
anything that did not produce a status as UNKNOWN -- never as empty.

Run:  python tools/aragon-plan-georef/net_reachability.py
Out:  tools/aragon-plan-georef/out/net_reachability.json
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept": "*/*",
}

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# (id, url, what a 200 would prove)
SOURCES = [
    (
        "huesca-plano5-H-01",
        "https://www.huesca.es/documents/33451/300865/"
        "05+Calificacion+del+Suelo+Urbano+H-01.pdf/"
        "db40abac-6f90-7808-833f-a109f527dec0?t=1552033978540",
        "the plan sheet itself is retrievable",
    ),
    (
        "catastro-inspire-cp-getcapabilities",
        "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx"
        "?service=WFS&request=GetCapabilities",
        "the INDEPENDENT verification source (cadastral parcels) is live",
    ),
    (
        "catastro-inspire-cp-declared-crs",
        "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx"
        "?service=WFS&version=2.0.0&request=DescribeFeatureType"
        "&typenames=cp:CadastralParcel",
        "the parcel schema is published",
    ),
    (
        "idearagon-wfs-getcapabilities",
        "https://idearagon.aragon.es/geoserver/ows"
        "?service=WFS&version=2.0.0&request=GetCapabilities",
        "the regional Aragon OGC endpoint answers",
    ),
    (
        "idezar-wfs-getcapabilities",
        "https://idezar.zaragoza.es/geoserver/urbanismo/ows"
        "?service=WFS&version=2.0.0&request=GetCapabilities",
        "Zaragoza municipal zoning is live (already measured; re-confirmed here)",
    ),
    (
        "gis-huesca",
        "https://gis.huesca.es/",
        "the Huesca municipal GIS -- previously UNREACHABLE, retested",
    ),
]


def probe(source_id: str, url: str, proves: str) -> dict:
    rec = {"id": source_id, "url": url, "a_200_would_prove": proves}
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
            body = resp.read(2048)
            rec.update(
                {
                    "outcome": "STATUS",
                    "http": resp.status,
                    "content_type": resp.headers.get("Content-Type"),
                    "content_length": resp.headers.get("Content-Length"),
                    "first_bytes": repr(body[:48]),
                }
            )
    except urllib.error.HTTPError as exc:
        # An HTTP status IS evidence about the resource.
        rec.update({"outcome": "STATUS", "http": exc.code, "reason": str(exc.reason)})
    except Exception as exc:  # noqa: BLE001 - transport failure is the point
        # NO status was obtained. This is UNKNOWN. It is NOT "the data is absent".
        rec.update(
            {
                "outcome": "UNKNOWN",
                "http": None,
                "error_class": type(exc).__name__,
                "error": str(exc),
                "why_not_absent": (
                    "no HTTP status was returned, so nothing was learned about "
                    "whether the resource exists"
                ),
            }
        )
    return rec


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    results = [probe(*s) for s in SOURCES]
    report = {
        "probe": "aragon-plan-georef-step0-reachability",
        "rule": (
            "outcome=STATUS means the network answered and the status is evidence. "
            "outcome=UNKNOWN means no status was obtained -- that is NOT 'empty'."
        ),
        "counts": {
            "STATUS": sum(1 for r in results if r["outcome"] == "STATUS"),
            "UNKNOWN": sum(1 for r in results if r["outcome"] == "UNKNOWN"),
        },
        "sources": results,
    }
    path = os.path.join(OUT, "net_reachability.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    for r in results:
        print(f"{r['outcome']:8} http={r.get('http')!s:6} {r['id']}")
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
