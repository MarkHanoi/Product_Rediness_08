<!--
  PRYZM USA — the founder's SECOND Delaware research round (county schemas + REST services),
  captured verbatim-in-substance on 2026-09-11, the turn it arrived.

  ⭐ WHY THIS FILE EXISTS. Standing rule [[capture-founder-research-to-repo]]: founder research goes
  into the repo the same turn it arrives. Every endpoint, field name and recommendation below is HIS.
  The first round (2026-09-09) is USA-DELAWARE-DEMO-SOURCES.md; this round goes one level deeper —
  the county building/structure schemas — and changes the height plan.

  ⛔ IT IS RESEARCH, NOT A DETERMINATION. Nothing here had been probed by PRYZM when it was written.
  Lane DELAWARE-HEIGHTS (L-13314) probes each endpoint live and appends a MEASURED section at the
  bottom; where the two disagree, the measured half wins (§GETCAPABILITIES-IS-NOT-AN-INVENTORY,
  §BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS: a named field in a schema is not a populated one).
-->

# Delaware — county building & structure sources (founder research, round 2)

**Trigger, 2026-09-11:** *"can you please launch another agent to get the remaining R2 layers for my
demo on delaware ready? also we need real buildings heights."*

**Why it matters for the demo:** the site `38.781987, -75.089744` (Lewes / Cape Henlopen) is in
**Sussex County**, where the current height source (FEMA/ORNL *USA Structures*, `heightJoin: 'usas'`)
carries **zero heights** — 1,198 structures, 0 heights (`§USAS-IS-EMPTY-IN-SUSSEX`,
USA-DELAWARE-DEMO-SOURCES.md). Every building at the demo site renders at the fabricated 9 m default.

---

## ⭐ THE FOUNDER'S HEADLINE

> *"After a deeper review of the actual county schemas and REST services … you do not need to derive
> everything from LiDAR everywhere. In New Castle County in particular, there is already a remarkably
> good building/structure layer with parcel ID, number of stories, and `HEIGHT`. For Sussex, there is
> a building-footprint layer with `FLOORS`, while the parcel layer has PINs and assessment attributes.
> Kent has excellent parcel and footprint APIs, but the footprint layer itself does not expose height,
> so LiDAR is the right fallback. That gives you a very good Delaware equivalent of the Catastro +
> building characteristics stack."*

```text
                         DELAWARE PROPERTY GRAPH
 PARCEL / CADASTRE      FirstMap State Parcels + county parcel systems (PIN / GPIN / PARCELID)
        │ spatial/key join
        ▼
 BUILDING / STRUCTURE   New Castle: Structures → HEIGHT + NUM_STORIES
                        Sussex:     Building Footprints → FLOORS
                        Kent:       Building Footprints → no height
        │ missing / validation
        ▼
 LiDAR                  Delaware 2023 QL1 classified LAS 1.4 · 0.35 m nominal pulse spacing · 2,238 tiles
        ▼
 derived height / floors
```

---

## 1 · STATE — FirstMap

| id | service | what it carries (founder's reading) |
|---|---|---|
| **S1** | `https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/FeatureServer/0` | "State of Delaware Parcels with Ownership Information" — layers `State Parcels /0`, `Parcel Centroids /1`. Fields `PIN`, `ACRES`, `COUNTY`, `UPDATED`, geometry. JSON / GeoJSON / PBF, pagination, SQL + spatial queries. Query pattern: `…/0/query?where=1=1&outFields=*&returnGeometry=true&outSR=4326&f=geojson` — **paginate in production**. Role: `parcel.state_pin`, `parcel.geometry`, `parcel.county` — *"don't throw away county identifiers."* |
| **S2** | `https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/Boundaries/DE_Index/FeatureServer/5` (also `/MapServer/5`) | USGS LiDAR Index for the 2023 delivery: **2,238 tiles, 1,700 m × 1,700 m**, tile `NAME` from the north-west corner coordinates. *"The first API you call before downloading LiDAR."* |
| **S3** | `https://imagery.firstmaptest.delaware.gov/imagery/rest/services/Elevation_SP/DE_Lidar_DEM_2023/ImageServer` | 2023 QL1, **0.35 m** nominal pulse spacing, classified **LAS 1.4** source, 2,238 tiles, **0.5 m bare-earth DEM**, NAD83(2011), Delaware State Plane, NAVD88 / GEOID18. ⛔ **Bare earth only — it is the GROUND, never the roof** (founder §17). |
| **S4** | `https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_Planning_Development/FeatureServer/3` | Statewide **Building Permits** — `PARCEL_ID`, residential / non-residential units, square footage. Validation / interpretation input. |

## 2 · NEW CASTLE — ⭐⭐⭐⭐⭐ "the best dataset"

| id | service | fields |
|---|---|---|
| **N1** | `https://gis.nccde.org/agsserver/rest/services/BaseMaps/Base_Map/MapServer/82` | County **GIS Tax Map** parcels, identifier **GPIN**; JSON / GeoJSON / PBF |
| **N2** | `https://gis.nccde.org/agsserver/rest/services/BaseMaps/Base_Layers/MapServer/6` — **Structures** | polygon footprints with `PRCLID`, `PARCELID`, **`GPIN`**, `GEOID`, `BLDG_DESIGN`, **`NUM_STORIES`**, **`YEAR_BUILT`**, **`MAIN_FLOOR_AREA`**, `FOUNDATION_TYPE`, `ROOF_TYPE`, `ROOF_MATERIAL`, … **`HEIGHT`** |

*"For New Castle you don't need LiDAR to get the primary height."* Example record:
`{ county: "New Castle", parcel_id: GPIN, height_ft: 28.5, stories: 2, year_built: 1987, floor_area_sqft: 2140 }`
— convert `height_ft × 0.3048 → height_m`.

## 3 · SUSSEX — "also surprisingly good" (the demo county)

| id | service | fields |
|---|---|---|
| **SUS1** | `https://map.sussexcountyde.gov/trdserver/rest/services/Geographic_Information_Office/Parcels_PIN_With_Assessment_Unit/FeatureServer` | "Sussex County Delaware Tax Parcel Map with Related Ownership Information Table" — `Tax Parcels` layer + `OwnershipInformation` table; `PIN`, `PINWASSEMENTUNIT`, `PARCEL`, `ASSESSMENT_UNIT`, `LUC`, `APRBLDG`, `APRLAND`, … |
| **SUS2** | `https://map.sussexcountyde.gov/trdserver/rest/services/Geographic_Information_Office/Building_Footprints/MapServer/0` | `BLDG_ID`, **`FLOORS`**, `Source` (e.g. EagleView / Digitized / CADD), `Status`, `AREA`. ⚠ **No direct `HEIGHT`.** |
| — | `…/Geographic_Information_Office/Building_Footprints_2002/MapServer` | historical, superseded — **do not use as primary** |

Sussex plan: *"FLOORS → official-ish building characteristic; LiDAR → actual physical height."*

## 4 · KENT

| id | service | fields |
|---|---|---|
| **K1** | `https://gis.kentcountyde.gov/server/rest/services/Parcels/Parcels/FeatureServer/0` | `PARCELID`, `LOCATION`, `OWNERNAME`, `DEEDREFERENCE`, `YearBuilt`, `PropertyUse`, `StructureType`, `PermitStatus`, `PermitYear`, `PermitNumber`, `StructureDesc`, … + geometry |
| **K2** | `https://gis.kentcountyde.gov/server/rest/services/LandUse/PlanningData/FeatureServer/3` | Building Footprints — `AERIAL_YR`, `HUNDRED`, `CITY`, `REVISED`, `COMMENTS`, area/length. ⚠ **No `HEIGHT`, no obvious parcel foreign key** → spatial join to K1, height from LiDAR |
| **K3** | `https://gis.kentcountyde.gov/server/rest/services/LayersForApps/Permits_Data/FeatureServer` | state + county building-permit layers |

## 5 · NATIONAL FALLBACK

| id | service | note |
|---|---|---|
| **U1** | `https://tnmaccess.nationalmap.gov/api/v1/` | USGS TNM Access — REST search/download of National Map products; build against it rather than hard-coding Delaware download URLs |
| **U2** | `s3://usgs-lidar-public/` (EPT, public) · `s3://usgs-lidar` (original LAZ, **requester-pays**) | 3DEP point clouds on AWS — cloud pipeline `building polygon → spatial query → EPT/LAZ → PDAL → height` instead of downloading thousands of LAZ |

## 6 · ROUND-1 SOURCES ALSO NAMED (2026-09-11, first message of the turn)

- An ArcGIS **"Building Footprints 2023"** service with `PIN`, `MAPBLOCKLO`, `FULL_ADDRE`, **`FLOOR`**, `COUNTY`, `STATE`, and **`HasZ: true`** polygons: `https://services5.arcgis.com/b6Yz3vwhbD35udZY/ArcGIS/rest/services/Building_Footprints_2023/FeatureServer/189`. ⚠ Founder: *"I would not yet treat this as the statewide Delaware authoritative building layer — provenance and statewide coverage unclear. Investigate/validate, not the foundation."*
- **BuildingFootprints2015** (DVRPC): `https://services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services/BuildingFootprints2015/FeatureServer/0` — heights *"derived from high resolution normalized digital surface elevation models … using the highest hit method."* **Benchmark yes, primary production data no** (2015-era, regional).
- Floors from height: *"height ≈ 3.0 m × floors + roof/foundation allowance"* — 4.5 m → 1 · 7.5 m → 2 · 10.5 m → 3 · 13.5 m → 4. ⛔ *"I'd not simply round height / 3"* — classify with height + footprint area + building type + assessor attributes + imagery + permits.

## 7 · THE FOUNDER'S HEIGHT HIERARCHY AND ALGORITHM

```text
if New Castle HEIGHT exists:   use county HEIGHT → validate against LiDAR
elif Sussex FLOORS exists:     derive/estimate height from LiDAR, retain official FLOORS
elif Kent:                     derive height from LiDAR
otherwise:                     LiDAR
```

**Store BOTH, never collapse them:** `height_m = 8.42, height_source = "DE_2023_LIDAR"` beside
`reported_height_m = 8.69, reported_height_source = "NCC_STRUCTURES"` — *"official assessor value"*
and *"physically measured LiDAR value"* are different facts.

**LiDAR per building:** ground = median of class-2 points; roof = **P95** of class-6 points inside the
footprint; `height = roof_z − ground_z`; store `height_p50 / p90 / p95 / max` to detect bad results.
**`DEM → ground, LAS → roof`** is the correct combination — never the roof from the bare-earth DEM.

**Suggested schema:** `parcels(parcel_id, state_pin, county, county_parcel_id, geometry, area_m2, source,
source_updated_at)` · `buildings(building_id, parcel_id, county, geometry, footprint_m2, height_m,
height_source, stories, stories_source, year_built, floor_area_m2, source, source_updated_at)` ·
`building_height_observations(building_id, ground_z, roof_z_p50/p90/p95/max, height_p50/p90/p95/max,
lidar_year, lidar_tile, point_count, quality_score)` — *"you don't want to lose the raw evidence behind
your derived height."*

**Suggested stack:** Python (httpx/aiohttp) · GeoPandas/Shapely/pyogrio/pyproj · **PDAL** + LASzip +
COPC/EPT (not pure Python) · PostgreSQL + PostGIS · GeoParquet · FastAPI.

**Suggested order:** Phase 1 FirstMap parcels + NCC Structures + Sussex + Kent footprints → Phase 2
normalise (`parcel_id, building_id, building_area, stories, height, year_built` with provenance) →
Phase 3 LiDAR only to fill missing heights, improve Sussex/Kent, validate New Castle, detect new
buildings → Phase 4 own API (`GET /v1/parcels/{id}`, `/v1/parcels/{id}/buildings`,
`/v1/buildings/{id}`, `/v1/buildings/{id}/height`, `/v1/buildings?bbox=…`, `?county=`, `?height_min=&height_max=`).

**Key conclusion (his words):** *"FirstMap + county assessor GIS + county building footprints/structures
+ 2023 QL1 LiDAR + PostGIS + PDAL + FastAPI. That's the stack I'd choose rather than trying to find
one mythical statewide 'Delaware Catastro' API."*

---

## ⭐ HOW THIS MAPS ONTO PRYZM'S ARCHITECTURE (orchestrator, 2026-09-11)

Stated so the research is not implemented literally as a second, rival pipeline
([[architectural-soundness-mandate]], [[same-rule-two-implementations]]):

1. **Context-building heights (the demo gap) do NOT need PostGIS/FastAPI.** PRYZM's serving path for
   context buildings is `tools/context-bake` → staged PMTiles → `context-merge-publish` → R2, read by
   `contextTiles.ts`. The founder's PostGIS/FastAPI tier plays the role that path already plays. His
   county sources become a new **height tier inside the existing US chain**
   (`heights/usasNationalStamp.mjs`, which already resolves the per-metro CITY channel before USAS),
   mirroring `heights/usOpenHeights.mjs` (pure, fixture-tested) + a stamp half.
2. **Provenance is a render decision, not a footnote.** The client renders `pryzm:height_src=
   measured-lidar` SOLID and unmeasured heights as translucent ghosts. A height computed as
   `FLOORS × storey height` is an **assessed** height, not a measurement — it must carry its own
   marker and must never borrow `measured-lidar` (the C58 §1.19 rule, applied to context: a number
   PRYZM did not measure may not wear the look of one it did). The founder's own §15 ("store both")
   is the same rule.
3. **The parcel/property graph (FirstMap + county parcels) is a separate, larger decision** — a
   Delaware parcel provider beside `CatastroParcelProvider`, which USA-DELAWARE-DEMO-SOURCES.md already
   records as absent. It is not in scope for the heights lane.
4. **PDAL over classified LAS is a real capability PRYZM does not have** in `tools/context-bake`
   (every raster stamp today is nDSM = DSM − DTM over a published raster). If FirstMap publishes a
   first-return / DSM raster for 2023 (Float32, not an 8-bit hillshade — the Ireland trap recorded in
   `heights/nationalHeightsAssessed.mjs`), the existing raster technique applies statewide and yields
   `measured-lidar` legitimately; if only LAS exists, a PDAL leg is new work and is priced as such.

---

## MEASURED (lane DELAWARE-HEIGHTS, L-13314) — appended as the lane probes

*(pending)*
