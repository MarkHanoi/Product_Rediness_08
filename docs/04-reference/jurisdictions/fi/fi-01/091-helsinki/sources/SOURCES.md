# SOURCES — Helsinki (kuntanumero 091)

> Per-field citations (value · unit · article · document · URL) feeding C63 Axis 2 (LEGISLATION).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO CITED LEGAL FIELDS YET

No Helsinki asemakaava provision has been sourced with a full citation. The LEGISLATION axis is
`not-assessed` (`pending-implementation`) until at least one plan's use/density/height provisions are cited
here and signed off in `VERIFICATION.md` (the L-449 gate).

## Infrastructure sources (data-layer, cited)

| Field | Source | Endpoint / ref | State |
|---|---|---|---|
| Context OSM (buildings/roads/water/parks/landuse) | OSM via `bake.mjs` REGIONS `helsinki` | `finland-latest.osm.pbf`, bbox `24.88,60.14,25.02,60.20` | baked (live) |
| Terrain DEM | MML WCS | `terrain.mjs` source `fi`; `avoin-karttakuva.maanmittauslaitos.fi` (free `MML_API_KEY`) | documented (token) |
| Zone provisions | Ryhti `kaavatietomalli` OGC API | `paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1` (live+public; item schema TBD) | documented |
| Building height | Helsinki open LoD2 CityGML | `kartta.hel.fi` / HRI — `heightSources.mjs` `no-source` (candidate) | documented |
| Parcel geometry | MML Kiinteistörekisteri / Helsinki kiinteistökartta | national/municipal API — NOT wired in `parcelProviders/registry.ts` | documented |

*Cross-refs: `../RATE.md`, `../../RATE.md` (national), C58 §1.3 (explain-why), C63 §3 Axis 2.*
