# ADR-0109 — Forma 3D-site view: all-storeys massing, façade footprint, instant sun-hours/daylight, filled context, reliable zoom

> Renumbered from ADR-0094 (2026-07-02): the number collided with the canonical
> ADR-0094 (large-scene render perf, committed as `03b3746d`). This is the newer,
> distinct decision → moved to the next free number (0108; 0098–0107 taken, 0106 reserved).

- Status: Accepted
- Date: 2026-07-01
- Scope: `apps/editor/src/ui/geospatial/*` + `apps/editor/src/ui/climate/siteMetricGrids.ts`
  (Cesium "Forma" 3D-site view + metric grids). No engine / generator / ProjectLoader
  changes; Cesium render stack stays THREE-free (P2).

## Context

A live-log audit of the Forma 3D-site view surfaced a cluster of defects, all confirmed
in production console output:

1. **Façade analysis broken** — `[forma-facade] no building footprint — skipping façade
   analysis` even though the designed building was placed. The façade study read ONLY
   `formaLastMassingInput.boundary` (the drawn parcel outline); a generated / from-scratch
   building has no drawn boundary, so the study bailed in both Real and Massing modes.
2. **Massing collapsed to one storey** — `massing rendered: 880 wall(s) across 1 storey(s)
   [#0@0.0m·4.0m]` for a 40-storey office. The multi-storey generators author every wall
   with `baseLine[0].y = 0` and carry the storey elevation on the LEVEL
   (`AddLevelCommand({ levelId, elevation })`); `getFormaWalls` resolved
   `baseElevation = y + baseOffset = 0` for all walls, so every storey grouped into ONE
   band at 0 m.
3. **Building floats / mis-clamps on the photoreal globe** in dense cities (Dubai).
4. **Sun-hours took seconds** — the ~4 m / 5000-cell raycast grid tripped the
   `§perf cell-cap` clamp and chunked across frames.
5. **Context pan-refresh storm** — `§A.21.D-GLOBE pan-refresh` fired on nearly every
   camera move → Overpass 429/504 storm + jank + per-`moveEnd` console spam.
6. **Context quality** — roads drew as thin dark centre-lines OVER/THROUGH the buildings;
   parks/green were entirely missing (a Central-Park-adjacent site rendered blank grey).
7. **Load perf** — the 20 MB GLB must not re-export when geometry is unchanged.
8. **Daylight (VSC) never drew** — the only metric that never logged; it bailed early
   when the OSM context prisms were unavailable.
9. **Zoom-to-Site unreliable** on the globe — the model is placed but the camera frames
   before the tiles/clamp settle, so it looks at empty tiles.

## Decision

Fixes, all confined to the geospatial/Forma/siteMetricGrids files:

- **§FORMA-MASSING-ALL-STOREYS** — before storey-band grouping, resolve each wall's base
  elevation from the authoritative BIM level store (`window.bimManager.getLevels()`, metres)
  when the wall carries none of its own. Walls with a non-zero `baseElevation` (house /
  apartment path) are untouched. A 40-storey office now stacks 40 bands at their true
  elevations.
- **§FORMA-FACADE-FOOTPRINT-FIX** — the façade study resolves its footprint via the SAME
  cascade the massing render uses: drawn boundary → reconstructed ground-storey perimeter
  ring → ground-storey floor-slab ring. It works whenever the building renders.
- **§FORMA-SUNHOURS-INSTANT** — drop the expensive-metric compute budget to a coarse
  ~14 m / ≤1600-cell lattice (well under the 5000 cap → the clamp never fires), evaluated
  in ONE synchronous pass. The 512² bilinear texture keeps it smooth. Same for daylight.
- **§SITE-METRIC-DAYLIGHT-DRAWS** — daylight ALWAYS computes + paints + logs, degrading to
  a smooth open-sky VSC field (`buildOpenSkyDaylightGrid`) when no context prisms exist —
  never bailing early on missing context.
- **§FORMA-CTX-PAN-THROTTLE** — remove the per-`moveEnd` console spam; raise the pan move
  threshold (1400 m) and settle debounce (1.1 s); skip refetch when all Overpass mirrors
  are cooling down; refetch NOT-forced so the per-bbox cache serves revisited areas.
- **§FORMA-CONTEXT-FILLED** — roads render as ground-clamped buffered grey RIBBONS (width
  from the OSM highway class) seated on the ground plane so buildings occlude them (no more
  centre-lines slicing through faces); parks/green become a first-class layer
  (`contextGreen.ts`) with its OWN cache (memory + 7-day localStorage) + 429 back-off,
  drawn as soft-green polygons under the buildings — independent of the roads/buildings
  rate-limit so a big park always shows and persists across pans. Context-building heights
  already use OSM `height`/`building:levels` tags.
- **§FORMA-TERRAIN-CLAMP / §FORMA-ZOOM-TO-SITE-RELIABLE** — `zoomToPlacedBuildingReliably()`
  frames immediately, re-samples the tile/terrain height, re-seats the placed model on the
  settled surface (cheap matrix update, no GLB reload), then re-frames once the base has
  settled — so an explicit Zoom-to-Site reliably lands on the visible building.

## Consequences

- Sun-hours + daylight paint in ~1 frame; the `§perf cell-cap` clamp no longer fires for
  them. Visual quality is preserved by the existing 512² bilinear texture + colour ramps.
- The Overpass mirrors are hit far less often; parks survive the roads/buildings 429s.
- Preserves §FORMA-WHITE-MATERIAL, §FORMA-CLICK-NO-NAV, §FORMA-GRAZING-BANDING-FIX and the
  sun-hours colour ramp. No new THREE import (P2). Root `tsc --skipLibCheck` = 0 errors;
  `siteMetricGrids` tests (43) pass.
