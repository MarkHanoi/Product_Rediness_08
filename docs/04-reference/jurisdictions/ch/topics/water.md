# Switzerland — Water (context layer)

> Part of L-511 (`../../../ISSUE-LOG.md`). Research ground-truth:
> `../findings/SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md`. **Gate d (water): PASSED** (2026-07-24).

## Source

**swissTLM3D**, topic group **"Gewässernetz"** (water network) — watercourse centerlines + lake polygon
outlines. Cross-verifiable against **swissSURFACE3D**'s independently classified "Water" LiDAR point
class.

| Property | Value |
|---|---|
| Coverage | Full national + Liechtenstein |
| Geometric accuracy | 0.2–1.5m (watercourses and lakes are "well-defined" objects — same top accuracy tier as roads and buildings) |
| Object-level? | **YES** — watercourse centerlines and lake polygon outlines as distinct feature classes with attributes |
| Cross-check available | swissSURFACE3D includes a dedicated **Water** point class. swissSURFACE3D Raster (DSM) additionally integrates TLM watercourse vectors "to improve the surface representation of large rivers and lakes" per swisstopo's product description — the vector and point-cloud products are already mutually reconciled by swisstopo, not independently inconsistent |
| Format | ESRI FileGDB (native), SHP, DXF |
| Licence | Free OGD since 1 March 2021; no login; commercial use permitted |
| Download | `map.geo.admin.ch` selection UI or swisstopo documented API |

## Gate answer

| # | Question | Answer |
|---|---|---|
| d (water portion) | Object-level? | **YES** — confirmed nationwide, with a genuine second independent source (classified LiDAR) for cross-verification |

## Fallback condition

None needed — swissTLM3D is authoritative, nationwide, free OGD. OSM/Overture fallback is not
required for this layer in Switzerland.

## Open items

- None material identified. This is the most straightforwardly confirmed of the four context layers —
  treat as a template for how thorough the other three topic checks should be.
