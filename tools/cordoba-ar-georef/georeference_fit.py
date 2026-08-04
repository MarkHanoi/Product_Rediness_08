"""Step 3: GEOREFERENCE ar26.pdf against Catastro buildings, AND VERIFY IT ON
A HELD-OUT SET -- same shape as tools/aragon-plan-georef/georeference_fit.py.

⚠ UNLIKE THE ARAGON CASE, THE AR SHEET'S SCALE IS NOT KNOWN FROM A READABLE
TITLE-BLOCK STRING (no embedded text at all -- see the feasibility doc). We
therefore do NOT assume a scale. Instead this script SEARCHES a small set of
plausible round-number scale denominators (the ones a Spanish municipal
alineaciones-y-rasantes sheet could plausibly be plotted at), and for EACH
candidate scale runs the full vote -> refine -> holdout -> decoy-discrimination
procedure independently. Only a candidate that clears the SAME acceptance bar
Aragon used is reported as georeferenced. If more than one candidate clears
the bar, or none does, that is reported honestly -- guessing is not scoring.

CRS is NOT guessed either: EPSG:25830 comes from the GML's own `srsName`
(three separate declarations, checked in fetch_catastro_cordoba.py's output),
matching the earlier CUS-sheet visual UTM zone-30N tick readings.

Run:  python tools/cordoba-ar-georef/georeference_fit.py ar26
Out:  tools/cordoba-ar-georef/out/ar26_georeference_fit.json
"""

from __future__ import annotations

import json
import math
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CAD = os.path.join(OUT, "cadastre")

DECLARED_EPSG = 25830

# Candidate round-number scale denominators for a Spanish municipal
# alineaciones-y-rasantes sheet. Not a guess used to produce the transform --
# a search space, each member independently tested and scored.
CANDIDATE_SCALES = [500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000]

MIN_AREA_M2 = 30.0
MAX_AREA_M2 = 3000.0

VOTE_BIN_M = 4.0
REFINE_RADIUS_M = 25.0

# Coarse bbox used ONLY to bound how much of the (huge, whole-municipality)
# cadastre file is even loaded -- a performance filter, not part of the
# transform. Derived from the earlier visual (eyeballed, NOT precision-grade)
# corner-tick reads in GEOREFERENCING-FEASIBILITY-2026-08-04.md
# ("342841"/"4195651" on ar26's own corner) plus this session's general
# Cordoba UTM-zone-30N recon (easting ~330-350k, northing ~4190-4205k),
# padded generously so a wrong scale candidate cannot walk the sheet's
# reconstructed geometry outside the window.
BBOX_EASTING = (330000.0, 352000.0)
BBOX_NORTHING = (4188000.0, 4206000.0)

POSLIST = re.compile(rb"<gml:posList[^>]*>([^<]+)</gml:posList>")


def ring_stats_m(pts_m: list[tuple[float, float]]) -> dict | None:
    """Shoelace area centroid (NOT vertex mean -- see aragon-plan-georef for
    why the vertex mean is systematically biased on densely-vertexed CAD
    line work)."""
    a = 0.0
    cx = 0.0
    cy = 0.0
    n = len(pts_m)
    for i in range(n):
        x0, y0 = pts_m[i]
        x1, y1 = pts_m[(i + 1) % n]
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


def plan_polygons_m(sheet: str, pt_to_m: float) -> list[dict]:
    extracted_path = os.path.join(OUT, f"{sheet}_extracted.json")
    with open(extracted_path, encoding="utf-8") as fh:
        data = json.load(fh)
    out = []
    for ring in data["black_rings"]:
        pts_m = [(x * pt_to_m, -y * pt_to_m) for x, y in ring["points"]]
        st = ring_stats_m(pts_m)
        if st:
            out.append(st)
    return out


_cadastre_cache: list[dict] | None = None


def cadastre_polygons() -> list[dict]:
    """Centroid + area of every Catastro BUILDING polygon in EPSG:25830
    metres, restricted to BBOX_* (performance filter only)."""
    global _cadastre_cache
    if _cadastre_cache is not None:
        return _cadastre_cache
    path = os.path.join(CAD, "A.ES.SDGC.BU.14900.building.gml")
    out: list[dict] = []
    with open(path, "rb") as fh:
        blob = fh.read()
    ex, ey = BBOX_EASTING, BBOX_NORTHING
    for m in POSLIST.finditer(blob):
        nums = m.group(1).split()
        if len(nums) < 8:
            continue
        try:
            vals = [float(v) for v in nums]
        except ValueError:
            continue
        pts = list(zip(vals[0::2], vals[1::2]))
        if len(pts) < 4:
            continue
        # cheap bbox pre-check on the first vertex before full shoelace
        x0, y0 = pts[0]
        if not (ex[0] - 500 <= x0 <= ex[1] + 500 and ey[0] - 500 <= y0 <= ey[1] + 500):
            continue
        st = ring_stats_m(pts)
        if st and ex[0] <= st["cx"] <= ex[1] and ey[0] <= st["cy"] <= ey[1]:
            out.append(st)
    _cadastre_cache = out
    return out


def vote_shift(plan, cad, bin_m):
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


def try_scale(sheet: str, scale_denom: float, cad: list[dict]) -> dict:
    pt_to_m = 0.0254 / 72.0 * scale_denom
    plan = plan_polygons_m(sheet, pt_to_m)
    entry: dict = {
        "scale_denominator": scale_denom,
        "metres_per_pdf_point": pt_to_m,
        "plan_polygons_in_window": len(plan),
    }
    if len(plan) < 20:
        entry["OUTCOME"] = "REFUSED"
        entry["why"] = "fewer than 20 candidate rings in the plausible building-area window at this scale"
        return entry

    plan_sorted = sorted(plan, key=lambda p: (p["cx"], p["cy"]))
    fit_set = plan_sorted[0::2]
    holdout = plan_sorted[1::2]

    shift, support, votes = vote_shift(fit_set, cad, VOTE_BIN_M)
    if shift is None:
        entry["OUTCOME"] = "REFUSED"
        entry["why"] = "no candidate translation received any vote"
        return entry
    dx, dy = shift
    top = sorted(votes.values(), reverse=True)[:5]
    entry["vote"] = {"fit_features": len(fit_set), "holdout_features": len(holdout), "peak_support": support, "top5_support": top}

    refined, npairs = refine_shift(fit_set, cad, dx, dy, REFINE_RADIUS_M, 12.0)
    if refined is not None:
        dx, dy = refined
        refined2, npairs2 = refine_shift(fit_set, cad, dx, dy, 12.0, 6.0)
        if refined2 is not None:
            dx, dy = refined2
            npairs = npairs2
    entry["refine"] = {"pairs_used": npairs, "dx": round(dx, 3), "dy": round(dy, 3)}

    TOL = 3.0
    res = score_shift(holdout, cad, dx, dy, TOL)
    decoys = []
    for ddx, ddy in ((60, 0), (-60, 0), (0, 60), (0, -60), (45, 45), (-45, -45)):
        decoys.append(len(score_shift(holdout, cad, dx + ddx, dy + ddy, TOL)))
    best_decoy = max(decoys) if decoys else 0
    entry["discrimination"] = {
        "holdout_matched_at_fit": len(res),
        "holdout_matched_at_best_decoy": best_decoy,
        "decoy_counts": decoys,
        "signal_to_decoy": round(len(res) / best_decoy, 3) if best_decoy else None,
    }
    entry["holdout"] = {"matched": len(res), "of": len(holdout), "match_rate": round(len(res) / max(1, len(holdout)), 4)}
    if res:
        res.sort()
        entry["holdout"]["residual_metres"] = {
            "median": round(statistics.median(res), 2),
            "mean": round(statistics.fmean(res), 2),
            "p90": round(res[int(0.9 * (len(res) - 1))], 2),
            "max": round(res[-1], 2),
        }

    ok = (
        bool(res)
        and len(res) >= 25
        and best_decoy > 0
        and len(res) / best_decoy >= 3.0
        and statistics.median(res) <= 2.0
    )
    entry["OUTCOME"] = "GEOREFERENCED" if ok else "REFUSED"
    entry["dx"], entry["dy"] = dx, dy
    return entry


def main() -> None:
    sheet = sys.argv[1] if len(sys.argv) > 1 else "ar26"
    os.makedirs(OUT, exist_ok=True)

    print("loading cadastre buildings in bbox window ...")
    cad = cadastre_polygons()
    print(f"  {len(cad)} cadastre building polygons in window")

    report: dict = {
        "probe": "cordoba-ar-georef-step3",
        "sheet": sheet,
        "crs": {
            "epsg": DECLARED_EPSG,
            "how_established": "GML srsName (3 declarations, see fetch_catastro_cordoba.py output), matching UTM zone 30N visual tick reads",
        },
        "cadastre_window": {"bbox_easting": BBOX_EASTING, "bbox_northing": BBOX_NORTHING, "n_buildings_in_window": len(cad)},
        "scale_search": [],
    }

    if len(cad) < 50:
        report["OUTCOME"] = "REFUSED"
        report["why"] = "too few cadastre buildings loaded in the bbox window -- widen BBOX_* or check the fetch step"
        _write(sheet, report)
        return

    results = []
    for s in CANDIDATE_SCALES:
        print(f"trying scale 1:{s} ...")
        entry = try_scale(sheet, s, cad)
        print(f"  -> {entry.get('OUTCOME')}  holdout={entry.get('holdout')}")
        report["scale_search"].append(entry)
        results.append(entry)

    passing = [e for e in results if e.get("OUTCOME") == "GEOREFERENCED"]
    if not passing:
        report["OUTCOME"] = "REFUSED"
        report["why"] = (
            "no candidate scale in CANDIDATE_SCALES cleared the acceptance bar "
            "(>=25 holdout matches within 3m, >=3x best-decoy signal, median "
            "residual <=2m). This is an UNKNOWN, not a statement that the sheet "
            "cannot be georeferenced by this method -- either the true scale is "
            "not in the candidate list, or the black-bucket rings are not "
            "predominantly individual buildings on this sheet (they may be a "
            "mix of buildings/parcels/calzada outlines the area filter did not "
            "cleanly separate)."
        )
    elif len(passing) == 1:
        e = passing[0]
        report["OUTCOME"] = "GEOREFERENCED"
        report["accepted_scale"] = e["scale_denominator"]
        report["affine_display_pt_to_epsg25830"] = {
            "metres_per_pdf_point": e["metres_per_pdf_point"],
            "X": f"{e['metres_per_pdf_point']} * x_display + {e['dx']:.3f}",
            "Y": f"-{e['metres_per_pdf_point']} * y_display + {e['dy']:.3f}",
            "note": "display space = page.rotation_matrix applied (rot=270); y negated",
        }
    else:
        report["OUTCOME"] = "AMBIGUOUS"
        report["why"] = (
            f"{len(passing)} candidate scales all cleared the acceptance bar "
            "-- the black-ring population does not discriminate scale cleanly "
            "enough on its own (a scaled copy of a real building layout can "
            "spuriously re-match a differently-scaled cadastre subset). Report "
            "as UNRESOLVED, do not pick the 'best' one silently."
        )
        report["passing_scales"] = [e["scale_denominator"] for e in passing]

    _write(sheet, report)


def _write(sheet: str, report: dict) -> None:
    path = os.path.join(OUT, f"{sheet}_georeference_fit.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print(f"\nOUTCOME: {report.get('OUTCOME')}")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
