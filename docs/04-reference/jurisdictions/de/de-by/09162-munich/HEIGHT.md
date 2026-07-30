# HEIGHT — Munich / München (AGS 09162)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`license-restriction`)

**Measured source BLOCKED.** `heightSources.mjs` sets
`REGION_SOURCE.munich = { source:'lod2de', status:'blocked', reason:'Bavaria LoD2 licence TBD (ZSHH
INSPIRE-restricted)' }`. Nationally LoD2-DE is ~58M buildings at ~1 m, and NRW is the only live open fetcher
(`fetchLod2DeNrw`); **Bavaria's LoD2 licence terms are unconfirmed** — ZSHH (Zentrale Stelle für Hauskoordinaten
und Hausumringe) is hosted at the Bavarian survey office, but hosting ≠ open terms (README §6). Until the Bavarian
LoD2 product page confirms free/open terms, this stays `blocked`. Context buildings render OSM/`assumed` (9 m).

**Resume:** read the `geodaten.bayern.de` / BayernAtlas LoD2 product page for licence terms; if open, wire a
Bavaria LoD2-DE fetcher + `munich` heightJoin, re-bake, probe the provenance histogram. A blocked source is never
reported as measured (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `tools/context-bake/heightSources.mjs`, [`../../topics/buildings-lod-height.md`](../../topics/buildings-lod-height.md), C63 §3 Axis 6.*
