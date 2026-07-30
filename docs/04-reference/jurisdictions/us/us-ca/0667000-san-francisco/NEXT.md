# NEXT — San Francisco (0667000)

> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD (Phase-1 AUDIT complete)

## 1 — WHERE WE STOPPED

Dossier fully scaffolded this pass (C63 Phase-1 AUDIT) — SF was bake-covered but previously unscaffolded. Cheap
axes cited-derived: DATA-SOURCES 50 %, TERRAIN 50 % (baked-but-unverified), CONTEXT 67 % (6/9, coastal → sea).
Overall **53 % `partial`**. No rule pack; PARCEL/LEGISLATION/ENVELOPE/HEIGHTS honestly `not-assessed`.

## 2 — THE NUMBER

Overall = (0.50×15 + 0.50×10 + 0.667×5)/30 = 15.83/30 = **53 %**. Denominator = 3 assessed axes {DATA-SOURCES,
TERRAIN, CONTEXT}; the 4 human-gated axes are `not-assessed`, not 0 % (C63 §1.2).

## 3 — BLOCKERS

### 3.1 — Zoning + height-bulk not wired
- **What.** SF publishes zoning + **height-and-bulk district** layers on DataSF, but they are not wired/packed.
- **Why it blocks.** LEGISLATION + ENVELOPE stay `not-assessed`.
- **Unblock.** Probe the DataSF layer schemas → wire as zone source → build the height/bulk pack (+ L-449).
- **EXACT RESUME STEP.** `GET` the DataSF height-and-bulk district FeatureServer `?f=json`; record the numeric height field.

### 3.2 — Height derive unwired
- **What.** `overture_us` (Overture + 3DEP nDSM) is impl:`documented`; SF bake uses OSM footprints.
- **Unblock.** Wire the Overture/3DEP nDSM stamp; re-bake; probe histogram.
- **EXACT RESUME STEP.** Confirm 3DEP 1 m LiDAR tile availability for the SF bbox via the TNM products API.

## 4 — TRIP-WIRES

- **4.1 — If DataSF height-bulk schema is confirmed numeric** → SF is unusually addressable for a US city; build the pack.
- **4.2 — If Overture/3DEP nDSM is wired** → HEIGHTS re-opens.
- **4.3 — If the L-642 rail/trees re-bake lands** → recompute CONTEXT (6/9 today).

## 5 — WHAT IS ALREADY BUILT (do not redo)

- USGS 3DEP terrain source (`terrain.mjs` `us`, live-probed).
- SF context bake (`bake.mjs` REGIONS `sanfrancisco`, California extract).

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Note |
|---|---|---|---|
| `tnmaccess.nationalmap.gov/api/v1/products` (3DEP) | terrain DEM | VERIFIED-LIVE (national probe) | public domain |
| Geofabrik `california-latest.osm.pbf` | context OSM | document | bake extract |

## 7 — DEAD ENDS

- No national US cadastre — SF Assessor parcels are per-county, not a national keyless layer.

## 8 — THE SMALLEST NEXT STEP

Probe the DataSF height-and-bulk district FeatureServer schema (2 dev-hours). A numeric height field confirms SF's
envelope is wireable; absence pushes SF toward the Planning-Code-read path.
