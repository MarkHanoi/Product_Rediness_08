#!/usr/bin/env python3
"""
PHASE 4 — the nDSM per-building height pipeline (North Star §6.4.2), 12 stages.

WHAT RUNS HERE vs WHAT IS STUBBED
--------------------------------
The DEFENSIBLE IP is "everything after DSM − DTM": footprint conditioning, the ERODED-footprint
sample, robust statistics (P90 / trimmed-median, NEVER max), the TERRAIN-PLANE ground fit, roof
segmentation, confidence + provenance. Those algorithmic cores are implemented here in PURE STDLIB
and are PROVEN by the `__main__` self-test on synthetic points — no LiDAR library required, so the
honesty rules are testable on the bare Python that ships here (3.14).

The heavy STAGES (LiDAR read, CRS reprojection, DTM/DSM raster, roof-plane RANSAC) need
pdal/laspy/rasterio/open3d, which are ABSENT here (see `check_deps()`), so they are documented stubs
that raise `MissingDependency`. This is deliberate: NEVER fabricate a LiDAR run — either the libs are
installed and the tile is real, or the stage refuses. The synthetic self-test exercises the maths, not
a faked measurement.

HONESTY INVARIANTS (North Star §6.6 C-CONTEXT §2/§3; enforced by the self-test):
  • the building height is P90/trimmed-median of the nDSM, NEVER the peak (chimneys/antennae);
  • sampling uses the footprint ERODED inward (buffer −0.5 m) so façade/overhang points don't leak in;
  • ground is a TERRAIN-PLANE fit under the building (handles slope), not a single sample (fixes L-584);
  • every emitted HeightProfile carries provenance + confidence — a value without them cannot ship.

Output = a dict matching `@pryzm/schemas` HeightProfile (packages/schemas/src/site/context/heightProfile.ts)
field-for-field, so the Python engine and the L0 Zod schema are one contract.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

ALGORITHM_VERSION = "height-engine-0.1.0-scaffold"
EROSION_BUFFER_M = 0.5            # inward buffer for the eroded footprint (§6.4 stage 7)
Point3 = tuple[float, float, float]
Ring = Sequence[tuple[float, float]]   # closed-ish 2D ring in the tile's metric CRS


class MissingDependency(RuntimeError):
    """Raised by a stage that needs a LiDAR/raster lib which is not installed. Never a silent skip."""


def check_deps() -> dict[str, bool]:
    """Report which heavy libs are importable. The build farm requires all True; the scaffold needs none."""
    present: dict[str, bool] = {}
    for mod in ("pdal", "laspy", "rasterio", "shapely", "numpy", "scipy", "open3d"):
        try:
            __import__(mod)
            present[mod] = True
        except Exception:
            present[mod] = False
    return present


# ═════════════════════════════════════════════════════════════════════════════════════════════════
# THE RUNNABLE HONESTY CORE (pure stdlib) — stages 7-11's algorithmic heart.
# ═════════════════════════════════════════════════════════════════════════════════════════════════
def percentile(values: Sequence[float], p: float) -> Optional[float]:
    """Linear-interpolated p-th percentile (0..100). None on empty. Robust roof statistic — never max."""
    xs = sorted(values)
    n = len(xs)
    if n == 0:
        return None
    if n == 1:
        return xs[0]
    rank = (p / 100.0) * (n - 1)
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return xs[int(rank)]
    return xs[lo] + (xs[hi] - xs[lo]) * (rank - lo)


def trimmed_median(values: Sequence[float], trim: float = 0.10) -> Optional[float]:
    """Median after dropping the top+bottom `trim` fraction — rejects chimneys/antennae and dropouts."""
    xs = sorted(values)
    n = len(xs)
    if n == 0:
        return None
    k = int(n * trim)
    core = xs[k: n - k] or xs
    m = len(core)
    return core[m // 2] if m % 2 else 0.5 * (core[m // 2 - 1] + core[m // 2])


def point_in_ring(x: float, y: float, ring: Ring) -> bool:
    """Ray-casting point-in-polygon (outer ring). Robust enough for footprint sampling."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _dist_point_to_segment(x: float, y: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(x - ax, y - ay)
    t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (ax + t * dx), y - (ay + t * dy))


def min_dist_to_edges(x: float, y: float, ring: Ring) -> float:
    n = len(ring)
    return min(_dist_point_to_segment(x, y, ring[i][0], ring[i][1], ring[(i + 1) % n][0], ring[(i + 1) % n][1])
               for i in range(n))


def points_in_eroded_footprint(points: Sequence[Point3], ring: Ring, buffer_m: float = EROSION_BUFFER_M
                               ) -> list[Point3]:
    """
    §6.4 stage 7-8: keep points INSIDE the footprint AND ≥ `buffer_m` from any edge (the inward
    erosion). Dropping the edge band is what stops façade returns, roof overhangs and party-wall
    ambiguity from inflating the height — an honesty step, not an optimisation.
    """
    return [p for p in points if point_in_ring(p[0], p[1], ring) and min_dist_to_edges(p[0], p[1], ring) >= buffer_m]


def fit_plane(points: Sequence[Point3]) -> Optional[tuple[float, float, float]]:
    """
    Least-squares plane z = a·x + b·y + c via the 3×3 normal equations (pure stdlib Gaussian
    elimination). Used for the TERRAIN-PLANE ground fit from perimeter DTM points (handles slope —
    the L-584 fix: ground under the façade, not one centroid sample). None if degenerate.
    """
    n = len(points)
    if n < 3:
        return None
    sx = sy = sz = sxx = sxy = syy = sxz = syz = 0.0
    for x, y, z in points:
        sx += x; sy += y; sz += z
        sxx += x * x; sxy += x * y; syy += y * y
        sxz += x * z; syz += y * z
    A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, float(n)]]
    b = [sxz, syz, sz]
    return _solve3(A, b)


def _solve3(A: list[list[float]], b: list[float]) -> Optional[tuple[float, float, float]]:
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(3):
        piv = max(range(col, 3), key=lambda r: abs(M[r][col]))
        if abs(M[piv][col]) < 1e-12:
            return None
        M[col], M[piv] = M[piv], M[col]
        pv = M[col][col]
        M[col] = [v / pv for v in M[col]]
        for r in range(3):
            if r != col:
                f = M[r][col]
                M[r] = [v - f * M[col][k] for k, v in enumerate(M[r])]
    return (M[0][3], M[1][3], M[2][3])


def plane_z(plane: tuple[float, float, float], x: float, y: float) -> float:
    a, b, c = plane
    return a * x + b * y + c


def confidence_score(*, density_ppm2: Optional[float], roof_point_count: int, veg_fraction: float,
                     footprint_quality: float, plane_residual_m: Optional[float],
                     terrain_uncertainty_m: float) -> float:
    """
    §6.4 stage 12 — weighted 0..1 confidence (density 20 · roof-count 15 · veg 15 · footprint 15 ·
    plane-fit 20 · terrain 15). Deliberately conservative: unknown inputs pull the score DOWN, never up.
    """
    def clamp01(v: float) -> float:
        return max(0.0, min(1.0, v))
    density_s = clamp01((density_ppm2 or 0.0) / 8.0)              # ~8 ppm² saturates
    count_s = clamp01(roof_point_count / 200.0)                  # ~200 pts saturates
    veg_s = clamp01(1.0 - veg_fraction)
    fp_s = clamp01(footprint_quality)
    plane_s = 0.3 if plane_residual_m is None else clamp01(1.0 - plane_residual_m / 1.0)  # 1 m residual → 0
    terrain_s = clamp01(1.0 - terrain_uncertainty_m / 2.0)       # 2 m terrain σ → 0
    return round(
        0.20 * density_s + 0.15 * count_s + 0.15 * veg_s + 0.15 * fp_s + 0.20 * plane_s + 0.15 * terrain_s, 3
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════
# THE HEAVY STAGES (stubbed — need pdal/laspy/rasterio/open3d; NEVER fabricate a run).
# ═════════════════════════════════════════════════════════════════════════════════════════════════
def stage01_acquire(footprint_bbox, registry) -> list[str]:
    """Resolve footprint bbox → registry → download the covering .laz tiles. Needs a network + cache."""
    raise MissingDependency("stage01_acquire: needs the LiDAR tile registry + a download/cache layer")


def stage02_normalize_crs(*_a, **_k):
    raise MissingDependency("stage02_normalize_crs: needs pdal/pyproj (reproject to the tile metric CRS)")


def stage03_read_points(*_a, **_k):
    raise MissingDependency("stage03_read_points: needs laspy/pdal (XYZ + Intensity + Classification + ReturnNumber)")


def stage04_dtm(*_a, **_k):
    raise MissingDependency("stage04_dtm: needs a ground filter (class 2 / SMRF/CSF) + TIN/IDW raster (pdal/rasterio)")


def stage05_dsm(*_a, **_k):
    raise MissingDependency("stage05_dsm: needs a highest-return-per-pixel raster (pdal/rasterio)")


def stage06_ndsm(*_a, **_k):
    raise MissingDependency("stage06_ndsm: needs rasterio (DSM − DTM)")


def stage10_roof_ransac(*_a, **_k):
    """Roof-plane RANSAC → plane count → roof_type + pitch. 1=flat, 2=gable, 4=hip → approaches LoD2."""
    raise MissingDependency("stage10_roof_ransac: needs open3d/pyransac plane segmentation")


# ═════════════════════════════════════════════════════════════════════════════════════════════════
# STAGES 7-9,11-12 (runnable core) driven end-to-end on an already-extracted point set.
# ═════════════════════════════════════════════════════════════════════════════════════════════════
@dataclass
class HeightResult:
    profile: dict           # matches @pryzm/schemas HeightProfile
    diagnostics: dict


def compute_height_profile(
    *,
    roof_points: Sequence[Point3],       # candidate roof returns near/over the footprint (post stage 6)
    ground_points: Sequence[Point3],     # perimeter DTM/ground points for the terrain plane (stage 4)
    footprint: Ring,                     # footprint outer ring in the tile metric CRS
    source: str,
    epoch: Optional[str],
    density_ppm2: Optional[float] = None,
    roof_type: str = "unknown",          # from stage10 when libs present; 'unknown' otherwise (honest)
    roof_pitch_deg: Optional[float] = None,
    provenance: str = "lidar_ndsm",
) -> HeightResult:
    """
    The honesty core, stages 7-9 & 11-12, on an extracted point set. Emits a HeightProfile-shaped dict.
    Every measurement that cannot be derived stays None; provenance + confidence are always present.
    """
    # Stage 7-8 — condition + erode the footprint, sample nDSM cells inside the eroded ring.
    kept = points_in_eroded_footprint(roof_points, footprint, EROSION_BUFFER_M)

    # Stage 11 — terrain plane under the building (perimeter ground fit → handles slope; L-584 fix).
    plane = fit_plane(ground_points)
    plane_residual = None
    if plane is not None and ground_points:
        plane_residual = (sum((z - plane_z(plane, x, y)) ** 2 for x, y, z in ground_points) / len(ground_points)) ** 0.5

    # nDSM per kept roof point = roof_z − terrain_z at that (x,y). If no plane, fall back to min ground z.
    if plane is not None:
        ndsm = [z - plane_z(plane, x, y) for x, y, z in kept]
        ground_at_centroid = plane_z(plane, *_centroid(footprint))
    else:
        g0 = min((z for _, _, z in ground_points), default=None)
        ndsm = [z - g0 for _, _, z in kept] if g0 is not None else []
        ground_at_centroid = g0

    roof_abs = [z for _, _, z in kept]
    roof_p90 = percentile(roof_abs, 90.0)
    roof_median = trimmed_median(roof_abs)
    roof_peak = max(roof_abs) if roof_abs else None
    # THE canonical height is P90(nDSM) — robust, NEVER the peak.
    building_height = percentile(ndsm, 90.0)

    conf = confidence_score(
        density_ppm2=density_ppm2, roof_point_count=len(kept), veg_fraction=0.0,
        footprint_quality=1.0 if len(footprint) >= 4 else 0.3, plane_residual_m=plane_residual,
        terrain_uncertainty_m=plane_residual if plane_residual is not None else 2.0,
    )

    profile = {
        "ground_elevation_m": _round(ground_at_centroid),
        "roof_median_m": _round(roof_median),
        "roof_p90_m": _round(roof_p90),
        "roof_peak_m": _round(roof_peak),
        "building_height_m": _round(building_height),
        "height_to_parapet_m": _round(building_height) if roof_type in ("flat", "unknown") else None,
        "height_to_ridge_m": _round(roof_peak) if roof_type in ("gable", "hip", "shed") and roof_peak is not None
                               and ground_at_centroid is not None else None,
        "height_to_eaves_m": None,   # needs the roof-plane break line (stage 10)
        "roof_type": roof_type,
        "roof_pitch_deg": roof_pitch_deg,
        "floors_est": None if building_height is None else max(0, round(building_height / 3.2)),
        "confidence": conf,
        "provenance": provenance,
        "source": source,
        "epoch": epoch,
        "algorithm_version": ALGORITHM_VERSION,
    }
    diagnostics = {
        "roof_points_in": len(roof_points), "roof_points_kept_after_erosion": len(kept),
        "terrain_plane": plane, "plane_residual_m": plane_residual,
    }
    return HeightResult(profile=profile, diagnostics=diagnostics)


def _centroid(ring: Ring) -> tuple[float, float]:
    n = len(ring)
    return (sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n)


def _round(v: Optional[float], nd: int = 3) -> Optional[float]:
    return None if v is None else round(v, nd)


# ═════════════════════════════════════════════════════════════════════════════════════════════════
# SELF-TEST — proves the honesty core on SYNTHETIC points (stdlib only; NOT a LiDAR run).
# ═════════════════════════════════════════════════════════════════════════════════════════════════
def _selftest() -> None:
    # Terrain: a 2% slope plane, z = 100 + 0.02·x. Building: 20×20 m, flat roof 10 m above terrain.
    ring = [(0.0, 0.0), (20.0, 0.0), (20.0, 20.0), (0.0, 20.0)]

    def terrain(x, y):
        return 100.0 + 0.02 * x

    roof_points: list[Point3] = []
    # a dense flat roof at terrain+10, sampled on a grid inside the footprint
    for i in range(1, 20):
        for j in range(1, 20):
            x, y = float(i), float(j)
            roof_points.append((x, y, terrain(x, y) + 10.0))
    # chimneys/antennae: a few spikes at terrain+15 — MUST NOT become the height
    for x, y in [(10, 10), (11, 10), (10, 11)]:
        roof_points.append((float(x), float(y), terrain(x, y) + 15.0))
    # façade / overhang returns hugging the edge (within the 0.5 m erosion band) — MUST be dropped
    edge_pts = [(0.2, 5.0, terrain(0.2, 5.0) + 3.0), (19.8, 15.0, terrain(19.8, 15.0) + 2.0)]
    roof_points.extend(edge_pts)
    # perimeter ground points for the terrain plane fit (a ring just outside the footprint)
    ground_points: list[Point3] = [
        (x, y, terrain(x, y))
        for (x, y) in [(-2, -2), (22, -2), (22, 22), (-2, 22), (10, -2), (10, 22), (-2, 10), (22, 10)]
    ]

    res = compute_height_profile(
        roof_points=roof_points, ground_points=ground_points, footprint=ring,
        source="SYNTHETIC", epoch="2026-07", density_ppm2=10.0, roof_type="flat",
    )
    p = res.profile
    print("[selftest] profile:", {k: p[k] for k in
          ("building_height_m", "roof_p90_m", "roof_median_m", "roof_peak_m", "ground_elevation_m",
           "floors_est", "confidence", "provenance")})

    # 1) eroded footprint dropped the façade/edge points.
    assert res.diagnostics["roof_points_kept_after_erosion"] == len(roof_points) - len(edge_pts), \
        res.diagnostics
    # 2) terrain plane recovered the 2% slope.
    a, _b, _c = res.diagnostics["terrain_plane"]
    assert abs(a - 0.02) < 1e-6, a
    # 3) the canonical height is ~10 m (the flat roof), NOT ~15 (the chimneys) and NOT the peak.
    assert abs(p["building_height_m"] - 10.0) < 0.2, p["building_height_m"]
    assert p["roof_peak_m"] > p["roof_p90_m"], "peak must exceed P90 but never BE the height"
    assert abs(p["roof_median_m"] - (100.0 + 0.02 * 10 + 10.0)) < 0.5   # trimmed median rejects chimneys
    # 4) honesty block always present.
    assert p["provenance"] == "lidar_ndsm" and 0.0 <= p["confidence"] <= 1.0
    assert p["floors_est"] == 3
    print("[selftest] honesty core OK — P90≠peak, eroded footprint, terrain-plane ground, provenance+confidence present")


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252; keep glyphs intact.
    except Exception:
        pass
    deps = check_deps()
    print("PHASE 4 — nDSM height engine (scaffold). Heavy-lib availability:")
    for k, v in deps.items():
        print(f"   {k:<10} {'present' if v else 'ABSENT (heavy stages stubbed)'}")
    print()
    _selftest()
