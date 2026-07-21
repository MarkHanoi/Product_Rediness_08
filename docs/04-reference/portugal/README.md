# Portugal — 3D Context Data (build-order #7)

Part of the country-by-country 3D-context-data quality upgrade — umbrella item **L-511**
(`../V1-LAUNCH-READINESS-AUDIT.md`). Research ground-truth: `Pryzm_3D_Context_Data_Sourcing.md`.

- **Target LOD:** OSM-level footprint + nDSM height
- **Source(s):** OSM/Overture + DGT LiDAR
- **Integration effort:** HIGH
- **Spike status:** NOT STARTED
- **Implementation status:** NOT STARTED (blocked on spike Gate)

## Layout
- `topics/` — one file per context layer (buildings-lod-height, roads-pedestrian, water, parks-trees)
- `regions/` — per-region endpoint/licence notes where the country is not a single national product

## Gate (Phase-1 exit) — fill with EVIDENCE, not assumption
| # | Question | Answer |
|---|---|---|
| a | Real footprint? | TBD |
| b | Real height? | TBD |
| c | Real roof shape? | TBD |
| d | Roads/water/parks object-level? | TBD |
| e | Known coverage gaps? | TBD |

**Do not start implementation until this Gate is marked PASSED with evidence.**
