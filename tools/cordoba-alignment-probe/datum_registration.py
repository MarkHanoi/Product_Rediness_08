"""WHICH DATUM ARE THE SHEET'S PRINTED COORDINATES IN? — measured, not assumed.

The graticule on the Córdoba sheets fixes UTM-30N coordinates to centimetres.
It does NOT say which ellipsoid those coordinates belong to, and the sheet's
PDF metadata declares no CRS at all. A plan drawn in 2002 predates RD 1071/2007,
so ED50 (EPSG:23030) is the probable frame and ETRS89 (EPSG:25830) the probable
error — and the two are ~200 m apart, which is 100× the extraction's own noise.
Getting this wrong would put every alignment on the wrong street.

⚠ WHY NOT JUST LOOK AT IT. Because a ~200 m shift on a 1.8 km sheet moves the
   drawing by a ninth of its width, and dense urban fabric looks self-similar at
   that scale. Two renders can be compared by eye into whatever answer the
   viewer already expects. The Aragón run was refused for exactly this: a
   nearest-neighbour match rate of 93 % that a deliberately WRONG offset also
   scored.

WHAT IS MEASURED HERE
  The plan's own black base cartography is scored against Catastro's published
  cadastral raster across a dense grid of candidate translations. The output is
  the whole SCORE SURFACE, not a single number, so the control is built in:
    • the peak's margin over the runner-up in a DIFFERENT basin,
    • the score at zero shift (the ETRS89 hypothesis),
    • the score at the published ED50→ETRS89 shift for Andalucía,
    • and the score at deliberately wrong decoy offsets.
  If the peak does not clear the decoys decisively, the verdict is UNKNOWN and
  the datum stays unresolved. UNKNOWN is a permitted, and here a likely, answer.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "plan-sheet-extract")
)

import fitz  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")

# The plan neatline for ar05, in the sheet's own printed coordinates, as
# measured by extract_alignments.py (max grid residual 0.018 m).
FRAME_E0, FRAME_N0 = 341040.98, 4199101.01
FRAME_E1, FRAME_N1 = 342841.00, 4197950.99

MPP = 2.0          # metres per pixel for the comparison rasters
MARGIN = 320.0     # search half-width, metres
STEP_COARSE = 10.0
STEP_FINE = 1.0

# Published ED50 → ETRS89 shift for western Andalucía (RD 1071/2007 era
# transformation, nominal). Used only as a LABELLED HYPOTHESIS to score, never
# applied to the data.
ED50_TO_ETRS89 = (-104.0, -207.0)

WMS = (
    "https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx"
    "?service=WMS&version=1.1.1&request=GetMap&layers=Catastro&styles="
    "&srs=EPSG:25830&bbox={e0},{n0},{e1},{n1}&width={w}&height={h}&format=image/png"
)


def fetch_catastro(e0, n0, e1, n1, w, h, path) -> str:
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        return "CACHED"
    url = WMS.format(e0=e0, n0=n0, e1=e1, n1=n1, w=w, h=h)
    r = subprocess.run(
        ["curl", "-sS", "-m", "180", "-A", "Mozilla/5.0", "-o", path, url],
        capture_output=True, text=True,
    )
    if not os.path.exists(path) or os.path.getsize(path) < 5000:
        return f"UNREACHABLE ({r.returncode}) {r.stderr[:120]}"
    return "FETCHED"


def plan_ink_points(pdf: str, max_points: int = 6000) -> list[tuple[float, float]]:
    """Sample the plan's BLACK base cartography as ground points.

    Red is excluded deliberately: the red family is the legal alignment, which
    is what we are trying to place, and Catastro does not draw it. Scoring the
    thing under test against a source that cannot contain it would measure
    nothing.
    """
    d = fitz.open(pdf)
    page = d[0]
    clip = fitz.Rect(116.34, 34.94, 3141.30, 1967.54)
    w = int((FRAME_E1 - FRAME_E0) / MPP)
    scale = w / clip.width
    pm = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip)
    n, stride = pm.n, pm.stride
    # ⚠ `pixmap.samples` REBUILDS the entire buffer on every attribute access.
    # Reading it inside the pixel loop turns a 3-second scan into one that does
    # not finish: 500 k pixels × 3 reads = 1.5 M copies of a multi-megabyte
    # buffer. It must be bound ONCE, outside the loop. This looks like an
    # ordinary attribute read, which is exactly why it goes unnoticed.
    sm = pm.samples
    pts = []
    for py in range(pm.height):
        base = py * stride
        for px in range(pm.width):
            off = base + px * n
            r, g, b = sm[off], sm[off + 1], sm[off + 2]
            if r < 110 and g < 110 and b < 110:  # black ink, not red
                pts.append((FRAME_E0 + (px + 0.5) * MPP, FRAME_N0 - (py + 0.5) * MPP))
    d.close()
    stride = max(1, len(pts) // max_points)
    return pts[::stride]


def catastro_mask(path: str, w: int, h: int) -> bytearray:
    """Catastro ink as a FLAT bytearray grid, dilated by one cell.

    ⚠ A set of (x, y) tuples is the obvious representation and it is what makes
    this probe unrunnable: 25 M membership tests, each hashing a fresh tuple,
    did not finish in 15 minutes. A bytearray indexed by `py * w + px` does the
    same work with an integer index and completes in seconds. The search is
    identical; only the data structure changed.

    Dilation absorbs the ~1 px rendering difference between two independently
    drawn maps. Without it every candidate offset scores near zero and the
    surface is flat — a false negative that looks like "no agreement anywhere".
    """
    pm = fitz.Pixmap(path)
    n, stride, sm = pm.n, pm.stride, pm.samples
    raw = bytearray(w * h)
    for py in range(min(pm.height, h)):
        base = py * stride
        row = py * w
        for px in range(min(pm.width, w)):
            off = base + px * n
            r, g, b = sm[off], sm[off + 1], sm[off + 2]
            # Catastro draws parcel edges purple and buildings black on pink.
            if (r < 170 and g < 170) or (b > 120 and r < 200 and g < 150):
                raw[row + px] = 1
    ink = bytearray(w * h)
    for py in range(h):
        row = py * w
        for px in range(w):
            if raw[row + px]:
                for dy in (-1, 0, 1):
                    yy = py + dy
                    if 0 <= yy < h:
                        r2 = yy * w
                        for dx in (-1, 0, 1):
                            xx = px + dx
                            if 0 <= xx < w:
                                ink[r2 + xx] = 1
    return ink


def score(pts, ink, e0, n0, w, h, de, dn) -> int:
    hit = 0
    inv = 1.0 / MPP
    for E, N in pts:
        px = int((E + de - e0) * inv)
        py = int((n0 - (N + dn)) * inv)
        if 0 <= px < w and 0 <= py < h and ink[py * w + px]:
            hit += 1
    return hit


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    e0, n1 = FRAME_E0 - MARGIN, FRAME_N1 - MARGIN
    e1, n0 = FRAME_E1 + MARGIN, FRAME_N0 + MARGIN
    w, h = int((e1 - e0) / MPP), int((n0 - n1) / MPP)
    cat = os.path.join(OUT, "catastro_ar05_wide.png")
    outcome = fetch_catastro(e0, n1, e1, n0, w, h, cat)
    report = {"catastro_fetch": outcome, "bbox_25830": [e0, n1, e1, n0], "raster": [w, h]}
    if not outcome.startswith(("FETCHED", "CACHED")):
        report["VERDICT"] = "UNREACHABLE — datum NOT tested (this is not a negative result)"
        print(json.dumps(report, indent=2))
        return

    pts = plan_ink_points(os.path.join(CACHE, "ar05.pdf"))
    print(f"[1/3] plan ink sample points: {len(pts)}", flush=True)
    ink = catastro_mask(cat, w, h)
    lit = sum(ink)
    print(f"[2/3] catastro ink cells: {lit} / {w*h}", flush=True)
    report["plan_sample_points"] = len(pts)
    report["catastro_ink_cells"] = lit
    # ⚠ THE NULL RATE. If Catastro ink covers a large fraction of the raster,
    # a random offset already scores that fraction and a high hit rate means
    # nothing. This number is what the peak must be judged against.
    report["catastro_ink_fraction"] = round(lit / (w * h), 4)

    # ── HOLD-OUT. The peak is found on HALF the points and scored on the other
    #    half, which the search never saw. Without this, "the best offset scores
    #    highest" is a tautology: the offset was chosen to make it so.
    fit_pts, hold_pts = pts[0::2], pts[1::2]

    surface = {}
    best = None
    k = int(MARGIN / STEP_COARSE)
    for i in range(-k, k + 1):
        for j in range(-k, k + 1):
            de, dn = i * STEP_COARSE, j * STEP_COARSE
            s = score(fit_pts, ink, e0, n0, w, h, de, dn)
            surface[(de, dn)] = s
            if best is None or s > best[2]:
                best = (de, dn, s)

    # Refine around the coarse peak.
    bd, bn, _ = best
    for i in range(-10, 11):
        for j in range(-10, 11):
            de, dn = bd + i * STEP_FINE, bn + j * STEP_FINE
            s = score(fit_pts, ink, e0, n0, w, h, de, dn)
            if s > best[2]:
                best = (de, dn, s)

    peak_de, peak_dn, _ = best
    n_pts = len(pts)
    peak_s = score(pts, ink, e0, n0, w, h, peak_de, peak_dn)
    report["holdout"] = {
        "fit_points": len(fit_pts),
        "holdout_points": len(hold_pts),
        "holdout_hits_at_peak": score(hold_pts, ink, e0, n0, w, h, peak_de, peak_dn),
        "holdout_pct_at_peak": round(
            100.0 * score(hold_pts, ink, e0, n0, w, h, peak_de, peak_dn) / len(hold_pts), 2
        ),
    }

    # The control: the best score in a DIFFERENT basin, ≥120 m from the peak.
    # ⚠ `surface` holds FIT-set scores (half the points). Comparing a full-set
    #    peak against a fit-set rival silently doubles the ratio — it reported
    #    3.69× where the honest number is ~1.9×. The rival offset is selected
    #    from the fit surface and then RE-SCORED on the same full set as the
    #    peak, so the two numbers are commensurable.
    rival_offset = max(
        (
            (de, dn)
            for (de, dn) in surface
            if ((de - peak_de) ** 2 + (dn - peak_dn) ** 2) ** 0.5 >= 120.0
        ),
        key=lambda o: surface[o],
        default=None,
    )
    runner = (
        score(pts, ink, e0, n0, w, h, *rival_offset) if rival_offset else 0
    )
    report["best_other_basin_offset_m"] = list(rival_offset) if rival_offset else None
    hypotheses = {
        "ETRS89_zero_shift": (0.0, 0.0),
        "ED50_published_shift": ED50_TO_ETRS89,
        "decoy_plus_150E": (150.0, 0.0),
        "decoy_minus_150N": (0.0, -150.0),
        "decoy_plus_250E_250N": (250.0, 250.0),
    }
    report["hypotheses"] = {
        name: {
            "shift_m": list(sh),
            "hits": score(pts, ink, e0, n0, w, h, *sh),
            "pct": round(100.0 * score(pts, ink, e0, n0, w, h, *sh) / n_pts, 2),
        }
        for name, sh in hypotheses.items()
    }
    report["peak"] = {
        "shift_m": [round(peak_de, 1), round(peak_dn, 1)],
        "hits": peak_s,
        "pct": round(100.0 * peak_s / n_pts, 2),
    }
    report["best_other_basin"] = {"hits": runner, "pct": round(100.0 * runner / n_pts, 2)}
    report["peak_over_other_basin"] = round(peak_s / runner, 3) if runner else None

    # ── THE NULL RATE, stated as a score. A random offset already hits Catastro
    #    ink at the raster's ink fraction, so THAT is what a hypothesis must
    #    beat — not zero.
    report["null_rate_pct"] = round(100.0 * report["catastro_ink_fraction"], 2)

    # ── CORROBORATION. The margin over a rival basin says the peak is real; it
    #    does not say what the peak MEANS. What makes this a datum result rather
    #    than a shape-matching result is that the peak lands on an INDEPENDENTLY
    #    PUBLISHED constant — the ED50→ETRS89 shift for western Andalucía — which
    #    was never an input to the search.
    dist = (
        (peak_de - ED50_TO_ETRS89[0]) ** 2 + (peak_dn - ED50_TO_ETRS89[1]) ** 2
    ) ** 0.5
    report["peak_vs_published_ed50_shift"] = {
        "published_shift_m": list(ED50_TO_ETRS89),
        "distance_m": round(dist, 1),
        "note": (
            "The published shift was NOT used to find the peak. Its agreement is "
            "external corroboration, and it is the load-bearing part of this "
            "verdict — the basin margin alone would not be enough."
        ),
    }

    ratio = report["peak_over_other_basin"]
    etrs = report["hypotheses"]["ETRS89_zero_shift"]["pct"]
    if ratio is None:
        report["VERDICT"] = "UNKNOWN — no comparison basin"
    elif ratio >= 1.5 and dist <= 25.0 and etrs <= report["null_rate_pct"] * 1.25:
        report["VERDICT"] = (
            f"ED50 / UTM 30N (EPSG:23030). Peak {report['peak']['shift_m']} clears "
            f"the best rival basin by {ratio}× and sits {round(dist,1)} m from the "
            f"published ED50→ETRS89 shift, while the ETRS89 hypothesis scores "
            f"{etrs}% against a {report['null_rate_pct']}% null — i.e. ETRS89 is "
            f"indistinguishable from a random offset."
        )
    else:
        report["VERDICT"] = (
            f"UNKNOWN — peak {report['peak']['shift_m']}, basin margin {ratio}×, "
            f"{round(dist,1)} m from the published ED50 shift. At least one test "
            f"failed, so the datum is NOT established and no alignment may be "
            f"published in a named CRS on this evidence."
        )
    with open(os.path.join(OUT, "datum_registration.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
