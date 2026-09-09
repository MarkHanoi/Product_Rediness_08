#!/usr/bin/env python3
"""
§BCN-PREVIEW-CUT (L-13287) — cut a disc of municipal volumes for the console preview.

    python cutPreviewDisc.py bcn_municipal <src.gpkg> <out.geojson> --centre <lon,lat> --radius <m>

⭐ WHY THIS FILE EXISTS, AND IT IS NOT A NICE-TO-HAVE.

The first preview asset was cut by an ad-hoc script that was never committed. It was centred on
Ciutat Vella (2.17707, 41.38258). The founder tested twice at his OWN plot in Eixample — about
1.65 km away — and reported, correctly, that he saw no new detail. The preview then FLEW HIS
CAMERA to Ciutat Vella, which is worse than showing nothing: it silently moves the user to a
different neighbourhood and invites them to judge their own site by it.

Two failures, one cause: the cut was not reproducible, so re-centring it was not a one-line
command. It is now.

⛔ WHAT THIS IS NOT. This is preview tooling. The shipping route is a tiered bake into the R2
`buildings` tiles — see docs/04-reference/geospatial/BARCELONA-LOD2-ADOPTION-PLAN.md. Nothing here
should grow a tiering strategy, a budget or a manifest; if it starts to, the bake is what you
actually wanted.

⚠ SIZE IS QUADRATIC IN RADIUS. Measured on Barcelona: a 450 m disc is 11,013 volumes / 3.7 MB.
Because area goes as r², 900 m is ~4x that and 1,800 m is ~16x. The asset is fetched lazily on the
first console call, so a user who never types the command pays nothing — but a 60 MB preview is
still a bad idea. Keep it under ~10 MB, and if you need more coverage than that, you need the bake.

⭐ REUSES THE PARSER, DOES NOT COPY IT. Geometry and height come from `municipalVolumes.py` — the
same WKB reader, the same GeoPackage envelope handling, the same height rules (surveyed vs
derived-floors, zero-height rows KEPT as patios, outliers NOT clamped). A second copy of that
parsing would be this repo's dominant defect — one rule, two implementations — in the one place it
would be hardest to notice, because both copies would produce plausible buildings.
"""

import json
import math
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from municipalVolumes import (  # noqa: E402  - deliberate: reuse, never re-implement
    SOURCES,
    height_props,
    parse_wkb_polygons,
    read_gpkg_geometry,
    shoelace_m2,
)


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)

    sid, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    spec = SOURCES.get(sid)
    if not spec:
        raise SystemExit(f"unknown source '{sid}' - run municipalVolumes.py --list")

    centre = arg("--centre")
    if not centre:
        raise SystemExit("--centre <lon,lat> is required - there is no sensible default, and a "
                         "wrong default is exactly the defect this tool exists to fix")
    c_lon, c_lat = (float(v) for v in centre.split(","))
    radius_m = float(arg("--radius", "450"))
    min_area = float(arg("--min-area", str((spec.get("sanity") or {}).get("minAreaM2", 1.0))))

    from pyproj import Transformer

    con = sqlite3.connect(src)
    table = [r[0] for r in con.execute("SELECT table_name FROM gpkg_contents")][0]
    srs = con.execute("SELECT srs_id FROM gpkg_contents WHERE table_name=?", (table,)).fetchone()[0]
    if spec.get("crs") and srs != spec["crs"]:
        raise SystemExit(f"descriptor says EPSG:{spec['crs']}, container says {srs} - refusing")

    # always_xy: without it pyproj honours EPSG:4326's declared lat/lon axis order and returns
    # transposed pairs, which puts Barcelona in the Indian Ocean.
    to_wgs = Transformer.from_crs(f"EPSG:{srs}", "EPSG:4326", always_xy=True)
    to_src = Transformer.from_crs("EPSG:4326", f"EPSG:{srs}", always_xy=True)

    # ⭐ CULL IN THE SOURCE CRS, NOT IN DEGREES. EPSG:25831 is metric, so the disc test is a real
    # distance. Culling on a degree box would be anisotropic (a degree of longitude is ~0.75 of a
    # degree of latitude at this latitude) and would silently clip the east-west edges.
    cx, cy = to_src.transform(c_lon, c_lat)
    r2 = radius_m * radius_m

    cols = [c[1] for c in con.execute(f'PRAGMA table_info("{table}")')]
    geom_col = con.execute(
        "SELECT column_name FROM gpkg_geometry_columns WHERE table_name=?", (table,)).fetchone()[0]
    want = [c for c in cols if c != geom_col]
    sel = ",".join(f'"{c}"' for c in [geom_col] + want)

    feats = []
    st = dict(rows=0, kept=0, outside=0, sliver=0, zero_h=0, bad=0)
    heights = []

    for rec in con.execute(f'SELECT {sel} FROM "{table}"'):
        st["rows"] += 1
        blob, row = rec[0], dict(zip(want, rec[1:]))
        if blob is None:
            st["bad"] += 1
            continue
        try:
            polys = parse_wkb_polygons(read_gpkg_geometry(blob))
        except Exception:
            st["bad"] += 1
            continue
        if not polys:
            st["bad"] += 1
            continue

        outer = polys[0][0]
        if len(outer) < 4:
            st["bad"] += 1
            continue

        # Centroid test in metres. One point per volume is enough for a preview disc; a volume
        # straddling the rim is kept or dropped whole, never cut (§BUILDINGS-ARE-NOT-SLICED).
        mx = sum(p[0] for p in outer) / len(outer)
        my = sum(p[1] for p in outer) / len(outer)
        if (mx - cx) ** 2 + (my - cy) ** 2 > r2:
            st["outside"] += 1
            continue

        area = row.get(spec.get("areaCol") or "", None)
        if area is None or not isinstance(area, (int, float)) or not math.isfinite(area):
            area = sum(shoelace_m2(p[0]) for p in polys if p and len(p[0]) > 3)
        if area < min_area:
            st["sliver"] += 1
            continue

        hprops, metres = height_props(spec, row)
        if metres is not None:
            if metres <= 0:
                st["zero_h"] += 1
            else:
                heights.append(metres)

        rings = []
        for p in polys:
            pr = []
            for ring in p:
                if len(ring) < 4:
                    continue
                xs, ys = zip(*ring)
                lo, la = to_wgs.transform(xs, ys)
                pr.append([[round(a, 7), round(b, 7)] for a, b in zip(lo, la)])
            if pr:
                rings.append(pr)
        if not rings:
            st["bad"] += 1
            continue

        geometry = ({"type": "Polygon", "coordinates": rings[0]} if len(rings) == 1
                    else {"type": "MultiPolygon", "coordinates": rings})
        # ⚠ `h` is what the preview extrudes. It is the CITY'S OWN SURVEYED height
        # (Z_MAX_VOL - Z_MIN_VOL, 0.025 m altimetric precision), passed through unmodified and
        # UNCLAMPED. If something looks wrong on screen, the data says it - and that is worth
        # knowing before the bake rather than after.
        feats.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": {"h": round(metres, 2) if metres is not None else 0},
        })
        st["kept"] += 1

    doc = {
        "type": "FeatureCollection",
        "pryzm": {
            "source": sid,
            "centre": [round(c_lon, 6), round(c_lat, 6)],
            "radiusM": radius_m,
            "attribution": spec["attribution"],
        },
        "features": feats,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)

    size_mb = os.path.getsize(dst) / 1e6
    print(f"\n=== {sid} preview disc ===")
    print(f"  centre       {c_lon}, {c_lat}")
    print(f"  radius       {radius_m:,.0f} m")
    for k, lab in (("rows", "rows read"), ("kept", "volumes written"),
                   ("outside", "outside the disc"), ("sliver", f"below {min_area} m2"),
                   ("zero_h", "height 0 - KEPT (patio/terrace)"),
                   ("bad", "unparseable geometry")):
        print(f"  {st[k]:>9,}  {lab}")
    if heights:
        heights.sort()
        print(f"  heights      {heights[0]:.1f} - {heights[-1]:.1f} m "
              f"(median {heights[len(heights) // 2]:.1f} m)")
    print(f"  file         {size_mb:.1f} MB  -> {dst}")

    # ⛔ REFUSE LOUDLY RATHER THAN SHIPPING A DISC THAT ANSWERS NOTHING. An empty or near-empty cut
    # means the centre is outside the dataset's coverage, and a preview that draws six buildings
    # would be read as "the data is poor" instead of "you cut the wrong place".
    if st["kept"] < 100:
        raise SystemExit(f"\n  ONLY {st['kept']} volume(s) in the disc - is the centre inside "
                         f"{spec['city']}? Refusing to call this a preview.")
    if size_mb > 12:
        print(f"\n  WARNING: {size_mb:.1f} MB is large for a lazily-fetched preview asset. "
              f"Size grows as radius squared; consider a smaller radius, or the real bake.")
    print(f"\n  attribution (must be rendered): {spec['attribution']}")


if __name__ == "__main__":
    main()
