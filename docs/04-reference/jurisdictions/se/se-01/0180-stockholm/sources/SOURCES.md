# SOURCES — Stockholm (kommunkod 0180)

> Per-field citations (value · unit · article · document · URL) feeding C63 Axis 2 (LEGISLATION).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO CITED LEGAL FIELDS YET

No Stockholm detaljplan provision has been sourced with a full citation. The LEGISLATION axis is
`not-assessed` (`pending-implementation`) until at least one plan's use/density/height provisions are cited
here and signed off in `VERIFICATION.md` (the L-449 gate).

## Infrastructure sources (data-layer, cited)

| Field | Source | Endpoint / ref | State |
|---|---|---|---|
| Context OSM (buildings/roads/water/parks/landuse) | OSM via `bake.mjs` REGIONS `stockholm` | `sweden-latest.osm.pbf`, bbox `17.98,59.28,18.14,59.37` | baked (live) |
| Terrain DEM | Lantmäteriet Höjddata | `terrain.mjs` source `se`; `api.lantmateriet.se` (free `LANTMATERIET_API_KEY`) | documented (token) |
| Building-height nDSM | Lantmäteriet CC0 footprints + national LiDAR | `heightSources.mjs` `lidar_se` (impl:`documented`) | documented |
| Parcel geometry | Lantmäteriet Fastighetsindelning | national API — NOT wired in `parcelProviders/registry.ts` | documented |
| Zone provisions | NGP STAC/OAPIF + Planbestämmelsekatalog | geo-blocked from non-SE IPs | documented |

*Cross-refs: `../RATE.md`, `../../RATE.md` (national), C58 §1.3 (explain-why), C63 §3 Axis 2.*
