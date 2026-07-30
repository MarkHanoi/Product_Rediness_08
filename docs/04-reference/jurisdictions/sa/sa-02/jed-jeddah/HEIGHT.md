# HEIGHT — Jeddah (UN/LOCODE JED)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`license-restriction`)

**No measured height baked — the national source is geo-fenced.** `heightSources.mjs` maps `jeddah →
ml_sa`, impl:**`blocked`**: reachable = Microsoft ML footprints + Copernicus GLO-30 (coarse 30 m DEM
sanity), NOT real per-building height; Balady `NOOFFLOORS` is geo-fenced (403). Region keeps the honest
9 m `assumed` default — never a fabricated height.

**Overture caveat.** Jeddah's buildings layer is Overture (7.2× OSM density, ~167,766 footprints) — but
Overture height is **~0 % in Saudi** (ML footprints carry none). The density win brings NO skyline; the
model renders flat-`assumed` until a real per-building source is reachable.

**Resume (all blocked from outside SA):** an in-SA egress to Balady `NOOFFLOORS`; a GEOSA/MOMRAH data
agreement; confirm whether GEOSA publishes an open LoD2/nDSM (currently licence-gated). A fabricated
height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` (`ml_sa`), C63 §3 Axis 6.*
