# HEIGHT — Stockholm (kommunkod 0180)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-CAPABLE, unbaked

**No measured height baked.** Context buildings render OSM/assumed (9 m default). The national source is
Lantmäteriet CC0 footprints + national LiDAR nDSM (`heightSources.mjs` `lidar_se`, impl:`documented`,
coverage `partial` → APPEND top-up; `REGION_SOURCE stockholm:'lidar_se'`). This is measured-**capable**, not
yet baked per-city, and no `heightProvenance` histogram has been probed for the Stockholm bbox.

**Resume:** wire the LiDAR nDSM APPEND join for the `stockholm` bake bbox (needs the Lantmäteriet key);
re-bake; probe the deployed provenance histogram for the `tagged` fraction. A fabricated height is never
emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs`, C63 §3 Axis 6.*
