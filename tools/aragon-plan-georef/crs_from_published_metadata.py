"""Step 2: ESTABLISH THE CRS FROM PUBLISHED METADATA -- NOT FROM A FIT.

Guessing "it's Spain, so 25830" and then eyeballing a fit that looks plausible
is how a wrong datum survives review: a fit can be made to look good in the
wrong CRS by absorbing the error into the translation. So the EPSG code is
taken from what the data publishers DECLARE, and from two INDEPENDENT
publishers, before any geometry is transformed.

  source A  Catastro (Direccion General del Catastro) INSPIRE services -- the
            national cadastre. This is also the INDEPENDENT VERIFICATION
            source in step 4, so its declared CRS is the one that matters most.
  source B  IDEAragon -- the autonomous community's own SDI, a different
            organisation publishing over the same ground.

Agreement between two independent publishers is the bar. Disagreement is a
finding, not something to average.

Run:  python tools/aragon-plan-georef/crs_from_published_metadata.py
Out:  tools/aragon-plan-georef/out/crs_declared.json
"""

from __future__ import annotations

import json
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

SOURCES = [
    (
        "A-catastro-inspire-cp-wfs",
        "Direccion General del Catastro (national cadastre)",
        "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx"
        "?service=WFS&version=2.0.0&request=GetCapabilities",
    ),
    (
        "A2-catastro-inspire-bu-wfs",
        "Direccion General del Catastro (buildings)",
        "https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx"
        "?service=WFS&version=2.0.0&request=GetCapabilities",
    ),
    (
        "B-idearagon-wfs",
        "IDEAragon -- Gobierno de Aragon SDI",
        "https://idearagon.aragon.es/geoserver/ows"
        "?service=WFS&version=2.0.0&request=GetCapabilities",
    ),
    (
        "B2-idearagon-wms",
        "IDEAragon WMS",
        "https://idearagon.aragon.es/Cartografia_Basica_wms/wms.aspx"
        "?service=WMS&version=1.3.0&request=GetCapabilities",
    ),
]

CRS_RE = re.compile(
    rb"(?:urn:ogc:def:crs:EPSG:{0,2}[^ <\"]*?|EPSG:{1,2})[:/]?(\d{4,5})", re.I
)


def fetch(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=90, context=CTX) as resp:
            return resp.read()
    except Exception as exc:  # noqa: BLE001
        print(f"    UNREACHABLE {type(exc).__name__}: {exc}")
        return None


def analyse(source_id: str, publisher: str, url: str) -> dict:
    body = fetch(url)
    if body is None:
        return {
            "id": source_id,
            "publisher": publisher,
            "url": url,
            "outcome": "UNKNOWN",
            "why": "no response; nothing learned about the declared CRS",
        }

    counts: dict[str, int] = {}
    for m in CRS_RE.finditer(body):
        code = m.group(1).decode()
        counts[code] = counts.get(code, 0) + 1

    # DefaultCRS / DefaultSRS is the DECLARATIVE field -- far stronger evidence
    # than a bare mention of an EPSG code anywhere in the document.
    default = {}
    for tag in (b"DefaultCRS", b"DefaultSRS", b"defaultCRS"):
        for m in re.finditer(
            rb"<[^>]*" + tag + rb"[^>]*>([^<]+)<", body, re.I
        ):
            val = m.group(1).decode(errors="replace").strip()
            default[val] = default.get(val, 0) + 1

    # verbatim evidence line -- the quote that backs the claim
    quote = None
    m = re.search(rb"<[^>]*(?:DefaultCRS|DefaultSRS)[^>]*>[^<]+<[^>]*>", body, re.I)
    if m:
        quote = m.group(0).decode(errors="replace")

    top = sorted(counts.items(), key=lambda kv: -kv[1])[:8]
    return {
        "id": source_id,
        "publisher": publisher,
        "url": url,
        "outcome": "MEASURED",
        "bytes": len(body),
        "declared_default_crs": default,
        "verbatim_declaration": quote,
        "epsg_mention_counts_top8": dict(top),
    }


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    results = []
    for sid, pub, url in SOURCES:
        print(f"  {sid} ...")
        results.append(analyse(sid, pub, url))

    # What did the publishers actually DECLARE as default?
    declared = {}
    for r in results:
        for k, v in (r.get("declared_default_crs") or {}).items():
            declared[k] = declared.get(k, 0) + v

    report = {
        "probe": "aragon-plan-georef-step2-crs-from-published-metadata",
        "rule": (
            "the EPSG code is taken from publisher DECLARATIONS "
            "(DefaultCRS/DefaultSRS in GetCapabilities), never from how good a "
            "fit looks. Two independent publishers must agree."
        ),
        "legal_basis": {
            "instrument": "Real Decreto 1071/2007, de 27 de julio",
            "what_it_establishes": (
                "ETRS89 as the official geodetic reference system for Spain "
                "(peninsula and Baleares), projected UTM. Aragon lies in UTM "
                "zone 30N -> ETRS89 / UTM 30N."
            ),
            "note": (
                "This is the LEGAL basis. It is recorded because it explains "
                "WHY the publishers agree; it is NOT used in place of their "
                "declarations."
            ),
        },
        "declared_default_crs_union": declared,
        "sources": results,
    }
    path = os.path.join(OUT, "crs_declared.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    for r in results:
        print(
            f"{r['outcome']:9} {r['id']:32} default={r.get('declared_default_crs')}"
        )
    print(f"\nunion of declared defaults: {declared}")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
