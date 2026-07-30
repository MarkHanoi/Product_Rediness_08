# HEIGHT — Oslo (kommune 0301)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-CAPABLE, unbaked

**No measured height baked.** Context buildings render OSM/assumed (9 m default). Two national paths exist:

- **NDH nDSM (free path)** — `heightSources.mjs` `ndh_no` (impl:`documented`, coverage `partial` →
  APPEND top-up; `REGION_SOURCE oslo:'ndh_no'`). Nationwide ≥2 pts/m² LiDAR, free, confirmed live. This
  is the measured-**capable** source, not yet baked per-city.
- **FKB-Bygning** (footprint + height) — licence-gated (commercial use needs a reseller purchase or a
  Kartverket agreement); blocked on licence, not a free path.

No per-building `heightProvenance` histogram has been probed for the Oslo bbox.

**Resume:** wire the NDH nDSM APPEND join for the `oslo` bake bbox; re-bake; probe the deployed provenance
histogram for the `tagged` fraction. A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs`, C63 §3 Axis 6.*
