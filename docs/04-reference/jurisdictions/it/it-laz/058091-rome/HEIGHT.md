# HEIGHT — Roma (ISTAT 058091)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`)

**No measured height baked, and Rome is a structural no-source.** Context buildings render OSM/assumed
(9 m default). `heightSources.mjs` REGION_SOURCE `rome` = `{ source: 'piedmont_it', status: 'no-source',
reason: 'Lazio building-height layer unconfirmed — no source for Rome' }`. There is **no national Italian
building-height product** (PST/SIM LiDAR is terrain-only); only ARPA Piemonte Edifici 3D (Turin) is a real
LoD1 layer. This is a **structural gap, not a currency lag** (`heightSources.mjs` `piedmont_it` note).

**Resume:** locate/confirm a Lazio or Roma Capitale building-height / LoD layer (or an nDSM from a Lazio
DSM−DTM difference); wire a join; re-bake; probe the provenance histogram. Until then a `tagged` fraction
does not exist. A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` REGION_SOURCE `rome`, C63 §3 Axis 6.*
