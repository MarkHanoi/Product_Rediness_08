"""Step 3: FETCH THE INDEPENDENT VERIFICATION SOURCE.

The georeference is only trustworthy if it is checked against geometry that had
NOTHING to do with deriving it. That source is the national cadastre's INSPIRE
bulk download for the municipality of Huesca (INE 22125) -- a different
organisation, a different survey, a different delivery channel from the PGOU
plan sheet.

The GML also carries its own `srsName`, which is a THIRD declaration of the CRS
and comes from the data file itself rather than from a capabilities document.

Run:  python tools/aragon-plan-georef/fetch_catastro_huesca.py
Out:  tools/aragon-plan-georef/out/catastro_huesca.json
      tools/aragon-plan-georef/out/cadastre/*.gml   (not committed)
"""

from __future__ import annotations

import json
import os
import re
import ssl
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CAD = os.path.join(OUT, "cadastre")

# ⛔ THE KEY TRAP, AND IT GENERALISES TO EVERY SPANISH PROVINCIAL CAPITAL.
#
# Huesca's INE municipality code is 22125. Its CATASTRO (DGC) code is 22901.
# They are different numbering systems and Catastro's INSPIRE bulk feeds are
# keyed on the DGC code, which assigns provincial capitals a 900-block number.
# The province-22 feed lists 202 municipalities, codes 22001..22901, and
# **22125 is not among them**.
#
# Keying the download on the INE code therefore produced a feed that answered
# HTTP 200 and matched ZERO entries -- which reads exactly like "the cadastre
# does not cover Huesca". It is a KEY error, not a coverage fact. Any Spanish
# pipeline that keys Catastro bulk downloads on INE codes silently loses every
# provincial capital -- i.e. precisely the cities that matter.
INE_HUESCA = "22125"           # INE -- the code the rest of PRYZM routes on
CATASTRO_HUESCA = "22901"      # DGC -- the code THIS service is keyed on
PROVINCE = "22"

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

FEEDS = {
    "buildings": f"https://www.catastro.hacienda.gob.es/INSPIRE/buildings/{PROVINCE}"
    f"/ES.SDGC.BU.atom_{PROVINCE}.xml",
    "parcels": f"https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/{PROVINCE}"
    f"/ES.SDGC.CP.atom_{PROVINCE}.xml",
}


def get(url: str, timeout: int = 300) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            return resp.read()
    except Exception as exc:  # noqa: BLE001
        print(f"    FAIL {type(exc).__name__}: {exc}  ({url})")
        return None


def pick_municipality(feed: bytes) -> list[str]:
    """Return download hrefs whose entry mentions the Huesca INE code.

    ⚠ The feed is declared ISO-8859-1 and the hrefs embed the municipality NAME
    (".../22125-HUESCA/A.ES.SDGC.CP.22125.zip"), so they contain spaces and
    accented bytes. Matching on the INE code alone is deliberate -- the name is
    not a stable key.
    """
    hrefs = re.findall(rb'href="([^"]+\.zip)"', feed, re.I)
    return [h.decode("latin-1") for h in hrefs if CATASTRO_HUESCA.encode() in h]


def declared_crs_for(feed: bytes, ine: str) -> dict:
    """The per-municipality CRS the ATOM entry DECLARES.

    ⛔ DO NOT ASSUME 25830 FOR ALL OF ARAGON. Huesca *province* straddles the
    UTM zone 30/31 boundary at 0 deg longitude, and this feed really does
    declare EPSG:25831 for its eastern municipalities. The city of Huesca sits
    west of the meridian, but that is a reason to CHECK the declaration, not to
    skip it.
    """
    out: dict = {"entry_found": False, "declared": {}}
    for m in re.finditer(rb"<entry>(.*?)</entry>", feed, re.S):
        block = m.group(1)
        if ine.encode() not in block:
            continue
        out["entry_found"] = True
        title = re.search(rb"<title>([^<]*)</title>", block)
        if title:
            out["entry_title"] = title.group(1).decode("latin-1").strip()
        for c in re.finditer(rb'term="([^"]*crs[^"]*)"[^>]*label="([^"]*)"', block, re.I):
            out["declared"][c.group(1).decode("latin-1")] = c.group(2).decode("latin-1")
        break
    return out


def main() -> None:
    os.makedirs(CAD, exist_ok=True)
    report: dict = {
        "probe": "aragon-plan-georef-step3-independent-source",
        "municipality": {
            "name": "Huesca",
            "ine_code": INE_HUESCA,
            "catastro_dgc_code": CATASTRO_HUESCA,
            "province": PROVINCE,
            "KEY_TRAP": (
                "Catastro bulk feeds are keyed on the DGC code (22901), NOT the "
                "INE code (22125). Keying on INE returns HTTP 200 and ZERO "
                "matches -- indistinguishable from absent coverage. Generalises "
                "to every Spanish provincial capital."
            ),
        },
        "layers": {},
    }

    for layer, feed_url in FEEDS.items():
        print(f"{layer}: feed {feed_url}")
        feed = get(feed_url, timeout=120)
        if feed is None:
            report["layers"][layer] = {
                "outcome": "UNKNOWN",
                "why": "province ATOM feed unreachable; nothing learned",
                "feed": feed_url,
            }
            continue
        hits = pick_municipality(feed)
        crs_decl = declared_crs_for(feed, CATASTRO_HUESCA)
        print(f"    entries matching DGC {CATASTRO_HUESCA}: {hits}")
        print(f"    ATOM-declared CRS for {CATASTRO_HUESCA}: {crs_decl}")
        report.setdefault("declared_crs_per_layer", {})[layer] = crs_decl
        if not hits:
            report["layers"][layer] = {
                "outcome": "NOT_LISTED",
                "why": "feed answered but lists no municipality zip for this INE",
                "feed": feed_url,
                "zips_in_feed": len(re.findall(rb'\.zip"', feed)),
            }
            continue

        url = hits[0]
        if not url.startswith("http"):
            base = feed_url.rsplit("/", 1)[0]
            url = f"{base}/{url.lstrip('./')}"
        zpath = os.path.join(CAD, f"{layer}_{CATASTRO_HUESCA}.zip")
        if not os.path.exists(zpath):
            print(f"    downloading {url}")
            data = get(url, timeout=600)
            if data is None:
                report["layers"][layer] = {
                    "outcome": "UNKNOWN",
                    "why": "zip unreachable",
                    "url": url,
                }
                continue
            with open(zpath, "wb") as fh:
                fh.write(data)

        names, srs = [], {}
        with zipfile.ZipFile(zpath) as zf:
            for n in zf.namelist():
                names.append(n)
                if not n.lower().endswith((".gml", ".xml")):
                    continue
                target = os.path.join(CAD, os.path.basename(n))
                if not os.path.exists(target):
                    with zf.open(n) as src, open(target, "wb") as dst:
                        while True:
                            chunk = src.read(1 << 20)
                            if not chunk:
                                break
                            dst.write(chunk)
                with open(target, "rb") as fh:
                    head = fh.read(600_000)
                for m in re.finditer(rb'srsName="([^"]+)"', head):
                    v = m.group(1).decode()
                    srs[v] = srs.get(v, 0) + 1

        report["layers"][layer] = {
            "outcome": "MEASURED",
            "url": url,
            "zip_bytes": os.path.getsize(zpath),
            "members": names,
            "srsName_declared_in_gml": srs,
        }
        print(f"    srsName in GML: {srs}")

    path = os.path.join(OUT, "catastro_huesca.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
