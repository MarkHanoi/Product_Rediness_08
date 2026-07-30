# HEIGHT — Sevilla (INE 41091)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`)

**MEASURED-CAPABLE, not yet baked.** `heightSources.mjs` maps this city to `mds_edificacion` (CNIG MDS Edificación `mdsn_e025`, impl:`live`, keyless CC-BY) with a per-city ready bbox listed for `sevilla`. That is a REAL measured nDSM path (`tagged`), a strict upgrade over the OSM 9 m guess. **But** no baked-PMTiles `heightProvenance` histogram has been probed and the per-city MDS re-bake is not confirmed landed — so heights currently render OSM/assumed. Axis 6 stays `not-assessed` until a bake + provenance probe.

**Resume:** run the MDS coverage probe for the 41091 bbox; confirm/add the per-city MDS join; re-bake;
probe the deployed provenance histogram. A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs`, C63 §3 Axis 6.*
