# Building-height status — Genève (BFS 6621)

> Feeds C63 **HEIGHTS/LOD** axis — the **`tagged` fraction** of the baked PMTiles `heightProvenance`
> histogram at the city bbox (C63 §3 Axis 6), COMPUTED never hand-typed. **Last updated:** 2026-07-30.
> **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-**CAPABLE**

Same national CH story as every Swiss city (`heightSources.mjs` `swissbuildings3d`, impl:`documented`;
`REGION_SOURCE` `geneva:'swissbuildings3d'`). The keyless swisstopo nDSM (**swissSURFACE3D DSM − swissALTI3D
DTM**, P90 over OSM footprints) is STAC-live (both collections HTTP 200, EPSG:2056 COG tiles) but the per-city
bake has NOT landed: the wiring is the STAC→COG-stitch + LV95↔WGS84 reprojection BUILD (§SWISS-NDSM-STAC-BUILD),
not a credential gate. The region keeps the honest OSM/`assumed` default — never a stamped fabricated height.

## Height source ladder
| Rung | Source | Provenance tag | Present here? |
|---|---|---|---|
| measured | swissSURFACE3D−swissALTI3D nDSM (P90) | `tagged` | capable, keyless — not baked |
| measured | swissBUILDINGS3D LoD2 + GWR GASTW | `tagged` | capable — CityGML build |
| derived | OSM `building:levels` | `derived-levels` | OSM baseline |
| fallback | 9 m carpet | `assumed` | ⚠ current baked default |

## Provenance distribution (the axis input)
`not-queried` — the deployed `geneva` buildings tiles have not been probed for the provenance split.

## What would raise the HEIGHTS/LOD axis
`Build the shared swisstopo nDSM STAC join (ports from Zürich/Bern) + re-bake geneva, then probe the histogram
· effort Medium (shared)` — cross-ref `GEO-DATA-SOURCING-MASTER.md` + `../../LOD-RATE.md`.

---
*Authority: `BUILDING-HEIGHT-REPLICATION-STANDARD.md` (L-646) · C62 · C63 §3 Axis 6. Feeds: `RATE.md` ·
`../../LOD-RATE.md`. Source: `heightSources.mjs` `swissbuildings3d` (§SWISS-NDSM-STAC-BUILD).*
