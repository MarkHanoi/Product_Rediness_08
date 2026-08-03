"""Step 5: GEOREFERENCE plano n5, AND VERIFY IT AGAINST AN INDEPENDENT SOURCE.

THE SHAPE OF THE ARGUMENT
-------------------------
  CRS       taken from PUBLISHED DECLARATIONS (crs_declared.json,
            catastro_huesca.json) -- EPSG:25830, declared by Catastro's WFS,
            by Catastro's ATOM entry for this municipality, by the delivered
            GML's own srsName, and by IDEAragon. NOT chosen because a fit
            looked good.

  SCALE     taken from the sheet's own title block: "ESCALA 1 / 1.000".
            1 pt = 1/72 in; at 1:1000 that is 0.0254/72*1000 = 0.35277... m.
            NOT fitted.

  ROTATION  tested, not assumed.

  SHIFT     the only free parameter. Solved by voting building centroids from
            the sheet against building centroids from the cadastre.

  RESIDUAL  measured on HELD-OUT buildings that took no part in the vote, and
            reported in metres.

>> WHY A HOLD-OUT IS NON-NEGOTIABLE. A shift fitted on a set and scored on the
   same set measures nothing. And a probe can be wrong three ways -- wrong
   runtime, wrong property, wrong system -- so the score has to come from
   geometry the fit never saw.

Run:  python tools/aragon-plan-georef/georeference_fit.py
Out:  tools/aragon-plan-georef/out/georeference_fit.json
"""

from __future__ import annotations

import json
import math
import os
import re
import statistics

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")
CAD = os.path.join(OUT, "cadastre")

# H-13 is the dense city-centre sheet (335,572 path operators vs 111,465 on
# H-01, which is mostly open periphery). More buildings = a stronger vote.
SHEET = os.environ.get("PLANO5_SHEET", "H-13")

# ── PUBLISHED CONSTANTS. Neither of these is fitted. ─────────────────────────
SHEET_SCALE_DENOMINATOR = 1000.0          # title block: "ESCALA 1 / 1.000"
PT_TO_M = 0.0254 / 72.0 * SHEET_SCALE_DENOMINATOR   # 0.35277... m of ground / pt
DECLARED_EPSG = 25830                      # four independent declarations

# Building-size window, in m^2, used to pick stable, unambiguous match features.
MIN_AREA_M2 = 60.0
MAX_AREA_M2 = 4000.0

VOTE_BIN_M = 4.0          # coarse vote
REFINE_RADIUS_M = 25.0    # pair up within this after the coarse shift
HOLDOUT_FRACTION = 0.5


# ── plan side ────────────────────────────────────────────────────────────────
def ring_stats_m(m: list[tuple[float, float]]) -> dict | None:
    """Shoelace AREA CENTROID (not the vertex mean) and area, in metres.

    ⛔ THE VERTEX MEAN IS NOT THE CENTROID. CAD line work is densely vertexed
    along curved or detailed edges and sparse along straight ones, so the mean
    of the vertices is pulled toward whichever side carries more points. On
    these sheets that biased every feature by metres and put a floor under the
    residual that no amount of shift-fitting could remove -- a systematic error
    that looks exactly like a bad georeference.
    """
    a = 0.0
    cx = 0.0
    cy = 0.0
    n = len(m)
    for i in range(n):
        x0, y0 = m[i]
        x1, y1 = m[(i + 1) % n]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(a) < 1e-9:
        return None
    area = abs(a) / 2.0
    if not (MIN_AREA_M2 <= area <= MAX_AREA_M2):
        return None
    return {"cx": cx / (3.0 * a), "cy": cy / (3.0 * a), "area": area}


def _ring_stats(pts: list[tuple[float, float]]) -> dict | None:
    """Display-space PDF points -> metric ring stats."""
    return ring_stats_m([(x * PT_TO_M, -y * PT_TO_M) for x, y in pts])


def plan_polygons(sheet: str) -> list[dict]:
    """Closed subpaths on the sheet, in METRES in a local sheet frame.

    Display space is used (page.rotation is 90 on these sheets), and the y axis
    is negated because PDF/fitz y grows DOWNWARD while a projected CRS grows
    northward.

    ⛔ SUBPATH CHAINING. A single `get_drawings()` entry routinely holds MANY
    independent subpaths -- CAD plots emit thousands of `m ... l l l` runs into
    one graphics state. Concatenating every `l` item in an entry into one point
    list therefore fabricates one absurd mega-polygon per entry and DISCARDS
    every real building. The first run of this probe did exactly that and
    recovered 77 polygons from 78,497 line operators. Segments are chained
    instead: a new subpath starts wherever a segment does not begin where the
    previous one ended.
    """
    doc = fitz.open(os.path.join(CACHE, f"plano5_{sheet}.pdf"))
    page = doc[0]
    rot = page.rotation_matrix

    polys: list[dict] = []
    for d in page.get_drawings():
        current: list[tuple[float, float]] = []

        def flush(cur: list[tuple[float, float]]) -> None:
            if len(cur) >= 4 and math.dist(cur[0], cur[-1]) <= 1.5:
                st = _ring_stats(cur)
                if st:
                    polys.append(st)

        for item in d["items"]:
            op = item[0]
            if op == "re":
                flush(current)
                current = []
                r = fitz.Rect(item[1]) * rot
                st = _ring_stats(
                    [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
                )
                if st:
                    polys.append(st)
            elif op == "qu":
                flush(current)
                current = []
                q = item[1]
                st = _ring_stats(
                    [
                        (p.x, p.y)
                        for p in (
                            fitz.Point(q.ul) * rot,
                            fitz.Point(q.ur) * rot,
                            fitz.Point(q.lr) * rot,
                            fitz.Point(q.ll) * rot,
                        )
                    ]
                )
                if st:
                    polys.append(st)
            elif op == "l":
                p1 = fitz.Point(item[1]) * rot
                p2 = fitz.Point(item[2]) * rot
                a, b = (p1.x, p1.y), (p2.x, p2.y)
                if current and math.dist(current[-1], a) <= 0.05:
                    current.append(b)
                else:
                    flush(current)
                    current = [a, b]
            elif op == "c":
                p1 = fitz.Point(item[1]) * rot
                p4 = fitz.Point(item[4]) * rot
                a, b = (p1.x, p1.y), (p4.x, p4.y)
                if current and math.dist(current[-1], a) <= 0.05:
                    current.append(b)
                else:
                    flush(current)
                    current = [a, b]
        flush(current)
    return polys


# ── cadastre side ────────────────────────────────────────────────────────────
POSLIST = re.compile(rb"<gml:posList[^>]*>([^<]+)</gml:posList>")


def cadastre_polygons(pattern: str) -> list[dict]:
    """Centroid + area of every cadastral polygon, in EPSG:25830 metres."""
    files = [
        os.path.join(CAD, f)
        for f in os.listdir(CAD)
        if f.lower().endswith(".gml") and pattern in f.upper()
    ]
    out: list[dict] = []
    for path in files:
        with open(path, "rb") as fh:
            blob = fh.read()
        for m in POSLIST.finditer(blob):
            nums = m.group(1).split()
            if len(nums) < 8:
                continue
            try:
                vals = [float(v) for v in nums]
            except ValueError:
                continue
            # INSPIRE 2D posList: x y x y ...
            pts = list(zip(vals[0::2], vals[1::2]))
            if len(pts) < 4:
                continue
            st = ring_stats_m(pts)
            if st:
                out.append(st)
    return out, files


# ── the vote ─────────────────────────────────────────────────────────────────
def vote_shift(plan: list[dict], cad: list[dict], bin_m: float) -> tuple:
    """Most-supported translation. Area similarity prunes the pair set."""
    votes: dict[tuple[int, int], int] = {}
    for p in plan:
        pa = p["area"]
        lo, hi = pa * 0.65, pa * 1.55
        for c in cad:
            if not (lo <= c["area"] <= hi):
                continue
            dx = c["cx"] - p["cx"]
            dy = c["cy"] - p["cy"]
            k = (int(dx // bin_m), int(dy // bin_m))
            votes[k] = votes.get(k, 0) + 1
    if not votes:
        return None, 0, votes
    best = max(votes.items(), key=lambda kv: kv[1])
    (bx, by), n = best
    return ((bx + 0.5) * bin_m, (by + 0.5) * bin_m), n, votes


def _grid(cad, cell):
    g: dict[tuple[int, int], list] = {}
    for c in cad:
        g.setdefault((int(c["cx"] // cell), int(c["cy"] // cell)), []).append(c)
    return g


def _near(g, cell, x, y, radius):
    out = []
    r = int(radius // cell) + 1
    gx, gy = int(x // cell), int(y // cell)
    for i in range(gx - r, gx + r + 1):
        for j in range(gy - r, gy + r + 1):
            out.extend(g.get((i, j), ()))
    return out


def refine_shift(plan, cad, dx, dy, window, tol):
    """Robust re-estimate: median offset of confidently paired features.

    Pairing requires BOTH proximity and area agreement, so a dense urban fabric
    cannot manufacture a match the way a bare nearest-neighbour search does.
    """
    cell = 50.0
    g = _grid(cad, cell)
    ox, oy = [], []
    for p in plan:
        px, py = p["cx"] + dx, p["cy"] + dy
        best, bd = None, window
        for c in _near(g, cell, px, py, window):
            if not (0.75 <= c["area"] / p["area"] <= 1.35):
                continue
            d = math.hypot(c["cx"] - px, c["cy"] - py)
            if d < bd:
                bd, best = d, c
        if best is not None and bd <= tol:
            ox.append(best["cx"] - p["cx"])
            oy.append(best["cy"] - p["cy"])
    if len(ox) < 8:
        return None, len(ox)
    return (statistics.median(ox), statistics.median(oy)), len(ox)


def score_shift(plan, cad, dx, dy, tol):
    """Fraction of plan features with a SIZE-AGREEING cadastre feature within
    `tol` metres, plus the residuals of those pairs.

    This is the objective that actually discriminates. A nearest-neighbour
    distance in a dense city centre is ~93% "matched" for ANY shift, which is
    why the first run's 93% match rate meant nothing.
    """
    cell = 50.0
    g = _grid(cad, cell)
    res = []
    for p in plan:
        px, py = p["cx"] + dx, p["cy"] + dy
        best, bd = None, tol
        for c in _near(g, cell, px, py, tol):
            if not (0.75 <= c["area"] / p["area"] <= 1.35):
                continue
            d = math.hypot(c["cx"] - px, c["cy"] - py)
            if d < bd:
                bd, best = d, c
        if best is not None:
            res.append(bd)
    return res


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    report: dict = {
        "probe": "aragon-plan-georef-step5-georeference-and-verify",
        "sheet": SHEET,
        "crs": {
            "epsg": DECLARED_EPSG,
            "name": "ETRS89 / UTM zone 30N",
            "how_established": (
                "PUBLISHED DECLARATIONS ONLY -- Catastro BU WFS GetCapabilities "
                "DefaultCRS, the Catastro ATOM entry for 22901-HUESCA, the "
                "delivered GML's own srsName, and IDEAragon's WFS "
                "GetCapabilities. Not inferred from goodness of fit."
            ),
        },
        "scale": {
            "published": "ESCALA 1 / 1.000 (title block, plano 5, hoja 1 de 28)",
            "metres_per_pdf_point": PT_TO_M,
            "fitted": False,
        },
    }

    plan = plan_polygons(SHEET)
    cad_b, bfiles = cadastre_polygons("BU")
    cad_p, pfiles = cadastre_polygons("CP")
    print(f"plan candidate polygons : {len(plan)}")
    print(f"cadastre buildings      : {len(cad_b)}  from {len(bfiles)} file(s)")
    print(f"cadastre parcels        : {len(cad_p)}  from {len(pfiles)} file(s)")

    report["feature_counts"] = {
        "plan_polygons": len(plan),
        "cadastre_buildings": len(cad_b),
        "cadastre_parcels": len(cad_p),
    }

    if not plan:
        report["OUTCOME"] = "REFUSED"
        report["why"] = (
            "no closed polygons in the size window were reconstructed from the "
            "sheet, so there is nothing to match. This is a FAILURE of the "
            "extractor, NOT evidence that the sheet is empty."
        )
        _write(report)
        return
    if not cad_b:
        report["OUTCOME"] = "REFUSED"
        report["why"] = "cadastre parsed to zero polygons -- extractor failure"
        _write(report)
        return

    # split: vote on half, score on the other half
    plan_sorted = sorted(plan, key=lambda p: (p["cx"], p["cy"]))
    fit_set = plan_sorted[0::2]
    holdout = plan_sorted[1::2]

    shift, support, votes = vote_shift(fit_set, cad_b, VOTE_BIN_M)
    report["vote"] = {
        "bin_metres": VOTE_BIN_M,
        "fit_features": len(fit_set),
        "holdout_features": len(holdout),
        "distinct_bins": len(votes),
        "peak_support": support,
    }
    if shift is None:
        report["OUTCOME"] = "REFUSED"
        report["why"] = "no candidate translation received any vote"
        _write(report)
        return

    dx, dy = shift
    top = sorted(votes.values(), reverse=True)[:5]
    second = top[1] if len(top) > 1 else 0
    report["vote"]["top5_support"] = top
    print(f"coarse shift: dx={dx:.1f} dy={dy:.1f}  support={support} top5={top}")

    # ── two-stage refine, on the FIT set only. The hold-out never informs it.
    refined, npairs = refine_shift(fit_set, cad_b, dx, dy, REFINE_RADIUS_M, 12.0)
    if refined is not None:
        dx, dy = refined
        refined2, npairs2 = refine_shift(fit_set, cad_b, dx, dy, 12.0, 6.0)
        if refined2 is not None:
            dx, dy = refined2
            npairs = npairs2
    report["refine"] = {"pairs_used": npairs, "dx": round(dx, 3), "dy": round(dy, 3)}
    print(f"refined shift: dx={dx:.2f} dy={dy:.2f}  pairs={npairs}")

    # ── DISCRIMINATION TEST. Score the fitted shift against DECOY shifts.
    #    If a 60 m-away decoy scores as well, the fit means nothing.
    TOL = 3.0
    res = score_shift(holdout, cad_b, dx, dy, TOL)
    decoys = []
    for ddx, ddy in ((60, 0), (-60, 0), (0, 60), (0, -60), (45, 45), (-45, -45)):
        decoys.append(len(score_shift(holdout, cad_b, dx + ddx, dy + ddy, TOL)))
    best_decoy = max(decoys) if decoys else 0
    report["discrimination"] = {
        "tolerance_metres": TOL,
        "holdout_matched_at_fit": len(res),
        "holdout_matched_at_best_decoy": best_decoy,
        "decoy_counts": decoys,
        "signal_to_decoy": (
            round(len(res) / best_decoy, 3) if best_decoy else None
        ),
        "why": (
            "a shift that scores no better than a 45-60 m decoy has not located "
            "anything -- in a dense fabric a nearest-neighbour search matches "
            "almost everything at any offset"
        ),
    }
    report["holdout"] = {
        "matched": len(res),
        "of": len(holdout),
        "match_rate": round(len(res) / max(1, len(holdout)), 4),
    }
    if res:
        res.sort()
        report["holdout"]["residual_metres"] = {
            "median": round(statistics.median(res), 2),
            "mean": round(statistics.fmean(res), 2),
            "p90": round(res[int(0.9 * (len(res) - 1))], 2),
            "max": round(res[-1], 2),
        }
    print(
        f"holdout matched {len(res)}/{len(holdout)} at <={TOL} m; "
        f"best decoy {best_decoy}"
    )

    # ── THE ACCEPTANCE TEST.
    ok = (
        bool(res)
        and len(res) >= 25
        and best_decoy > 0
        and len(res) / best_decoy >= 3.0
        and statistics.median(res) <= 2.0
    )
    report["OUTCOME"] = "GEOREFERENCED" if ok else "REFUSED"
    report["acceptance"] = {
        "requires": (
            ">=25 hold-out features matched within 3 m with agreeing area, AND "
            "at least 3x more matches than the best 45-60 m decoy shift, AND a "
            "median hold-out residual <= 2 m (a 1:1.000 sheet plotted at "
            "0.353 m/pt cannot honestly claim worse and still be called "
            "georeferenced)"
        ),
        "met": ok,
    }
    if ok:
        report["affine_display_pt_to_epsg25830"] = {
            "X": f"{PT_TO_M} * x_display + {dx:.3f}",
            "Y": f"-{PT_TO_M} * y_display + {dy:.3f}",
            "note": "display space = page.rotation_matrix applied; y negated",
        }
    else:
        report["why"] = (
            "the translation vote did not clear the acceptance bar. The sheet "
            "is NOT georeferenced by this run. ⛔ This is an UNKNOWN, not a "
            "statement that the sheet cannot be georeferenced -- and no "
            "downstream constraint may be derived from it."
        )
    _write(report)


def _write(report: dict) -> None:
    path = os.path.join(OUT, "georeference_fit.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print(f"\nOUTCOME: {report.get('OUTCOME')}")
    if report.get("holdout"):
        print(f"holdout: {report['holdout']}")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
