# Climate GIS Overlay — Phased Plan (2026-06-18)

**Tag:** `§CLIMATE-GIS-PHASE1`
**Status:** Phase 1 SHIPPED. Phases 2–4 = roadmap.
**Owner context:** founder feedback — the old Environment overlay was "terrible — a
colour tint depending on how I move the slider". The goal is REAL geospatial data
for **HEAT, WIND, SUN (already real), POPULATION DENSITY**, rendered like real GIS
heatmaps.

This plan governs the replacement of the crude slider-driven climate tint with a
real, data-driven, GPU raster heatmap pipeline that fits PRYZM's architecture.

---

## 0. Architecture guardrails (do not break)

| Principle | Constraint for this feature |
|-----------|-----------------------------|
| **P2 — single THREE owner** | `import * as THREE` only in `packages/renderer-three`. The HUD / data services (`apps/editor/src/ui/environment/*`) import NO THREE. Any 3D raster layer is built INSIDE renderer-three (or as a Cesium imagery layer owned by the Cesium viewport), never in the overlay/UI code. |
| **P3 — single rAF** | `requestAnimationFrame` only in the frame scheduler (`runtime-composer`). Heatmap animation/streaming subscribes to the frame bus. |
| **Cesium camera ownership** | `apps/editor/src/ui/geospatial/CesiumViewport.ts` is owned by the camera agent. A Cesium imagery overlay must be ADDED as a new module that the viewport mounts — not by editing the viewport's camera code. |
| **Brand** | white + `#6600FF`, no pure black. |

Two valid rendering homes for a real raster heatmap:

1. **Cesium imagery layer** (GIS / globe view) — a `Cesium.ImageryProvider`
   (e.g. a tile/PMTiles/COG provider) added to the globe's imagery layer
   collection. This is the natural home for georeferenced rasters (WorldPop, LST,
   wind atlas) because Cesium already owns the ellipsoid + reprojection.
2. **renderer-three textured ground plane** (authoring / plan view) — a
   georeferenced raster sampled into a texture on a ground quad in the LTP-ENU
   frame, built inside `packages/renderer-three` with a colour-ramp shader. This
   is the home for the local building-plate-scale overlay aligned to the model.

---

## 1. What we ALREADY have (reuse — don't reinvent)

| Capability | Where | Real? |
|-----------|-------|-------|
| **Sun position (NOAA)** | `packages/core-app-model/.../RealSunService.ts` (THREE) + `packages/solar-analysis/src/solarPosition.ts` (THREE-free replica) | ✅ real |
| **Per-surface sun-hours heatmap** | `pryzmComputeSunHours()` → `@pryzm/renderer-three` GPU pass + `@pryzm/solar-analysis` (`§DIAG-SUN-HOURS`) | ✅ real (needs built model) |
| **Per-room daylight score** | `pryzmComputeDaylight()` → `@pryzm/ai-host` (`§DIAG-DAYLIGHT`) | ✅ real |
| **Daylight hours (sunrise→sunset)** | `climateData.estimateSunHours()` (Phase 1, samples `computeSolarPositionRad`) | ✅ real |
| **Per-room solar heat gain** | `@pryzm/solar-analysis` `accumulateRoomHeatGain` (C21 §10.10) | ✅ real (model-driven) |
| **Site lat/lon + LTP-ENU origin** | `getCurrentSiteOrigin()` (`ui/site/siteDispatch`), `runtime.siteModelStore`, C19 SiteModel | ✅ real |
| **Geospatial projection (proj4 + ENU)** | `@pryzm/geospatial` `GeospatialAdapter` | ✅ real |
| **Cesium globe + imagery** | `apps/editor/src/ui/geospatial/CesiumViewport.ts` | ✅ (camera-owned) |
| **Climate ingestion contract** | `docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md` | contract exists |

What we DON'T have yet (need to ingest):

- **Heat raster** — land-surface temperature / climate-normal temperature grid.
- **Wind raster** — gridded wind speed/direction (resource-scale).
- **Population raster** — gridded population density.
- A **raster ingestion + tiling pipeline** (COG/PMTiles → browser tiles).
- A **colour-ramp raster overlay layer** in renderer-three / Cesium.

---

## 2. Real data sources (founder's brief, mapped to formats)

| Layer | Primary source | Resolution | Format | Notes |
|-------|----------------|-----------|--------|-------|
| **Point heat + wind (NOW)** | **Open-Meteo** `/v1/forecast` (`temperature_2m`, `wind_speed_10m`, `wind_direction_10m`) | point @ lat/lon | JSON (CORS, no key) | Used in Phase 1. Hourly point values for the site. |
| **Heat raster** | Copernicus / **MODIS LST** (land-surface temp); **WorldClim** (climate normals) | ~1 km (LST) / ~1 km (WorldClim) | **COG GeoTIFF** | LST = observed surface temp; WorldClim = long-run normals. |
| **Wind raster** | **Global Wind Atlas** (GWA) / **ERA5** reanalysis | ~250 m (GWA) / ~31 km (ERA5) | COG GeoTIFF / NetCDF→COG | GWA for resource-grade local wind; ERA5 for time series. |
| **Population raster** | **WorldPop 100 m** / **GHSL** (Global Human Settlement Layer) | 100 m (WorldPop) / 100 m–1 km (GHSL) | COG GeoTIFF | WorldPop = persons/100 m; GHSL = built-up + pop grids. |
| **Tiled delivery** | derived | — | **PMTiles** (single-file pyramid) or XYZ/WMTS tiles + **COG** range reads | PMTiles = cheap static hosting; COG = on-the-fly windowed reads. |

**Why COG + PMTiles:** Cloud-Optimized GeoTIFF supports HTTP range reads (fetch
only the tiles in view); PMTiles packs a whole tile pyramid in one file served
from static storage / a CDN — both fit a browser-first, server-light pipeline.

---

## 3. Browser rendering path (fits PRYZM architecture)

```
data source (COG / PMTiles, georeferenced)
        │  HTTP range read / tile fetch (apps/editor data service, no THREE)
        ▼
decode tile → typed-array of values (temperature / wind / pop)        [L5 service]
        │
        ├──► GIS / globe view:  Cesium imagery layer (ImageryProvider)
        │       colour-ramp applied in the provider / a small fragment hook
        │       ── added by a NEW module the CesiumViewport mounts ──
        │
        └──► authoring / plan view:  renderer-three ground-plane raster layer
                value texture + colour-ramp shader on an LTP-ENU quad           [L1 renderer-three]
                streaming + LOD subscribe to the frame bus (P3)
        ▼
colour ramp (per layer): heat = blue→red, wind = calm→gale, pop = light→dark
legend + opacity control in the Environment panel (DOM, P2-safe)
```

Key seams:

- **Data services are THREE-free** and live in `apps/editor/src/ui/environment/`
  (or a future `@pryzm/climate-raster` L2 package). They fetch + decode rasters
  into plain typed arrays.
- **Pixels → GPU** happens ONLY inside renderer-three (texture upload + ramp
  shader) or inside the Cesium imagery provider. The UI never touches THREE.
- **Colour ramps** are data-defined (domain min/max + stops) and shared between
  the legend (DOM) and the shader so the legend never lies.
- **Reprojection**: rasters are WGS84/UTM; the renderer-three plane samples them
  through the existing `GeospatialAdapter` (ENU↔lat/lon) so the overlay aligns
  with the model frame.

---

## 4. Phases

### ✅ Phase 1 — Real point data + honest HUD (THIS TASK — DONE)

- New `apps/editor/src/ui/environment/climateData.ts`:
  - Fetches REAL `temperature_2m`, `wind_speed_10m`, `wind_direction_10m` from
    **Open-Meteo** for the site lat/lon (`getCurrentSiteOrigin()`); caches by
    rounded lat/lon (~1 km); degrades to a clearly-labelled `demo` snapshot
    offline / when no site is pinned.
  - `estimateSunHours()` — REAL daylight hours via `@pryzm/solar-analysis`
    (`computeSolarPositionRad` sampled across the day). THREE-free.
- `EnvironmentHud.ts` rewritten:
  - REMOVES the meaningless full-viewport slider tint.
  - Shows REAL readouts: `🌡 N °C [REAL]`, `🧭 Wind N km/h NW [REAL]`,
    `☀ N sun-hrs [REAL]`, `👥 N /ha [MODEL]`, plus a small **heat colour-ramp
    legend**.
  - Sliders now **MODULATE** the real baseline (e.g. "+3 °C scenario",
    "+5 km/h") instead of BEING the value.
  - Refreshes on `site.location-changed`.
- Wiring unchanged: `installEnvironmentHud()` at the existing initUI.ts site.
- P2/P3 held (no THREE, no rAF). Editor typecheck clean.

### Phase 2 — One real raster layer end-to-end (population, Cesium)

- Pick **population** first (WorldPop 100 m / GHSL) — static, no time axis,
  clearest "GIS heatmap" payoff.
- Build a NEW Cesium imagery module (mounted by CesiumViewport, not edited into
  its camera code) that reads a PMTiles/COG population tile set and applies a
  light→dark ramp with opacity + legend control in the Environment panel.
- Add a THREE-free `@pryzm/climate-raster` data service (tile fetch/decode).
- Acceptance: a real population heatmap on the globe over the pinned plot, with a
  legend whose ramp matches the pixels.

### Phase 3 — Heat + wind rasters + authoring-view overlay

- Ingest MODIS LST / WorldClim (heat) + Global Wind Atlas / ERA5 (wind) as
  COG/PMTiles.
- Add the **renderer-three ground-plane raster layer** (value texture + ramp
  shader, LOD/streaming on the frame bus) for the authoring/plan view, aligned to
  the model via `GeospatialAdapter`.
- Wind gets a vector overlay (barbs/streamlines) in addition to the speed ramp.
- Slider scenarios from Phase 1 become deltas applied to the raster ramp domain.

### Phase 4 — Ingestion service, caching, contracts, analysis hooks

- Server/worker ingestion: fetch source rasters, reproject, tile to COG/PMTiles,
  cache by bbox; expose a tile API. Govern under **C21-CLIMATE-INGESTION** (+ any
  C19 site-context additions); add provenance metadata.
- Feed the real rasters into the existing analysis engines (sun-hours, daylight,
  room heat gain) so design feedback uses observed climate, not defaults.
- Privacy tier for population (aggregate-only; no PII-grade precision).

---

## 5. Acceptance for "not a slider tint anymore"

- Every readout/overlay is sourced from data tagged REAL vs DEMO/MODEL.
- Sliders modulate a real baseline; they never invent the baseline.
- Heatmap pixels and the legend ramp are driven by the same colour ramp.
- No THREE outside renderer-three; no rAF outside the frame scheduler; the Cesium
  camera module is untouched.

---

## 6. Files (Phase 1)

- `apps/editor/src/ui/environment/climateData.ts` — NEW real-data service.
- `apps/editor/src/ui/environment/EnvironmentHud.ts` — rewritten (real readouts +
  legend, slider = scenario modulation, tint removed).
- `apps/editor/src/engine/initUI.ts` — unchanged (already calls
  `installEnvironmentHud()`).
- `docs/03_PRYZM3/CLIMATE-GIS-OVERLAY-PLAN-2026-06-18.md` — this plan.
