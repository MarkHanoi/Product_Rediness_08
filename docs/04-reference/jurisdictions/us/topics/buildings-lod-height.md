# USA — Buildings / LOD / Height (context layer)

> Part of the 3D-Context-Data country study. See `../README.md` and
> `../findings/USA-MASTER-DATA-SOURCE-STUDY.md §§D–E`.
> **Verify every endpoint live before relying on it** — all entries below are research-confirmed
> leads, not live-probed.

- **Target LOD:** LOD1 (footprint + modelled height); LOD2 not achievable free at national scale
- **Primary source (footprint):** Microsoft US Building Footprints (129.6M, ODbL, free)
- **Primary source (height):** Overture Maps + USGS 3DEP modelled heights (20M+ buildings, ODbL, free, growing)
- **Fallback (height):** USGS 3DEP DSM–DTM derivation (full national LiDAR, Public Domain, processing required)
- **Last-resort fallback:** OSM `building:levels × 3.0 m` (ODbL, sparse outside urban cores)
- **Integration effort:** LOW (footprints); MEDIUM (modelled heights); HIGH (3DEP nDSM derivation)

---

## Source details

| Source | Endpoint / download | Feature type / field | Licence | LOD | Coverage |
|---|---|---|---|---|---|
| **Microsoft US Building Footprints** | `github.com/microsoft/USBuildingFootprints` — state-level GeoJSON downloads | Polygon geometry; no height attribute | **ODbL** | LOD1 (footprint only) | 129.6M buildings — near-national |
| **Overture Maps buildings layer** | `overturemaps.org/release/` — GeoParquet bulk download or AWS S3 | `height`, `min_height`, `num_floors` fields (where available) | **ODbL** | LOD1 with height | 20M+ US buildings with height; growing to 40–50M |
| **USGS 3DEP (terrain)** | `prd-tnm.s3.amazonaws.com` — 1m/10m GeoTIFF tiles; `apps.nationalmap.gov` | DTM + DSM rasters; nDSM = DSM−DTM gives above-ground height | **Public Domain** | Derived LOD1 height | >60% of US with 1 m LiDAR; remainder 10 m |
| **OpenStreetMap** | Overpass API; Overture Maps (OSM-derived) | `building:levels` tag → height estimate | **ODbL** | Estimated LOD1 | Good urban core; sparse rural/suburban |
| **City-specific LoD2** (Chicago, NYC, LA) | Per-city; see city stubs | CityGML or ArcGIS Scene Layer — if published | Varies | LOD2 | Varies — not confirmed for any of the three pilot cities |

---

## Spike evidence (fill during Phase 1 — live probe not yet run)

| Question | Answer | Evidence (endpoint response / sample) |
|---|---|---|
| (a) Real footprint at national scale? | **YES (confirmed)** — Microsoft 129.6M ODbL footprints cover the entire country | GitHub repo confirmed; licence ODbL; no live API probe required for bulk download |
| (b) Real height at national scale? | **PARTIAL (20M of 129.6M buildings)** — Overture/USGS model growing; 3DEP covers >60% of US for derived heights | Overture announcement confirmed; 3DEP programme confirmed; exact field name and null rate not yet probed |
| (c) Real roof shape? | **NO free national source** — LOD2 building models exist per-city (some cities sell them); no free national equivalent | NYC, Chicago sell/publish 3D models separately — confirm per city |
| CRS of Microsoft footprints | GeoJSON → EPSG:4326 (WGS84) | Not live-probed; GeoJSON spec implies WGS84 |
| CRS of Overture buildings | GeoParquet → EPSG:4326 (Overture standard) | Not live-probed |
| CRS of 3DEP rasters | EPSG:4326 (geographic) or UTM zone (projected) depending on product | Not live-probed; check header of downloaded GeoTIFF |
| Height field name in Overture | `height` (metres above ground) — claimed | Not live-probed; inspect GeoParquet schema |
| Coverage gaps → fallback chain | Microsoft footprint → Overture height join → 3DEP nDSM derivation → OSM levels | Not yet implemented |
| Height datum | Overture/USGS: height above ground (not ellipsoidal); 3DEP DTM/DSM: NAVD88 | Not confirmed from live probe |

**Probe commands:**

```bash
# Overture Maps buildings — download Chicago bbox sample (GeoParquet via DuckDB)
# Install: pip install duckdb
duckdb -c "
INSTALL spatial; LOAD spatial;
INSTALL httpfs; LOAD httpfs;
SELECT building_id, height, min_height, num_floors, geometry
FROM read_parquet('s3://overturemaps-us-west-2/release/<LATEST>/theme=buildings/type=building/*')
WHERE bbox.xmin > -87.65 AND bbox.xmax < -87.62
  AND bbox.ymin > 41.87 AND bbox.ymax < 41.90
LIMIT 20;
"

# Microsoft Building Footprints — Illinois download
# URL: https://github.com/microsoft/USBuildingFootprints (see state file list)
curl -L "https://minedbuildings.z5.web.core.windows.net/global-buildings/2024-01-11-BuildingFootprints.zip" \
  -o illinois_footprints.zip   # check repo for current state file URL

# USGS 3DEP — check tile availability for Chicago
curl "https://tnmaccess.nationalmap.gov/api/v1/products?bbox=-87.68,41.83,-87.61,41.91&datasets=Digital+Elevation+Model+%28DEM%29+1+meter&max=5" \
  | python3 -m json.tool | grep -E '"title|downloadURL|publicationDate"'
```

---

## 5-building spot check (fill during Phase 1 — after live probe)

| Building source | Height field value (m) | Address / landmark | Visual check (satellite/StreetView) | Verdict |
|---|---|---|---|---|
| TBD — fill after Overture Chicago probe | | | | |
| TBD — fill after 3DEP derivation test | | | | |

---

## Implementation notes (fill during Phase 2)

- **Footprint priority:** use Microsoft footprints as the primary geometry source (ODbL,
  129.6M, national). Overture Maps also includes building footprints (sourced partly from
  Microsoft + OSM); the two can be cross-validated.
- **Height join:** join Overture height attributes to Microsoft footprint by spatial overlap
  (centroid-in-polygon or best-area-overlap). Where Overture has no height, attempt 3DEP
  nDSM derivation.
- **3DEP nDSM pipeline:** download DSM + DTM 1 m GeoTIFF tiles for the target bbox; compute
  nDSM = DSM − DTM; sample nDSM at each building footprint centroid or 90th-percentile pixel
  within footprint (robust to ground-level noise). This is the US analogue of France's LiDAR
  HD nDSM derivation — same pipeline shape, different tile source.
- **CRS:** all three sources can be kept in EPSG:4326 for storage. Reproject 3DEP tiles from
  NAVD88/UTM to WGS84 at processing time.
- **Fallback chain for any US parcel:**
  1. Overture `height` field (where non-null, ~15% of buildings today)
  2. 3DEP nDSM max within footprint (where 1m LiDAR tile exists, ~60% of US)
  3. OSM `building:levels × 3.0 m` (urban core, sparse)
  4. NULL + flag as unresolved
- **LOD2 per city:** check city-specific 3D model portals for Chicago (might be on the city
  open-data portal), NYC (NYC has published 3D buildings), and LA (LARIAC programme) before
  assuming LOD1-only.
