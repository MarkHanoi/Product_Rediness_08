# Greater London (E12000007) — data sources

> Per-field citations (the trust gate). **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED.

## A — VERIFIED / DOCUMENTED

| Field | Value / endpoint | Instrument | Licence | Confidence |
|---|---|---|---|---|
| Terrain DTM | EA LIDAR Composite DTM 1 m — `environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs`, bbox `[-0.20,51.44,0.02,51.55]` | Environment Agency | OGL v3 | `verified` — `terrain.mjs` `gb`, HTTP 200 GetCapabilities live-probed 2026-07-25 |
| Context OSM | Geofabrik `greater-london-latest.osm.pbf` → PMTiles (`bake.mjs` REGIONS `london`) | OpenStreetMap | ODbL | `verified` — bake row present |
| Building height (derive) | EA LIDAR Composite **DSM** 1 m − DTM 1 m nDSM | Environment Agency | OGL v3 | `documented` — `GEO-DATA-SOURCING-MASTER.md`; DSM GetCoverage route not yet probed |

## B — UNVERIFIED (needed before any pack value ships)

| Field | What to verify | Method |
|---|---|---|
| Parcel geometry | HMLR INSPIRE Index Polygons per-parcel + joinable? | download a London tile; inspect geometry |
| EA DSM 1 m GetCoverage | keyless GeoTIFF for London bbox? | `GET` the DSM WCS GetCoverage; assert TIFF magic |
| Any by-right envelope | there is none (discretionary planning) | n/a — do not fabricate |
| Conservation Areas / Listed Buildings | Historic England OGL layers coverage in London | probe Historic England ArcGIS services |

⚠ No numeric by-right development value exists for London (discretionary planning). No pack may ship an invented
FAR/height; the honest answer is a footprint + a "requires planning permission" statement.
