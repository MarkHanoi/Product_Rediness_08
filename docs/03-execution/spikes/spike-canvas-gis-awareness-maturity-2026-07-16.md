# SPIKE — PRYZM Canvas (Three.js) GIS-awareness maturity + hybrid-architecture review

> **Stamp**: 2026-07-16 · **Status**: SPIKE (research/strategy — READ-ONLY, NO runtime code changed)
> **Trigger**: Founder architecture review (L-357) — *"Today Cesium = GIS layer, Canvas = modelling layer. Should PRYZM CANVAS (Three.js) itself become GIS-AWARE instead of relying solely on Cesium? Rate maturity 0–5; feasibility of native Three.js GIS; coordinate-system authority; terrain; context-data stack; rendering architecture (dual vs single vs hybrid); phased roadmap; final assessment."*
> **This is the ARCHITECTURAL PARENT of the L-355 Context-Engine question**, and the umbrella for the L-353 (Gaussian-splatting reality capture) + L-356 (Cesium-globe hardening) cluster.
> **Governing / related**: **P2** single-THREE-owner (STR-04) is CENTRAL · [C04](../../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) render/scheduling · [C10](../../02-decisions/contracts/C10-PERFORMANCE-BUDGETS.md) perf + heavy-scene budgets · [C12](../../02-decisions/contracts/C12-GEOSPATIAL.md) coordinate substrate · [C13](../../02-decisions/contracts/C13-PROJECT-ISOLATION.md) isolation · [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) Site/parcel · [C55](../../02-decisions/contracts/C55-GEODATA-ANALYTICAL-LAYERS.md) + [ADR-0065](../../02-decisions/adrs/ADR-0065-geodata-analytical-layers-pluggable-provider.md) pluggable geodata provider.
> **Companion docs**: [SPEC-FORMA-SITE-VIEW](../specs/SPEC-FORMA-SITE-VIEW.md) · [SPEC-GEODATA-ANALYTICAL-LAYERS](../specs/SPEC-GEODATA-ANALYTICAL-LAYERS.md) · [`pryzm-3d-geospatial-capabilities.md`](../../04-reference/pryzm-3d-geospatial-capabilities.md) · sibling spikes [`spike-gaussian-splatting-photoreal-3d.md`](./spike-gaussian-splatting-photoreal-3d.md), [`analysis-cesium-globe-stuck.md`](./analysis-cesium-globe-stuck.md).
> **Cluster**: L-353 (splatting) ↔ **L-355** (Context-Engine perf + strategy) ↔ **L-356** (Cesium hardening) ↔ **L-357** (this — the parent). All four name the same **C-CONTEXT-ENGINE coverage gap**: *no contract governs a provider-agnostic contextual-GIS engine, its fidelity tiers, or PRYZM's GIS-maturity target / coordinate-authority.*

---

## §0 — TL;DR (the founder's questions, answered first)

1. **Maturity: Level 1.5 / 5** — bifurcated. PRYZM is a solid **Level 1 (georeferenced-in-Cesium)** on the *rendering* axis and a genuine **Level 2 (GIS-aware modelling)** on the *coordinate/data-model* axis (LTP-ENU authority, C19 Site/parcel, IfcProjectedCRS read), but **Level 0 on native-Three GIS rendering**: the Three.js canvas renders **zero** streamed GIS data. All terrain, 3D-Tiles, OSM context and photoreal imagery live exclusively inside **Cesium's own separate WebGL context**. Net honest rating: **1.5**.

2. **Can native Three.js do GIS without Cesium? — Yes, technically, for every format the founder listed** (DEM/DTM/DSM, terrain mesh, 3D-Tiles incl. Google Photoreal, vector tiles, GeoJSON, glTF, CityJSON, point-clouds, orthophotos), using mature libraries (NASA-AMMOS `3d-tiles-renderer`, `loaders.gl`, `geotiff.js`, MARTINI/Delatin, `proj4` — already a dep). **But it is a large build**, and PRYZM does **not** have to choose "all Three" — see §6.

3. **Recommendation: HYBRID, not dual-forever and not rip-out-Cesium.** Keep Cesium as the **globe-scale navigation + coordinate/terrain-sampling authority**; build a provider-agnostic **Context Engine that renders streamed *local* context (terrain, orthophoto drape, LOD2 buildings, roads, vegetation) INSIDE `renderer-three`** through the existing committer/overlay seams (P2-clean). PRYZM keeps operating in a **local tangent plane (ENU)** with a **stored global georef** — which is already exactly what `LTPENURebase` does. This is the direction the L-357 audit row itself anticipated.

4. **Easiest high-value win: cache/incrementalise the 70 MB full-scene BIM→GLB export** that runs on every Forma/globe activation (shared L-355/L-356 root cause). A `computeBuildingSignature` cache already exists but is **invalidated on every globe↔Forma round-trip**, forcing a fresh whole-scene export. Fixing the cache-invalidation (and/or a worker/diff export) is a days-scale change that removes the single biggest felt cost on the current GIS surface — with **zero** dependence on the larger Context-Engine build.

---

## §1 — Current maturity (Level 0–5, with code evidence)

**Founder's scale**: 0 local · 1 georef-in-Cesium · 2 GIS-aware modelling · 3 streaming-GIS-in-Three.js · 4 digital-twin · 5 city-scale.

**Verdict: Level 1.5** — and the honest story is that maturity is *split across two axes*:

| Axis | Level | Evidence |
|---|---|---|
| **Coordinate / data model** | **~2 (GIS-aware modelling)** | Authoritative **LTP-ENU** frame `x=East, y=Up, z=−North`, proj4-UTM, 1 km auto-recenter (`packages/geospatial/src/LTPENURebase.ts:72`, `:119`); `GeospatialAdapter` façade `projectToScene/unprojectFromScene/checkAndRecenter` (`packages/geospatial/src/GeospatialAdapter.ts:31`); C19 Site/Parcel model with `SiteLocation{lat,lon,elevationAsl,trueNorth,crs,basePoint}` (`packages/schemas/src/site/Parcel.ts`); `IfcProjectedCRS`/`IfcMapConversion` **read** shipped (`plugins/ifc-import/src/IfcProjectedCRSReader.ts`). The model *is* georeferenced. |
| **Georef in a globe** | **1 (georef-in-Cesium)** | Google Photoreal 3D Tiles, terrain clamp, ENU anchoring, GLB placement, OSM context — all shipped, all in Cesium (`apps/editor/src/ui/geospatial/CesiumViewport.ts`, `contextBuildings.ts`, `contextRoads.ts`). |
| **Streaming GIS in Three.js** | **0** | The Three.js/WebGPU canvas renders **no** streamed GIS. Its only georeferenced content is (a) a **flat ESRI World Imagery orthophoto** used as a plan-view underlay image (`buildSiteGisContextRaster.ts`), (b) the authored building, (c) the site-boundary polyline (`ParcelBoundarySceneRenderer.ts`). No terrain mesh, no DEM, no 3D-Tiles, no tiled buildings on the Three side. `packages/geospatial` supplies georef **math only** — there is no Three terrain/DEM/tile loader anywhere in the repo. |
| **Digital twin / city-scale** | **0** | No live-sensor binding, no city-scale streaming, no multi-tile LOD paging on either renderer (Cesium streams tiles but PRYZM authors one site, not a city). |

**Why not "2" overall:** Level 2 ("GIS-aware modelling") in the founder's sense implies the *modelling canvas itself* is aware of and renders geospatial context. PRYZM's canvas is coordinate-aware but context-blind — it shows a flat aerial photo under the model, nothing more. **Why not "1" flat:** the coordinate authority + C19 site model + IFC georef-read are materially past a pure "georef-into-Cesium" toy. Hence **1.5**, and the single most honest sentence is: *PRYZM has a Level-2 coordinate substrate feeding a Level-1 (Cesium-only) GIS renderer, with a Level-0 native-Three context layer.*

**Cesium and Three are two separate GPU surfaces**, run **one-at-a-time** by a visibility toggle (`GISAreaLayout` → `cesiumViewport.setVisible()`), coupled only by `CesiumThreeBridge` camera-sync (`packages/renderer-three/src/geospatial/CesiumThreeBridge.ts:110` — and note its header records it is *pending wiring*, 0 structural importers). They never composite in one frame.

---

## §2 — Feasibility: native Three.js GIS without Cesium

**Short answer: technically yes for every listed format** — the browser-GIS ecosystem has matured to the point that a Three.js scene can load and render each. None of this is in PRYZM today; this is the build surface. `proj4` is already a dependency (via `packages/geospatial`); `three` is `^0.183`, `three-mesh-bvh` and `three-gpu-pathtracer` are present. New libraries would be additive.

| Data type | Native-Three path (library) | Coordinate transform | Limitations / cost |
|---|---|---|---|
| **DEM / DTM / DSM (raster)** | Parse GeoTIFF with `geotiff.js`; mesh with **MARTINI** or **Delatin** (RTIN → adaptive TIN) or displace a grid | GeoTIFF ModelTiepoint/PixelScale → project to ENU via `proj4` | Big rasters must be tiled/downsampled; RTIN meshing is CPU-bound (worker it). No streaming out of the box. |
| **Terrain mesh / quantized-mesh** | `3d-tiles-renderer` has a quantized-mesh plugin; or bespoke tile pager | Cesium-terrain tiles are ECEF-region; needs ellipsoid→ENU | quantized-mesh is Cesium's server format; you either run a terrain server or convert. Non-trivial. |
| **3D-Tiles (b3dm/i3dm/pnts/glTF), incl. Google Photoreal + Cesium ion** | **NASA-AMMOS `3d-tiles-renderer`** — a Three.js-native 3D Tiles engine with built-in WGS84/region georeferencing, LOD paging, Google-Photoreal + ion loader plugins | Handled by the library (ECEF→local group transform); pair with LTP-ENU rebase | **This is the keystone library** — it renders the *same* Google Photoreal tiles PRYZM shows in Cesium, but inside a Three scene. Session-token handling for Google; memory paging is real work. |
| **Vector tiles (MVT)** | `loaders.gl` MVTLoader → triangulate (earcut) → drape; or a deck.gl interop layer | Tile x/y/z → WebMercator → ENU | Draping onto terrain (not flat) requires per-vertex terrain-height sampling. |
| **CityGML** | **Convert offline** to CityJSON (citygml-tools); no robust in-browser CityGML parser | native CRS (often national grid) → ENU via `proj4` | Not a browser-load format; treat as an import/convert pipeline, not a live layer. |
| **GeoJSON** | `loaders.gl` / earcut triangulation; extrude polygons for footprints | lon/lat → ENU via `proj4` | Trivial for footprints/parcels; this is the cheapest win for vector context. |
| **glTF / GLB** | Native `GLTFLoader` (already used everywhere) | Place via ENU model-matrix (already done for the BIM GLB) | Fully solved today. |
| **CityJSON** | `cityjson-threejs-loader` (community, Three-native) | native CRS → ENU via `proj4` | Good LOD1/LOD2 building path; maturity/maintenance is the risk. |
| **Point clouds (LAS/LAZ/PLY/PCD/pnts)** | `loaders.gl` LAS loader → `THREE.Points`; or `pnts` via `3d-tiles-renderer`; **Potree** exists but runs its **own** renderer (P2-hostile) | LAS header CRS → ENU via `proj4` | Large clouds need octree paging (Potree-style) — building that under P2 inside `renderer-three` is the hard part. |
| **Orthophotos** | Texture on the terrain mesh / ground plane (PRYZM already drapes a flat ESRI image as a plan underlay) | Image bbox → ENU quad / terrain UVs | Solved for the flat case; draping on terrain needs the terrain mesh first. |

**Feasibility conclusion.** No format is a blocker; `3d-tiles-renderer` + `geotiff.js`/MARTINI + `loaders.gl` + `proj4` covers ~90% of the founder's list. The **two genuinely hard pieces** are (a) **large point-cloud octree paging** and (b) **streamed quantized-mesh terrain**, both of which are *rendering-engine* work that, under P2, must live inside `renderer-three`. The remaining pieces (GeoJSON footprints, extruded LOD2, orthophoto drape, glTF context) are comparatively cheap. **Doing "all of it in Three, drop Cesium" is a multi-quarter engine build; doing the high-value 70% is a phased feature.** That asymmetry is exactly why the recommendation is HYBRID (§6), not a rip-and-replace.

---

## §3 — Coordinate systems: the authority model

PRYZM already has the right answer half-built; the recommendation is to **make it explicit and singular**.

**The five frames in play:**

- **Local engineering (scene)** — metres, `x=East, y=Up, z=−North`, origin at the site. This is where *all authoring* happens and where float32 precision is safe. (`LTPENURebase`, `boundaryProjection.latLonToSceneXZ`.)
- **Projected (national grid / UTM)** — proj4 `PROJECT_CRS`, used as the intermediate hop WGS84↔scene (`LTPENURebase.projectToScene:75`). This is where national geodata (SWEREF99 TM, OSGB, etc.) natively lives.
- **WGS84 geographic** — lat/lon/elev; the storage + interchange frame (`SiteLocation`, IfcMapConversion, geocode results).
- **ECEF (earth-centred)** — Cesium's internal frame; PRYZM only touches it at the Cesium boundary via `eastNorthUpToFixedFrame` (`CesiumViewport.ts`, `CesiumThreeBridge.ts:62`).
- **ENU (local tangent plane)** — the bridge between scene-local and ECEF; the anchor Cesium uses to seat the model.

**Recommended authority (formalise, don't invent):**

> **The project's authoritative coordinate frame is a Local Tangent Plane (ENU) with a single stored global georef `(lat0, lon0, elev0, trueNorth, proj4/EPSG)`.** All geometry, all context, all analysis compute in ENU metres. The global georef is the *only* thing persisted for reprojection. Any renderer (Three today, Cesium today, a Three Context Engine tomorrow) is a **consumer** that lifts ENU→its native frame at its own boundary. Never a second projector.

This is precisely what `LTPENURebase` + `GeospatialAdapter` already implement (proj4 UTM, `z=−North`, 1 km recenter at `RECENTER_THRESHOLD_M`). The Cesium path *already consumes it* correctly via a single `eastNorthUpToFixedFrame` anchor. The gaps to close are governance, not math:

1. **C12 §1.3 rebase-at-draw-surface is documented-but-not-wired** — `siteDispatch.dispatchSiteLocation` notes `LTPENURebase.setOrigin` is not called on location change at the draw surface (SPEC-FORMA-SITE-VIEW §1.1, §4). Any Context Engine's real-world accuracy depends on this precondition. Close it.
2. **A `boundaryProjection` local-equirectangular approximation coexists with the proj4 UTM path** (same `z=−North` convention, so they land in one frame, but they are two code paths). A single Context Engine should consolidate on the proj4 path.
3. **Float32 precision at global scale is already solved** by the 1 km LTP recenter — this is exactly the property a native-Three GIS engine needs (Three has no double-precision ECEF globe of its own), so the substrate is *ready* for it.

**Net:** the coordinate story is the *strongest* part of PRYZM's GIS maturity and needs **no re-architecture** — only (a) wiring the rebase precondition and (b) declaring the LTP+global-georef authority in a contract (the C-CONTEXT-ENGINE gap should own this).

---

## §4 — Terrain representation for an engineering platform

Terrain is where "pretty globe" and "engineering platform" diverge, and PRYZM should be explicit that it wants the **engineering** answer.

| Representation | What it is | Fit for PRYZM |
|---|---|---|
| **DEM/DTM raster (heightfield)** | Regular grid of elevations (GeoTIFF) | **Ingestion format of choice** — parse with `geotiff.js`, keep the raw grid for analysis (slope, cut/fill, drainage), mesh on demand. Bare-earth **DTM** is the engineering surface. |
| **DSM (surface model)** | Includes buildings/canopy (first-return LiDAR) | Keep as a **separate layer** — useful for shadow/context but *not* the ground the building sits on. Do not conflate with DTM. |
| **TIN (irregular mesh)** | Triangulated adaptive surface | **Render target of choice** — mesh the DTM raster to an RTIN (MARTINI/Delatin) so flat areas are cheap and slopes are detailed. This is what drapes orthophoto + carries the building's grade. |
| **Streamed terrain tiles (quantized-mesh)** | Server-paged LOD terrain | Needed only for **wide-area / city-scale** context; overkill for a single parcel. Defer to the city-scale phase; Cesium already does this for globe nav. |

**Recommendation:** ingest **DTM (bare earth) + DSM (context) as GeoTIFF rasters**, keep the raster for analysis (this is what makes flood/landslide/slope in C55/ADR-0065 *quantitative*, not just a pretty drape), and **render a TIN meshed from the DTM** in the local ENU frame, orthophoto-draped, with the building grade-clamped to it. Cesium's `sampleTerrainMostDetailed`/`sampleHeightMostDetailed` (already used for the Forma clamp, `CesiumViewport.ts`) can remain the **quick height-sampling oracle** during the transition, before a native DTM pipeline exists. An engineering platform additionally wants **cut/fill, contour, and slope derivation off the DTM raster** — none of which a photoreal globe gives you, and all of which need the *raster*, not just the mesh.

---

## §5 — Context-data stack comparison

Ranked for an engineering/AEC platform needing *decision-grade* context (this directly feeds the L-355 Context-Engine and the L-354 provenance/credibility work — every provider below must carry source + accuracy + licence provenance per C23/ADR-0065).

| Provider | Quality / fidelity | Coverage | Licensing | Streaming | Cost | Accuracy | Verdict for PRYZM |
|---|---|---|---|---|---|---|---|
| **Cityweft** | LOD2/LOD3 semantic buildings, engineering-oriented, clean geometry | Growing, region-limited | Commercial | Yes (tiled) | $$$ | High (survey-grade ambition) | **The "gold standard" target** the founder benchmarks against — semantic, engineering-grade context. Register as a *provider adapter*, don't couple. |
| **Google Photoreal 3D Tiles** | Photoreal mesh (splat-upgrade coming); "broccoli trees / melted glass" artifacts | Near-global cities | Google Maps Platform ToS (per-session key; **no caching / no derivation**) | Yes (native 3D Tiles) | $$ (usage-metered) | Visual, **not** metric | **Already wired in Cesium**; renderable in Three via `3d-tiles-renderer`. Great for *context visualisation*, unusable as a *measurement* source. ToS forbids caching. |
| **Cesium ion** | Curated terrain + OSM buildings + user assets; 3D Tiles pipeline | Global | Freemium + commercial tiers | Yes (native) | $–$$ | Terrain good; OSM buildings LOD1 | **Best "batteries-included" tiling backend**; hosts your own tilesets (splats, LiDAR, CityGML→3DTiles). Strong provider adapter. |
| **Mapbox** | Vector + raster tiles, terrain-RGB DEM, satellite | Global | Commercial (token) | Yes | $$ | Terrain-RGB medium | Good **imagery + terrain-RGB** source; DEM decodable client-side. Provider adapter. |
| **OSM (Overpass / vector)** | Footprints + roads + POI; height often missing | Global, uneven | **ODbL (free, attribution)** | Via Overpass (rate-limited) | Free | LOD1 footprints, variable | **What PRYZM uses today** (`contextBuildings.ts`/`contextRoads.ts`) — cheapest baseline context, keep it as the always-available fallback. Cache aggressively (L-355). |
| **OpenTopography** | SRTM/Copernicus/national DEM + LiDAR point clouds | Global DEM + regional LiDAR | Mostly open (per-dataset) | API / bulk | Free–$ | DEM 30 m→1 m; LiDAR cm | **Best open DTM/DSM source** for the §4 terrain pipeline. Provider adapter for the elevation layer. |
| **National LiDAR** (e.g. UK EA, USGS 3DEP, NL AHN) | Bare-earth + surface, cm-grade | Per-country | Open (gov) to restricted | Bulk / WCS | Free–$ | **Survey-grade** | **The engineering-grade DTM/DSM source** — but per-country CRS/format/licence = real per-registry adapter work (exactly the ADR-0065 provider model). |
| **Gov DSM/DTM (national mapping)** | Authoritative cadastre + terrain + statutory | Per-country (SE Lantmäteriet/SGU is the ADR-0065 reference) | Open to licensed | WMS/WMTS/WFS | Free–$$ | Authoritative | The C55/ADR-0065 target; OGC (WMS/WMTS/WFS) generic adapter is the breadth path. |

**Takeaways:**
- **No single provider is both photoreal-and-metric-and-global-and-free.** This *is* the argument for ADR-0065's pluggable-provider model — PRYZM must aggregate: Google/Cesium-ion for *visual* context, OpenTopography/national-LiDAR for *metric* terrain, OSM as the free baseline, Cityweft where engineering-grade LOD2 is worth paying for.
- **Provenance is non-optional** (L-354): a visual photoreal tile and a survey-grade LiDAR DTM must be labelled *indicative* vs *decision-grade* — the credibility bar the C-CONTEXT-ENGINE gap needs to define.
- **Reaching "Cityweft quality"** = a Cityweft (or equivalent LOD2-semantic) provider adapter + national-LiDAR DTM + orthophoto drape, all rendered natively (§6) with per-source provenance.

---

## §6 — Rendering architecture: A (dual) vs single-Three vs HYBRID

### The P2 constraint (non-negotiable)
`renderer-three` is the **single owner of the npm `three` dependency**, CI-enforced by `check-three-imports.ts` (HARD_FAIL=0) + the `no-three-outside-committer` ESLint boundary. App/plugin code adds scene content **without a `three` dep** through two existing seams:
1. **`PrimitiveCommitter`** (`packages/scene-committer`, ADR-0205) — the structured commit lifecycle for authored geometry.
2. **Overlay `SceneRenderer`** — e.g. `ParcelBoundarySceneRenderer.ts` calls `scene.add(...)` directly for non-BIM overlays (boundary, climate overlays).

Both import the **`@pryzm/renderer-three/three` facade**, never `three` directly. **CRITICAL LIMIT (from code inspection):** a *new render pass* (a splat sorter, a point-cloud octree pager, a terrain-clip pass) has **no public extension point** — the pipeline passes are **hardcoded private fields in `RenderPipelineManager`**. Adding one means editing `renderer-three` itself. So: *scene-content* GIS context (terrain mesh, extruded buildings, draped vectors, orthophoto quads, `THREE.Points` clouds) can be added **today** via committers/overlays with no P2 violation; but any GIS feature needing a **custom pass** (Gaussian splats L-353; huge streamed point clouds) requires a first-class pass-registry inside `renderer-three`.

### The three options

**Option A — Canvas ⇄ Cesium dual (status quo).** Two renderers, two GPU contexts, toggled one-at-a-time, coupled by `CesiumThreeBridge` camera-sync.
- *Pros:* shipped, robust globe nav, no P2 pressure (Cesium isn't THREE).
- *Cons:* context is trapped in Cesium — the *authoring* canvas stays context-blind (Level 1); the ~70 MB GLB round-trip to move the model between engines (L-355/L-356); two engines to maintain; you can never edit *against* real context.

**Option B — Single Three.js GIS engine (drop Cesium).** Rebuild globe nav, terrain streaming, 3D-Tiles, ellipsoid, LOD paging natively in `renderer-three`.
- *Pros:* one engine, one frame, context + model composited, full control.
- *Cons:* multi-quarter engine build; you re-solve globe-scale double-precision, terrain streaming, and 3D-Tiles paging that Cesium gives for free; every new pass edits `renderer-three` (the §6 limit); **highest risk, worst ROI near-term.**

**Option C — HYBRID (RECOMMENDED).** *Cesium = globe-scale navigation + coordinate/terrain-sampling authority only.* *`renderer-three` = editing + streamed **local** context* (site-radius terrain TIN, orthophoto drape, LOD2 buildings, roads, instanced vegetation, point clouds) via committers/overlays, with a **first-class pass-registry added to `renderer-three`** when (and only when) a custom pass is needed.
- *Pros:* incremental — evolves the current impl (the L-355 directive: "evolve, don't replace"); the *authoring canvas gains context* (jumps to Level 2→3) without rebuilding a globe; Cesium keeps doing what it's genuinely good at (planetary nav, terrain sampling, photoreal tiles for the fly-in); honours P2; respects the C10 budget by streaming a **site-radius** context (~500 m), not a city.
- *Cons:* still two engines for a while; needs the `renderer-three` pass-registry seam; careful memory budgeting (C10: 10k-element/<1.5 GB ceiling — context must live *outside* the element budget as ephemeral, disposable, non-committed resources per C55 §1.2 "layers drape, never BIM").

### Recommendation
**Adopt HYBRID (Option C).** Concretely:
1. Build a **provider-agnostic Context Engine** (the L-355 ask, governed by a new C-CONTEXT-ENGINE contract) with `Terrain / Imagery / Building / Vegetation / Road` provider interfaces (mirroring ADR-0065's `GeodataProvider`), EPSG-transformed via the existing `packages/geospatial` proj4/LTP substrate.
2. Render its output **inside `renderer-three`** through committers/overlays as **disposable, non-BIM, non-committed** scene content (never in the `.pryzm` file, never in the element/undo/IFC path — C55 §1.2, C13 isolation).
3. Add a **public render-pass registry** to `renderer-three` (closes the §6 CRITICAL LIMIT) so future splat (L-353) / point-cloud passes plug in P2-cleanly instead of forking the renderer.
4. **Keep Cesium** for the globe fly-in, planetary navigation, `sampleTerrain*` height oracle, and photoreal-tile *presentation* — Cesium becomes optional-per-view, not the sole home of all context.
5. **Rejected shortcut** (explicitly): bolting a *second* Three.js GIS renderer outside `renderer-three` — violates P2 and forks the render path. Any Three GIS rendering goes through `renderer-three`.

---

## §7 — Phased roadmap

Each phase is independently shippable and additive; every phase renders context as **disposable draped layers** (C55 §1.2), never BIM (C13/C10 element budget untouched).

### Phase 0 — Perf hygiene + governance (days–2 wks) · *do first, unblocks the cluster*
- **Fix the 70 MB GLB re-export** (L-355/L-356 shared root): repair `computeBuildingSignature` cache-invalidation across globe↔Forma round-trips; move export off the sync activation path (worker); investigate a partial/diff export. **(Easiest high-value win — §8.)**
- Wire the **C12 §1.3 rebase-at-draw-surface** precondition (`siteDispatch`).
- Author the **C-CONTEXT-ENGINE contract**: declare the LTP+global-georef coordinate authority, the fidelity tiers, the provider model, the provenance/credibility bar (folds in L-354).
- *Capabilities:* fast, robust GIS activation. *Risk:* low. *Complexity:* low.

### Phase 1 — Terrain + ENU context in Three (4–8 wks)
- DTM/DSM GeoTIFF ingestion (`geotiff.js`) → RTIN TIN (MARTINI, worker) → orthophoto drape → building grade-clamp, all in ENU via committers/overlays. OpenTopography + national-LiDAR provider adapters.
- *Capabilities:* the **authoring canvas shows real terrain + aerial** (Level 1→2 on the render axis); slope/cut-fill analysis off the raster. *Risk:* medium (meshing perf, terrain memory). *Complexity:* medium.

### Phase 2 — Context-building streaming + 3D-Tiles in Three (6–10 wks)
- Integrate **`3d-tiles-renderer`** for LOD2 buildings + (optionally) Google Photoreal tiles *inside* the Three scene; GeoJSON/vector footprint drape; roads; instanced vegetation. Cityweft / Cesium-ion / OSM provider adapters. Site-radius (~500 m) tiled streaming, camera-driven.
- *Capabilities:* edit *against* real neighbours; the L-355 Context Engine is live (Level 2→3, streaming-GIS-in-Three). *Risk:* medium-high (memory paging under C10; token handling). *Complexity:* high.

### Phase 3 — DSM/DTM analysis + clipping + shadow + splat pass (8–12 wks)
- Add the **`renderer-three` render-pass registry**; ship a **terrain/section clipping pass** (closes the §1.11 "no clipping" gap in `pryzm-3d-geospatial-capabilities.md`), context-aware shadow, and the **Gaussian-splat pass (L-353)** + point-cloud octree paging as P2-clean passes.
- *Capabilities:* real-context shadow studies, section-through-terrain, reality-capture splats/LiDAR as first-class georeferenced assets. *Risk:* high (custom passes, GPU/device-loss family per C10). *Complexity:* high.

### Phase 4 — City-scale + digital-twin + AI (roadmap horizon)
- Multi-tile city streaming, live-data binding (IoT/FM), AI over the unified context graph (site-suitability, view-corridor, overshadowing).
- *Capabilities:* Level 4→5. *Risk:* very high. *Complexity:* very high. *Gate on demonstrated demand.*

---

## §8 — Final assessment

- **Maturity level: 1.5 / 5.** A **Level-2 coordinate/data substrate** (LTP-ENU authority + C19 site model + IFC georef-read) feeding a **Level-1 Cesium-only GIS renderer**, with a **Level-0 native-Three context layer** (the authoring canvas renders no streamed GIS — only a flat orthophoto underlay, the model, and a boundary line).

- **Biggest architectural gap:** the **authoring canvas is context-blind** — and structurally, `renderer-three` has **no public render-pass extension point** (passes are hardcoded private fields in `RenderPipelineManager`). Scene-content context can be committed today, but every *custom-pass* GIS feature (splats, big point clouds, terrain clip) currently requires editing the renderer. **Closing the pass-registry seam is the enabling move** for everything in Phases 2–3. Compounding it: the **C-CONTEXT-ENGINE coverage gap** — no contract defines the GIS-maturity target, the coordinate authority, or the provider/provenance model.

- **Biggest technical risk:** **memory + perf under C10** (10k-element / <1.5 GB / 60 fps budget) once real streamed context lands — context must be strictly *disposable, non-committed, site-radius-bounded* or it blows the budget and re-triggers the WebGPU heavy-scene device-loss family. Secondary risk: the current Cesium mount is already fragile (zero-size-framebuffer freeze, `analysis-cesium-globe-stuck.md`; double-render + retry latency, L-356).

- **Easiest high-value win:** **cache/incrementalise the 70 MB full-scene BIM→GLB export** that runs on every Forma/globe activation. A `computeBuildingSignature` cache exists but is **invalidated on every globe↔Forma round-trip**, forcing a fresh whole-scene export (2500+ elements, ~70 MB) on the critical path. Fixing the invalidation (+ worker/diff export) is **days-scale**, removes the single biggest felt cost on the current GIS surface, resolves the P1 facet of L-355 and the shared root of L-356, and needs **none** of the larger Context-Engine build.

- **What it takes to reach Cityweft-quality context:** (1) the HYBRID Context Engine rendering natively in `renderer-three` (§6); (2) a **Cityweft / LOD2-semantic building provider adapter** + **national-LiDAR DTM/DSM** + orthophoto drape via the ADR-0065-style provider model; (3) **per-source provenance + a decision-grade-vs-indicative credibility bar** (L-354); (4) the `3d-tiles-renderer` streaming backend under a strict C10 site-radius memory budget. That is **Phase 1 + Phase 2** of §7 — reachable without dropping Cesium and without violating P2.

---

### Cross-links
- **L-357** (this spike — parent) · **L-355** (Context-Engine perf + strategy — the direct child; §0.4 / Phase 0 win) · **L-356** (Cesium-globe hardening — shares the GLB-export root) · **L-353** (Gaussian-splatting reality capture — needs the §6 pass-registry).
- **C-CONTEXT-ENGINE gap** (MISSING-CONTRACTS-AUDIT): this spike recommends authoring that contract in Phase 0 to own the coordinate authority (§3), fidelity tiers, provider model (ADR-0065-aligned), and provenance bar (L-354).
- Companion: [SPEC-FORMA-SITE-VIEW](../specs/SPEC-FORMA-SITE-VIEW.md), [SPEC-GEODATA-ANALYTICAL-LAYERS](../specs/SPEC-GEODATA-ANALYTICAL-LAYERS.md), [ADR-0065](../../02-decisions/adrs/ADR-0065-geodata-analytical-layers-pluggable-provider.md), [`pryzm-3d-geospatial-capabilities.md`](../../04-reference/pryzm-3d-geospatial-capabilities.md), [`spike-gaussian-splatting-photoreal-3d.md`](./spike-gaussian-splatting-photoreal-3d.md).
