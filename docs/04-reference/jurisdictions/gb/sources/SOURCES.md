# United Kingdom (`gb`) — national data sources

> Per-field citations (the trust gate). Only live-verified or documented-endpoint rows here; unverified research
> notes go in `README.md §7`. **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED.

## A — VERIFIED / DOCUMENTED

| Field | Value / endpoint | Instrument | Licence | Confidence |
|---|---|---|---|---|
| Terrain DTM | EA LIDAR Composite DTM 1 m — `environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs` (WCS 2.0.1, CoverageId `…__Lidar_Composite_Elevation_DTM_1m`) | Environment Agency | OGL v3 | `verified` — HTTP 200 GetCapabilities, live-probed 2026-07-25 (`terrain.mjs` `gb`) |
| Context OSM | Geofabrik `great-britain/england/greater-london-latest.osm.pbf` → PMTiles | OpenStreetMap | ODbL | `verified` — `bake.mjs` REGIONS `london` |
| Building height (derive) | EA LIDAR Composite **DSM** 1 m − DTM 1 m nDSM | Environment Agency | OGL v3 | `documented` — derive path in `GEO-DATA-SOURCING-MASTER.md`; DSM GetCoverage route NOT yet probed |

## B — UNVERIFIED (needed before any pack value ships)

| Field | What to verify | Method |
|---|---|---|
| Parcel geometry | HMLR INSPIRE Index Polygons usable as routing source? | download a London tile; inspect per-parcel geometry |
| EA DSM 1 m GetCoverage | keyless GeoTIFF for London bbox? | `GET` the DSM WCS GetCoverage; assert TIFF magic |
| Any numeric development rule | there is NONE by-right (discretionary planning) | n/a — do not fabricate |

⚠ Nothing in §A is a buildable-rule numeric value — GB publishes none by-right. No GB pack may ship a numeric
envelope; the honest product answer is a footprint + a discretionary-planning refusal, never an invented FAR/height.
