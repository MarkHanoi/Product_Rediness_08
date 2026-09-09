<!--
  PRYZM USA — the founder's data research, captured verbatim-in-substance, 2026-09-09.

  ⭐ WHY THIS FILE EXISTS. Standing rule [[capture-founder-research-to-repo]]: founder research goes
  into the repo the same turn it arrives, because a chat is not a durable artefact and this research
  cost real time to assemble. Every link and every number below is HIS, not mine.

  ⛔ AND IT IS RESEARCH, NOT A DETERMINATION. Nothing here has been verified by PRYZM. The section
  "WHAT PRYZM ACTUALLY HAS TODAY" at the bottom IS measured, and where the two disagree the measured
  half wins. Several of his conclusions are ALREADY OBSOLETE because PRYZM has more than he thought.
-->

# PRYZM USA — Delaware / Sussex County demo

**Trigger, 2026-09-09:** *"I have a demo to do quickly for a huge home builder. I need to have the
level of quality we are planning for BARCELONA in USA."*

**The site:** `38.781987, -75.089744` — Lewes / Cape Henlopen, **Sussex County, Delaware**.

---

## ⭐⭐ WHAT PRYZM ACTUALLY HAS TODAY — MEASURED 2026-09-09, and it changes the plan

Read this before the research below. The founder's plan assumes PRYZM is starting from nothing in
the USA. It is not.

| Fact | Measured how |
|---|---|
| **`delaware` is ALREADY a declared bake region** — `bbox '-75.79,38.45,-74.98,39.85'`, `heightJoin: 'usas'`, `pending: true` | `tools/context-bake/bake.mjs:702` |
| ⚠ **CORRECTED 2026-09-09 — this row said "46 regions, 7 layers" and that reading is FALSE.** The 2026-09-07 merge carried `mergedLayers: ['buildings']` ONLY; the other six layers are `carriedForward` from earlier runs over a DIFFERENT 49-region set. **buildings** ships state-level US rows (california, illinois, massachusetts, newyork, texas); the other six ship **city bboxes only** (newyork, sanfrancisco, chicago, austin, houston, boston). So "bake-and-publish, the pipeline already works" is established for Delaware **BUILDINGS ONLY** — no US region has ever shipped state-level roads/water/parks/landuse/rail/trees, and that leg is unproven work. See [DELAWARE-PUBLISH-DISPATCH-PLAN.md](./DELAWARE-PUBLISH-DISPATCH-PLAN.md). | measured live, workflow wf_a4f83f97-e65 |
| **Delaware is NOT live** — `pending: true` means declared and NEVER STAGED; `merge-tiles.mjs` deliberately keeps an unstaged row out of `expect=all` (§PENDING-REGION) | manifest has no `delaware` key |
| **Heights for every US row come from `usas`** — the FEMA/ORNL *USA Structures* join, **135,321,228 structures** | `bake.mjs:661`, `heights/usasNationalStamp.mjs` |
| **53 of 54 US rows are `pending`** — only `newyork` was live when they were added | `bake.mjs:691` |
| **US jurisdiction rule packs exist for CA, IL, NY — NOT Delaware** | `docs/04-reference/jurisdictions/us/{us-ca,us-il,us-ny}` |
| **No Sussex County parcel provider** | no DE entry beside `CatastroParcelProvider` / the EU registers |

⛔ **SO THE HEADLINE IS: the buildings/roads/trees/water/parks/landuse layers for Delaware are a
BAKE AND A PUBLISH, not a build.** The pipeline that produced California and New York is the same
one. That is days, not weeks — and it is a completely different project from the parcel and
ordinance work, which genuinely does not exist for Delaware yet.

⚠ **Two things are NOT solved by that bake and must not be conflated with it:**
1. **Parcels.** Spain has Catastro wired as a live provider. Delaware has none. Without it the
   parcel-select flow has nothing to click, and the founder's whole Site tab is parcel-first.
2. **The envelope.** Barcelona's envelope comes from a rule pack citing PGM Art. 242.2. Sussex
   County zoning has no rule pack at all. §ENVELOPE-NOT-A-GATE means the process still runs, but
   the demo would show "no determination held" where Barcelona shows a solved envelope.

---

## THE FOUNDER'S RESEARCH — his sources, his rankings

### National building data — his ranking

| | Microsoft | Open City Model | Overture |
|---|---|---|---|
| Current | ✗ old | ⚠ old | **✓ monthly** |
| Footprint | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **⭐⭐⭐⭐⭐** |
| Height | ✗ | ⭐⭐⭐ | **⭐⭐⭐⭐** |
| Roof attributes | ✗ | ✗ | **✓** |
| Actual roof geometry | ✗ | ✗ | ✗ |
| CityGML / CityJSON | ✗ | **✓** | ✗ |
| License | ODbL | ODbL | ODbL |
| **His verdict** | fallback | reference | **primary** |

- **Overture Maps Buildings** — https://docs.overturemaps.org/guides/buildings/
  ~2.53 bn buildings globally, monthly. Schema carries `height`, `min_height`, `num_floors`,
  `roof_shape`, `roof_height`, `roof_direction`, `facade_material`, `class`, `subtype`, `sources[]`.
  Cloud-native GeoParquet on S3, queryable by bbox with DuckDB:
  `s3://overturemaps-us-west-2/release/2026-08-19.0/theme=buildings/type=building/`
- **Open City Model** — https://github.com/opencitymodel/opencitymodel
  ~125 M US buildings as CityGML/CityJSON/Parquet, ODbL, state→county partitioned. ⚠ **LoD1 only**;
  many heights are ML/regression estimates. His verdict: reference and validation, not the product.
- **Microsoft US Building Footprints** — https://github.com/microsoft/USBuildingFootprints
  129,591,852 footprints, ODbL, but old and footprint-only. Fallback.

### Elevation → the LoD200 route
- **USGS 3DEP** — https://www.usgs.gov/3d-elevation-program/what-3dep
  99% of the nation available or in progress (FY2025). **Public domain** — the only licence-clean
  foundation in his whole list.
- **3DEP LiDAR on AWS** — https://registry.opendata.aws/usgs-lidar/
  Entwine Point Tiles, streamable octree, **no AWS account needed**.
- **3DBAG Roofer** — https://github.com/3DBAG/roofer
  Automatic LoD1.2 / 1.3 / **2.2** reconstruction from point cloud + roofprint. The Dutch 3DBAG
  production pipeline. His first candidate for a PRYZM roof engine.

### A live 3D Tiles service he found — worth knowing about
- **Re:Earth Buildings** — https://buildings.reearth.land/tileset.json
  Open, on-demand 3D Tiles 1.1 from Overture, browser CORS, monthly. Loads in one line:
  `Cesium.Cesium3DTileset.fromUrl("https://buildings.reearth.land/tileset.json")`
  ⚠ **His own caveat, and it is the right one:** its height ladder is
  `explicit height → floors×3 m → class estimate → subtype estimate → footprint heuristic`.
  That is a good LoD100/150, **not** LoD2.

### Parcels — the hard part
⛔ **The USA has no authoritative open nationwide parcel database.** Parcels are county-maintained.
- **Regrid** — https://regrid.com/api — claims 100% US coverage, 160 M+ records, MVT vector tiles
  z10–21. **Commercial.**
- **LandRecords.us** — ~155 M parcels, ~100 GB GeoPackage, quarterly. ⛔ **CC BY-NC-ND** — wrong
  licence for a commercial derived product.
- **BLM PLSS** — https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI_NAD83/MapServer
  ⚠ Township/Range/Section, **NOT tax parcels**. A trap; useful only as a survey grid.

---

## ⭐ DELAWARE SPECIFICALLY — and this is why the site was well chosen

Delaware has an unusually strong state GIS stack, most of it as **live ArcGIS REST services**, so
PRYZM can query by bbox instead of downloading the state.

| PRYZM layer | Source | Endpoint |
|---|---|---|
| 📐 **Parcels** | **Sussex County GIS** | `https://map.sussexcountyde.gov/trdserver/rest/services/Geographic_Information_Office/Parcels_PIN/MapServer` |
| 📐 Parcels (state) | FirstMap State Parcels | `.../PlanningCadastre/DE_StateParcels/FeatureServer/0` |
| 🛣 Roads | DelDOT Roadways | `.../Transportation/DE_Roadways_Main/FeatureServer` |
| 🛣 Roads + addresses | County Roads & Addresses — **all 3 counties, refreshed monthly** | `.../Location/County_Roads_and_Addresses/FeatureServer` |
| 🌿 Land cover | **Delaware 2022 LULC** — manually reviewed against 2022 ortho at ~1:5,000 | `.../PlanningCadastre/DE_LULC/FeatureServer/4` |
| 🏞 Wetlands | DNREC 2017 — high marsh / low marsh / high-water mark, MMU ~0.25 acre | `.../Hydrology/DE_Wetlands/MapServer` |
| 🌳 Tree canopy | NLCD/USFS percent canopy | `.../Biota/DE_Tree_Canopy/MapServer` |
| 🌳 Forestry | State Forest, Urban Tree Canopy ⚠ derived from **2012–2014** imagery/LiDAR | `.../Biota/DE_Forestry/MapServer` |
| ⛰ LiDAR index | **2023 QL1**, 2,238 tiles covering the state, ~1,700 m tiles | `.../Boundaries/DE_Index/MapServer/5` |
| 🌊 Hydrography | NHD-derived | `.../Hydrology/DE_Watersheds/FeatureServer` |

(host: `https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/`)

⚠ **That host is `firstmaptest`.** A *test* hostname is not a production contract — before anything
depends on it, find the production host or confirm this one is the published endpoint. Building a
demo on a test server is exactly the kind of thing that is fine on Tuesday and gone on Thursday.

### The coastal layer he asked for
Cape Henlopen is not a generic inland site. He wants LAND split into developed / forest / grass /
**dunes / beach / marsh / wetland** / agriculture, and WATER into ocean / bay / **tidal creek** /
pond / drainage. The DNREC wetland classes support most of this directly.

---

## HIS PROPOSED LOD LADDER

```
BUILDINGS   P0 footprint · P1 extrusion · P2 measured height + roof · P3 roof planes · P4 photogrammetry/BIM
ROADS       R0 centreline · R1 polygon · R2 + sidewalk/median · R3 lane markings
VEGETATION  G0 land-cover polygon · G1 canopy polygon · G2 individual tree · G3 detailed 3D tree
WATER       W0 polygon · W1 bank/shoreline · W2 3D surface / bathymetry
```

⭐ **And per-object provenance + confidence, which is already PRYZM's culture (C62):**
```json
{ "sources": { "footprint": "overture", "height": "USGS_3DEP_2023",
               "roof": "PRYZM_LiDAR", "parcel": "SussexCounty" },
  "confidence": { "footprint": 0.98, "height": 0.96, "roof": 0.91, "parcel": 0.99 } }
```
His confidence ladder: 1.00 direct authoritative · 0.95 LiDAR-derived · 0.90 municipal 3D model ·
0.80 Overture explicit · 0.60 floor count · 0.40 class heuristic · 0.20 footprint heuristic.

⚠ PRYZM already has `ValueProvenance` / `ElementConfidence` on 32 of 32 element kinds with a hard-0
gate. This should REUSE that, never mint a parallel confidence scheme.

## HIS EXPLICIT "DO NOT"
- ✗ Don't scrape Google Maps geometry — it is the visual reference in his link, not a source.
- ✗ Don't use OSM as the authoritative Delaware road layer — DelDOT is better; OSM is supplemental.
- ✗ Don't buy a commercial 3D city model for Delaware — there is enough public data.
- ✗ Don't make every tree a high-poly mesh — forest = canopy geometry, city = instanced trees.
- ✗ Don't process 125 M buildings up front — tile-driven, pay LiDAR cost only where needed.

## HIS INSTRUCTION ON SEQUENCE
> *"Don't start with all 50 states. Start with this Delaware/Cape Henlopen tile and make it
> perfect."* — a 10 × 10 km reference tile carrying buildings, parcels, roads, addresses, terrain,
> water, wetlands, land cover, trees.
