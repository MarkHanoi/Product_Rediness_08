# ADR-0079 — Site-metric analysis disc is an INDEPENDENT extent, decoupled from camera/overlay framing (§SITE-METRIC-RADIUS-DECOUPLE)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-06-30 |
| Tag | §SITE-METRIC-RADIUS-DECOUPLE · §SITE-METRIC-FINER · §SITE-METRIC-CLIMATE-FALLBACK · §SITE-METRIC-OVERPASS-PARALLEL |
| Owner | Analytics / Geospatial (Agent 5) |
| Closes | Founder: "analysis disc too small (115 m)", "cells not smaller", "temperature + wind render nothing (0/0 cells)", "context buildings slow" |
| Extends | [ADR-0074](./ADR-0074-gpu-solar-sun-hours-environmental-analysis.md) (solar/env analysis), §SITE-METRIC-HEATMAP, §SITE-METRIC-HEATMAP-LARGER, C21 (Climate ingestion) |
| Constraint reference | C21-CLIMATE-INGESTION §1.2/§7.4 (bundled-defaults guarantee), C04 (scheduling — chunked builds), C01 P2 (no THREE outside renderer-three) |

---

## Context

The Forma-style "Site analysis" panel paints switchable ground heatmaps (sun hours,
temperature, wind comfort, population density) onto the Cesium globe around the
massing. Live prod evidence (Paris, LAT 48.8626 LON 2.3137) showed four defects:

1. **Disc too small.** `siteMetricRadiusM()` returned `overlayRadiusM() * 2`, where
   `overlayRadiusM()` is derived from the *massing-area framing* used to size the
   sun-path / wind-rose overlays. The analysis extent therefore tracked the view
   framing rather than being an independent coverage value — ~115 m in prod.
2. **Cells too coarse.** Target cell edges were 5 m (sun) / 3.5 m (climate, pop); a
   prior "finer cells" change hadn't reduced them enough to read as a field.
3. **Temperature + Wind painted 0/0 cells.** `buildSiteMetricGrid` returned `[]` for
   temperature/wind whenever `input.dataset` was null — and the dataset is supplied
   asynchronously by the `ClimateStore` ingest, which lags first paint (and never
   lands if the live Open-Meteo/PVGIS fetch is throttled/blocked).
4. **Context buildings slow.** `fetchForBbox` tried the Overpass mirrors **serially**
   at a 20 s per-mirror timeout, so a dead/slow mirror chain cost ~60–80 s before a
   working mirror was reached. One mirror (`overpass.osm.jp`) has an invalid TLS cert
   (`ERR_CERT_COMMON_NAME_INVALID`) and could never succeed.

## Decision

1. **Decouple the analysis radius.** `siteMetricRadiusM()` now defaults to a fixed
   `DEFAULT_SITE_METRIC_RADIUS_M = 240 m` (≥ 2× the old ~115 m default), floored at
   the massing-derived extent so a very large plot still gets full coverage, and
   still clamped to the OSM context bbox so cells never spill into a no-context zone.
   A public `setSiteMetricRadiusOverride(radiusM)` lets a future "analysis radius"
   slider drive it directly (idempotent + repaints).
2. **Finer cells.** Default target cell edge HALVED (sun 5→2.5 m, climate/pop
   3.5→1.8 m), with the per-metric `maxCells` caps raised (sun 2600→9000;
   climate/pop 6000→24000). The pure builder's `resolveCellSize` still clamps the
   cell size UP if a cap would be exceeded and **logs once** when it does — finer
   cells are never silently truncated.
   > **SUPERSEDED by [ADR-0084](./0084-site-metric-per-metric-cost-tier-resolution.md)
   > (§SITE-METRIC-COST-TIER, 2026-06-30).** The uniform finer grid here drowned the
   > EXPENSIVE per-cell raycast metrics (sun-hours, daylight VSC) in cell count on the
   > 240 m disc — sun-hours never visibly completed. Cell resolution is now decoupled
   > per **cost tier**: expensive raycast metrics get a coarser cell + a lower cap
   > (~5 m / 3500) so they paint in seconds; cheap O(1) field metrics keep a fine
   > grid with a bounded entity count (~2.4 m / 12000). The clamp-up-and-log behaviour
   > described here is retained.
3. **Climate fallback for temperature + wind.** `buildSiteMetricGrid` now resolves a
   dataset via an internal `resolveGridDataset`: it prefers the live `input.dataset`
   and otherwise **synthesises the OFFLINE bundled regional normals** from the site
   lat/lon (`buildFallbackClimateDataset`, the same `fallback-defaults` dataset
   `ensureSiteClimate` Stage 1 ingests, per C21 §7.4). The CesiumViewport passes
   lat/lon into the temperature/wind build so the field paints **instantly**, offline,
   regardless of the async store. A live dataset still takes precedence when present.
4. **Parallel Overpass race + cache.** `fetchForBbox` now races all mirrors with
   `Promise.any` (fastest live mirror wins), at a 9 s (was 20 s) per-mirror timeout,
   with the dead `overpass.osm.jp` mirror removed (CSP + endpoint list). An in-flight
   per-bbox promise cache dedupes concurrent requests; the existing in-memory + 7-day
   localStorage per-bbox caches already prevent re-fetch on re-entry. All failures
   stay non-fatal (empty collection → render without context).

## Consequences

- The heatmap covers a real neighbourhood (≥ 240 m disc, ~480 m wide) at a finer
  resolution; sun/population cell counts scale up accordingly (capped + logged).
- Temperature + Wind always render a real field the moment a location exists.
- Context buildings resolve in seconds (fastest mirror) instead of a minute-plus
  serial cascade, with no behavioural regression on total failure.
- `DEFAULT_SITE_METRIC_RADIUS_M` is the single knob for the default extent; the
  override hook is the seam for a UI slider (not yet wired — non-blocking follow-up).

## Alternatives considered

- *Keep radius tied to overlay framing.* Rejected — the analysis extent is a domain
  value, not a function of how the camera is framed.
- *Block first paint on the async climate ingest.* Rejected — the bundled-normals
  path (C21 §7.4) makes a real dataset available synchronously; blocking risks the
  "stuck loading" failure mode that motivated §SITE-METRIC-CLIMATE-INSTANT.

## Follow-ups (non-blocking)

- Wire `setSiteMetricRadiusOverride` to an analysis-radius slider in the panel.
- Population density: the OSM footprint × floors GFA proxy is documented in-panel
  (tooltip + legend caption). A real source (e.g. a static WorldPop/GHS-POP raster
  tile keyed by bbox) is a future upgrade behind the same `MetricGridCell` interface.
