# Portugal — Water (context layer)

> Umbrella **L-511**, deep-dive **L-514**. Full writeup: `../PORTUGAL-CONTEXT-DEEP-DIVE.md`.
> **Endpoints NOT live-probed this session** — *per founder deep-dive, verify live before relying.*
> Items marked **UNVERIFIED**.

- **Sources:** **SNIRH** (Sistema Nacional de Informação de Recursos Hídricos — national
  water-resources system) + **DGT hydrography** via SNIG / INSPIRE.
- Genuine upgrade over OSM: authoritative banks + national hydrography classification. Lower priority
  than buildings/roads (OSM water is already close to sufficient) — badge REAL where wired, else OSM
  ESTIMATED.

## 3D modeling method — WATER (the one layer where you do NOT reuse nDSM) (L-514)
Same rule as Spain: **NEVER derive water surfaces from raw LiDAR** (NIR is absorbed / reflected away
→ returns over open water are sparse/noisy/missing). Flatten to authoritative reference elevations:
```
1. Shape from SNIRH / DGT hydrography polygon (lake) or line (river) — NOT from LiDAR.
2. Lake/reservoir: sample DGT DTM (not raw points) at shore/inflow → robust LOW-percentile elevation
   → assign that single flat elevation to the whole polygon.
3. River: longitudinal gradient but flat across width → sample DTM along centreline at intervals,
   interpolate a smooth gradient; still ignore raw points over the water surface.
4. Sea/coast: fixed mean-sea-level reference plane for the ATLANTIC coast (PT vertical datum is
   MSL-referenced) — the shoreline is a tidal boundary, not a per-tile terrain feature.
```
As in Spain, "more raw data" (LiDAR points over water) is the WRONG input here.

## Gate (per founder deep-dive; UNVERIFIED until live-probed)
| Question | Answer | Evidence (NOT live-probed) |
|---|---|---|
| Object-level polygons/lines? | **YES (expected)** | SNIRH + DGT hydrography via SNIG/INSPIRE |
| CRS | ETRS89 / PT-TM06 expected; verify | UNVERIFIED |
| License (verbatim) | verify via SNIG/INSPIRE terms | UNVERIFIED |
| Fallback condition | OSM (already near-sufficient for water) where SNIRH/DGT unwired | |
