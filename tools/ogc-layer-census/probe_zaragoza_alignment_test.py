# §ZGZ-ALIGNMENT-CONTROL — is `urbanismo:Linea_Normativa` an ALINEACIÓN, or just more linework?
#
# ⛔ THE RULE THIS OBEYS: a candidate alignment layer may NOT be accepted because its name and
#    row-count look right. A sibling agent's ray-based test was BROKEN and only a paired control
#    caught it. So this measures a DISTRIBUTION against a CONTROL that must behave differently,
#    and it reports the sample size.
#
# THE HYPOTHESIS, STATED SO IT CAN FAIL
# ─────────────────────────────────────
# An *alineación oficial* is the legal boundary between public street and private plot. If
# `Linea_Normativa` carries alignments, its vertices must sit ON the block/street interface —
# i.e. within centimetres-to-a-metre of a `urbanismo:Manzanas` boundary.
#
# THE PAIRED CONTROL: `urbanismo:Ejes_Vias_Previstos` — street AXES. By construction an axis runs
# down the MIDDLE of a carriageway, so it must sit HALF A STREET WIDTH from any block boundary.
# Both layers are linework in the same workspace, same CRS, same city, drawn from the same plan.
#
#   • If the candidate hugs block boundaries AND the control does not → the candidate is on the
#     block/street interface, and the separation is real rather than an artefact of "everything
#     in a dense city is near everything".
#   • If BOTH hug the boundary → THE TEST MEASURES NOTHING (this is precisely the failure the
#     Huesca georeference probe hit: 93 % of features matched at ANY offset). Report and refuse.
#
# ⚠ WHAT A PASS DOES **NOT** BUY. Proximity to a block edge is consistent with an alignment and
#   ALSO with a parcel-frontage or a kerb line. It is a NECESSARY condition, not a sufficient one.
#   Nothing here authorises synthesising an alignment from this layer — see the report.
#
# Geometry: exact point-to-segment distance in projected metres (EPSG:25830), no ray casting.

from __future__ import annotations

import io
import json
import math
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from ogccensus import get_feature_json, write_json  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
WFS = "https://idezar-sig.zaragoza.es/servicios/geoserver/wfs"

# A dense consolidated-urban window (ETRS89 / UTM 30N). Chosen because `Calificaciones_Urbanas`
# returns A1/B1 codes here, i.e. it is exactly the manzana-cerrada fabric the articles govern.
BBOX = (675200.0, 4613300.0, 677600.0, 4615600.0)


def point_seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    """Exact distance from P to SEGMENT AB (not to the infinite line)."""
    dx, dy = bx - ax, by - ay
    d2 = dx * dx + dy * dy
    if d2 == 0.0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / d2
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def coords_of(geom: dict | None) -> list[list[tuple[float, float]]]:
    """Flatten any GeoJSON geometry to a list of coordinate RINGS/LINES."""
    if not geom:
        return []
    t, c = geom.get("type"), geom.get("coordinates")
    if t == "LineString":
        return [[(p[0], p[1]) for p in c]]
    if t in ("MultiLineString", "Polygon"):
        return [[(p[0], p[1]) for p in part] for part in c]
    if t == "MultiPolygon":
        return [[(p[0], p[1]) for p in ring] for poly in c for ring in poly]
    if t == "Point":
        return [[(c[0], c[1])]]
    if t == "MultiPoint":
        return [[(p[0], p[1]) for p in c]]
    return []


def fetch_lines(tn: str, geom_col: str, code: str | None = None
                ) -> list[list[tuple[float, float]]]:
    """⚠ GeoServer REJECTS `bbox=` and `cql_filter=` together with HTTP 500. The first run of
    this test read those 500s as "NO SAMPLES", which would have been recorded as *the candidate
    layer is empty here* — the exact failure this whole exercise is about. The spatial filter
    therefore goes INSIDE the CQL, and the geometry column name is passed in per layer because
    it varies (`geom` vs `the_geom`) and a wrong one also yields an empty, healthy-looking 200."""
    bb = f"BBOX({geom_col},{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]})"
    cql = bb if code is None else f"{bb} AND codigo='{code}'"
    doc, f = get_feature_json(WFS, tn, count=60000,
                              extra={"srsName": "EPSG:25830", "cql_filter": cql})
    if doc is None:
        print(f"  {tn}: UNREACHABLE status={f.status} err={f.error} "
              f"(NOT a statement that the layer is empty)")
        return []
    out = []
    for ft in doc.get("features", []):
        out.extend(coords_of(ft.get("geometry")))
    return out


class Grid:
    """Uniform-bin index over reference SEGMENTS so the census is O(n) rather than O(n·m)."""

    CELL = 25.0

    def __init__(self, lines: list[list[tuple[float, float]]]):
        self.bins: dict[tuple[int, int], list[tuple[float, float, float, float]]] = {}
        self.n = 0
        for ln in lines:
            for i in range(len(ln) - 1):
                ax, ay = ln[i]
                bx, by = ln[i + 1]
                self.n += 1
                x0, x1 = sorted((ax, bx))
                y0, y1 = sorted((ay, by))
                for cx in range(int(x0 // self.CELL), int(x1 // self.CELL) + 1):
                    for cy in range(int(y0 // self.CELL), int(y1 // self.CELL) + 1):
                        self.bins.setdefault((cx, cy), []).append((ax, ay, bx, by))

    def nearest(self, px: float, py: float, max_rings: int = 8) -> float | None:
        cx, cy = int(px // self.CELL), int(py // self.CELL)
        best = None
        for r in range(max_rings):
            for i in range(cx - r, cx + r + 1):
                for j in range(cy - r, cy + r + 1):
                    if r > 0 and abs(i - cx) != r and abs(j - cy) != r:
                        continue
                    for (ax, ay, bx, by) in self.bins.get((i, j), ()):
                        d = point_seg_dist(px, py, ax, ay, bx, by)
                        if best is None or d < best:
                            best = d
            if best is not None and best <= r * self.CELL:
                return best
        return best


def stats(name: str, ds: list[float]) -> dict:
    if not ds:
        print(f"  {name}: NO SAMPLES")
        return {"n": 0}
    ds = sorted(ds)
    q = lambda p: ds[min(len(ds) - 1, int(p * len(ds)))]  # noqa: E731
    d = {"n": len(ds), "median": statistics.median(ds), "mean": statistics.fmean(ds),
         "p10": q(.10), "p25": q(.25), "p75": q(.75), "p90": q(.90),
         "frac_within_0m5": sum(1 for x in ds if x <= 0.5) / len(ds),
         "frac_within_1m": sum(1 for x in ds if x <= 1.0) / len(ds),
         "frac_within_2m": sum(1 for x in ds if x <= 2.0) / len(ds)}
    print(f"  {name:<44} n={d['n']:<7} median={d['median']:8.2f} m  "
          f"p25={d['p25']:6.2f} p75={d['p75']:7.2f}  "
          f"≤1m={d['frac_within_1m']*100:5.1f}%  ≤2m={d['frac_within_2m']*100:5.1f}%")
    return d


def main() -> None:
    print(f"window (EPSG:25830): {BBOX}\n")
    print("fetching reference + candidate + control ...")
    manzanas = fetch_lines("urbanismo:Manzanas", "geom")
    print(f"  reference `Manzanas` boundary lines: {len(manzanas)}")
    grid = Grid(manzanas)
    print(f"  reference segments indexed: {grid.n}\n")

    result = {"bbox_epsg25830": BBOX, "reference": "urbanismo:Manzanas boundaries",
              "reference_segments": grid.n, "groups": {}}

    def measure(label: str, lines: list[list[tuple[float, float]]]) -> None:
        pts = [p for ln in lines for p in ln]
        ds = []
        for (px, py) in pts:
            d = grid.nearest(px, py)
            if d is not None:
                ds.append(d)
        result["groups"][label] = stats(label, ds)

    print("── CANDIDATE: urbanismo:Linea_Normativa, split by its 3 `codigo` classes ──")
    for code in ("302101", "302401", "302201"):
        lines = fetch_lines("urbanismo:Linea_Normativa", "geom", code)
        measure(f"Linea_Normativa codigo={code}", lines)

    print("\n── PAIRED CONTROL (must be FAR): street axes ──")
    # ⚠ `urbanismo:Vias` is the CITY STREET REGISTER as MultiLineString CENTRELINES (3,359 named
    # streets). It is the correct paired control: an axis is BY CONSTRUCTION half a carriageway
    # away from the block edge on which any alignment must lie. If the candidate and this control
    # come out the same, the test has measured nothing and the candidate must be refused.
    measure("CONTROL Vias (named street centrelines)",
            fetch_lines("urbanismo:Vias", "geom"))
    # ⚠ `Ejes_Vias_Previstos` is *PREVISTOS* — PLANNED axes, which live in growth areas, not the
    # consolidated core. An empty result here is OUT-OF-WINDOW, **not** absence, and is reported
    # as its own line rather than folded into the verdict.
    measure("CONTROL Ejes_Vias_Previstos (planned axes)",
            fetch_lines("urbanismo:Ejes_Vias_Previstos", "geom"))

    print("\n── SECOND CONTROL (must be NEAR ~0): parcel boundaries, which really do "
          "coincide with block edges ──")
    measure("CONTROL Parcelas (parcel boundaries)",
            fetch_lines("urbanismo:Parcelas", "geom"))

    print("\n── NEGATIVE CONTROL (must be FAR): contour/base-map linework ──")
    measure("NEG-CONTROL Lineas_Ordenacion (base map)",
            fetch_lines("urbanismo:Lineas_Ordenacion", "the_geom"))

    write_json(os.path.join(OUT, "zaragoza_alignment_control.json"), result)

    print("\n══ VERDICT INPUTS ══")
    g = result["groups"]
    ctrl = g.get("CONTROL Vias (named street centrelines)", {})
    for k, v in g.items():
        if not v.get("n"):
            continue
        if ctrl.get("median"):
            print(f"  {k:<46} median {v['median']:7.2f} m   "
                  f"ratio-vs-axis-control {ctrl['median']/max(v['median'],1e-9):6.2f}×")


if __name__ == "__main__":
    main()
