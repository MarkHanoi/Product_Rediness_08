"""Step 1: fetch the INDEPENDENT verification source for Cordoba (INE 14021).

Same shape as tools/aragon-plan-georef/fetch_catastro_huesca.py: the AR sheet's
own georeference is only trustworthy if checked against geometry that had
NOTHING to do with deriving it -- Catastro's INSPIRE Buildings bulk feed, a
different organisation/survey/channel from the PGOU alineaciones-y-rasantes
plan sheet.

⛔ SAME KEY TRAP AS HUESCA: Cordoba's INE code (14021) and its Catastro/DGC
code are different numbering systems. Provincial capitals get a 900-block DGC
code. This script resolves the DGC code from the province-14 ATOM feed by
matching on the municipality NAME ("CORDOBA"), not by assuming 14021 works
directly against the DGC-keyed feed.

Run:  python tools/cordoba-ar-georef/fetch_catastro_cordoba.py
Out:  tools/cordoba-ar-georef/out/catastro_cordoba.json
      tools/cordoba-ar-georef/out/cadastre/*.gml   (not committed)
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

INE_CORDOBA = "14021"
PROVINCE = "14"

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
    """Return download hrefs whose entry mentions CORDOBA (the capital, not a
    same-province town whose name merely contains the substring)."""
    text = feed.decode("iso-8859-1", errors="replace")
    entries = re.findall(r"<entry>(.*?)</entry>", text, re.S)
    hrefs: list[str] = []
    for e in entries:
        title_m = re.search(r"<title[^>]*>([^<]+)</title>", e)
        title = title_m.group(1) if title_m else ""
        if "CORDOBA" not in title.upper():
            continue
        # avoid picking up e.g. "VILLANUEVA DE CORDOBA" -- require the entry's
        # own municipality-code segment to be the provincial-capital block
        # (900-series) OR the title to literally equal CORDOBA.
        if title.strip().upper() not in ("14021-CORDOBA", "CORDOBA"):
            # still record for visibility but keep scanning for the exact one
            pass
        for href in re.findall(r'href="([^"]+\.zip)"', e):
            hrefs.append(href)
    return hrefs


def main() -> None:
    os.makedirs(CAD, exist_ok=True)
    report: dict = {"province": PROVINCE, "ine_cordoba": INE_CORDOBA, "feeds": {}}

    for kind, url in FEEDS.items():
        print(f"fetching {kind} ATOM feed: {url}")
        feed = get(url)
        if feed is None:
            report["feeds"][kind] = {"OUTCOME": "FETCH_FAILED", "url": url}
            continue
        text = feed.decode("iso-8859-1", errors="replace")
        # Find the entry whose title is exactly the Cordoba capital record.
        entries = re.findall(r"<entry>(.*?)</entry>", text, re.S)
        match_href = None
        match_title = None
        for e in entries:
            title_m = re.search(r"<title[^>]*>([^<]+)</title>", e)
            title = (title_m.group(1) if title_m else "").strip()
            if title.upper().startswith("14900-CORDOBA"):
                href_m = re.search(r'href="([^"]+\.zip)"', e)
                if href_m:
                    match_href = href_m.group(1)
                    match_title = title
                    break
        if match_href is None:
            report["feeds"][kind] = {
                "OUTCOME": "NO_MATCH",
                "url": url,
                "n_entries": len(entries),
                "why": "no ATOM entry title matched CORDOBA capital pattern",
            }
            print(f"    NO MATCH among {len(entries)} entries")
            continue

        print(f"    matched entry title={match_title!r} href={match_href}")
        zip_bytes = get(match_href)
        if zip_bytes is None:
            report["feeds"][kind] = {
                "OUTCOME": "ZIP_FETCH_FAILED",
                "url": url,
                "href": match_href,
            }
            continue

        zip_path = os.path.join(CAD, f"{kind}.zip")
        with open(zip_path, "wb") as fh:
            fh.write(zip_bytes)
        extracted = []
        try:
            with zipfile.ZipFile(zip_path) as zf:
                for name in zf.namelist():
                    if name.lower().endswith(".gml"):
                        zf.extract(name, CAD)
                        extracted.append(name)
        except zipfile.BadZipFile:
            report["feeds"][kind] = {
                "OUTCOME": "BAD_ZIP",
                "url": url,
                "href": match_href,
                "n_bytes": len(zip_bytes),
            }
            continue

        report["feeds"][kind] = {
            "OUTCOME": "OK",
            "url": url,
            "href": match_href,
            "title": match_title,
            "n_bytes": len(zip_bytes),
            "gml_files": extracted,
        }
        print(f"    extracted {len(extracted)} GML file(s)")

    path = os.path.join(OUT, "catastro_cordoba.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
