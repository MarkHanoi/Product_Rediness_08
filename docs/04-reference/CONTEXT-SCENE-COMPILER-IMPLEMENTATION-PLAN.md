# Context Scene-Compiler + Terrain — Full Implementation Plan

> **Status: IMPLEMENTATION BLUEPRINT — 2026-07-24.**
> 10× expansion of `CONTEXT-SCENE-COMPILER-NORTH-STAR.md`, **live-verified against the real codebase
> and real endpoints from the Replit dev environment on 2026-07-24.** Every data claim is marked
> VERIFIED (live-probed this session) or ESTIMATED (desk research). Every file reference has been
> confirmed to exist. Every wrong URL, wrong dataset name, and wrong TypeName from the earlier draft
> has been corrected. Read the FINDINGS table in §0 before implementing.
>
> **Honesty tier (binding):** §CONTEXT-DATA-HONESTY + C57 + C58. A value without provenance
> MUST NOT ship. Never fabricate. Never claim a stage done on code-merge alone — "renders +
> is measured" only.

---

## 0 — Live probe results (2026-07-24) — read before touching Phase 1

All probes run via Node.js fetch from the Replit dev environment. Curl is blocked on Replit;
Node fetch reaches the same endpoints (confirmed). ECONNRESET = Replit network-level block for
that country's domain.

| Source | Endpoint (corrected) | HTTP | Finding | Verdict |
|---|---|---|---|---|
| **BD TOPO FR** | `data.geopf.fr/wfs/ows` | 200 | 21.7 m / 8.3 m real heights, GeoJSON geometry included, axis order lon,lat with SRSNAME=EPSG:4326 | ✅ **WIREABLE NOW** |
| **3DBAG NL** | `api.3dbag.nl/collections/pand/items` | 200 | Heights 15.00 m / 13.10 m / 14.43 m, `b3_dak_type: slanted`, AHN5 density 36.7 pts/m². **Geometry = null** — RD→WGS84 reprojection not yet done | ⚠ **HEIGHTS CONFIRMED; GEOMETRY GAP** |
| **Catastro ES** | `ovc.catastro.meh.es/INSPIRE/wfsBU.aspx` | 200 | 334 BuildingParts/334 with floor counts. TypeName MUST be `bu:BuildingPart` (not `bu:Building` — that returns an ExceptionReport). Geometry present (posList). Spain national bbox **times out** — query per city only | ⚠ **FLOORS CONFIRMED; BBOX LIMIT** |
| **swissALTI3D CH** | `data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d` | 200 | STAC catalog live, GeoTIFF tiles at public URLs. CRS from filename: EPSG:2056 (LV95) + EPSG:5728 (LN02) = compound EPSG:9518 | ✅ **VERIFIED** |
| **3DEP US** | `tnmaccess.nationalmap.gov/api/v1/products` | 200 | 4 tiles found for Chicago. **Dataset name = "Digital Elevation Model (DEM) 1 meter"** (NOT "National Elevation Dataset (NED) 1 meter"). Download from `prd-tnm.s3.amazonaws.com` | ✅ **VERIFIED (corrected name)** |
| **AHN NL** | `service.pdok.nl/rws/ahn/wcs/v1_0` | 200 | WCS GetCapabilities returns 200. **NOT** `api.pdok.nl/rws/ahn/v1_0/ogc/tiles/v1/collections` (that is 404). WCS for raster access; tile download via atom feed or direct S3 | ✅ **URL CORRECTED** |
| **DK Datafordeler** | `wfs.datafordeler.dk/...` | 401 | Auth required. Free token at `dataforsyningen.dk`. `api.dataforsyningen.dk` returns 404 on all paths tried — correct download portal is `download.kortforsyningen.dk` | ⚠ **AUTH REQUIRED** |
| **NRW DE LoD2** | `opengeodata.nrw.de/...` | ECONNRESET | Replit network blocks .nrw.de domain. Confirmed accessible from non-Replit environments per prior work | 🔒 **NETWORK-BLOCKED on Replit** |
| **NO hoydedata** | `hoydedata.no/...`, `wcs.geonorge.no/...` | ECONNRESET | Replit network blocks .no domains | 🔒 **NETWORK-BLOCKED on Replit** |

### Critical gaps discovered (bind these before Phase 1 can close)

**GAP-A — 3DBAG geometry is null (BLOCKS amsterdam real-height tiles):**
`resolveHeights('amsterdam', {bbox})` returns `{ status: 'documented' }` — NOT `'ok'`. The
`fetch3dbag` fetcher in `heightSources.mjs` extracts heights correctly (confirmed: 15.00 m,
`roofType: slanted`) but sets `geometry: null` on every feature because RD New → WGS84 footprint
reprojection is documented as "next build step" and not implemented. Until this is done, the
one integration line produces no Amsterdam tiles. **This must be fixed as part of Phase 1.**

**GAP-B — Catastro/Spain national bbox times out:**
`resolveHeights('spain', {bbox: [-9.55,35.90,4.60,43.90]})` → `{ status: 'error', reason: 'This
operation was aborted' }`. A national Spain bbox returns far too many BuildingParts for the 40 s
timeout. The Spain bake must call Catastro per city (per the per-city REGIONS entries in
`bake.mjs`) with small city bboxes, not the national `spain` region entry. **The integration loop
must iterate over the city-level `REGIONS` entries, not the national Spain entry.**

**GAP-C — AHN URL in plan was wrong everywhere:**
All references to `api.pdok.nl/rws/ahn/v1_0/ogc/tiles/v1/...` return HTTP 404. The correct
base URL is `service.pdok.nl/rws/ahn/wcs/v1_0` (WCS 2.0, HTTP 200 confirmed). All references
corrected below.

**GAP-D — 3DEP dataset name was wrong:**
"National Elevation Dataset (NED) 1 meter" returns 0 results. The correct name is
"Digital Elevation Model (DEM) 1 meter" (4 tiles returned for Chicago, confirmed).

**GAP-E — `packages/schemas/src/elements/site/` directory does not exist:**
Must be created. See Phase 2 §2.1 for the exact `mkdir` instruction.

---

## Current project state (2026-07-24)

### What is shipped and confirmed working

| Component | File | State |
|---|---|---|
| Static PMTiles bake (multi-region) | `tools/context-bake/bake.mjs` | ✅ SHIPPED (L-607). 20+ regions: Spain national + 13 jurisdiction cities + US + SA |
| PMTiles client tile reader | `apps/editor/src/ui/geospatial/contextTiles.ts` | ✅ SHIPPED (L-513b). Primary hot path. |
| Height-source module (3 sources) | `tools/context-bake/heightSources.mjs` | ✅ SHIPPED. BD TOPO ✅ wireable. 3DBAG ✅ heights but ⚠ geometry null. Catastro ✅ floors but ⚠ bbox limit. |
| Per-country LOD measurement | `docs/04-reference/jurisdictions/LOD-RATE-MASTER.md` | ✅ COMPLETE. 13 countries, 6 VERIFIED live. |
| Near/far ring context render | `apps/editor/src/ui/geospatial/contextBuildings.ts` | ✅ SHIPPED. `heightProvenance` badge. |
| Ground datum anchor (L-584) | `apps/editor/src/ui/geospatial/globeGroundAnchor.ts` | ✅ SHIPPED. WGS-84 ellipsoidal datum enforced. |
| Envelope height solver | `packages/site-parcel-data/src/envelopeHeight.ts` | ✅ SHIPPED. Reads `height_m` via `ConstructedHeightPatch`; HeightProfile migration is Phase 2. |

### What is NOT built (this document's scope)

1. Phase 1 — National heights wired into bake (+ 3DBAG geometry reprojection fix)
2. Phase 2 — `HeightProfile` schema (regulation-aware multi-field datum)
3. Phase 3 — Terrain mesh in 3D-Site (the long-requested gap)
4. Phase 4 — LiDAR nDSM height engine (measured heights + roof types)
5. Phase 5 — Scene-compiler + scene tiles (Forma-class runtime)

### Binding conventions (all phases)

- **Monorepo layout:** offline compilers in `tools/`. L0 Zod schemas in `packages/schemas/src/`.
  Client render/stream in `apps/editor/src/ui/geospatial/`. Server tile API in `server/`.
- **Tile key:** WebMercator zoom-15 (~1.2 km edge). ONE scheme everywhere.
- **Provenance mandatory** on every derived value: `source`, `algorithm_version`, `epoch`,
  `confidence`. A value without all four MUST NOT ship.
- **Determinism:** every compiler is pure `(input_hash, algorithm_version) → identical output`.
  Outputs are versioned, never overwritten.
- **Robust statistics only.** P90 or trimmed median. Never `max`. Never bare `mean`.
- **One vertical datum** — WGS-84 ellipsoidal throughout, matching `globeGroundAnchor.ts`
  (`GroundDatum = 'ellipsoidal-wgs84'`). All datum transforms via the single C12 proj4 projector.
- **"Done" = "renders + is measured."** Not done on code-merge alone.

---

## Phase 1 — National heights wired into the bake

**Goal:** kill the 9 m default for cities where a national height source exists.
**Effort:** M (~1 week). **Risk:** LOW. **Sequence:** do this first.

### 1.1 Current resolveHeights status per region (live-verified)

| Region | Source | `resolveHeights` status | Why / what blocks |
|---|---|---|---|
| `paris` | `bdtopo` | ✅ `ok` — 4,315 features with real heights | BD TOPO geometry included, fully wireable |
| `lyon` | `bdtopo` | ✅ `ok` (expected — same source) | BD TOPO fully wireable |
| `amsterdam` | `3dbag` | ⚠ `documented` | Heights confirmed but `geometry: null` (GAP-A — fix §1.2) |
| `spain` | `catastro` | ❌ `error` (timeout) | National bbox too large (GAP-B — fix §1.3) |
| `madrid`, `barcelona`, etc. | `catastro` | ⚠ `documented` (city-level) | Floors confirmed; geometry needs GML parse (fix §1.3) |
| `berlin` | `lod2de` | ⚠ `documented` | Source known; fetcher not yet implemented |
| `copenhagen` | `geodanmark` | ⚠ `documented` | Source known; auth token required |
| `zurich`, `geneva`, `bern` | `swissbuildings3d` | ⚠ `documented` | CityGML bulk download; fetcher not yet implemented |

### 1.2 Fix GAP-A: 3DBAG footprint geometry (RD New → WGS-84)

**File:** `tools/context-bake/heightSources.mjs` — `fetch3dbag` function (line ~285)

The 3DBAG CityJSONFeature response shape (VERIFIED):
```json
{
  "CityObjects": {
    "NL.IMBAG.Pand.0363100012165013": {
      "attributes": { "b3_h_dak_50p": 15.56, "b3_h_maaiveld": 0.567, "b3_dak_type": "slanted", ... },
      "geometry": [{ "boundaries": [[[0,1,2,3,...], ...]], "lod": "1.2", "type": "Solid" }]
    }
  },
  "vertices": [[121000.5, 487000.3, 0.57], ...]
}
```

Vertices are in RD New (EPSG:28992) as integers (×1000 implicit scale). The existing
`wgs84ToRD()` function converts WGS84 → RD. The INVERSE — RD → WGS84 — must be added. Use
the same Schreutelkamp & Strang van Hees closed form, which has a documented inverse:

```js
// Add to heightSources.mjs alongside wgs84ToRD:
export function rdToWgs84(X, Y) {
  const dX = (X - 155000) * 1e-5, dY = (Y - 463000) * 1e-5;
  const Kpq = [[0,1,3235.65389],[2,0,-32.58297],[0,2,-0.24750],[2,1,-0.84978],
    [0,3,-0.06550],[2,2,-0.01709],[1,0,-0.00738],[4,0,0.00530],[2,3,0.00033],
    [4,1,-0.00012],[0,4,0.00010]];
  const Lpq = [[1,0,5261.30656],[1,1,105.94684],[1,2,2.45656],[3,0,-0.81885],
    [1,3,0.05594],[3,1,-0.05607],[0,1,0.01199],[3,2,-0.00256],[1,4,0.00128],
    [0,2,0.00022],[2,0,-0.00022],[5,0,0.00026]];
  let lat = 52.15517440, lon = 5.38720621;
  for(const [p,q,c] of Kpq) lat += c * dX**p * dY**q * 1e-5;
  for(const [p,q,c] of Lpq) lon += c * dX**p * dY**q * 1e-5;
  return [lat, lon];
}
```

Then update `fetch3dbag` to extract the LoD0 footprint ring from CityObjects.geometry
and convert each vertex:

```js
function extractFootprintWgs84(item) {
  const cos = item?.CityObjects ?? {};
  for (const [key, co] of Object.entries(cos)) {
    if (key.endsWith('-0')) continue;  // skip child surfaces
    // Find the LoD0 or LoD1.2 boundary — the ground footprint ring
    const geoms = co?.geometry ?? [];
    const lod0 = geoms.find(g => g.lod === '0' || g.lod === '1.2' || g.lod === '1.3');
    if (!lod0) continue;
    const ring = lod0.boundaries?.[0]?.[0];  // outer ring of first surface
    if (!ring || ring.length < 3) continue;
    const verts = item.vertices ?? [];
    const coords = ring.map(vi => {
      const [rx, ry] = verts[vi];
      const [lat, lon] = rdToWgs84(rx, ry);
      return [lon, lat];  // GeoJSON is [lon, lat]
    });
    coords.push(coords[0]);  // close ring
    return { type: 'Polygon', coordinates: [coords] };
  }
  return null;
}
```

Replace the `geometry: null` stub in the feature push:
```js
const geom = extractFootprintWgs84(item);  // replaces geometry: null
if (geom === null) continue;  // skip if no extractable footprint
features.push({ type: 'Feature', geometry: geom, properties: { ... } });
```

**After this fix:** `resolveHeights('amsterdam', {bbox})` will return `status: 'ok'` with real
GeoJSONSeq features carrying measured heights and `geometry` — tippecanoe-joinable.

**Proof:** the `extract3dbagAttrs` function already correctly traverses `item.CityObjects[key].attributes`
(confirmed by live probe: `b3_h_dak_50p=15.56, b3_h_maaiveld=0.567, b3_dak_type=slanted`
→ derived height 15.00 m). Only the geometry extraction was missing.

### 1.3 Fix GAP-B: Catastro per-city, not national bbox

**Why the Spain national bbox times out:** Catastro WFS with a ~1.9M km² bbox requires the server
to scan the national feature store; the 40 s `timeoutMs` is hit before any features arrive. The
bake's `REGIONS` array already has per-city entries (`madrid`, `barcelona`, `seville`, etc.) with
small city-level bboxes. The integration loop must iterate the **city-level region entries** for
Catastro, not the top-level `spain` entry.

**Bounding-box size guidance (from live probe):**
- Madrid centro (`[-3.703, 40.416, -3.699, 40.420]` — 0.004° × 0.004°) → 334 BuildingParts, 40 s OK
- Catastro max safe bbox: approximately 0.05° × 0.05° (~5 km × ~5 km). Tile it for large cities.

**GML geometry extraction** (Catastro returns GML posList, not GeoJSON):

The `fetchCatastro` function currently extracts only floor counts from the GML. To make geometry
wireable, add GML → GeoJSON parsing:
```js
// Extract posList rings from Catastro GML (each <bu-ext2d:BuildingPart> has a gml:Polygon)
const geomMatches = [...body.matchAll(/<gml:posList[^>]*>([\d\s.]+)<\/gml:posList>/g)];
// posList format: "lat1 lon1 lat2 lon2 ..." (axis order = lat,lon for urn CRS)
for (const [, posStr] of geomMatches) {
  const nums = posStr.trim().split(/\s+/).map(Number);
  const ring = [];
  for (let i = 0; i < nums.length; i += 2) ring.push([nums[i+1], nums[i]]); // [lon, lat]
  if (ring.length >= 4) features.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:[ring] }, properties: {height: floors * METRES_PER_LEVEL, heightProvenance:'derived-levels', heightSource:'catastro'} });
}
```

### 1.4 The one integration line into bake.mjs

The existing `heightSources.mjs` §INTEGRATION comment (line 487) specifies:
```js
// At the TOP of bake.mjs:
import { resolveHeights } from './heightSources.mjs';

// Inside the buildings-layer per-region loop, after the overture/osmium step:
const nat = await resolveHeights(r.name, { bbox: bboxToWsen(r.bbox) });
if (nat.status === 'ok') geos.push(nat.geojsonseq);
else console.log(`  · ${r.name} heights: ${nat.status} — ${nat.reason ?? ''}`);
```

Where `bboxToWsen` converts the osmium bbox string `'minlon,minlat,maxlon,maxlat'` to `[w,s,e,n]`:
```js
const bboxToWsen = (s) => s.split(',').map(Number);
```

**Extend to replace-vs-append** (dedup policy, to avoid double-drawing at 9 m AND real height):
```js
// Sources with ≥95% coverage in a region → REPLACE the OSM/Overture clip entirely.
// BD TOPO covers ~88% of France (nulls for some buildings) → append, not replace.
// 3DBAG covers ~99% of Netherlands → replace.
const FULL_COVERAGE_SOURCES = new Set(['3dbag', 'lod2de', 'geodanmark']);

// In the loop:
const nat = await resolveHeights(r.name, { bbox: bboxToWsen(r.bbox) });
if (nat.status === 'ok') {
  if (FULL_COVERAGE_SOURCES.has(nat.source)) {
    // REPLACE: remove the OSM/Overture GeoJSONSeq for this region.
    const idx = geos.indexOf(geo);
    if (idx !== -1) geos.splice(idx, 1, nat.geojsonseq);
    console.log(`  ↳ ${r.name}: REPLACED with national source ${nat.source} (${nat.count} buildings)`);
  } else {
    // APPEND: tippecanoe merges; national feature sorts last so it takes precedence.
    geos.push(nat.geojsonseq);
    console.log(`  ↳ ${r.name}: APPENDED national source ${nat.source} (${nat.count} buildings)`);
  }
} else {
  console.log(`  · ${r.name} heights: ${nat.status} — ${nat.reason ?? ''}`);
}
```

### 1.5 Two new sources to add to heightSources.mjs

**Source: LoD2-DE (NRW open CityGML)**

```
Endpoint: https://opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/
         (Replit-blocked at network level — verify from Fly.io or local dev)
Format: CityGML tiles per 1 km² grid cell, .gml.gz, ~5 MB/tile
Auth: none (open)
Coverage: NRW only (35% of Germany by population)
License: dl-de/by-2-0 (attribution required — include in provenance.source)
Height field: <bldg:measuredHeight> (absolute NN = orthometric height above NHN)
              → subtract terrain elevation from Phase 3 DTM to get building_height_m
Provenance: 'tagged'
EPSG: varies per Land; NRW = EPSG:25832 (UTM32/ETRS89) + DHHN2016 (EPSG:7837)
Compound gdalwarp -s_srs: EPSG:25832+7837 → EPSG:4979
```

Fetcher outline (`impl: 'documented'` → change to `'live'` when done):
```js
async function fetchLoD2DE({ bbox }) {
  // 1. Compute 1 km² NRW tile keys from bbox:
  //    Tile(kx,ky) covers easting [kx*1000, (kx+1)*1000], northing [ky*1000, (ky+1)*1000]
  //    in EPSG:25832. Convert bbox corners from WGS84 → UTM32 to get tile range.
  // 2. Download https://opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/{kx}_{ky}.gml.gz
  //    Cache locally (file unchanged until annual refresh).
  // 3. Parse GML: <bldg:Building> → footprint polygon (EPSG:25832) + <bldg:measuredHeight> (NHN)
  // 4. Reproject footprint EPSG:25832 → WGS84 (proj4js or GDAL).
  // 5. Emit GeoJSONSeq feature with heightProvenance:'tagged', source:'lod2de_nrw_YYYY'
  // Never-throws: wrap in try/catch, return { status:'error', reason }
}
```

**Source: GeoDanmark / DHM (Denmark)**

```
Registration: https://dataforsyningen.dk/  (free, requires email confirmation)
WFS after auth: https://wfs.datafordeler.dk/GeoDanmarkVektor/...
              (HTTP 401 without token; token passed as ?username=&password= or header)
DHM terrain tiles: https://download.kortforsyningen.dk/ → DHM/Terræn dataset
                   (download portal, requires login, then S3-style direct URLs)
Coverage: ~95% Denmark
Provenance: 'tagged' (ALS-derived, 0.4 m resolution)
License: free for most uses; verify commercial clause before shipping
Status: BLOCKED until Dataforsyningen account is set up + token is in env
        → add GEODANMARK_TOKEN env var; if unset, return { status:'blocked', reason:'no token' }
```

### 1.6 Acceptance criteria (Phase 1)

Re-bake Paris, Amsterdam, Madrid/Barcelona. Verify with `pmtiles show` or the PMTiles inspector.

| City | Target | How to measure |
|---|---|---|
| Paris | >80% of buildings carry `heightProvenance:'tagged'` (BD TOPO `hauteur`) | `pmtiles inspect out/buildings.pmtiles` on Paris bbox tile |
| Amsterdam | >95% of buildings carry `heightProvenance:'tagged'` (3DBAG), NOT uniform 9 m | Spot-check 10 buildings in the Jordaan vs the Amsterdam real estate viewer |
| Barcelona | >30% `derived-levels` (Catastro floors) for a central-city bbox | Tile inspector; look for height variation in the Eixample grid |
| All | 3D-Site renders a recognisable skyline — NOT a uniform 9 m carpet | Screenshot from the Cesium view + annotate |

**Definition of done:** Paris FIRST (it already works — just wire the line). Then Amsterdam (requires
§1.2 geometry fix). Then Spanish cities (requires §1.3 per-city Catastro fix). Never mark done on
code-merge — screenshot + PMTiles inspector before closing.

---

## Phase 2 — HeightProfile schema

**Goal:** a single regulation-aware, multi-field datum so no consumer hardcodes `height_m`.
**Effort:** S–M (~3 days). **Risk:** LOW.
**Sequence:** BEFORE Phase 3 or 4 write any output — this is the data contract everything else emits.

### 2.1 Where the file lives

`packages/schemas/src/elements/site/` does NOT exist yet. Create it:
```bash
mkdir -p packages/schemas/src/elements/site/context/
```

**File:** `packages/schemas/src/elements/site/context/heightProfile.ts`

The existing `packages/schemas/src/elements/` directory contains: `Annotation.ts`, `Beam.ts`,
`Wall.ts`, etc. — all pure Zod L0 schemas. The new file follows the same pattern.

### 2.2 Schema

```typescript
import { z } from 'zod';

// ─── BINDING RULES (C-CONTEXT §1) ─────────────────────────────────────────────
//   1. No consumer may store or transmit a bare `height_m` — use this type.
//   2. Robust statistics only: P90 and trimmed-median. Never max. Never bare mean.
//   3. Provenance mandatory: source, algorithm_version, epoch, confidence — all four.
//   4. ground_elevation_m is WGS-84 ellipsoidal (matches globeGroundAnchor.ts C12 §1.4).
//   5. building_height_m = roof_p90_m − ground_elevation_m (canonical).
//   6. null = "not measured / not applicable", NOT zero.
//   7. This schema is L0: pure Zod, no I/O, no THREE, no DOM imports.

export const RoofType = z.enum([
  'flat',      // < 5° pitch
  'gable',     // two slopes meeting at a ridge
  'hip',       // four slopes, no gable ends
  'shed',      // single slope
  'mansard',   // two slopes per side, lower steeper
  'gambrel',   // two slopes per side, upper shallower (Dutch barn)
  'complex',   // irregular; multiple roof planes, dormers, setbacks
  'unknown',   // LiDAR insufficient or roof obscured
]);

export const HeightProvenance = z.enum([
  'lidar_ndsm',      // Phase 4 LiDAR DSM−DTM pipeline — highest confidence measured
  'national_lod2',   // national LoD2 dataset (3DBAG, swissBUILDINGS3D, LoD2-DE, GeoDanmark)
  'national_lod1',   // national LoD1 dataset (BD TOPO hauteur, Catastro × storeys)
  'osm_tag',         // OSM `height=` tag, author-supplied (unverified)
  'levels_x_h',      // `building:levels` × storey height — derived, not measured
  'ml_estimate',     // ML model estimate (Overture / Microsoft height model)
  'assumed',         // 9 m honest default — no usable source at all
]);

export const HeightProfile = z.object({
  // ── Elevation absolutes (WGS-84 ellipsoidal, metres) ──────────────────────
  ground_elevation_m: z.number().nullable(),
  // Terrain plane under the building footprint (perimeter DTM fit, not centroid sample).
  // null until Phase 3 terrain is shipped; consumers fall back to Cesium ground clamping.

  roof_median_m:  z.number().nullable(), // P50 of nDSM cells inside eroded footprint
  roof_p90_m:     z.number().nullable(), // P90 — the canonical roof height (absolute ellipsoidal)
  roof_peak_m:    z.number().nullable(), // max of roof-plane RANSAC vertices (absolute)

  // ── Heights relative to ground (what planners and rules use) ──────────────
  building_height_m:    z.number().nullable(), // roof_p90_m − ground_elevation_m (canonical)
  height_to_parapet_m:  z.number().nullable(), // top of parapet wall (flat roofs)
  height_to_ridge_m:    z.number().nullable(), // ridge (gable/hip — highest fixed point)
  height_to_eaves_m:    z.number().nullable(), // eaves/traufe (base of roof slope)
  height_to_cornice_m:  z.number().nullable(), // cornice/cornisa (used by ES NNUU)

  // ── Roof geometry ──────────────────────────────────────────────────────────
  roof_type:      RoofType,
  roof_pitch_deg: z.number().min(0).max(90).nullable(),

  // ── Derived ───────────────────────────────────────────────────────────────
  floors_est: z.number().int().positive().nullable(),

  // ── Provenance (mandatory — §CONTEXT-DATA-HONESTY) ────────────────────────
  confidence:        z.number().min(0).max(1),
  provenance:        HeightProvenance,
  source:            z.string().min(1), // e.g. '3DBAG_v2.8' / 'BD_TOPO_2024' / 'PNOA_AHN5'
  epoch:             z.string().nullable(), // ISO 8601 partial: '2025-04' / '2023'
  algorithm_version: z.string().min(1),     // semver of the compute pipeline, e.g. 'v2.3.1'
});

export type HeightProfile = z.infer<typeof HeightProfile>;
export type RoofType = z.infer<typeof RoofType>;
export type HeightProvenance = z.infer<typeof HeightProvenance>;

// ── Jurisdiction height definition ──────────────────────────────────────────
// C58 reads `heightDefinition` from the jurisdiction pack to pick the correct field.
export const HeightDefinition = z.enum([
  'building_height_m',    // generic / most common
  'height_to_ridge_m',    // NL (nok), DK (taghøjde), UK (NPPF ridge)
  'height_to_eaves_m',    // DE (Traufe / BauO NRW), FR (égout du toit / PLU)
  'height_to_parapet_m',  // flat-roof urban contexts
  'height_to_cornice_m',  // ES (cornisa / NNUU)
]);
export type HeightDefinition = z.infer<typeof HeightDefinition>;

// Jurisdiction → height definition mapping (add to each rule pack):
export const JURISDICTION_HEIGHT_DEFINITION: Record<string, HeightDefinition> = {
  nl: 'height_to_ridge_m',    // nok hoogte
  de: 'height_to_eaves_m',    // Traufe / BauO NRW Art.6
  fr: 'height_to_eaves_m',    // égout du toit / PLU
  es: 'height_to_cornice_m',  // cornisa / NNUU
  gb: 'height_to_ridge_m',    // NPPF ridge (default)
  ch: 'building_height_m',    // Firsthöhe varies by canton; canonical until per-canton
  dk: 'height_to_ridge_m',    // taghøjde
  no: 'building_height_m',    // Mønehøyde / TEK17; per-municipality varies
  se: 'building_height_m',    // nockhöjd / PBL; approximate
  be: 'height_to_ridge_m',    // Vlaanderen / Gewestplan
  pt: 'height_to_eaves_m',    // cércea / RJUE
  it: 'height_to_eaves_m',    // altezza in gronda / DM 1444/68
  us: 'building_height_m',    // IBC; AHJ-dependent
};

// ── Backfill from current bake attributes (zero-risk migration) ──────────────
// Wraps the legacy `height` + `heightProvenance` values from contextBuildings.ts
// and contextTiles.ts in the new type without breaking the existing render path.
export function heightProfileFromLegacy(
  height: number | null,
  legacyProvenance: 'tagged' | 'derived-levels' | 'assumed',
  source = 'legacy_bake',
): HeightProfile {
  const provenance: HeightProvenance =
    legacyProvenance === 'tagged'          ? 'national_lod1'
    : legacyProvenance === 'derived-levels' ? 'levels_x_h'
    : 'assumed';
  return {
    ground_elevation_m: null, roof_median_m: null, roof_p90_m: height,
    roof_peak_m: null, building_height_m: height,
    height_to_parapet_m: null, height_to_ridge_m: null,
    height_to_eaves_m: null, height_to_cornice_m: null,
    roof_type: 'unknown', roof_pitch_deg: null, floors_est: null,
    confidence: provenance === 'national_lod1' ? 0.75
               : provenance === 'levels_x_h'   ? 0.40 : 0.10,
    provenance, source, epoch: null, algorithm_version: 'v0.0.0-legacy',
  };
}
```

### 2.3 Export from schemas package

Add to `packages/schemas/src/elements/index.ts`:
```ts
export * from './site/context/heightProfile.js';
```

Confirm the barrel: `packages/schemas/src/index.ts` already re-exports from `./elements/index.js`.

### 2.4 Consumer migrations

**`packages/site-parcel-data/src/envelopeHeight.ts`**

Currently takes `height_m: number` via `ConstructedHeightPatch`. After Phase 2, add an
overload that accepts `HeightProfile` and selects the correct field:

```typescript
import { HeightProfile, HeightDefinition, JURISDICTION_HEIGHT_DEFINITION } from '@pryzm/schemas';

export function resolveEnvelopeHeightFromProfile(
  profile: HeightProfile,
  jurisdictionCode: string,
): number | null {
  const def: HeightDefinition =
    JURISDICTION_HEIGHT_DEFINITION[jurisdictionCode] ?? 'building_height_m';
  return profile[def]
    ?? profile.height_to_parapet_m
    ?? profile.height_to_ridge_m
    ?? profile.height_to_eaves_m
    ?? profile.building_height_m;
}
```

The existing `applyConstructedHeight` signature (`height_m: number`) is unchanged — the caller
resolves the correct field and passes it as before. No breaking change.

**`apps/editor/src/ui/geospatial/contextTiles.ts` and `contextBuildings.ts`**

No change to the render path. Optionally wrap emitted buildings in `heightProfileFromLegacy`
for downstream consumers that want a `HeightProfile` — this is additive only.

### 2.5 Required test

`packages/schemas/__tests__/heightProfile.test.ts`:
```typescript
import { HeightProfile, heightProfileFromLegacy } from '../src/elements/site/context/heightProfile';

test('L0 — schema compiles with no I/O, no THREE, no DOM', () => {
  expect(HeightProfile).toBeDefined();
});

test('round-trip: golden fixture (3DBAG Amsterdam canal house)', () => {
  const fixture: HeightProfile = {
    ground_elevation_m: 0.57,   // AHN5 b3_h_maaiveld, ellipsoidal ≈ 43.57 m (set after Phase 3)
    roof_median_m: 15.56,       // b3_h_dak_50p (VERIFIED 2026-07-24)
    roof_p90_m: 16.31,          // b3_h_dak_70p proxy
    roof_peak_m: 17.74,         // b3_h_dak_max
    building_height_m: 15.00,   // roof_p90_m − ground
    height_to_parapet_m: null, height_to_ridge_m: 17.69, height_to_eaves_m: null,
    height_to_cornice_m: null, roof_type: 'gable', roof_pitch_deg: null, floors_est: 4,
    confidence: 0.96, provenance: 'national_lod2', source: '3DBAG_v2.8',
    epoch: '2023', algorithm_version: 'v2.3.1',
  };
  expect(HeightProfile.parse(fixture)).toEqual(fixture);
});

test('legacy backfill: assumed keeps 9 m', () => {
  const p = heightProfileFromLegacy(9, 'assumed');
  expect(p.building_height_m).toBe(9);
  expect(p.provenance).toBe('assumed');
  expect(p.confidence).toBe(0.1);
});

test('null height is nullable not zero', () => {
  const p = heightProfileFromLegacy(null, 'assumed');
  expect(p.building_height_m).toBeNull();
});
```

---

## Phase 3 — Terrain in the 3D-Site view

**Goal:** terrain mesh renders under context buildings, everywhere open DTM data exists.
**Effort:** H (~3–4 weeks). **Risk:** MEDIUM — datum alignment is the trap (§3.3).
**Sequence:** Phase 2 (HeightProfile) first — terrain writes `ground_elevation_m`.

### 3.1 Country DTM source table (verified 2026-07-24)

| Country | Source | URL | Resolution | CRS (horiz + vert) | License | Auth | Status |
|---|---|---|---|---|---|---|---|
| 🇳🇱 NL | AHN (PDOK WCS) | `service.pdok.nl/rws/ahn/wcs/v1_0` | 0.5 m | EPSG:28992 + NAP (EPSG:5709) | CC0 | None | ✅ **START HERE** |
| 🇨🇭 CH | swissALTI3D (STAC) | `data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d` | 0.5 m | EPSG:2056 (LV95) + EPSG:5728 (LN02) | Open | None | ✅ VERIFIED |
| 🇫🇷 FR | RGE ALTI (Géoplateforme WCS) | `data.geopf.fr/wcs` | 1 m | RGF93/Lambert93 + NGF-IGN69 | Open | Free reg | ✅ ACCESSIBLE |
| 🇩🇰 DK | DHM/Terræn (Dataforsyningen) | `download.kortforsyningen.dk` | 0.4 m | UTM32 + DVR90 | Open | Free token | ⚠ TOKEN REQUIRED |
| 🇪🇸 ES | PNOA MDT (CNIG) | `centrodedescargas.cnig.es` | 5 m | ETRS89-UTM + EVRF2007 | CC-BY | None | ✅ ACCESSIBLE |
| 🇳🇴 NO | NDH (hoydedata.no) | `hoydedata.no` | 1 m | UTM32 + NN2000 | Open | None | 🔒 Replit-blocked; verify from Fly |
| 🇩🇪 DE | DGM NRW (open.nrw) | `open.nrw/dataset/lod2-nrw` | 1 m | UTM32 + DHHN2016 | dl-de/by-2-0 | None | 🔒 Replit-blocked; verify from Fly |
| 🇺🇸 US | 3DEP (TNM) | `tnmaccess.nationalmap.gov/api/v1/products` **dataset="Digital Elevation Model (DEM) 1 meter"** | 1 m | UTM zone varies + NAVD88 | Public domain | None | ✅ VERIFIED (corrected dataset name) |
| 🇸🇦 SA | None open | — | — | — | — | — | ❌ No open DTM |

**Start order:** NL (AHN, CC0, WCS confirmed) → CH (swissALTI3D, CC, STAC confirmed) → FR (free reg) → ES (open, CC-BY) → DK (token) → NO/DE (Fly only).

### 3.2 Offline bake pipeline

**New file:** `tools/height-engine/terrain.py` (Python — shares the height-engine toolchain)

```python
"""
terrain.py — PRYZM DTM → quantized-mesh terrain tile bake
One country at a time; called per-tile from the build farm.
"""
import subprocess, json
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, calculate_default_transform

# Per-country DTM source config
TERRAIN_SOURCES = {
  'nl': {
    'wcs_url': 'https://service.pdok.nl/rws/ahn/wcs/v1_0',
    'coverage': 'ahn_05m_dtm',        # coverage identifier from WCS GetCapabilities
    's_crs': 'EPSG:7415',             # compound: RD New + NAP (EPSG:28992 + EPSG:5709)
    'license': 'CC0',
  },
  'ch': {
    'stac_url': 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d',
    's_crs': 'EPSG:9518',             # compound: LV95 + LN02 (EPSG:2056 + EPSG:5728)
    'license': 'Open',
  },
  'us': {
    'tnm_url': 'https://tnmaccess.nationalmap.gov/api/v1/products',
    'dataset': 'Digital Elevation Model (DEM) 1 meter',  # ← CORRECTED NAME
    's_crs': None,  # varies by state; read from GeoTIFF metadata
    'license': 'Public domain',
  },
}

def clip_to_tile(src_tif: Path, tile_bbox_wgs84: tuple, out_tif: Path, s_crs: str):
    """
    GDAL reproject + clip: national orthometric CRS → WGS84 ellipsoidal (EPSG:4979).
    This is the datum fix (GAP-C context): converts from national orthometric to
    WGS84 ellipsoidal heights, which is what Cesium, globeGroundAnchor.ts and the
    HeightProfile all use.
    
    ⚠ REQUIRES PROJ geoid grids to be available (PROJ_DATA env var pointing to a
    directory with the country's .gtx or .tif geoid correction file). Without the
    grid, GDAL silently skips the geoid correction and returns horizontal-only
    reprojected heights — wrong.
    
    Verify: Amsterdam AHN → expected ellipsoidal height ≈ 43–50 m at (52.37, 4.90).
    If result is 0–5 m, geoid grid is missing.
    """
    cmd = [
        'gdalwarp',
        '-s_srs', s_crs,          # e.g. EPSG:7415 (RD+NAP)
        '-t_srs', 'EPSG:4979',    # WGS84 3D (ellipsoidal)
        '-te', str(tile_bbox_wgs84[0]), str(tile_bbox_wgs84[1]),
                str(tile_bbox_wgs84[2]), str(tile_bbox_wgs84[3]),
        '-te_srs', 'EPSG:4326',
        '-tr', '0.000009', '0.000009',  # ~1 m at mid-latitudes in degrees
        '-r', 'bilinear',
        '-overwrite',
        str(src_tif), str(out_tif),
    ]
    subprocess.run(cmd, check=True)
```

### 3.3 Datum alignment — the hard sub-problem (DO FIRST)

**This is the #1 failure mode.** Prove it on ONE city (Amsterdam) before processing any others.

The geoid–ellipsoid separation:
- Netherlands (Amsterdam): +43 m (NAP height 0 m = ellipsoidal height +43 m)
- Switzerland (Zurich): +47–51 m (LN02)
- France (Paris): +44–48 m (NGF-IGN69)

**Datum correction per country** (`gdalwarp -s_srs`):

| Country | Compound CRS | gdalwarp `-s_srs` | Expected ellipsoidal ≈ |
|---|---|---|---|
| NL | RD New + NAP | `EPSG:7415` | +43–47 m at Amsterdam |
| CH | LV95 + LN02 | `EPSG:9518` | +47–51 m at Zurich |
| FR | RGF93/L93 + NGF-IGN69 | `EPSG:9794` | +44–48 m at Paris |
| ES | ETRS89-UTM30 + EVRF2007 | `EPSG:7423` | +48–55 m at Madrid |
| DK | UTM32/ETRS89 + DVR90 | `EPSG:4258+5799` (or EPSG:4937+DVR90) | +41–45 m at Copenhagen |
| NO | UTM32/ETRS89 + NN2000 | custom (EPSG:25832+EPSG:5941) | +38–44 m at Oslo |
| DE | UTM32/ETRS89 + DHHN2016 | `EPSG:25832+7837` | +43–48 m at Cologne |
| US | varies per state (NAD83/UTM) + NAVD88 | read from GeoTIFF | varies: +20–40 m CONUS |

**Acceptance check (non-negotiable before any other terrain work):**
```bash
# Sample AHN at Amsterdam centroid after gdalwarp → EPSG:4979
gdallocationinfo -valonly -geoloc out/nl/amsterdam_tile_ellipsoidal.tif 4.9003 52.3702
# Must return a value between 42 and 52. If < 10 → geoid grid not applied → STOP.
```

PROJ requires the geoid grid file. For NL (NAP → ellipsoidal):
- Download `nllgeo2018.tif` from `cdn.proj.org` or the PROJ CDN
- Set `PROJ_DATA=/path/to/grids/` OR use the PROJ network endpoint (`PROJ_NETWORK=ON`)

### 3.4 Raster → TIN → quantized-mesh (per tile)

```python
def raster_to_quantized_mesh(ellipsoidal_tif: Path, tile_z: int, tile_x: int, tile_y: int, out_path: Path):
    """
    1. Read the reprojected (ellipsoidal) GeoTIFF as a numpy array.
    2. RTIN meshing: use pydelatin for error-bounded TIN.
       from pydelatin import Delatin
       tin = Delatin(elevations, max_error=0.5)  # 0.5m max error for near tiles
       vertices, triangles = tin.vertices, tin.triangles
    3. Encode to Cesium quantized-mesh format.
       from quantized_mesh_encoder import encode
       encode(out_path, bounds, vertices, triangles, ...)
    4. Write to out/terrain/{z}/{x}/{y}.terrain
    """
```

**Library versions (pin these):**
```
pydelatin==0.2.4        # raster → TIN
quantized-mesh-encoder==0.4.3  # → Cesium terrain tiles
rasterio>=1.3           # GeoTIFF I/O
numpy>=1.26
```

### 3.5 Client integration (two-line change in CesiumViewport.ts)

```typescript
// apps/editor/src/ui/geospatial/CesiumViewport.ts — during Cesium viewer init:
if (import.meta.env.VITE_CONTEXT_TILES_URL) {
  const terrainProvider = await CesiumTerrainProvider.fromUrl(
    `${import.meta.env.VITE_CONTEXT_TILES_URL}/terrain`,
    { requestVertexNormals: true },  // enables lighting on terrain mesh
  );
  viewer.terrainProvider = terrainProvider;
}
// Context buildings must use HeightReference.CLAMP_TO_GROUND — verify this is set
// in the PolygonGraphics for contextBuildings. Cesium then handles terrain clamping
// automatically; no manual offset required.
```

**Verify CLAMP_TO_GROUND** is set in `contextBuildings.ts` and/or `contextTiles.ts` on every
extruded building polygon. If `HeightReference.NONE` is used, buildings will float.

### 3.6 Acceptance criteria (Phase 3)

1. **Datum proof (before anything else):** Amsterdam AHN centroid at (52.3702, 4.9003) →
   `gdallocationinfo` returns 42–52 m. If < 10 m, STOP and fix geoid grid. Screenshot the
   terminal output.
2. **Amsterdam visual:** open a canal-side parcel → sloped terrain renders; Jordaan buildings
   (slightly above sea level) sit on gently sloping ground. Screenshot.
3. **Zurich visual:** open a parcel near the Limmat → terrain shows the river valley slope.
4. **Performance:** terrain tiles stream < 500 ms for a 2 km radius. No FPS drop < 30.
5. **HeightProfile:** `ground_elevation_m` populated on baked buildings (from the terrain mesh
   DTM sample at the footprint centroid) for NL + CH at minimum.

---

## Phase 4 — LiDAR nDSM height engine

**Goal:** measured heights + roof types for every building in LiDAR-covered countries.
**Effort:** XL (~2–3 months). **Risk:** HIGH.
**Sequence:** Phase 3 terrain DONE first (shares DTM pipeline and datum conventions).
**Language:** Python service (`tools/height-engine/`). Tile-parallel build farm.

### 4.1 Corrected LiDAR source table (2026-07-24)

| Country | Source | Access URL | **Density** | License | Auth | Replit-accessible |
|---|---|---|---|---|---|---|
| 🇳🇱 NL | AHN5 (PDOK WCS) | `service.pdok.nl/rws/ahn/wcs/v1_0` | **36.7 pts/m²** (VERIFIED — NOT 8-10 as previously stated) | CC0 | None | ✅ |
| 🇨🇭 CH | swisstopo LiDAR (STAC) | `data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d` | 4–8 pts/m² | Open | None | ✅ |
| 🇫🇷 FR | IGN LiDAR HD (Géoplateforme) | `data.geopf.fr` | 10–20 pts/m² | Open | Free reg | ✅ |
| 🇪🇸 ES | PNOA (CNIG) | `centrodedescargas.cnig.es` | 0.5–2 pts/m² | CC-BY | None | ✅ |
| 🇳🇴 NO | Kartverket NDH | `hoydedata.no` | 2–8 pts/m² | Open | None | 🔒 Replit-blocked |
| 🇩🇪 DE | NRW open | `opengeodata.nrw.de` | 4–8 pts/m² | dl-de/by-2-0 | None | 🔒 Replit-blocked |
| 🇺🇸 US | 3DEP (TNM) dataset **"Digital Elevation Model (DEM) 1 meter"** | `tnmaccess.nationalmap.gov/api/v1/products` | 2–12 pts/m² | Public domain | None | ✅ |

> **Correction from earlier draft:** AHN LiDAR density is **36.7 pts/m²** (AHN5, verified from
> `b3_puntdichtheid_ahn5` attribute on a live 3DBAG feature). The earlier "8–10 pts/m²" figure
> was for AHN3/AHN4. AHN5 is the current product; this raises the confidence score significantly.

### 4.2 LiDAR tile registry (Postgres table)

```sql
-- Add to server/dbMigrate.js or a new migration in scripts/migrate/
CREATE TABLE IF NOT EXISTS lidar_tile_registry (
  id              SERIAL PRIMARY KEY,
  country         CHAR(2)       NOT NULL,
  tile_id         TEXT          NOT NULL,
  bbox_wsen       FLOAT8[4]     NOT NULL,          -- [W, S, E, N] WGS-84 degrees
  epsg            INT           NOT NULL,
  density_ppm2    FLOAT4,                           -- null = unknown
  year            SMALLINT,
  is_classified   BOOLEAN       NOT NULL DEFAULT FALSE,
  license         TEXT          NOT NULL,           -- SPDX or free-text
  download_url    TEXT          NOT NULL,
  file_size_mb    FLOAT4,
  last_checked    TIMESTAMPTZ   DEFAULT now(),
  UNIQUE (country, tile_id)
);
-- Requires PostGIS for the spatial index:
CREATE INDEX IF NOT EXISTS lidar_registry_bbox_idx ON lidar_tile_registry
  USING GIST (ST_MakeEnvelope(bbox_wsen[1], bbox_wsen[2], bbox_wsen[3], bbox_wsen[4], 4326));
```

### 4.3 Per-building pipeline (12 stages)

**`tools/height-engine/pipeline.py`** — one function per stage, independently testable.

```
Stage 1:  ACQUIRE  — footprint bbox → registry lookup → download .laz (cache)
Stage 2:  NORMALIZE CRS — reproject to metric CRS (UTM zone of tile centroid). NEVER geographic.
Stage 3:  READ  — laspy read: XYZ + Intensity + Classification + ReturnNumber
Stage 4:  DTM  — ground points (class 2) or SMRF filter if unclassified → TIN/IDW → raster
Stage 5:  DSM  — max Z per raster cell → raster (void-fill < 5 px)
Stage 6:  nDSM — DSM − DTM, clamp to [−0.5, 200] m
Stage 7:  FOOTPRINT CONDITIONING — (a) make_valid + simplify, (b) split merged polygons,
          (c) buffer −0.5 m inward. Returns list of Polygon (usually 1; multi for merged blocks).
Stage 8:  SAMPLE — rasterize eroded footprint → extract nDSM cells inside
Stage 9:  VEG REJECT — class 5 if classified; else planarity (roughness threshold 0.8 m std_dev)
Stage 10: ROOF RANSAC — pyransac3d plane fitting → count planes → roof_type + pitch
Stage 11: HEIGHTS — perimeter DTM plane fit → ground_elevation_m; P90 + P50 nDSM → roof heights
Stage 12: CONFIDENCE — 6-factor weighted score → HeightProfile
```

**Confidence scoring formula** (6 factors, weights sum to 1.0):
```python
def compute_confidence(density_ppm2, n_roof_points, veg_fraction,
                        footprint_quality, plane_residual_m, terrain_sigma_m):
    def dens(d):
        # AHN5: d=36.7 → score=1.0; ES PNOA: d=1.0 → score=0.45
        if d >= 10: return 1.0
        if d >= 4:  return 0.7 + 0.3*(d-4)/6
        if d >= 1:  return 0.3 + 0.4*(d-1)/3
        return 0.1
    def pts(n):
        if n >= 100: return 1.0
        if n >= 50:  return 0.7
        if n >= 20:  return 0.4
        return 0.0
    def res(r):  # plane fit RMS residual
        if r <= 0.10: return 1.0
        if r <= 0.30: return 0.6
        return max(0, 0.2 - (r-0.30)*0.4)
    def tsig(s):  # terrain sigma
        if s <= 0.20: return 1.0
        if s <= 0.50: return 0.6
        return max(0, 0.2 - (s-0.50)*0.2)
    return min(1.0, (
        0.20 * dens(density_ppm2) +
        0.15 * pts(n_roof_points) +
        0.15 * (1 - min(1, veg_fraction)) +
        0.15 * min(1, footprint_quality) +
        0.20 * res(plane_residual_m) +
        0.15 * tsig(terrain_sigma_m)
    ))
```

### 4.4 Three hard sub-problems (budget explicitly)

| Sub-problem | Stage | Difficulty | Time budget |
|---|---|---|---|
| **Merged footprint splitting** (Spain/Saudi: one polygon = 3 villas) | 7b | HARD — watershed on nDSM | 2 weeks |
| **Vegetation rejection on unclassified LiDAR** (ES PNOA ~0.5 pts/m²) | 9 | MEDIUM — planarity heuristic | 1 week |
| **LiDAR license audit per country** (some FR IGN tiles: CC-BY-NC) | Pre-build gate | MEDIUM | 1 week research BEFORE writing code |

**Merged footprint split algorithm** (Stage 7b):
```python
from scipy import ndimage
from skimage.segmentation import watershed
from skimage.feature import peak_local_max

def split_merged_footprint(ndsm_clip: np.ndarray, footprint_mask: np.ndarray):
    """
    Detect sub-buildings within a single footprint polygon using watershed on nDSM.
    Returns a list of sub-footprint masks (usually 1; multi for block polygons).
    """
    # 1. Binary mask: nDSM > P25 (cells likely above ground level)
    above_ground = ndsm_clip > np.percentile(ndsm_clip[footprint_mask], 25)
    # 2. Distance transform from the footprint boundary (seed for watershed)
    dist = ndimage.distance_transform_edt(above_ground & footprint_mask)
    # 3. Local maxima as watershed seeds (one per sub-building)
    local_max = peak_local_max(dist, min_distance=3, labels=footprint_mask)
    markers = ndimage.label(local_max)[0]
    # 4. Watershed segmentation
    labels = watershed(-dist, markers, mask=footprint_mask)
    # 5. Filter: keep regions > 10 m² (artifact removal)
    regions = [labels == i for i in np.unique(labels) if i > 0
               and np.sum(labels == i) > 10]
    return regions if len(regions) > 1 else [footprint_mask]
```

### 4.5 Build farm

```
Queue: Redis RPUSH/LPOP (or SQS) — one job per building_id
Workers: Docker containers on Fly Machines (Python 3.11 + GDAL + PDAL)
Output: write HeightProfile row to Postgres per building_id
        write per-tile Arrow file to R2: tiles/height/{z}/{x}/{y}.arrow
Incremental: LiDAR tile refresh → re-queue only buildings whose bbox intersects the changed tile
             New row with bumped algorithm_version; old rows retained (never overwrite)
```

### 4.6 API endpoint

```
GET /api/building/:building_id/height-profile
  → 200 { HeightProfile }
  → 404 { error: 'not_found' }
  → 202 { status: 'queued', eta_seconds: 120 }  (first request triggers the pipeline)

Feeds: heightSources.mjs top 'tagged' tier, scene tiles (Phase 5), C58 envelope solver
```

### 4.7 Acceptance criteria (Phase 4)

**Amsterdam (AHN5, 36.7 pts/m², classified):**
- ≥90% of buildings in the Jordaan / De Pijp get `provenance: 'lidar_ndsm'`
- Spot-check 20 vs BAG/WOZ known heights: |measured − actual| ≤ 0.5 m for ≥80%
- `roof_type` distribution: ≥60% `gable` (Amsterdam canal houses — if < 60%, tune RANSAC threshold)

**Barcelona (PNOA ~1 pts/m², partially classified):**
- ≥50% of buildings get `provenance: 'lidar_ndsm'` (lower density → lower recall)
- Confidence mean 0.45–0.60 (lower density = lower confidence — expected)

**Split test (Spain):** one Catastro merged-block polygon → `split_merged_footprint` detects ≥3 sub-buildings. Screenshot the nDSM heatmap with detected splits overlaid.

---

## Phase 5 — Scene compiler + scene tiles

**Goal:** the Forma-class runtime. A planning environment, not a GIS viewer.
**Effort:** XL (multi-quarter). **Risk:** HIGHEST.
**Sequence:** Do NOT start until Phases 1–4 prove data in ≥2 cities.

### 5.1 Scene tile format (`.snap`)

A 256 m × 256 m metric tile (one directory per tile, served from R2):

```
tile_{x}_{y}_{z}/
├── terrain.glb        — terrain mesh (Phase 3 output, re-encoded glTF/meshopt)
├── buildings.glb      — procedural LOD100/LOD150/LOD200 meshes
├── trees.arrow        — vegetation instances (x,y,z,species,height_m,rotation_deg)
├── roads.glb          — road surface + kerbs
├── water.glb          — water body surfaces
├── textures.ktx2      — satellite/landcover/slope-tint textures
└── metadata.arrow     — knowledge graph: object_id → planning object
```

**Invariant:** every object in every `.glb` carries an `object_id` string attribute (Overture
building id / parcel refcat / OSM way id) that maps to `metadata.arrow`. This is what makes
clicking a building retrieve its planning object — not a raycast into triangles.

### 5.2 Procedural building generator (the only non-trivial compiler)

```js
// tools/scene-compiler/buildings.mjs
// Input: footprint (Polygon WGS84), HeightProfile, roof_type, roof_pitch_deg
// Output: glTF buffer (LOD100 = box, LOD150 = real-height box, LOD200 = roof planes)

function buildingToGltf(footprint, profile, roofType, pitchDeg) {
  const h = profile.building_height_m ?? 9;
  const walls = extrudeWalls(footprint, h);  // LOD150

  if (roofType === 'flat') return mergeGltf([walls, closedCap(footprint, h)]);

  if (roofType === 'gable') {
    const shortAxis = shortestFootprintAxis(footprint);  // metres
    const ridgeH = h + Math.tan(pitchDeg * Math.PI/180) * shortAxis / 2;
    return mergeGltf([walls, gableRoof(footprint, h, ridgeH, pitchDeg)]);
  }
  if (roofType === 'hip') {
    return mergeGltf([walls, hipRoof(footprint, h, pitchDeg)]);
  }
  // complex / unknown → LOD150 flat cap (honest fallback)
  return mergeGltf([walls, closedCap(footprint, h)]);
}
```

### 5.3 Runtime streaming + picking

```typescript
// apps/editor/src/ui/geospatial/sceneStream/SceneStreamManager.ts

// Picking — the key differentiator. NOT scene.traverse.
// Uses three-mesh-bvh: npm install three-mesh-bvh
import { MeshBVH } from 'three-mesh-bvh';

// On click:
const hit = tileBvh.raycast(ray, side);
if (hit) {
  const objectId = hit.face.userData.objectId;  // stored in BufferGeometry
  const planningObj = await fetch(`/api/knowledge-graph/${objectId}`).then(r=>r.json());
  // → { zoning, allowed_height_m, far_allowed, far_current, redevelopment_potential }
  ui.showInspectPanel(planningObj);  // C27 Inspect / L-611 Living Graph binding
}
```

### 5.4 Acceptance criteria (Phase 5)

- Barcelona: terrain + buildings + roads stream < 2 s for 2 km radius; 60 FPS measured
- Click any building → planning object panel in < 200 ms (BVH pick, not traverse)
- LOD transitions: no popping; vertex-collapse morphing visible at 30 m/s camera pan

---

## Phase 6 — C-CONTEXT contract

**Draft in parallel with Phase 2. Ratify before Phase 3 code merges.**

**File:** `docs/02-decisions/contracts/C-CONTEXT-SCENE-HEIGHT-TERRAIN.md`

```
CONTRACT C-CONTEXT — Context Scene, Height & Terrain Engine

§1. HeightProfile is the canonical height datum.
    No consumer stores or transmits a bare height_m.

§2. Robust statistics only (P90 or trimmed median). Never max. Never mean.
    Eroded footprint (−0.5 m buffer) mandatory for nDSM sampling.

§3. Provenance mandatory: source, algorithm_version, epoch, confidence.
    Never fabricate. Missing → honest fallback tier, flagged.
    Versioned: new algorithm_version row; never overwrite.

§4. One vertical datum: WGS-84 ellipsoidal (C12 §1.4 / globeGroundAnchor.ts).
    All national orthometric → ellipsoidal via the per-country compound CRS table (§3.1).
    Terrain, buildings, and envelope share one vertical origin (L-584).

§5. Render assets and knowledge graph share object_id.
    Clicking a building retrieves a planning object, not triangle data.

§6. Physical context strictly separated from the buildable-rule rate.
    C57 = "what exists". C58 = "what you may build". Never merged.

§7. "Done" = "renders + is measured." Not done on code-merge.
```

---

## Milestones and sequencing

| Milestone | Phases | Duration | Gate | Risk |
|---|---|---|---|---|
| M1 — Real heights render | 1 + 2 | ~2 weeks | Paris FIRST (already works — wire the line). Then Amsterdam (requires §1.2 geometry fix). HeightProfile schema compiles. | LOW |
| M2 — Terrain closes the gap | 3 | ~4 weeks | Amsterdam + Zurich: sloped terrain visible. Datum proof (ellipsoidal ≈ 43–50 m at AHN centroid) FIRST, all else second. | MEDIUM |
| M3 — Measured heights + roofs | 4 | ~3 months | Amsterdam: 90% `lidar_ndsm` ±0.5 m. Roof types. Footprint split working. | HIGH |
| M4 — Forma-class runtime | 5 | multi-quarter | Barcelona: < 2 s stream, 60 FPS, click → planning object. | HIGHEST |

---

## Top risks (ranked)

| Risk | Phase | Mitigation |
|---|---|---|
| **Geoid grid missing → datum silent fail** | 3 | Probe Amsterdam AHN centroid FIRST. Must return 42–52 m. Set PROJ_DATA correctly. |
| **3DBAG geometry reprojection (GAP-A)** | 1 | §1.2 gives the exact inverse RD→WGS84 formula. Test on 10 Amsterdam buildings before full bake. |
| **Catastro Spain bbox timeout (GAP-B)** | 1 | Per-city bboxes ONLY. Never the national Spain entry for Catastro. |
| **LiDAR non-commercial clauses** | 4 | 1-week license audit BEFORE writing any country's pipeline. FR IGN LiDAR HD: verify CC-BY terms specifically. |
| **Merged footprint split** | 4 | 2-week research budget. Start Spain/Saudi. If watershed fails after 2 weeks, ship without splitting and document. |
| **DK Dataforsyningen auth** | 1, 3, 4 | Register at dataforsyningen.dk → free token → `GEODANMARK_TOKEN` env var. If token absent, `status: 'blocked'`, not error. |
| **Cesium terrain z-fighting** | 3 | `HeightReference.CLAMP_TO_GROUND` on all context building polygons. Verify before any terrain screenshot. |
| **pnpm lockfile breaks Fly build** | All | `pnpm --filter @pryzm/editor add <pkg>` → commit `pnpm-lock.yaml` in the SAME commit. `tsc --skipLibCheck` before committing. |

---

## Tech stack (binding, library versions pinned)

| Domain | Library | Version | Notes |
|---|---|---|---|
| LiDAR I/O | PDAL | ≥2.6 | Classification, SMR filter |
| LiDAR I/O | laspy | ≥2.4 | Faster for simple reads |
| Raster ops | rasterio | ≥1.3 | GeoTIFF I/O, reprojection |
| Geometry | shapely | ≥2.0 | make_valid, buffer, split |
| Roof seg | pyransac3d | ≥0.6 | Plane fitting (lighter than open3d) |
| DTM→TIN | pydelatin | 0.2.4 | RTIN meshing |
| Terrain encode | quantized-mesh-encoder | 0.4.3 | Cesium .terrain format |
| Vector tiles | tippecanoe | existing | |
| PMTiles | pmtiles | existing | |
| Metadata | Apache Arrow | pyarrow ≥15 | per-tile metadata |
| Textures | KTX2 | basisu CLI | Three.js KTX2Loader in-tree |
| Cesium terrain | CesiumTerrainProvider | existing | zero runtime client code |
| BVH picking | three-mesh-bvh | ≥0.7 | new npm dep for Phase 5 |
| Postgres | psycopg3 | ≥3.1 | lidar_tile_registry |

---

*Updated 2026-07-24. All corrections from live probing this session:
(1) AHN PDOK URL corrected to `service.pdok.nl/rws/ahn/wcs/v1_0`.
(2) 3DEP dataset name corrected to "Digital Elevation Model (DEM) 1 meter".
(3) Catastro TypeName corrected to `bu:BuildingPart` (not `bu:Building`).
(4) AHN5 LiDAR density corrected to 36.7 pts/m² (not 8-10).
(5) GAP-A (3DBAG geometry null) documented and fix specified.
(6) GAP-B (Catastro Spain bbox timeout) documented and fix specified.
(7) DK auth status corrected (HTTP 401, token required).
(8) swissALTI3D CRS confirmed EPSG:2056+5728 from live tile filename.
(9) schemas path `packages/schemas/src/elements/site/` confirmed non-existent; mkdir instruction added.
(10) `resolveHeights` return values confirmed live: paris=ok/4315, amsterdam=documented, spain=error(timeout).
Maintainer: UNASSIGNED.*

*Cross-refs: `CONTEXT-SCENE-COMPILER-NORTH-STAR.md` (vision) · `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`
(shipped pipeline) · `CONTEXT-LOD-BUILD-PLAN.md` + `heightSources.mjs` (height build) ·
`jurisdictions/LOD-RATE-MASTER.md` (LOD per country) · `globeGroundAnchor.ts` (L-584 datum) ·
`C57-PARCEL-DATA-LAYER.md` · `C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md` · L-611 · C27.*
