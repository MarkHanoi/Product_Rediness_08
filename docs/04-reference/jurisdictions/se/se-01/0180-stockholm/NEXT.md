# NEXT — Stockholm (kommunkod 0180)

> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED

**Where we stopped:** dossier scaffolded under C63 Phase-1 (2026-07-30). Cheap axes cited-derived
(DATA-SOURCES 60 · TERRAIN 50 · CONTEXT 56 → overall 56 % `partial`). No live probe, no rule pack.

---

## 1 — BLOCKERS

### B1 — No Swedish parcel provider wired
`parcelProviders/registry.ts` has no `isInSweden` predicate → a Stockholm click falls to the OSM footprint
fallback. **RESUME:** add `isInSweden` + a Lantmäteriet Fastighetsindelning adapter (national API).

### B2 — NGP zone-GIS geo-blocked from non-SE IPs
The Nationella Geodataplattformen (post-2022 detaljplan provisions) blocks non-Swedish IPs.
**RESUME:** live-probe a Stockholm detaljplan via an SE-resident proxy; confirm structured provision codes.

### B3 — Terrain DEM needs a free repo secret
`terrain.mjs` source `se` (Lantmäteriet Höjddata) is `token`-gated on a FREE `LANTMATERIET_API_KEY`.
**RESUME:** register a free Lantmäteriet consumer key; set the repo secret; run the `stockholm` terrain bake;
`terrain.verify.mjs` round-trip to lift TERRAIN 50→100.

---

## 2 — TRIP-WIRES

- **If `LANTMATERIET_API_KEY` is set** → both TERRAIN (bake) and HEIGHTS (LiDAR nDSM join) unlock together.
- **If an SE proxy is available** → NGP live-probe promotes the zone-GIS slot `documented`→`live` and lets
  the LEGISLATION per-clau count begin.

## 3 — SMALLEST NEXT STEP (0.5 dev-days)

Register the free Lantmäteriet key and set the repo secret — it is the single gate on TERRAIN + HEIGHTS +
the cadastral adapter, the three cheapest wins for Stockholm.
