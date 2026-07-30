# Building-height status — Zürich (BFS 0261)

> Feeds C63 **HEIGHTS/LOD** axis. The score is the **`tagged` fraction** of the baked PMTiles
> `heightProvenance` histogram at the city bbox (C63 §3 Axis 6) — COMPUTED, never hand-typed. A fabricated
> default height rendered as real is the §CONTEXT-DATA-HONESTY failure (L-646/L-459). **Last updated:**
> 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-**CAPABLE**

**Source is keyless and STAC-live, but the per-city bake has NOT landed and the wiring is a BUILD.** CH has
two real-height paths (`heightSources.mjs` `swissbuildings3d`, impl:`documented`; `REGION_SOURCE`
`zurich:'swissbuildings3d'`):

1. **LoD1-now, keyless** — the OSM-footprint × nDSM join: sample **swissSURFACE3D Raster (DSM) − swissALTI3D
   (DTM)** over bake's own OSM footprints → P90 tagged height (the exact DK `dhm` / ES `mds` shape, no key).
2. **LoD2-next** — swissBUILDINGS3D 2.0/3.0 CityGML volumetric solids (±30–50 cm) + GWR `GASTW` storeys by
   EGID — the richer tier, a bulk-download + CityGML-parser build.

## Height source ladder (which rung this city sits on)
| Rung | Source | Provenance tag | Present here? |
|---|---|---|---|
| measured | swissSURFACE3D−swissALTI3D nDSM (P90) | `tagged` | **capable, keyless — not baked** |
| measured | swissBUILDINGS3D LoD2 solid + GWR GASTW | `tagged` | capable — CityGML build |
| measured | OSM `height` | `tagged` | sparse (OSM baseline) |
| derived | OSM `building:levels` × floor-height | `derived-levels` | OSM baseline |
| fallback | the 9 m carpet | `assumed` | ⚠ current baked default until the nDSM join lands |

## Why still `not-assessed` (§SWISS-NDSM-STAC-BUILD)
Impl stays `documented`, not `live`: the plain WCS-2 GetCoverage-in-4326 shape is FALSE (LIVE-PROBED
2026-07-27 — `data.geo.admin.ch` is an object store, returns HTTP 404 NoSuchKey; it has no WCS). The keyless
data IS live via **STAC** (both `ch.swisstopo.swissalti3d` DTM + `ch.swisstopo.swisssurface3d-raster` DSM
return HTTP 200, per-1 km COG GeoTIFF tiles in EPSG:2056/LV95 at 0.5/2 m, CC-BY commercial-OK). So the real
LoD1-now wiring is the STAC→COG-stitch path (reuse `terrain.mjs` fetchSwissAltiStac for BOTH coverages) + an
LV95↔WGS84 projector (LV95 is Swiss oblique Mercator, needs proj4/reproject.mjs, which the buildings bake
runner does not yet install) — a **build, not a credential gate**. The region keeps OSM until built (no
fabricated height). No per-building `heightProvenance` histogram probed for the deployed tiles.

## Provenance distribution (the axis input)
`not-queried` — the deployed `zurich` buildings tiles have not been probed for the `tagged/derived-levels/assumed` split.

## What would raise the HEIGHTS/LOD axis
`Build the STAC→COG-stitch nDSM join (LV95 reproject) + re-bake zurich, then probe the provenance histogram ·
effort Medium` — cross-ref `GEO-DATA-SOURCING-MASTER.md` + `LOD-RATE.md`.

---
*Authority: `BUILDING-HEIGHT-REPLICATION-STANDARD.md` (L-646) · C62 · C63 §3 Axis 6. Feeds: `RATE.md` ·
`../../LOD-RATE.md`. Source: `heightSources.mjs` `swissbuildings3d` (§SWISS-NDSM-STAC-BUILD).*
