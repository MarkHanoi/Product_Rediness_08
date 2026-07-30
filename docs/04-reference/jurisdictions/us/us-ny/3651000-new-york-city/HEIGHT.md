# Building-height status — New York City (3651000)

> Feeds C63 **HEIGHTS/LOD** axis (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646). **Last updated:** 2026-07-30.
> **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-**CAPABLE but UNWIRED**

**Real height is capable for NYC but the join is not implemented and not baked.** `heightSources.mjs` maps
`newyork:'overture_us'` (impl:`documented`, coverage `partial`): the path is **Overture height/num_floors**
(~20M+ US buildings, growing) **+ USGS 3DEP DSM−DTM nDSM** (the national-accuracy top-up, >60 % of US LiDAR).
NYC additionally has a free **NYC 3D building model** (potential LOD2) — a candidate richer source.

**Why still `not-assessed`:** the NYC bake uses the **OSM** New York state extract (buildings, not Overture), and
`overture_us` is `documented`, not `live` — no fetcher stamps real heights onto the NYC footprints yet, and no
per-building `heightProvenance` histogram has been probed. The bake renders OSM footprints at the `assumed` 9 m
default until wired. Capability is never reported as a measurement (§CONTEXT-DATA-HONESTY).

## Height source ladder (which rung NYC sits on)

| Rung | Source | Provenance tag | Present here? |
|---|---|---|---|
| measured | USGS 3DEP DSM−DTM nDSM (derive) | `tagged` | derivable, NOT wired (`overture_us` impl:documented) |
| measured | Overture `height` | `tagged` | partial (~20M US, unwired for NYC bake) |
| measured | NYC 3D building model (LOD2) | `tagged` | candidate — free access + currency UNCONFIRMED |
| derived | OSM `building:levels` × 3.2 m | `derived-levels` | partial |
| fallback | the 9 m carpet | `assumed` | ⚠ what renders today |

## Provenance distribution (the axis input)

Not probed — the deployed NYC tiles render OSM footprints at the `assumed` default until the Overture/3DEP nDSM
join is wired + baked. No fabricated height is emitted.

## What would raise the HEIGHTS/LOD axis

`Wire the Overture-height / 3DEP DSM−DTM nDSM stamp (US analogue of the FR LiDAR HD / DK DHM path) onto NYC
footprints, re-bake, probe the histogram · effort high (point-cloud pipeline)` — cross-ref
`GEO-DATA-SOURCING-MASTER.md` + `../../LOD-RATE.md`. Confirm the free NYC 3D model as an LOD2 shortcut.

---
*Authority: `BUILDING-HEIGHT-REPLICATION-STANDARD.md` · C62 · C63 §3 Axis 6. Feeds: `RATE.md` · `../../LOD-RATE.md`.*
