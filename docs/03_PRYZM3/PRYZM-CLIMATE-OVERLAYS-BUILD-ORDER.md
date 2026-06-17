# PRYZM — Climate / analytics overlays BUILD-ORDER (code-grounded, 2026-06-17)

Status: **implementer build plan.** Refines + verifies `SPEC-3D-ANALYTICS-FIXES-AND-OVERLAYS.md`
against the live code (every claim below carries a `path:line` citation checked this session). It
supersedes that SPEC's ordering with a corrected, dependency-aware sequence. This is a build plan,
not marketing — each step states the verified root, the exact change, an effort tier (S/M/L), an
acceptance criterion, and its dependencies.

---

## What is already shipped (verified)

The climate/analytics substrate is FAR more complete than "stubs". Verified live:

- **Overlay geometry is fully implemented + pure** — `apps/editor/src/ui/climate/climateOverlayGeometry.ts`:
  `windStreakSegments()` (`:165`), `windStreamlinePaths()` (`:268`, A.21.D35 curved flow-field),
  `heatTintColorHex()` (`:399`), `heatFieldCells()` (`:483`), plus `sunArcEnuPoints()` (`:108`). Zero
  THREE/DOM/Cesium imports → unit-testable.
- **Cesium render path is real + wired** — `CesiumViewport.renderWindOverlay()`
  (`apps/editor/src/ui/geospatial/CesiumViewport.ts:3479`) draws streamlines + rose ticks;
  `renderHeatOverlay()` (`:3562`) draws the comfort grid. Both are fed by
  `setClimateOverlayDataset()` (`:3310`) and toggled by `setWindOverlay`/`setHeatOverlay` (`:3326`/`:3333`).
- **The dataset pipeline is real + offline-first** — `ensureSiteClimate()`
  (`apps/editor/src/ui/climate/ensureSiteClimate.ts:59`) auto-creates the Site when only a location
  exists (`:95-108`), ingests bundled regional normals INSTANTLY with no network (Stage 1, `:127-142`),
  then upgrades to live Open-Meteo/PVGIS in the background (Stage 2, `:149-166`). `FormaSiteAnalysisControls`
  already calls it proactively on mount (`:192`, `:233`) and re-tries on `site.location-changed` (`:160-180`).
- **Sun analytics ship in the editor view** — `computeSunHoursOnModel(scene, levelId, opts)`
  (`packages/renderer-three/src/solar/computeSunHoursOnModel.ts:298`) paints a CPU three-mesh-bvh
  per-vertex heatmap; surfaced by `pryzmComputeSunHours()` (`apps/editor/src/ui/daylight/sunHoursConsole.ts:192`)
  and the "☀ Sun Hours" Physics-panel button (`apps/editor/src/ui/dataworkbench/PhysicsPanel.ts:198`).
- **Forma sun + shadow scrubber ships** — `setFormaSunTime()` (`CesiumViewport.ts:1303`) recomputes a
  `Cesium.DirectionalLight` (`:1267`); the FormaSiteAnalysisControls scrubber + "▶ Study" day-sweep drive it.

### The actual gaps (small)

1. The 3D wind/heat overlays go empty on the *first* paint because `resolveDataset()` hard-returns
   `null` synchronously when no Site exists yet — the async `ensureSiteClimate` fixes it a tick later,
   but the empty state can latch and the badge reads "No wind data" instead of "estimated".
2. The real GLB model renders **black** in Forma mode (no PBR-friendly materials / no ambient/IBL).
3. Sun-hours paints only on the editor BIM scene — not on the Forma massing or the globe GLB.
4. `accumulateRoomHeatGain()` is implemented + tested but unwired; UTCI / Lawson / CMIP6 unbuilt.

---

## Step 1 — Climate-data wiring: make wind + heat ALWAYS draw (smallest, highest visibility)

**Verified root.** The geometry + render path are complete (see above). The starvation is a
data-resolution timing/keying issue, NOT a stub:

- `CesiumViewport.renderWindOverlay()` / `renderHeatOverlay()` early-return on
  `this.climateOverlayDataset == null` — `CesiumViewport.ts:3484` (`!ds`) and `:3567`.
- The dataset is pushed by `FormaSiteAnalysisControls.syncOverlayDataset()`
  (`FormaSiteAnalysisControls.ts:736`) → `viewport.setClimateOverlayDataset(this.resolveDataset())`.
- `resolveDataset()` (`FormaSiteAnalysisControls.ts:815-825`) hard-returns `null` whenever
  `runtime.siteModelStore.getSite()` is `null`, then resolves ONLY via
  `climateStore.resolveSite(site.id)`.
- `ClimateStore.resolveSite(siteRef)` (`packages/stores/src/ClimateStore.ts:78`) resolves a dataset
  **only by `SiteId`** (keyed at `:172` via `dataset.siteRef`). No lat/lon resolve path is used by the
  overlay. `resolveByLatLon` exists (`:99`) but the overlay never calls it.

**Already half-fixed (do NOT re-implement).** `ensureSiteClimate` already auto-creates the Site from
an LTP-ENU origin (`ensureSiteClimate.ts:95-108`, the `§A.21.D33(f)` keying fix) and ingests the
bundled regional default first with no network (`:127-142`). `FormaSiteAnalysisControls.mount()`
already calls `ensureClimateIfMissing()` (`:192`) and repaints on the store subscription (`:169`) +
`site.location-changed` (`:175`). So on the happy path the overlays DO populate after the async ingest.

**The remaining hole** is the synchronous first paint + the badge:
- `resolveDataset()` returns `null` before the async ingest settles, so the very first
  `setClimateOverlayDataset(null)` paints empty and — if no further site event fires — the user sees
  the "No wind data" note (`FormaSiteAnalysisControls.ts:748`) and "NO DATASET"-style empty overlays.
- Bundled normals are GENERIC climate-zone templates (the `fallback-defaults` tier), but the UI does
  not tag them as estimated — it shows `Source ${ds.source}` flatly (`:582`).

**Exact change.**
1. In `ensureClimateIfMissing()` (`FormaSiteAnalysisControls.ts:233`), when a location/origin exists
   but `getSite()` is still null, call `ensureSite(...)` (from `siteDispatch.ts:215`) SYNCHRONOUSLY
   first so a Site is keyable, THEN `resolveDataset()` can return on the same tick once the bundled
   ingest lands. (`ensureSiteClimate` already creates the Site, but it is `await`-ed; making the Site
   exist synchronously removes the empty first-paint.)
2. Verify the bundled ingest always keys: `climateEnsureForLocation({ ..., skipIfPresent: true },
   { store, fetchImpl: undefined })` is called at `ensureSiteClimate.ts:129` and ingests for
   `commonPayload.siteId` (`:111-117`). Confirm in-browser that `climateStore.resolveSite(site.id)`
   returns non-null for a known plot (Almería 37.34/-2.13) immediately after a Forma mount.
3. Graceful badge: when `ds.source` is the bundled/`fallback-defaults` tier, render overlays anyway
   (they are plausible) and change the note from "No wind data" to "Estimated (regional default)" in
   `renderWindRose()` (`FormaSiteAnalysisControls.ts:748`/`:754`) + `renderWeatherCard()` (`:582`).

**Effort: S.** No new geometry, no new render code — a synchronous-ensure tweak + a badge string.

**Acceptance.** Toggling 🌬 Wind / 🌡 Heat on a freshly-located Forma view (any country, incl. Almería
37.34/-2.13) shows streaks/streamlines + the comfort grid on the FIRST toggle, with no transient
"No wind data" flash; the badge reads "Estimated" on the bundled tier and the source name once live
data lands. The 2D wind rose and the 3D streaks read from the same dataset.

**Dependencies.** None. This is the unblocker for the whole climate-overlay demo.

---

## Step 2 — Forma material fix: the real model stops rendering black (demo-blocking)

**Verified root.** Forma mode lights the scene with a SINGLE `Cesium.DirectionalLight`
(`CesiumViewport.ts:1267`) and **no** image-based lighting / ambient term — verified by absence: no
`imageBasedLighting` / `ImageBasedLighting` / `environmentMap` anywhere in `CesiumViewport.ts`, and
the real-model load (`renderRealModelOnForma`, `CesiumViewport.ts:3927`) sets only `shadows` +
`upAxis`/`forwardAxis` (`:3961-3970`) — it never sets `imageBasedLighting` or `lightColor` on the
`Cesium.Model`. Meanwhile `exportFragmentsToGLB()` (`packages/file-format/src/export/glb/GLBExporter.ts:42`)
clones each element's materials AS-IS (`cloneWithBakedWorldTransform`, `:24`; no material pass) — those
are the editor's TSL / NodeMaterials, which `GLTFExporter` cannot serialise as glTF PBR
metallic-roughness. The result: GLB primitives carry no (or degenerate) `pbrMetallicRoughness`, so
under a directional-only rig with no ambient they read black (hence the ×22 "Use MeshStandardMaterial
for best results" warning).

**Exact change (pick one; do the cheapest that demos well).**
- **A (robust, source-side):** in `GLBExporter.ts` before `exporter.parse(...)` (`:158`), walk
  `exportRoot` and replace any non-`MeshStandardMaterial`/`MeshPhysicalMaterial` with a
  `MeshStandardMaterial` carrying `color` = the element colour, `metalness: 0`, `roughness: 0.8`. This
  guarantees a valid `pbrMetallicRoughness` in the GLB so it lights correctly in BOTH Forma and the
  globe.
- **B (cheap, viewer-side):** on the `Cesium.Model.fromGltfAsync(...)` in `renderRealModelOnForma`
  (`CesiumViewport.ts:3961`), set `imageBasedLighting` (a low-intensity ambient `ImageBasedLighting`
  with a flat spherical-harmonic term) and/or `lightColor` so unlit/flat materials read mid-tone. Add
  the same to the globe real-model load path.

Prefer **A** (fixes the cause; also fixes downloaded/round-tripped GLBs); add a small ambient from **B**
so the shaded sides aren't pure black. Keep PRYZM brand — no pure black.

**Effort: M.** A is a contained export pass with a unit test (`cloneWithBakedWorldTransform` is already
exported for testability — add a `normalizeMaterialsForGLB` next to it). B alone is S but only masks it.

**Acceptance.** The Forma real model reads as a lit white/coloured massing (Hektar/Forma aesthetic),
not black; the "Use MeshStandardMaterial" warnings are gone; a downloaded GLB (`downloadBlobUrl`)
opens lit in a third-party glTF viewer.

**Dependencies.** None, but do it before Step 3b (the GLB heatmap needs a non-black base to read on).

---

## Step 3 — GPU sun across all 3 views (the headline parity win)

**Verified root.** `computeSunHoursOnModel(scene, levelId, opts)`
(`packages/renderer-three/src/solar/computeSunHoursOnModel.ts:298`) runs a CPU three-mesh-bvh raycast
oracle and paints a per-vertex heatmap on the **editor BIM THREE scene only** — it resolves the scene
from `window.world/bimWorld/selectionManager` (`sunHoursConsole.ts:61-73`). There is no equivalent
pass on the Forma massing entities or the globe `Cesium.Model`. The Forma sun light already animates
via `setFormaSunTime()` (`CesiumViewport.ts:1303`) + the "▶ Study" day-sweep, but no sun-hours heatmap
rides it. ADR-0074 P2 (GPU shadow-map occlusion oracle) is deferred.

**Exact change (phased).**
- **3a — Forma + globe heatmap (M).** Run the SAME CPU `computeSunHoursOnModel` pass against the
  exported GLB geometry (or the Forma massing surfaces) and bake the per-vertex heatmap into vertex
  colours on the GLB BEFORE `exportFragmentsToGLB` returns (`GLBExporter.ts:42`), or paint it onto the
  `Cesium.Model` after load (`renderRealModelOnForma`, `CesiumViewport.ts:3927`). Reuse the existing
  colour ramp so all three views match. Requires Step 2 (a non-black base).
- **3b — animated shadow sweep (S, once 3a lands).** Drive a 6am→7pm loop through `setFormaSunTime()`
  (the "▶ Study" sweep at `FormaSiteAnalysisControls.ts:488` already does this) and let the heatmap +
  Cesium soft shadows move together.
- **3c — GPU oracle, ADR-0074 P2 (L).** Replace the CPU raycast oracle in `computeSunHoursOnModel`
  with a GPU shadow-map depth-compare for the 1.4M-tri perf class. Largest piece; defer until 3a/3b
  demo.
- **3d — top-level control (S).** The "☀ Sun Hours" entry is buried in the Data Workbench Physics
  panel (`PhysicsPanel.ts:198`); surface a top-level "☀ Analysis" toolbar affordance (the Forma toggle
  at `GISAreaLayout.ts:1998` is the natural home).

**Effort: M (3a) + S (3b/3d) + L (3c).** Ship 3a+3b+3d first; 3c is a separate sprint.

**Acceptance.** Sun-hours heatmap + animated shadow sweep available in all three views (editor BIM,
Forma massing, globe GLB) from a top-level control, all sharing one colour ramp.

**Dependencies.** Step 2 (non-black GLB base for the heatmap to read on).

---

## Step 4 — Heat-gain wiring, then the Henning-Larsen-class differentiators

**4a — Heat-gain wiring (S→M).**
**Verified root.** `accumulateRoomHeatGain(sunHours, rooms, opts)`
(`packages/solar-analysis/src/roomHeatGain.ts:81`, exported via `packages/solar-analysis/src/index.ts:51`,
fully unit-tested in `packages/solar-analysis/__tests__/roomHeatGain.test.ts`) computes
`Q_solar(R) = Σ I_inc·A_g·SHGC_g` per room with two tiers — `'absolute-kwh'` when a per-surface
irradiance map (kWh/m²) is injected, else `'relative-index'` (`gainIndex = Σ sunHours·area·SHGC`,
`DEFAULT_SHGC = 0.5` at `:22`). It is **defined but unwired** — no console/UI entry calls it.
**Exact change.** Add a console command + a Physics-panel/Forma entry that (1) runs
`computeSunHoursOnModel` for the active level, (2) builds the `RoomGlazing` inventory from the room's
exterior-wall openings (glazed area + SHGC from glazing materials), (3) calls `accumulateRoomHeatGain`,
(4) injects a per-surface W/m² EPW irradiance map when available to reach the `'absolute-kwh'` tier.
Mirror the `sunHoursConsole.ts` wiring pattern.
**Acceptance.** A console/UI entry reports per-room solar heat gain; absolute kWh when irradiance is
injected, relative index otherwise. **Dependencies.** Step 3a (sun-hours feeds the relative tier).

**4b — UTCI / pedestrian wind-comfort (Lawson) / future-climate (CMIP6) (L, the differentiators).**
All three are deterministic published formulae, NOT CFD, and their inputs already live in
`climateStore` (`monthlyNormals`, `designTemps`, `degreeDays`, `windRose`, source — read at
`FormaSiteAnalysisControls.ts:564-583`) + the solar substrate:
- **UTCI** — published polynomial: air temp + mean-radiant (from sun position, already solved by the
  Forma sun) + wind speed (from the wind rose) + humidity. Output as a comfort field analogous to
  `heatFieldCells`.
- **Lawson pedestrian wind comfort** — threshold criteria over the wind rose frequencies × a local
  speed-up factor around the massing (reuse the `windStreamlinePaths` deflection proxy). Deterministic.
- **Future-climate (CMIP6 2050/2080)** — apply published delta-temperature/humidity offsets to the
  normals and re-run UTCI/heat-gain to show a "today vs 2050" comparison.
These separate PRYZM from Hektar/Forma and approach Henning Larsen. **Effort: L each; sequence after
4a.** **Dependencies.** Steps 1 (live climate dataset) + 3 (sun position field).

---

## Quick-win ordering

| Step | What | Effort | User-visible result |
|------|------|--------|---------------------|
| 1 | Climate-data wiring (synchronous ensure + estimated badge) | **S** | 🌬 Wind + 🌡 Heat overlays draw on the FIRST toggle, anywhere on Earth — no empty flash |
| 2 | Forma material fix (PBR-normalise GLB + ambient) | M | Real building reads as a lit white/coloured massing, not black |
| 3a+3b+3d | Sun-hours heatmap + shadow sweep on Forma + globe, top-level control | M (+S) | Animated sun-hours heatmap in all 3 views from one button |
| 4a | Heat-gain wiring (`accumulateRoomHeatGain`) | S→M | Per-room solar heat-gain figures (kWh / index) |
| 3c | GPU shadow-map oracle (ADR-0074 P2) | L | Sun-hours at 1.4M-tri scale, interactive |
| 4b | UTCI / Lawson / CMIP6 | L (each) | Henning-Larsen-class comfort + future-climate analytics |

**The single biggest quick win: Step 1.** It is an S-effort change (a synchronous `ensureSite` + a
badge string — no new geometry, no new render code) that flips the most-visible, most-demoed surface
(🌬 Wind + 🌡 Heat in the Forma view) from "No wind data" to a live, flowing wind field + comfort grid
on the very first toggle, for any location on Earth via the bundled offline normals already shipping
in `ensureSiteClimate`.

---

## How the founder triggers each today (verified)

- **Climate panel (sun-path · wind rose · temperature):** GIS rail **"🌦 Climate Analysis"** →
  `openClimatePanel(runtime)` (`apps/editor/src/ui/tools-panel/panels/GISRailPanel.ts:126`); also the
  ClimatePanel title is "🌦 Climate & Site Intelligence" (`apps/editor/src/ui/climate/ClimatePanel.ts:156`).
- **Forma site-analysis panel (sun scrubber · weather card · wind rose · 3D overlay toggles):**
  the **"☀ Analysis"** toolbar toggle in the Forma view (`apps/editor/src/ui/layout/GISAreaLayout.ts:1998`),
  which shows/hides `FormaSiteAnalysisControls`. The 3D overlay chips (☀ Sun path / 🌬 Wind / 🌡 Heat)
  are inside that panel (`FormaSiteAnalysisControls.ts:721-723`).
- **Sun-hours heatmap (editor BIM scene):** the **"☀ Sun Hours"** button in the Data Workbench Physics
  panel (`apps/editor/src/ui/dataworkbench/PhysicsPanel.ts:198`), or the console commands
  `pryzmComputeSunHours()` / `pryzmClearSunHours()` (`apps/editor/src/ui/daylight/sunHoursConsole.ts:192-193`),
  or `pryzmOpenSolarPanel()` (`apps/editor/src/ui/daylight/SolarSunHoursPanel.ts:482`).
- **Proactive climate ingest:** runs automatically on Forma-view mount via
  `ensureClimateIfMissing()` → `ensureSiteClimate(runtime)` (`FormaSiteAnalysisControls.ts:192`,
  `apps/editor/src/ui/climate/ensureSiteClimate.ts:59`) — bundled normals land instantly, live
  Open-Meteo/PVGIS upgrades in the background.
