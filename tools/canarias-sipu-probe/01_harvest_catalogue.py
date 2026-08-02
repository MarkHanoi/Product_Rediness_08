#!/usr/bin/env python3
"""C1 step 0 - harvest the full SIPU resource catalogue from opendata.sitcan.es (CKAN).

The brief's literal URLs (opendata.sitcan.es/.../940609_pgo_ad_itpu-...zip) are a
PATH-SHAPE ERROR -> 404. The real shape is
  /dataset/<pkg-uuid>/resource/<res-uuid>/download/<filename>.zip
Same class of failure as the Aragon fichaDescarga_<code>.html case.

Writes .data/catalogue.json  (list of {municipality, instrument, url, format})
"""
import json
import os
import sys
import time
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
BASE = "https://opendata.sitcan.es/api/3/action"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    os.makedirs(DATA, exist_ok=True)
    rows = []
    offset = 0
    page = 200
    while True:
        u = (f"{BASE}/resource_search?query=format:SIPU"
             f"&limit={page}&offset={offset}")
        d = get(u)
        res = d["result"]
        got = res.get("results", [])
        total = res.get("count")
        for x in got:
            rows.append({
                "res_id": x.get("id"),
                "pkg_id": x.get("package_id"),
                "name": x.get("name"),
                "url": x.get("url"),
                "format": x.get("format"),
                "size": x.get("size"),
                "created": x.get("created"),
            })
        print(f"offset={offset} got={len(got)} total={total} acc={len(rows)}",
              file=sys.stderr)
        offset += page
        if not got or offset >= (total or 0):
            break
        time.sleep(0.3)

    # resolve package titles (municipality) for the packages we touched
    pkgs = sorted({r["pkg_id"] for r in rows if r.get("pkg_id")})
    titles = {}
    for i, p in enumerate(pkgs):
        try:
            d = get(f"{BASE}/package_show?id={p}")
            titles[p] = d["result"].get("title")
        except Exception as e:  # noqa: BLE001
            titles[p] = f"<ERR {e}>"
        if i % 20 == 0:
            print(f"pkg {i}/{len(pkgs)}", file=sys.stderr)
        time.sleep(0.1)
    for r in rows:
        r["municipality"] = titles.get(r.get("pkg_id"))

    out = os.path.join(DATA, "catalogue.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f"WROTE {out}  rows={len(rows)}  packages={len(pkgs)}")


if __name__ == "__main__":
    main()
