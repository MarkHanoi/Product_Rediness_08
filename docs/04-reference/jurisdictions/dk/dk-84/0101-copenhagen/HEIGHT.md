# HEIGHT — Copenhagen / København (kommune 0101)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-CAPABLE, apikey-gated

**Denmark is measured-height-capable nationally.** There is no keyless per-building height *attribute*
(GeoDanmark `Bygning` = footprints only, VERIFIED 2026-07-25), so the real height is the **DHM nDSM**:
`P90(dhm_overflade − dhm_terraen)` over the eroded footprint (`heightSources.mjs` `geodanmark` impl:`live`,
`stampDhmHeightsOnGeojsonseq`; `bake.mjs` denmark `heightJoin:'dhm'`). This is the same national-nDSM shape
as the ES MDS / CH swisstopo joins.

**Why `not-assessed`:** the DHM join is **apikey-gated** (`DATAFORDELER_API_KEY`). Without the repo secret at
bake time the join returns `blocked` and every footprint keeps the honest OSM `assumed` default (9 m) — never a
fabricated height. **No per-bbox provenance histogram** (the `tagged` fraction) has been probed for the 0101
extent, so the axis score is genuinely unmeasured, not 0.

**Resume:** confirm `DATAFORDELER_API_KEY` is set for the denmark bake, re-bake, then probe the deployed
provenance histogram at the Copenhagen bbox → the `tagged` fraction is the axis score.

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` (`geodanmark` / `stampDhmHeightsOnGeojsonseq`), C63 §3 Axis 6.*
