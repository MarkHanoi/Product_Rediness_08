# HEIGHT — Riyadh (UN/LOCODE RUH)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`license-restriction`)

**No measured height baked — the national source is geo-fenced.** `heightSources.mjs` maps `riyadh →
ml_sa`, impl:**`blocked`**: the reachable products are Microsoft ML footprints + Copernicus GLO-30 (a
coarse 30 m DEM sanity layer), NOT real per-building height; the authoritative Balady `NOOFFLOORS` field
is geo-fenced (403 from outside SA). Region keeps its footprints at the honest 9 m `assumed` default —
never a fabricated height.

**Overture caveat.** Riyadh's buildings layer is Overture (5.3× OSM density) — but Overture height is
**~0 % in Saudi** (the extra footprints are Microsoft-ML, which carry no height), against ~73 % in
Barcelona (`CONTEXT-BUILDING-SOURCE-EVALUATION.md`). So the density win does NOT bring height; the
skyline renders flat-`assumed` until a real per-building source is reachable.

**Resume (all blocked from outside SA):** (a) an in-SA egress reaching Balady `NOOFFLOORS`; (b) a
GEOSA/MOMRAH data agreement; (c) confirm whether GEOSA publishes an open LoD2/nDSM product (currently
licence-gated). A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` (`ml_sa`), C63 §3 Axis 6.*
