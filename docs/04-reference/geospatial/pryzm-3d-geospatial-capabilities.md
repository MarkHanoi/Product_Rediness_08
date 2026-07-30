# PRYZM — 3D, Geospatial & Site-Analytics Capabilities (code-grounded catalog)

**Date:** 2026-06-17
**Scope:** A reference catalog of what PRYZM offers *today* across six surfaces — the main Three.js/WebGPU editor view, the Cesium photorealistic globe, the "Forma" site-3D massing study, the 2D GIS map + site/parcel substrate, solar/daylight analytics, and the interop paths (glTF/IFC/Revit) that feed these views.
**Method:** Every claim below is verified against source and cited as `path:line`. Where line numbers come from a specific file they are absolute paths from repo root. Status tags: **SHIPPED** (live in code/production), **PARTIAL** (some slices shipped, others phase-gated), **DRAFT/PLANNED** (spec written, code skeleton or deferred).

> Note on doc location: this file is written to the path requested by the task. The canonical doc tree was reorganised into `docs/01-strategy`, `docs/02-decisions` (ADRs + C-contracts), and `docs/03-execution` (specs + plans); cross-references below point at the live `docs/0N-*` locations.

---

## Table of contents

1. [The 3D editor view (Three.js / WebGPU)](#1-the-3d-editor-view-threejs--webgpu)
2. [The 3D globe / Cesium view](#2-the-3d-globe--cesium-view)
3. [The "Forma" / Site-3D view](#3-the-forma--site-3d-view)
4. [GIS / site features (2D map + parcel substrate)](#4-gis--site-features-2d-map--parcel-substrate)
5. [Analytics / analysis (solar, daylight, heat-gain, climate)](#5-analytics--analysis-solar-daylight-heat-gain-climate)
6. [Interop relevant to 3D (glTF / IFC / Revit / georeferencing)](#6-interop-relevant-to-3d-gltf--ifc--revit--georeferencing)
7. [Quick reference table](#7-quick-reference-table)
8. [Gaps / not-yet-built](#8-gaps--not-yet-built)

---

## 1. The 3D editor view (Three.js / WebGPU)

The primary authoring surface. A single-owner Three.js scene rendered with WebGPU (WebGL2 fallback), governed by the P2 "single THREE owner" principle — `import * as THREE` is allowed only inside `packages/renderer-three/`.

### 1.1 Renderer & render loop

- **Dual-mode renderer (WebGPU → WebGL2 auto).** Boot contract defaults to `mode='auto'`: tries WebGPU first, falls back to WebGL2 (`packages/renderer/src/Renderer.ts:1`). Backend auto-detection via `navigator.gpu` with the resolved backend recorded as an OTel attribute `pryzm.renderer.mode` (`packages/renderer-three/src/adapters/WebGPURendererAdapter.ts:1`).
- **Single abstraction handle.** `RendererHandle` wraps `THREE.WebGLRenderer` / `WebGPURenderer` behind one interface with a `type: 'webgpu' | 'webgl2' | 'webgl1'` discriminant (`packages/renderer-three/src/RendererHandle.ts:28`).
- **TSL render pipeline.** `RenderPipelineManager` runs a node-based pipeline: ScenePass (MRT) → ZonePass → SSGINode → TRAANode → background blend → canvas (`packages/renderer-three/src/pipeline/RenderPipelineManager.ts:1`).
- **Frame scheduler (single rAF — P3).** `requestAnimationFrame` is pumped only by the frame scheduler: a priority queue with a dirty-flag set, idle-continuation budget (30 frames, ADR-0206), and a motion gate (S17) that drops to 0 fps when there is no active input (`packages/frame-scheduler/src/FrameScheduler.ts:1`, motion gate at `:82`). Per-frame OTel span `pryzm.frame.tick`; idle transitions span `pryzm.frame.idle-continuation`.

### 1.2 View modes / render tiers

PRYZM defines two render tiers (DRAFT spec — partly shipped):

- **T-MASS (Massing)** — the Cesium site view (clean pastel/white extruded blocks, white edge outlines, soft ground shadow). For feasibility, site context, sun studies.
- **T-PRES (Presentation)** — the BIM WebGPU view with articulated facades, studio ground + soft sky, soft shadows, entourage.
- Spec: `docs/03-execution/specs/SPEC-RENDER-TIERS-MASSING-AND-PRESENTATION.md:1` (**Status: DRAFT 2026-06-05**). Phases A.24.1 (tier toggle UI), A.24.2 (presentation environment), A.24.3 (material presets: "White model" / "Use-coloured"), A.24.4 (entourage) — UI toggle + studio environment + entourage are **PLANNED**; the underlying BIM 3D view + Pascal lighting + SSGI + soft shadows are **SHIPPED**.
- **Visual style on a per-view basis** lives in the View Properties panel ('Consistent' / 'Textures' / 'Realistic'), see §1.10.

### 1.3 Visualization engine panel (lighting / camera / post-FX)

`apps/editor/src/ui/rendering/VisualizationEnginePanel.ts:1` — a unified scene-setup control (CSS prefix `viz-`):

- **Quality levels:** Off, Standard (◑), High (●), Ultra (✦ default). Status bar reads e.g. "✦ Ultra — PBR · HDRI · Shadows · Probes".
- **Lighting presets:** Sunrise, Daylight, Golden Hour, Overcast, Night Warm, Studio — each maps to an HDRI (daylight-interior / evening / daylight-overcast / studio-warm / studio-neutral) + enhancement level + tonemap (`VisualizationEnginePanelData.ts`).
- **Camera presets:** Eye Level (👁, 1.6 m), Top Down (⬇️), Interior Wide (🏠, 75° FOV), Corner Shot (📐).
- **Post-FX:** Tone Mapping, Bloom, Vignette, SSAO; gated by enhancement level.
- **Path tracing (Viewport Path Tracer / VPT):** statuses idle (○) / building (⏳) / accumulating (●) / converged (✓) / paused (⏸); DOF toggle, F-stop (default F/2.8), focal distance (10 m), aperture blades (6), max samples (1000).
- **SSGI parameters** (`packages/renderer-three/src/pipeline/SSGIPass.ts:42`): radius 1.0 m, thickness 0.5 m, expFactor 1.5, 1 slice/pixel, 4 steps/slice, aoIntensity 1.5, backfaceLighting 0.5, denoiseRadius 4, giIntensity 0 (disabled pending QA) — values mirror the Pascal reference.

### 1.4 Camera / navigation

- **Hand-rolled orbit camera** (no `OrbitControls` jsm dependency): spherical yaw/pitch/distance around a target (`packages/renderer/src/CameraController.ts:1`). Left-drag orbit, right-drag pan, wheel zoom; pitch clamped at `π/2 − 0.05` to prevent inversion (`:24`). Default camera = `PerspectiveCamera(50° FOV, 0.1–1000)` (`packages/renderer/src/Renderer.ts:86`).
- **Ortho/perspective hybrid.** `OrthoPerspectiveCamera` allows the plan ↔ perspective toggle; near plane 0.1 m (`packages/core-app-model/src/BimWorld.ts:25`, `:32`).
- Every input marks the scheduler dirty (`markDirty('camera')`); when idle, 0 fps.

### 1.5 Split-view (secondary plan pane)

`apps/editor/src/engine/views/SplitViewManager.ts:1` — a secondary floor-plan pane rendered with **Canvas2D** (NOT a second WebGPU/WebGL renderer, to avoid two GPU devices on one page invalidating compiled TSL NodeMaterials):

- Draws **projected edge geometry** from `ViewTechnicalDrawingCache` (OBC EdgeProjector output).
- View-type selector — Plan / Section / Elevation / RCP (`:76`); level selector switches the active plan level (`:82`).
- Targets ~30 fps (`SECONDARY_FPS_INTERVAL = 1000/30`, `:59`).
- (Historical note from prior sessions: SVP '3d' forwarding has anchor-skip handling, `§SELECT-SVP3D-ANCHOR-SKIP`.)

### 1.6 Level / floor visibility

- **Level-scope wave (Wave 1):** an element is visible IFF its `levelId` is in the view's `visibleLevels` set, or the view is unlevel-scoped (`packages/visibility/src/waves/w01-level-scope.ts:1`). Project-root pseudo-level `'__root__'` must be present to render; empty `visibleLevels` hides everything.
- **Visibility intent waves (3–4):** category fan-out + halftone propagation via `linkedGroupId`; verbs `hide | show | halftone | unhalftone`; per-view side-tables `hidden` / `halftone` (`packages/visibility/src/index.ts:1`). Visibility is a domain concept, not UI state (P7).
- **Instanced aggregate level visibility:** simple batch walls render as one `InstancedMesh` per (geometry × material × level); hide matches on `userData.levelId`, and isolate/re-apply/reset handle `isInstancedGroup` per level/type (`§INSTANCED-LEVEL-VIS` / `§INSTANCED-ISOLATE-FIX`, see `InstancedElementRenderer.ts`).

### 1.7 Selection & highlight

- **GPU picking (single-frame pick texture, ADR-0015 Strategy A):** a parallel pick scene mirrors each pickable element with a `MeshBasicMaterial` colour-encoding its slot index; render into a small RT at the cursor, read back the pixel, decode → ElementId (`packages/picking/src/gpu-pick.ts:1`). Slot free-list bounds the index space (HIGH-7, `:34`); a depth-readback pass packs `gl_FragCoord.z` for world-space distance. Earlier work (`gpu-pick.ts`) widened the pick target to viewport size + a search radius to make 3D selection reliable.
- **Selection manager:** click-selection, transform-control attachment, effective-visibility gate so hidden/isolated elements are not selectable (`packages/input-host/src/SelectionManager.ts:1`, `:28`). Curtain-wall sub-element selection is a two-step Revit-like pattern (parent → panel/mullion; Tab cycles) (`:42`).
- **Highlight visual:** `OutlinePass` (TSL) — soft-violet visible edge + electric-violet hidden (through-wall) edge for selection; hover pulses at a 3 s period (`packages/renderer-three/src/pipeline/OutlinePass.ts:1`). Colours: soft violet `#8B5CF6`, electric violet `#6600FF`. (A geometry-fill overlay replaced the old weak bounding-box highlight, see `SelectionManager`.)

### 1.8 Edge projection / view-render cache

- **EdgeProjectorService** wraps the OBC EdgeProjector to produce `TechnicalDrawing` instances (projected 2D LineSegments) from IFC Fragments + PRYZM native meshes, with hidden-line removal before cache write, and injected plan symbols (door swings, furniture footprints, stair walking lines, roof slope arrows, column crosshairs, window symbols) (`apps/editor/src/engine/views/EdgeProjectorService.ts:1`).
- **ViewRenderCache:** per-view `WebGLRenderTarget` cache for non-interactive renders (sheet thumbnails, PDF export, section-cut previews); explicit invalidate on view switch + bulk invalidate on model/project events; default 1024×768 (`packages/core-app-model/src/views/ViewRenderCache.ts:1`). (Prior sessions: 16/18 element types are in the projection cache.)

### 1.9 Instancing & batching

- **InstancedElementRenderer:** groups elements by a lightweight geometry hash so shared geometry (curtain-wall panels, repeated columns) renders as one `InstancedMesh` draw call; `register` / `updateTransform` (O(1) matrix write) / `unregister` / `clear` lifecycle; `userData.instanceElementIds` keyed by slot for per-instance pick resolution (`packages/core-app-model/src/rendering/InstancedElementRenderer.ts:1`).
- **WallInstanceBridge:** simple walls (no openings, not curved, no miter join) route to instancing using a shared unit `BoxGeometry` scaled by the instance matrix (`packages/geometry-wall/src/WallInstanceBridge.ts:1`).
- **BatchCoordinator:** prevents the bulk-creation "avalanche" — buffers store events and drains them across ~30 frame-scheduler 'pre-render' frames (200 events/frame, ≤16 ms each) (`packages/core-app-model/src/batch/BatchCoordinator.ts:1`).

### 1.10 View Properties panel

`apps/editor/src/ui/ViewPropertiesPanel.ts:1` — Phase-II view-definition management (fixed right, 260 px, draggable, title "View Properties"):

- Properties: viewName, viewType, viewRange, cutPlaneHeight, scale, visualStyle, showCutFill, detailLevel, discipline.
- View types: Floor Plan, Ceiling Plan, Elevation, Section, 3D View, Schedule.
- Visual styles: Consistent / Textures / Realistic. Detail levels: Coarse / Medium / Fine.
- Live-refreshes on `vi:instance-updated`.

### 1.11 Section / clipping — **NOT YET BUILT**

A grep for `clippingPlane | section | clipPlane | SectionBox` finds no clipping geometry in the core render pipeline. `cutPlaneHeight` exists as a *view-definition* property (above) and the edge projector supports section *view types*, but interactive section boxes / clip planes are **PLANNED**, not shipped.

---

## 2. The 3D globe / Cesium view

The photorealistic globe. Lives in `apps/editor/src/ui/geospatial/CesiumViewport.ts` (a ~4900-line module), mounted lazily on first GIS activation by `GISAreaLayout`. **Status: SHIPPED.**

### 2.1 Google Photorealistic 3D Tiles

- **Credentials are env-only (never hardcoded):** `_cesiumToken` from `VITE_CESIUM_TOKEN` (`CesiumViewport.ts:41`), `_googleMapsKey` from `VITE_GOOGLE_MAPS_KEY` (`:49`); `Cesium.Ion.defaultAccessToken` set from the token (`:67`).
- **Two load paths:** Cesium ion asset `Cesium.Cesium3DTileset.fromIonAssetId(2275207)` (Google Photorealistic 3D Tiles) (`:660`); or the direct Google Maps key path via `Cesium.createGooglePhotorealistic3DTileset`, feature-detecting both option-bag and positional signatures (`:676`).
- **Quality tuning:** `maximumScreenSpaceError = 2`, dynamic screen-space error, foveated rendering (`:648`). When tiles load, `globe.show = !photogrammetryLoaded` (`:723`).
- **Keyless fallback:** no default base imagery (`baseLayer: false`, `:537`); ESRI World Imagery satellite colour-graded, falling back to OpenStreetMap streets if ESRI fails (`:577`).

### 2.2 Terrain & ground clamping

- `globe.depthTestAgainstTerrain` starts `false` at mount (`:546`), is set `true` in Forma mode (`:1099`) and back to `false` for photoreal (`:1388`).
- **Keyless terrain clamp:** `clampTerrainThenReplace` samples via `Cesium.sampleTerrainMostDetailed` at the boundary centroid, guarded against `EllipsoidTerrainProvider` (which has no `availability`) (`:2661`, guard `:2777`); falls back to height 0 on reject/NaN.
- **Photoreal tile clamp:** `clampToPhotorealTilesThenReplace` uses `scene.sampleHeightMostDetailed` (raycasts the tileset), sampling centroid + boundary vertices and taking the MIN to reject building roofs (`§GIS-LOC`, `:2543`), retrying up to 3× while tiles stream (`:2627`).
- Base height tracked in `formaTerrainBaseHeight` (`:368`), re-sampled only when the centroid moves.

### 2.3 Coordinate handling (LTP-ENU / WGS84)

- **One ENU anchor** at the site origin: `Cesium.Transforms.eastNorthUpToFixedFrame` (`:1837`); `toCartesian(x, z, up)` maps scene-XZ → ENU (east = x, north = −z, up) with a single matrix multiply (`:1840`).
- `enuToCartesian` bridges ENU → ECEF (`:3384`). `polygonCentroidAndAreaXZ` does shoelace area + centroid in scene-XZ (`:4492`).
- **ProjectLocation:** falls back to `getCurrentSiteOrigin()` (the LTP-ENU origin from `siteDispatch`) when the store location is unavailable, so the camera frames the real plot not Null Island (`:964`).

### 2.4 Camera controls — zoom-to-site, fly-to, cinematic arrival, fly-tour

- **`frameSiteLocation(lat, lon, opts)`** (`:976`): `instant` → `setView` at SITE_FRAME_HEIGHT (600 m) / pitch −80°; non-instant → cinematic arrival jumping to SITE_ARRIVAL_HIGH_ALT (9000 m) then `flyTo` down over **SITE_ARRIVAL_FLY_DURATION_S = 5 s** (`§SITE-CINEMATIC-ARRIVAL`).
- **`flyToFormaSite()`** (`:2820`): NW oblique — heading 325°, pitch −45°, altitude `3.2 × √areaM2` clamped [80, 4000] m, duration FORMA_FLY_DURATION_S = 1.2 s; `§FLY-TOUR-GROUND-CLEARANCE` enforces ≥25 m clearance.
- **`flyToFormaPlan()`** (`:2879`): near-top-down preset (heading 0°, pitch −68°).
- **`flyTour()`** (`:2903`): a 4-leg cinematic flythrough (overview → NW approach → dive → pull-back), all CUBIC_IN_OUT easing, re-entrancy-guarded (`isFlyTourRunning()`).

### 2.5 Placing the BIM model on the globe (GLB anchoring)

- **`renderRealModelOnGlobe(input)`** (`:3716`): loads a GLB as `Cesium.Model.fromGltfAsync`, positioned at `fromDegrees(originLon, originLat, baseHeight)` × `eastNorthUpToFixedFrame` — the same anchor as massing. Axis convention `upAxis: Y, forwardAxis: X` (`§GLOBE-HEADING-90`, `:3785`) maps scene (x, y, z) → ENU (east, −north, up). Added to `scene.primitives`; re-seated when the tile clamp settles (`reseatRealModelOnGlobe`, `:3842`).
- **`renderBuildingOnGlobe(input)`** wraps `renderFormaMassing` with `keepPhotoreal: true` for abstract massing on the real tiles.
- **Fidelity toggle:** `window.pryzmSetGlobeBuildingFidelity('real' | 'massing')` switches between the full GLB model and abstract blocks on the photoreal globe (`§GLOBE-FIDELITY`).
- **Legacy BIM glTF:** `loadBimGltf(url, options, scale, flyTo)` places legacy GLBs at lat/lon/height with the same axis convention (`:4796`).

### 2.6 Context layers (OSM / Overpass)

- **Context buildings:** `loadContextBuildings(lat, lon)` fetches OSM footprints via keyless Overpass mirrors and extrudes them as white boxes; per-bbox in-memory + localStorage (7-day TTL) cache (`apps/editor/src/ui/geospatial/contextBuildings.ts:1`; mirrors at `:72`; height resolution `:190`). Suppressed on the photoreal globe (the tiles *are* the context).
- **Context roads:** `loadContextRoads(lat, lon)` draws OSM road centre-lines as grey polylines, visual-only (`apps/editor/src/ui/geospatial/contextRoads.ts:1`).

### 2.7 Public API & console commands

CesiumViewport exposes (among others): `mount` / `whenReady` / `isMounted` / `setVisible` / `dispose`; `renderFormaMassing` / `clearFormaMassing` / `rerenderFormaMassing` / `setVisibleFormaLevels` / `getFormaStoreyBands`; `flyToFormaSite` / `flyToFormaPlan` / `flyTour` / `isFlyTourRunning`; `setFormaMode` / `isFormaMode`; `setFormaSunTime` / `setFormaSunLocation` / `getFormaSunPosition` / `onFormaSunChange`; `renderRealModelOnGlobe` / `clearRealModelOnGlobe`; `setFormaBuildingFidelity` / `getFormaBuildingFidelity`; `setClimateOverlayDataset` / `setSunPathOverlay` / `setWindOverlay` / `setHeatOverlay`; `loadContextBuildings` / `loadContextRoads`; `getViewer`.

Window console commands (registered by `GISAreaLayout`): `pryzmToggleGIS`, `pryzmShowSiteResultView`, `pryzmSetGeocodeFrame`, `pryzmStartBoundaryDraw` / `pryzmStartBoundaryDraw3D` / `pryzmCancelBoundaryDraw`, `pryzmRenderFormaMassing`, `pryzmSetGlobeBuildingFidelity`, `pryzmShowFormaView` / `pryzmHideFormaView`, `pryzmSetFormaBuildingFidelity`, `pryzmSetCesiumFormaMode`.

### 2.8 How the user invokes it

GIS rail "Activate Geospatial" checkbox → `gisToggle(true)` mounts Cesium; the post-generate result toggle shows "◉ 3D globe" vs "▢ Plan" (`GISAreaLayout.ts:605`), with a "Zoom to Site" button (`:686`), a `[ ◉ Real ] [ ▢ Massing ]` fidelity toggle (`:634`), and a "Fly tour ▶" button. See §4.7 for the full rail.

---

## 3. The "Forma" / Site-3D view

An abstract, flat-ground massing study rendered inside the *same* Cesium viewer — deliberately the visual opposite of the photoreal globe. Replicates Autodesk Forma's massing-study aesthetic and seats the authored building at its exact real-world location. **Status: largely SHIPPED** (FORMA.2–FORMA.6 live; FORMA.1 2D-basemap palette is a stub).

Spec: `docs/03-execution/specs/SPEC-FORMA-SITE-VIEW.md:1` (**Status: DRAFT 2026-06-04**, tracker `MAP-FORMA-AESTHETIC` → FORMA.1–FORMA.6).

### 3.1 What it is and how it differs

| Aspect | Editor 3D scene (Three.js) | Cesium photoreal globe | **Forma view (Cesium)** |
|---|---|---|---|
| Building repr. | Full BIM elements | Real GLB overlay on satellite tiles | Real GLB (FORMA.6) **or** abstract pastel/white volumes |
| Aesthetic | Live-edit colours | Photo-real (sky, atmosphere) | Abstract flat-ground, silhouette outlines, no sky |
| Ground | none (scene-local) | WGS84 ellipsoid + imagery | Flat warm-grey plane, terrain-clamped |
| Context | none | OSM/Overture via tiles | OSM buildings + roads (keyless Overpass) |
| View modes | single 3D | single photoreal | `[ 2D Map ][ Plan ][ 3D ]` toggle |

`setFormaMode(true)` applies the Forma materials/lighting/sky config (white/pastel materials, directional key light, soft shadows 4096, silhouette, flat ground, background `#E8E8E6`) (`CesiumViewport.ts:1053` region; palette `FORMA_PALETTE` at `:103`; `FORMA_USE_COLOURS` residential/amenity/podium/public at `:107`).

### 3.2 What it renders

`renderFormaMassing` reads five+ author-side sources and places Cesium entities (`GISAreaLayout.ts:1418` region):

- **Boundary** — single extruded polygon with a dashed green `#2D6A4F` top line.
- **Walls** — per-wall extrusions (fallback) or a single clean footprint extrusion.
- **Slabs / roofs** — footprint extrusions at elevation.
- **Openings** — inset faces: windows translucent blue `#4F86C6` (α 0.26), doors graphite `#4A4540`.
- **Stairs** — coarse stairwell volume. **Furniture** — omitted until ceiling/furnish chains complete.
- z-fighting fix: all masses seated 0.6 m below sampled ground (`FORMA_BASE_SINK_M`).

### 3.3 Building fidelity (real vs massing)

`apps/editor/src/ui/geospatial/formaBuildingFidelity.ts` — pure (THREE/DOM-free) decision functions:

- **`'real'` (default, founder's ask):** export the live BIM scene to a GLB blob (`exportFragmentsToGLB`) and place it as a native `Cesium.Model` (`renderRealModelOnForma`, `CesiumViewport.ts:3927`) — every wall (with CSG openings), window, door, roof, slab in the app's real materials, casting soft shadows on the Forma ground.
- **`'massing'`:** abstract pastel/white volumes.
- `realModelStaysVisible(...)` keeps the monolithic GLB visible only when the floor filter shows all storeys (no per-storey slicing in a single primitive); otherwise it falls back to per-storey massing.
- `buildingGeometrySignature(...)` is a cheap stable hash used to skip re-exporting the GLB when geometry hasn't changed (live-update perf).

### 3.4 Forma site-analysis controls (FORMA.5)

`apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts:1` — a floating "Site analysis" side-card (white + `#6600FF`, dismissible, read-only consumer of the runtime substrate):

- **☀ Sun & shadow** — date picker + season presets (Spring/Summer/Autumn/Winter) + time-of-day slider (0–1439 min, 5-min step) + a live "alt N° · az N°" readout + a "▶ Study" hourly shadow-sweep (6am–7pm). Drives `viewport.setFormaSunTime(date)`.
- **🌦 Weather & comfort** — monthly temp band sparkline + heating/cooling design temps + HDD/CDD chips + "Open full climate card".
- **🧭 Wind rose** — SVG stacked speed-band sectors pointing FROM prevailing + mean/gust readout.
- **🗺 3D site analysis** — toggle chips "☀ Sun path", "🌬 Wind", "🌡 Heat" → `setSunPathOverlay` / `setWindOverlay` / `setHeatOverlay`.
- 3D climate overlays (A.21.D24): sun-path arc dome (summer gold / equinox `#6600FF` / winter blue), wind streaks, heat tint — generated in `apps/editor/src/ui/climate/climateOverlayGeometry.ts` and placed in the ENU frame.

### 3.5 How the user invokes it

GIS rail button "◉ Site 3D (Forma)" → `window.pryzmShowFormaView('plan')` (`apps/editor/src/ui/tools-panel/panels/GISRailPanel.ts:92`). That mounts a floating `[ ▦ 2D Map ][ ◳ Plan ][ ◉ 3D ]` toggle bar + "Zoom to Site" + "☀ Analysis" toggle + fidelity buttons + floor selector, then `engageFormaCesium('plan')` → `toggleGIS(true)` → `setFormaMode(true)` → `renderFormaMassing(true, 'plan')` (`GISAreaLayout.ts:1914` region). Console: `window.pryzmShowFormaView('plan' | 'map2d' | '3d')`.

---

## 4. GIS / site features (2D map + parcel substrate)

The 2D plan-view map, geocoding, boundary drawing, and the C19 site/parcel data model. **Status: SHIPPED (Phase A).**

### 4.1 2D GIS map

- **MapLibre GL JS** mounted exclusively in `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts:35`.
- **Default basemap = "Forma/Hektar" look:** OpenFreeMap vector tiles (`https://tiles.openfreemap.org/planet`, keyless), cream/parchment palette with violet `#6600FF` boundaries (`apps/editor/src/ui/geospatial/siteMap2DStyle.ts:1`). Building footprints render as flat fills with a drop-shadow; optional 3D fill-extrusion mode.
- **Satellite alternative:** ESRI raster, toggled by a top-right corner control (`SiteBoundaryMap2D.ts:279`).
- **CSP:** `tiles.openfreemap.org` and `nominatim.openstreetmap.org` must be in the server `connect-src`.

### 4.2 Geocoding / location search

- **Provider: Nominatim (OpenStreetMap)**, keyless JSON: `https://nominatim.openstreetmap.org/search?format=json&limit=5` (`apps/editor/src/ui/site/geocodeAddress.ts:37`).
- Result shape `{ displayName, lat, lon, bbox? }` (`:55`).
- **Search box** `siteGeocodeSearchBox.ts` mounted on Cesium activation (`GISAreaLayout.ts:208` region): input + button, up to 5 candidates; picking one flies the camera and calls `dispatchSiteLocation` → `site.updateLocation`, updating `SiteModelStore` and rebasing the LTP-ENU origin.

### 4.3 Boundary / parcel drawing

`SiteBoundaryMap2D.ts` (the default, hand-rolled — Terra-draw not used):

- **UX:** click to add a vertex; double-click/Enter to close & commit; Esc to cancel; drag a handle to move. Violet `#6600FF` vertex handles, dashed Forma-green boundary line, faint green fill.
- **Snap priority:** building-corner snap (12 px), building-edge snap, loop-closure snap, then **orthogonal-to-previous-edge** (`§BND-90-DEFAULT-ON`, default ON, 22° lock band; first edge free) so users draw rectilinear plots automatically (`orthoSnap.ts`).
- **Live edge dimension labels** (metres, 1 dp) on placed and in-progress edges (A.21.D9).
- **Frozen-map commit (O.7.2.b):** committing the boundary sets the polygon on `SiteModelStore` but keeps the map rendered (so "Generate with AI?" appears over a live cream plan); teardown happens only at generate-time.
- **Legacy 3D Cesium draw tool** `SiteBoundaryDrawTool.ts` retained as a console fallback (`pryzmStartBoundaryDraw3D()`).

### 4.4 Parcel / site data model (C19)

Contract: `docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md` (**Status: DRAFT**).

- **ParcelBoundarySchema** — `polygon: {x,z}[]` (scene metres) + `edgeClassifications: ('front'|'side'|'rear'|'unclassified')[]`, one per edge; invariant `length === polygon.length`; polygon immutable post-create (C19 §1.4) (`packages/schemas/src/site/Parcel.ts:30`).
- **ParcelSchema** — `boundary`, `setbacks {front,side,rear}`, `maxFAR`, `maxHeight`, `zoning {category, overlays, jurisdictionRef}`, computed `area` (`Parcel.ts:60`).
- **SiteLocation** — `latitude`, `longitude`, `elevationAsl`, `trueNorth` (rad), `crs` (EPSG/Proj4), `basePoint` (LTP-ENU origin), `siteAddress` + `landTitleNumber` (PII per C22).
- **SiteModel** — `{ id, projectId, name, location, parcel, footprint, contextBuildings, climateRef, buildingRef, provenance, schemaVersion }`.
- **SiteModelStore** (L3 reactive wrapper, one per runtime, project-scoped reset): `getSite/getParcelBoundary/getLocation/getFootprint/getContextBuildings`, `set/reset`, `subscribe` (`packages/stores/src/SiteModelStore.ts:1`).
- **Site dispatch** (`apps/editor/src/ui/site/siteDispatch.ts:30`): `resolveSiteContext`, `ensureSite`, `dispatchSiteLocation` (+ `setLtpOriginIfSafe`, C19 §1.3 rebase guarded to when no boundary exists), `dispatchParcelBoundary`, `getCurrentSiteOrigin`.

### 4.5 Boundary → layout flow

1. Draw boundary (2D map) or `createSiteFromRect()`. 2. `dispatchParcelBoundary` stores polygon on `SiteModel.parcel.boundary`. 3. `site.parcel-boundary-set` fires. 4. `ParcelBoundarySceneRenderer` draws the violet ground outline + faint fill on a non-pickable EDITOR_LAYER (`apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts:1`, `§LINELOOP-WEBGPU-FIX`). 5. The apartment/house generator consumes `getParcelBoundary().polygon` (scene-XZ). The console `window.pryzmGenerateApartmentFromScratch()` / rail "🏢 Generate Apartment" trigger this.

### 4.6 Site Inspector

GIS rail "📐 Site Inspector" → `openSiteInspectorPanel(runtime)` (`apps/editor/src/ui/site/SiteInspectorPanel.ts:1`): address + lat/lon, parcel area (m²), boundary vertex count + inline SVG thumbnail, frontage edge count + true-north, live-updating on site events, with "🌦 Climate analysis" and "✏️ Edit boundary" buttons.

### 4.7 GIS rail buttons (exact labels)

`apps/editor/src/ui/tools-panel/panels/GISRailPanel.ts:26` — all wired:

1. "Activate Geospatial" (checkbox) → mount Cesium / activate GIS.
2. "✈ Fly To" → fly to reference location.
3. "📍 Place BIM on Earth" → georeference + place BIM.
4. "✏️ Draw Site Boundary" → open 2D Hektar draw map.
5. "🏢 Generate Apartment" → `generateApartmentFromBoundary(runtime)`.
6. "◉ Site 3D (Forma)" → `pryzmShowFormaView('plan')`.
7. "📐 Site Inspector" → `openSiteInspectorPanel`.
8. "🌦 Climate Analysis" → `openClimatePanel`.
9. "⇔ Translate" / "↻ Rotate" → gizmo mode (0/1).
10. "↺ Reset Georeference" → undo last georeference.

---

## 5. Analytics / analysis (solar, daylight, heat-gain, climate)

### 5.1 Sun-Hours analysis (GPU solar)

Owner: ADR-0074 (`docs/02-decisions/adrs/ADR-0074-gpu-solar-sun-hours-environmental-analysis.md`, **Status: Proposed 2026-06-16**); the P1 slicing is **SHIPPED**.

- **Pure L2 core `@pryzm/solar-analysis`** (THREE-free, deterministic — `packages/solar-analysis/src/index.ts:1`):
  - `generateSunSamples({lat, lng, dayOfYear|dateRange, stepMinutes, daylightOnly})` — deterministic `SunSample[]`, day-then-time ascending; below-horizon dropped by default (`sunSamples.ts:68`). Solstice/equinox helpers: spring 79, summer 172, autumn 265, winter 355.
  - `accumulateSunHours(surfaces, samples, isOccluded, opts)` — for each surface point, accrue `stepHours` (0.25 h default) when sun above horizon **and** `dot(normal, sunDir) > 0` **and** not occluded; per-surface = mean over sample points; building-level AVG/MAX/MIN (`sunHours.ts:49`). Occlusion oracle is injected.
- **Renderer-three CPU pass (SHIPPED P1):** `computeSunHoursOnModel(scene, levelId, opts)` gathers exterior roof/slab/wall meshes by `userData.elementType`, builds a **three-mesh-bvh** occluder, generates a per-triangle world sample grid (0.75 m spacing, nudged off the face), runs a CPU raycast occlusion oracle, and paints a **toggleable per-vertex heatmap** (purple `#6600FF` at 0 h → magenta → orange → yellow at max), saving the original material for non-destructive `clearSunHoursOverlay`. (GPU shadow-map oracle is the P2 perf optimisation — **deferred**.)

#### On-screen Solar / Sun-Hours panel

`apps/editor/src/ui/daylight/SolarSunHoursPanel.ts:135` (CSS prefix `ssh-`, fixed top 88 px / right 20 px, draggable):

| Control | Type | Range | Default |
|---|---|---|---|
| Time of Day | slider | 04:00–22:00 (15-min) | 12:00 |
| Day of Year | slider | 1–365 | 172 (summer solstice) |
| Solstice/Equinox | 4 buttons | Summer ☀ / Winter ❄ / Spring 🌱 / Autumn 🍂 | — |
| Latitude | slider | −66°…66° (0.5°) | resolved site / 51.5° |
| **Exterior Surfaces Only** | checkbox | on/off | **ON** |
| **Exclude Glass / Glazing** | checkbox | on/off | **ON** |

Plus AVG / MAX / MIN result chips ("hours"), a **COMPUTE SUN HOURS** button, a **Clear** button, a colour-ramp legend, and a status line. Open via `window.pryzmOpenSolarPanel()` / close via `window.pryzmCloseSolarPanel()`.

#### Sun-hours console commands

- `window.pryzmComputeSunHours(opts?) → ComputeSunHoursOnModelResult | null` (`apps/editor/src/ui/daylight/sunHoursConsole.ts:183`). Options (`:25`): `dayOfYear`, `season`, `stepMinutes` (15), `sampleSpacing` (0.75 m), `paint` (true), `latDeg`/`lngDeg`, `exteriorOnly`, `excludeGlass`, `centerTimeMinutes` + `timeWindowMinutes` (±60). Logs a **§DIAG-SUN-HOURS** table (per-level summary + per-surface rows).
- `window.pryzmClearSunHours() → number` — restores original materials; logs cleared count (`:170`).

### 5.2 Daylight scoring

- `window.pryzmComputeDaylight() → BuildingDaylightResult | null` (`apps/editor/src/ui/daylight/daylightConsole.ts:234`). A read-only **per-room polygon** analytic (distinct from per-surface sun-hours): assembles `RoomDaylightInput[]` from detected rooms + exterior-wall window openings (matching room edges to wall baselines, extracting aperture offset/width/sill/head), runs `computeBuildingDaylight(inputs, defaultSunSamples(lat))` from `@pryzm/ai-host`, and logs a **§DIAG-DAYLIGHT** table (per-room score, window count, sunlit %, sample count; building mean + brightest/darkest room). The sun-hours feature generalises this from rooms-as-polygons to real surfaces.

### 5.3 Solar heat gain (C21 §10.10)

`packages/solar-analysis/src/roomHeatGain.ts:1` — `accumulateRoomHeatGain(sunHours, rooms, opts)` computes per-room `Q_solar = Σ I_inc · A_g · SHGC_g`. Two tiers: **'absolute-kwh'** when a per-surface irradiance map is injected, else **'relative-index'** (`gainIndex = Σ sunHours·area·SHGC`, comparable but not absolute). `DEFAULT_SHGC = 0.5`. **Defined but not yet wired** into console/UI (P3).

### 5.4 Solar position (NOAA) & RealSunService

- `computeSolarPositionRad(lat, lng, date) → {altitude, azimuth}` (radians) — NOAA low-error approximation (±0.5° this century), a THREE-free byte-for-byte replica of `packages/core-app-model/src/rendering/RealSunService.ts` kept in sync (`packages/solar-analysis/src/solarPosition.ts:23`). `sunDirectionFromAltAz(...)` returns a unit vector toward the sun in ENU (+X East, +Y Up, +Z South). `RealSunService` is the THREE-side source of truth that drives the directional sun light (View Properties Sun Settings + the Forma sun scrubber).

### 5.5 Climate (sun-path / wind / temperature)

- GIS rail "🌦 Climate Analysis" → `openClimatePanel(runtime)` (`apps/editor/src/ui/climate/ClimatePanel.ts`). `ensureSiteClimate(runtime)` loads bundled NOAA normals instantly + upgrades to live/EPW in the background (`apps/editor/src/ui/climate/ensureSiteClimate.ts`, `liveClimateFetch.ts`). The Forma analysis card and the climate panel both read `runtime.climateStore.resolveSite(...)` → `{ monthlyNormals, designTemps, degreeDays, windRose, source }`.

### 5.6 Determinism & governance

All `@pryzm/solar-analysis` functions are pure (no THREE, no RNG, no `Date.now()`) → byte-identical output for the same `(lat, lon, window, step, model-hash, dataset version)`, making runs auditable (C23). Solar ownership is C21 §10 (no new contract forked). When climate is `'fallback-defaults'`, the pass refuses absolute kWh and degrades to geometric-only (honesty rule).

---

## 6. Interop relevant to 3D (glTF / IFC / Revit / georeferencing)

### 6.1 glTF / GLB export (feeds Cesium globe + Forma) — **SHIPPED**

- `exportFragmentsToGLB(scene): Promise<string>` (`packages/file-format/src/export/glb/GLBExporter.ts:42`) — exports the live BIM THREE scene to a GLB blob URL, baking full world-transforms for correct geospatial placement. Public via `packages/file-format/src/index.ts:168` (`exportFragmentsToGLB`, `downloadBlobUrl`, `revokeBlobUrl`).
- Consumed by `renderRealModelOnGlobe` (`CesiumViewport.ts:3716`) and `renderRealModelOnForma` (`:3927`). Call sites: `GISAreaLayout.ts:267` (globe), `:1579` (Forma), plus the export rail. (FORMA.6, v158; depth-test ground clamp v50.)

### 6.2 Georeferenced IFC (IfcProjectedCRS / IfcMapConversion)

- **Read (SHIPPED):** `readIfcProjectedCRS(api, modelId)` scans for `IfcProjectedCRS` (+ paired `IfcMapConversion`), duck-typing web-ifc (`plugins/ifc-import/src/IfcProjectedCRSReader.ts:40`). Record shape: `{ name (e.g. EPSG:27700), geodeticDatum, mapProjection, proj4String, eastings, northings, orthogonalHeight, scale, … }` (`packages/geospatial/src/IfcProjectedCRSRecord.ts:12`). Feeds `GeospatialAdapter` (proj4js): `projectToScene` / `unprojectFromScene` / `checkAndRecenter` (1 km LTP-ENU recentre) (`packages/geospatial/src/GeospatialAdapter.ts:31`).
- **Write (DRAFT):** `SiteModel` input is wired into `plugins/ifc-export/src/hierarchy.ts:59`, but full population of `IfcMapConversion` from `SiteModel` is deferred to the IFC-γ-3 phase (C25 §1.4). Contract: `docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md`.

### 6.3 IFC4X3 export — **SHIPPED (Tier 1)**

- Core: `plugins/ifc-export/src/exporters/IFC4X3Exporter.ts:1` — `FILE_SCHEMA(('IFC4X3'))`; walls export as `IFCWALL` (PredefinedType 'STANDARD'), not deprecated `IFCWALLSTANDARDCASE`.
- Tier-1 exporters with common Psets, all SHIPPED: Wall (`Pset_WallCommon`), Slab/Floor (`Pset_SlabCommon`), Door (`Pset_DoorCommon`), Window (`Pset_WindowCommon`), Column (`Pset_ColumnCommon`), Beam (`Pset_BeamCommon`).
- Spatial hierarchy Project → Building → Storeys is SHIPPED; IfcSite/IfcSpace/IfcZone are **DRAFT** (`space.ts`, `zone.ts` phases IFC-α-2/α-3). CI gates: `check-ifc-validate.ts`, `check-ifc-pset-coverage.ts`, `check-ifc-round-trip.ts`. NFT: 1k elements < 2 s, 10k < 20 s, 100% GlobalIds/Psets preserved.

### 6.4 Revit round-trip (IFC4X3-RV) — IFC4 bridge SHIPPED; RV variant DRAFT

- Strategy (C26, `docs/02-decisions/contracts/C26-REVIT-ROUND-TRIP.md`): IFC4 is the canonical bridge (PRYZM → IFC → Revit's native importer); **no direct .rvt parsing** in the monorepo; an optional external Python adapter (Windows, Revit 2024+) is planned.
- Family map (~12 rows): **6 Tier-1 native editable families** — Basic Wall→`wall`, Floor→`floor/slab`, Door→`door`, Window→`window`, Structural Column→`column`, Structural Framing→`beam`. Roof, Stair, Railing, Curtain Wall, Furniture are Tier 2.
- `IFC4X3-RV` variant exporter (`plugins/ifc-export/src/exporters/revit-variant.ts:1`) adds `Pset_RevitType` / `Pset_RevitInstance`, Workset `IfcGroup`s, and coordinate modes (project-base-point / survey-point / internal-origin) — **DRAFT** (RVT-α-2). Editor wizard: `apps/editor/src/ui/interop/RevitWizardPanel.ts:15`. CI: `check-revit-roundtrip.ts` against 10 reference projects (95% geometric / 90% parameter fidelity).

### 6.5 IFC import → editable elements

- Handler `plugins/ifc-import/src/IFCImportHandler.ts` parses via web-ifc (version-agnostic). **Tier-2 transform-only proxies are the current SHIPPED path** (`converters/tier2-proxy.ts` → `IFCProxyDTO`), covering all element types as read-only proxies; a meta-store side-car preserves GlobalId + Psets across import → edit → export (`plugins/ifc-export/src/meta-store.ts`). **Tier-1 native-editable import** (mapping the 6 families to native PRYZM types) is **DRAFT** (RVT-α-1).

---

## 7. Quick reference table

| Capability | Where it lives (`path`) | How to invoke | Status |
|---|---|---|---|
| WebGPU/WebGL2 editor renderer | `packages/renderer/src/Renderer.ts`, `packages/renderer-three/` | automatic (auto-mode) | SHIPPED |
| Single rAF frame scheduler | `packages/frame-scheduler/src/FrameScheduler.ts` | automatic | SHIPPED |
| Render tiers (Massing/Presentation) | `docs/03-execution/specs/SPEC-RENDER-TIERS-MASSING-AND-PRESENTATION.md` | tier toggle (planned) | DRAFT |
| Visualization engine panel (lighting/camera/post-FX/path-trace) | `apps/editor/src/ui/rendering/VisualizationEnginePanel.ts` | panel UI | SHIPPED |
| Orbit camera / pan / zoom | `packages/renderer/src/CameraController.ts` | mouse | SHIPPED |
| Split-view plan pane (2D edges) | `apps/editor/src/engine/views/SplitViewManager.ts` | view selector | SHIPPED |
| Level/floor visibility (+ instanced) | `packages/visibility/src/waves/w01-level-scope.ts`, `InstancedElementRenderer.ts` | level UI / isolate | SHIPPED |
| GPU picking + selection | `packages/picking/src/gpu-pick.ts`, `packages/input-host/src/SelectionManager.ts` | click | SHIPPED |
| Outline/hover highlight | `packages/renderer-three/src/pipeline/OutlinePass.ts` | automatic on select | SHIPPED |
| Edge projection / view cache | `apps/editor/src/engine/views/EdgeProjectorService.ts`, `packages/core-app-model/src/views/ViewRenderCache.ts` | plan/section views | SHIPPED |
| Instancing (walls/panels) | `packages/core-app-model/src/rendering/InstancedElementRenderer.ts`, `packages/geometry-wall/src/WallInstanceBridge.ts` | automatic | SHIPPED |
| View Properties panel | `apps/editor/src/ui/ViewPropertiesPanel.ts` | panel UI | SHIPPED |
| Section / clipping planes | — | — | NOT BUILT |
| Cesium photoreal globe (Google 3D Tiles) | `apps/editor/src/ui/geospatial/CesiumViewport.ts` | GIS rail "Activate Geospatial" + "3D globe" | SHIPPED |
| Zoom-to-site / cinematic arrival | `CesiumViewport.ts:976` | "Zoom to Site" / location search | SHIPPED |
| Fly-tour (cinematic) | `CesiumViewport.ts:2903` | "Fly tour ▶" / `flyTour()` | SHIPPED |
| BIM GLB on globe (anchored) | `CesiumViewport.ts:3716`, `packages/file-format/.../GLBExporter.ts:42` | "◉ Real" fidelity / `pryzmSetGlobeBuildingFidelity` | SHIPPED |
| Context buildings / roads (OSM) | `contextBuildings.ts`, `contextRoads.ts` | automatic on site | SHIPPED |
| Forma site-3D massing study | `CesiumViewport.ts` (`setFormaMode`), `GISAreaLayout.ts` | rail "◉ Site 3D (Forma)" / `pryzmShowFormaView()` | SHIPPED |
| Forma real-model fidelity | `formaBuildingFidelity.ts`, `CesiumViewport.ts:3927` | `[ Real ][ Massing ]` toggle | SHIPPED |
| Forma analysis controls (sun/wind/heat) | `apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts` | "☀ Analysis" | SHIPPED |
| 2D GIS map (MapLibre + OpenFreeMap) | `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts`, `siteMap2DStyle.ts` | "✏️ Draw Site Boundary" | SHIPPED |
| Geocoding (Nominatim) | `apps/editor/src/ui/site/geocodeAddress.ts`, `siteGeocodeSearchBox.ts` | search box | SHIPPED |
| Boundary draw + ortho-snap | `SiteBoundaryMap2D.ts`, `orthoSnap.ts` | draw on map | SHIPPED |
| Parcel/site schema + store (C19) | `packages/schemas/src/site/Parcel.ts`, `packages/stores/src/SiteModelStore.ts` | — | SHIPPED |
| Parcel boundary scene outline | `apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts` | automatic on commit | SHIPPED |
| Site Inspector | `apps/editor/src/ui/site/SiteInspectorPanel.ts` | "📐 Site Inspector" | SHIPPED |
| Sun-hours panel | `apps/editor/src/ui/daylight/SolarSunHoursPanel.ts` | `pryzmOpenSolarPanel()` | SHIPPED |
| Sun-hours compute (BVH heatmap) | `packages/renderer-three/.../computeSunHoursOnModel`, `packages/solar-analysis/` | `pryzmComputeSunHours()` / `pryzmClearSunHours()` | SHIPPED |
| Daylight scoring (per-room) | `apps/editor/src/ui/daylight/daylightConsole.ts` | `pryzmComputeDaylight()` | SHIPPED |
| Solar heat gain (per-room) | `packages/solar-analysis/src/roomHeatGain.ts` | (not yet wired) | DEFINED |
| Solar position (NOAA) | `packages/solar-analysis/src/solarPosition.ts`, `RealSunService.ts` | automatic | SHIPPED |
| Climate panel (sun-path/wind/temp) | `apps/editor/src/ui/climate/ClimatePanel.ts`, `ensureSiteClimate.ts` | "🌦 Climate Analysis" | SHIPPED |
| glTF/GLB export | `packages/file-format/src/export/glb/GLBExporter.ts` | export rail / Forma | SHIPPED |
| IfcProjectedCRS read | `plugins/ifc-import/src/IfcProjectedCRSReader.ts` | IFC import | SHIPPED |
| IfcMapConversion write | `plugins/ifc-export/src/hierarchy.ts` | IFC export | DRAFT |
| IFC4X3 export (Tier 1) | `plugins/ifc-export/src/exporters/IFC4X3Exporter.ts` | export | SHIPPED |
| IFC4X3-RV Revit variant | `plugins/ifc-export/src/exporters/revit-variant.ts` | Revit wizard | DRAFT |
| IFC import (Tier-2 proxy) | `plugins/ifc-import/src/converters/tier2-proxy.ts` | import | SHIPPED |

---

## 8. Gaps / not-yet-built

- **Interactive section box / clipping planes** in the 3D editor — not implemented (§1.11). `cutPlaneHeight` exists only as a view-definition property.
- **Render-tier UI** (Massing/Presentation toggle), studio presentation environment, white-model material presets, and entourage (people/trees) — PLANNED (A.24.x, SPEC DRAFT).
- **GPU shadow-map occlusion oracle** for sun-hours — deferred; current pass is CPU BVH raycast (P2).
- **Glass partial-transmittance** in sun-hours and **absolute-kWh irradiance** (real W/m² from EPW) — deferred; current sun-hours is geometric.
- **Per-room solar heat-gain** (`accumulateRoomHeatGain`) — defined but not wired to console/UI.
- **Georeferenced IFC export** (`IfcMapConversion` write from SiteModel) — DRAFT (IFC-γ-3).
- **IfcSite / IfcSpace / IfcZone export** — DRAFT (IFC-α-2/α-3); only Project→Building→Storey ships today.
- **IFC4X3-RV Revit variant** + **Tier-1 native-editable IFC import** — DRAFT; current import yields Tier-2 transform-only proxies.
- **Forma 2D-basemap Forma palette** (FORMA.1) — stub; the 2D map currently uses the Hektar/OpenFreeMap style, not the dedicated Forma palette.
- **Live measured climate / EPW upgrade** runs in the background; bundled NOAA normals are the default. When climate is fallback-defaults, analytics intentionally refuse absolute figures.
