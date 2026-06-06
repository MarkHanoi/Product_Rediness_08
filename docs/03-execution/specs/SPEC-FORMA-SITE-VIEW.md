# SPEC — Forma-Style Site View (2D MapLibre ⇄ 3D Cesium, georeferenced)

**Status:** DRAFT (2026-06-04) · **Owner:** PRYZM core · **Tracker:** `MAP-FORMA-AESTHETIC` → sub-phases FORMA.1–FORMA.5 (master-execution-tracker)
**Governs:** the visual aesthetic + the 2D⇄3D georeferenced bridge for PRYZM's **site/map views** — replicating Autodesk Forma's massing-study look, and rendering a building authored from the drawn boundary at its exact real-world location in 3D.
**Scope discipline:** the Cesium/Map layer is a **read + render CONSUMER** of PRYZM's existing site substrate. This SPEC does **NOT** change polygon drawing, wall authoring, projection math, or the command bus. It changes only the *materials, lighting, background, basemap palette, camera, and entity placement* of the two site viewers.

> Founder directive (2026-06-04): "DON'T SIMPLY DO IT — ANALYSE IT, REVIEW, AUDIT THE PROCESS, THEN DOCUMENT IT IN THE MASTER-EXECUTION, THEN IMPLEMENT IT." This SPEC is the audit + design; no feature code or renderer changes ship with it. Two coupled outcomes: **(A)** a Forma-styled 2D plan view (MapLibre) for site-scope/boundary definition, and **(B)** a Forma-styled 3D Cesium geo view for site/climate/sun/wind/shadow analysis.

---

## §1 — Audit summary (exists vs gaps)

### §1.1 — What ALREADY exists

| Capability | Where | Notes |
|---|---|---|
| **Cesium viewer setup** | `apps/editor/src/ui/geospatial/CesiumViewport.ts:82` (`new Cesium.Viewer`) | `scene3DOnly`, all default widgets off. Keyless ESRI World Imagery base (`:123-156`), optional Google Photorealistic 3D Tiles (`:166-188`), keyboard-driven `TransformGizmo`, GLB load via `loadBimGltf` (`:526`). |
| **2D MapLibre boundary-draw map** | `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts` | Hand-rolled keyless polygon draw (click/dblclick/Enter/Esc + vertex drag + footprint snap `:394-484`). Violet `#6600FF` ring/fill/vertex layers. Map⇄Satellite toggle (`:578`). |
| **2D basemap palette** | `apps/editor/src/ui/geospatial/siteMap2DStyle.ts` | "Hektar" cream/shadow vector style over OpenFreeMap (`HEKTAR_PALETTE` `:41`); fake building drop-shadow (`:205`); optional `fill-extrusion` (`:218`); keyless ESRI satellite raster style (`buildSatelliteStyle` `:337`). |
| **Parcel boundary in 3D scene** | `apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts` | Violet `THREE.Line` loop + faint `ShapeGeometry` fill on `EDITOR_LAYER`, non-pickable, project-scoped. Reads `siteModelStore.getParcelBoundary()` (already scene-XZ). **This is the Three.js authoring scene, NOT Cesium.** |
| **Lat/lon → scene-XZ projection** | `apps/editor/src/ui/site/boundaryProjection.ts:53` (`latLonToSceneXZ`) | Local equirectangular about the site origin; `−North → +Z` sign matches LTP-ENU. Edge classification (`classifyEdges :92`). |
| **Site dispatch + events** | `apps/editor/src/ui/site/siteDispatch.ts` | `dispatchParcelBoundary` → `site.parcel-boundary-set` (`:166`); `dispatchSiteLocation` → `site.location-changed` (`:139`). C19 store via `@pryzm/stores`. |
| **LTP-ENU coordinate substrate** | `packages/geospatial/src/LTPENURebase.ts` | proj4 UTM `projectToScene(lat,lon,elev)` → `{x:East, y:Up, z:−North}` (`:72`); `recenter`/`setOrigin`/`distanceFromOriginMetres`. **Authoritative coordinate frame.** |
| **Cesium ⇄ Three ENU bridge** | `packages/renderer-three/src/geospatial/CesiumThreeBridge.ts` | `eastNorthUpToFixedFrame` anchor + camera sync (`:62`, `:110`). Wired in `GISAreaLayout.ts:154`. |
| **Sun / climate** | `packages/core-app-model/src/rendering/RealSunService.ts` (NOAA solar pos), `packages/climate-host/src/solarPath.ts`, `packages/stores/src/ClimateStore.ts` (+`climateRefreshNoaa`, `climateIngestEpw`, `climateSolarSample`), `apps/editor/src/ui/climate/ClimatePanel.ts` | NOAA normals + EPW ingestion + solar sampling already in the substrate. |
| **View hosting / toggle plumbing** | `apps/editor/src/ui/layout/GISAreaLayout.ts` | `cesiumViewport.setVisible()` (`:231,262`); 2D map mounted at z-index 40 above Cesium (`:80`); geocode `flyTo` + `suppressNextSiteLocationFly` handshake. |

**Coordinate frame answer (founder's question):** PRYZM authors all scene geometry in a **local ENU metric frame** — `x = East`, `y = Up`, `z = −North`, metres, relative to the **site origin (lat0, lon0)**. The canonical projector is `LTPENURebase.projectToScene` (proj4 UTM, C12/C19 §1.3). The boundary-draw surface currently uses a lightweight **local-equirectangular approximation** (`boundaryProjection.latLonToSceneXZ`) that **shares the exact same axis convention** (`z = −North`) so both land in one frame. C19 §1.3 *requires* `site.updateLocation` to call `LTPENURebase.setOrigin(lat,lon,elev)` synchronously; `siteDispatch.dispatchSiteLocation:118-122` notes this rebase wiring is **not yet hooked** at the draw surface (the documented follow-up). **The Forma bridge MUST consume this frame, not invent a parallel one.**

### §1.2 — Why Cesium "renders poorly" today (root causes)

1. **Photorealistic-globe aesthetic, not a massing study.** `CesiumViewport.ts:166-218` deliberately layers ESRI satellite + Google 3D-tiles + `globe.enableLighting = true` + `skyAtmosphere.show = true` + ground atmosphere. That is a *photographic* look; Forma's massing study is a **flat, low-saturation, abstract** look. The two are at cross purposes — the satellite/atmosphere path is exactly what reads as "busy / washed-out."
2. **Token-degraded fallback.** When `VITE_CESIUM_TOKEN` is unset (`:9-16`) OR the Google key is missing, the photorealistic tiles silently fail (`:186`) and the globe falls back to a faint near-white ellipsoid (the founder's "really light" complaint — see the inline comment at `:104-111`). The colour-grading patch (`:147-151`) treats the symptom, not the cause.
3. **No silhouette / outline / AO / shadow post-processing.** There is **no** `createSilhouetteStage`, **no** `createAmbientOcclusionStage`, **no** `shadowMap` configuration, **no** flat ground material. Authored buildings (when placed via `loadBimGltf`) render as raw lit glTF over photoreal terrain — no Forma "white volume + black outline."
4. **No authored-massing path into Cesium from the boundary.** `loadBimGltf` places a **single exported GLB** at a lat/lon; there is **no** path that reads the drawn polygon + authored walls and re-emits them as Cesium `PolygonGraphics` extrusions at the georeferenced origin. So the "building appears at the exact real-world location in 3D" outcome is **not** wired.
5. **`depthTestAgainstTerrain = false`** (`:97`) + no terrain clamp — placed geometry can float/sink relative to ground.

### §1.3 — GAPS (what must be built)

- **G1** Forma 2D basemap variant of `siteMap2DStyle.ts` (minimal vector, no POI/satellite, dashed-green boundary, height labels).
- **G2** Forma Cesium material/lighting/background/shadow/AO/silhouette config (a *mode*, distinct from the photoreal path).
- **G3** A **3D massing view**: read polygon + authored geometry → render as white-volume `PolygonGraphics` extrusions with black silhouette, on flat warm-grey ground, in the ENU frame at the boundary centroid.
- **G4** A **[Plan View] [3D View] toggle** with smooth `flyTo` camera handoff.
- **G5** **Coordinate bridge** consuming the existing ENU substrate + terrain clamp + live-update on boundary edit.
- **G6** **Analysis hooks** feeding the Cesium 3D view from `RealSunService`/NOAA/`climate-host` (sun/shadow/wind/climate).

---

## §2 — Forma 3D massing aesthetic spec (Cesium)

A new **Forma render mode** for `CesiumViewport` (a config object applied at mount or via `setFormaMode(true)`), distinct from the existing photoreal path. All values below are the design targets.

**Proposed buildings (the authored massing):**
- Volume fill **`#FFFFFF`** (pure white), unlit-flat-ish.
- **Black silhouette outline** via `Cesium.PostProcessStageLibrary.createSilhouetteStage()` — colour **`#1C1C1C`**, edge width **1.5 px**, applied to the proposed-building primitives **only** (use the stage's `selected` array).

**Context buildings (OSM/photogrammetry surroundings, if shown):**
- Fill **`#E8E5DF`** at **0.92** opacity. No silhouette (keeps the focus on the proposed massing).

**Lighting:**
- One **directional light** at a **~10am equinox** sun angle (warm key).
- **Ambient ≈ 0.55** fill so shaded faces never crush to black.
- **`scene.globe.enableLighting = false`** (Forma ground is flat-lit, not sun-shaded terrain — the OPPOSITE of today's `:209`).

**Shadows:**
- `scene.shadowMap.enabled = true`, `scene.shadowMap.size = 4096`, `scene.shadowMap.softShadows = true`.
- Shadow tint **`rgba(20,20,20,0.30)`** (soft, not black).

**Ground & water (flat, abstract):**
- Flat **warm-grey ground `#D9D5CE`**; roads **`#E4E1DB`**; water **`#B8D4E0`**.
- A **flat-AO ground polygon** rendered directly under each footprint (subtle contact-shadow disc/rect) so volumes read as seated.

**Sky / background (kill the photo look):**
- Disable **skybox, sky atmosphere, ground atmosphere, sun, moon** (`scene.skyBox.show=false`, `scene.skyAtmosphere.show=false`, `scene.globe.showGroundAtmosphere=false`, `scene.sun.show=false`, `scene.moon.show=false`).
- `scene.backgroundColor = Cesium.Color.fromCssColorString('#E8E8E6')`.

**Ambient occlusion:**
- `Cesium.PostProcessStageLibrary.createAmbientOcclusionStage()`, **intensity ≈ 2.5** (subtle crease darkening between volumes).

**Special elements:**
- **Courtyards / voids** extruded as a **teal `#1B4332`** inset (reads as planted court).
- **Parcel boundary:** a **0.5 m extruded wall** + **dashed green `#2D6A4F`** top line + **faint fill `rgba(45,106,79,0.08)`** (the Forma site-boundary convention; distinct from the in-scene violet outline used in the Three.js authoring scene).

> Constraint: silhouette + AO are **post-process stages** — they require `scene.postProcessStages` and a WebGL context that supports them; the Forma mode must feature-detect and degrade to "no silhouette/AO, keep flat materials + shadows" rather than throwing (mirror the defensive try/catch pattern already in `CesiumViewport.ts`).

---

## §3 — Forma 2D basemap spec (MapLibre)

A new **`buildFormaMap2DStyle()`** alongside `buildSiteMap2DStyle` in `siteMap2DStyle.ts` (PURE, no maplibre import — same pattern). Minimal vector palette:

| Element | Colour |
|---|---|
| Roads | **`#D9D6CF`** |
| Water | **`#C8DCE8`** |
| Land / page | **`#F0EDE8`** |
| Building fill | near-white (reuse `HEKTAR_PALETTE.buildingFill`, lighter shadow) |

- **No POI symbols, no satellite layer** (Forma 2D is deliberately abstract; the existing Map⇄Satellite toggle remains a *separate* user choice, not part of Forma 2D).
- **Boundary:** dashed **green `#2D6A4F`** line (replace the violet draw ring once *committed* — keep violet as the *in-progress* draw affordance for visibility, switch to dashed-green on commit, or expose a `boundaryColor` option). Use `line-dasharray`.
- **Height labels:** symbol layer over the building source-layer showing `render_height`/`height` (m) at high zoom.

Add a Forma palette block to `siteMap2DStyle.ts` (`FORMA_PALETTE`) as the single source of truth, mirroring `HEKTAR_PALETTE`.

---

## §4 — Coordinate bridge (READ + RENDER consumer only)

**Non-negotiable:** reuse PRYZM's existing ENU/LTP substrate. Do **not** add a second projector or touch `boundaryProjection.ts` / `LTPENURebase.ts` math.

**Inputs (read-only):**
- Drawn polygon + origin: `runtime.siteModelStore.getParcelBoundary()` (scene-XZ metres) and the site location (`getLocation()` → lat0/lon0). Events: `site.parcel-boundary-set`, `site.location-changed`, `apartment.layout-executed`.
- Authored massing: the Three.js scene's wall/footprint geometry (or the exported GLB already produced for `loadBimGltf`).

**Placement pipeline (in Cesium):**
1. **Origin** = boundary centroid. Compute via `turf.centroid` on the lat/lon ring (or unproject the scene-XZ centroid back through `LTPENURebase.unprojectFromScene` — preferred, since it reuses the authoritative frame and avoids a second turf dependency at this layer; turf is the documented fallback when only the lat/lon ring is available).
2. **ENU frame** = `Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian)` at that origin (the SAME call already used in `CesiumThreeBridge.ts:62` and `CesiumViewport.transformModel:491`). Scene-XZ `{x,z}` maps to ENU East/`−North` consistent with `LTPENURebase` (`z = −North`).
3. **Terrain clamp** = `Cesium.sampleTerrainMostDetailed(terrainProvider, [origin])` to seat the origin on ground; offset all extrusions from that height.
4. **Render** authored walls/footprints as `Cesium.PolygonGraphics` extrusions (per-room/per-wall), OR place the exported glTF via `modelMatrix = enuFrame` (reuse `loadBimGltf`'s `eastNorthUpToFixedFrame` path `:558`). White-volume + silhouette per §2.
5. **2D⇄3D camera handoff:** on entering 3D, `camera.flyTo` to a **NW oblique** — heading **325°**, pitch **−45°**, distance **∝ √areaM2** (frame the whole plot). Duration ~1.2s.
6. **Live update:** on `site.parcel-boundary-set` / `apartment.layout-executed`, **clear + re-place** the Cesium entities; do **NOT** re-fly the camera (mirror the `suppressNextSiteLocationFly` discipline already in `CesiumViewport.ts:478`).

**Reconciliation with the existing system (cite):**
- The authoritative frame is `LTPENURebase` (`packages/geospatial/src/LTPENURebase.ts:72`), `z = −North`. The bridge consumes it; it MUST NOT re-derive a UTM zone.
- C19 §1.3 requires `LTPENURebase.setOrigin` on location change — currently NOT wired at the draw surface (`siteDispatch.ts:118-122`). **The Forma bridge does not fix this, but its correctness depends on it.** Track as a precondition (see §7 FORMA.4 dependency) and reference the existing C19/§1.3 follow-up rather than duplicating it.
- The existing `CesiumThreeBridge` already does the ENU anchor + camera sync; FORMA reuses its `eastNorthUpToFixedFrame` anchoring approach rather than re-implementing it.

---

## §5 — Toggle UI

- A floating **[Plan View] [3D View]** segmented pair (on-brand white + `#6600FF`, mirror the existing Map⇄Satellite segmented control in `SiteBoundaryMap2D.ts:188-226`).
- **Plan View** → show the MapLibre Forma 2D surface (`setVisible` on the 2D overlay), hide Cesium.
- **3D View** → `cesiumViewport.setVisible(true)` + `flyTo` per §4.5 (smooth **1.2s**).
- **Layers persist** across toggles — the drawn boundary + authored massing stay placed in both views; only camera/visibility change. Reuse `GISAreaLayout`'s existing `setVisible` plumbing (`:231,262`); add the toggle control + the handoff `flyTo`.

---

## §6 — Analysis hooks (3D view feeds site/climate/sun/wind/shadow)

The Cesium 3D Forma view is the natural surface for environmental analysis. Wire (read-only consumers of existing substrate):

- **Sun / shadow:** drive the §2 directional light from `RealSunService` (NOAA solar position, `packages/core-app-model/src/rendering/RealSunService.ts`) given the site lat/lon + a time-of-day/season scrubber; Cesium `shadowMap` casts the massing's shadows. (`climate-host/solarPath.ts` provides the solar path for an analytic sun-path diagram overlay.)
- **Climate:** `ClimateStore` (`packages/stores/src/ClimateStore.ts`) + `climateRefreshNoaa` / `climateIngestEpw` / `climateSolarSample` already hold NOAA normals + EPW. Surface temperature/insolation summaries in a Forma-style side card (reuse `ClimatePanel.ts`).
- **Wind:** wind-rose data exists (`packages/schemas/src/climate/windRose.ts`); render a Cesium ground overlay / billboard wind-rose at the site origin (consumer only — no new wind model).
- **Shadow study:** an hourly sweep driving the directional light + capturing shadow extents (cumulative shadow footprint) — a thin orchestration over the sun hook above.

All hooks are **read-only** on the climate/sun substrate; FORMA adds the Cesium-side visualisation, not new analysis math.

### §6.1 — A.21.D24: 3D climate-analysis overlays on the Forma view (2026-06-06)

The founder asked for "3D graphs on Forma about heat, sun, wind, warm, circulation." A.21.D24 ships the **tractable, real** ones as toggleable Cesium analysis layers over the existing Forma site view (white + `#6600FF` chrome), driven entirely by the EXISTING climate + solar substrate — **no new engine, no new deps, rendering/data-wiring only (C04)**.

- **3D sun-path arc (SHIPPED).** The sun's positions across the day are drawn as 3D dome polylines over the site for the summer solstice / equinox / winter solstice (colours warm-gold / `#6600FF` / cool-blue), with whole-hour markers (`6h … 18h`) on the summer arc. Data: the PURE `sunArcEnuPoints()` / `sunArcHourMarkers()` generators (`apps/editor/src/ui/climate/climateOverlayGeometry.ts`), which project the tested `solarSample` altitude/azimuth onto a dome of radius ∝ √plot-area in the site's local **ENU** frame. Placed with the SAME single `eastNorthUpToFixedFrame` anchor the massing uses (no parallel projector — §8.3). Needs NO climate dataset (sun is geometry from lat/lon).
- **3D wind streaks (SHIPPED).** One radial streak per compass sector, length + width ∝ that sector's wind-rose frequency, pointing **FROM** the prevailing direction, coloured by the dominant speed band (the SAME 6-shade `#6600FF` palette as the 2D rose). Data: the existing `buildWindRose` aggregate → `windRoseBars()` → the PURE `windStreakSegments()` generator; rendered as Cesium `PolylineArrowMaterialProperty` arrows. Needs the ingested `ClimateDataset`.
- **Heat tint (SHIPPED, coarse).** A translucent ground disc tinted warm↔cool by the **annual mean temperature** from the monthly normals (`heatTintColorHex()`). This is a deliberately COARSE comfort cue, NOT a microclimate simulation.
- **Circulation overlay (FOLLOW-UP, not faked).** Projecting the building-graph circulation edges onto the site is tractable but needs a graph→site projection that doesn't exist yet on this surface; deferred rather than faked. A true comfort/insolation/CFD heat **simulation** (per-surface insolation hours, wind-shadow) is a larger follow-up requiring new sim data.

**Wiring.** `CesiumViewport` exposes `setSunPathOverlay/​setWindOverlay/​setHeatOverlay(on)` + `setClimateOverlayDataset(ds)`; each layer's entities are tracked separately, cleared idempotently, refreshed after a massing re-place / terrain clamp, and dropped on dispose. `FormaSiteAnalysisControls` adds a "3D site analysis" toggle-chip block and feeds the ClimateStore dataset to the viewport on every climate/site change. All methods are fully guarded (missing viewer / origin / dataset → quiet no-op). Pure generators are unit-tested (`apps/editor/__tests__/climateOverlayGeometry.test.ts`).

---

## §7 — Phasing

| Phase | Deliverable | Touches | Depends on | Risk |
|---|---|---|---|---|
| **FORMA.1** | Forma 2D basemap (`buildFormaMap2DStyle` + `FORMA_PALETTE`; dashed-green boundary; height labels; no POI/satellite). | `siteMap2DStyle.ts` (+ `SiteBoundaryMap2D.ts` to select the style) | — (pure style, lowest risk) | **Low.** Pure JSON style; OpenFreeMap source-layers already proven. |
| **FORMA.2** | Cesium Forma render mode (white/`#E8E5DF` materials, dir light + ambient 0.55, `enableLighting=false`, soft shadows 4096, flat ground `#D9D5CE`, disabled skybox/atmosphere/sun/moon, `backgroundColor #E8E8E6`, silhouette `#1C1C1C`, AO 2.5). Feature-detect post-process; degrade gracefully. | `CesiumViewport.ts` (add `setFormaMode`/config; do NOT delete the photoreal path) | FORMA.1 (palette parity) | **Medium.** Post-process stage availability varies by GPU/context; silhouette needs a `selected` primitive set. Keep photoreal path intact. |
| **FORMA.3** | 3D massing view + [Plan View][3D View] toggle + NW oblique camera handoff (heading 325°, pitch −45°, dist ∝ √area, 1.2s flyTo). Render authored footprints as white `PolygonGraphics` extrusions w/ silhouette; courtyard teal `#1B4332`; boundary 0.5 m extruded wall + dashed green. | `GISAreaLayout.ts` (toggle + handoff), `CesiumViewport.ts` (entity placement API), `ParcelBoundarySceneRenderer.ts` (read its polygon source pattern — do NOT alter the Three scene) | FORMA.2 | **Medium.** Mapping scene-XZ rooms → Cesium polygons must respect winding + the `z=−North` sign. |
| **FORMA.4** | Coordinate bridge: centroid origin + `eastNorthUpToFixedFrame` + `sampleTerrainMostDetailed` clamp + live clear/re-place on `site.parcel-boundary-set` / `apartment.layout-executed` (no re-fly). | `CesiumViewport.ts`, new bridge helper (consumer of `siteModelStore` + `LTPENURebase`) | FORMA.3; **precondition:** C19 §1.3 `LTPENURebase.setOrigin` wiring at the draw surface (`siteDispatch.ts:118-122` follow-up) | **Medium-High.** Correct real-world placement depends on the origin rebase actually being set; terrain async timing; turf vs LTP centroid choice. |
| **FORMA.5** | Analysis hooks: directional light ← `RealSunService` + time/season scrubber; shadow study sweep; climate side-card (`ClimateStore`/`ClimatePanel`); wind-rose overlay (`windRose.ts`). | `CesiumViewport.ts`, `ClimatePanel.ts`, new sun/shadow controller | FORMA.2 (shadows) + FORMA.4 (georef origin for solar pos) | **Medium.** Read-only over existing substrate; main risk is solar-azimuth ↔ Cesium light-direction mapping correctness. |

---

## §8 — Explicit NON-GOALS

1. **Do NOT re-implement polygon drawing.** The MapLibre draw UX in `SiteBoundaryMap2D.ts` (click/dblclick/Enter/Esc, vertex drag, footprint snap, commit) is unchanged. FORMA only restyles the basemap + boundary rendering.
2. **Do NOT re-implement wall / massing authoring.** Walls/rooms are authored by the existing command pipeline (C11/C16) in the Three.js scene. FORMA **reads** the authored geometry and **renders a Cesium representation**; it never mutates element stores or dispatches creation commands.
3. **Do NOT add a parallel coordinate system.** The ENU/LTP frame (`LTPENURebase`, `z=−North`) and `boundaryProjection.latLonToSceneXZ` are the single source of truth. FORMA consumes them via `eastNorthUpToFixedFrame` at the boundary centroid; it does not re-derive UTM zones or duplicate the projection.
4. **The Cesium layer is a read + render CONSUMER.** Its inputs are `siteModelStore`, the site events, and the authored scene/GLB. Its outputs are pixels (entities, materials, camera). No write-back into PRYZM domain state.
5. **Do NOT delete the existing photoreal Cesium path.** Forma mode is an additive *mode*; satellite/photogrammetry remain available for users who want a photographic context view.

---

## §9 — Contract / governance notes

- Aesthetic + bridge are **rendering concerns** governed by C04 (rendering/scheduling) and the C12/C19 geospatial substrate. No schema change (P5 untouched), no new mutation path (P6 untouched), single-THREE owner (P2) untouched — Cesium primitives are not THREE.
- The C19 §1.3 `LTPENURebase.setOrigin`-at-draw-surface follow-up is a **named precondition** for FORMA.4 real-world accuracy; this SPEC references it, it does not own it.
- Brand: white + `#6600FF` for PRYZM UI chrome (toggles); the **Forma site palette** (`#1C1C1C` outline, `#2D6A4F` boundary, `#D9D5CE` ground, etc.) is the *analysis-canvas* palette, deliberately distinct from PRYZM chrome — documented here as the single source of truth (`FORMA_PALETTE`).

## §10 — A.21.D-FORMA: clean pastel massing + z-fighting fix (2026-06-05)

Founder feedback (with an Autodesk Forma reference image): the PRYZM Forma view
must be "much more refined — clear shapes, no glitching graphics, robust, clean,
nice colours". Note PRYZM's "Site 3D (Forma)" is *our own Cesium renderer* styled
after Forma; the in-product Autodesk-Forma advice (assign-use-type, export-to-
Blender) does not apply — the look is produced by `CesiumViewport`.

### Root causes of the "glitching / messy" look
1. **Per-wall slivers.** `renderFormaMassing` drew *one white extrusion per
   authored wall* — N thin rectangles (each = baseLine widened to thickness)
   that overlap at every corner. Their coplanar top faces z-fight, and the result
   reads as a jumble of slabs, not a solid block. (Log: `13 wall volume(s)`.)
2. **Coplanar bottom faces.** Every extrusion sat at `height: baseHeight` with the
   flat ground plane at the same height (esp. when `sampleTerrainMostDetailed`
   degrades → `baseHeight = 0` = ellipsoid surface) → classic flat-ground z-fight.
3. **All white, no use-colour** — the reference is pastel use-coded.

### Fixes (CesiumViewport.ts)
- **One solid mass from the footprint.** Extrude a SINGLE polygon from the building
  footprint (the drawn boundary ≈ the apartment outline) instead of per-wall;
  `closeTop/closeBottom`. Per-wall extrusion remains a fallback when no footprint
  polygon exists. → clean articulated block, no corner z-fight.
- **Buried bases (`FORMA_BASE_SINK_M = 0.6`).** Both the proposed mass and the OSM
  context buildings are seated 0.6 m BELOW the sampled ground; the bottom face is
  buried and can never be coplanar with the ground plane. Visible top/sides
  unchanged. Eliminates the ground flicker even on the degraded-terrain path.
- **Pastel use-colours (`FORMA_USE_COLOURS`).** residential `#F0E4A8` (soft yellow),
  amenity `#F2C58C`, podium `#C7DEA8`, public `#E2C2E8` — matching the reference.
  The single apartment/casa mass is `residential`. Outline softened to `#3A3A3A`
  (was pure black) so masses don't read as harsh wireframe; context outline a
  lighter `#9A958C`.
- Mass height = the tallest authored wall (fallback 3 m).

Still open (deferred): per-mass use-classification from the BIM model (mixed-use
buildings get multiple coloured masses), and the first-activation Cesium-vs-2D
timing (a node may show only the 2D plan on the very first globe click).
