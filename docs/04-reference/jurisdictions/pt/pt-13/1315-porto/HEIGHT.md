# HEIGHT — Porto (DICOFRE 1315)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`)

**No measured height baked.** Context buildings render OSM/assumed (9 m default). A real source EXISTS and
is documented: `heightSources.mjs` `dgt_pt` — **DGT national LiDAR nDSM** (impl:`documented`, provenance
`tagged`, LoD1-real-height, "~75 %" good height, DGT CDD LiDAR 2024–25 10 pts/m², open). It has **no
national footprint layer** (uses Overture/OSM footprints, DSM−DTM 90th-pctile per footprint) and is **not
yet baked/joined** for the `porto` region, so no per-city provenance histogram has been probed. Capability
is never reported as a measurement (§CONTEXT-DATA-HONESTY).

**Resume:** confirm/add the `dgt_pt` nDSM join for the Porto bbox; re-bake; probe the deployed provenance
histogram; only then does a `tagged` fraction exist. A fabricated height is never emitted.

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` `dgt_pt`, C63 §3 Axis 6.*
