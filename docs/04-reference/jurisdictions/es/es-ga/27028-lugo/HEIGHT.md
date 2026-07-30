# HEIGHT — Lugo (INE 27028)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`)

**No measured height baked.** Context buildings render OSM/assumed (9 m default). The national CNIG MDS Edificación raster (`heightSources.mjs` `mds_edificacion`, impl:`live`) could be joined via the `spain` `heightJoin:'mds'` (`bake.mjs`), but no per-city provenance histogram has been probed here.

**Resume:** run the MDS coverage probe for the 27028 bbox; confirm/add the per-city MDS join; re-bake;
probe the deployed provenance histogram. A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs`, C63 §3 Axis 6.*
