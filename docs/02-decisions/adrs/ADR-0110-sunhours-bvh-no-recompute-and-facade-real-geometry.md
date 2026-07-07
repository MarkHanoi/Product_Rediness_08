# ADR-0110 — Forma sun-hours: BVH-accelerated raycast, no-recompute caching, and the path to real-geometry façade analysis

- Status: Accepted (L-143 shipped) / Proposed (L-144 worker + real-geometry — next slice)
- Date: 2026-07-07
- Scope: `packages/solar-analysis/*` (new pure `occluderIndex`), `apps/editor/src/ui/climate/siteMetricGrids.ts`
  (sun-hours + façade raycast engine), `apps/editor/src/ui/geospatial/CesiumViewport.ts`
  (heatmap/façade render + trigger + cache wiring). Cesium/render stack stays THREE-free (P2);
  single rAF preserved via `@pryzm/frame-scheduler` (P3); `@pryzm/solar-analysis` stays pure
  + byte-deterministic (ADR-0074).
- Supersedes nothing; extends ADR-0074 (GPU solar sun-hours) and ADR-0109 (Forma sun-hours perf).
- Maps to: C21-CLIMATE-INGESTION (analysis substrate), ADR-0074 (deterministic sun-hours),
  A.24 render tiers (Massing = fast preview / Presentation = real BIM).

## Context — the two founder-reported defects

**L-143 (PERFORMANCE).** Sun-hours on the 3D-site view took ~1 minute, and the founder
suspected camera navigation re-ran the whole compute. Log evidence:
`[site-metric] §perf cell-cap: 14400 cells would exceed 5000; clamping 4.0→6.8m` →
`sunHours heatmap 512×512 from 1621/1621 cell(s), radius 240m (chunked)`. Cost = 1621
cells × sun-samples × a raycast against a LARGE occluder set (~4755 OSM context buildings +
context roads + the massing).

**L-144 (FIDELITY).** The façade study builds a 4-face massing PRISM
(`§FORMA-FACADE-FOOTPRINT-FIX` footprint → `§FORMA-FULL-HEIGHT` extrusion →
`§FORMA-FACADE-SMOOTH` painted onto 4 wall faces + roof) and paints the heatmap on THAT,
while the REAL full-fidelity model is already placed (`§forma6 REAL … model placed`, 192
real walls, 228 openings). So the analytic surface ≠ the visible building.

## Confirmed root cause of the navigation-recompute question (L-143 #1)

Traced the compute → render → trigger paths end-to-end:

- The ground sun-hours heatmap **already has a texture cache**
  (`§CESIUM-PERF-METRIC-TEXTURE-CACHE`, `CesiumViewport.renderSiteMetricOverlay`), keyed by
  `(metric · origin · sun-day · radius)`. `origin` = `overlayOrigin()` (massing origin or
  site location) and `radius` = `siteMetricRadiusM()` are BOTH camera-independent
  (`§SITE-METRIC-RADIUS-DECOUPLE`, ADR-0079). So an ordinary orbit/zoom that re-invokes
  `renderSiteMetricOverlay` **hits the cache and only repaints** — it does NOT re-run the
  raycast. The camera `moveEnd` listener (`CesiumViewport.ts` ~L1231) calls
  `maybeRefreshContextOnPan`, which only refetches context (and repaints) on a **>1.1 km
  pan below 6 km** — and even then the ground cache short-circuits.
- **The gap was the FAÇADE study**: `renderFacadeAnalysis` had **NO cache**. It is invoked
  from `refreshActiveClimateOverlays` (called by **every** `renderFormaMassing`, including
  the terrain-settle re-clamp re-places at `commitPhotorealBase`), so any massing re-render
  re-ran the heaviest per-point raycast from scratch — the most likely source of a
  "navigate → another minute" recompute.
- Secondary correctness gap: the ground cache key was **blind to the occluder geometry**
  (origin-only), so a genuine context refetch on a big pan served a STALE texture.

## Decision (L-143 — shipped)

1. **Kill navigation-triggered recompute — geometry-keyed caching, both tiers.**
   - Ground: fold a cheap **occluder geometry signature** (`siteMetricGeometrySig` = context
     feature-count + fetch location + massing area) into `siteMetricCacheKey`. A camera move
     changes none of `(geometry · sun-day · date/location · radius)`, so it can only ever
     REPAINT the cached texture; the field recomputes **iff** the occluder set genuinely
     changes (a real context refetch / re-place). This also fixes the stale-serve bug.
   - Façade: memoise the last painted study by `facadeAnalysisKey` (origin · designed-building
     geometry identity · storey height · occluder-sig · sun-day). `renderFacadeAnalysis`
     early-returns when the key is unchanged AND the entities are still on screen — a massing
     re-render that doesn't change the façade is now a no-op. Reset on `clearFacadeAnalysis`.

2. **Spatial-index the occluders (BVH-style).** New PURE, THREE-free
   `@pryzm/solar-analysis/occluderIndex` — a uniform grid over occluder ground bboxes.
   `sunBlockedIndexed` queries only the occluders whose bbox the shadow ray could cross
   (bounded by the height/slope crossing where the ray clears the tallest roof) instead of
   looping all ~4755. **Determinism preserved byte-for-byte**: the index returns a proven
   SUPERSET of the crossed boxes (halo-indexed + ≤half-cell ray sampling — proof in
   `buildOccluderIndex`), and the SAME `rayBlockedByPrism` runs on each candidate and is
   OR-ed, so the occlusion answer is identical to the naive loop. Built once per grid, reused
   across all cells/sun-samples. Tests: index superset/determinism/pruning
   (`occluderIndex.test.ts`) + module-level naive-vs-indexed equivalence over a dense city on
   all three analysis days (`siteMetricGrids.test.ts` `§PERF-SUNHOURS-BVH`).

   Reasoned perf delta: the inner loop drops from O(occluders) ≈ 4755 to O(occluders-near-ray)
   ≈ a handful per ray — roughly two orders of magnitude on the dominant term — which also
   makes the existing per-frame chunked build smooth without a worker.

3. **P2/P3/P8.** `occluderIndex` is pure (no THREE/DOM/RNG/Date). The site-metric path stays
   THREE-free — the repo's `spatial-index/SpatialGrid` imports THREE, so it was NOT reused;
   a pure uniform grid was written instead. No new rAF (chunking still routes through
   `@pryzm/frame-scheduler`). New exported functions carry `[span]` breadcrumbs in the
   transitional `ui/climate` zone (matching the existing convention there); the pure package
   stays console-free to preserve its no-I/O purity.

## Deferred — next slice (Proposed)

4. **Off-main-thread worker (L-143 #2).** With the BVH win the chunked main-thread build is
   already smooth, so a worker is a follow-on, not a blocker. Design: mirror
   `apps/editor/src/workers/geometry.worker.ts` (self-contained, typed-array transferables,
   P2/P3-safe). Serialize `{ prisms bboxes+heights, sun samples, cells/points }` → worker
   builds the `occluderIndex` and evaluates intensities → transfers back a `Float32Array`
   field; cancellable by a monotonic request id (a new request / geometry change cancels the
   in-flight one). The pure `occluderIndex` + `evaluateIntensity` are already worker-ready
   (no THREE, no DOM).

5. **Adaptive resolution (L-143 #4).** Keep the current cell-cap/clamp; add a coarse
   fast-pass → refine pass (halve the cell / densify sun-samples only where the coarse field
   has high gradient). Deterministic by construction (fixed refinement predicate).

6. **Real-geometry façade analysis (L-144).** Replace the 4-face massing prism as the
   ANALYSIS surface with the already-placed real wall faces WITH window openings (the
   `§forma6` real meshes / GLB), mapping the lattice/heatmap onto the real faces. Keep the
   prism as the Massing fast-preview / fallback tier per A.24 (Massing = fast, Presentation =
   real), but the RESULT the founder sees renders on real geometry. This DEPENDS on the
   worker (#4) so the heavier real-face lattice stays ≤ the current ~1 min (ideally much
   less). The `occluderIndex` + deterministic `evaluateIntensity` carry over unchanged — only
   the sample-surface source (real faces vs prism faces) and the paint target change.

## Consequences

- Camera navigation on the 3D-site view no longer re-runs the sun-hours or façade raycast;
  it repaints cached results. A real input change (re-place / re-locate / new sun-day / new
  context) recomputes, now ~100× cheaper per ray via the index.
- `@pryzm/solar-analysis` gains one pure, tested, reusable acceleration primitive; its
  determinism guarantee is unchanged (the index only prunes provably-non-crossing occluders).
- L-144's fidelity fix is unblocked but intentionally staged behind the worker to hold the
  perf bar.
