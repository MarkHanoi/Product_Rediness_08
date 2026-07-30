# NEXT — Helsinki (kuntanumero 091)

> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED

**Where we stopped:** dossier scaffolded under C63 Phase-1 (2026-07-30). Cheap axes cited-derived
(DATA-SOURCES 60 · TERRAIN 50 · CONTEXT 56 → overall 56 % `partial`). No live probe, no rule pack.

---

## 1 — BLOCKERS

### B1 — No Finnish parcel provider wired
`parcelProviders/registry.ts` has no `isInFinland` predicate → a Helsinki click falls to the OSM footprint
fallback. **RESUME:** add `isInFinland` + an MML Kiinteistörekisteri (or Helsinki open kiinteistökartta) adapter.

### B2 — Ryhti item-level schema unconfirmed
The `kaavatietomalli` OGC API is live+public, but the item-level property schema for the plan collections is
unconfirmed (binary GeoJSON payload — a tooling gap, not an access gate). **RESUME:** decode one Helsinki
asemakaava feature; confirm the structured use/density/height fields.

### B3 — Terrain DEM needs a free repo secret
`terrain.mjs` source `fi` (MML WCS) is `token`-gated on a FREE `MML_API_KEY`. **RESUME:** register a free NLS
open-data key (`asiointi.maanmittauslaitos.fi`); set the repo secret; run the `helsinki` terrain bake;
`terrain.verify.mjs` round-trip to lift TERRAIN 50→100.

### B4 — Height source unwired (open LoD2 candidate)
Helsinki has an open LoD2 city model but no `heightSources.mjs` entry. **RESUME:** add the LoD2 source +
`REGION_SOURCE helsinki`; wire the REPLACE join; re-bake.

---

## 2 — TRIP-WIRES

- **If `MML_API_KEY` is set** → TERRAIN (bake) unlocks; the cadastral adapter also becomes probe-able.
- **If the Ryhti item schema is confirmed** → the LEGISLATION per-clau count can begin (Finland is the
  strongest Nordic legislation feed after Denmark).
- **If the Helsinki LoD2 source is wired** → HEIGHTS jumps from `no-source` to a `full` REPLACE (measured).

## 3 — SMALLEST NEXT STEP (0.5 dev-days)

Register the free NLS `MML_API_KEY` and set the repo secret — it gates the terrain bake and the cadastral
probe, the two cheapest Helsinki wins.
