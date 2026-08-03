"""Step 1: DOES THE PLAN SHEET PUBLISH ITS OWN GEOREFERENCE AND ITS OWN LEGEND?

The prior run concluded "(a) NO GEOREFERENCE -- the PDF carries no CRS" and
"(b) THE LEGEND IS NOT MACHINE-READABLE". Both conclusions were drawn from the
*content stream* (paths, fonts, images). Neither was tested against the two
places a CAD plot actually records that information:

  /VP -> /Measure -> /Subtype /GEO     the OGC/ISO-32000-2 geospatial viewport.
                                       Carries /GPTS (geographic corner points),
                                       /LPTS (the same corners in page space)
                                       and a /GCS or /PCS with an /EPSG code.
                                       THIS IS PUBLISHED METADATA, not a fit.

  /OCProperties -> /OCGs -> /Name      Optional Content Groups. An AutoCAD or
                                       ArcGIS plot preserves the DRAFTSMAN'S OWN
                                       LAYER NAMES here as PDF text strings --
                                       readable even when every glyph on the
                                       sheet is outlined vector. The layer name
                                       IS the legend, authored by the plan's
                                       author.

Absence here is a real finding; presence closes both blockers at once.

>> ENCODING. PDF text strings are PDFDocEncoding (a cp1252 relative) unless they
   open with the UTF-16BE BOM \xfe\xff. Decoding these as UTF-8 is exactly the
   trap that scored `altura maxima` at ZERO against 35 real occurrences. This
   probe decodes by declared BOM first, then by trial, and RECORDS WHICH
   ENCODING WON for every string it returns.

Run:  python tools/aragon-plan-georef/pdf_metadata_probe.py
Out:  tools/aragon-plan-georef/out/plano5_metadata.json
"""

from __future__ import annotations

import json
import os
import re
import ssl
import urllib.request
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

SHEETS = {
    "H-01": "https://www.huesca.es/documents/33451/300865/"
    "05+Calificacion+del+Suelo+Urbano+H-01.pdf/"
    "db40abac-6f90-7808-833f-a109f527dec0?t=1552033978540",
    "H-05": "https://www.huesca.es/documents/33451/300865/"
    "05+Calificacion+del+Suelo+Urbano+H-05.pdf/"
    "1d520327-42b7-708e-8958-59be50dd8427?t=1552033986499",
    "H-13": "https://www.huesca.es/documents/33451/300865/"
    "05+Calificacion+del+Suelo+Urbano+H-13.pdf/"
    "dd34684d-4346-a10e-c69c-72493272a0f1?t=1552034007875",
}


# ── ENCODING: decode by evidence, never by assumption ────────────────────────
def decode_pdf_string(raw: bytes) -> dict:
    """Return {'text', 'encoding', 'replacement_chars'} -- encoding RECORDED."""
    if raw[:2] == b"\xfe\xff":
        return {
            "text": raw[2:].decode("utf-16-be", errors="replace"),
            "encoding": "UTF-16BE (declared by BOM)",
            "replacement_chars": 0,
        }
    # Trial order matters: utf-8 first because a true utf-8 string must decode
    # strictly; if it does NOT, cp1252/latin-1 is the answer, and cp1252 never
    # raises on the bytes that matter here.
    try:
        return {
            "text": raw.decode("utf-8"),
            "encoding": "UTF-8 (strict decode succeeded)",
            "replacement_chars": 0,
        }
    except UnicodeDecodeError:
        pass
    txt = raw.decode("cp1252", errors="replace")
    return {
        "text": txt,
        "encoding": "cp1252/PDFDocEncoding (UTF-8 strict decode FAILED)",
        "replacement_chars": txt.count("�"),
    }


def unescape_pdf_literal(raw: bytes) -> bytes:
    out = bytearray()
    i = 0
    while i < len(raw):
        c = raw[i]
        if c == 0x5C and i + 1 < len(raw):
            n = raw[i + 1]
            simple = {
                0x6E: 0x0A,
                0x72: 0x0D,
                0x74: 0x09,
                0x62: 0x08,
                0x66: 0x0C,
                0x28: 0x28,
                0x29: 0x29,
                0x5C: 0x5C,
            }
            if n in simple:
                out.append(simple[n])
                i += 2
                continue
            m = re.match(rb"\\([0-7]{1,3})", raw[i:])
            if m:
                out.append(int(m.group(1), 8) & 0xFF)
                i += len(m.group(0))
                continue
            i += 2
            continue
        out.append(c)
        i += 1
    return bytes(out)


def fetch(sheet: str, url: str) -> bytes | None:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"plano5_{sheet}.pdf")
    if os.path.exists(path):
        with open(path, "rb") as fh:
            return fh.read()
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=180, context=CTX) as resp:
            data = resp.read()
    except Exception as exc:  # noqa: BLE001
        print(f"  {sheet}: UNREACHABLE ({type(exc).__name__}) -> UNKNOWN, not absent")
        return None
    with open(path, "wb") as fh:
        fh.write(data)
    return data


def all_bytes(data: bytes) -> bytes:
    """Raw file plus every inflatable stream -- objects hide inside ObjStm."""
    chunks = [data]
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end == -1:
            continue
        try:
            chunks.append(zlib.decompress(data[start:end]))
        except Exception:  # noqa: BLE001
            continue
    return b"\n".join(chunks)


GEO_MARKERS = [
    (b"/Measure", "PDF measurement dictionary"),
    (b"/GEO", "geospatial measure subtype (ISO 32000-2 geo)"),
    (b"/GPTS", "geographic corner points"),
    (b"/LPTS", "page-space corner points"),
    (b"/GCS", "geographic coordinate system dict"),
    (b"/PCS", "projected coordinate system dict"),
    (b"/EPSG", "explicit EPSG code"),
    (b"/VP", "viewport array (carries /Measure)"),
    (b"/PtData", "point data"),
    (b"/WKT", "well-known text CRS"),
    (b"LGIDict", "Esri/TerraGo GeoPDF LGIDict"),
    (b"/Projection", "TerraGo projection dict"),
]


def probe_sheet(sheet: str, url: str) -> dict:
    data = fetch(sheet, url)
    if data is None:
        return {
            "sheet": sheet,
            "outcome": "UNKNOWN",
            "why": "sheet could not be retrieved; nothing was learned",
        }
    blob = all_bytes(data)
    rec: dict = {
        "sheet": sheet,
        "outcome": "MEASURED",
        "bytes": len(data),
        "searched_bytes_incl_inflated_streams": len(blob),
    }

    # ── (a) georeference markers
    geo = {}
    for marker, meaning in GEO_MARKERS:
        n = blob.count(marker)
        if n:
            geo[marker.decode()] = {"hits": n, "meaning": meaning}
    rec["georeference_markers"] = geo
    rec["GEOREFERENCE_VERDICT"] = (
        "GEOPDF_PRESENT" if geo.get("/Measure") or geo.get("LGIDict") else "NO_EMBEDDED_GEOREFERENCE"
    )

    # ── (b) MediaBox / CropBox: the page's own coordinate extent
    boxes = re.findall(rb"/(MediaBox|CropBox)\s*\[([^\]]*)\]", blob)
    seen = []
    for name, nums in boxes:
        vals = [float(x) for x in re.findall(rb"-?\d+\.?\d*", nums)]
        entry = {"box": name.decode(), "values_pt": vals}
        if entry not in seen:
            seen.append(entry)
    rec["page_boxes"] = seen

    # ── (c) OPTIONAL CONTENT GROUPS -- the draftsman's own layer names
    ocg_raw = re.findall(rb"/Type\s*/OCG[^>]*?/Name\s*\(((?:[^()\\]|\\.)*)\)", blob, re.S)
    ocg_raw += re.findall(rb"/Name\s*\(((?:[^()\\]|\\.)*)\)\s*[^>]*?/Type\s*/OCG", blob, re.S)
    ocg_hex = re.findall(rb"/Type\s*/OCG[^>]*?/Name\s*<([0-9A-Fa-f\s]+)>", blob, re.S)
    layers: list[dict] = []
    for raw in ocg_raw:
        d = decode_pdf_string(unescape_pdf_literal(raw))
        if d["text"] and d not in layers:
            layers.append(d)
    for raw in ocg_hex:
        try:
            b = bytes.fromhex(re.sub(rb"\s", b"", raw).decode())
        except Exception:  # noqa: BLE001
            continue
        d = decode_pdf_string(b)
        if d["text"] and d not in layers:
            layers.append(d)
    rec["optional_content_groups"] = layers
    rec["ocg_count"] = len(layers)
    rec["has_ocproperties"] = b"/OCProperties" in blob
    rec["LEGEND_VERDICT"] = (
        "LAYER_NAMES_PUBLISHED" if layers else "NO_NAMED_LAYERS"
    )

    # ── (d) document info / producer -- tells us WHICH CAD tool plotted it,
    #        which in turn tells us which georeference convention to expect.
    info: list[dict] = []
    for key in (b"Producer", b"Creator", b"Title", b"Author", b"Subject", b"Keywords"):
        for m in re.finditer(rb"/" + key + rb"\s*\(((?:[^()\\]|\\.)*)\)", blob, re.S):
            d = decode_pdf_string(unescape_pdf_literal(m.group(1)))
            e = {"key": key.decode(), **d}
            if e not in info:
                info.append(e)
    rec["doc_info"] = info
    return rec


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    sheets = []
    for sheet, url in SHEETS.items():
        print(f"probing {sheet} ...")
        sheets.append(probe_sheet(sheet, url))

    measured = [s for s in sheets if s["outcome"] == "MEASURED"]
    report = {
        "probe": "aragon-plan-georef-step1-pdf-published-metadata",
        "question": (
            "Does plano n5 publish its own CRS (/VP /Measure /GEO) and its own "
            "legend (/OCProperties layer names)?"
        ),
        "encoding_discipline": (
            "every returned string records the encoding that decoded it; UTF-8 is "
            "attempted STRICTLY so that a failure is visible rather than silently "
            "producing U+FFFD"
        ),
        "unreachable_is_unknown": [s["sheet"] for s in sheets if s["outcome"] == "UNKNOWN"],
        "GEOREFERENCE": sorted({s["GEOREFERENCE_VERDICT"] for s in measured}) or ["UNKNOWN"],
        "LEGEND": sorted({s["LEGEND_VERDICT"] for s in measured}) or ["UNKNOWN"],
        "sheets": sheets,
    }
    path = os.path.join(OUT, "plano5_metadata.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    for s in sheets:
        if s["outcome"] == "UNKNOWN":
            print(f"  {s['sheet']}: UNKNOWN")
            continue
        print(
            f"  {s['sheet']}: geo={s['GEOREFERENCE_VERDICT']} "
            f"legend={s['LEGEND_VERDICT']} ocgs={s['ocg_count']} "
            f"boxes={s['page_boxes']}"
        )
        if s["georeference_markers"]:
            print(f"      markers: {list(s['georeference_markers'])}")
        for lyr in s["optional_content_groups"][:40]:
            print(f"      layer: {lyr['text']!r}  [{lyr['encoding']}]")
        for d in s["doc_info"]:
            print(f"      {d['key']}: {d['text']!r}")
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()