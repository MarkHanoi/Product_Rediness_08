"""Derive municipal bounding boxes from Catastro's own ATOM `georss:polygon`.

A bbox typed from memory is a guess. Catastro publishes a WGS84 bounding
polygon per municipality in its INSPIRE ATOM feed, so the routing gate can be
DERIVED from the same authority that serves the parcels.

Bounds are then rounded OUTWARD, matching the existing repo convention: a
too-generous coarse gate costs one wasted round trip, a too-tight one silently
drops a real parcel.

Run:  python tools/aragon-plan-georef/municipal_bbox_from_catastro.py
Out:  tools/aragon-plan-georef/out/municipal_bboxes.json
"""

from __future__ import annotations

import json
import math
import os
import re
import ssl
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# (label, INE code, Catastro DGC code, province feed)
TARGETS = [
    ("Huesca", "22125", "22901", "22"),
    ("Zaragoza", "50297", "50900", "50"),
    ("Teruel", "44216", "44900", "44"),
]

FEED = (
    "https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/{p}/"
    "ES.SDGC.CP.atom_{p}.xml"
)


def entry_for(feed: bytes, dgc: str) -> bytes | None:
    for m in re.finditer(rb"<entry>(.*?)</entry>", feed, re.S):
        if dgc.encode() in m.group(1):
            return m.group(1)
    return None


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    results = []
    feeds: dict[str, bytes] = {}

    for label, ine, dgc, prov in TARGETS:
        rec: dict = {
            "municipality": label,
            "ine_code": ine,
            "catastro_dgc_code": dgc,
            "province": prov,
        }
        try:
            if prov not in feeds:
                url = FEED.format(p=prov)
                feeds[prov] = urllib.request.urlopen(
                    urllib.request.Request(url, headers=UA), timeout=120, context=CTX
                ).read()
            feed = feeds[prov]
        except Exception as exc:  # noqa: BLE001
            rec.update({"outcome": "UNKNOWN", "error": f"{type(exc).__name__}: {exc}"})
            results.append(rec)
            continue

        entry = entry_for(feed, dgc)
        if entry is None:
            rec.update(
                {
                    "outcome": "NOT_LISTED",
                    "why": "no ATOM entry carries this DGC code",
                }
            )
            results.append(rec)
            continue

        title = re.search(rb"<title>([^<]*)</title>", entry)
        poly = re.search(rb"<georss:polygon>([^<]+)</georss:polygon>", entry)
        crs = re.findall(rb'term="([^"]*crs[^"]*)"', entry)
        if poly is None:
            rec.update({"outcome": "NO_POLYGON", "why": "entry carries no georss bbox"})
            results.append(rec)
            continue

        vals = [float(v) for v in poly.group(1).split()]
        # georss:polygon is "lat lon lat lon ..."
        lats, lons = vals[0::2], vals[1::2]

        def out_lo(v: float) -> float:
            return math.floor(v * 100) / 100

        def out_hi(v: float) -> float:
            return math.ceil(v * 100) / 100

        rec.update(
            {
                "outcome": "MEASURED",
                "entry_title": title.group(1).decode("latin-1").strip() if title else None,
                "declared_crs": [c.decode("latin-1") for c in crs],
                "exact": {
                    "minLat": min(lats),
                    "maxLat": max(lats),
                    "minLon": min(lons),
                    "maxLon": max(lons),
                },
                "rounded_outward_2dp": {
                    "minLat": out_lo(min(lats)),
                    "maxLat": out_hi(max(lats)),
                    "minLon": out_lo(min(lons)),
                    "maxLon": out_hi(max(lons)),
                },
            }
        )
        results.append(rec)

    report = {
        "probe": "aragon-plan-georef-municipal-bboxes",
        "source": (
            "Catastro INSPIRE CadastralParcels ATOM, per-municipality "
            "georss:polygon -- the same authority that serves the parcels"
        ),
        "rounding": "outward to 2 dp; a loose coarse gate is the safe direction",
        "municipalities": results,
    }
    path = os.path.join(OUT, "municipal_bboxes.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    for r in results:
        if r["outcome"] == "MEASURED":
            b = r["rounded_outward_2dp"]
            print(
                f"{r['municipality']:10} INE {r['ine_code']} DGC {r['catastro_dgc_code']}  "
                f"lat {b['minLat']}..{b['maxLat']}  lon {b['minLon']}..{b['maxLon']}"
            )
        else:
            print(f"{r['municipality']:10} {r['outcome']}")
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
