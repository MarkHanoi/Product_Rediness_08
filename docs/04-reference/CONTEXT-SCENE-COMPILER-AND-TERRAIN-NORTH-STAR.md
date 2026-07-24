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
*Cross-refs: `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` (shipped pipeline) · `CONTEXT-LOD-BUILD-PLAN.md` +
`heightSources.mjs` (height build) · `jurisdictions/LOD-RATE-MASTER.md` (measured LOD per country) ·
`CONTEXT-DATA-TERRAIN.md` (terrain notes) · L-584 (terrain-as-legal-datum) · L-611 + C27 (Living Graph /
Inspect — the knowledge-graph half) · `PLANNING-COMPILER-NORTH-STAR.md` (the rules-side compiler).
Maintainer: UNASSIGNED. This is a research vision, not a commitment.*
