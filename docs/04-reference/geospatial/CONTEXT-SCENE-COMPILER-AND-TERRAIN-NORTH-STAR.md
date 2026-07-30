# Context Scene-Compiler + Terrain — North Star (aspirational architecture)

> **Status: RESEARCH VISION / NORTH STAR — not a build spec, not a claim of current capability.**
> Founder-relayed direction (2026-07-24). Captures the target architecture for the 3D-Site "master
> context view": a **planning environment** (Forma/Hektar/Delve/Hypar/TestFit-class), not a GIS viewer.
> Honest framing per §CONTEXT-DATA-HONESTY: everything below is a *destination*, sequenced against the
> real, shipped context pipeline (`CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`) and the measured LOD/height
> work (`CONTEXT-LOD-BUILD-PLAN.md`, `jurisdictions/LOD-RATE-MASTER.md`). No percentage or capability
> here is asserted as built.

## 0 — The reframe

We are not building a GIS, and not a Cesium clone. The target is a **scene compiler**: raw geo-data
(parcels, terrain, buildings, trees, roads, zoning, rules) is compiled **offline** into an interactive,
semantically-rich 3D world optimised for design decisions. **The browser never touches GIS formats** —
it consumes prepared **scene tiles**. The GIS is offline ETL; the product is the compiler + the runtime
scene.

> Forma isn't reconstructing the Earth perfectly — it makes planners *believe* they're looking at the
> Earth. Different engineering goal → different architecture.

## 1 — Two deeply-requested gaps this addresses

1. **Terrain in the 3D-Site view — everywhere.** Long-requested, still missing. Terrain here is **not a
   DEM stream** — it is a **simplified mesh** (LOD pyramid, ~thousands→hundreds of triangles per tile),
   compiled offline from LiDAR/national DTM, drawn as triangles at runtime. Connects directly to the
   **height-of-parcels** work: the same LiDAR that gives terrain gives building heights (§2).
2. **A real height mechanism, worldwide** — see §2 (the nDSM engine). The two are one pipeline.

## 2 — The LiDAR nDSM Height Engine (the real IP)

The key realisation: **we don't need a "building-height dataset" — we need a height *computation
engine*.** That shifts dependency from ~dozens of inconsistent national height fields to **one
reproducible pipeline that runs anywhere LiDAR exists**; countries without open LiDAR (e.g. Saudi today)
fall back to lower-confidence methods (Overture attr → ML → assumption) through the *same* interface.

**Pipeline (per building, tile-parallel):**
```
footprint → find LiDAR tile → extract points (octree, buffer −0.5 m inward)
  → classify (ground/roof/veg/noise) → DTM (bare earth) + DSM (top surface)
  → nDSM = DSM − DTM → sample pixels/points inside the eroded footprint
  → robust statistic (P90 / trimmed median — NEVER max: chimneys/antennae)
  → terrain plane under building (perimeter DTM fit → handles slopes)
  → roof-plane RANSAC (1 plane=flat, 2=gable, 4=hip → approaches LOD-2)
  → confidence score → HEIGHT PROFILE (not a single number)
```

**Store a height *profile*, never one `height_m`** — this is the regulation-aware design decision that
matters more than ±10 cm accuracy, because jurisdictions define "building height" differently
(ridge/parapet/eaves/average-roof):
```json
{ "ground_elevation_m": 128.42, "roof_median_m": 139.87, "roof_p90_m": 140.15,
  "roof_peak_m": 141.02, "building_height_m": 11.73, "height_to_parapet": 11.6,
  "height_to_ridge": 12.3, "roof_type": "gable", "roof_pitch_deg": 32,
  "confidence": 0.94, "source": "lidar_ndsm", "lidar_epoch": "2025-04", "algorithm_version": "v2.3.1" }
```

The defensible IP is **everything after `DSM − DTM`**: footprint conditioning, vegetation rejection,
terrain-plane estimation, roof segmentation, confidence + provenance, incremental per-tile recompute.
LiDAR density needed: even ~2 pts/m² suffices for LOD-1. Ties to the shipped `heightProvenance`
(`tagged`/`derived-levels`/`assumed`) — the nDSM output is the top `tagged` tier.

## 3 — The Scene Tile (the runtime unit)

Not a map tile — a **self-contained scene** (~256 m or 512 m; planners rarely work > 2 km):
```
Tile (256 m)
├── Render assets:  Terrain.mesh · Buildings.glb (procedural LOD) · Trees.instances · Roads.mesh · Water.mesh · Textures.ktx2
└── Knowledge graph: Building/Parcel/Terrain objects · Planning rules · Relationships  (Metadata.arrow)
```
**Both representations share object IDs.** The renderer consumes meshes; the planning engine consumes
the graph. Clicking a building is not a raycast into arbitrary triangles — it retrieves the *planning
object* (zoning, allowed height, FAR, current FAR, redevelopment potential). **That is the distinction
that turns a 3D viewer into a planning platform** — and it's the natural home for the Living Building
Graph (L-611) + C27 Inspect.

## 4 — Compilers (offline, independent, per-domain)

```
RAW (LiDAR/Overture/OSM/satellite) → ETL → spatial DB → SCENE COMPILER → scene tiles (obj storage) → streaming API → WebGPU
```
- **Terrain compiler** — LiDAR ground → triangulate → simplify → continuous-LOD (vertex-collapse, morph, no popping) → meshopt.
- **Building compiler** — Overture footprint + height profile + roof type → **procedural** LOD100/150/200 mesh (no artists; flat/gable/hip generators) → glTF/meshopt.
- **Vegetation compiler** — canopy dataset → instances (one model × 100k, GPU-cheap).
- **Roads/water compilers** — centrelines/polygons → extrude/triangulate → mesh.
- **Scene assembler** — the only component that merges them, by shared object ID.

Improve any one compiler without touching the others. Store tiles in object storage (S3/R2), metadata in
Postgres. A national LiDAR refresh recompiles **only the changed tiles' buildings**, versioned — never a
national rerun. Build farm = game-asset pipeline.

## 5 — Honest sequencing (this is the ceiling, not the next sprint)

This is a **multi-quarter programme**, deliberately staged on top of what ships today:
1. **Now (shipped/landing):** flat-ground Forma context = OSM/Overture footprints extruded by
   `height`/`levels` (LOD100). Overture fixes density (Riyadh 5.3×). `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`.
2. **Near:** wire national **height** sources (`heightSources.mjs` — 3DBAG/BD TOPO/Catastro/LoD2-DE) →
   real LoD1 heights per city (kills the 9 m default). `CONTEXT-LOD-BUILD-PLAN.md`.
3. **Terrain-in-3D-Site:** compile national DTM/LiDAR → terrain mesh tiles → drop into the Cesium/Three
   scene under the buildings (the long-requested gap). Start where DTM is open (NL/DK/CH/FR/ES-ICGC).
4. **The nDSM height engine (§2):** the real-height mechanism worldwide + roof types (→ LoD2).
5. **The scene compiler + scene tiles (§3/§4):** the full re-architecture — the destination.

**Never claim any stage is done until it renders + is measured.** The strategic moat is not the building
layer (everyone can get footprints) — it is **existing reality + legal envelope + the semantic
knowledge-graph tile**. That is where PRYZM beats a pretty viewer.

---

## 6 — Detailed Implementation Plan (build guide — hand this to the engineer/agent)

> This section is prescriptive: file paths, schemas, libraries, algorithms, acceptance criteria. It
> assumes the PRYZM monorepo (`pnpm`, 8-layer model). **Every phase is independently shippable** and
> gated by "renders + is measured" — do not mark a phase done on code-merge alone. A companion tracker
> lives in `CONTEXT-SCENE-COMPILER-IMPLEMENTATION-PLAN.md` (status columns); THIS is the how.

### 6.0 — Conventions (binding on all phases)

- **Placement:** offline compilers live in `tools/context-bake/` (Node) and a new `tools/height-engine/`
  (Python — PDAL/laspy/GDAL). Schemas in `packages/schemas/src/elements/site/context/` (**L0**, pure
  Zod). Client render/stream in `apps/editor/src/ui/geospatial/`. Server tile API in `server/`.
- **Provenance is mandatory** on every derived value: `source`, `algorithm_version`, `epoch`,
  `confidence`. A value without provenance MUST NOT ship (mirror C57 §1.4).
- **Never fabricate.** Missing height → the honest fallback tier, flagged; never a silent default sold
  as measured. Robust statistics only (P90/trimmed-median, never max/mean).
- **Determinism:** every compiler is `(input, version) → identical output`. Version-stamp all outputs;
  never overwrite (append a new `algorithm_version`).
- **Tile key:** WebMercator, zoom 15 (~256 m), or a fixed 256 m metric grid. One key scheme everywhere.

---

### 6.1 — PHASE 1 · National heights into the bake (SHIP FIRST · effort M · ~1 week)

**Goal:** kill the 9 m default — real LoD1 heights per city from national sources. The module is BUILT
(`tools/context-bake/heightSources.mjs`, 3 sources live-proven: 3DBAG, BD TOPO, Catastro). Only the
integration + dedup remain.

**Steps:**
1. Wire the documented one-liner into `tools/context-bake/bake.mjs`'s buildings-layer loop (per
   `CONTEXT-LOD-BUILD-PLAN.md` §integration): after the OSM/Overture export,
   `const nat = await resolveHeights(r.name, {bbox}); if (nat.status==='ok') geos.push(nat.geojsonseq);`
2. **Dedup policy** (documented §3 of the build plan): a *full* national source (3DBAG/BD TOPO/Catastro/
   LoD2-DE) **replaces** the region's OSM/Overture footprint clip for that layer; a *partial* source
   appends. Implement as a per-region `heightMode: 'replace'|'append'`.
3. Stamp `heightProvenance:'tagged'` on nationally-sourced buildings; keep `derived-levels`/`assumed`
   for the rest (already in `contextBuildings.ts`).
4. Extend the sources: add **LoD2-DE (NRW open CityGML)** and **DK GeoDanmark/DHM** fetchers to
   `heightSources.mjs` (mirror the 3 done). Each: bbox → footprint+height → GeoJSONSeq, never-throws.
5. Reconcile with the Overture `bake.mjs` change (the two edits co-locate in the buildings loop).

**Acceptance:** re-bake Paris/Amsterdam/Madrid → `buildings.pmtiles` carries real `height` on >70% of
buildings (verify with a tile inspector); the 3D-Site renders varied heights, not a flat 9 m field.
**Deliverable:** updated `bake.mjs` + `heightSources.mjs` (+2 sources) + a re-dispatched bake.

---

### 6.2 — PHASE 2 · Height-profile schema (GATES 3–5 · effort S–M · ~3 days)

**Goal:** one regulation-aware datum so nothing hardcodes a single `height_m`. **Do this before terrain
or nDSM code.**

**Create** `packages/schemas/src/elements/site/context/heightProfile.ts` (**L0**, pure Zod):
```ts
export const HeightProfile = z.object({
  ground_elevation_m: z.number().nullable(),      // terrain datum under the footprint (Phase 3/4)
  roof_median_m: z.number().nullable(),
  roof_p90_m: z.number().nullable(),
  roof_peak_m: z.number().nullable(),
  building_height_m: z.number().nullable(),        // the "canonical" height (P90 − ground)
  height_to_parapet_m: z.number().nullable(),
  height_to_ridge_m: z.number().nullable(),
  height_to_eaves_m: z.number().nullable(),
  roof_type: z.enum(['flat','gable','hip','shed','complex','unknown']),
  roof_pitch_deg: z.number().nullable(),
  floors_est: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  provenance: z.enum(['lidar_ndsm','national_lod2','national_lod1','osm_tag','levels_x_h','assumed']),
  source: z.string(),                              // dataset id, e.g. 'PNOA_2025' / '3DBAG'
  epoch: z.string().nullable(),                    // acquisition date
  algorithm_version: z.string(),
});
```
- **Migrate consumers:** C58's envelope solver reads `height_to_parapet_m ?? building_height_m` per the
  jurisdiction's height definition (add a `heightDefinition` field to each rule pack: ridge/parapet/…).
  C57 parcel provenance gains a `heightProfile` ref. `contextBuildings.ts` maps `heightProvenance` →
  `provenance` enum.
- **Backfill:** the current bake fields (`height`, `building:levels`) map to a minimal profile
  (`provenance:'osm_tag'|'levels_x_h'`, low confidence).

**Acceptance:** the schema compiles L0 (no I/O/THREE/DOM); C58 reads the correct height field per
jurisdiction; a golden-fixture building round-trips profile → envelope. **Deliverable:** the Zod schema
+ the C58 `heightDefinition` per pack + a migration note in C57/C58.

---

### 6.3 — PHASE 3 · Terrain in the 3D-Site view (the requested gap · effort H · ~3–4 weeks)

**Goal:** terrain mesh under the buildings, everywhere DTM is open. Does NOT need the full nDSM engine —
national DTM rasters suffice.

**Offline pipeline** (`tools/context-bake/terrain.mjs` or `tools/height-engine/terrain.py`):
```
national DTM raster (GeoTIFF, per country) → clip to tile bbox → resample to a fixed grid (e.g. 1 m)
  → mesh: RTIN/Delatin or MARTINI (error-bounded TIN) → simplify (meshoptimizer) → LOD pyramid
  → encode: Cesium quantized-mesh (.terrain) OR glTF/meshopt per tile → object storage (R2)
```
- **Libraries:** GDAL (`gdalwarp`/`gdal_translate`), `pydelatin` or `martini` (JS) for raster→TIN,
  `meshoptimizer` for simplify/compress, `quantized-mesh-encoder` (npm) for Cesium terrain, or `gltf` +
  `KTX2` for the Three path.
- **Datum alignment (CRITICAL, L-584):** terrain, buildings, and the parcel envelope MUST share one
  vertical datum. Sample the DTM at the parcel centroid for the site origin; the envelope's rasant/
  terrain must read the SAME DTM (this fixes L-584's single-point sampling — the terrain mesh gives the
  façade rasant). Reproject via the single C12 `proj4` projector.
- **Runtime:** Cesium `CesiumTerrainProvider` pointed at the R2 quantized-mesh tileset (cleanest — Cesium
  already streams terrain); OR a Three custom terrain layer reading the glTF tiles. Buildings sit ON the
  terrain (offset each building's base to the DTM height under its footprint).
- **Sources (start with open DTM):** NL AHN (0.5 m), DK DHM/Terræn (Datafordeler), CH swissALTI3D, FR
  RGE ALTI / IGN, ES PNOA MDT + ICGC (Catalonia). Build a per-country `TERRAIN_SOURCE` map like
  `REGION_SOURCE`.

**Acceptance:** open a Copenhagen/Amsterdam site → sloped terrain renders under the context buildings;
the parcel sits on real ground; the envelope datum matches the terrain (no floating/buried buildings).
**Deliverable:** `terrain.mjs`/`.py` + a `terrain.pmtiles`-equivalent (quantized-mesh) tileset on R2 +
the Cesium terrain-provider wiring + the L-584 datum fix.

---

### 6.4 — PHASE 4 · The nDSM height engine (the moat · effort XL · ~2–3 months)

**Goal:** measured heights + roof types anywhere LiDAR exists. **Python service** (`tools/height-engine/`),
tile-parallel build farm. This is the real IP.

**6.4.1 LiDAR Tile Registry** (`Postgres` table):
`country · tile_id · bbox · epsg · density_ppm2 · year · classification(bool) · license · download_url`.
Populate per-country from national LiDAR indexes (NL AHN, DK, CH, NO Kartverket, FR IGN LiDAR HD, ES
PNOA, US 3DEP). This is the discovery layer.

**6.4.2 Per-building pipeline** (12 stages, `pipeline.py`):
1. **Acquire** — resolve footprint bbox → registry → download `.laz` tile(s). Cache locally.
2. **Normalize CRS** — reproject to the tile's metric CRS (never geographic). GDAL/PDAL.
3. **Read** — PDAL/laspy; keep XYZ + Intensity + Classification + ReturnNumber.
4. **DTM** — ground points (class 2, or SMRF/CSF filter if unclassified) → TIN/IDW → 0.5–1 m raster.
5. **DSM** — highest return per pixel → raster.
6. **nDSM** — `DSM − DTM` (rasterio).
7. **Footprint conditioning** — validate/repair geometry (shapely `make_valid`), simplify, **split
   merged polygons** (the "one polygon = 3 villas" problem — Spain/Saudi; use ridge-line/party-wall
   detection from the nDSM), then **buffer −0.5 m inward** (erode).
8. **Sample** — all nDSM cells inside the eroded footprint.
9. **Vegetation reject** — use class 5, or if unclassified: surface-roughness / planarity (roofs planar,
   trees chaotic) — drop rough cells.
10. **Roof RANSAC** — `pyransac`/open3d plane fitting → count planes → roof_type + pitch.
11. **Heights** — `roof_p90 = P90(cells)`; `ground = local plane fit of perimeter DTM` (handles slope);
    `building_height = roof_p90 − ground`; derive parapet/ridge/eaves from the roof planes.
12. **Confidence** — weighted: LiDAR density 20 · roof-point count 15 · veg-overlap 15 · footprint
    quality 15 · plane-fit residual 20 · terrain uncertainty 15 → 0..1. Emit the **HeightProfile** (§6.2).

**6.4.3 Build farm:** tile queue (SQS/Redis) → workers (containerized Python) → write `HeightProfile`
per `building_id` (anchored on the Overture id) to Postgres + a per-tile Arrow file. **Incremental:**
a LiDAR tile republish → recompute only its buildings, bump `algorithm_version`.

**6.4.4 API:** `GET /building/{id}` → the HeightProfile JSON. Feeds the bake (top `tagged` tier) + the
scene tiles (§6.5) + C58.

**Acceptance:** for a LiDAR-covered city, ≥90% of buildings get a `lidar_ndsm` HeightProfile with
confidence + roof type; spot-check 20 against known heights (±0.5 m). Fallback (no LiDAR) → Overture/ML/
assumed through the same interface. **Deliverable:** `tools/height-engine/` service + registry +
`/building/{id}` API + the LOD-RATE height columns re-measured upward for LiDAR countries.

---

### 6.5 — PHASE 5 · Scene compiler + scene tiles (the destination · effort XL · multi-quarter)

**Goal:** the Forma-class runtime. Do NOT start before 1–4 prove the data.

**6.5.1 Scene tile format** (`.snap` = a container, or a zip/tar of):
`terrain.glb · buildings.glb (procedural LOD100/150/200) · trees.instances(arrow) · roads.glb ·
water.glb · textures.ktx2 · metadata.arrow (knowledge graph: object_id → planning object)`.
Both halves share `object_id` (Overture building id / parcel refcat / terrain surface id).

**6.5.2 Per-domain compilers** (`tools/scene-compiler/`):
- **Terrain compiler** = §6.3 output, per tile.
- **Building compiler** — footprint + HeightProfile + roof_type → procedural mesh (flat: extrude; gable/
  hip: generate from pitch + ridge). LOD100 (box) / LOD150 (real height box) / LOD200 (roof). glTF +
  meshopt. No artists.
- **Vegetation compiler** — canopy dataset (or OSM trees) → `TreeInstance{x,y,z,species,height,rot}`.
- **Roads/water compilers** — centrelines → offset/width/curbs → mesh; polygons → triangulate.
- **Scene assembler** — merges per `object_id`; emits the tile; writes metadata.arrow.

**6.5.3 Runtime** (`apps/editor/src/ui/geospatial/sceneStream/`):
- Streaming API `GET /scene/{z}/{x}/{y}.snap` (server, from R2). Camera → needed tiles (~dozen) → fetch
  parallel → GPU. Unload distant tiles. Continuous LOD (vertex-collapse morph, no popping).
- **Picking = BVH per tile** (not scene.traverse) → click → `object_id` → knowledge-graph lookup →
  planning object (zoning/allowed-height/FAR/redevelopment). This is the Living Graph (L-611) + C27
  Inspect binding.
- Materials via shader blend (satellite + landcover + slope), KTX2 textures.

**Acceptance:** open Barcelona → terrain + buildings + trees + roads stream in <2 s, 60 FPS at 2 km;
click any building → its planning object (not a raycast into triangles). **Deliverable:** the
`tools/scene-compiler/` + the scene-tile format spec + the streaming renderer + the graph-binding.

---

### 6.6 — C-CONTEXT contract (draft in parallel with Phase 2)

> **Sourcing + decisions now recorded.** The per-jurisdiction terrain + height **sourcing** (dataset ·
> endpoint · auth · licence · verdict, all rows) is canonicalised in
> [`jurisdictions/GEO-DATA-SOURCING-MASTER.md`](jurisdictions/GEO-DATA-SOURCING-MASTER.md), and the
> **decisions** it encodes (open-first/keyless; DERIVE heights from open DSM−DTM where no product exists;
> Germany per-Land; unofficial APIs best-effort; Saudi = keyless Copernicus GLO-30 + GlobalBuildingAtlas
> fallback; Spain heights = MDS Edificación) are recorded in
> [`../02-decisions/adrs/ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md`](../02-decisions/adrs/ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md).
> ADR-0277 **recommends this contract take the next free number C61** — it is flagged for the founder,
> not minted. Fold principles (a)–(f) of ADR-0277 in on ratify.

Ratify a new contract "Context Scene, Height & Terrain Engine" with these invariants:
1. HeightProfile is the canonical height datum; no consumer stores a bare `height_m`.
2. Robust statistics only (P90/trimmed-median); eroded footprint; terrain-plane ground.
3. Provenance + confidence mandatory; never-fabricate; versioned, never overwritten.
4. One vertical datum across terrain/buildings/envelope (L-584); one C12 projector.
5. Render assets and the knowledge graph share `object_id`.
6. Strict separation from the buildable-rule rate (C58) — this is the physical/context axis.

### 6.7 — Per-country data-source table (build this first as a spreadsheet)

> **BUILT — see [`jurisdictions/GEO-DATA-SOURCING-MASTER.md`](jurisdictions/GEO-DATA-SOURCING-MASTER.md).**
> That doc is the canonical per-jurisdiction sourcing table (terrain + height · dataset · endpoint · auth ·
> licence · verdict · CI/secret notes) plus a "Founder actions required" list and a "Keyless — pure
> engineering" list. Decisions in ADR-0277. This §6.7 sketch is superseded by it.

Columns: `country · DTM source+licence · LiDAR source+density+licence · footprint (Overture/national) ·
national LoD2 (y/n) · reachable-keyless (y/n)`. Seed from `LOD-RATE-MASTER.md` + the parcel-select
coverage doc. Drives phase ordering (do open-LiDAR countries first: NL/DK/CH/NO/FR/ES).

### 6.8 — Tech stack

Python (PDAL, laspy, rasterio, shapely, open3d, numpy, scipy) for the height/terrain engines · Node
(GDAL bindings, martini/pydelatin, meshoptimizer, quantized-mesh-encoder, tippecanoe) for tiling ·
Postgres+PostGIS for the registry + metadata · R2/S3 for tiles · Cesium (terrain provider) + Three/WebGPU
(scene) · Apache Arrow for metadata · KTX2 for textures.

### 6.9 — Milestones, sequencing, risk

- **M1 (weeks):** Phase 1 (heights in bake) + Phase 2 (schema) → real heights render. Low risk.
- **M2 (~1 month):** Phase 3 terrain on 5 open-DTM countries → the requested gap closes. Medium risk
  (datum alignment L-584 is the trap — solve it first on ONE city).
- **M3 (~quarter):** Phase 4 nDSM engine on LiDAR countries → measured heights + roofs. High risk
  (footprint-split + veg-reject are the hard sub-problems; budget research time).
- **M4 (multi-quarter):** Phase 5 scene compiler → Forma-class runtime. Highest risk; only after data
  proves out.
- **Top risks:** (a) LiDAR licensing per country (verify before building a country's pipeline — some
  are non-commercial); (b) vertical-datum mismatches (one city first); (c) merged-footprint splitting
  (its own research problem — Spain/Saudi villas); (d) scope creep on Phase 5 (resist until 1–4 ship).

---
*Cross-refs: `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` (shipped pipeline) · `CONTEXT-LOD-BUILD-PLAN.md` +
`heightSources.mjs` (height build) · `jurisdictions/LOD-RATE-MASTER.md` (measured LOD per country) ·
`CONTEXT-DATA-TERRAIN.md` (terrain notes) · L-584 (terrain-as-legal-datum) · L-611 + C27 (Living Graph /
Inspect — the knowledge-graph half) · `PLANNING-COMPILER-NORTH-STAR.md` (the rules-side compiler).
Maintainer: UNASSIGNED. This is a research vision, not a commitment.*
