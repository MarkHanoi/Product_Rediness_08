#!/usr/bin/env python3
"""
A3 — RESOLVE `fiab_geom`

`fiab_geom` is present on 100 % of SIUa planning records and reads "Aprobada"
on 21.8 %. Three candidate meanings, and they imply COMPLETELY DIFFERENT
regions:

    LEGAL APPROVAL STATUS   -> Aragon caps at 21.8 % regardless of everything else
    GEOMETRY QUALITY        -> a fidelity caveat, not a coverage ceiling
    DIGITISATION CONFIDENCE -> a provenance caveat, not a coverage ceiling

⛔ DO NOT GUESS BETWEEN THE THREE. This script only looks for a PUBLISHED
DEFINITION — a data dictionary, an abstract, a layer description, a field
comment. If none is found the correct output is the OPEN BLOCKER WITH ITS
CONSEQUENCE STATED, not a preferred reading.

Note the name itself is suggestive ("fiabilidad geometrica" = geometric
reliability) but ⛔ A FIELD NAME IS NOT A DEFINITION, and the value it carries
("Aprobada" = approved) pulls the other way. That tension is precisely why this
needs a source and not an inference.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

# Endpoints that could carry a field-level definition.
CANDIDATES = [
    ("SIUa WMS GetCapabilities",
     "https://idearagon.aragon.es/SIUOrdenacionWMS/wms?service=WMS&request=GetCapabilities&version=1.3.0"),
    ("SIU urbanismo WMS GetCapabilities",
     "https://idearagon.aragon.es/urbanismoWMS/wms?service=WMS&request=GetCapabilities&version=1.3.0"),
    ("IDEAragon generic WMS GetCapabilities",
     "https://idearagon.aragon.es/servicios/wms?service=WMS&request=GetCapabilities&version=1.3.0"),
    ("SITAR planeamiento WMS",
     "https://idearagon.aragon.es/PlaneamientoWMS/wms?service=WMS&request=GetCapabilities&version=1.3.0"),
    ("CSW metadata search (fiabilidad)",
     "https://idearagon.aragon.es/geonetwork/srv/spa/q?_content_type=json&any=fiabilidad"),
    ("CSW metadata search (planeamiento)",
     "https://idearagon.aragon.es/geonetwork/srv/spa/q?_content_type=json&any=planeamiento+urbanistico"),
    ("Aragon Open Data dataset search",
     "https://opendata.aragon.es/datos/api/action/package_search?q=fiab_geom"),
    ("Aragon Open Data search planeamiento",
     "https://opendata.aragon.es/datos/api/action/package_search?q=planeamiento+urbanistico"),
]

NEEDLES = ["fiab_geom", "fiabilidad", "fiab.", "aprobada", "digitaliz", "precision",
           "precisión", "exactitud", "calidad geometrica", "calidad geométrica"]


def fetch(url: str) -> tuple[int, str, str | None]:
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, r.read().decode("utf-8", errors="replace"), None
    except urllib.error.HTTPError as e:
        return e.code, "", f"HTTPError {e.code} {e.reason}"
    except Exception as e:  # noqa: BLE001
        return 0, "", f"{type(e).__name__}: {e}"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    findings = []

    print("=" * 78)
    print("A3 — SEARCHING FOR A PUBLISHED DEFINITION OF `fiab_geom`")
    print("=" * 78)

    for name, url in CANDIDATES:
        status, body, err = fetch(url)
        rec = {"source": name, "url": url, "http_status": status,
               "error": err, "bytes": len(body), "hits": {}}
        print(f"\n[{status}] {name}")
        if err:
            print(f"    {err}")
            findings.append(rec)
            continue
        print(f"    {len(body)} bytes")

        low = body.lower()
        for n in NEEDLES:
            c = low.count(n.lower())
            if c:
                rec["hits"][n] = c
                # show context for the decisive ones
                if n in ("fiab_geom", "fiabilidad"):
                    for m in list(re.finditer(re.escape(n.lower()), low))[:4]:
                        ctx = re.sub(r"\s+", " ",
                                     body[max(0, m.start() - 220): m.end() + 320])
                        print(f"    >>> {n}: {ctx[:520]}")
        if rec["hits"]:
            print(f"    HITS: {rec['hits']}")
        else:
            print("    no needle hits")

        safe = re.sub(r"[^a-z0-9]+", "_", name.lower())[:50]
        with open(os.path.join(OUT, f"fiab_{safe}.txt"), "w", encoding="utf-8") as fh:
            fh.write(body[:400000])
        findings.append(rec)

    with open(os.path.join(OUT, "fiab_geom_probe.json"), "w", encoding="utf-8") as fh:
        json.dump(findings, fh, indent=2, ensure_ascii=False)

    resolved = any(r["hits"].get("fiab_geom") for r in findings)
    print("\n" + "=" * 78)
    if resolved:
        print("fiab_geom MENTIONED in a served document — read the context above "
              "and decide ONLY from the quoted text.")
    else:
        print("NO PUBLISHED DEFINITION FOUND IN THESE ENDPOINTS.")
        print("VERDICT: `fiab_geom` remains UNKNOWN -> OPEN BLOCKER.")
        print("CONSEQUENCE, STATED: if it means LEGAL APPROVAL STATUS, Aragon "
              "caps at 21.8 % regardless of everything else.")
    print("=" * 78)


if __name__ == "__main__":
    main()
