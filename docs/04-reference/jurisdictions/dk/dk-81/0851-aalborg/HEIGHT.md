# HEIGHT — Aalborg (kommune 0851)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-CAPABLE nationally, apikey-gated

**Denmark is measured-height-capable nationally.** GeoDanmark `Bygning` carries no scalar height (footprints
only, VERIFIED 2026-07-25), so the real height is the **DHM nDSM**: `P90(dhm_overflade − dhm_terraen)` over the
eroded footprint (`heightSources.mjs` `geodanmark` impl:`live`, `stampDhmHeightsOnGeojsonseq`; `bake.mjs`
denmark `heightJoin:'dhm'`). This national capability reaches Aalborg like any DK bbox.

**Why `not-assessed`:** the DHM join is **apikey-gated** (`DATAFORDELER_API_KEY`). Without the repo secret the
join returns `blocked` and footprints keep the honest OSM `assumed` default — never a fabricated height. **No
per-bbox provenance histogram** has been probed for the 0851 extent.

**Resume:** confirm the apikey is set, re-bake with the DHM join, then probe the deployed provenance histogram
at this bbox → the `tagged` fraction is the axis score.

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs`, C63 §3 Axis 6.*
