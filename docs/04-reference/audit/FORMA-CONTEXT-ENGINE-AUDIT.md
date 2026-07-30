# FORMA 3D-Site — Production-Readiness Audit & Provider-Agnostic Context Engine Roadmap

**Date:** 2026-07-17 · **Author:** Principal GIS / Digital-Twin / Real-Time-Graphics architect (audit pass)
**Status:** AUDIT — no code changed, no contract flipped. Evidence-grounded (`file:line`) review + roadmap.
**Tracker:** L-374 (this initiative) · relates to L-355 / L-356 / L-358 (loading-perf, already logged) · sibling of L-373 (analytical-layers audit — sun/wind/temp/population — deliberately NOT duplicated here).
**Scope:** CONTEXT DATA (buildings · terrain · imagery · trees · water · roads) + loading performance + a provider-agnostic Context Engine. NOT the analytical overlays (that is L-373).

> Founder mandate: make the "3D Site" (Forma) view production-ready with engineering-grade context — LOD2+ buildings, real terrain (DEM/DTM/DSM), orthophotos, trees, water, roads — inside the Three.js/Cesium canvas, at global scale and great performance, **evolving** the current implementation toward a **provider-agnostic Context Engine**, not replacing it.

---

## 0 — Executive summary

**What the 3D Site view is today.** A Cesium WebGL viewer (`apps/editor/src/ui/geospatial/CesiumViewport.ts`, ~9,082 lines) with two modes on one viewer: (a) a **Forma flat-ground massing study** (`setFormaMode(true)`, `renderFormaMassing:2901`) and (b) a **photoreal globe** (Google Photorealistic 3D Tiles when keyed, else keyless ESRI satellite). Surrounding context is **keyless OSM footprints via Overpass** extruded as LOD1 boxes (`contextBuildings.ts`), OSM road centre-lines and OSM water/parks. The authored building is placed either as pastel massing prisms or as a **full-fidelity GLB** exported live from the BIM scene (`exportFragmentsToGLB`, `GISAreaLayout.ts:1958/2117`). The coordinate substrate (LTP-ENU / proj4, C12) is genuinely strong; the **context data is not**.

**Maturity (context GIS data, today): 1.6 / 5.** Strong georeferencing, weak context. Per-layer scorecard in §4.

**The single biggest loading-perf win.** Get the **~71 MB full-scene BIM→GLB export off the critical path** of every view activation. The live log shows a **71,177,808-byte GLB** (2,574 root elements) serialized synchronously on Forma entry (L-355) and a **69,697,220-byte** GLB on globe entry (L-356), and it **re-exports on every globe⇄Forma round-trip** because the signature cache invalidates on view-mode switch rather than on real geometry change (L-358, `§CESIUM-PERF-GLOBE-GLB-CACHE`, `GISAreaLayout.ts:1923-1980`). Fixing the cross-view cache + moving export to a worker + not double-rendering massing-then-real is worth more than every other perf item combined.

**Recommended provider strategy (3 lines).** (1) **Premium tier = Google Photorealistic 3D Tiles** as one 3D-Tiles stream that carries buildings+terrain+imagery for instant global context, behind a single `BuildingProvider`/`TerrainProvider` adapter; **Cityweft** as the engineering-grade **LOD2/LOD3** upgrade where coverage exists. (2) **Open/keyless fallback tier = Cesium ion World/Copernicus terrain + Esri World Imagery + Overture/OSM** buildings/roads/water — so the view is never blank without keys. (3) **Cesium stays** the globe-scale nav + WGS84↔ECEF↔ENU transform engine; the **Context Engine** is a new provider-agnostic ingestion/streaming layer that feeds Cesium primitives (or hands off 3D Tiles), so the renderer never knows the source.

---

## 1 — Performance / robustness / graphics review (as built)

### 1.1 The activation cost breakdown (ranked by cost)

Grounded in the live founder log captured in L-355/L-356 and the code paths that produce it:

| Rank | Cost centre | Evidence (`file:line`) | Magnitude |
|---|---|---|---|
| **1** | **Full-scene BIM→GLB export on the critical path**, re-run per activation & per round-trip | `GISAreaLayout.ts:1958` (globe) / `:2117` (Forma) call `exportFragmentsToGLB`; blob size logged `GLBExporter.ts:408`; signature cache `GISAreaLayout.ts:1923-1980`, `computeBuildingSignature:2043-2071` | **71 MB** / 2,574 elems (L-355); **69 MB** / 2,506 elems (L-356) |
| **2** | **Massing rendered, THEN real GLB placed over it** — two representations produced per entry | Massing is the "SAFE FALLBACK" done first (`GISAreaLayout.ts:1786-1796, 1832-1873`), then `placeRealModelOn{Forma,Globe}` overlays the GLB and drops the massing (`removeFormaMassingPolygons`, C12 §11.1) | 39 storey bands + 920 opening insets + 78 stair volumes + 41 slabs extruded (L-355) then discarded |
| **3** | **Massing re-placed after async ground clamp resolves** (globe) — extruded at base 0.0 m, re-placed at the tile-clamped height | `clampToPhotorealTilesThenReplace`; re-seat after async parse (C12 §11.2 step 5, `§FIX-GLOBE-REAL-MODEL-UNDERGROUND-CLAMP`) | "storey 0 at 0.0 m then re-placed at 64.1 m" (L-356) |
| **4** | **OSM context fetch + extrude** (Overpass) | `contextBuildings.ts:786` `fetchContextBuildingsNearAndFar`; near extruded+shadows, far flat capped 900 (`:208`) | 4,342 footprints (L-355); one 0.016° fetch after L-368 |
| **5** | Roads / water / parks Overpass fetches + ground ribbons | `contextRoads.ts`, `contextWater.ts`, `contextParks.ts` | secondary |
| **6** | `WallFragmentBuilder` RAF-drain finishing just before activation | noted in L-356 | secondary |

### 1.2 Robustness gaps (flagged, not fixed)

- **L-371 keyless-tiles readiness race.** In Forma massing mode the code deliberately reports "ground not ready" as ready to avoid an intermittent false timeout: `CesiumViewport.ts:1014-1023` — `if (this.formaMode) return false;` short-circuits the readiness check because Forma always draws its own flat neutral ground. This is a symptom-level guard around a readiness signal that conflates "tiles ready" with "flat ground is fine".
- **Terrain-clamp degraded is the *normal* path, not an edge case.** `terrainProviderHasElevationData` (`CesiumViewport.ts:4687`) rejects `EllipsoidTerrainProvider`, and the build **never attaches a real terrain provider** (explicit comment `:4593-4594`), so `sampleTerrainMostDetailed` is skipped and the base falls to **0 / ellipsoid** (`:4589`, `:4634`). Every Forma study log line "terrain clamp degraded — keyless ellipsoid ground" is the default, not a failure.
- **Per-entry GLB re-export** (L-358): `§CESIUM-PERF-GLOBE-GLB-CACHE` only reuses while the *same* view's primitive is still live; a cross-view round-trip clears the other view's primitive and forces a fresh full-scene export even when geometry never changed.
- **Unbounded-ish context counts.** Near ring is uncapped (all footprints whose centroid is inside the 0.008° bbox, `selectNearFootprints:744`); only the far ring is hard-capped at 900 (`CONTEXT_FAR_MAX_BUILDINGS:208`). A dense city core can push a large near set of shadow-casting extrusions.
- **Graphics fidelity.** Context buildings are **outer-ring-only** LOD1 extrusions (holes explicitly treated as "cosmetic at this scale", `contextBuildings.ts:456`); heights are OSM `height`/`building:levels`×3.2 m / default 9 m (`:154-156, :363`). No façade detail, no roof forms, no textures — correct for a massing study, thin for "engineering-grade context".

### 1.3 Biggest wins, ranked

1. **GLB export off the critical path + a real cross-view signature cache** (L-355/L-358). Export in a worker or on idle; key the cache on true geometry signature, not view mode; reuse the same blob across globe⇄Forma. **Highest ROI.**
2. **Stop producing two representations per entry** (L-356). Decide fidelity first; only render massing OR real, not massing-then-real, unless massing is an intentional progressive placeholder shown *while* the GLB streams.
3. **Single ground-clamp settle before placing** (L-356), so the model is seated once, not placed-then-re-placed.
4. **Stream/defer non-critical context** — roads, water, parks, far-ring buildings after first interactive frame; the L-368 single-fetch already collapsed 3 building round-trips to 1 (C12 §8).

---

## 2 — "Loading is too long" — root cause & fixes

**Root cause (from the log + code): the critical path serializes the entire BIM model to a ~71 MB GLB on every activation, redundantly re-renders massing alongside the real model, and re-exports on view round-trips.** Concretely:

- The GLB export is **awaited on the activation path** — `placeRealModelOnForma`/`placeRealModelOnGlobe` are registered with the view-activation loading gate (`trackViewActivationPlacement`, `GISAreaLayout.ts:717-719, 1795, 1873`), so the loading overlay stays up until the 71 MB serialize + parse + placement completes.
- It is **not cached across entries** in the common case (L-358): `computeBuildingSignature` (`:2043-2071`) is right, but the reuse gate also requires the *same view's* primitive to still be live (`hasRealModelOnGlobe`, `:1939`), which a round-trip has torn down.
- The **massing is built first as a fallback** (`:1786-1796`) and the **real model placed over it** (`:1873`) — the massing extrusion work (39 bands + 920 insets + 78 stairs + 41 slabs, L-355) is largely thrown away when the GLB lands.
- Context is **already fixed** for round-trips (L-368 / C12 §8: one 0.016° Overpass fetch, near+far split client-side, cached in localStorage), so context is no longer the prime suspect — the GLB is.

**Architecturally-sound fixes (no shortcuts):**

1. **Persist + reuse the exported model across entries and across the two views.** One blob per geometry signature, held for the project session (and optionally in IndexedDB), reused by both the globe and Forma placement paths. This directly closes L-358 and most of L-355's P1 cost.
2. **Export off the main thread.** Run `exportFragmentsToGLB` in a Web Worker / on `requestIdleCallback` so the 71 MB serialize never blocks the activation frame; show the massing as a **progressive placeholder** until the GLB resolves (make the current massing-then-real a *deliberate* progressive-enhancement, not accidental double work).
3. **Draco / meshopt compress the GLB** at export so 71 MB → a few MB over the bridge; the BIM scene has heavy repetition (openings, storeys) that compresses well.
4. **Seat once.** Resolve the ground datum (`whenGroundSettled()`, C12 §1.4) before placing the real model, so it is not placed-at-0-then-re-placed (L-356).
5. **Defer non-critical layers** (roads/water/parks/far buildings) to after first interactive frame; keep near context + the authored model on the critical path only.
6. **Contract the budget.** There is **no view-activation performance budget in C10** (L-358 secondary finding) — add one (target: first-interactive < ~2 s on the reference model).

---

## 3 — Context-data source & quality audit (per layer, `file:line`)

| Layer | Actual source (verified) | Fidelity | Evidence |
|---|---|---|---|
| **Buildings (context)** | Keyless **OSM via Overpass** mirrors + same-origin `/api/overpass` proxy; extruded LOD1, outer-ring only | LOD1. Heights from OSM `height`/`building:levels`×3.2 m / default 9 m; missing footprints where OSM sparse; holes dropped | `contextBuildings.ts:88-104` (mirrors), `:121` (proxy), `:363` (height), `:456` (outer-ring only), `:786` (near+far single fetch) |
| **Buildings (photoreal globe)** | **Google Photorealistic 3D Tiles** (keyed) — photogrammetric mesh, when `VITE_CESIUM_TOKEN` or `VITE_GOOGLE_MAPS_KEY` present | Photogrammetric mesh (visually rich, **not semantic / not LOD2 BIM**) | `CesiumViewport.ts:153/161` (keys), `:1403/1443` (tileset), `:1420` (`createGooglePhotorealistic3DTileset`) |
| **Terrain (DEM/DTM/DSM)** | **NONE.** Keyless `EllipsoidTerrainProvider` → flat ground at ellipsoid height 0; on the photoreal path the **tile mesh is the implicit surface** (`photoreal-tile-clamp`) | Flat (Forma) or tile-mesh-implicit (globe). No analytical terrain, no slope/contour data | `CesiumViewport.ts:4589-4594` ("build NEVER attaches a real terrain provider"), `:4687` (`terrainProviderHasElevationData`), C12 §1.4 |
| **Imagery / orthophoto** | **Esri World Imagery** satellite raster (keyless, `server.arcgisonline.com`), OSM streets fallback; **hidden in Forma flat mode** | Raster basemap only; **no ortho draping over terrain** (there is no terrain to drape onto) | `CesiumViewport.ts:1277-1309`, hidden in Forma `:1316-1317` |
| **Trees / vegetation** | **NONE as 3D.** Only flat OSM `landuse=grass/forest` / `natural=wood` polygons drawn as green ground patches | ~0 — no instanced trees, no canopy, no entourage | `contextParks.ts`; `CesiumViewport.ts:346` (park ground fill). Entourage is PLANNED-only (A.24.4, capabilities doc §8) |
| **Roads** | Keyless **OSM `way[highway]` via Overpass**; drawn as flat width-scaled ground ribbons by highway class | 2D ribbon, no elevation, no lanes | `contextRoads.ts:1-52`, `§FORMA-CTX-ROAD-RIBBON` |
| **Water / sea** | Keyless **OSM water polygons** + sea context | Flat polygon, `#B8D4E0` | `contextWater.ts`, `FEAT-FORMA-SEA-CONTEXT` |
| **Coordinate / georef substrate** | **proj4 LTP-ENU** (the strong part) | High — 1 cm round-trip CI gate | `packages/geospatial/src/LTPENURebase.ts`, C12 §1.1 |

**Honest summary:** the context is **keyless-OSM-first LOD1 + optional Google photogrammetric mesh**, on **flat/ellipsoid ground**, with **no real terrain, no orthophoto draping, and no vegetation**. The georeferencing is production-grade; the surrounding world is a massing-study abstraction.

---

## 4 — Maturity scorecard (0–5)

Scale: 0 = absent · 1 = crude placeholder · 2 = functional but low-fidelity · 3 = solid · 4 = professional · 5 = engineering/digital-twin grade.

| Layer | Score | Justification |
|---|---|---|
| **Coordinate / georeferencing substrate** | **4.0** | proj4 LTP-ENU, 1 km rebase, 1 cm round-trip CI gate, IFC CRS read/write (C12 §1). Genuinely strong. |
| **Buildings — context** | **2.0** | OSM LOD1 extrusions, keyless/global, height-attributed, cached, LOD-ringed & capped — functional, but LOD1, outer-ring only, gappy where OSM is sparse. |
| **Buildings — photoreal (keyed)** | **2.5** | Google 3D Tiles is visually excellent but photogrammetric (non-semantic, no LOD2 BIM), key-gated, not present on the keyless demo box. |
| **Terrain (DEM/DTM/DSM)** | **1.0** | No terrain provider ever attached; flat ellipsoid or tile-mesh-implicit. No slope/contour/cut-fill. |
| **Imagery / orthophoto** | **1.5** | Esri raster basemap only; no ortho draping (no terrain); hidden entirely in Forma flat mode. |
| **Trees / vegetation** | **0.5** | Flat park polygons only; no 3D trees/entourage anywhere (PLANNED). |
| **Roads** | **2.0** | OSM ribbons, class-width-scaled, global/keyless; flat, no elevation. |
| **Water / sea** | **2.0** | OSM polygons + sea context; flat, coarse. |
| **Loading performance (context+model)** | **1.5** | 71 MB GLB on critical path, redundant massing+real, cross-view re-export (L-355/356/358). |
| **OVERALL context-GIS-data maturity** | **≈ 1.6 / 5** | Strong georeferencing carrying weak, mostly-OSM-LOD1 context on flat ground with no terrain/ortho/trees. |

---

## 5 — Path to Cityweft-quality context (per layer, into the Three.js/Cesium canvas)

The target is Autodesk-Forma / Cityweft-grade: real terrain, LOD2/LOD3 buildings, orthophotos, trees, roads — performant and global. How each gets into the canvas:

- **Terrain (DEM/DTM/DSM).** Attach a real `TerrainProvider`: **Cesium ion World Terrain** (quantized-mesh, keyed) or **Copernicus GLO-30 / Mapzen Terrarium** (keyless, AWS) for the open tier; national LiDAR DTM/DSM (e.g. USGS 3DEP, UK LIDAR, swissALTI3D) for engineering grade. Cesium consumes quantized-mesh natively; then `sampleTerrainMostDetailed` (already coded, `CesiumViewport.ts:4627`) *actually works* and clamps the model + context to real ground. **This flips the biggest current lie ("terrain clamp degraded") into truth.**
- **Orthophoto / imagery.** Drape high-res ortho as a Cesium `ImageryLayer` over the terrain (**Esri World Imagery** keyless open tier; **Bing/Maxar/Google** or national ortho — e.g. USGS NAIP, national mapping-agency ortho — for premium). Draping requires terrain first (above).
- **LOD2/LOD3 buildings.** Ingest as **3D Tiles**: **Cityweft** (LOD2/LOD3 textured city mesh) or **Google Photorealistic 3D Tiles** (photogrammetric) streamed directly; or **CityGML/CityJSON LOD2** (3DBAG-NL, German/Swiss city models, Ordnance Survey) tiled to 3D Tiles offline. Semantic LOD2 (per-building, height, roof form) beats photogrammetric mesh for analysis. Fallback stays OSM LOD1 (today's path).
- **Trees / vegetation.** Two paths: (a) **point-source → instanced billboards/impostors** from Overture/OSM `natural=tree` + landuse canopy (keyless, cheap, global) rendered as GPU-instanced quads/low-poly; (b) **LiDAR-derived canopy** or Cityweft vegetation tiles for premium. Instancing is essential for perf (thousands of trees = one draw call).
- **Roads.** Upgrade OSM ribbons to **Overture Transportation** (richer classification) draped on terrain; keep the current ribbon renderer.
- **Water / sea.** Overture/OSM water polygons draped on terrain + Cesium water material for the sea.

**Performance envelope for all of the above:** everything except the authored building should arrive as **streamed, LOD-managed 3D Tiles or tiled imagery/terrain** so global scale costs are bounded by screen-space error, not dataset size — exactly what Cesium's tiling gives us for free once providers are attached.

---

## 6 — Optimal providers (comparison + recommendation)

| Provider | Best for | Quality | Licensing / cost | Coverage | Update freq | Engineering accuracy |
|---|---|---|---|---|---|---|
| **Google Photorealistic 3D Tiles** | Instant global buildings+terrain+imagery in one stream | Very high (photogrammetric mesh) | Keyed, per-tile usage cost; ToS restricts derivative/offline use | ~Global (major cities dense) | Periodic | Visual, **not** semantic; not survey-grade heights |
| **Cityweft** | LOD2/LOD3 **semantic** city models | High, semantic (per-building) | Commercial | Growing city coverage | Periodic | Good — semantic LOD2, analysis-ready |
| **Cesium ion** | Terrain (World Terrain), tiling/hosting, asset pipeline | High terrain; hosts your tiles | Keyed, tiered | Global terrain | — | Good terrain; you supply buildings |
| **Esri / ArcGIS** | Imagery (World Imagery), terrain, curated 3D | High | Keyed (World Imagery raster usable keyless via arcgisonline) | Global | Regular | Professional; licensing per plan |
| **Overture Maps** | Open **semantic** buildings/roads/water/places | Good (OSM-derived + validated) | **Open (CDLA)** | Global | Quarterly | LOD1 heights; open + auditable |
| **OSM / Overpass** | Keyless footprints/roads/water (today) | LOD1, variable | **Open (ODbL)** | Global, gappy | Continuous | Coarse; attribution-dependent |
| **Government LiDAR / open DEM** | Survey-grade DTM/DSM, canopy | Highest (survey) | Open (varies by country) | National, patchy globally | Occasional | **Engineering-grade** where available |

**Recommended source of truth per layer (+ premium/open fallback):**

| Layer | Source of truth (premium) | Open / keyless fallback |
|---|---|---|
| Terrain | Cesium ion World Terrain / national LiDAR DTM | Copernicus GLO-30 / Mapzen Terrarium (AWS) |
| Imagery/ortho | Google/Bing/Maxar or national ortho | Esri World Imagery (arcgisonline, current) |
| Buildings (LOD2+) | **Cityweft** (semantic) or Google 3D Tiles (photogrammetric) | **Overture Buildings** → OSM/Overpass (current) |
| Trees | Cityweft / LiDAR canopy | Overture/OSM `natural=tree` → instanced impostors |
| Roads | Overture Transportation | OSM/Overpass (current) |
| Water/sea | Overture water + Cesium water material | OSM/Overpass (current) |

**Strategy:** ship the **keyless open tier as the always-available default** (Copernicus terrain + Esri imagery + Overture/OSM), and make **Google 3D Tiles + Cityweft the keyed "engineering context" upgrade**. The provider abstraction (§7) makes this a config choice, not a rewrite.

---

## 7 — Provider-agnostic Context Engine architecture

**Goal:** the renderer never knows where context came from. Cesium remains the **globe-scale navigation + WGS84↔ECEF↔ENU transform engine**; the Context Engine is a new **L2/L3 ingestion + streaming layer** that resolves providers → tiles → Cesium primitives (or a direct 3D-Tiles hand-off).

### 7.1 Provider interfaces (sketch)

```ts
// L2 — pure provider contracts (no THREE, no Cesium, no DOM). EPSG-aware, tile-indexed.
interface ProviderCapabilities { epsg: number; lodRange: [number, number]; attribution: string; keyed: boolean; }

interface TerrainProvider   { caps: ProviderCapabilities; sampleHeights(pts: LonLat[]): Promise<number[]>; tileUrl?(z,x,y): string; }
interface ImageryProvider   { caps: ProviderCapabilities; imageryLayer(): ImageryLayerDescriptor; /* url template / WMTS */ }
interface BuildingProvider  { caps: ProviderCapabilities; fetchTile(bbox: Bbox, lod: number): Promise<BuildingTile>; /* GeoJSON LOD1 | 3D-Tiles url | CityJSON */ }
interface VegetationProvider{ caps: ProviderCapabilities; fetchTile(bbox: Bbox): Promise<TreeInstance[]>; }
interface RoadProvider      { caps: ProviderCapabilities; fetchTile(bbox: Bbox): Promise<RoadTile>; }
interface WaterProvider     { caps: ProviderCapabilities; fetchTile(bbox: Bbox): Promise<WaterTile>; }

// L3 — the facade the renderer talks to. Selects providers by tier + coverage + key availability.
interface ContextEngine {
  terrain: TerrainProvider; imagery: ImageryProvider; buildings: BuildingProvider;
  vegetation?: VegetationProvider; roads?: RoadProvider; water?: WaterProvider;
  streamContext(view: ViewFrustum, budget: PerfBudget): AsyncIterable<ContextPrimitiveBatch>;
}
```

**Adapters** implement these per source: `OverpassBuildingProvider` (today's `contextBuildings.ts`, refactored behind `BuildingProvider`), `OvertureBuildingProvider`, `Google3DTilesProvider` (both terrain+building via one tileset), `CesiumIonTerrainProvider`, `CopernicusTerrainProvider`, `EsriImageryProvider`, `CityweftProvider`, `OsmTreeProvider`. Every exported adapter fn carries an OTel span (P8).

### 7.2 Pipeline

`provider.fetchTile(bbox, lod)` → **EPSG transform** (proj4, reuse `LTPENURebase`, never a second projector — SPEC-FORMA §8.3) → **tile index** (bbox → z/x/y, screen-space-error LOD select) → **stream** batches under a `PerfBudget` → **emit Cesium primitives** (`PolygonGraphics` extrusions for LOD1, native 3D-Tiles hand-off for LOD2+, `ImageryLayer` for ortho, instanced billboards for trees). Caching reuses the proven `contextBuildingsCache.ts` localStorage pattern (L-273) generalized per layer.

### 7.3 Mapping onto existing code (evolve, not replace)

- `contextBuildings.ts` → the reference `OverpassBuildingProvider` (its near/far LOD split, cap, in-flight dedup, gentle-mirror throttle become the provider's internals — all preserved).
- `contextRoads/Water/Parks.ts` → `RoadProvider`/`WaterProvider`/`VegetationProvider` adapters.
- `CesiumViewport.loadContextBuildings` / `renderContextBuildingsFarRing` → thin consumers of `ContextEngine.streamContext`.
- The Google-3D-Tiles + ESRI-imagery wiring (`CesiumViewport.ts:1277-1443`) → `Google3DTilesProvider` + `EsriImageryProvider`.
- **Cesium stays** for nav + transforms + tile streaming; the Context Engine sits above it, choosing sources.

### 7.4 Governance coverage — **explicit gaps**

- **C12-GEOSPATIAL** governs coordinate precision (§1), the globe datum boundary (§1.4/§7), and OSM context-**fetch** strategy (§8) — but **coverage gap: no contract governs terrain/DEM ingestion**, **no contract governs LOD2/LOD3 building ingestion**, **no contract governs vegetation/trees**, **no contract governs orthophoto draping**, and **no contract governs the Context Engine provider abstraction itself.**
- Closest precedent: **ADR-0065** (geodata analytical layers — *pluggable provider*) is the pattern to mirror, but it governs the **analytical** layers (L-373's domain), not base context data.
- **C10 (performance/observability)** has **no view-activation budget** (L-358 secondary finding) — the loading-perf work needs one.
- **Recommendation:** author a new contract **C12-CONTEXT-ENGINE** (or C12 §9+) defining the provider interfaces, the tier/fallback policy, the per-layer perf budget, and the EPSG/tile-index rules — before Phase 2 build.

### 7.5 Conflict with founder vision (report, do not resolve)

- **"Engineering-grade context" vs the Forma NON-GOAL of a deliberately abstract flat massing study.** SPEC-FORMA §2/§8 make Forma intentionally flat/abstract/photo-free. Real terrain + ortho + LOD2 + trees is the **opposite** aesthetic. This is not a bug — it means the Context Engine must serve **two distinct render targets** (the abstract Forma massing study AND a photoreal/engineering context mode), and the founder must decide which is the default "3D Site" and whether they are one toggle or two views. **Needs a human decision.**
- **Google 3D Tiles ToS** restricts derivative/offline use — it can be *displayed* but not freely re-tiled/exported; Cityweft/Overture are cleaner for an engineering deliverable. **Needs a licensing decision** per target market.

---

## 8 — Phased roadmap (highest-impact-first, evolve-not-replace)

Global-scalability + perf budget are explicit: everything except the authored model streams as LOD-managed tiles; **target first-interactive < ~2 s** on the reference model.

| Phase | Deliverable | Touches | Contracts / ADRs | Effort | Unlocks |
|---|---|---|---|---|---|
| **Phase 0 — Loading-perf quick wins** (L-374a; ties L-355/356/358) | GLB export off critical path (worker/idle) + Draco compress; cross-view signature cache keyed on geometry not view; seat-once (no place-then-replace); defer non-critical context to post-first-frame | `GISAreaLayout.ts` (export/cache orchestration), `CesiumViewport.ts` (seat/placement), `GLBExporter.ts` (compression) | C10 (add view-activation budget — **gap**); C12 §8 (preserve); L-355/356/358 | **M** (1–2 wk) | The view becomes usable; every later phase loads on top of it |
| **Phase 1 — Real terrain** (L-374b) | Attach `TerrainProvider` (Cesium ion / Copernicus keyless); wire the already-coded `sampleTerrainMostDetailed`; clamp model + context to true ground | `CesiumViewport.ts:4589-4692` (terrain provider attach), new `TerrainProvider` adapter | **C12 §1.4** (extend); **new terrain contract — gap** | **M** (1–2 wk) | Truthful ground; ortho draping (Ph2); slope/cut-fill later |
| **Phase 2 — Orthophoto imagery** (L-374e) | Drape ortho `ImageryLayer` over terrain (Esri open → premium); toggle vs Forma flat mode | `CesiumViewport.ts:1277-1309`, new `ImageryProvider` adapter | **new imagery/draping contract — gap** | **S** (few days) | Photoreal context on the massing/engineering mode |
| **Phase 3 — Provider-agnostic Context Engine** (L-374f) | Extract provider interfaces + refactor `contextBuildings/roads/water/parks` behind adapters; `ContextEngine.streamContext`; localStorage cache generalized | new `@pryzm/context-engine` (L2/L3), `apps/editor/src/ui/geospatial/*`, `CesiumViewport` consumers | **new C12-CONTEXT-ENGINE contract — gap**; mirror ADR-0065 | **L** (3–4 wk) | Swap-in of any premium provider by config |
| **Phase 4 — LOD2/LOD3 buildings** (L-374c) | `BuildingProvider` adapters for Overture (open) + Cityweft/Google-3D-Tiles (premium); 3D-Tiles hand-off; keep OSM LOD1 fallback | Context Engine (Ph3), `CesiumViewport` tileset wiring | **new LOD2-ingestion contract — gap**; C12 §8 | **L** (3–4 wk) | Engineering-grade semantic context |
| **Phase 5 — Trees / vegetation** (L-374d) | `VegetationProvider`: Overture/OSM tree points → GPU-instanced impostors; premium LiDAR canopy | Context Engine, new instanced-tree renderer (Cesium/THREE) | **new vegetation contract — gap**; relates SPEC-RENDER-TIERS entourage A.24.4 | **M** (1–2 wk) | Entourage; realistic massing context |

**Dependencies:** Ph1→Ph2 (draping needs terrain); Ph3 is the abstraction that makes Ph4/Ph5 config-swaps; Ph0 is independent and comes first because it unblocks *testing* everything else.

---

## 9 — Contract / ADR / SPEC cross-reference

| Doc | Relevance |
|---|---|
| **C12-GEOSPATIAL** | §1 coordinate precision (strong); §1.4 datum boundary; §7 globe placement; §8 OSM context-fetch (L-368). **Gaps: no terrain/LOD2/vegetation/ortho/Context-Engine coverage.** |
| **SPEC-FORMA-SITE-VIEW** | §2 Forma abstract aesthetic (conflicts with engineering-context vision — §7.5); §11 verified globe pipeline; §8 single-projector rule. |
| **ADR-0268** | Cesium 3D-Tiles georeferenced placement (verified baseline; the placement anchor the Context Engine must respect). |
| **ADR-0088** | Gentle Overpass mirrors (preserve inside `OverpassBuildingProvider`). |
| **ADR-0065** | Geodata analytical layers *pluggable provider* — the pattern to mirror for the Context Engine (governs analytics, not base context). |
| **C10** | Performance/observability — **gap: no view-activation budget** (needed for Phase 0). |
| **L-355 / L-356 / L-358** | Existing loading-perf rows (71/69 MB GLB, double-render, cross-view re-export) — Phase 0 owns these. |
| **L-373** | Analytical-layers audit (sun/wind/temp/population) — sibling initiative, **not** duplicated here. |

---

*End of audit. No code was modified and no contract was flipped in producing this document.*
