# SPEC — 3D analytics fixes + climate overlays (code-grounded, 2026-06-17)

Status: **implementation-ready brief**. Each item below has a VERIFIED root cause (file:line) and a
bounded fix. Ordered by leverage (smallest/highest-visibility first). All three editor items need an
in-browser confirm (they reshape what the Cesium/Three views render); the engine-side bits are unit-testable.

Origin: founder field-test of the Forma/globe analytics (Almería 37.34/-2.13) + competitor scan
(Hektar, ThatOpen, Henning Larsen, Spacio). KEY correction to the field analysis: the wind/heat overlays
are **NOT stubs** — the geometry + wiring are complete; they are **data-starved**.

---

## FIX 1 — §CLIMATE-OVERLAY-DATA-WIRING (wind + heat go live) — SMALLEST, HIGHEST VISIBILITY

**Symptom:** "NO DATASET" badge; 🌬 Wind + 🌡 Heat toggles produce no visual; ☀ Sun-path works.

**Verified root (NOT a stub):**
- The overlay geometry is real: `climateOverlayGeometry.ts` → `windStreakSegments()`, `windStreamlinePaths()` (A.21.D35 streamlines), `heatTintColorHex()`, `heatFieldCells()`.
- The render path is real + gated: `CesiumViewport.setWindOverlay`→`renderWindOverlay()` (`:3479`) and `setHeatOverlay`→`renderHeatOverlay()` (`:3562`) BOTH early-return on `this.climateOverlayDataset == null` (`:3482`/`:3565`).
- The dataset is pushed by `FormaSiteAnalysisControls.syncOverlayDataset()` (`:736`) → `setClimateOverlayDataset(this.resolveDataset())`.
- **The hole:** `resolveDataset()` (`FormaSiteAnalysisControls.ts:815-825`) returns `null` whenever `runtime.siteModelStore.getSite()` is `null`. `climateStore.resolveSite(siteId)` (`ClimateStore.ts:78`) resolves a dataset **only by `SiteId`** (keyed at `:172` via `dataset.siteRef`). When the user has a LOCATION/boundary but no **Site aggregate** has been created, `getSite()` is null → `resolveDataset()` null → `setClimateOverlayDataset(null)` → overlays starve. `ensureSiteClimate` (offline bundled normals, covers ANY lat/lon) cannot help if no Site is keyed.

**Fix (bounded):**
1. In `resolveDataset()`, when `getSite()` is null, call `ensureSite(runtime)` (from `siteDispatch.ts`) to materialise a Site for the current location, then `climateStore.resolveSite(site.id)`. (Or have `ensureSiteClimate` always create the Site — `siteDispatch.ensureSite` already exists.)
2. **Guarantee a usable dataset for ANY coordinate:** `ensureSiteClimate` is documented to produce bundled climate-zone normals for any lat/lon (`fallback-defaults` tier) — confirm the L3 `climateEnsureForLocation` actually ingests for the resolved SiteId so `resolveSite` returns it; if the live Open-Meteo/PVGIS fetch fails (Almería), the offline tier must still ingest (never leave the store empty).
3. **Graceful badge:** when the dataset tier is `fallback-defaults`, render the overlays anyway (they're plausible) with an "estimated" tag instead of "NO DATASET".

**Acceptance:** toggling 🌬 Wind / 🌡 Heat on a freshly-located Forma view (any country) shows streaks/tint immediately; the wind rose + 3D streaks read from the same dataset.

---

## FIX 2 — §FORMA-MATERIAL-LIT (building stops rendering black) — SMALL, DEMO-BLOCKING

**Symptom:** in Forma mode the real GLB model renders near-black; console warns ×22 "Use MeshStandardMaterial for best results".

**Verified-plausible root:** `setFormaMode(true)` applies a Cesium directional key light + soft shadows, but the exported GLB carries the editor's **TSL / NodeMaterials**, which Cesium's glTF lighting model (PBR metallic-roughness) doesn't interpret → unlit → black under the directional-only Forma rig.

**Fix:** in the GLB export path that feeds Forma (`renderRealModelOnForma`, `CesiumViewport.ts:3927`) or in `exportFragmentsToGLB`, ensure exported primitives carry a standard `pbrMetallicRoughness` material (baseColor from the element colour, metallic 0, roughness ~0.8). Cheapest: a post-export material-normalisation pass on the GLB, or set Cesium `Model` `lightColor`/`imageBasedLighting` + an ambient term so unlit materials read mid-tone. Keep PRYZM brand (no pure black).

**Acceptance:** the Forma real model reads as a lit white/coloured massing (matching the Hektar/Forma aesthetic), not black.

---

## FIX 3 — §GPU-SOLAR-ALL-VIEWS (the headline parity win — ThatOpen/Forma)

**Today:** `computeSunHoursOnModel(scene, levelId)` (CPU three-mesh-bvh) paints the heatmap on the **editor** BIM scene; panel via Data Workbench → Physics → "☀ Sun Hours" (`PhysicsPanel.ts:199`) / `pryzmOpenSolarPanel()`. **Gaps:** (a) no sun-hours heatmap in Forma or Globe views; (b) the GPU shadow-map occlusion oracle (ADR-0074 P2) is deferred.

**Fix (phased):**
- 3a. Run the existing CPU pass against the **Forma** massing surfaces + the **globe** GLB (same oracle), painting the same vertex heatmap; add an animated shadow sweep driven by `setFormaSunTime()` (6am→7pm loop).
- 3b. ADR-0074 P2: replace the CPU raycast oracle with a GPU shadow-map depth compare for the 1.4M-tri perf class.
- 3c. Surface a top-level "☀ Analysis" toolbar button (today it's buried in the Data Workbench/Physics panel).

**Acceptance:** sun-hours heatmap + animated shadow available in all three views from a top-level control.

---

## Smaller follow-ups (verified)
- **§HEAT-GAIN-WIRE:** `accumulateRoomHeatGain()` (`packages/solar-analysis/src/roomHeatGain.ts`) is DEFINED but unwired — connect the per-surface irradiance (W/m², EPW) injection + a console/UI entry for the absolute-kWh tier.
- **§OVERPASS-RELIABILITY:** all 4 keyless Overpass mirrors 429/timeout on pan-refresh (`contextBuildings.ts`). Add backoff + a longer localStorage TTL + a "context unavailable" quiet degrade (don't blank existing context on a failed pan).

## Market gap (genuine differentiators, larger)
UTCI (published formula — inputs air temp, mean-radiant from sun position, wind speed, humidity, all in `climateStore`), pedestrian wind comfort (Lawson criteria from the wind rose — deterministic, no CFD), and future-climate (CMIP6 2050/2080 deltas). These separate PRYZM from Hektar/Forma and approach Henning Larsen.
