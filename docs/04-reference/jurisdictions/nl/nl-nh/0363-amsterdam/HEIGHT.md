# HEIGHT — Amsterdam (CBS 0363)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-**CAPABLE** (the strongest EU source)

**Source is wired and live, but the per-city bake has NOT landed.** **3DBAG** (BAG × AHN LiDAR) is
implemented and live in `heightSources.mjs` (`3dbag`, impl:`live`; `fetch3dbag` OGC API Features →
CityJSON, RD→WGS84 footprint ingest built 2026-07-25), and `REGION_SOURCE.amsterdam` = `'3dbag'`. The
height is a **real measured** roof−ground value (`b3_h_dak_50p` roof 50-pctile − `b3_h_maaiveld` ground) →
`tagged`, and 3DBAG additionally carries `b3_dak_type` roof geometry (the LoD2-mesh next tier). This is the
richest building-height source in the whole PRYZM catalogue.

**Why still `not-assessed`:** the buildings bake uses ONE whole-country `netherlands` region (`bake.mjs`), and
the 3DBAG `items` API is paginated — a 4°×3° national bbox is refused per-tile (`fetch3dbag` `bboxTooLargeForWfs`
guard: it would truncate at ~5000 arbitrary buildings) → the whole-country region keeps OSM (honest 9 m
`assumed`). So the deployed national tiles render OSM for Amsterdam. The Amsterdam **per-city** bbox
`[4.83,52.34,4.97,52.42]` (0.14°×0.08°) **resolves exactly** through `fetch3dbag`, but that per-city bake has
not landed, and no per-building `heightProvenance` histogram was probed on deployed tiles. Capability is never
reported as a measurement (§CONTEXT-DATA-HONESTY).

**Resume:** either add a per-city `netherlands`→Amsterdam 3DBAG bbox bake, OR wire the OSM-footprint-join
(stamp 3DBAG height onto bake's own OSM clip — the named follow-up in `heightSources.mjs`, exactly the Spain
MDS / Denmark DHM pattern), then probe the deployed provenance histogram to compute the `tagged` fraction. A
fabricated height is never emitted.

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` (`3dbag`, `fetch3dbag`, `REGION_SOURCE.amsterdam`), `bake.mjs` §NL-NATIONWIDE, C63 §3 Axis 6.*
