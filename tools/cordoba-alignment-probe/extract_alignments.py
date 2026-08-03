"""CÓRDOBA — is the legal alineación EXTRACTABLE, not merely legally real?

The PGOU is explicit: «Las alineaciones y rasantes del Suelo Urbano serán las
grafiadas en el plano de "Alineaciones y Rasantes" a escala 1/2000», and that
sheet PREVAILS where it is more precise. So the alignment is not derivable from
the road centreline, the street polygon or the parcel frontage — it is a drawn
line on a specific sheet, and the only lawful way to obtain it is to read that
sheet.

A previous probe searched WFS layer NAMES, found nothing called «alineaciones»,
and concluded the geometry does not exist. This probe tests the sheet itself.

⛔ WHAT THIS PROBE REFUSES TO DO
   It never synthesises an alignment. `idecordoba:ejes_red_viaria` (centreline,
   16.7 % on-frontage) and `idecordoba:sup_viales` (physical kerb, 83.9 %) are
   both present and both WRONG as a matter of law. Reading the drawn red line
   is the whole point; approximating it would defeat it.

WHAT IS MEASURED HERE
  1. ANATOMY   — vector or raster, per sheet, by operator census.
  2. LEGEND    — captions bound to MEASURED stroke classes, swatch by swatch.
  3. GRID      — the sheet's own printed UTM graticule → scale AND shift.
  4. GEOMETRY  — the alignment-family linework, in ground metres.

⚠ THE FINDING THAT LIMITS ALL THE OTHERS. Córdoba prints TWO different legal
  meanings — «ALINEACIÓN DEL VIAL» and «ALINEACIÓN DE EDIFICACIÓN» — in ONE
  identical stroke class: RGB(1,0,0), width 0.84, no dash array. They are not
  separable by measurement. This is the same failure the Aragón sheet showed
  with «CAMBIO DE ALTURA Y USO / FONDO EDIFICABLE», and it is handled the same
  way: the family is reported, the split is marked UNKNOWN, and no line is
  promoted to a constraint on a guess.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "plan-sheet-extract")
)

import fitz  # noqa: E402

import plangrid  # noqa: E402
import plansheet  # noqa: E402

from cordoba_sheets import CITIES  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")


def fetch_sheet(url: str, path: str) -> str:
    """gmucordoba.es 403s urllib's default User-Agent and rate-limits bursts.

    A 403 here is indistinguishable from a missing sheet unless the UA is set,
    so this uses curl with a browser UA. UNREACHABLE is reported as UNREACHABLE.
    """
    if os.path.exists(path) and os.path.getsize(path) > 10_000:
        return "CACHED"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    r = subprocess.run(
        [
            "curl", "-sS", "-m", "180", "--retry", "3", "--retry-delay", "3",
            "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36",
            "-e", "https://www.gmucordoba.es/planos/alineaciones-y-rasantes",
            "-o", path, url,
        ],
        capture_output=True, text=True,
    )
    if not os.path.exists(path) or os.path.getsize(path) < 10_000:
        return f"UNREACHABLE ({r.returncode})"
    return "FETCHED"


def anatomy(path: str) -> dict:
    with open(path, "rb") as fh:
        data = fh.read()
    a = plansheet.sheet_anatomy(data)
    d = fitz.open(path)
    page = d[0]
    meta = dict(d.metadata or {})
    ops = {"l": 0, "c": 0, "re": 0, "qu": 0}
    for dr in page.get_drawings():
        for item in dr.get("items", []):
            ops[item[0]] = ops.get(item[0], 0) + 1
    res = {
        # ⚠ The key is VERDICT, uppercase. Reading `verdict` returns None, and a
        # null verdict on every sheet reads exactly like "could not determine" —
        # a false INDETERMINATE across a series that is uniformly vector.
        "verdict": a.get("VERDICT"),
        "vector_path_ops_total": a.get("vector_path_ops_total"),
        "painted_text_ops": a.get("painted_text_ops"),
        "font_objects": a.get("font_objects"),
        "images": a.get("images"),
        "producer": meta.get("producer"),
        "creator": meta.get("creator"),
        "title": meta.get("title"),
        "created": meta.get("creationDate"),
        "page_pt": [round(page.rect.width, 1), round(page.rect.height, 1)],
        "rotation": page.rotation,
        "raster_images": len(page.get_images(full=True)),
        "path_objects": len(page.get_drawings()),
        "operators": ops,
        "extractable_text_chars": len(page.get_text().strip()),
        "named_layers": plansheet.named_layers(data),
        "published_georeference": plansheet.published_georeference(data),
    }
    d.close()
    return res


def stroke_inventory(page) -> list[dict]:
    """Every distinct stroke class with its segment count and total ink."""
    agg: dict[str, dict] = {}
    for s in plangrid.segments_in_display_space(page):
        e = agg.setdefault(
            s["key"], {"stroke": s["stroke"], "segments": 0, "ink_pt": 0.0}
        )
        e["segments"] += 1
        e["ink_pt"] += math.dist(s["a"], s["b"])
    rows = sorted(agg.values(), key=lambda r: -r["ink_pt"])
    for r in rows:
        r["ink_pt"] = round(r["ink_pt"], 1)
    return rows


def bind_legend_measured(page, rows: list[dict]) -> dict:
    """Bind each printed caption to the stroke class MEASURED in its swatch box.

    The swatch is geometry at a known page position, so the binding is read off
    the sheet rather than assumed. Collisions — two captions resolving to ONE
    stroke class — are the result that matters, because they cap what any
    downstream classifier can possibly distinguish.
    """
    segs = plangrid.segments_in_display_space(page)
    bound = []
    for row in rows:
        x0, y0, x1, y1 = row["swatch"]
        hits: dict[str, dict] = {}
        for s in segs:
            cx = (s["a"][0] + s["b"][0]) / 2.0
            cy = (s["a"][1] + s["b"][1]) / 2.0
            # TRAP 3: a swatch is a horizontal rule, so its rect has zero area
            # and Rect.intersects() returns False. Containment is numeric.
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                h = hits.setdefault(
                    s["key"], {"stroke": s["stroke"], "segments": 0, "ink_pt": 0.0}
                )
                h["segments"] += 1
                h["ink_pt"] += math.dist(s["a"], s["b"])
        bound.append(
            {
                "row": row["row"],
                "label_es": row["label_es"],
                "meaning_en": row["meaning_en"],
                "captions": row["captions"],
                "measured": [
                    {
                        "stroke": v["stroke"],
                        "key": k,
                        "segments": v["segments"],
                        "ink_pt": round(v["ink_pt"], 2),
                    }
                    for k, v in sorted(hits.items(), key=lambda kv: -kv[1]["ink_pt"])
                ],
                "status": "BOUND" if hits else "NO_SWATCH_GEOMETRY",
            }
        )
    # Which stroke classes are claimed by more than one caption?
    owners: dict[str, list[str]] = {}
    for b in bound:
        if b["measured"]:
            owners.setdefault(b["measured"][0]["key"], []).append(b["row"])
    collisions = {k: v for k, v in owners.items() if len(v) > 1}
    return {"rows": bound, "collisions": collisions, "n_collisions": len(collisions)}


def georeference(page, cfg: dict, sheet_id: str) -> dict:
    frame = plangrid.sheet_frame(page)
    if frame is None:
        return {"status": "NO_NEATLINE"}
    cands = plangrid.edge_tick_candidates(page, frame)
    spacing_m = cfg["grid_interval_m"]

    # ⚠ THE GRATICULE IS MEASURED ON EVERY SHEET, ANCHOR OR NOT. Returning early
    #    when no printed value has been transcribed would leave "the grid is
    #    present on all 49 sheets" as an assertion carried over from the one
    #    sheet that was read — precisely the generalisation this whole probe
    #    exists to refuse. Detecting the comb is cheap; asserting it is free and
    #    worthless.
    detected = {e: plangrid.detect_grid_comb(cands[e]) for e in ("bottom", "top", "left", "right")}
    combs = {
        e: (
            None
            if c is None
            else {
                "count": c["count"],
                "spacing_pt": round(c["spacing_pt"], 3),
                "max_resid_pt": round(c["max_resid_pt"], 3),
            }
        )
        for e, c in detected.items()
    }
    cx = detected["bottom"] or detected["top"]
    cy = detected["left"] or detected["right"]
    out: dict = {
        "frame": frame,
        "grid_interval_m": spacing_m,
        "combs": combs,
        "graticule_detected": bool(cx and cy),
        # Ground metres per point implied by the comb ALONE — available on every
        # sheet without any transcription, and the check that the whole series
        # shares one scale.
        "implied_m_per_pt": (
            round(spacing_m / ((cx["spacing_pt"] + cy["spacing_pt"]) / 2.0), 6)
            if cx and cy
            else None
        ),
    }

    anchors = cfg["sheet_grid_anchors"].get(sheet_id)
    if anchors is None:
        out["status"] = "NO_TRANSCRIBED_ANCHOR"
        out["note"] = (
            "The graticule was DETECTED and its spacing measured; only the printed "
            "VALUE beside it has not been transcribed for this sheet. That is a "
            "transcription gap, NOT absence of a georeference."
        )
        return out
    if not cx or not cy:
        out["status"] = "GRID_NOT_RESOLVED"
        return out
    out["status"] = "OK"

    fx = plangrid.grid_axis_fit(
        cx["members"], anchors["east_tick_pt"], anchors["east_value"], spacing_m, True
    )
    fy = plangrid.grid_axis_fit(
        cy["members"], anchors["north_tick_pt"], anchors["north_value"], spacing_m, False
    )
    out["fit_east"], out["fit_north"] = fx, fy
    out["scale_check"] = plangrid.scale_disagreement(
        (fx["metres_per_point"] + fy["metres_per_point"]) / 2.0,
        cfg["printed_scale_denominator"],
    )
    # The neatline corner values IMPLIED by the fit, against those PRINTED.
    e0, n0 = plangrid.page_to_ground(frame["x0"], frame["y0"], fx, fy)
    e1, n1 = plangrid.page_to_ground(frame["x1"], frame["y1"], fx, fy)
    out["frame_ground"] = {
        "top_left": [round(e0, 2), round(n0, 2)],
        "bottom_right": [round(e1, 2), round(n1, 2)],
        "width_m": round(e1 - e0, 2),
        "height_m": round(n0 - n1, 2),
    }
    pc = anchors.get("printed_corner")
    if pc:
        out["printed_corner_check"] = {
            "printed": pc,
            "implied": [round(e0, 2), round(n0, 2)],
            "delta_east_m": round(e0 - pc[0], 2),
            "delta_north_m": round(n0 - pc[1], 2),
        }
    return out


def alignment_geometry(page, cfg: dict, fx: dict, fy: dict) -> dict:
    """The alignment-family linework, chained into polylines, in ground metres.

    TRAP 4 applies: one `get_drawings()` entry holds many independent subpaths,
    so segments are chained only where one ends where the next begins.
    """
    target = cfg["alignment_stroke_key"]
    frame = plangrid.sheet_frame(page)
    lines: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []

    def flush():
        nonlocal cur
        if len(cur) >= 2:
            lines.append(cur)
        cur = []

    for s in plangrid.segments_in_display_space(page):
        if s["key"] != target:
            continue
        a, b = s["a"], s["b"]
        # Exclude the legend panel: swatches carry the same stroke class as the
        # map content and would otherwise be exported as if they were streets.
        if not (frame["x0"] <= a[0] <= frame["x1"] and frame["y0"] <= a[1] <= frame["y1"]):
            continue
        if cur and math.dist(cur[-1], a) <= 0.05:
            cur.append(b)
        else:
            flush()
            cur = [a, b]
    flush()

    feats = []
    total = 0.0
    seg_lengths = []
    for ln in lines:
        g = [plangrid.page_to_ground(x, y, fx, fy) for x, y in ln]
        L = sum(math.dist(g[i], g[i + 1]) for i in range(len(g) - 1))
        total += L
        seg_lengths.append(L)
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "source": "PGOU Córdoba 2001 (TR oct-2002) — plano «Alineaciones y Rasantes» 1:2000",
                    "legend_family": "ALINEACIÓN (vial OR edificación — NOT separable)",
                    "attribution_status": "UNKNOWN_SPLIT",
                    "length_m": round(L, 2),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[round(x, 3), round(y, 3)] for x, y in g],
                },
            }
        )
    # ── BOUNDING THE UNRESOLVED SPLIT, INSTEAD OF LEAVING IT OPEN ──────────
    # R2 (street alignment) and R3 (building alignment) share one stroke class,
    # so no per-line attribution is possible. But the two are drawn differently:
    # R2's swatch is ONE continuous stroke, R3's is FIVE broken strokes of
    # ~10.1 pt separated by ~5.1 pt gaps. A hand-broken dash therefore survives
    # subpath chaining as an isolated polyline about one dash long.
    # Counting those bounds how much of the family could possibly be R3 — which
    # turns "unknown" into a measured ceiling. It still does not attribute any
    # INDIVIDUAL line, and none is labelled on this basis.
    dash_m = cfg["legend_dash_pt"] * (fx["metres_per_point"] + fy["metres_per_point"]) / 2.0
    dash_like = [
        L for ln, L in zip(lines, seg_lengths)
        if len(ln) == 2 and abs(L - dash_m) <= 0.25 * dash_m
    ]
    seg_lengths.sort()
    return {
        "polylines": len(lines),
        "total_length_m": round(total, 1),
        "median_polyline_m": round(seg_lengths[len(seg_lengths) // 2], 2) if seg_lengths else None,
        "attribution_ceiling": {
            "legend_dash_length_m": round(dash_m, 2),
            "dash_like_polylines": len(dash_like),
            "dash_like_length_m": round(sum(dash_like), 1),
            "max_share_that_could_be_edificacion_pct": (
                round(100.0 * sum(dash_like) / total, 3) if total else None
            ),
            "note": (
                "An UPPER BOUND on «alineación de edificación», not a "
                "classification. The remainder is continuous linework consistent "
                "with «alineación del vial», which agrees with the sheet's own "
                "note that the building line is normally set by the zone "
                "ordinance rather than graphed here."
            ),
        },
        "geojson": {
            "type": "FeatureCollection",
            "crs": "EPSG:23030 (ED50 / UTM 30N)",
            "crs_note": (
                "The sheet DECLARES no CRS. The graticule fixes UTM-30N coordinates "
                "to centimetres; the DATUM was established separately by "
                "datum_registration.py, which registered the sheet's own base "
                "cartography against Catastro and peaked at (-113, -206) m — 9.1 m "
                "from the published ED50→ETRS89 shift — while the ETRS89 hypothesis "
                "scored 17.91 % against a 16.35 % null, i.e. no better than random. "
                "⚠ Read as EPSG:25830 these coordinates land ~230 m off. Reproject "
                "23030→25830 before comparing with any modern source."
            ),
            "features": feats,
        },
    }


def summarise(report: dict, reference_spacing_pt: float = 336.103) -> dict:
    """Roll the per-sheet measurements up into the series-level claim.

    ⚠ THE POINT OF THIS FUNCTION IS TO STOP ONE SHEET SPEAKING FOR FORTY-NINE.
      Everything proven in detail was proven on ar05. Whether the OTHER sheets
      carry the same graticule at the same scale is a separate question, and it
      has a separate — and lower — answer. A sheet whose comb spacing does not
      match the series is NOT silently averaged in.
    """
    sheets = report.get("sheets", {})
    anat = {}
    both, neither, bad_frame = [], [], []
    for sid, s in sorted(sheets.items()):
        a = s.get("anatomy")
        if not a:
            continue
        anat[a["verdict"]] = anat.get(a["verdict"], 0) + 1
        g = s.get("georeference", {})
        cb = g.get("combs") or {}
        f = g.get("frame") or {}
        # A neatline narrower than half the page is not a neatline. Where the
        # largest `re` is 58 × 37 pt the frame detector lost, and every grid
        # measurement downstream of it is meaningless rather than absent.
        if f.get("width_pt", 0) < 2000:
            bad_frame.append(sid)
        ok = {
            e: bool(cb.get(e))
            and abs(cb[e]["spacing_pt"] - reference_spacing_pt) / reference_spacing_pt < 0.02
            for e in ("bottom", "top", "left", "right")
        }
        if (ok["bottom"] or ok["top"]) and (ok["left"] or ok["right"]):
            both.append(sid)
        else:
            neither.append(sid)
    return {
        "sheets_total": len(sheets),
        "anatomy_verdicts": anat,
        "raster_images_across_series": sum(
            s["anatomy"]["images"]["image_xobjects"] for s in sheets.values() if s.get("anatomy")
        ),
        "path_objects_across_series": sum(
            s["anatomy"]["path_objects"] for s in sheets.values() if s.get("anatomy")
        ),
        "reference_spacing_pt": reference_spacing_pt,
        "graticule_confirmed_both_axes": {"count": len(both), "sheets": both},
        "graticule_not_confirmed": {
            "count": len(neither),
            "sheets": neither,
            "why": (
                "On these the largest rectangle on the page is not the neatline "
                "(some are tens of points across), so the tick search ran against "
                "the wrong frame. This is a FRAME-DETECTION gap in this tool, NOT "
                "evidence that the sheet lacks a graticule — it must not be "
                "reported as absence."
            ),
        },
        "frame_detection_failed": {"count": len(bad_frame), "sheets": bad_frame},
    }


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "cordoba_alignment.json")
    if "--summarise" in sys.argv:
        with open(path, encoding="utf-8") as fh:
            rep = json.load(fh)
        rep["series_summary"] = summarise(rep)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(rep, fh, ensure_ascii=False, indent=2)
        print(json.dumps(rep["series_summary"], ensure_ascii=False, indent=2))
        return
    cfg = CITIES["cordoba"]
    report: dict = {
        "city": cfg["city"],
        "ine": cfg["ine"],
        "catastro_dgc": cfg["catastro_dgc"],
        "instrument": cfg["instrument"],
        "sheet_index_url": cfg["sheet_index_url"],
        "sheets": {},
    }

    only = sys.argv[1:] or list(cfg["sheets"].keys())
    for sid in only:
        url = cfg["sheets"][sid]
        path = os.path.join(CACHE, f"{sid}.pdf")
        outcome = fetch_sheet(url, path)
        entry: dict = {"url": url, "fetch": outcome}
        if not outcome.startswith(("FETCHED", "CACHED")):
            report["sheets"][sid] = entry
            continue
        entry["anatomy"] = anatomy(path)
        d = fitz.open(path)
        page = d[0]
        if sid == cfg["legend_sheet"]:
            entry["stroke_inventory"] = stroke_inventory(page)
            entry["legend"] = bind_legend_measured(page, cfg["legend_rows"])
        geo = georeference(page, cfg, sid)
        entry["georeference"] = geo
        if geo.get("status") == "OK":
            g = alignment_geometry(page, cfg, geo["fit_east"], geo["fit_north"])
            gj = g.pop("geojson")
            entry["alignment"] = g
            with open(os.path.join(OUT, f"alignment_{sid}.geojson"), "w", encoding="utf-8") as fh:
                json.dump(gj, fh, ensure_ascii=False)
        d.close()
        report["sheets"][sid] = entry

    report["series_summary"] = summarise(report)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2)[:6000])


if __name__ == "__main__":
    main()
