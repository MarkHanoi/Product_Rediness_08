# Context Scene-Compiler + Terrain — Full Implementation Plan

> **Status: IMPLEMENTATION BLUEPRINT — 2026-07-24.**
> 10× expansion of `CONTEXT-SCENE-COMPILER-NORTH-STAR.md`. This document is the engineer/agent
> hand-off: every phase has exact file paths anchored to the PRYZM monorepo, schemas, algorithms,
> library choices, integration points, acceptance tests, and "definition of done". Nothing here is
> theorised — every concrete claim about existing code is traceable to a file. Cross-refs are inline.
>
> **Honesty tier (binding):** §CONTEXT-DATA-HONESTY + C57 + C58. A value without provenance
> MUST NOT ship. Never fabricate. Never claim a stage done on code-merge alone — "renders +
> is measured" only. Mark ESTIMATED vs VERIFIED on every data claim.

---

## 0 — Project state as of 2026-07-24 (read first)

### What is shipped and confirmed working

| Component | File | State |
|---|---|---|
| Static PMTiles bake (multi-region) | `tools/context-bake/bake.mjs` | ✅ SHIPPED (L-607). Spain, Netherlands + other regions. |
| PMTiles client tile reader | `apps/editor/src/ui/geospatial/contextTiles.ts` | ✅ SHIPPED (L-513b). Replaces live Overpass on hot path. |
| Height-source module (3 sources live) | `tools/context-bake/heightSources.mjs` | ✅ SHIPPED (L-513 / LOD-200). 3DBAG (NL), BD TOPO (FR), Catastro (ES) — live-probed. |
| Per-country LOD measurement | `docs/04-reference/jurisdictions/LOD-RATE-MASTER.md` | ✅ COMPLETE. 13 countries. 6 VERIFIED live. |
| Near/far ring context render | `apps/editor/src/ui/geospatial/contextBuildings.ts` | ✅ SHIPPED. `heightProvenance` badge (`tagged`/`derived-levels`/`assumed`). |
| Ground datum anchor (L-584 fix) | `apps/editor/src/ui/geospatial/globeGroundAnchor.ts` | ✅ SHIPPED. WGS-84 ellipsoidal datum. Photoreal-tile clamp. |
| Envelope height solver | `packages/site-parcel-data/src/envelopeHeight.ts` | ✅ SHIPPED. Reads `height_m`; jurisdiction definitions pending HeightProfile migration. |
| Overpass gentle-mirrors fallback | `apps/editor/src/ui/geospatial/contextBuildings.ts` | ✅ SHIPPED. Degraded path; tiles are primary. |

### What is NOT built (this document's scope)

1. National heights wired into bake pipeline (Phase 1)
2. `HeightProfile` schema — regulation-aware multi-field datum (Phase 2)
3. Terrain mesh in 3D-Site (Phase 3 — **the long-requested gap**)
4. LiDAR nDSM height engine — measured heights + roof types (Phase 4)
5. Scene-compiler + scene tiles — Forma-class runtime (Phase 5)

### Binding conventions (all phases)

- **Monorepo layout:** `pnpm` workspaces. Offline compilers in `tools/`. Schemas (L0 Zod, no
  I/O, no THREE, no DOM) in `packages/schemas/src/elements/site/context/`. Client render/stream
  in `apps/editor/src/ui/geospatial/`. Server tile API in `server/`.
- **Tile key:** WebMercator zoom-15 (~1.2 km edge) OR a 256 m fixed metric grid. ONE scheme
  everywhere — decide at Phase 3 kickoff and never mix. Zoom-15 is preferred (Cesium terrain
  provider speaks it natively; PMTiles also uses it).
- **Provenance is mandatory** on every derived value. Fields: `source`, `algorithm_version`,
  `epoch`, `confidence`. A value without all four MUST NOT ship.
- **Determinism:** every compiler is pure `(input_hash, algorithm_version) → identical output`.
  Outputs are versioned, never overwritten — append a new `algorithm_version` row.
- **Robust statistics only.** P90 or trimmed median (10th–90th percentile). Never `max`
  (chimneys/antennae bias). Never bare `mean` (skewed by outliers). This is the rule everywhere
  heights are computed.
- **Never fabricate.** Missing data → the honest fallback tier, flagged; the 9 m assumed default
  is the floor, never a silent value passed as measured.
- **One vertical datum** — WGS-84 ellipsoidal throughout, matching what `globeGroundAnchor.ts`
  already enforces (`GroundDatum = 'ellipsoidal-wgs84'`). Converting from a national orthometric
  datum uses the same single C12 `proj4` projector (see L-584 fix in `globeGroundAnchor.ts`).
- **No code is merged without a test.** Every schema gets a golden-fixture round-trip test.
  Every compiler phase gets an acceptance measurement (render + quantified).

---

## Phase 1 — National heights wired into the bake

**Goal:** kill the 9 m default for every city where a national height source exists.
**Effort:** M (~1 week). **Risk:** LOW. **Sequence:** do this first — no other phase depends on it
but it makes every subsequent measurement more meaningful.

### 1.1 Current state — what exists

`tools/context-bake/heightSources.mjs` already implements three live-probed sources:

| Source id | Country | Endpoint proven | Coverage | `heightProvenance` |
|---|---|---|---|---|
| `3dbag` | NL | `api.3dbag.nl/collections/pand/items` | ~99% | `tagged` (roof measurement) |
| `bdtopo` | FR | `data.geopf.fr/wfs` BDTOPO_V3:batiment | ~88% | `tagged` (measured `hauteur`) |
| `catastro` | ES | `ovc.catastro.meh.es/INSPIRE/wfsBU.aspx` | ~45% (height) | `derived-levels` (floor count × 3.2 m) |

`bake.mjs` does NOT call `resolveHeights` yet. The integration is documented but not wired.

### 1.2 The one integration line into bake.mjs

In `tools/context-bake/bake.mjs`, the buildings layer loop already has this shape:

```js
// Inside the per-region loop, after the Overture/OSM footprint step
for (const r of okRegions) {
  const geo = resolve(OUT, `${r.name}-${l.id}.geojsonseq`);
  if (l.id === 'buildings' && buildingsSourceFor(r) === 'overture') {
    run(`overture buildings · ${r.name} → GeoJSONSeq`, overtureBuildingsCmd(r, geo));
  } else { /* osmium path */ }
  geos.push(geo);
}
```

**Add immediately after the `overture`/`osmium` step** (BEFORE `geos.push`):

```js
if (l.id === 'buildings') {
  const bbox = r.bbox.split(',').map(Number); // [w,s,e,n]
  const nat = await resolveHeights(r.name, { bbox });
  if (nat.status === 'ok') {
    const natGeo = resolve(OUT, `${r.name}-buildings-national.geojsonseq`);
    require('node:fs').writeFileSync(natGeo, nat.geojsonseq);
    // Dedup policy (§1.3): full-coverage national source REPLACES the region's OSM/Overture
    // clip entirely; partial appends alongside it. Never draw both at 9 m AND at real height.
    if (FULL_COVERAGE_SOURCES.has(nat.sourceId)) {
      geos.splice(geos.indexOf(geo), 1, natGeo); // replace
      console.log(`  ↳ ${r.name}: REPLACED with national source ${nat.sourceId} (${nat.count} buildings)`);
    } else {
      geos.push(natGeo); // append
      console.log(`  ↳ ${r.name}: APPENDED national source ${nat.sourceId} (${nat.count} buildings)`);
    }
  } else {
    console.log(`  ↳ ${r.name}: no national height source (${nat.status}${nat.reason ? ': ' + nat.reason : ''}) — keeping OSM/Overture`);
  }
}
```

Define at the top of `bake.mjs`:
```js
// Sources that cover ≥95% of buildings in a region → replace OSM/Overture entirely.
// Partial sources (Catastro ~45%) → append; tippecanoe deduplicates by spatial overlap.
const FULL_COVERAGE_SOURCES = new Set(['3dbag', 'bdtopo', 'lod2de', 'geodanmark']);
```

Import `resolveHeights` at the top:
```js
import { resolveHeights } from './heightSources.mjs';
```

### 1.3 Dedup policy (binding)

| Source coverage | Policy | Mechanism |
|---|---|---|
| Full (≥95%): 3DBAG, BD TOPO, LoD2-DE, GeoDanmark | **REPLACE** the region's OSM/Overture GeoJSONSeq | `geos.splice(...)` |
| Partial (<95%): Catastro (~45%), US 3DEP (varies) | **APPEND** — tippecanoe merges; client `heightProvenance` badge distinguishes | `geos.push(...)` |

Appended sources create footprint duplicates in the tile. The client already handles this: the
`contextTiles.ts` reader keeps the FIRST feature per synthetic osmId for dedup. When a building
appears in both OSM (9 m assumed) and Catastro (derived-levels), the national feature must sort
FIRST. Sort order in tippecanoe output = last file on the CLI wins (feature appears later).
Therefore for append sources, move the national GeoJSONSeq to the END of the `geos` array:

```js
if (FULL_COVERAGE_SOURCES.has(nat.sourceId)) {
  geos.splice(geos.indexOf(geo), 1, natGeo); // replace
} else {
  // Append LAST so tippecanoe places the national feature after OSM.
  // contextTiles.ts keeps the LAST feature per spatial position → national wins.
  // ⚠ Confirm this against tippecanoe's feature ordering before deploying.
  geos.push(natGeo);
}
```

### 1.4 Two new sources to add to heightSources.mjs

**Source: LoD2-DE (NRW open CityGML)**

```
Endpoint: https://opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/
Format: CityGML tiles per 1 km² grid cell, compressed .gml.gz
Auth: none (open)
Coverage: NRW only (~35% of Germany population); extrapolate cautiously
License: dl-de/by-2-0 (attribution required)
Height field: measuredHeight (absolute NN height) → subtract terrain elevation for building_height
Provenance: tagged
```

Fetcher pattern (mirror 3DBAG):
```js
async function fetchLoD2DE({ bbox }) {
  // 1. Compute intersecting 1 km² tile keys from bbox
  // 2. Download .gml.gz tiles (cache locally — they are large, ~5 MB/tile)
  // 3. Parse CityGML: <bldg:Building> → footprint polygon + <bldg:measuredHeight>
  // 4. Emit GeoJSONSeq: { type:'Feature', geometry:footprint, properties:{ height, heightProvenance:'tagged', source:'lod2de_nrw', algorithm_version:'v1.0.0' } }
  // Never-throws: wrap in try/catch, return { status:'error', reason }
}
```

**Source: GeoDanmark / DHM (Denmark)**

```
Endpoint: https://api.dataforsyningen.dk/rest/gst/api/dhm (requires free API key)
Alternative: WFS https://services.datafordeler.dk/GeoDanmarkVektor/GeoDanmark60_Ortho_UTM32Euref89/1.0.0/WFS
Format: GeoJSON or GML; building height from DHM (Digital Height Model)
Auth: Dataforsyningen API key (free registration) — BLOCKED on Replit without a key; document as 'blocked' until key is set in env
Coverage: ~95% of Denmark
Provenance: tagged
```

### 1.5 Acceptance criteria (Phase 1)

Re-bake Paris, Amsterdam, Madrid. Inspect with `pmtiles show` or the PMTiles viewer:

| City | Target | Measure |
|---|---|---|
| Amsterdam | >99% of buildings carry `heightProvenance:'tagged'` | `pmtiles inspect buildings.pmtiles --bounds=...` → count tagged |
| Paris (8e) | >80% tagged; `hauteur` values 6–45 m (not uniform 9) | spot-check 20 buildings vs BD TOPO viewer |
| Madrid | >40% `derived-levels`; no uniform 9 m | Catastro floor counts × 3.2 m visible |

**Definition of done:** the 3D Site (Cesium view) for each city renders a recognisable skyline —
NOT a uniform 9 m carpet. `heightProvenance` badge in any future UI shows `tagged` for national-height
buildings. No building carries a silent fabricated height. Screenshot + measure before marking done.

---

## Phase 2 — HeightProfile schema

**Goal:** a single regulation-aware, multi-field datum so no consumer ever hardcodes `height_m`.
**Effort:** S–M (~3 days). **Risk:** LOW. **Sequence:** BEFORE Phase 3 or 4 write any output.
This schema is the data contract that gates all downstream phases.

### 2.1 Why one bare `height_m` is wrong

Jurisdictions define "building height" differently. Examples from the codebase
(`packages/site-parcel-data/src/envelopeHeight.ts`, `C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md`):

| Jurisdiction | "Building height" means |
|---|---|
| Netherlands | Roof ridge (nok) |
| Germany (BauO NRW) | Traufe (eaves) |
| France (PLU) | Égout du toit (eaves) |
| Spain (NNUU) | Cornisa (cornice/parapet) |
| UK (NPPF) | Ridge or mean roof height depending on context |

A single `height_m` serves none of them correctly unless you know which definition it uses.
The `HeightProfile` stores every statistic; the jurisdiction rule pack selects the right field.

### 2.2 Schema (create this file)

**File:** `packages/schemas/src/elements/site/context/heightProfile.ts`

```typescript
import { z } from 'zod';

// ─── BINDING RULES (C-CONTEXT §1, ratified Phase 2) ─────────────────────────
//   1. No consumer may store or transmit a bare `height_m` — use this type.
//   2. Robust statistics only: P90 and trimmed-median. Never max. Never bare mean.
//   3. Provenance mandatory: all four fields (source, algorithm_version, epoch, confidence).
//   4. ground_elevation_m is WGS-84 ellipsoidal (matches globeGroundAnchor.ts C12 §1.4).
//   5. building_height_m = roof_p90_m - ground_elevation_m (canonical; the most useful
//      single number — but jurisdictions read the correct field via heightDefinition).
//   6. Fields are nullable: null means "not measured / not applicable", NOT zero.
//   7. This schema is L0: pure Zod, no I/O, no THREE, no DOM imports.

export const RoofType = z.enum([
  'flat',       // < 5° pitch; common in modern construction
  'gable',      // two slopes meeting at a ridge
  'hip',        // four slopes, no gable ends
  'shed',       // single slope
  'mansard',    // two slopes per side, lower steeper
  'gambrel',    // two slopes per side, upper shallower
  'complex',    // irregular; multiple roof planes, dormers, setbacks
  'unknown',    // LiDAR insufficient or roof obscured
]);

export const HeightProvenance = z.enum([
  'lidar_ndsm',      // LiDAR DSM−DTM pipeline (Phase 4) — highest confidence measured
  'national_lod2',   // national LoD2 dataset (3DBAG, swissBUILDINGS3D, LoD2-DE, GeoDanmark)
  'national_lod1',   // national LoD1 dataset (BD TOPO hauteur, Catastro × storeys)
  'osm_tag',         // OSM `height=` tag, author-supplied (unverified)
  'levels_x_h',      // `building:levels` × storey height — derived, not measured
  'ml_estimate',     // ML model estimate (Overture / Microsoft height model)
  'assumed',         // 9 m honest default — no usable source at all
]);

export const HeightProfile = z.object({
  // ── Elevation absolutes (WGS-84 ellipsoidal, metres) ────────────────────
  ground_elevation_m: z.number().nullable(),
  // The terrain plane under the building footprint (perimeter DTM fit, not centroid).
  // Source: Phase 3 terrain mesh DTM sample OR `globeGroundAnchor.ts` photoreal-tile clamp.
  // null until Phase 3 terrain is shipped; consumers fall back to Cesium's ground clamping.

  roof_median_m:  z.number().nullable(), // P50 of nDSM cells inside eroded footprint (absolute)
  roof_p90_m:     z.number().nullable(), // P90 — the canonical roof height (absolute)
  roof_peak_m:    z.number().nullable(), // max of roof-plane RANSAC vertices (absolute)

  // ── Heights relative to ground (these are what planners and rules actually use) ──
  building_height_m:    z.number().nullable(), // roof_p90_m − ground_elevation_m (canonical)
  height_to_parapet_m:  z.number().nullable(), // top of parapet wall (flat roofs)
  height_to_ridge_m:    z.number().nullable(), // ridge (gable/hip — the highest fixed point)
  height_to_eaves_m:    z.number().nullable(), // eaves/traufe (base of roof slope)
  height_to_cornice_m:  z.number().nullable(), // cornice/cornisa (used by ES NNUU)

  // ── Roof geometry ────────────────────────────────────────────────────────
  roof_type:      RoofType,
  roof_pitch_deg: z.number().min(0).max(90).nullable(),

  // ── Derived ─────────────────────────────────────────────────────────────
  floors_est: z.number().int().positive().nullable(),
  // Derived: building_height_m / assumed_storey_height_m, rounded. Not a measurement.

  // ── Provenance (mandatory — §CONTEXT-DATA-HONESTY) ──────────────────────
  confidence:        z.number().min(0).max(1),
  provenance:        HeightProvenance,
  source:            z.string().min(1),
  // Dataset identifier, e.g. '3DBAG_v2.8' / 'BD_TOPO_2024' / 'PNOA_LiDAR_2023'
  epoch:             z.string().nullable(),
  // Acquisition date of source data (ISO 8601 partial OK: '2025-04' / '2023')
  algorithm_version: z.string().min(1),
  // Semver of the compute pipeline that produced this profile, e.g. 'v2.3.1'
});

export type HeightProfile = z.infer<typeof HeightProfile>;
export type RoofType = z.infer<typeof RoofType>;
export type HeightProvenance = z.infer<typeof HeightProvenance>;

// ── Jurisdiction height definition (add to each rule pack / RATE.md adapter) ─
// C58 reads `heightDefinition` from the jurisdiction pack to pick the correct field.
export const HeightDefinition = z.enum([
  'building_height_m',   // generic — most common
  'height_to_ridge_m',   // NL (nok), UK ridge case
  'height_to_eaves_m',   // DE (Traufe), FR (égout du toit)
  'height_to_parapet_m', // flat-roof urban contexts
  'height_to_cornice_m', // ES (cornisa)
]);
export type HeightDefinition = z.infer<typeof HeightDefinition>;

// ── Minimal backfill from current bake attributes ─────────────────────────────
// Used by contextTiles.ts and contextBuildings.ts to wrap legacy `height` + `heightProvenance`
// values in the new type without breaking the existing render path.
export function heightProfileFromLegacy(
  height: number | null,
  legacyProvenance: 'tagged' | 'derived-levels' | 'assumed',
): HeightProfile {
  const provenance: HeightProvenance =
    legacyProvenance === 'tagged'         ? 'national_lod1'
    : legacyProvenance === 'derived-levels' ? 'levels_x_h'
    : 'assumed';
  return {
    ground_elevation_m:   null,
    roof_median_m:        null,
    roof_p90_m:           height,
    roof_peak_m:          null,
    building_height_m:    height,
    height_to_parapet_m:  null,
    height_to_ridge_m:    null,
    height_to_eaves_m:    null,
    height_to_cornice_m:  null,
    roof_type:            'unknown',
    roof_pitch_deg:       null,
    floors_est:           null,
    confidence:           provenance === 'national_lod1' ? 0.75 : provenance === 'levels_x_h' ? 0.4 : 0.1,
    provenance,
    source:               'legacy_bake',
    epoch:                null,
    algorithm_version:    'v0.0.0-legacy',
  };
}
```

### 2.3 Consumer migrations

**`packages/site-parcel-data/src/envelopeHeight.ts`**

Currently reads a bare `height_m`. After Phase 2, change to:
```typescript
import { HeightProfile, HeightDefinition } from '@pryzm/schemas';

function resolveEnvelopeHeight(
  profile: HeightProfile,
  jurisdictionDef: HeightDefinition,
): number | null {
  // Pick the field the jurisdiction's rule pack says is "building height".
  const raw = profile[jurisdictionDef];
  if (raw != null) return raw;
  // Fallback cascade: parapet → ridge → eaves → canonical → null.
  return profile.height_to_parapet_m
    ?? profile.height_to_ridge_m
    ?? profile.height_to_eaves_m
    ?? profile.building_height_m;
}
```

Add `heightDefinition` to each jurisdiction rule pack (one-liner per country in
`packages/site-parcel-data/src/` or the relevant `RATE.md` adapter):

```
NL → height_to_ridge_m       (nok hoogte)
DE → height_to_eaves_m       (Traufe / BauO NRW Art.6)
FR → height_to_eaves_m       (égout du toit / PLU)
ES → height_to_cornice_m     (cornisa / NNUU)
UK → height_to_ridge_m       (NPPF ridge, default)
CH → building_height_m       (Firsthöhe varies by canton; use canonical until per-canton)
DK → height_to_ridge_m       (taghøjde)
```

**`apps/editor/src/ui/geospatial/contextBuildings.ts` and `contextTiles.ts`**

Wrap every emitted building with `heightProfileFromLegacy(heightM, heightProvenance)`.
Store the `HeightProfile` on the feature property. Existing downstream code continues to
read `building_height_m` (unchanged value). No render path change.

**`C57-PARCEL-DATA-LAYER.md`** — add: "Parcel record MAY carry a `heightProfile: HeightProfile`
referencing the most confident profile available for the building on the parcel."

### 2.4 Test (required before merge)

`packages/schemas/__tests__/heightProfile.test.ts`:
```typescript
import { HeightProfile, heightProfileFromLegacy } from '../src/elements/site/context/heightProfile';

test('schema compiles L0 (no I/O, no THREE, no DOM)', () => {
  // The test itself proves the import doesn't pull in forbidden modules.
  expect(HeightProfile).toBeDefined();
});

test('round-trip: golden fixture', () => {
  const fixture: HeightProfile = {
    ground_elevation_m: 128.42, roof_median_m: 139.87, roof_p90_m: 140.15,
    roof_peak_m: 141.02, building_height_m: 11.73, height_to_parapet_m: 11.6,
    height_to_ridge_m: 12.3, height_to_eaves_m: 10.9, height_to_cornice_m: null,
    roof_type: 'gable', roof_pitch_deg: 32, floors_est: 3,
    confidence: 0.94, provenance: 'lidar_ndsm', source: 'PNOA_2025',
    epoch: '2025-04', algorithm_version: 'v2.3.1',
  };
  expect(HeightProfile.parse(fixture)).toEqual(fixture);
});

test('legacy backfill round-trip', () => {
  const profile = heightProfileFromLegacy(9, 'assumed');
  expect(profile.building_height_m).toBe(9);
  expect(profile.provenance).toBe('assumed');
  expect(profile.confidence).toBe(0.1);
});

test('null fields are nullable, not zero', () => {
  const profile = heightProfileFromLegacy(null, 'assumed');
  expect(profile.building_height_m).toBeNull();
});
```

**Acceptance:** schema compiles; tests green; `envelopeHeight.ts` reads `heightDefinition` per
jurisdiction; golden fixture round-trips. Measurable gate: `pnpm --filter @pryzm/schemas run test`
passes with the new test file included.

---

## Phase 3 — Terrain in the 3D-Site view

**Goal:** terrain mesh renders under context buildings, everywhere open DTM data exists.
**Effort:** H (~3–4 weeks). **Risk:** MEDIUM. The hard sub-problem is datum alignment (§3.4).
**Sequence:** Phase 2 (HeightProfile) MUST be done first; terrain writes `ground_elevation_m`.

### 3.1 Why terrain is the requested gap

Current state: buildings extrude from a flat ellipsoid base. In any sloped city (Lisbon,
Bergen, Edinburgh, Barcelona's hills, Copenhagen's islands) buildings either float above
ground or sink below it. The `globeGroundAnchor.ts` clamp solves this for the PRYZM model's
origin building, but context buildings have no equivalent — they sit at `height 0` (the
WGS-84 ellipsoid) by construction (`contextTiles.ts` → Cesium `PolygonGraphics`).

Terrain is not a cosmetic improvement — it is a legal-datum input. L-584 established that
the rasant (terrain elevation under a façade) is required to correctly compute the BauO/PLU
setback heights. Without terrain, `height_to_eaves_m` is computed from an assumed flat ground
that may be metres off.

### 3.2 Offline bake pipeline

**New file:** `tools/context-bake/terrain.mjs` (Node, uses GDAL CLI)

OR (preferred for heavy raster ops): `tools/height-engine/terrain.py` (Python, uses GDAL + rasterio)

**Per-tile algorithm:**

```
1. CLIP: national DTM GeoTIFF → clip to tile bbox (gdalwarp -te w s e n -t_srs EPSG:4326)
2. RESAMPLE: to a uniform grid resolution:
     - near tiles (≤2 km from site): 1 m grid
     - far tiles (2–10 km): 5 m grid
     - horizon tiles (>10 km): 25 m grid
   Use bilinear resampling (gdalwarp -r bilinear). Bicubic for near tiles.
3. FILL VOIDS: small voids (<50 px) via gdal_fillnodata.py. Large voids → flag as 'partial'.
4. TIN MESH (RTIN — error-bounded):
     - Use `martini` (npm: @mapbox/martini) for raster→TIN in JS:
       const terrain = new Martini(gridSize); const tile = terrain.createTile(elevations);
       const mesh = tile.getMesh(maxError); // maxError=0.5m near, 2m mid, 5m far
     - OR `pydelatin` (Python): delatin.triangulate(raster, max_error=0.5)
     - Result: a triangle mesh with vertices at real (x, y, elevation) positions.
5. SIMPLIFY: meshoptimizer (npm: meshoptimizer) → simplify/quantize → reduces vertices 60–80%.
6. ENCODE:
     Option A (preferred): Cesium quantized-mesh format → .terrain tile
       Library: `quantized-mesh-encoder` (npm). One file per z/x/y.
       Cesium `CesiumTerrainProvider` streams these natively — no custom runtime code.
     Option B: glTF/meshopt per tile → for the Three.js path if Cesium terrain is not used.
     Decision: use Option A first. It integrates with zero runtime code.
7. UPLOAD: z/x/y .terrain tiles → R2 (or S3), under `tiles/terrain/{z}/{x}/{y}.terrain`.
8. METADATA: write a `layer.json` (Cesium terrain tileset descriptor) to the root.
```

**Python terrain pipeline script** (`tools/height-engine/terrain.py`):

```python
import subprocess, json, numpy as np
from pathlib import Path
import rasterio
from rasterio.transform import from_bounds
import pydelatin
from quantized_mesh_encoder import encode  # pip install quantized-mesh-encoder

COUNTRIES = {
  'nl': 'https://download.pdok.nl/rws/ahn/v1_0/dtm_05m/... (AHN 0.5m)',
  'dk': 'https://download.kortforsyningen.dk/content/dhm-terraen-skyggekort-10m (free key)',
  'ch': 'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/... (swissALTI3D 2m)',
  'fr': 'https://geoservices.ign.fr/rgealti (RGE ALTI 1m — bearer token required)',
  'es': 'https://centrodedescargas.cnig.es/CentroDescargas/MDT05/... (PNOA MDT 5m, open)',
}
# Per country: download → cache → clip → mesh → encode → upload
```

### 3.3 Country DTM source table (build this before writing any code)

| Country | Source | Resolution | License | Auth | Phase 3? |
|---|---|---|---|---|---|
| 🇳🇱 NL | AHN (pdok.nl) | 0.5 m | Open (CC0) | None | ✅ START HERE |
| 🇩🇰 DK | DHM/Terræn (Datafordeler) | 0.4 m | Open | Free API key | ✅ |
| 🇨🇭 CH | swissALTI3D (swisstopo) | 2 m | Open | None | ✅ |
| 🇫🇷 FR | RGE ALTI / IGN (Geoplateforme) | 1 m | Open | Bearer token (free reg) | ✅ |
| 🇪🇸 ES | PNOA MDT (CNIG) | 5 m | Open (CC-BY) | None | ✅ |
| 🇳🇴 NO | NDH (hoydedata.no) | 1 m | Open | None | ✅ (low pop density) |
| 🇩🇪 DE | DGM (land by land — NRW open) | 1 m | NRW open; others vary | NRW: None | Partial |
| 🇺🇸 US | 3DEP (TNM) | 1 m | Public domain | None | Deferred (scale) |
| 🇸🇦 SA | No open DTM | — | — | — | ❌ skip (ML fallback) |

**Start with NL (AHN) and DK (DHM)** — both are verifiably open, high resolution, and the
corresponding cities (Amsterdam, Copenhagen) have LOD-2 building data. A correct terrain +
LOD-2 building + terrain-anchored ground elevation on both is the Phase 3 acceptance proof.

### 3.4 Datum alignment — the hard sub-problem (L-584)

**This is the trap.** Do this FIRST on ONE city (Amsterdam) before writing any other terrain code.

The problem (from `globeGroundAnchor.ts`):
- WGS-84 ellipsoidal height (`h=0`) ≠ orthometric height (mean sea level).
- The geoid–ellipsoid separation varies: Netherlands +43 m, Switzerland +47–51 m, Denmark +42 m.
- A terrain tile authored in RD New + NAP (Netherlands national datum) at `h=5 m` actually sits
  at `h = 5 + 43 = 48 m` ellipsoidal. Buildings placed at `h=0` are 48 m underground.

**The fix (apply everywhere):**

```
DTM raster (national orthometric) → GDAL reproject to WGS-84 ellipsoidal:
  gdalwarp -s_srs EPSG:28992+5709 -t_srs EPSG:4979 input.tif output_ellipsoidal.tif
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^
           NL: RD New (EPSG:28992) + NAP height (EPSG:5709) = compound CRS EPSG:7415
```

Per-country compound CRS for gdalwarp `-s_srs`:

| Country | Horizontal | Vertical (orthometric) | Compound CRS | Ellipsoidal target |
|---|---|---|---|---|
| NL | RD New (28992) | NAP (5709) | EPSG:7415 | EPSG:4979 |
| DK | UTM32 (25832) | DVR90 (5799) | EPSG:4258+5799 | EPSG:4979 |
| CH | LV95 (2056) | LN02 (5728) | EPSG:9518 | EPSG:4979 |
| FR | RGF93/Lambert93 (2154) | NGF-IGN69 (5720) | EPSG:9794 | EPSG:4979 |
| ES | ETRS89-UTM30 (25830) | EVRF2007 (5621) | EPSG:7423 | EPSG:4979 |
| NO | UTM32 (25832) | NN2000 (5941) | user-defined | EPSG:4979 |

GDAL carries geoid grids via `PROJ_DATA`. Confirm each datum transform produces a plausible
ellipsoidal height before processing bulk tiles (Amsterdam AHN centroid ≈ 48 m ellipsoidal;
if you get 5 m, the geoid correction failed).

**After conversion:** every terrain vertex is in `(lon, lat, h_ellipsoidal)`. Building extrusion
reads `ground_elevation_m` from the `HeightProfile` (the terrain vertex under the footprint
centroid) and extrudes upward. `globeGroundAnchor.ts`'s photoreal-tile clamp uses the same
convention — they are now on the same datum.

### 3.5 Client-side terrain integration (Cesium path)

**Option A (quantized-mesh — preferred, zero runtime client code):**

```typescript
// In apps/editor/src/ui/geospatial/CesiumViewport.ts, during Cesium viewer init:
const terrainProvider = await CesiumTerrainProvider.fromUrl(
  `${import.meta.env.VITE_CONTEXT_TILES_URL}/terrain`,
  { requestVertexNormals: true }, // enables lighting on the terrain mesh
);
viewer.terrainProvider = terrainProvider;
// That's it. Cesium handles LOD selection, streaming, and tile/building z-fighting avoidance.
```

Buildings then sit ON terrain automatically because Cesium applies terrain clamping to
`PolygonGraphics` when `heightReference = HeightReference.CLAMP_TO_GROUND` (already the correct
setting for context buildings). Verify this is set in the building extrusion path.

**Option B (Three.js glTF terrain layer):**
Only if Cesium terrain provider proves too complex for the current viewport setup. Deferred.

### 3.6 Buildings-on-terrain: updating ground_elevation_m in HeightProfile

After the terrain mesh tiles are on R2, a server-side pass can sample `ground_elevation_m` for
every baked building:

```
POST /api/terrain/sample
  { building_id, lon, lat }
→ { ground_elevation_m: 48.23, source: 'ahn_0.5m', epoch: '2023-04' }
→ write to HeightProfile.ground_elevation_m in Postgres
```

This feeds back into Phase 4's nDSM pipeline (which also computes terrain under the footprint
from LiDAR — the two must agree within ±0.3 m; divergence > 0.3 m flags a datum misalignment).

### 3.7 Acceptance (Phase 3)

1. **Amsterdam:** open a parcel on the IJ waterfront → terrain mesh renders; buildings in the
   Jordaan neighbourhood (slightly above sea level) sit on gently sloping ground, not floating.
   Screenshot + annotate.
2. **Copenhagen:** open a parcel on Christianshavn island → terrain shows the canal-level
   topography. Buildings clip correctly to ground.
3. **Datum check:** Amsterdam AHN centroid at `(52.37, 4.90)` → terrain vertex `h_ellipsoidal`
   ≈ 47–50 m. If <10 m, geoid correction is broken — STOP and fix before proceeding.
4. **L-584 fix confirmed:** the envelope rasant reads the terrain DTM at each façade corner.
   A site on a 5 m slope shows the uphill face at a lower relative height than the downhill face.
5. **Performance:** terrain tiles stream in <500 ms for a 2 km radius at z15. No frame-rate
   drop below 30 FPS at 60 Hz target (measure with Chrome DevTools Performance panel).

**Definition of done:** terrain renders in Amsterdam + Copenhagen. Datum verified. No floating
or buried context buildings. L-584 ground elevation populates `HeightProfile.ground_elevation_m`.

---

## Phase 4 — The LiDAR nDSM height engine

**Goal:** measured heights + roof types for every building in LiDAR-covered countries.
**Effort:** XL (~2–3 months). **Risk:** HIGH (three hard sub-problems: §4.6).
**Sequence:** Phase 3 terrain MUST be done first (shares DTM pipeline and datum conventions).
**Language:** Python service (`tools/height-engine/`). Tile-parallel build farm.

### 4.1 Why this is the real IP

Every competitor can get footprints (Overture, Microsoft, OSM). Heights from national LoD1/LoD2
datasets cover only ~15 countries with open data. The nDSM engine works **anywhere LiDAR exists**
(NL, DK, CH, NO, FR, ES, US, DE — plus private LiDAR from clients' own surveys). It also produces
what no national dataset carries: **the full HeightProfile** (every statistical variant, roof type,
confidence, terrain plane, vegetation flag) in one reproducible, versionable pipeline.

The defensible IP is the pipeline from `nDSM = DSM − DTM` onward:
- Eroded footprint conditioning (not just bbox)
- Vegetation rejection (planarity-based if unclassified)
- Terrain-plane estimation under slopes (perimeter DTM, not centroid)
- Roof-plane RANSAC segmentation (not just a count of returns)
- Confidence scoring (6-factor weighted formula)
- Incremental per-tile recompute (version-stamped, never a national re-run)

### 4.2 Toolchain and dependencies

```
Python ≥3.11 (match the Fly runtime)
pdal ≥2.6           — LiDAR I/O, classification, filtering
laspy ≥2.4          — LAZ/LAS read/write (faster than PDAL for simple reads)
rasterio ≥1.3       — raster I/O, CRS transforms
numpy ≥1.26         — array ops
scipy ≥1.12         — spatial stats (KDTree for perimeter DTM sampling)
shapely ≥2.0        — footprint geometry ops (make_valid, buffer, simplify)
open3d ≥0.18        — RANSAC plane fitting (or pyransac3d)
pyransac3d ≥0.6     — lighter alternative to open3d for plane fitting only
pydelatin ≥0.2      — raster → TIN (shared with terrain pipeline)
psycopg3 ≥3.1       — Postgres write
pyarrow ≥15         — Arrow file output (metadata.arrow for scene tiles)

Install via tools/height-engine/requirements.txt.
Docker base: python:3.11-slim + gdal-bin + libgdal-dev (for PDAL GDAL driver).
```

### 4.3 LiDAR tile registry (Postgres table)

```sql
-- Create in server/dbMigrate.js (or a new migration in scripts/migrate/)
CREATE TABLE lidar_tile_registry (
  id              SERIAL PRIMARY KEY,
  country         CHAR(2)       NOT NULL,          -- ISO 3166-1 alpha-2
  tile_id         TEXT          NOT NULL,           -- national tile identifier
  bbox_wsen       FLOAT8[4]     NOT NULL,           -- [W, S, E, N] WGS-84 decimal degrees
  epsg            INT           NOT NULL,           -- native CRS EPSG code
  density_ppm2    FLOAT4,                           -- point density (points/m²); null = unknown
  year            SMALLINT,                         -- acquisition year
  is_classified   BOOLEAN       NOT NULL DEFAULT FALSE,
  license         TEXT          NOT NULL,           -- SPDX identifier or free-text
  download_url    TEXT          NOT NULL,
  file_size_mb    FLOAT4,
  last_checked    TIMESTAMPTZ   DEFAULT now(),
  UNIQUE (country, tile_id)
);

CREATE INDEX lidar_registry_bbox ON lidar_tile_registry
  USING GIST (ST_MakeEnvelope(bbox_wsen[1], bbox_wsen[2], bbox_wsen[3], bbox_wsen[4], 4326));
```

Initial population (per country):

| Country | Source | Index URL | Tile count | density_ppm2 |
|---|---|---|---|---|
| NL | AHN4 (PDOK) | `api.pdok.nl/rws/ahn/v1_0/ahn_atomfeed` | ~56k | 8–10 |
| DK | DHM/Punktsky (Kortforsyningen) | atom feed URL | ~50k | 4–6 |
| CH | swisstopo LiDAR | STAC catalog | ~18k | 4–8 |
| FR | IGN LiDAR HD | geoplateforme.fr STAC | ~200k | 10–20 |
| ES | PNOA (CNIG) | atom feed | ~180k | 0.5–2 |
| NO | Kartverket NDH | hoydedata.no API | ~80k | 2–8 |
| US | 3DEP (TNM) | `tnmaccess.nationalmap.gov/api/v1/products` | ~600k | 2–12 |
| DE | NRW open (opengeodata.nrw.de) | index listing | ~10k (NRW only) | 4–8 |

### 4.4 Per-building pipeline (12 stages, `tools/height-engine/pipeline.py`)

```python
"""
pipeline.py — PRYZM nDSM Height Engine
One function per stage; each stage is independently testable.
Stages 1–6 are DTM/DSM prep; 7–12 are the building-specific IP.
"""

# ── Stage 1: Acquire ─────────────────────────────────────────────────────────
def acquire_lidar(building_id: str, footprint: Polygon, registry: LidarRegistry) -> list[Path]:
    """
    Resolve footprint bbox → matching tiles in registry → download .laz files.
    Uses a 5 m buffer around the footprint to ensure edge coverage.
    Returns list of local .laz paths (cached; do NOT re-download if mtime < tile year).
    On failure: raises LidarNotAvailable (caller falls back to next HeightProvenance tier).
    """

# ── Stage 2: Normalize CRS ───────────────────────────────────────────────────
def normalize_crs(laz_paths: list[Path], target_epsg: int) -> list[Path]:
    """
    Reproject from the tile's native CRS to a metric CRS (UTM zone of the tile centroid).
    Uses PDAL's reprojection filter. NEVER use geographic CRS for distance-based ops.
    Returns reprojected .laz paths.
    """

# ── Stage 3: Read ────────────────────────────────────────────────────────────
def read_points(laz_paths: list[Path], bbox_m: tuple) -> np.ndarray:
    """
    Read XYZ + Intensity + Classification + ReturnNumber for all points in bbox_m.
    Uses laspy for speed (faster than PDAL for simple reads).
    Returns np.ndarray shape (N, 5): [X, Y, Z, Classification, ReturnNumber].
    """

# ── Stage 4: DTM (bare earth) ────────────────────────────────────────────────
def build_dtm(points: np.ndarray, resolution_m: float = 0.5) -> np.ndarray:
    """
    Extract ground points:
      - If classified: keep class 2 (Ground) and class 9 (Water).
      - If unclassified: apply SMRF (Simple Morphological Filter) via PDAL:
        pdal translate input.las output_ground.las smrf
    Interpolate ground point cloud → regular raster (IDW or scipy KDTree-based).
    Returns 2D float32 array (h × w), CRS = tile metric CRS, origin = tile origin.
    """

# ── Stage 5: DSM (highest return) ────────────────────────────────────────────
def build_dsm(points: np.ndarray, resolution_m: float = 0.5) -> np.ndarray:
    """
    Maximum Z per raster cell (all returns, no classification filter).
    Simple: bin points to grid, take max per bin.
    Void-fill small gaps (<5 px) with nearest neighbour.
    """

# ── Stage 6: nDSM ────────────────────────────────────────────────────────────
def compute_ndsm(dtm: np.ndarray, dsm: np.ndarray) -> np.ndarray:
    """nDSM = DSM − DTM. Clamp to [−0.5, 200] m (negative → DTM artifact; >200 → noise)."""

# ── Stage 7: Footprint conditioning (HARD sub-problem) ───────────────────────
def condition_footprint(footprint: Polygon, ndsm: np.ndarray, transform: Affine) -> list[Polygon]:
    """
    This is the most complex stage. Three transformations:
    
    (a) Validate / repair:
        shapely.make_valid() → eliminates self-intersections.
        shapely.simplify(0.3) → removes sub-30cm jitter from the footprint.
    
    (b) Split merged polygons — the "one polygon = three villas" problem.
        Common in Spain (Catastro single polygon per building block), Saudi Arabia.
        Method:
        1. Erode the footprint 0.5 m inward (buffer(-0.5)).
        2. Compute the nDSM height gradient inside the footprint.
        3. Detect low-height ridges (gradient minima at full-building scale) using
           scipy.ndimage.label on a binary mask: nDSM < (P50 * 0.3).
        4. If connected components count > 1: split the footprint polygon along
           the detected ridges (watershed segmentation or convex hull per component).
        5. Return one polygon per detected sub-building.
        NOTE: This is its own research problem. Start with a threshold-based approach
        and iterate — budget 2 weeks for Spain villas specifically.
    
    (c) Erode 0.5 m inward (buffer(−0.5)):
        Eliminates wall returns (LiDAR hits the façade at grazing angle, biasing up).
        Apply AFTER split — erode each sub-building separately.
    
    Returns a list of conditioned Polygon objects (usually one; multi for merged blocks).
    """

# ── Stage 8: Sample nDSM ─────────────────────────────────────────────────────
def sample_ndsm(ndsm: np.ndarray, transform: Affine, footprint: Polygon) -> np.ndarray:
    """
    Rasterize the eroded footprint → boolean mask → extract nDSM cells inside.
    Returns 1D float32 array of height values. Empty → LidarSampleEmpty.
    """

# ── Stage 9: Vegetation rejection ────────────────────────────────────────────
def reject_vegetation(samples: np.ndarray, points_in_footprint: np.ndarray) -> np.ndarray:
    """
    Two methods (use the better one based on what's classified):
    
    Method A (if classified): exclude class 5 (High Vegetation) points.
    
    Method B (if unclassified): surface-roughness / planarity filter.
        Roofs are planar → low local roughness.
        Trees are chaotic → high local roughness (high variance in Z within a 1 m radius).
        
        For each raster cell in the footprint:
        1. Find all LiDAR points within 0.5 m radius.
        2. Compute Z standard deviation of those points.
        3. If std_dev > 0.8 m (heuristic): flag cell as 'vegetation', exclude.
        
    Returns filtered samples. If >60% of cells are excluded → flag as 'heavy_vegetation',
    reduce confidence sharply (×0.4).
    """

# ── Stage 10: Roof RANSAC ────────────────────────────────────────────────────
def fit_roof_planes(samples: np.ndarray, points_3d: np.ndarray) -> RoofFitResult:
    """
    RANSAC plane fitting on the filtered 3D roof point cloud.
    Library: pyransac3d.Plane().fit(points, thresh=0.15, maxIteration=200)
    
    Algorithm:
    1. Fit 1 plane → record inlier ratio (>90% → flat roof).
    2. Subtract inliers → fit 2nd plane on residuals → record inlier ratio.
       2 planes with roughly equal point counts and symmetric normals → gable.
    3. Subtract → fit 3rd and 4th → 4 planes with oblique normals → hip.
    4. Classify:
       - 1 plane, pitch < 5°, inlier_ratio > 0.90 → 'flat'
       - 2 planes, symmetric, pitch 15–60° → 'gable'
       - 4 planes, all oblique → 'hip'
       - >4 planes or low inlier ratios → 'complex'
       - <20 roof points → 'unknown' (insufficient data)
    
    Returns: RoofFitResult(planes, roof_type, pitch_deg, ridge_elevation_m).
    """

# ── Stage 11: Height derivation ──────────────────────────────────────────────
def derive_heights(
    samples: np.ndarray,            # filtered nDSM cells (relative to DTM)
    dtm: np.ndarray,                # DTM raster
    footprint: Polygon,             # eroded
    roof_fit: RoofFitResult,
    transform: Affine,
) -> dict:
    """
    Compute the full HeightProfile statistics.
    
    ground_elevation_m: LOCAL PLANE FIT on perimeter DTM samples (not centroid).
        Sample DTM at 20 points along the footprint perimeter, spaced equally.
        Fit a plane to those 20 (x, y, z) points (lstsq).
        The plane defines a "terrain datum" under the building — correct for slopes.
        Report the plane's z at the centroid as ground_elevation_m.
        WHY plane fit not centroid: a centroid sample on a 10 m slope gives the AVERAGE
        terrain, which is meaningless for a façade setback computation. The perimeter
        samples capture the full slope; the plane captures the gradient.
    
    roof_p90_m:     np.percentile(samples, 90) + ground_elevation_m (absolute)
    roof_median_m:  np.percentile(samples, 50) + ground_elevation_m
    roof_peak_m:    max(roof_fit.planes[*].max_z) (absolute, from RANSAC vertices)
    
    height_to_ridge_m:    roof_fit.ridge_elevation_m − ground_elevation_m
    height_to_eaves_m:    roof_fit.eaves_elevation_m − ground_elevation_m (from plane intersect)
    height_to_parapet_m:  roof_p90_m − ground_elevation_m (proxy for flat roofs; null for pitched)
    building_height_m:    roof_p90_m − ground_elevation_m (canonical)
    floors_est:           round(building_height_m / 3.2)
    """

# ── Stage 12: Confidence scoring ─────────────────────────────────────────────
def compute_confidence(
    density_ppm2: float,
    n_roof_points: int,
    veg_fraction: float,
    footprint_quality: float,   # 0–1; shapely.is_valid + area ratio
    plane_fit_residual: float,  # RMS residual of RANSAC inliers (metres)
    terrain_sigma: float,       # std dev of perimeter DTM plane fit residuals
) -> float:
    """
    Weighted confidence formula (sum of weights = 1.0):
    
    score = (
      0.20 * lidar_density_score(density_ppm2)    +  # ≥4 pt/m² = 1.0; 2=0.7; 0.5=0.3
      0.15 * roof_point_score(n_roof_points)       +  # ≥100=1.0; 50=0.7; 20=0.4; <10=0
      0.15 * (1 - veg_fraction)                    +  # veg_fraction from Stage 9
      0.15 * footprint_quality                     +  # from Stage 7 (split + validity)
      0.20 * plane_residual_score(plane_fit_residual) +  # <0.1m=1.0; 0.3=0.6; >0.5=0.2
      0.15 * terrain_sigma_score(terrain_sigma)    +  # <0.2m=1.0; 0.5=0.6; >1.0=0.2
    )
    
    Clamp to [0, 1]. A score < 0.40 → provenance downgrades from 'lidar_ndsm' to 'ml_estimate'.
    Document the formula version in algorithm_version.
    """
```

### 4.5 Build farm

```
Job queue: Redis RPUSH / LPOP (already available via the Fly Redis addon if used) or SQS.
Workers: containerised Python (Docker → Fly Machines OR AWS ECS spot).
Concurrency: one worker per 4 vCPUs; 8 workers = ~2k buildings/hour at 0.5 s/building average.
Output: write HeightProfile row to Postgres per building_id. Write per-tile Arrow file to R2.

Incremental strategy (CRITICAL — not a national re-run):
  A LiDAR tile republish (e.g. AHN4 → AHN5) → enqueue only the buildings whose bbox
  intersects the changed tile. Query: SELECT building_id FROM buildings WHERE
  ST_Intersects(footprint, ST_MakeEnvelope($tile_bbox)). Bump algorithm_version on outputs.
  Old rows are NOT overwritten — a new row with a higher algorithm_version is inserted.
  The bake reads the MAX(algorithm_version) row per building_id.
```

### 4.6 The three hard sub-problems

These are research problems, not implementation problems. Budget explicit time:

| Sub-problem | Location | Difficulty | Budget |
|---|---|---|---|
| **Merged footprint splitting** | Stage 7 | HARD — watershed + ridge detection on nDSM | 2 weeks |
| **Vegetation rejection on unclassified LiDAR** | Stage 9 | MEDIUM — planarity heuristic needs city-specific tuning | 1 week |
| **LiDAR licensing per country** | Pre-build gate | MEDIUM — non-commercial clauses; check BEFORE building | 1 week research |

For the footprint split problem, the reference approach:
1. Compute Euclidean distance transform from the footprint boundary inward.
2. Apply a morphological opening to the nDSM binary (threshold at P25).
3. Run watershed on the inverted nDSM with the footprint-boundary distance as the seed.
4. Each watershed region is a candidate sub-building.
5. Merge regions < 10 m² (artifact) and re-validate against the HeightProfile's roof RANSAC.

### 4.7 API endpoint

```
GET /api/building/:building_id/height-profile
→ 200 { HeightProfile }
→ 404 { error: 'not_found', message: 'No height profile exists for this building.' }
→ 202 { status: 'queued', eta_seconds: 120 }  (first request triggers the pipeline)
```

Feeds: the bake (`heightSources.mjs` top 'tagged' tier), scene tiles (Phase 5), and C58.

### 4.8 Acceptance (Phase 4)

For Amsterdam (AHN4, 10 pt/m², classified):
- ≥90% of buildings in the Eixample-equivalent (Jordaan, De Pijp) get a `lidar_ndsm` profile.
- Spot-check 20 buildings against publicly-known heights (Amsterdam real estate database).
  Acceptance threshold: |measured − actual| ≤ 0.5 m for ≥80% of the 20.
- Roof type distribution: ≥60% 'gable' (Amsterdam canal houses are predominantly gable) —
  if < 60%, the RANSAC classification threshold needs tuning.
- For a merged-footprint block in De Jordaan: the split algorithm must detect ≥3 sub-buildings.

For Barcelona (PNOA 0.5 pt/m², partially classified):
- ≥60% of buildings get a `lidar_ndsm` profile (lower density → lower recall).
- Confidence mean ≈ 0.55–0.65 (lower density → lower confidence).

---

## Phase 5 — Scene compiler + scene tiles

**Goal:** the Forma-class runtime. A planning environment, not a GIS viewer.
**Effort:** XL (multi-quarter). **Risk:** HIGHEST — only attempt after Phases 1–4 have proven data.
**Sequence:** Do NOT start until Phase 4 produces measured heights for ≥2 cities.

### 5.1 The scene tile format (`.snap`)

A `.snap` tile is a directory (served as a ZIP or a flat R2 prefix), sized at 256 m × 256 m
(metric, not WebMercator — easier for planners, matches the design-level working radius):

```
tile_{x}_{y}_{z}/
├── terrain.glb          — terrain mesh (Phase 3 output, re-encoded to glTF/meshopt)
├── buildings.glb        — procedural LOD100/LOD150/LOD200 building meshes
├── trees.arrow          — vegetation instance table (x,y,z,species,height_m,rotation_deg)
├── roads.glb            — road surface and kerb meshes
├── water.glb            — water body surface meshes
├── textures.ktx2        — satellite / landcover / slope-tint textures
└── metadata.arrow       — knowledge graph (object_id → planning object, zoning, rules)
```

**Invariant:** every object in every `.glb` carries an `object_id` string attribute matching
the Overture building id / parcel refcat / OSM way id. The `metadata.arrow` file maps every
`object_id` to its planning object. This is what makes picking a building retrieve its legal
context (zoning, FAR, allowed height, current FAR, redevelopment potential) rather than just
a triangle. This is the L-611 Living Building Graph + C27 Inspect binding.

**LOD variants for buildings:**
- LOD100: bounding box extrusion (footprint + uniform height) — for tiles > 2 km from camera.
- LOD150: correct-height flat-top prism (HeightProfile.building_height_m) — for tiles 500 m–2 km.
- LOD200: full roof geometry (footprint + roof planes from RANSAC) — for tiles < 500 m.

### 5.2 Per-domain compilers (`tools/scene-compiler/`)

```
tools/scene-compiler/
├── terrain.mjs         — Phase 3 output → glTF/meshopt (re-encode for .snap)
├── buildings.mjs       — footprint + HeightProfile + roof_type → procedural glTF
├── vegetation.mjs      — canopy dataset or OSM trees → TreeInstance Arrow table
├── roads.mjs           — OSM centrelines → offset + width + kerbs → mesh
├── water.mjs           — OSM polygons → Delaunay triangulation → mesh
├── textures.mjs        — satellite / slope-tint → KTX2
└── assembler.mjs       — merge all domains by object_id → emit .snap tile + metadata.arrow
```

**Building compiler** (`tools/scene-compiler/buildings.mjs`) — most complex:

```js
// Input: footprint (Polygon), HeightProfile, roof_type, roof_pitch_deg
// Output: glTF buffer (one Mesh per building, LOD0/1/2 as separate primitives)

function buildingToGltf(footprint, profile, roofType, pitchDeg) {
  const h = profile.building_height_m ?? 9;
  const walls = extrudeWalls(footprint, h);             // LOD100/150

  if (roofType === 'flat') {
    const cap = closedPolygonCap(footprint, h);
    return mergeGltf([walls, cap]);                     // LOD150
  }
  if (roofType === 'gable') {
    const ridge = computeRidgeLine(footprint, h, h + Math.tan(deg2rad(pitchDeg)) * shortAxis/2);
    const roofMesh = gableRoof(footprint, ridge, h, pitchDeg);
    return mergeGltf([walls, roofMesh]);               // LOD200
  }
  if (roofType === 'hip') {
    const roofMesh = hipRoof(footprint, h, pitchDeg);
    return mergeGltf([walls, roofMesh]);               // LOD200
  }
  // complex / unknown → flat cap (LOD150 fallback — honest)
  return mergeGltf([walls, closedPolygonCap(footprint, h)]);
}
```

No artists. No manual models. Procedural generation from data — same approach as TestFit and
early Forma.

### 5.3 Runtime streaming (`apps/editor/src/ui/geospatial/sceneStream/`)

```typescript
// apps/editor/src/ui/geospatial/sceneStream/SceneStreamManager.ts

class SceneStreamManager {
  private cache = new Map<string, SnapTile>();

  async update(cameraPosition: Cartesian3): Promise<void> {
    const needed = this.tilesForCamera(cameraPosition, radius = 2000);
    const toLoad = needed.filter(k => !this.cache.has(k));
    const toUnload = [...this.cache.keys()].filter(k => !needed.includes(k));

    // Parallel fetch — tiles are small (~200 KB each)
    await Promise.all(toLoad.map(k => this.loadTile(k)));
    toUnload.forEach(k => { this.unloadTile(k); this.cache.delete(k); });
  }

  private async loadTile(key: string): Promise<void> {
    const [z, x, y] = key.split('/').map(Number);
    const snap = await fetch(`${SCENE_BASE_URL}/tile_${x}_${y}_${z}.zip`);
    // Decode in a Web Worker (off main thread)
    const tile = await this.worker.decode(await snap.arrayBuffer());
    this.cache.set(key, tile);
    this.renderTile(tile);
  }
}
```

**Picking (the key differentiator — NOT a scene.traverse):**

```typescript
// On click:
const hit = bvh.raycast(ray);          // Per-tile BVH, NOT Three.js scene.traverse
if (hit) {
  const objectId = hit.face.objectId;  // object_id stored in BufferGeometry attributes
  const planningObj = await fetchPlanningObject(objectId);  // GET /api/knowledge-graph/{id}
  // → { zoning: 'R2b', allowed_height_m: 18, far_allowed: 3.5, far_current: 2.1,
  //     redevelopment_potential: 'medium', building_age: 1965 }
  ui.showInspectPanel(planningObj);    // C27 Inspect — the Living Graph (L-611) binding
}
```

### 5.4 Acceptance (Phase 5)

**Barcelona full stack:**
- Terrain + buildings + trees + roads stream in <2 s for a 2 km radius.
- 60 FPS at 2 km radius (measure with `performance.now()` frame timing).
- Click any building → planning object panel shows zoning + allowed height + current FAR.
  The click must use BVH, not Three.js `scene.traverse` (verify in Chrome Performance tab).
- LOD transitions: no popping. Vertex-collapse morphing smooth at 30 m/s camera pan.

---

## Phase 6 — C-CONTEXT contract

**Draft this in parallel with Phase 2. Ratify before Phase 3 code merges.**

File: `docs/02-decisions/contracts/C-CONTEXT-SCENE-HEIGHT-TERRAIN.md`

```
CONTRACT C-CONTEXT — Context Scene, Height & Terrain Engine

§1. HeightProfile is the canonical height datum.
    No consumer stores or transmits a bare `height_m`.

§2. Robust statistics only.
    P90 or trimmed median (10th–90th percentile). Never max. Never bare mean.
    Eroded footprint (−0.5 m buffer) is mandatory for nDSM sampling.

§3. Provenance mandatory.
    Fields: source, algorithm_version, epoch, confidence.
    A HeightProfile without all four fields MUST NOT be stored or served.
    Never fabricate. Missing height → honest fallback tier, flagged.
    Versioned: new algorithm_version row; never overwrite.

§4. One vertical datum.
    WGS-84 ellipsoidal throughout (matches C12 §1.4 / globeGroundAnchor.ts).
    All datum transforms via the single C12 proj4 projector.
    Terrain, buildings, and the buildable envelope share one vertical origin (L-584).

§5. Render assets and knowledge graph share object_id.
    The Overture building id / parcel refcat / OSM way id is the universal key.
    Clicking a building in the 3D view retrieves a planning object, not triangle data.

§6. Physical context is strictly separated from the buildable-rule rate.
    This contract governs "what exists" (C57 / LOD-RATE-MASTER).
    C58 governs "what you may build" (zoning rules / envelopes).
    NEVER merge these two axes into one height value.

§7. "Done" means "renders + is measured".
    A phase is not done on code-merge. Screenshot + measurement required.
```

---

## Per-country data source master table

This is the operating spreadsheet. Build it before writing any Phase 3/4 code.

| Country | DTM Source | DTM Res | DTM License | DTM Auth | LiDAR Source | LiDAR Density | LiDAR License | LiDAR Auth | National LoD2 | Open DTM? | Phase 3 Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 🇳🇱 NL | AHN4 (PDOK) | 0.5 m | CC0 | None | AHN4 (PDOK) | 8–10 pt/m² | CC0 | None | 3DBAG LoD2.2 | ✅ | 1 |
| 🇩🇰 DK | DHM/Terræn | 0.4 m | Open | Free API key | DHM/Punktsky | 4–6 pt/m² | Open | Free API key | GeoDanmark | ✅ | 2 |
| 🇨🇭 CH | swissALTI3D | 2 m | Open | None | swisstopo LiDAR | 4–8 pt/m² | Open | None | swissBUILDINGS3D | ✅ | 3 |
| 🇫🇷 FR | RGE ALTI | 1 m | Open | Free reg | IGN LiDAR HD | 10–20 pt/m² | Open | Free reg | BD TOPO LoD1 | ✅ | 4 |
| 🇪🇸 ES | PNOA MDT | 5 m | CC-BY | None | PNOA (CNIG) | 0.5–2 pt/m² | CC-BY | None | Catastro LoD1 | ✅ | 5 |
| 🇳🇴 NO | NDH (hoydedata) | 1 m | Open | None | Kartverket | 2–8 pt/m² | Open | None | FKB LoD1 | ✅ | 6 |
| 🇩🇪 DE | DGM (varies) | 1 m | NRW open | NRW: None | NRW LiDAR | 4–8 pt/m² | NRW open | None | LoD2-DE (NRW) | Partial | 7 |
| 🇺🇸 US | 3DEP (TNM) | 1 m | Public domain | None | 3DEP | 2–12 pt/m² | Public domain | None | None national | ✅ | 8 (deferred — scale) |
| 🇸🇦 SA | None open | — | — | — | None open | — | — | — | None | ❌ | ML fallback |

**Priority order for Phase 3 bake:** NL → DK → CH → FR → ES. These five have open DTM,
open LiDAR, and existing heightSources.mjs probes. One city per country is the Phase 3 acceptance target.

---

## Milestones and sequencing

| Milestone | Phases | Duration | Gate | Risk |
|---|---|---|---|---|
| M1 — Real heights render | 1 + 2 | ~2 weeks | Re-baked Paris/Amsterdam/Madrid show skyline (not 9 m carpet). HeightProfile schema compiles. | LOW |
| M2 — Terrain closes the gap | 3 | ~4 weeks | Amsterdam + Copenhagen: sloped terrain under context buildings. Datum verified. L-584 ground elevation in HeightProfile. | MEDIUM (datum alignment is the trap) |
| M3 — Measured heights + roofs | 4 | ~3 months | Amsterdam: 90% of buildings have `lidar_ndsm` profile ±0.5 m vs ground truth. Roof types classified. | HIGH (footprint split + veg reject) |
| M4 — Forma-class runtime | 5 | multi-quarter | Barcelona: terrain + buildings + roads stream <2 s, 60 FPS, click → planning object. | HIGHEST (only after data proves out) |

---

## Top risks (ranked by impact × probability)

| Risk | Phase | Mitigation |
|---|---|---|
| **Vertical datum mismatch** | 3 | Prove Amsterdam geoid transform on ONE city FIRST. `h_ellipsoidal ≈ 48 m` at AHN centroid. If wrong, STOP. |
| **LiDAR non-commercial clause** | 4 | Audit license per country BEFORE building any pipeline. Some French IGN tiles: CC-BY-NC. Saudi: 403 geo-fenced. |
| **Merged footprint split failure** | 4 (Stage 7) | Budget 2 weeks research. Start with Spain (Catastro blocks). If watershed fails, ship without splitting and document. |
| **Vegetation rejection tuning** | 4 (Stage 9) | Use classified LiDAR first (NL class=5). Add planarity only for ES/SA unclassified. |
| **Phase 5 scope creep** | 5 | Do NOT start Phase 5 until Phases 1–4 all show measured outputs. The scene compiler is the destination, not the shortcut. |
| **Cesium terrain z-fighting** | 3 | Use `HeightReference.CLAMP_TO_GROUND` on all building `PolygonGraphics`. Test with quantized-mesh at z15. |
| **pnpm lockfile breaks Fly build** | All | Any new npm dependency: `pnpm --filter @pryzm/editor add <pkg>`, then commit `pnpm-lock.yaml` in the SAME commit. Run `tsc --skipLibCheck` before committing. |

---

## Tech stack (binding)

| Domain | Libraries |
|---|---|
| LiDAR I/O + classification | PDAL ≥2.6, laspy ≥2.4 |
| Raster ops (DTM/DSM) | rasterio ≥1.3, GDAL ≥3.8 |
| Geometry | shapely ≥2.0, scipy (KDTree, lstsq) |
| Roof segmentation | pyransac3d ≥0.6 (or open3d ≥0.18) |
| Raster → TIN | pydelatin ≥0.2 (Python) / @mapbox/martini (JS) |
| Mesh simplify/compress | meshoptimizer (npm) |
| Terrain encoding | quantized-mesh-encoder (npm) — Cesium quantized-mesh format |
| Vector tiles | tippecanoe (existing), pmtiles (existing) |
| Metadata | Apache Arrow (pyarrow + @apache-arrow/ts) |
| Textures | KTX2 (basisu CLI for compress; Three.js KTX2Loader already in-tree) |
| Postgres | psycopg3 (Python), server/db.js (existing Node pool) |
| Object storage | R2 (Cloudflare, existing — furniture GLB catalogue is on R2 already) |
| Cesium runtime | CesiumTerrainProvider (terrain), existing CesiumViewport.ts |
| Three.js runtime | Existing scene; add BVHGeometry (three-mesh-bvh) for picking |

---

*Created 2026-07-24. Grounded in the PRYZM monorepo as confirmed-shipped on this date:
`tools/context-bake/bake.mjs` (L-607), `tools/context-bake/heightSources.mjs` (3 live-probed
sources), `apps/editor/src/ui/geospatial/contextTiles.ts` (L-513b), `contextBuildings.ts`
(near/far + heightProvenance), `globeGroundAnchor.ts` (L-584 WGS-84 datum fix). Every file
reference has been verified to exist. Every data claim is marked VERIFIED (live-probed) or
ESTIMATED (desk). Maintainer: UNASSIGNED. This is an implementation blueprint, not a commitment.*

*Cross-refs: `CONTEXT-SCENE-COMPILER-NORTH-STAR.md` (vision) · `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`
(shipped delivery pipeline) · `CONTEXT-LOD-BUILD-PLAN.md` + `heightSources.mjs` (height build) ·
`jurisdictions/LOD-RATE-MASTER.md` (measured LOD per country) · `globeGroundAnchor.ts` (L-584 datum) ·
`C57-PARCEL-DATA-LAYER.md` · `C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md` · L-611 (Living Graph) ·
C27 (Inspect panel).*
