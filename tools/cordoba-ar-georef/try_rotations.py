"""Diagnostic: georeference_fit.py found essentially NO signal (peak vote
support ~1-2% of the fit-set size, signal-to-decoy <= 2.0) at every candidate
scale, which is consistent with a WRONG orientation assumption rather than
just a wrong scale -- if the sheet's display space is not north-up the way
Aragon's H-13 sheet was, no scale search would ever find a real correspondence.

Tries an EXTRA 0/90/180/270 rotation on top of the already-applied
page.rotation_matrix, plus an x-mirror, at a couple of scales, to see whether
ANY orientation produces a real signal (defined as signal_to_decoy >= 3 at
ANY tested combination) before concluding the vote method itself has failed
here (as opposed to just the orientation guess).

Run:  python tools/cordoba-ar-georef/try_rotations.py ar26
"""

from __future__ import annotations

import json
import math
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

sys.path.insert(0, HERE)
from georeference_fit import (  # noqa: E402
    cadastre_polygons,
    ring_stats_m,
    vote_shift,
    refine_shift,
    score_shift,
    VOTE_BIN_M,
    REFINE_RADIUS_M,
)


def transform(x, y, pt_to_m, mode):
    # mode applies an EXTRA rotation/mirror on top of display-space (x,y)
    # before the standard (x*s, -y*s) UTM convention.
    if mode == "identity":
        X, Y = x, y
    elif mode == "rot90":
        X, Y = -y, x
    elif mode == "rot180":
        X, Y = -x, -y
    elif mode == "rot270":
        X, Y = y, -x
    elif mode == "mirror_x":
        X, Y = -x, y
    else:
        raise ValueError(mode)
    return X * pt_to_m, -Y * pt_to_m


def plan_polygons_m(sheet, pt_to_m, mode):
    with open(os.path.join(OUT, f"{sheet}_extracted.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    out = []
    for ring in data["black_rings"]:
        pts_m = [transform(x, y, pt_to_m, mode) for x, y in ring["points"]]
        st = ring_stats_m(pts_m)
        if st:
            out.append(st)
    return out


def main():
    sheet = sys.argv[1] if len(sys.argv) > 1 else "ar26"
    cad = cadastre_polygons()
    print(f"{len(cad)} cadastre buildings in window")

    best = None
    for scale in (500, 1000, 2000):
        pt_to_m = 0.0254 / 72.0 * scale
        for mode in ("identity", "rot90", "rot180", "rot270", "mirror_x"):
            plan = plan_polygons_m(sheet, pt_to_m, mode)
            if len(plan) < 20:
                continue
            plan_sorted = sorted(plan, key=lambda p: (p["cx"], p["cy"]))
            fit_set = plan_sorted[0::2]
            holdout = plan_sorted[1::2]
            shift, support, votes = vote_shift(fit_set, cad, VOTE_BIN_M)
            if shift is None:
                print(f"scale=1:{scale} mode={mode} -> no vote")
                continue
            dx, dy = shift
            refined, npairs = refine_shift(fit_set, cad, dx, dy, REFINE_RADIUS_M, 12.0)
            if refined:
                dx, dy = refined
            res = score_shift(holdout, cad, dx, dy, 3.0)
            decoys = [
                len(score_shift(holdout, cad, dx + ddx, dy + ddy, 3.0))
                for ddx, ddy in ((60, 0), (-60, 0), (0, 60), (0, -60), (45, 45), (-45, -45))
            ]
            best_decoy = max(decoys) if decoys else 0
            s2d = (len(res) / best_decoy) if best_decoy else (float("inf") if res else 0)
            print(
                f"scale=1:{scale} mode={mode} plan_n={len(plan)} peak_support={support} "
                f"holdout_matched={len(res)}/{len(holdout)} best_decoy={best_decoy} s2d={s2d:.2f}"
            )
            if best is None or s2d > best[0]:
                best = (s2d, scale, mode, len(res), best_decoy)

    print("\nBEST:", best)


if __name__ == "__main__":
    main()
