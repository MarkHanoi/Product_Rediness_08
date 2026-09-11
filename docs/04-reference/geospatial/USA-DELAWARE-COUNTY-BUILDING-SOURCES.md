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

*Probed 2026-09-11 from three egresses (a residential curl, Node's own TLS client with full browser
headers, and a US cloud fetcher). Every number below is an answer the lane received, not a reading of a
schema. The code that carries them is `tools/context-bake/heights/us3depHag.mjs`
(`US_DELAWARE_HEIGHT_ASSESSED`, `§HAG-VALIDATION`, `§CANOPY-GUARD`).*

### ⭐ The verdict in one paragraph

**None of the founder's county height sources is reachable, and two of the three "Delaware" AGOL layers
are not in Delaware.** But the height gap at the demo site is still closable: Microsoft Planetary Computer
publishes PDAL-derived **USGS 3DEP LiDAR Height-Above-Ground** rasters for the whole state (2013 Sandy
delivery, 2 m), keyless. They are now a canopy-guarded **fill tier** inside the existing US chain
(`heights/usasNationalStamp.mjs`), behind USA Structures. End-to-end through the real stamp, the demo ring
goes from **0 of 36 measured to 9 of 36** — every refused footprint refused *by name*, the ten
canopy-covered cabins kept at their OSM storey count instead of a measured 15 m lie.

### 1 · Live probes, source by source

| id | answer | verdict |
|---|---|---|
| **S1** State Parcels | HTTP 200 · fields `OBJECTID PIN ACRES COUNTY UPDATED` · maxRecordCount 2000 · **451,344** parcels statewide · **9** in the demo bbox | live; parcels only (no building attributes) |
| **S2** LiDAR Index | HTTP 200 · demo point → tile **`22780088400`** (PAGENAME BL65) | live |
| **S3** `DE_Lidar_DEM_2023` | HTTP 200 · **F32**, 0.5 m, min −2.05 / max 137.62 · "QL1 **Bare-Earth** DEM" | ground only — confirmed |
| DSM? | every FirstMap imagery folder (12) and enterprise folder (14) listed: **no DSM / nDSM service exists** | — |
| **S4** Building Permits | HTTP 200 · points, `PARCEL_ID R_UNITS NR_SF P_YEAR …` · **0** in the demo bbox | live; no heights |
| **N2** NCC Structures | **HTTP 471** "Request Blocked … Link11 Web Application Security" (3,074 B) — all three egresses; `BaseMaps` folder likewise | **WAF-blocked** — `HEIGHT`/`NUM_STORIES` unread |
| **N1** NCC tax map | same host (`gis.nccde.org`) | blocked (host-level) |
| **SUS2** Sussex Building_Footprints | **HTTP 403** RedShield "blocked this request" via CloudFront — services root, folder, and `www.sussexcountyde.gov` (403 nginx) likewise, all three egresses | **WAF-blocked** — `FLOORS` unread |
| **SUS1** Sussex parcels | same host | blocked (host-level) |
| **K2** Kent Building Footprints | HTTP 200 · fields `OBJECTID_1 OBJECTID Id Shape_Leng AERIAL_YR HUNDRED CITY REVISED COMMENTS` · **106,470** features · 0 in the demo bbox | live; **no height, no storeys** (confirmed) |
| round-1 "Building Footprints 2023" | item owner **`NorthFayetteTwp`**, extent −80.29,40.37→−80.17,40.46, SR 2272 | **North Fayette Township, PENNSYLVANIA** — not Delaware |
| "Sussex County Building Footprints" (AGOL, the one search finds) | org hosts `NJDEP_Wildfire_Fuel_Sussex`, `WantageRivers`…; SR 3424; 9,544 features, `BLDGHEIGHT>0` → **0**, `NUMSTORIES>0` → **0** | **Sussex County, NEW JERSEY** — and empty |
| USA Structures at the demo | bbox `where=1=1` → **41** · `HEIGHT IS NOT NULL` → **0** | the gap, re-measured |
| **U2** 2023 QL1 point cloud | `usgs-lidar-public/DE_Statewide_1_B23/ept.json` HTTP 200 · **211,151,154,347** points · `laszip` · EPSG:3857 | real; needs a LAZ decoder (§4) |
| **Planetary Computer 3DEP** | STAC `3dep-lidar-hag` over the delaware bbox → HTTP 200, **310** items in one page; `USGS_LPC_DE_Snds_2013_LAS_2015` = 119 items −75.843,38.402→−75.040,39.758; COGs **Float32 LERC, 2 m, EPSG:26918**, GDAL nodata −9999; anonymous SAS token HTTP 200 | **wired** (fill tier) |
| PC `3dep-lidar-classification` | **0** class-6 (Building) cells over 1,519 Boston parts, 361 Wilmington buildings, 36 Lewes footprints | the 2013 delivery does not classify buildings |

⛔ **Not probed:** K1, K3, U1, DVRPC BuildingFootprints2015 — none serves Sussex, where the gap is.

### 2 · The fill tier — what it is allowed to claim

Same sampler, three **independent** references:

| where | reference | USA Structures | HAG P50 | HAG P90 |
|---|---|---|---|---|
| Boston South End (1,494 roof parts) | BPDA `BLDG_HGT_2010` (authority) | Δ **−0.40**, \|Δ\| 0.80 m, ≤3 m 86.9 % | Δ **+1.71**, \|Δ\| 1.75, ≤3 m 88.2 % | Δ +2.45, \|Δ\| 2.47, ≤3 m 66.4 % |
| Brooklyn (1,580) | NYC `height_roof` (authority) | Δ −1.20, \|Δ\| 1.40, ≤3 m 89.1 % | nodata there (0 of 2,176) | — |
| Wilmington (361) | USA Structures | — | Δ +1.42 | Δ +3.08 |

⇒ **The HAG reads high** (a per-cell-maximum surface), so the tier stamps **P50**, not the repo's usual
P90, and applies **no bias correction** (a number learned in Boston and subtracted in Delaware stops being a
measurement). ⇒ **USA Structures is the better measurement where it exists**, so the HAG is a *fill*.

**The canopy guard.** Unguarded, the ten `building=cabin` / `building:levels=1` footprints at Cape Henlopen
read **4.2–16.2 m** — the pine canopy. The returns raster separates them: canopy interiors read
NumberOfReturns 2–4 (single-return share **0.00–0.45**), clean roofs **0.72–1.00**. Guard **≥ 0.75**:

| demo ring (36 OSM footprints) | admitted | heights |
|---|---|---|
| unguarded P50 | 31 | 3.8 … 23.0 m (canopy included) |
| guard ≥ 0.5 | 14 | includes a 12.9 m "shed" (share 0.50) |
| **guard ≥ 0.75 (shipped)** | **9** | **3.8 – 4.6 m**, every canopy cabin refused |

### 3 · Precedence — ONE function (`usHeightDecision`, `heights/usOpenHeights.mjs`)

`authority` (NYC/SF/Boston surveys) **>** `usas` **>** `3dep-hag` **>** `county-storeys` → `building:levels`
**>** OSM tags **>** `assumed`. Written by ONE function (`applyUsHeightDecision`); a storey count never gets
the measured marker and never overwrites an OSM `height`; a measured height and a storey count are **stored
both**. ⚠ **This deviates from the lane brief** ("measured nDSM > authority HEIGHT > USAS"): that order
presumed a 0.5 m 2023 QL1 nDSM; the one that exists keylessly measured *worse* than USA Structures against an
authority, and ranking it first would have replaced 0.80 m-accurate heights with 1.75 m-accurate ones across
Wilmington. The founder's own hierarchy ("NCC HEIGHT → validate against LiDAR") puts the authority first too.
`county-storeys` is ranked but **fed by nothing** — both storey sources are WAF-blocked.

### 4 · End-to-end, through the real stamp (live USA Structures + live Planetary Computer)

| area | footprints | measured | via | solid fraction |
|---|---|---|---|---|
| **Lewes demo ring** | 36 | **9** | 3DEP HAG fill (DE_Snds_2013) | **0.000 → 0.250** |
| — refused | | 22 canopy · 2 implausible (Fort Miles bunkers, P50 0 m) · 3 too-few · **0 failed** | | |
| Wilmington cell | 149 | 141 | USA Structures (fill ran for the 8 unmatched: 3 canopy, 5 too-few) | **0.946 — unchanged** |

**Expected on the shipped tiles after publish:** the probe's ±0.008° ring (48 footprints on the 2026-09-10
tiles) should read `solidRenderFraction` ≈ **0.2–0.3**, up from **0.000**; Wilmington should stay ≈ 0.947.
That is not Barcelona parity (0.958) at Lewes, and it cannot be on this source: the site is under forest.

### 5 · What is still open, priced honestly

- **County `FLOORS` / `HEIGHT` / `NUM_STORIES`** — needs the counties to allow-list a service account, or a
  one-off file export mirrored to R2. The `county-storeys` rung is already in the precedence function.
- **The founder's class-6-roof-P95 algorithm on the 2023 QL1 cloud** — a COPC/EPT reader plus a WASM LAZ
  decoder (`laz-perf`), provisioned the way `geotiff` is in `context-bake.yml`. It would lift the canopy
  cases the guard now refuses. *Estimate (not measured):* 3–5 lane-days, plus a one-off precompute job,
  because the statewide cloud is 2.1 × 10¹¹ points and cannot be streamed inside a per-bake budget.
- **A `lewes delaware 38.7820,-75.0897 <floor>` CITIES gate row** is now legitimate. It should be added
  **after** the publish, with its floor set from the staged-probe count, never before.

### 6 · The first statewide bake, measured on the STAGED bytes (before any publish)

**Bake run `34589078643`** (`b692b21f`, `region=delaware layer=buildings stage=true` → `tiles-staging/delaware--buildings/`,
`buildings.pmtiles` 17,925,901 B, 6 min 11 s): **40,231 of 112,354** footprints measured — **21,979** USA Structures
(unchanged) + **18,252** HAG fill (18,247 from DE_Snds_2013). Refused: 47,072 canopy · 11,256 implausible · 12,540
too-few · 239 no-returns · 1,016 no-item. **0 failed.** Gate `✔ delaware (usas): 40231/112354`; the Wilmington gate row
reads `measured`. The layer-scoped slug supersedes the base set's buildings in the merge (`merge-tiles.mjs` supersede rule).

`node tools/context-height-probe/sweep.mjs --points delaware --base <staged set>` — the same instrument, both archives
**staged** (`tiles-staging/delaware/`, the 2026-09-09 bake, vs `tiles-staging/delaware--buildings/`):

| point | BEFORE solid | AFTER solid | measured AFTER |
|---|---|---|---|
| wilmington | 0.947 | 0.951 | 1,231 / 1,295 |
| newark-de | 0.000 | **0.000** ⛔ | 0 / 1,196 |
| dover | 0.870 | 0.891 | 1,261 / 1,416 |
| milford | 0.000 | 0.112 | 32 / 285 |
| georgetown | 0.000 | 0.434 | 148 / 341 |
| lewes-town | 0.000 | 0.159 | 185 / 1,166 |
| **lewes-demo** ⭐ | **0.000** | **0.229** | **11 / 48** (median 4.2 m) |
| rehoboth | 0.000 | 0.136 | 117 / 860 |
| fenwick | 0.000 | 0.177 | 145 / 817 |

Measured points: **2 of 9 → 8 of 9**.

⛔ **Newark was a defect in the tier, not a source gap — `§SURVEY-HOLE-FALLBACK`.** The newest item whose *bbox* contains
Newark, `USGS_LPC_MD_PA_SandySupp_2014_LAS_2016-hag-2m-16-7`, reads **0 finite / 160,000 nodata** over a 400 × 400
window at the sweep point; `USGS_LPC_DE_Snds_2013_LAS_2015-hag-2m-7-21` over the same window reads **153,200 / 0**. A STAC
bbox is an envelope, not a promise of data (Brooklyn had shown the same shape). Fixed: covering surveys are ranked
newest-first (`rank3depItems`), and a footprint whose chosen survey has **nodata inside its eroded ring** is re-sampled
from the next one (a footprint too *small* for the erosion is not a hole and never falls back). End-to-end through the
real stamp at the Newark ring: **0.000 → 0.201** (195 / 971, 965 footprints re-sampled from DE_Snds_2013, 0 errors).

### 7 · The re-bake that carries the fix — what the buildings publish will ship

**Bake run `34591395711`** (`26d6c66f`, same slug `tiles-staging/delaware--buildings/`, `buildings.pmtiles` 18,001,071 B,
staged manifest `bakeRunId 34591395711`, 7 min 41 s): **41,485 of 112,354** measured — 21,979 USA Structures + **19,506**
HAG fill (19,501 DE_Snds_2013). **6,542** footprints re-sampled from an older survey where the newest had a hole. Refused:
51,155 canopy · 11,687 implausible · 6,135 too-few · 265 no-returns · 1,449 no-data · 177 no-item. **0 failed.** One USA
Structures cell answered a page error this run; its footprints keep OSM and the fill skipped the 1 whose channel failed
(precedence unknown) — named in the note, not hidden. Gate `✔ delaware (usas): 41485/112354`.

Same sweep, staged bytes (`delaware--buildings`, run `34591395711`):

| point | 2026-09-09 staged | this re-bake | measured |
|---|---|---|---|
| wilmington | 0.947 | 0.951 | 1,231 / 1,295 |
| **newark-de** | 0.000 | **0.200** | 239 / 1,196 |
| dover | 0.870 | 0.891 | 1,261 / 1,416 |
| milford | 0.000 | 0.112 | 32 / 285 |
| georgetown | 0.000 | 0.434 | 148 / 341 |
| lewes-town | 0.000 | 0.159 | 185 / 1,166 |
| **lewes-demo** ⭐ | **0.000** | **0.229** | **11 / 48** (median 4.2 m) |
| rehoboth | 0.000 | 0.136 | 117 / 860 |
| fenwick | 0.000 | 0.177 | 145 / 817 |

**9 of 9 points measured** (was 2 of 9) · min 0.112 · median 0.200 · max 0.951. The spread is still > 0.5, and honestly
so: New Castle and Kent carry USA Structures; Sussex carries a canopy-guarded 2013 LiDAR fill that refuses every
footprint it cannot see clearly.

**Publish state at the time of writing:** roads merge `34582615395` in `tile-join` (started 09:18Z); the **buildings merge
`34590342430` is queued as the group's single pending run** and downloads the staged bytes when it starts, i.e. these.
`CONTEXT_TILESET_VERSION` moves only after that publish succeeds, never on dispatch.
