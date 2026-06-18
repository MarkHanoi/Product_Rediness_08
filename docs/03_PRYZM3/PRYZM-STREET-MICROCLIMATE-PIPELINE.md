# PRYZM — Street-Level Microclimate Pipeline (implementation plan)

**Date:** 2026-06-18 · **Aesthetic target:** Henning Larsen microclimate suite
**Goal:** a TRUE ground-plane overlay of **HEAT · WIND · POPULATION DENSITY** (+ UTCI, Shade) across
**all 3 views** — BIM 3D, 3D globe (Google 3D tiles), and Forma — computed **deterministically
in-browser** (no CFD server).

This supersedes the per-overlay sketch in `SPEC-3D-ANALYTICS-FIXES-AND-OVERLAYS.md` /
`PRYZM-CLIMATE-OVERLAYS-BUILD-ORDER.md` with a single shared **grid** abstraction every layer
renders through.

---

## 0. Review / analysis vs the current codebase (what's real, what's new)

**Already shipped — reuse, do NOT duplicate:**
- **Climate data**: `ClimateStore` (wind rose, monthly normals, design temps, degree-days), keyed by
  `SiteId`; `ensureSiteClimate` (offline-first, any lat/lon, `fallback-defaults` tier). The
  in-flight **FIX 1 §CLIMATE-OVERLAY-DATA-WIRING** makes `resolveDataset()` robust so overlays always
  get a dataset — this pipeline depends on that landing first.
- **Existing wind/heat overlay** in `CesiumViewport` (`renderWindOverlay`/`renderHeatOverlay`,
  `climateOverlayGeometry.ts`) + the "Estimated" badge (`3db21345`). The new pipeline **generalises**
  these: the current wind streaks/heat tint become the WIND and HEAT layers of the shared grid.
- **Solar**: `@pryzm/solar-analysis` (`computeSolarPositionRad`, sun arcs) — drives Shade + UTCI Tmrt.
- **Context**: OSM context buildings (`contextBuildings.ts`) + footprints/heights — drive wind
  shelter, shade projection, and the **population-density proxy** (floors × footprint → persons).
- **Frame**: the LTP-ENU anchor (`eastNorthUpToFixedFrame`) + `enuToCartesian` already used by every
  Cesium overlay — the grid renderer reuses it verbatim.

**New (this plan):**
- `@pryzm/street-analytics` — a PURE L2 package (no THREE/Cesium/DOM): `StreetGrid`, `WindComfortGrid`
  (Lawson LDC shelter heuristic), `UTCIGrid` (Bröde 2012 polynomial), `ShadeGrid` (analytic silhouette
  projection), `PopulationDensityLayer` (OSM floor-count proxy + optional WorldPop/Esri imagery).
  Fully unit-testable, deterministic (ADR-0061 — no `Date.now`/`Math.random` in the pure core; pass the
  analysis date in).
- `StreetAnalyticsRenderer` (apps/editor geospatial) — one Cesium entity collection of ground-clamped
  rectangles per cell; layers toggle via `entity.show` (no geometry rebuild).
- `MicroclimatePanel` + `MicroclimateOrchestrator` (apps/editor climate) — the Henning-Larsen-style
  card (white + #6600FF) with 🌬/🌡/☀/🏙/👥 chips, legend, date/time, resolution.

---

## 1. The shared grid (single source of truth)

`packages/street-analytics/src/StreetGrid.ts` — `buildStreetGrid(boundary, footprints, {cellSize=3, margin=20})`
→ `GridCell[]` (`x,z,size,inBoundary,underBuilding`). One regular grid covering boundary + margin,
each cell classified by point-in-polygon. Every layer is a pure map over these cells → a colour. The
grid is computed ONCE per (boundary, resolution); layers recompute on date/time change only.

**Why one grid:** all five layers share cell geometry, so the renderer builds Cesium rectangles ONCE
and only swaps the per-cell material when the active layer changes → instant toggling, the
Henning-Larsen "flip between metrics" UX.

---

## 2. The five layers (deterministic, no CFD)

| Layer | Method (pure L2) | Inputs | Output |
|---|---|---|---|
| **🌬 Wind comfort** | Lawson LDC + **shelter heuristic** (Σ height/dist × upwind-alignment per nearby building → effective speed) | wind rose + building obstacles | LawsonClass → blue/green/amber/red |
| **🌡 UTCI** | **Bröde et al. 2012** polynomial (Ta, Tmrt, va, Pa); Tmrt boosted by sun altitude where un-shaded | monthly normals + sun pos + shade set | UTCI °C → 10-band cold→heat ramp |
| **☀ Shade** | **analytic silhouette projection** (footprint translated by height/tan(alt) along sun-azimuth+180°, point-in-shadow over a day) | footprints+heights + sun pos | sunExposure 0..1 → shade→sun ramp |
| **🏙 Heat island** | surface-albedo + wind UHI delta over the existing heat-tint (folds in today's `heatFieldCells`) | normals + wind + albedo | UHI ΔT → warm ramp |
| **👥 Population density** | **OSM floor-count proxy** (floors × footprint area × ~0.035 p/m² GFA per cell) — keyless/offline; optional WorldPop/Esri/GHS-POP imagery layer | context buildings | persons/m² → light→dark-red |

All five are PURE functions of (grid, climate, sun-date, obstacles) → unit-testable, deterministic.
Perf target: 3 m grid on a 400 m² site (~4000 cells) < 1 s in-browser.

---

## 3. Rendering across the 3 views — the key strategy decision

The pasted plan renders cells as **Cesium ground rectangles** (`HeightReference.CLAMP_TO_GROUND`,
`ClassificationType.TERRAIN`). That covers **2 of the 3 views for free**:

- **3D globe (Google 3D tiles)** — ✅ Cesium rectangles clamp to the tile terrain.
- **Forma (flat ground)** — ✅ same Cesium rectangles clamp to the Forma base plane.
- **BIM 3D editor (THREE/WebGPU)** — ⚠️ NOT Cesium. Needs a **parallel THREE ground-plane renderer**
  (a single instanced/merged colored-quad mesh on the level-0 plane reading the SAME `GridCell[]` +
  colour). The pure grid + colour layers are renderer-agnostic, so this is a thin second adapter.

**Recommended phasing of the 3-view goal:** ship Cesium (globe + Forma) FIRST (one renderer, two
views), then add the THREE adapter for the BIM 3D view. The pure `@pryzm/street-analytics` core is
shared by both — no recomputation, just a second draw target. (This mirrors the existing split: climate
overlays are Cesium-only today; the BIM 3D view has the sun-hours heatmap via THREE.)

---

## 4. Phased delivery (priority: HEAT · WIND · POPULATION DENSITY)

- **P0 — unblock (in flight):** FIX 1 §CLIMATE-OVERLAY-DATA-WIRING (robust `resolveDataset`) so any
  overlay has data on first paint. *Prereq for everything below.*
- **P1 — the grid + the 3 priority layers, Cesium (globe + Forma):**
  `@pryzm/street-analytics` (`StreetGrid` + `WindComfortGrid` + `HeatIslandGrid` + `PopulationDensityLayer`)
  + `StreetAnalyticsRenderer` + the `MicroclimatePanel` chips for 🌬 Wind / 🌡 Heat / 👥 Density. Unit
  tests on the pure core; in-browser confirm the ground plane colours.
- **P2 — UTCI + Shade (Cesium):** add `UTCIGrid` + `ShadeGrid` + their chips/legends + the day-sweep
  animation (reuse `setFormaSunTime` for shade).
- **P3 — BIM 3D view:** the THREE ground-plane adapter so all 3 layers render in the editor 3D view too.
- **P4 — data upgrades:** real RH/EPW into UTCI; WorldPop/GHS-POP imagery (proxy for CORS) replacing
  the OSM density proxy; GPU shadow-map oracle (ADR-0074 P2) for the shade/heat at 1.4 M-tri scale.

---

## 5. Package + file layout

```
packages/street-analytics/            NEW — pure L2 (no THREE/Cesium/DOM), sideEffects:false
  src/{StreetGrid, WindComfortGrid, UTCIGrid, ShadeGrid, HeatIslandGrid, PopulationDensityLayer, index}.ts
apps/editor/src/ui/
  geospatial/StreetAnalyticsRenderer.ts   (Cesium entity layer; later a THREE sibling for the BIM view)
  climate/{MicroclimatePanel, MicroclimateOrchestrator}.ts
```
GIS rail: a **🏙 Microclimate** button next to "🌦 Climate Analysis"; console `pryzmOpenMicroclimate()`.

---

## 6. Constraints / governance

- **Deterministic + pure** core (ADR-0061): the analysis date is an INPUT; no `Date.now`/`Math.random`
  in `@pryzm/street-analytics`. Stamp timestamps at the call site.
- **Brand**: panel is white + #6600FF, no pure black. The DATA ramps (Lawson/UTCI/density) use their
  scientific palettes (blue→red), which is correct for analytics legibility (matches Henning Larsen).
- **Layer dependency**: `@pryzm/street-analytics` (L2) ← imports only `@pryzm/climate-types`,
  `@pryzm/solar-analysis`. The renderer/panel are L5 (apps/editor). P2 (THREE only in renderer-three)
  is respected — the Cesium renderer uses Cesium, the future BIM-view adapter lives behind the
  renderer boundary.
- **Reuse, don't fork**: fold today's `renderWindOverlay`/`renderHeatOverlay`/`climateOverlayGeometry`
  into the WIND/HEAT grid layers rather than running two parallel wind systems.

---

## 7. Acceptance

| Layer | Criterion |
|---|---|
| Wind | ground plane blue/green/amber/red (Lawson LDC), updates on date/time, all 3 views |
| Heat | warm UHI ΔT field folding in the existing heat tint, all 3 views |
| Population density | block-level intensity from OSM floors (keyless), togglable, all 3 views |
| UTCI / Shade | continuous cold→heat / shade→sun ramps; shade animates on the time slider |
| Perf | 3 m grid / ~4000 cells < 1 s in-browser; instant layer toggle (no geometry rebuild) |
| UI | Henning-Larsen-style card (white + #6600FF), per-layer legend |

**Status:** documented (this file). Not yet implemented — P0 (data wiring) is in flight; P1 is the
first build. The reference implementation code (grid, Lawson, UTCI polynomial, shade projection,
density proxy, Cesium renderer, panel, orchestrator) is captured in the founder brief and maps
1:1 to the file layout in §5.
