# LANE FED — the BACKBONE half of the probe extract (Overture buildings), 2026-09-01.
#
# ACCESS PATH ADOPTED, NOT INVENTED: tools/context-bake/bake.mjs §BAKE-OVERTURE already
# reads this dataset — anonymous public S3, DuckDB with spatial+httpfs, bbox pushdown on the
# parquet `bbox` row-group stats, release PINNED so a run is reproducible. This script is
# that same invocation with two differences the federation scaffold needs: it keeps the
# GERS `id` column (the bake drops it — the bake only needs OSM-shaped tags), and it
# reprojects into the national CRS (EPSG:3301) so the IoU is computed in metres, never in
# degrees.
#
# DuckDB is NOT installed in this repo and is NOT added by this lane: it was installed into a
# scratch dir for the probe (`python -m pip install --target <scratch>/pylibs duckdb` →
# duckdb 1.5.5) and the sys.path line below points there. Nothing in packages/ depends on it.
#
# ⚠ THE EXTRACT IS DELIBERATELY NOT COMMITTED. Overture is ODbL; the module's own doctrine
# (odblStore.ts) is that ODbL layers stay separable, and checking 1185 ODbL rows into the
# audit tree is the opposite of that. Re-run this script to regenerate it byte-for-byte: the
# release is pinned and the AOI is fixed, so the row SET is deterministic.
#
#   python fed-probe-overture.py            # writes overture_tallinn_kopli.json into cwd
#
# MEASURED RESULT (this exact script, 2026-09-01): ROWS=1185, elapsed 100.4 s.

import sys, time, json, re, collections

# ← the scratch install; edit to wherever duckdb was installed.
sys.path.insert(0, r"<scratch>/pylibs")
import duckdb

REL = "2026-07-22.0"  # the release pinned by tools/context-bake/bake.mjs §BAKE-OVERTURE
SRC = f"s3://overturemaps-us-west-2/release/{REL}/theme=buildings/type=building/*.parquet"
# Tallinn / Kopli AOI — the E1d-audited address Kopli tn 2 sits inside it.
MINX, MINY, MAXX, MAXY = 24.720, 59.440, 24.740, 59.450

con = duckdb.connect()
con.execute("INSTALL spatial; INSTALL httpfs; LOAD spatial; LOAD httpfs;")
# Force ANONYMOUS S3 (public bucket) so a runner's ambient AWS creds are never used —
# copied from §BAKE-OVERTURE verbatim in intent.
con.execute("SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';")

t0 = time.time()
# NOTE the geometry column comes back already typed GEOMETRY('OGC:CRS84') on DuckDB 1.5 —
# ST_GeomFromWKB(geometry) is a BINDER ERROR, measured. always_xy keeps x=easting.
sql = f"""
SELECT id, height, num_floors, subtype, class,
       ST_AsText(ST_Transform(geometry, 'EPSG:4326', 'EPSG:3301', always_xy := true)) AS wkt3301,
       ST_AsText(geometry) AS wkt4326
FROM read_parquet('{SRC}', hive_partitioning=1)
WHERE bbox.xmin <= {MAXX} AND bbox.xmax >= {MINX} AND bbox.ymin <= {MAXY} AND bbox.ymax >= {MINY}
"""
rows = con.execute(sql).fetchall()
dt = time.time() - t0
print(f"ROWS={len(rows)} elapsed={dt:.1f}s release={REL} aoi=({MINX},{MINY},{MAXX},{MAXY})")

out = [
    {"id": r[0], "height": r[1], "num_floors": r[2], "subtype": r[3], "class": r[4],
     "wkt3301": r[5], "wkt4326": r[6]}
    for r in rows
]
with open("overture_tallinn_kopli.json", "w", encoding="utf-8") as f:
    json.dump(out, f)

# ── GERS ID-FORMAT CENSUS — the measurement that settles gersId.ts's regex ────────────────
dashed = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
undashed = re.compile(r"^[0-9a-f]{32}$")
d = sum(1 for r in out if dashed.match(r["id"]))
u = sum(1 for r in out if undashed.match(r["id"]))
print("total", len(out), "dashed", d, "undashed32", u, "neither", len(out) - d - u)
print("id lengths present:", sorted({len(r["id"]) for r in out}))
print("height present", sum(1 for r in out if r["height"] is not None),
      "num_floors present", sum(1 for r in out if r["num_floors"] is not None))
print("sample ids:", [r["id"] for r in out[:3]])
print("subtypes:", collections.Counter(r["subtype"] for r in out).most_common(6))
