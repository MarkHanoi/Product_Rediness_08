# San Francisco (0667000) — data sources

> Per-field citations (the trust gate). **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED.

## A — VERIFIED / DOCUMENTED

| Field | Value / endpoint | Instrument | Licence | Confidence |
|---|---|---|---|---|
| Terrain DEM | USGS 3DEP 1 m DEM — `tnmaccess.nationalmap.gov/api/v1/products` (TNM → S3 GeoTIFF), bbox `[-122.52,37.70,-122.36,37.83]` | USGS / The National Map | public domain | `verified` — `terrain.mjs` `us`, HTTP 200 (national probe); ⚠ geoidSepM NEGATIVE in CONUS |
| Context OSM | Geofabrik `north-america/us/california-latest.osm.pbf` → PMTiles (`bake.mjs` REGIONS `sanfrancisco`) | OpenStreetMap | ODbL | `verified` — bake row present |
| Building height (derive) | Overture height/num_floors + USGS 3DEP DSM−DTM nDSM | Overture / USGS | ODbL / public domain | `documented` — `heightSources.mjs` `overture_us` impl:`documented`; join not implemented |

## B — UNVERIFIED (needed before any pack value ships)

| Field | What to verify | Method |
|---|---|---|
| Zoning + height-and-bulk districts | DataSF layer schema + numeric height field | `GET` the DataSF FeatureServer `?f=json` |
| Parcel geometry | SF Assessor parcel layer as a routing source | probe the DataSF parcels FeatureServer |
| 3DEP LiDAR tile availability | SF bbox coverage | TNM products API query for the SF bbox |
| Discretionary Review / area-plan overlays | which parcels carry area-plan controls | DataSF area-plan layer probe |

⚠ Nothing in §A is a buildable-rule numeric value yet. No SF pack may ship a numeric envelope until the DataSF
zoning/height-bulk values are sourced + L-449-verified; the honest answer is a footprint + a Planning-review
statement, never an invented height/FAR.
