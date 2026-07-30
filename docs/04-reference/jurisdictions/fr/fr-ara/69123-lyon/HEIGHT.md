# HEIGHT — Lyon (INSEE 69123)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-**CAPABLE**

**Source is wired and live, but the per-city bake has NOT landed.** IGN **BD TOPO®** `batiment.hauteur`
(photogrammetry/LiDAR metres) is implemented and live in `heightSources.mjs` (`bdtopo`, impl:`live`), and
`REGION_SOURCE` maps `lyon:'bdtopo'`. (Note: this is the *context-building* measured height; distinct from
the Lyon `pluhauteur` PLU *ceiling* layer used for the LEGISLATION axis.)

**Why still `not-assessed`:** no per-city BD TOPO bake has been confirmed landed for the Lyon bbox and no
per-building `heightProvenance` histogram has been probed for the deployed tiles (the same single-shot WFS
cap that blocks Paris applies — §BDTOPO-CAP-TRUNCATE). Capability is never reported as a measurement
(§CONTEXT-DATA-HONESTY).

**Resume:** land the paginated / footprint-join BD TOPO bake for the Lyon bbox, then probe the deployed
provenance histogram to compute the `tagged` fraction. A fabricated height is never emitted.

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` (`bdtopo`), C63 §3 Axis 6.*
