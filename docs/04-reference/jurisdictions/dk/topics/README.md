# Denmark — 3D Context Data (build-order #2)

Part of the country-by-country 3D-context-data quality upgrade — umbrella item **L-511**
(`../../../V1-LAUNCH-READINESS-AUDIT.md`). Research ground-truth: `Pryzm_3D_Context_Data_Sourcing.md`.

> **Path note (L-609):** this context-data index moved from `docs/04-reference/jurisdictions/dk/README.md`
> to `docs/04-reference/jurisdictions/dk/topics/README.md` under the ISO-coded jurisdiction tree
> (JURISDICTION-PLAYBOOK §1). The zoning/legal index for Denmark is the sibling `../README.md`.

- **Target LOD:** LOD2 (real roofs)
- **Source(s):** Danmark i 3D + GeoDanmark + DHM
- **Integration effort:** LOW
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
