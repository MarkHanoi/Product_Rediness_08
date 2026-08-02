#!/usr/bin/env python3
"""
probe_huesca_plano5.py -- IS PLANO Nº5 DATA, OR AN IMAGE?

Huesca PGOU 2008, plano nº5 = "Clasificacion, calificacion y regulacion del suelo y
la edificacion en suelo urbano. Red viaria, ALINEACIONES y rasantes", 1:1.000, 28 hojas.

Art. 8.4.8 (Norma Zonal 4, Manzana Cerrada, Grado 2) fixes *el fondo maximo* at 20 m
BUT says the operative fondo is "definido graficamente en el plano nº5". So the 20 m
is a DEFAULT WITH GRAPHIC OVERRIDE, and the override lives here.

The decisive question this probe answers is NOT "can I read the number" -- it is:

    IS THE SHEET A VECTOR DRAWING (geometry extractable) OR A RASTER SCAN (image only)?

TRAP GUARDS (all measured this programme, all wired in here):
  * OUTLINED-TEXT VECTOR -- Print-To-PDF with no fonts and no images renders perfectly
    and extracts ZERO characters. It is NOT empty. Count PATH OPERATORS separately.
  * A CHARACTER COUNT IS NOT A TEXT LAYER -- classify on PAINTED text operators
    (Tj / TJ / ' / "), never on font-resource presence.
  * Codec detection by raw-byte regex is unsound on PDF >= 1.5 (object streams +
    compressed xref). POSITIVE image detection is sound; ABSENCE IS NOT.
    So `images == 0` is reported as UNKNOWN-ABSENCE, never as "no images".

Pure stdlib + zlib. No pdfminer, no PyPDF, no network deps beyond urllib.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
CACHE = os.path.join(OUT, "pdf_cache")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

BASE = "https://www.huesca.es/documents/33451/300865/"

# Verbatim from https://www.huesca.es/areas/urbanismo/
#                clasificacion-y-regulacion-del-suelo-y-la-edificacion-en-suelo-urbano
# (sheet -> path fragment after BASE). Sampled sheets only; the full 28 are on the page.
SHEETS = {
    "H-01": "05+Calificacion+del+Suelo+Urbano+H-01.pdf/db40abac-6f90-7808-833f-a109f527dec0?t=1552033978540",
    "H-05": "05+Calificacion+del+Suelo+Urbano+H-05.pdf/1d520327-42b7-708e-8958-59be50dd8427?t=1552033986499",
    "H-13": "05+Calificacion+del+Suelo+Urbano+H-13.pdf/dd34684d-4346-a10e-c69c-72493272a0f1?t=1552034007875",
    "H-14": "05+Calificacion+del+Suelo+Urbano+H-14.pdf/11782809-cf74-0708-c519-d2c6beff2408?t=1552034005168",
    "H-21": "05+Calificacion+del+Suelo+Urbano+H-21.pdf/8b9f1306-954c-20af-0f93-f6f09aa4f14c?t=1552034025290",
    "H-28": "05+Calificacion+del+Suelo+Urbano+H-28.pdf/c107800f-6b22-6629-aafa-7c7bff110543?t=1552034077279",
}

# ---------------------------------------------------------------- fetch

def fetch(url: str, dest: str) -> tuple[int, int, str]:
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return 200, os.path.getsize(dest), "cache"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read()
            code = r.getcode()
    except Exception as e:  # noqa: BLE001
        return -1, 0, f"ERROR {type(e).__name__}: {e}"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(body)
    return code, len(body), "net"


# ---------------------------------------------------------------- PDF anatomy

STREAM_RE = re.compile(rb"stream\r?\n", re.S)


def _decompressed_content(raw: bytes) -> bytes:
    """Concatenate every FlateDecode stream we can inflate.

    Deliberately best-effort: a stream we cannot inflate is COUNTED as
    undecodable, never silently treated as empty.
    """
    blobs: list[bytes] = []
    undecodable = 0
    pos = 0
    while True:
        m = STREAM_RE.search(raw, pos)
        if not m:
            break
        start = m.end()
        end = raw.find(b"endstream", start)
        if end == -1:
            break
        chunk = raw[start:end]
        pos = end + 9
        try:
            blobs.append(zlib.decompress(chunk))
        except Exception:  # noqa: BLE001
            try:
                blobs.append(zlib.decompressobj().decompress(chunk))
            except Exception:  # noqa: BLE001
                undecodable += 1
    _decompressed_content.undecodable = undecodable  # type: ignore[attr-defined]
    return b"\n".join(blobs)


def analyse(path: str) -> dict:
    raw = open(path, "rb").read()
    header = raw[:9].decode("latin-1", "replace")

    content = _decompressed_content(raw)
    undecodable = getattr(_decompressed_content, "undecodable", 0)

    # --- PAINTED TEXT: the only sound signal for "has a text layer".
    #     Tj / TJ / ' / " are the show-text operators. Font presence is NOT.
    tj = len(re.findall(rb"[\)\]>]\s*(?:Tj|TJ)\b", content))
    quote_ops = len(re.findall(rb"[\)>]\s*(?:'|\")", content))
    bt_et = len(re.findall(rb"\bBT\b", content))

    # --- VECTOR PATH OPERATORS. This is what an outlined-text / CAD plot looks like.
    #     m = moveto, l = lineto, c/v/y = bezier, re = rectangle.
    def op(o: bytes) -> int:
        return len(re.findall(rb"(?:^|[\s])" + o + rb"(?=[\s])", content))

    paths = {k.decode(): op(k) for k in (b"m", b"l", b"c", b"v", b"y", b"re")}
    path_ops = sum(paths.values())
    fills = op(b"f") + op(b"f*") + op(b"F")
    strokes = op(b"S") + op(b"s")

    # --- IMAGES. Positive detection sound; ABSENCE IS NOT (obj streams hide these).
    img_xobj = len(re.findall(rb"/Subtype\s*/Image", raw))
    dct = len(re.findall(rb"/DCTDecode", raw))
    jbig2 = len(re.findall(rb"/JBIG2Decode", raw))
    ccitt = len(re.findall(rb"/CCITTFaxDecode", raw))
    jpx = len(re.findall(rb"/JPXDecode", raw))
    inline_img = len(re.findall(rb"(?:^|\s)BI\s", content))

    fonts = len(re.findall(rb"/Type\s*/Font", raw))
    objstm = len(re.findall(rb"/Type\s*/ObjStm", raw))
    pages = len(re.findall(rb"/Type\s*/Page(?![sA-Za-z])", raw))

    # ---------------- classification, in the order that avoids the known traps
    painted_text = tj + quote_ops
    if img_xobj > 0 and path_ops < 500 and painted_text == 0:
        verdict = "RASTER_SCAN"
        why = "image XObject present, almost no vector path ops, no painted text"
    elif path_ops >= 5000 and painted_text == 0:
        verdict = "OUTLINED_TEXT_VECTOR"
        why = ("heavy vector path load with ZERO painted-text operators -- renders "
               "perfectly, extracts zero characters. NOT EMPTY.")
    elif path_ops >= 5000 and painted_text > 0:
        verdict = "VECTOR_WITH_TEXT_LAYER"
        why = "heavy vector path load AND painted text operators"
    elif painted_text > 0 and path_ops < 5000:
        verdict = "TEXT_PDF"
        why = "painted text dominant, light vector"
    else:
        verdict = "INDETERMINATE"
        why = "no dominant signal -- do not classify"

    return {
        "file": os.path.basename(path),
        "bytes": len(raw),
        "pdf_header": header,
        "pages_declared": pages,
        "content_stream_bytes_inflated": len(content),
        "undecodable_streams": undecodable,
        "object_streams_objstm": objstm,
        "painted_text_ops": {"Tj_TJ": tj, "quote_ops": quote_ops, "BT_blocks": bt_et,
                             "total": painted_text},
        "vector_path_ops": paths,
        "vector_path_ops_total": path_ops,
        "fill_ops": fills,
        "stroke_ops": strokes,
        "images": {
            "image_xobjects": img_xobj, "DCTDecode": dct, "JBIG2Decode": jbig2,
            "CCITTFaxDecode": ccitt, "JPXDecode": jpx, "inline_BI": inline_img,
            "ABSENCE_IS_UNSOUND": objstm > 0,
        },
        "font_objects": fonts,
        "VERDICT": verdict,
        "why": why,
    }


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    results = []
    for sheet, frag in SHEETS.items():
        url = BASE + frag
        dest = os.path.join(CACHE, f"huesca_plano5_{sheet}.pdf")
        code, size, how = fetch(url, dest)
        row: dict = {"sheet": sheet, "url": url, "http": code, "bytes": size,
                     "source": how}
        if code == 200 and size > 0:
            try:
                row["anatomy"] = analyse(dest)
            except Exception as e:  # noqa: BLE001
                row["anatomy_error"] = f"{type(e).__name__}: {e}"
        results.append(row)
        print(f"{sheet}  HTTP {code}  {size:>9,} B  {how}  "
              f"{row.get('anatomy', {}).get('VERDICT', '-')}")
        time.sleep(0.4)

    payload = {
        "probe": "huesca-plano5-vector-or-raster",
        "when": time.strftime("%Y-%m-%d"),
        "question": ("Is plano nº5 (alineaciones + linea de fondo edificable, 1:1.000) "
                     "available as DATA -- i.e. extractable vector geometry -- or as an "
                     "image only?"),
        "sheets": results,
    }
    with open(os.path.join(OUT, "huesca_plano5_anatomy.json"), "w",
              encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print("\nwrote out/huesca_plano5_anatomy.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
