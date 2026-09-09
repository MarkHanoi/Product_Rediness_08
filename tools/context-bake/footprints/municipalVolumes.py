#!/usr/bin/env python3
"""
§MUNICIPAL-VOLUMES (founder 2026-09-09 · L-13283 · C12 · C58)

Turn a municipal or regional building dataset — any OGC GeoPackage — into the GeoJSONSeq
footprint records the context bake already consumes.

  FOUNDER, VERBATIM:
    "Please do what you are doing for Barcelona scalable for other spanish cities and for
     other cities / regions in the world - we will bring similar richer data"

Barcelona is the first `SOURCES` entry, not a special case in the code. Adding a city should be
a descriptor, and if it ever needs a code change that is a signal the abstraction is wrong.

─────────────────────────────────────────────────────────────────────────────────────────────
⭐⭐ THE ONE RULE THIS FILE EXISTS TO ENFORCE: A HEIGHT'S TAG IS DECIDED BY ITS PROVENANCE
─────────────────────────────────────────────────────────────────────────────────────────────
`officialFootprints.mjs` states it at length, and it is the rule most likely to be broken by
someone adding a city in a hurry:

  · The client's `resolveHeightWithProvenance` reads an OSM `height` tag as provenance
    `tagged` — "a surveyed-ish number".
  · So a value DERIVED from storey counts must NEVER go in `height`. Catastro writes
    `building:levels` and keeps its `floors × 3.0` under `pryzm:height_floors_m`, because
    putting it in `height` would *launder a derivation into a survey* (C58 §1.4).
  · ⛔ BUT THAT DOES NOT MAKE `height` FORBIDDEN. Barcelona's `Z_MAX_VOL − Z_MIN_VOL` is the
    difference of two SURVEYED elevations at 0.025 m precision. That is exactly what the tag
    means, and hiding it under a "derived" label would be the mirror defect — the client would
    fall back to a worse number it already has.

Therefore every source DECLARES `height.kind`, and this file — not the caller, not the
descriptor author's memory — picks the tag:

  kind='surveyed'      → `height` in metres            (a measurement)
  kind='derived-floors'→ `building:levels` (integer)
                       + `pryzm:height_floors_m`        (the derivation, clearly labelled)

⚠ If you hold a number and cannot say which kind it is, you are not ready to add the source.
Write UNKNOWN in the descriptor and it will refuse rather than guess.

─────────────────────────────────────────────────────────────────────────────────────────────
⛔ ZERO-HEIGHT ROWS ARE KEPT, NOT DROPPED — and this was learned the expensive way
─────────────────────────────────────────────────────────────────────────────────────────────
`officialFootprints.mjs` §3, from the Catastro lane: a zero-storey part is *"a patio /
uncovered terrace: it is genuinely zero storeys above ground. It must be emitted … with height
0 and it must NOT be extruded. Reading it as 'unknown' and substituting a default would
fabricate a building on a courtyard."*

Barcelona has 1,100 such rows. They are emitted at height 0. The renderer's existing zero-height
handling decides what to draw; this file does not get to invent a default.

⚠ AND OUTLIERS ARE NOT CLAMPED. A row taller than `sanity.maxHeightM` is emitted UNCHANGED and
COUNTED in the report. A silent clamp is this file deciding a survey is wrong; if it is wrong,
it must be visible. [[context-data-honesty-family]].

─────────────────────────────────────────────────────────────────────────────────────────────
⭐ WHY PYTHON, AND WHY NOT GDAL
─────────────────────────────────────────────────────────────────────────────────────────────
A GeoPackage is SQLite carrying OGC WKB; the reprojection needs real geodesy. `pyproj` is
present in this tree, GDAL is not — here or in the bake image. This reads the container directly
and emits the SAME GeoJSONSeq the Node adapters emit, so nothing downstream can tell the
difference. It is a one-shot ingest for a hand-fetched archive, not a step in the unattended
bake, so the language boundary costs nothing.

⚠ GeoPackage only, today. Shapefile and FlatGeobuf are the obvious next readers; the descriptor
shape already anticipates them via `container`.

Usage:
    python3 municipalVolumes.py <source-id> <input.gpkg> <out.geojsonseq> [--min-area M2]
    python3 municipalVolumes.py --list
"""

import json
import math
import sqlite3
import struct
import sys

# RFC 8142 record separator. `geojsonseqRead.mjs` strips it and its header records that
# `trim()` does NOT — so emit it, or become that bug's next instance.
RS = b"\x1e"


# ═════════════════════════════════════════════════════════════════════════════════════════════
# THE SOURCE REGISTRY — one entry per city/region. Adding a city should touch nothing else.
# ═════════════════════════════════════════════════════════════════════════════════════════════
#
# height.mode:
#   'zdiff'  — max − min elevation columns (two surveyed elevations)
#   'metres' — a single column already in metres
#   'floors' — a storey COUNT column; multiplied by `metresPerFloor` for the labelled record
#
# height.kind:
#   'surveyed'       — a measurement. Goes in `height`.
#   'derived-floors' — computed from storeys. Goes in `building:levels` + the labelled tag.
#
# part: True when ONE ROW IS ONE VOLUME of a building rather than a whole-building outline.
#   Barcelona is ~10 rows per building; Catastro's BuildingParts are the same idea. This is the
#   property that produces rooftop articulation, and it is what makes a source worth ingesting.
SOURCES = {
    "bcn_municipal": {
        "label": "Barcelona — municipal volumetric building model (CartoBCN, MTM Alçades)",
        "city": "Barcelona",
        "country": "ES",
        # Rendered wherever this data is drawn. A licence obligation, not decoration.
        # ⚠ The licence itself is UNRESOLVED — see BARCELONA-LOD2-ADOPTION-PLAN.md §A.2. The
        # portal grants CC BY 4.0 generally but routes third-party-participated data to CC BY-ND.
        # This product's columns are all municipal (no Catastro join), which is the argument that
        # ND does not attach — an ARGUMENT, not a determination. Only the city can settle it.
        "attribution": "Buildings © Ajuntament de Barcelona (CartoBCN) — modified by PRYZM",
        "crs": 25831,                       # ETRS89 / UTM 31N. Verified against gpkg_contents.
        "container": "gpkg",
        "height": {
            "mode": "zdiff",
            "kind": "surveyed",             # 0.025 m altimetric precision — a measurement
            "maxCol": "Z_MAX_VOL",
            "minCol": "Z_MIN_VOL",
        },
        "areaCol": "AREA",
        "part": True,                       # one row = one volume, ~10 per building
        "extra": {"DISTRICTE": "pryzm:bcn_district", "BARRI": "pryzm:bcn_barri"},
        "sanity": {"maxHeightM": 150, "minAreaM2": 1.0},
        # What the ingest SHOULD produce. Checked after the run and printed as PASS/FAIL, so a
        # silently truncated download or a changed schema is caught here and not in a tile.
        # ⚠ Update these when the publisher updates the product; a stale expectation that fails
        # is noise, and noise is how a real failure gets ignored.
        "expect": {"rowsAtLeast": 480_000, "medianHeightM": (12, 19), "lonRange": (2.0, 2.30),
                   "latRange": (41.30, 41.50)},
    },
    # ─────────────────────────────────────────────────────────────────────────────────────────
    # ADDING A CITY — the checklist, and the traps that cost a day each in the Barcelona lane:
    #
    #   1. Open the container and READ THE SCHEMA before believing the product description.
    #      Barcelona's is documented as a *thematic* map with heights in eight categorised
    #      bands; the raw metres are in the table underneath. It was nearly rejected for this.
    #   2. Say which KIND of height you hold. If you cannot, stop — see the header.
    #   3. Check the CRS in `gpkg_contents`, do not trust the product page.
    #   4. Set `part` honestly. One box per building is what we already draw from OSM; the
    #      whole reason to ingest a municipal source is usually that `part` is True.
    #   5. Fill in `expect` from a first run, then keep it honest.
    #
    # See docs/04-reference/geospatial/FINDING-MORE-CITY-BUILDING-DATA.md for how to find the
    # next one, and what disqualifies a dataset before you spend a day on it.
    # ─────────────────────────────────────────────────────────────────────────────────────────
}


def read_gpkg_geometry(blob):
    """GeoPackage binary header → the WKB payload.

    ⛔ The envelope is 0 / 32 / 48 / 64 bytes depending on flag bits 1-3 (XY, XYZ, XYM, XYZM).
    Skipping a FIXED offset is the classic way to read this wrong, and it fails only on the
    subset of files that carry a Z envelope — i.e. later, on someone else's city.
    """
    if len(blob) < 8 or blob[0:2] != b"GP":
        raise ValueError("not a GeoPackage geometry blob")
    env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get((blob[3] >> 1) & 0x07)
    if env is None:
        raise ValueError("reserved envelope code")
    return blob[8 + env:]


def parse_wkb_polygons(wkb):
    """WKB Polygon / MultiPolygon → [polygon][ring][(x, y)]."""
    pos = 0

    def u8():
        nonlocal pos
        v = wkb[pos]; pos += 1
        return v

    def u32(le):
        nonlocal pos
        v = struct.unpack_from("<I" if le else ">I", wkb, pos)[0]; pos += 4
        return v

    def ring(le, ndim):
        nonlocal pos
        n = u32(le)
        vals = struct.unpack_from(("<" if le else ">") + "d" * (n * ndim), wkb, pos)
        pos += 8 * n * ndim
        # ⚠ Z / M are read and DISCARDED. The height comes from the ATTRIBUTES, which are the
        # surveyed pair. A per-vertex Z would be a SECOND height authority, and two rival
        # heights is the defect class this pipeline keeps closing.
        return [(vals[i * ndim], vals[i * ndim + 1]) for i in range(n)]

    def geom():
        nonlocal pos
        le = u8() == 1
        t = u32(le)
        base, flag = t % 1000, t // 1000
        ndim = 2 + (1 if flag in (1, 3) else 0) + (1 if flag in (2, 3) else 0)
        if base == 3:
            return [[ring(le, ndim) for _ in range(u32(le))]]
        if base == 6:
            out = []
            for _ in range(u32(le)):
                out.extend(geom())
            return out
        raise ValueError(f"unsupported WKB type {t}")

    return geom()


def shoelace_m2(r):
    a = 0.0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) / 2.0


def height_props(spec, row):
    """The provenance rule, in ONE place. Returns (props, metres_or_None)."""
    h = spec["height"]
    kind, mode = h["kind"], h["mode"]
    if kind not in ("surveyed", "derived-floors"):
        raise SystemExit(f"height.kind '{kind}' is not declared — refusing to guess a tag")

    if mode == "zdiff":
        lo, hi = row.get(h["minCol"]), row.get(h["maxCol"])
        if lo is None or hi is None:
            return {}, None
        m = round(hi - lo, 2)
    elif mode == "metres":
        v = row.get(h["col"])
        if v is None:
            return {}, None
        m = round(float(v), 2)
    elif mode == "floors":
        f = row.get(h["col"])
        if f is None:
            return {}, None
        f = int(f)
        # ⛔ DERIVED: `building:levels` is the honest field, and the metre value travels
        # separately and LABELLED. It must not reach `height`. See the header.
        props = {"building:levels": f}
        if f > 0:
            props["pryzm:height_floors_m"] = round(f * h.get("metresPerFloor", 3.0), 1)
            props["pryzm:height_kind"] = "floors"
        return props, None
    else:
        raise SystemExit(f"unknown height.mode '{mode}'")

    if m < 0:
        m = 0.0
    # SURVEYED metres belong in `height` — that is what the tag means.
    return {"height": m, "pryzm:height_kind": h.get("label", "surveyed")}, m


def main():
    if "--list" in sys.argv:
        for k, s in SOURCES.items():
            print(f"  {k:<18} {s['label']}")
        return
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(2)

    sid, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    spec = SOURCES.get(sid)
    if not spec:
        raise SystemExit(f"unknown source '{sid}' — run with --list")

    sanity = spec.get("sanity", {})
    min_area = float(sys.argv[sys.argv.index("--min-area") + 1]) if "--min-area" in sys.argv \
        else sanity.get("minAreaM2", 1.0)
    max_h = sanity.get("maxHeightM", 200)

    from pyproj import Transformer

    con = sqlite3.connect(src)
    table = [r[0] for r in con.execute("SELECT table_name FROM gpkg_contents")][0]
    srs = con.execute("SELECT srs_id FROM gpkg_contents WHERE table_name=?", (table,)).fetchone()[0]
    if spec.get("crs") and srs != spec["crs"]:
        # ⛔ LOUD. A silently wrong CRS puts a city a hundred kilometres from where it belongs,
        # and it looks like a projection bug rather than a configuration one.
        raise SystemExit(f"descriptor says EPSG:{spec['crs']}, container says {srs} — refusing")
    # always_xy: without it pyproj honours EPSG:4326's declared lat/lon axis order and returns
    # transposed pairs, which puts Barcelona in the Indian Ocean.
    tf = Transformer.from_crs(f"EPSG:{srs}", "EPSG:4326", always_xy=True)

    cols = [c[1] for c in con.execute(f'PRAGMA table_info("{table}")')]
    geom_col = con.execute(
        "SELECT column_name FROM gpkg_geometry_columns WHERE table_name=?", (table,)).fetchone()[0]
    want = [c for c in cols if c != geom_col]

    st = dict(rows=0, written=0, sliver=0, zero_h=0, tall=0, bad=0, no_h=0)
    heights, lons, lats = [], [], []
    sel = ",".join(f'"{c}"' for c in [geom_col] + want)

    with open(dst, "wb") as out:
        for rec in con.execute(f'SELECT {sel} FROM "{table}"'):
            st["rows"] += 1
            blob, row = rec[0], dict(zip(want, rec[1:]))
            if blob is None:
                st["bad"] += 1; continue
            try:
                polys = parse_wkb_polygons(read_gpkg_geometry(blob))
            except Exception:
                st["bad"] += 1; continue
            if not polys:
                st["bad"] += 1; continue

            area = row.get(spec.get("areaCol") or "", None)
            if area is None or not isinstance(area, (int, float)) or not math.isfinite(area):
                area = sum(shoelace_m2(p[0]) for p in polys if p and len(p[0]) > 3)
            if area < min_area:
                st["sliver"] += 1; continue

            hprops, metres = height_props(spec, row)
            if metres is None and "building:levels" not in hprops:
                st["no_h"] += 1
            elif metres is not None:
                if metres <= 0:
                    st["zero_h"] += 1          # patio / terrace — kept, never dropped
                elif metres > max_h:
                    st["tall"] += 1            # kept UNCLAMPED and counted
                heights.append(metres)

            rings = []
            for p in polys:
                pr = []
                for r in p:
                    if len(r) < 4:
                        continue
                    xs, ys = zip(*r)
                    lo, la = tf.transform(xs, ys)
                    pr.append([[round(a, 7), round(b, 7)] for a, b in zip(lo, la)])
                if pr:
                    rings.append(pr)
            if not rings:
                st["bad"] += 1; continue
            lons.append(rings[0][0][0][0]); lats.append(rings[0][0][0][1])

            props = {"building": "yes", "pryzm:source": sid,
                     "pryzm:part": "true" if spec.get("part") else "false"}
            props.update(hprops)
            for col, tag in (spec.get("extra") or {}).items():
                if row.get(col) not in (None, ""):
                    props[tag] = str(row[col])

            geometry = ({"type": "Polygon", "coordinates": rings[0]} if len(rings) == 1
                        else {"type": "MultiPolygon", "coordinates": rings})
            out.write(RS)
            out.write(json.dumps({"type": "Feature", "geometry": geometry, "properties": props},
                                 separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
            out.write(b"\n")
            st["written"] += 1
            if st["rows"] % 100000 == 0:
                print(f"  ... {st['rows']:,} read", flush=True)

    print(f"\n=== {sid} - {spec['label']} ===")
    for k, lab in (("rows", "rows read"), ("written", "features written"),
                   ("sliver", f"dropped below {min_area} m2"),
                   ("zero_h", "height 0 - KEPT (patio/terrace, never dropped)"),
                   ("tall", f"over {max_h} m - KEPT UNCLAMPED"),
                   ("no_h", "no height"), ("bad", "unparseable geometry")):
        print(f"  {st[k]:>9,}  {lab}")

    # ── The expectation check. A silently truncated download or a changed upstream schema is
    #    caught HERE, not three steps later in a tile nobody looks at.
    exp = spec.get("expect") or {}
    if exp and heights:
        heights.sort()
        med = heights[len(heights) // 2]
        checks = [
            ("rows", st["written"] >= exp.get("rowsAtLeast", 0),
             f"{st['written']:,} >= {exp.get('rowsAtLeast', 0):,}"),
            ("median height", exp["medianHeightM"][0] <= med <= exp["medianHeightM"][1],
             f"{med} m in {exp['medianHeightM']}"),
            ("longitude", exp["lonRange"][0] <= min(lons) and max(lons) <= exp["lonRange"][1],
             f"{min(lons):.4f}..{max(lons):.4f} in {exp['lonRange']}"),
            ("latitude", exp["latRange"][0] <= min(lats) and max(lats) <= exp["latRange"][1],
             f"{min(lats):.4f}..{max(lats):.4f} in {exp['latRange']}"),
        ]
        print("\n  expectation check:")
        for name, ok, detail in checks:
            print(f"    {'PASS' if ok else 'FAIL'}  {name:<14} {detail}")
        if not all(c[1] for c in checks):
            raise SystemExit("\n  EXPECTATION FAILED - do not bake this output.")

    print(f"\n  attribution (must be rendered): {spec['attribution']}")


if __name__ == "__main__":
    main()
