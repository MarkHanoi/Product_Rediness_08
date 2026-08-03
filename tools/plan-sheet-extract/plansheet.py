"""PLAN-SHEET EXTRACTION — a city-agnostic capability, not a Huesca special case.

WHY THIS IS A CAPABILITY AND NOT A SCRIPT
-----------------------------------------
Several Spanish cities refuse to publish a buildable envelope for the SAME
stated reason: the governing number is "graphed on a plan sheet". València's
plano C, Huesca's plano nº 5, Zaragoza's tomo 11. That premise was tested for
Huesca and found FALSE -- the sheet is a vector CAD plot and its geometry
extracts. If it is false for the others too, then the depth blocker across
several cities is ONE shared extraction pipeline rather than a per-city
sourcing wall.

So the Huesca-specific parts (which sheets, where the legend panel sits, what
the captions say) are DATA, and everything below is the reusable engine.

>> WHAT IT DOES NOT DO. It never converts a drawn line into a number. It
   reports what is measurable and marks the rest UNKNOWN. Being vector is
   NECESSARY, NOT SUFFICIENT: a sheet still needs a georeference and a legend
   read before any line on it means metres on the ground.

────────────────────────────────────────────────────────────────────────────
THE FOUR TRAPS THIS ENGINE EXISTS TO ABSORB. Each one produced a FALSE ZERO --
an answer that looked exactly like "there is no data here".
────────────────────────────────────────────────────────────────────────────

  1. ENCODING. Decoding these sources as UTF-8 with errors='replace' scored
     `altura máxima` at ZERO against 35 real occurrences: every accented byte
     became U+FFFD. `decode_recording_encoding()` tries strict UTF-8 first so
     that failure is VISIBLE, falls back to cp1252, and RETURNS WHICH ONE WON.

  2. PAGE ROTATION. `page.rotation` is 90 on these sheets. `get_pixmap()`
     renders in DISPLAY space; `get_drawings()` returns UNROTATED mediabox
     space. Coordinates read off a render therefore address nothing, and every
     lookup returns empty. `drawings_in_display_space()` applies
     `page.rotation_matrix` so both live in one frame.

  3. DEGENERATE RECTS. A legend swatch is a horizontal rule, so its rect has
     y0 == y1. PyMuPDF classifies a zero-area rect as EMPTY and
     `Rect.intersects()` returns False for it -- so every swatch scored zero
     while sitting exactly where expected. Containment is tested numerically.

  4. SUBPATH CHAINING. One `get_drawings()` entry holds MANY independent
     subpaths. Concatenating its `l` items into one point list fabricates one
     absurd mega-polygon and discards every real building: 77 polygons
     recovered from 78,497 line operators. `closed_rings()` chains instead.
"""

from __future__ import annotations

import json
import math
import os
import re
import ssl
import urllib.request
import zlib

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore[assignment]

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


# ═════════════════════════════════════════════════════════════════════════════
# TRAP 1 — ENCODING
# ═════════════════════════════════════════════════════════════════════════════
def decode_recording_encoding(raw: bytes) -> dict:
    """Decode bytes and RECORD which encoding succeeded.

    Mirrors the discipline of `packages/ordinance-extraction/src/ingest/
    decodeText.ts`: a zero must never be able to impersonate an absence. UTF-8
    is attempted STRICTLY, so a failure is an event rather than a silent field
    of U+FFFD.
    """
    if raw[:2] == b"\xfe\xff":
        return {
            "text": raw[2:].decode("utf-16-be", errors="replace"),
            "encoding": "UTF-16BE (declared by BOM)",
            "strict_utf8_ok": False,
        }
    try:
        return {
            "text": raw.decode("utf-8"),
            "encoding": "UTF-8 (strict)",
            "strict_utf8_ok": True,
        }
    except UnicodeDecodeError:
        pass
    return {
        "text": raw.decode("cp1252", errors="replace"),
        "encoding": "cp1252 (strict UTF-8 FAILED)",
        "strict_utf8_ok": False,
    }


def lexeme_census(text: str, lexemes: dict[str, list[str]]) -> dict:
    """Count planning lexemes, reporting PRESENT / ABSENT / INDETERMINATE.

    ⚠ ABSENT is only claimable when a control lexeme -- one with no accented
    characters -- WAS found. If even the control is missing, the extraction
    itself is suspect and the answer is INDETERMINATE, never "the ordinance is
    silent".
    """
    low = text.lower()
    counts = {k: sum(low.count(v.lower()) for v in vs) for k, vs in lexemes.items()}
    control = counts.get("control", 0)
    out = {}
    for k, n in counts.items():
        if n > 0:
            verdict = "PRESENT"
        elif control > 0:
            verdict = "ABSENT"
        else:
            verdict = "INDETERMINATE"
        out[k] = {"count": n, "verdict": verdict}
    return out


# ═════════════════════════════════════════════════════════════════════════════
# FETCH
# ═════════════════════════════════════════════════════════════════════════════
def fetch_pdf(url: str, cache_path: str, timeout: int = 240) -> tuple[bytes | None, str]:
    """Return (bytes, outcome). `outcome` distinguishes UNREACHABLE from empty."""
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as fh:
            return fh.read(), "CACHED"
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as resp:
            data = resp.read()
    except Exception as exc:  # noqa: BLE001
        # ⛔ No HTTP status ⇒ UNKNOWN. NOT "the sheet does not exist".
        return None, f"UNREACHABLE:{type(exc).__name__}"
    with open(cache_path, "wb") as fh:
        fh.write(data)
    return data, "FETCHED"


# ═════════════════════════════════════════════════════════════════════════════
# IS IT DATA? — vector / raster anatomy, straight off the byte stream
# ═════════════════════════════════════════════════════════════════════════════
def _inflated(data: bytes) -> bytes:
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


def sheet_anatomy(data: bytes) -> dict:
    """Vector vs raster, decided by operator census rather than by appearance.

    ⚠ "It is a PDF" says nothing. PDF is a CONTAINER, not a format. The three
    outcomes that matter are genuinely different artefacts:
      OUTLINED_TEXT_VECTOR  heavy path load, zero text operators -- renders
                            perfectly, extracts zero characters. EXTRACTABLE.
      TEXT_LAYER_VECTOR     has real text operators. Easiest case.
      RASTER                an image in a PDF wrapper. Not extractable as data.
    """
    blob = _inflated(data)
    ops = {
        k: len(re.findall(rb"(?<![A-Za-z0-9])" + k.encode() + rb"(?![A-Za-z0-9])", blob))
        for k in ("m", "l", "c", "v", "y", "re")
    }
    # ⚠ A BARE `Tj`/`TJ` SCAN OVER INFLATED STREAMS IS A FALSE POSITIVE MACHINE.
    # Those two bytes occur constantly inside binary image and font data, so a
    # naive count reported these sheets as TEXT_LAYER_VECTOR when the byte-level
    # probe found ZERO painted-text operators. Text operators only mean anything
    # inside a BT/ET block, so they are counted there — and cross-checked against
    # the font census below, because **painting text requires a font resource**.
    bt_blocks = len(re.findall(rb"(?<![A-Za-z0-9])BT(?![A-Za-z0-9])", blob))
    text_ops = 0
    for m in re.finditer(rb"(?<![A-Za-z0-9])BT(?![A-Za-z0-9])(.{0,20000}?)(?<![A-Za-z0-9])ET(?![A-Za-z0-9])", blob, re.S):
        text_ops += len(re.findall(rb"(?<![A-Za-z0-9])(Tj|TJ)(?![A-Za-z0-9])", m.group(1)))
    font_objects = len(re.findall(rb"/Type\s*/Font", blob))
    if font_objects == 0:
        # No font resource ⇒ nothing on this page is painted text, whatever the
        # byte patterns look like. The glyphs are outlined vector paths.
        text_ops = 0
    images = {
        "DCTDecode": blob.count(b"/DCTDecode"),
        "JBIG2Decode": blob.count(b"/JBIG2Decode"),
        "CCITTFaxDecode": blob.count(b"/CCITTFaxDecode"),
        "JPXDecode": blob.count(b"/JPXDecode"),
        "image_xobjects": len(re.findall(rb"/Subtype\s*/Image", blob)),
    }
    vector_total = sum(ops.values())
    has_raster = images["image_xobjects"] > 0 or any(
        images[k] for k in ("DCTDecode", "JBIG2Decode", "CCITTFaxDecode", "JPXDecode")
    )
    if vector_total > 5000 and text_ops == 0:
        verdict = "OUTLINED_TEXT_VECTOR"
    elif vector_total > 5000 and text_ops > 0:
        verdict = "TEXT_LAYER_VECTOR"
    elif has_raster and vector_total < 500:
        verdict = "RASTER"
    else:
        verdict = "INDETERMINATE"

    info = {}
    for key in (b"Producer", b"Creator", b"Title", b"Author"):
        m = re.search(rb"/" + key + rb"\s*\(((?:[^()\\]|\\.)*)\)", blob, re.S)
        if m:
            info[key.decode()] = decode_recording_encoding(m.group(1))["text"]

    return {
        "bytes": len(data),
        "vector_path_ops": ops,
        "vector_path_ops_total": vector_total,
        "painted_text_ops": text_ops,
        "bt_blocks": bt_blocks,
        "images": images,
        "font_objects": font_objects,
        "doc_info": info,
        "VERDICT": verdict,
        "why": (
            "OUTLINED_TEXT_VECTOR = heavy path load, zero painted text, no font "
            "resource: renders perfectly, extracts zero characters, and the "
            "geometry IS the data."
            if verdict == "OUTLINED_TEXT_VECTOR"
            else ""
        ),
    }


def published_georeference(data: bytes) -> dict:
    """Does the PDF carry its OWN CRS? Checked before any fitting is attempted.

    A GeoPDF `/VP -> /Measure -> /Subtype /GEO` (or a TerraGo `LGIDict`) makes
    the georeference PUBLISHED METADATA, exact and free. Absence is a real
    finding; presence closes the hardest blocker outright.
    """
    blob = _inflated(data)
    markers = {
        m.decode(): blob.count(m)
        for m in (
            b"/Measure",
            b"/GEO",
            b"/GPTS",
            b"/LPTS",
            b"/GCS",
            b"/PCS",
            b"/EPSG",
            b"/VP",
            b"LGIDict",
            b"/WKT",
        )
        if blob.count(m)
    }
    return {
        "markers": markers,
        "VERDICT": (
            "GEOPDF_PRESENT"
            if markers.get("/Measure") or markers.get("LGIDict")
            else "NO_EMBEDDED_GEOREFERENCE"
        ),
    }


def named_layers(data: bytes) -> list[dict]:
    """Optional Content Group names -- the draftsman's own layer names, if any.

    When present these ARE the legend, authored by the plan's author and
    readable as text even when every glyph on the sheet is outlined vector.
    """
    blob = _inflated(data)
    out: list[dict] = []
    for m in re.finditer(
        rb"/Type\s*/OCG[^>]*?/Name\s*\(((?:[^()\\]|\\.)*)\)", blob, re.S
    ):
        d = decode_recording_encoding(m.group(1))
        if d["text"] and d not in out:
            out.append(d)
    return out


# ═════════════════════════════════════════════════════════════════════════════
# TRAP 2 — ROTATION. One coordinate frame for humans and machines alike.
# ═════════════════════════════════════════════════════════════════════════════
def drawings_in_display_space(page) -> list[dict]:
    """`get_drawings()` re-expressed in the frame `get_pixmap()` renders in."""
    rot = page.rotation_matrix
    out = []
    for d in page.get_drawings():
        r = d.get("rect")
        if r is None:
            continue
        e = dict(d)
        e["rect"] = fitz.Rect(r) * rot
        e["_rot"] = rot
        out.append(e)
    return out


def stroke_class(d: dict) -> dict:
    """The measurable identity of a drawn line: colour, width, dash pattern."""

    def rgb(c):
        return [round(float(v), 4) for v in c] if c else None

    dashes = d.get("dashes")
    return {
        "type": d.get("type"),
        "stroke_rgb": rgb(d.get("color")),
        "fill_rgb": rgb(d.get("fill")),
        "width": round(float(d.get("width") or 0), 4),
        "dashes": dashes.strip() if isinstance(dashes, str) else dashes,
    }


def stroke_class_key(sc: dict) -> str:
    return json.dumps(
        {"stroke_rgb": sc["stroke_rgb"], "width": sc["width"], "dashes": sc["dashes"]},
        sort_keys=True,
    )


def stroke_census(page) -> dict:
    """How many DISTINCT line styles the sheet uses.

    A sheet whose line work is undifferentiated cannot be classified no matter
    how well it is georeferenced, so this is the cheap go/no-go before any
    legend work.
    """
    counts: dict[str, int] = {}
    example: dict[str, dict] = {}
    for d in drawings_in_display_space(page):
        sc = stroke_class(d)
        k = stroke_class_key(sc)
        counts[k] = counts.get(k, 0) + 1
        example.setdefault(k, sc)
    ordered = sorted(counts.items(), key=lambda kv: -kv[1])
    return {
        "distinct_classes": len(counts),
        "classes": [{**example[k], "n": n} for k, n in ordered],
        "is_colour": any(
            (example[k]["stroke_rgb"] or [0, 0, 0])
            != [(example[k]["stroke_rgb"] or [0])[0]] * 3
            for k in counts
        ),
    }


# ═════════════════════════════════════════════════════════════════════════════
# TRAP 3 — LEGEND BINDING over degenerate rects
# ═════════════════════════════════════════════════════════════════════════════
def bind_legend(page, rows: list[dict]) -> dict:
    """Bind human-read legend CAPTIONS to measured swatch STROKE CLASSES.

    Each row supplies `label_es`, `captions` (how many distinct meanings the
    sheet prints against that one swatch) and `swatch` (a display-space rect).

    Three verdicts, deliberately distinct:
      BOUND                        one class, one meaning. Usable.
      CLASS_BOUND_MEANING_UNKNOWN  findable on the map, but the sheet prints
                                   >1 meaning against it. Usable for DETECTION,
                                   NEVER as a numeric constraint.
      UNKNOWN                      nothing measured, or indistinguishable from
                                   another row.
    """
    drawings = drawings_in_display_space(page)
    bound: list[dict] = []
    for row in rows:
        x0, y0, x1, y1 = row["swatch"]
        found: list[dict] = []
        for d in drawings:
            r = d["rect"]
            # TRAP 3: numeric containment, never Rect.intersects() -- a
            # horizontal rule has zero area and reads as an EMPTY rect.
            if not (x0 - 6 <= r.x0 and r.x1 <= x1 + 6):
                continue
            if not (y0 - 6 <= r.y0 and r.y1 <= y1 + 6):
                continue
            sc = stroke_class(d)
            if sc["type"] == "f" and sc["stroke_rgb"] is None:
                sc["stroke_rgb"] = sc["fill_rgb"]
            found.append(sc)
        classes = {stroke_class_key(sc): sc for sc in found}
        bound.append({**row, "measured_stroke_classes": list(classes.values())})

    by_class: dict[str, list[str]] = {}
    for b in bound:
        for sc in b["measured_stroke_classes"]:
            by_class.setdefault(stroke_class_key(sc), []).append(b["row"])
    collisions = {k: v for k, v in by_class.items() if len(set(v)) > 1}
    colliding = {r for rows_ in collisions.values() for r in rows_}

    for b in bound:
        if not b["measured_stroke_classes"]:
            b["BINDING"] = "UNKNOWN"
            b["why"] = "no geometry found in the swatch band"
        elif b["row"] in colliding:
            b["BINDING"] = "UNKNOWN"
            b["why"] = "stroke class indistinguishable from another legend row"
        elif b.get("captions", 1) > 1:
            b["BINDING"] = "CLASS_BOUND_MEANING_UNKNOWN"
            b["why"] = (
                f"the sheet prints {b['captions']} distinct meanings against this "
                "ONE swatch"
            )
        else:
            b["BINDING"] = "BOUND"
            b["why"] = "unique measured stroke class, single legend caption"

    return {
        "rows": bound,
        "collisions": len(collisions),
        "counts": {
            v: sum(1 for b in bound if b["BINDING"] == v)
            for v in ("BOUND", "CLASS_BOUND_MEANING_UNKNOWN", "UNKNOWN")
        },
    }


# ═════════════════════════════════════════════════════════════════════════════
# TRAP 4 — SUBPATH CHAINING
# ═════════════════════════════════════════════════════════════════════════════
def ring_stats(pts: list[tuple[float, float]]) -> dict | None:
    """Shoelace AREA CENTROID and area.

    ⚠ NOT the vertex mean. CAD line work is densely vertexed on detailed edges
    and sparse on straight ones, so a vertex mean is pulled toward whichever
    side carries more points -- a systematic bias of metres that looks exactly
    like a bad georeference and that no shift-fitting can remove.
    """
    a = cx = cy = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(a) < 1e-9:
        return None
    return {"cx": cx / (3 * a), "cy": cy / (3 * a), "area": abs(a) / 2}


def closed_rings(page, scale: float = 1.0, flip_y: bool = True) -> list[dict]:
    """Every closed subpath, as area-centroid + area, in `scale` units.

    `scale` is metres per PDF point, derived from the sheet's PUBLISHED scale
    denominator (see `metres_per_point`), never fitted.
    """
    rot = page.rotation_matrix
    sy = -1.0 if flip_y else 1.0
    out: list[dict] = []

    for d in page.get_drawings():
        current: list[tuple[float, float]] = []

        def flush(cur):
            if len(cur) >= 4 and math.dist(cur[0], cur[-1]) <= 1.5:
                st = ring_stats([(x * scale, y * sy * scale) for x, y in cur])
                if st:
                    out.append(st)

        for item in d["items"]:
            op = item[0]
            if op in ("re", "qu"):
                flush(current)
                current = []
                if op == "re":
                    r = fitz.Rect(item[1]) * rot
                    pts = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
                else:
                    q = item[1]
                    pts = [
                        (p.x, p.y)
                        for p in (
                            fitz.Point(q.ul) * rot,
                            fitz.Point(q.ur) * rot,
                            fitz.Point(q.lr) * rot,
                            fitz.Point(q.ll) * rot,
                        )
                    ]
                st = ring_stats([(x * scale, y * sy * scale) for x, y in pts])
                if st:
                    out.append(st)
            elif op in ("l", "c"):
                p1 = fitz.Point(item[1]) * rot
                p2 = fitz.Point(item[2] if op == "l" else item[4]) * rot
                a, b = (p1.x, p1.y), (p2.x, p2.y)
                # TRAP 4: a new subpath starts wherever a segment does not
                # begin where the previous one ended.
                if current and math.dist(current[-1], a) <= 0.05:
                    current.append(b)
                else:
                    flush(current)
                    current = [a, b]
        flush(current)
    return out


def metres_per_point(scale_denominator: float) -> float:
    """Ground metres per PDF point, from the sheet's PRINTED scale.

    1 pt = 1/72 in. At 1:`d`, one point spans `0.0254/72 * d` metres of ground.
    Derived from published metadata; NOT a fitted parameter.
    """
    return 0.0254 / 72.0 * scale_denominator
