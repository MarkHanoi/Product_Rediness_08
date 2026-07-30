# HEIGHT — Berlin (AGS 11000)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`)

**Measured source DOCUMENTED but UNBAKED.** `heightSources.mjs` maps `REGION_SOURCE.berlin='lod2de'`
(`SOURCES.lod2de`, name "LoD2-DE (per-Land CityGML)", `impl:'documented'`, `provenance:'tagged'`,
`lodNow:'LoD1-real-height'`). The note there is explicit: LoD2-DE is ~58M buildings nationally at ~1 m accuracy,
**NRW/Berlin/BW/Sachsen-Anhalt open**; but only **NRW** has a live keyless fetcher (`fetchLod2DeNrw`,
`SOURCES.lod2de_nrw.impl='live'`, opengeodata.nrw.de). **Berlin is a different Land with a different endpoint —
reachable in principle, but no Berlin CityGML fetcher is wired and no bake has landed.** Context buildings
therefore render OSM/`assumed` (9 m default).

**Resume:** wire a Berlin LoD2-DE endpoint (post-FIS-Broker migration — the historic `re_3dgebaeude` WFS 404s,
see `NEXT.md §7`), add a `berlin` heightJoin, re-bake, probe the deployed provenance histogram. Capability is
never reported as a measurement (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `tools/context-bake/heightSources.mjs`, [`../../topics/buildings-lod-height.md`](../../topics/buildings-lod-height.md), C63 §3 Axis 6.*
