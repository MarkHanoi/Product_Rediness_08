# HEIGHT — Helsinki (kuntanumero 091)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — CANDIDATE source, UNWIRED

**No measured height baked, and no height source is WIRED.** `heightSources.mjs` `REGION_SOURCE helsinki`
returns `{status:'no-source', reason:'FI not in LOD-RATE-MASTER (Helsinki has open LoD2 — candidate to add)'}`.
Context buildings render OSM/assumed (9 m default).

The reason string documents the unlock: **Helsinki publishes an open LoD2 CityGML city model** (Helsinki
Region Infoshare / `kartta.hel.fi`) — real measured roof heights, a `full` REPLACE-class source once wired.
It is a documented candidate, not a wired source, and no `heightProvenance` histogram has been probed.

**Resume:** add a Helsinki LoD2 source to `heightSources.mjs` (`SOURCES` + `REGION_SOURCE helsinki`); wire the
REPLACE join for the `helsinki` bake bbox; re-bake; probe the deployed provenance histogram for the `tagged`
fraction. A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs`, C63 §3 Axis 6.*
