# NEXT — Greater London (E12000007)

> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD (Phase-1 AUDIT complete)

## 1 — WHERE WE STOPPED

Dossier scaffolded this pass (C63 Phase-1 AUDIT). Cheap axes cited-derived: DATA-SOURCES 50 %, TERRAIN 50 %
(baked-but-unverified), CONTEXT 56 % (5/9). Overall **51 % `partial`**. No rule pack; PARCEL/LEGISLATION/
ENVELOPE/HEIGHTS honestly `not-assessed`. No live endpoint independently re-probed this pass.

## 2 — THE NUMBER

Overall = (0.50×15 + 0.50×10 + 0.556×5)/30 = 15.28/30 = **51 %**. Denominator = 3 assessed axes {DATA-SOURCES,
TERRAIN, CONTEXT}; the 4 human-gated axes are `not-assessed`, not 0 % (C63 §1.2).

## 3 — BLOCKERS

### 3.1 — Height derive unwired
- **What.** EA DSM−DTM nDSM derivable (England) but `heightSources.mjs` maps `london → no-source`.
- **Why it blocks.** HEIGHTS renders the `assumed` 9 m carpet, not measured heights.
- **Unblock.** Live-probe EA DSM 1 m GetCoverage → wire the DSM−DTM stamp (reuse DK/ES engine) → re-bake → probe histogram.
- **EXACT RESUME STEP.** `GET` the EA LIDAR Composite DSM 1 m WCS GetCoverage for `-0.20,51.44,0.02,51.55`; assert a real GeoTIFF returns.

### 3.2 — No by-right envelope (structural)
- **What.** GB planning is discretionary — no as-of-right FAR/height.
- **Unblock.** Model Permitted Development Rights (the only by-right slice) + Conservation-Area/LVMF refusal overlays.
- **EXACT RESUME STEP.** Enumerate the current England PDR classes (GPDO 2015 as amended) as a refusal/allowance model.

## 4 — TRIP-WIRES

- **4.1 — If EA DSM GetCoverage returns keyless** → HEIGHTS becomes pure engineering; do the stamp (§3.1).
- **4.2 — If a Scottish/Welsh/NI city is tackled** → EA terrain is England-only; add its own source row first.
- **4.3 — If the rail/trees/sea re-bake lands** → recompute CONTEXT (5/9 today).

## 5 — WHAT IS ALREADY BUILT (do not redo)

- EA DTM terrain source (`terrain.mjs` `gb`, live-probed 2026-07-25).
- London context bake (`bake.mjs` REGIONS `london`).

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Note |
|---|---|---|---|
| `environment.data.gov.uk/…/dtm-1m/wcs` | terrain DTM | VERIFIED-LIVE (2026-07-25) | OGL v3, keyless |
| Geofabrik `greater-london-latest.osm.pbf` | context OSM | document | bake extract |

## 7 — DEAD ENDS

- OS Building Heights / OS MasterMap — commercial; not keyless (do not re-attempt as free).

## 8 — THE SMALLEST NEXT STEP

Live-probe EA DSM 1 m GetCoverage (2 dev-hours). Keyless GeoTIFF → the height derive is engineering; 401 → heights
stay the honest 9 m carpet.
