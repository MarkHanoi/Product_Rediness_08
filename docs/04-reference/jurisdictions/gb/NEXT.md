# NEXT — United Kingdom (`gb`, national)

> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD (Phase-1 AUDIT complete)

## 1 — WHERE WE STOPPED (the one-paragraph truth)

`gb/` country folder + the Greater London city dossier were scaffolded this pass (C63 Phase-1 AUDIT). The three
cheap axes are cited-derived from `bake.mjs`/`terrain.mjs`/`heightSources.mjs`: DATA-SOURCES 50 %, TERRAIN 50 %
(baked-but-unverified), CONTEXT 56 %. The human-gated axes (PARCEL, LEGISLATION, ENVELOPE, HEIGHTS) are honestly
`not-assessed`. No live endpoint was independently re-probed this pass; no rule pack exists. The next gain is a
DIFFERENT kind of work per axis: verify terrain (cheap), wire the EA DSM−DTM height derive (medium), and accept
that legislation/envelope are structurally capped by discretionary planning.

## 2 — THE NUMBER

Greater London **overall 51 % `partial`** over the assessed subset {DATA-SOURCES 50, TERRAIN 50, CONTEXT 56},
weights {15,10,5} renormalised over 30. Denominator = the 3 assessed axes; the 4 human-gated axes are
`not-assessed`, not 0 % (C63 §1.2).

## 3 — BLOCKERS

### 3.1 — No keyless national parcel cadastre
- **What.** GB has no open legal-parcel cadastre; HMLR INSPIRE polygons are freehold **index** extents, OS
  MasterMap is licensed. `parcelProviders/registry.ts` has no GB entry → footprint-fallback.
- **Why it blocks.** PARCEL axis is construction-capped low for footprint-fallback jurisdictions (C57 §L-640).
- **Unblock (ascending).** Probe HMLR INSPIRE index polygons as a routing source → licence a cadastre → OS agreement.
- **EXACT RESUME STEP.** `GET` an HMLR INSPIRE Index Polygon tile for a London postcode; inspect whether the
  geometry is per-parcel and joinable to a click-point.

### 3.2 — Height derive unwired
- **What.** EA DSM−DTM nDSM is derivable (England) but `heightSources.mjs` maps `london → no-source`.
- **Unblock.** Wire the DSM−DTM stamp (reuse DK/ES nDSM engine) onto London OSM footprints; re-bake; probe histogram.
- **EXACT RESUME STEP.** Live-probe the EA **LIDAR Composite DSM 1 m** WCS GetCoverage for the London bbox
  (sibling of the already-live DTM route) and assert a real GeoTIFF comes back.

## 4 — TRIP-WIRES

- **4.1 — If a Scottish/Welsh/NI city is tackled** → add its terrain source row (EA is England-only) BEFORE
  claiming any cheap axis (§3).
- **4.2 — If the rail/trees/sea context re-bake lands** → recompute CONTEXT (currently 5/9) for London.
- **4.3 — If OS ever opens Building Heights** → wire it and re-rate HEIGHTS (today it is deliberately skipped as commercial).

## 5 — WHAT IS ALREADY BUILT (do not redo)

- EA LIDAR Composite DTM 1 m terrain source (`terrain.mjs` `gb`) — live-probed keyless 2026-07-25.
- London context bake (`bake.mjs` REGIONS `london`, greater-london extract).

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `environment.data.gov.uk/…/lidar-composite-…-dtm-1m/wcs` | terrain DTM | VERIFIED-LIVE (2026-07-25) | WCS 2.0.1 GetCapabilities HTTP 200, OGL v3 |
| Geofabrik `greater-london-latest.osm.pbf` | context OSM | document | bake source extract |

## 7 — DEAD ENDS

- OS Building Heights / OS MasterMap — commercial; not the free path (do not re-attempt as keyless).

## 8 — THE SMALLEST NEXT STEP

Live-probe the EA DSM 1 m GetCoverage for the London bbox (2 dev-hours). If it returns a GeoTIFF keyless, the
height derive is pure engineering and HEIGHTS becomes achievable; if it 401s, heights stay the honest 9 m carpet.
