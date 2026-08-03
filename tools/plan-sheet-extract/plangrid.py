"""GEOREFERENCE A PLAN SHEET FROM ITS OWN PRINTED UTM GRID — city-agnostic.

`plansheet.py` proves a sheet is vector and binds its legend. This module answers
the next question: where on the Earth is the line? It is a sibling module rather
than an extension of `plansheet.py` so that two agents can work the same
capability without colliding.

────────────────────────────────────────────────────────────────────────────
TRAP 5 — THE PRINTED SCALE CAN BE A LIE, AND THE LIE IS INVISIBLE.
────────────────────────────────────────────────────────────────────────────
Huesca's title block said «ESCALA 1 / 1.000» and that was true of the PDF, so
the Aragón run took metres-per-point from the caption and left only the shift
free. Córdoba's title block says «ESCALA 1:2000» and that is FALSE of the PDF:
the plot was refitted to A0 between plotter and Distiller, and the delivered
page measures ~1:1686.

A uniform scale error preserves every shape on the sheet. Nothing looks wrong.
Streets stay parallel, blocks stay rectangular, and a georeference built on the
caption is self-consistent while being 18.6 % wrong — 335 m across a 1.8 km
sheet. No amount of staring at the drawing detects it.

The defence is that these sheets print their own coordinate graticule. A tick is
geometry and the number beside it is published, so scale AND shift are both
MEASURED off the sheet. Where a sheet carries a grid, `grid_axis_fit()`
supersedes `plansheet.metres_per_point()`. The two are COMPARED and any
disagreement is REPORTED — never averaged, never quietly preferred.

>> WHAT THIS MODULE DOES NOT DO. It does not identify the DATUM. A UTM grid
   printed in 2002 is very likely ED50; the same numbers read as ETRS89 land
   ~200 m away. The grid fixes the coordinates; only an independent source
   fixes which ellipsoid they belong to. `datum_candidates()` reports the
   competing readings and refuses to choose between them.
"""

from __future__ import annotations

import math

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore[assignment]

from plansheet import stroke_class, stroke_class_key


# ═════════════════════════════════════════════════════════════════════════════
# TRAP 2, ONE LEVEL DOWN — rotation applies to POINTS, not just to rects.
# ═════════════════════════════════════════════════════════════════════════════
def segments_in_display_space(page) -> list[dict]:
    """Every straight segment as endpoints in the frame `get_pixmap()` renders.

    `plansheet.drawings_in_display_space()` rotates each path's bounding RECT,
    which is enough to LOCATE a legend swatch but not enough to TRACE a line:
    the points inside `items` stay in unrotated mediabox space. Reading those
    raw is TRAP 2 one level down — the coordinates look entirely plausible and
    address nothing. On a 270°-rotated A0 sheet they silently transpose x and y.
    """
    rot = page.rotation_matrix
    out: list[dict] = []
    for d in page.get_drawings():
        sc = stroke_class(d)
        key = stroke_class_key(sc)
        for item in d.get("items", []):
            op = item[0]
            if op == "l":
                p1, p2 = fitz.Point(item[1]) * rot, fitz.Point(item[2]) * rot
            elif op == "c":
                p1, p2 = fitz.Point(item[1]) * rot, fitz.Point(item[4]) * rot
            else:
                continue
            out.append(
                {
                    "a": (p1.x, p1.y),
                    "b": (p2.x, p2.y),
                    "curve": op == "c",
                    "stroke": sc,
                    "key": key,
                }
            )
    return out


def sheet_frame(page) -> dict | None:
    """The map neatline: the largest rectangle operator on the sheet.

    The neatline is the only object whose corners carry PUBLISHED coordinates,
    so it is the georeference datum. It is a single `re` operator; drawn map
    content never is.
    """
    rot = page.rotation_matrix
    best = None
    for d in page.get_drawings():
        for item in d.get("items", []):
            if item[0] != "re":
                continue
            r = fitz.Rect(item[1]) * rot
            if best is None or r.get_area() > best.get_area():
                best = r
    if best is None:
        return None
    return {
        "x0": best.x0,
        "y0": best.y0,
        "x1": best.x1,
        "y1": best.y1,
        "width_pt": best.x1 - best.x0,
        "height_pt": best.y1 - best.y0,
    }


def edge_tick_candidates(page, frame: dict, reach: float = 30.0) -> dict:
    """Candidate graticule ticks on each neatline edge, in display space.

    A tick is a short segment perpendicular to an edge with an endpoint ON that
    edge. Map content also terminates on the neatline in the hundreds, so this
    deliberately returns CANDIDATES and lets `detect_grid_comb()` discriminate.
    Filtering harder here is how a real graticule gets thrown away.
    """
    fx0, fy0, fx1, fy1 = frame["x0"], frame["y0"], frame["x1"], frame["y1"]
    out: dict[str, list[float]] = {"left": [], "right": [], "top": [], "bottom": []}
    for s in segments_in_display_space(page):
        (ax, ay), (bx, by) = s["a"], s["b"]
        dx, dy = abs(ax - bx), abs(ay - by)
        length = math.hypot(dx, dy)
        if not (2.0 <= length <= reach):
            continue
        if dy < 0.3:
            lo, hi, y = min(ax, bx), max(ax, bx), (ay + by) / 2.0
            if fy0 < y < fy1:
                if abs(hi - fx0) < 1.0 or abs(lo - fx0) < 1.0:
                    out["left"].append(y)
                if abs(lo - fx1) < 1.0 or abs(hi - fx1) < 1.0:
                    out["right"].append(y)
        elif dx < 0.3:
            lo, hi, x = min(ay, by), max(ay, by), (ax + bx) / 2.0
            if fx0 < x < fx1:
                if abs(lo - fy0) < 1.0 or abs(hi - fy0) < 1.0:
                    out["top"].append(x)
                if abs(hi - fy1) < 1.0 or abs(lo - fy1) < 1.0:
                    out["bottom"].append(x)
    return {k: sorted({round(v, 2) for v in vs}) for k, vs in out.items()}


def detect_grid_comb(
    positions: list[float], min_spacing: float = 50.0, tol: float = 0.8
) -> dict | None:
    """The largest evenly-spaced subset of `positions` — a 1-D Hough over combs.

    Map linework terminating on the neatline is indistinguishable from a tick
    ONE AT A TIME. It separates in the aggregate: real ticks are the only
    candidates that lie on a single arithmetic progression. Choosing the comb
    with the most members is therefore a measurement, not a convenience.
    """
    pts = sorted(set(positions))
    if len(pts) < 3:
        return None
    best = None
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            step = pts[j] - pts[i]
            if step < min_spacing:
                continue
            members = [
                p
                for p in pts
                if abs((p - pts[i]) / step - round((p - pts[i]) / step)) * step <= tol
            ]
            if len(members) < 3:
                continue
            idx = [round((p - pts[i]) / step) for p in members]
            n = len(members)
            mi, mp = sum(idx) / n, sum(members) / n
            den = sum((k - mi) ** 2 for k in idx)
            if den == 0:
                continue
            slope = sum((k - mi) * (p - mp) for k, p in zip(idx, members)) / den
            if slope < min_spacing:
                continue
            resid = max(
                abs(p - (mp + slope * (k - mi))) for k, p in zip(idx, members)
            )
            cand = {
                "count": n,
                "spacing_pt": slope,
                "members": members,
                "max_resid_pt": resid,
            }
            if best is None or (cand["count"], -cand["max_resid_pt"]) > (
                best["count"],
                -best["max_resid_pt"],
            ):
                best = cand
    return best


def grid_axis_fit(
    members: list[float],
    anchor_position: float,
    anchor_value: float,
    spacing_metres: float,
    increasing: bool,
) -> dict:
    """Map page points to ground metres along one axis, from the PRINTED grid.

    `anchor_value` is the number the sheet prints beside the tick nearest
    `anchor_position`; every other tick's value follows from the published grid
    interval. Scale and shift are therefore BOTH measured, and because the fit
    is over-determined `max_resid_m` is a real check rather than a restatement
    of the input.
    """
    pts = sorted(members)
    anchor_i = min(range(len(pts)), key=lambda k: abs(pts[k] - anchor_position))
    direction = 1.0 if increasing else -1.0
    vals = [
        anchor_value + (k - anchor_i) * spacing_metres * direction
        for k in range(len(pts))
    ]
    n = len(pts)
    mx, mv = sum(pts) / n, sum(vals) / n
    den = sum((p - mx) ** 2 for p in pts)
    slope = sum((p - mx) * (v - mv) for p, v in zip(pts, vals)) / den
    intercept = mv - slope * mx
    resid = [v - (slope * p + intercept) for p, v in zip(pts, vals)]
    return {
        "metres_per_point": abs(slope),
        "slope": slope,
        "intercept": intercept,
        "n_ticks": n,
        "anchor_tick_position": pts[anchor_i],
        "anchor_value": anchor_value,
        "max_resid_m": max(abs(r) for r in resid),
        "median_resid_m": sorted(abs(r) for r in resid)[n // 2],
        "residuals_m": [round(r, 4) for r in resid],
    }


def page_to_ground(x: float, y: float, fit_x: dict, fit_y: dict) -> tuple[float, float]:
    """Apply the two axis fits. Northing decreases down the page, so `slope` is
    negative on the y axis and the sign is carried in the fit, not re-applied."""
    return (fit_x["slope"] * x + fit_x["intercept"], fit_y["slope"] * y + fit_y["intercept"])


def scale_disagreement(fit_metres_per_point: float, printed_denominator: float) -> dict:
    """Compare the MEASURED grid scale against the PRINTED title-block scale.

    Reported, never reconciled. A large disagreement means the PDF was refitted
    after plotting and the caption now describes a sheet that no longer exists.
    """
    printed = 0.0254 / 72.0 * printed_denominator
    return {
        "measured_m_per_pt": fit_metres_per_point,
        "printed_m_per_pt": printed,
        "printed_denominator": printed_denominator,
        "implied_denominator": fit_metres_per_point / (0.0254 / 72.0),
        "ratio": fit_metres_per_point / printed if printed else None,
        "pct_error_if_printed_trusted": (
            (printed - fit_metres_per_point) / fit_metres_per_point * 100.0
            if fit_metres_per_point
            else None
        ),
    }
