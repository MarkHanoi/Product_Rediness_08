# City Replication Standard — "Replicate Barcelona"

> **The canonical, code-grounded, end-to-end standard for bringing a city to full production
> quality in the PRYZM 3D-Site.** Barcelona is the reference implementation: it renders correctly
> across every layer. This document is the *to-be-followed* recipe so every new city — and every
> re-bake of a currently-broken one — is produced *identically* to the city that works.
>
> **Status:** CANONICAL reference (2026-07-28). Synthesises the five subsystem pipelines from their
> real implementations (file:line cited). Companion to — does NOT duplicate — the existing canonical
> docs it links: `JURISDICTION-PLAYBOOK.md` (rules/legal HOW), `ONBOARDING-PIPELINE-PORTABILITY.md`
> (what ports, code-verified), `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` (the WHAT/WHEN), and the
> per-layer specs under `reference/specs/CONTEXT-*.md`. Where this doc summarises a subsystem, the
> named per-layer doc/contract remains the authority.
>
> **Governance:** conflict order is VISION → ARCHITECTURE → C01–C58 contracts → ADRs → SPECs. When
> code disagrees with a contract, the code is wrong. Edit canonical docs in place; do not spawn
> derivative `*-AUDIT.md`.

---

## 0 — The mental model: eight layers, one ENU frame

A city in the 3D-Site is **eight independent data/geometry layers** assembled into **one
East-North-Up (ENU) scene frame** anchored at the site origin. Five are *data pipelines* (they
produce artifacts a new city needs), three are *runtime geometry* (they work automatically once the
data exists).

| # | Layer | Kind | New-city cost | Barcelona source |
|---|-------|------|---------------|------------------|
| L1 | **Parcels / cadastre** | data (per-jurisdiction adapter) | LOW — one proxy + registry row | ES Catastro (OVC + INSPIRE WFS), keyless |
| L2 | **Boundary → Site model** | runtime | **ZERO** — automatic at any lat/lon | `boundaryProjection.ts` (equirectangular about parcel vertex 0) |
| L3 | **Buildable envelope / rule pack** | data (**the whole cost**) | HIGH — human-gated legal sourcing | PGM Art. 242.2 *construction* (not a lookup) |
| L4 | **Context features** (buildings/roads/green/water) | data (bake) | LOW — one `REGIONS` bbox row | Geofabrik OSM → PMTiles |
| L5 | **Building heights** | data (bake join) | LOW-MED — map to a national nDSM | CNIG MDS Edificación (real nDSM) |
| L6 | **Terrain** (relief) | data (bake) | LOW-MED — one `REGIONS` bbox + a DTM source | ES PNOA MDT → quantized-mesh |
| L7 | **Render** (Cesium Forma) | runtime | **ZERO** — automatic | `CesiumViewport.ts` |
| L8 | **Camera / framing** | runtime | **ZERO** — automatic, terrain-aware | `frameSiteLocationOnTerrain` |

**The load-bearing truth (memory `barcelona-data-pipeline-map`):** six of seven *data* layers port
free to any city in a covered country (OSM + national rasters + national cadastre). **The rule pack
(L3) is the entire cost, and that cost is legal SOURCING — human-gated, does not parallelise with
engineers.** This is why "add a city" is fast for *context/terrain/parcels* but slow for a
*certified buildable envelope*.

Everything degrades **honestly**: a missing height → OSM 9 m `assumed` (never a fabricated number);
a missing rule pack → a *cited refusal* (never a fabricated envelope); a missing cadastre → an OSM
footprint labelled as a footprint (never mislabelled as a legal parcel). Failure ≠ empty ≠ fabricated
is the §CONTEXT-DATA-HONESTY spine (C58 §1.4; memory `context-data-honesty-family`).

---

## 1 — Layer L1/L2: Parcels, Boundary & Site model

**Authority:** `C19-SITE-MODEL-AND-PARCEL.md`, `C12-GEOSPATIAL.md`, `C57` (parcel data layer).

### 1.1 Barcelona parcel source
Barcelona parcels come from **Spain's Dirección General del Catastro via a keyless same-origin
server proxy** — never a browser→gov call.

- **Server proxy** — `server/parcelZoningProxy.js`: `GET /api/catastro/parcel?lon=&lat=`
  (`makeCatastroParcelHandler:327`). Two upstream hops: (1) point→refcat via OVC
  `Consulta_RCCOOR_Distancia` (keyless XML, `parseReverseGeocode:119`); (2) refcat→geometry via the
  INSPIRE Cadastral-Parcel WFS stored query `GetParcel` (GML 3.2.1, `parseParcelGml:159`, **EPSG:4326
  axis order lat,lon**). Cached by refcat, 7-day TTL, LRU ≤512. Miss/failure → HTTP 200
  `{parcel:null}` — never crashes (`:351`).
- **Client adapter** — `apps/editor/src/ui/site/parcel/CatastroParcelProvider.ts`: pure fetch+parse
  → a canonical `ParcelFeature { ring: LatLon[], refcat, areaM2, address, source }`, `null` on any
  failure, opens `pryzm.parcel.fetchParcelAtPoint` span.
- **Routing registry** — the map consumes `registryParcelProvider`
  (`apps/editor/src/ui/site/parcel/parcelRegistry.ts:67`), which calls `resolveParcelJurisdiction`
  and routes to the cadastral proxy where one is open, else an OSM footprint fallback. The
  jurisdiction table is `packages/site-parcel-data/src/parcelProviders/registry.ts:86` — Spain
  (`catastro`, `isInSpain`) is entry 1, the L-380 pilot; a `kind: 'cadastral'` vs
  `'footprint-fallback'` discriminator guarantees a footprint is **never** mislabelled as a legal
  parcel (C58 §1.4). `UNIVERSAL_FOOTPRINT_JURISDICTION` guarantees a click is never dead.

### 1.2 The two UI paths ("Select parcel" | "Draw boundary")
Both live in the MapLibre overlay `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts`
(`mountSiteBoundaryMap2D:281`). **Select** paints the fetched real parcel and commits via
`useSelectedParcel:1223`; **Draw** offers six modes (Rectangle default). Both converge on the *same*
`commit()`. A legacy Cesium-globe draw tool (`SiteBoundaryDrawTool.ts`) shares the identical
projection + dispatch.

### 1.3 Boundary → Site model (pure core `boundaryProjection.ts`)
- **Projection** `latLonToSceneXZ(pt, lat0, lon0)` (`:53`): local equirectangular about the site
  origin (`x = (lon−lon0)·deg·R·cos(lat0)`, `z = −(lat−lat0)·deg·R`). Inverse `sceneXZToLatLon:70`.
- **`parcelFrameOrigin(ring)` (`:142`) = the FIRST vertex.** The always-on project-origin datum
  (blue sphere) is pinned at world (0,0,0) by C13/ADR-0115, so the ring must be projected about a
  point *on* the boundary → its first vertex lands at scene (0,0). This is the §L-635 / commit
  `9acd599d` fix (memory `site-origin-on-parcel-regression`) for "origin drifts off the parcel."
- **Commit sequence (origin BEFORE ring build):** `origin = parcelFrameOrigin(vertices)` →
  `dispatchSiteLocation(origin)` (rebases the LTP-ENU origin) → `buildBoundaryFromLatLonRing(vertices,
  origin)` → `dispatchParcelBoundary`. Datum, ENU frame, and projected ring now share ONE origin, on
  the parcel (`siteDispatch.ts`, `SiteBoundaryDrawTool.commit:272`).
- **Dispatch** `siteDispatch.ts`: `dispatchSiteLocation:794` calls `setLtpOriginIfSafe` **before**
  emitting `site.location-changed` (C19 §1.3). `dispatchParcelBoundary:911` derives project-north θ
  (`deriveProjectNorthAngleFromParcel`), publishes θ transactionally incl. 0 (§SEAM-2), caches the
  estimated envelope, then routes zoning via `applyZoning:1031` (`isInBarcelona` →
  `applyBcnZoningThenFallback`).

### 1.4 Reproduce for a new city (L1/L2)
- **Draw boundary — ZERO work.** The whole draw→project→commit path is jurisdiction-agnostic
  (equirectangular about the parcel's first vertex) → works at any coordinate on earth. **A new city
  can draw + generate immediately.**
- **Select parcel — per-jurisdiction wiring** (only if a real cadastre is wanted): (1) add a country
  predicate + `ParcelJurisdiction` row in `parcelProviders/registry.ts`; (2) clone the same-origin
  proxy route (owns the keyless upstream + CRS→WGS84 ring + cache, never crashes); (3) add a client
  adapter (generic `makeWfsParcelProvider` or a named one). `registryParcelProvider` routes
  automatically. No open cadastre → `footprint-fallback` (honest OSM footprint).

**Debt to inherit (contract-recorded, not hidden):** the parcel-scale equirectangular projection
deviates from C12 §1.3's proj4/UTM (sub-0.4 % at parcel scale; measured 0.13 m over 35 m, C19
§1.12.1) and the multi-origin/θ spray is the **C12 §9 SiteFrame** target architecture (still DRAFT).
A new city inherits the SiteFrame authority once it lands.

---

## 2 — Layer L3: Buildable envelope & jurisdiction rule pack

**Authority:** `C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md` (governing), `C57`, C19, C12; ADRs
0269–0277. **This is the one expensive layer.**

### 2.1 Three tiers, one composition
- **L0 schemas** `packages/schemas/src/site/zoning/` — pure Zod slots (`JurisdictionZoningContract`,
  `GeometricRule` discriminated union, `BuildableEnvelope`, `EnvelopeRefusal`). No values (P5-pure).
- **L2 engine + data** `packages/site-parcel-data/` — the deterministic solver
  `computeBuildableEnvelope` (`ZoningRulesEngine.ts:126`), geometry primitives (`geometry/*.ts`),
  per-jurisdiction rule packs (`rulepacks/*.ts`), the registry (`rulepacks/registry.ts`), the refusal
  vocabulary (`zoneRefusal.ts`). **Jurisdiction-agnostic by mandate (C58 §1.5), deterministic — no
  AI/RNG/clock (C58 §1.1).** "Adding DK/ES is a new pack, never an engine edit."
- **L5 orchestration** `apps/editor/src/ui/site/siteDispatch.ts` — the ONLY impure layer: fetches
  Catastro parcel + MUC clau + Overpass roads, projects to scene-XZ, hands them to the pure engine.

### 2.2 Barcelona: edificabilitat is a CONSTRUCTION, not a lookup
Barcelona registers five pack families keyed by *clau* (`registry.ts:258-331`): `13a/13E`
(Eixample, `block-derived-alignment`), `13b` (`block-derived-alignment`, different height table),
`20a/*` (`setback`), `12` (nucli antic), `22a` (industrial, authored but deliberately unregistered —
a legal gate). **The Eixample pack ships every numeric field `null`** (`esBarcelonaEnsanche.ts:143`)
and encodes the Art. 242.2 rule object instead (`BCN_ENSANCHE_RULE:96`): `kind:
'block-derived-alignment'`, `interiorFreeRatio: 0.3`, `minDepth_m: 11`, `maxDepth_m: 30`. PGM Art.
322.1 says densificació zones have **no per-parcel FAR — the envelope IS the rule** (ADR-0271, memory
`barcelona-edificabilitat-is-a-construction`). Height is *also* a construction (Art. 327.2): a 6-band
table keyed by street width (`bcnAlcadaReguladora.ts:70`) with a band-edge **refusal** guard so 1 cm
of measurement noise can't pick a storey.

### 2.3 The solver (rules → geometry)
`computeBuildableEnvelope` (`ZoningRulesEngine.ts:126-933`), inputs injected never fetched (purity):
resolve each constraint in C58 §1.2 priority order → per-edge inset (`insetPolygonPerEdge`) → branch
on `geometricRule.kind` (`alignment`/`block-derived-alignment` → inset THEN `clipToDepthBand`, depth
CONSTRUCTED by `solveBlockDerivedDepth` bisection for the largest depth in [11,30] leaving ≥30 % block
free; `tiered-occupation`; `explicit-area`) → FAR-limited massing height (L-616: the renderer draws a
translucent shell at `maxHeight_m` and a solid at `farLimitedHeight_m`) → upper-bound flag when all
setbacks unknown (`unknown ≠ zero`). **Every failure is a HARD refusal that clears `insetPolygon=[]`,
never a fall-through to the whole parcel** (§ENVELOPE-DIAGNOSTIC; memory
`envelope-reject-silent-fallback`). The occupation cap binds the **volume** not the ring (L-616;
memory `envelope-solid-overstates-partial-data`).

### 2.4 Barcelona (computed) vs Madrid NZ-1 (ring-only) — a deliberate difference
- **Barcelona** = `block-derived-alignment`: PRYZM *constructs* the edificabilitat per parcel every
  selection (registered + solving).
- **Madrid NZ-1** (`esMadridNZ1.ts`; memory `madrid-nz1-ring-only-decision`) = `explicit-area`: the
  ordinance *publishes* the buildable footprint as geometry + a cited COEF_Z; every numeric field is
  `null`, Madrid is a **refusal jurisdiction with empty `packsByZone`**. Deliberately NOT computed —
  computing an FAR where the law publishes geometry would be a lossy re-derivation.

### 2.5 Reproduce for a new city (L3) — the human-gated path
Zero engine edits (C58 §1.5). (1) Author the pack `rulepacks/es<City>*.ts` — a
`JurisdictionZoningContract` with per-field provenance, unknown values `null`, the `geometricRule.kind`
matching the ordinance's geometric operation. (2) Add a bbox gate `providers/<city>Bbox.ts`. (3)
Register in `registry.ts` (`packsByZone`, `refusalFor`, `noRulePackRefusal`). (4) Wire the L5 dispatch
in `siteDispatch.ts`. (5) **Human verification gate** — a `sources/VERIFICATION.md` sign-off + a
`*_CERTIFIED` boolean; while false the dispatcher renders a *cited refusal*, never a number (Córdoba,
Madrid NZ-1 are the shipped examples). Coverage today is measured 24.0 % of Barcelona's private
buildable land (C58 is DRAFT). See `ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY.md` for the per-city
verdicts, and `ONBOARDING-PIPELINE-PORTABILITY.md` for what ports vs what does not.

---

## 3 — Layer L4/L5: Context features + building heights

**Authority:** `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`, `CONTEXT-LOD-BUILD-PLAN.md`,
`CONTEXT-DATA-COUNTRY-STUDY.md`, `LOD-RATE-MASTER.md`; C12, C58. Pre-baked ONCE, offline,
deterministically into static PMTiles — never queried live (live Overpass is unfixable, L-513).

### 3.1 The bake — `tools/context-bake/bake.mjs`
- **REGIONS config** (`bake.mjs:57`): **Barcelona is NOT its own region — it rides the whole-`spain`
  national entry** (`pbfUrl: spain-latest.osm.pbf`, `bbox: -9.55,35.90,4.60,43.90`,
  `heightJoin: 'mds'`). The national bbox covers every Spanish jurisdiction (§BAKE-MULTI-REGION,
  L-607). ~20 regions total feed ONE tippecanoe pass → four merged archives.
- **Four layers** (`LAYERS:197`): `buildings` (`wr/building` — ways **and** relations; `w/building`
  alone silently dropped ~34 % of Barcelona's historic fabric, §BAKE-BUILDING-RELATIONS L-580;
  z12–16), `roads` (`w/highway`, z10–16), `water` (`natural=water`/`waterway`, z8–16), `parks`
  (`leisure=park`/`landuse=grass,forest`/`natural=wood`, z10–16). Per-layer `--geometry-types` avoids
  double-emitting every closed way (§BAKE-GEOMETRY-TYPES L-513b).
- **Pipeline** (`:403`): download+clip (osmium `extract -b`) grouped by shared pbf → filter
  (`tags-filter`) → export (`geojsonseq --add-unique-id type_id`) → **national height join** for
  buildings (§3.2) → tile (ONE `tippecanoe -o <layer>.pmtiles`). Toolchain auto-detects local
  osmium/tippecanoe/duckdb else the bundled Docker image.

### 3.2 Building heights — `tools/context-bake/heightSources.mjs`
- **`heightProvenance` honesty spine** (`:21`): `tagged` (real measured — nDSM/roof/hauteur),
  `derived-levels` (real floor count × 3.2 m), `assumed` (the 9 m default). A fabricated height is
  never emitted as real.
- **Barcelona gets REAL heights via the MDS join:** `spain`/`heightJoin:'mds'` →
  `stampMdsHeightsOnGeojsonseq` (`:1489`). Tiles the national bbox (0.025°), fetches **CNIG MDS
  Edificación** (`mdsn_e025`, a 2.5 m nDSM whose pixel value *is* building height above ground,
  keyless CC-BY), samples P90 over the eroded footprint interior, stamps `height` +
  `heightSource:'mds_edificacion'`, REPLACES the plain clip. Live-verified: Barcelona Eixample ~31 m,
  Córdoba ~17 m (correctly lower).
- **Barcelona vs Madrid heights:** architecturally identical today — both ride `spain`/`mds`
  (`REGION_SOURCE:284`). "Madrid more `assumed`" is a **bake-currency/coverage** effect (its tiles
  predated or under-sampled the MDS join), NOT an architecture gap. The honest fix is a **re-bake**
  (see §7 white-mask + L-636).

### 3.3 Publish + serve
- **CI** `.github/workflows/context-bake.yml` (manual `workflow_dispatch`, 180-min timeout): builds
  the Docker toolchain, installs `geotiff` **outside** the workspace (the `workspace:*` npm bug),
  bakes, **asserts each `*.pmtiles` ≥ 50 KB + `PMTiles` magic**, syncs to `s3://pryzm-assets/tiles/`
  (`content-type application/vnd.pmtiles`, immutable), **verifies 206 range** on `buildings.pmtiles`.
- **Client** `contextTiles.ts`: base URL = `VITE_CONTEXT_TILES_URL` else the same-origin proxy
  `/api/context-tiles/` (`server/contextTilesProxy.js` forwards the Range header — R2 sends no CORS to
  a browser). Reader returns a **discriminated** result (`ok`/`disabled`/`aborted`/`unavailable`) — an
  empty `ok` ("nothing mapped here") is not the same value as `unavailable` (L-467/L-469).

### 3.4 Reproduce for a new city (L4/L5)
(1) Append a `REGIONS` entry (smallest Geofabrik extract containing the city + a city-centre bbox);
cities in one extract share the download. (2) Map the region in `REGION_SOURCE` to an existing height
source, or add one; whole-country regions add `heightJoin` + a `stamp*OnGeojsonseq`; no source →
honest OSM 9 m. (3) `node bake.mjs --check` / `--dry-run` locally, then dispatch the context-bake
workflow (`publish:true`). (4) Verify: `curl -H 'Range: bytes=0-127' …/buildings.pmtiles` → **206**;
tiles ≥ 50 KB + magic; a *low `assumed` fraction* in the in-app context panel (high = the height join
didn't land). No client change — PMTiles indexes by tile coordinate, so a new city just appears.

---

## 4 — Layer L6: Terrain (DTM → Cesium quantized-mesh)

**Authority:** `CONTEXT-DATA-TERRAIN.md`, `CONTEXT-TERRAIN-COVERAGE.md`,
`CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md`; C12. Tool: `tools/context-bake/terrain.mjs`
(standalone; does NOT import bake.mjs). CI: `.github/workflows/terrain-bake.yml` (separate workflow,
by design).

### 4.1 The golden recipe (the standard `--bake-city` path — how Barcelona was made)
1. **City in `REGIONS`** (`terrain.mjs:279`) with a `source` (country DTM key) + `bbox` [W,S,E,N].
   Barcelona: `{ source: 'es', bbox: [2.09, 41.32, 2.23, 41.47] }` (~0.15° span).
2. **`fetchDtmRaster(source, bbox)`** (`:929`) — a keyless WCS/WMS `GetCoverage` returns a native-CRS
   GeoTIFF. ES source = IDEE WMS-INSPIRE / PNOA MDT (`:103`, `geoidSepM: 51.0` Madrid, ~49 Barcelona).
3. **`compileWarpToTileset`** (`:1052`) — reproject native CRS → EPSG:4326 (proj4 via
   `reproject.mjs`), lift orthometric→ellipsoidal by `geoidSepM` (so the mesh shares the building
   datum, C12 §1.4), sample a **257×257** grid per TMS tile, MARTINI raster→TIN with an error bound,
   encode Cesium **quantized-mesh-1.0**, emit the z0..maxZoom tile chain + `layer.json`
   (`emitTileChain:756`).
4. **`maxZoom` is AUTO-DERIVED** from bbox span: `tmsMaxZoomForBbox` = `floor(log2(180/span))`
   (`:727`). Barcelona 0.15° → z10; Madrid 0.22° → z9. **Not hand-set — the maxzoom difference between
   cities is expected metadata, not a defect.**
5. **`layer.json`** (`layerJson:737`): `format: quantized-mesh-1.0`, `bounds` = the city bbox,
   `available` = exactly the emitted tiles. **⚠ It emits NO `extensions` key → no
   `octvertexnormals`.** (This is the white-mask root — §7.)

### 4.2 Verify + publish (CI `terrain-bake.yml`, manual dispatch)
`--selftest` (proj4 control points, <1 cm round-trip) BEFORE any bake → per-city `--bake-city <c>`
→ assert real tiles → **independent-decoder round-trip** (`terrain.verify.mjs --tileset`, the encoder
is hand-rolled so a decoder we did not write must read it back) + control-point datum sample → sync to
`s3://pryzm-assets/tiles/terrain/<city>/`. Client attaches automatically for any site in a baked-city
bbox via `maybeAttachTerrainProvider` (`CesiumViewport.ts:6420`,
`CesiumTerrainProvider.fromUrl(url, { requestVertexNormals: false })`); a 404 (un-baked) → stays flat
`EllipsoidTerrainProvider`, self-correcting.

### 4.3 Reproduce for a new city (L6)
(1) Add the city to `terrain.mjs` `REGIONS` with `source` + `bbox` (~0.14–0.20° span for a clean
single-block tileset at z9–10). (2) `node terrain.mjs --sample-city <city>` locally to prove the DTM
fetch + datum (needs only `geotiff`, prints control-point elevations coast→hill). (3) Dispatch
`terrain-bake.yml` (`city:<name>`, `publish:true`). (4) Verify `…/terrain/<city>/layer.json` → **200**
and the extent matches the config bbox (see the anomaly warnings in §7).

### 4.4 Three terrain-extent anomalies to AVOID when replicating (⚠ these are the current defects)
Measured from the live R2 tilesets (2026-07-28):

| City | Extent | maxzoom | Path used | Status |
|------|--------|---------|-----------|--------|
| Barcelona | 11.7 × 16.6 km | 10 | standard `--bake-city` (full bbox) | ✅ golden |
| Copenhagen | 9.6 × 10 km | 10 | standard (apikey DK) | ✅ correct |
| Madrid | 18.7 × 21 km | 9 | standard (full bbox) | ⚠ wide but white-masks (see §7) |
| Zürich | 4.9 × 4.9 km | 11 | **bounded centre box** (CH source cap) | ⚠ narrow |
| Amsterdam | **0.25 × 0.25 km** | 15 | **hard-coded 256 m NL proof box** | ⚠ tiny mesa |

- **Amsterdam** uses the NL closed-form *proof* path with a **hard-coded 256 m box**
  (`terrain.mjs:1291,1330`, `120900,486900,121156,487156` RD-New) — not the config bbox. It must be
  re-baked through the standard adapter (or a wide NL bbox) to cover the site's context radius.
- **Zürich** bakes a "bounded centre box" (CH swissALTI3D source area cap; `terrain-bake.yml:29`) →
  full-city mosaic is the documented follow-up.
- **Madrid** is *wide and correct-extent* yet still white-masked → its defect was NOT extent; it was the
  quantized-mesh encoder (§4.5 below, now SOLVED). **Standard for a new city: use the full config bbox
  via `--bake-city`, no hard-coded box, no centre-crop.**

### 4.5 The quantized-mesh encoder invariants (L-639, ADR-0278, C12 §10) — SOLVED 2026-07-29

**This is the fix for the "interior/high cities render white" bug** (Madrid, Burgos, Toledo, Soria,
Valladolid…). It was NEVER elevation: coastal-east cities (Barcelona lon +2) use root tile `(1,0)`,
west-hemisphere cities (most of Spain) use root `(0,0)`, and only `(0,0)` was collapsing. The coarse
**z0 tile spans a full hemisphere** (`lat[-90,90]`); flat filler meshes to its **corner vertices at the
poles**, and two header fields then made Cesium **horizon-cull the root → 0 tiles render → white**:

1. **Bounding centre.** The vertex centroid of pole-corners averages to the **geocentre (0,0,0)** →
   garbage header centre + no valid occlusion-cone axis. **Fix (MUST):** use the tile's geometric
   RECTANGLE centre `ecefFromLonLatH((W+E)/2,(S+N)/2,(minH+maxH)/2)` (`encodeQuantizedMesh`).
2. **Horizon occlusion point.** A >hemisphere tile has every corner >90° from centre → no positive
   occlusion candidate → occludee `(0,0,0)` = geocentre = *always below the horizon* → always culled.
   **Fix (MUST):** `horizonOcclusionPoint` returns a **never-cull** occludee (magnitude `1e4`) for
   wide-angle/degenerate tiles; fine city tiles keep the exact cone result.

**Cache discipline (MUST):** bump `TERRAIN_TILESET_VERSION` (`terrainCoverage.ts`) on every bake-output
change — `terrainTilesetUrl` appends `?v=…` so browsers re-fetch (path-stable tiles are cached ~1 day).
**Verify (SHOULD):** decode the emitted root tile off R2 — `centerMag ≈ 6.38e6`, `occMag > 1` (never 0)
— before shipping; the client forensic is `[CTX-TERRAIN-GAP] … §CULL-PROBE` (Cesium's own
`computeTileVisibility`). **Full re-bake tool:** `.github/workflows/terrain-bake-all.yml` (sharded,
parallel, all BAKEABLE_REGIONS). Proven: Burgos/Madrid render full shaded relief.

---

## 5 — Layer L7/L8: 3D-Site render pipeline (Cesium Forma) + camera

**Authority:** C12 §7/§9, C58 §1.14, `CONTEXT-VIEW-DESIGN.md`,
`CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`, `FORMA-CONTEXT-ENGINE-AUDIT.md`; ADR-0089/0087/0095. File:
`apps/editor/src/ui/geospatial/CesiumViewport.ts`. A WebGL surface separate from the WebGPU/three.js
BIM editor; everything is Cesium `Entity` polygons/corridors in ONE ENU frame at the site origin.

### 5.1 Forma mode (`applyFormaMode:2898`) — the deliberate abstract-massing look
Imagery hidden (`.show=false`, kept for exact toggle-back), `globe.show=true`, `globe.baseColor =
FORMA_PALETTE.ground` (#DDDCD9), `showGroundAtmosphere=false`, **`globe.enableLighting=false`**
("ground is flat-lit", 2915), `depthTestAgainstTerrain=false` (2927 — so terrain never depth-culls
context/massing; §CTX-DEPTH-CULL-FIX, founder 2026-07-27). Sky/sun/moon off; a near-white depth fog
instead (SSAO is GPU-fragile). `FORMA_PALETTE` (340–405) is the colour authority (near-white ground,
green parks #A9C77E, blue water #AEC9DB, violet confident envelope #6600FF-family).

### 5.2 Render/seat stack (bottom → top), all at absolute heights
- **Terrain** (optional, baked) — attached WGS-84 ellipsoidal (shares the building datum).
- **Ground features** (parks/roads/water) — **§CTX-ABS-SEAT (L-635):** seated at the absolute settled
  ground `formaTerrainBaseHeight + ε`, NOT `clampToGround` (which renders **nothing** on baked terrain
  because `depthTestAgainstTerrain=false` leaves no stencil for the GroundPrimitive pass). Roads are
  metric-width `corridor` ribbons.
- **Context buildings** — near ring (shadowed within a radius, capped) + demoted (shadowless,
  true-height) + far ring (nearest-N, shadows off, 24 m low-poly clamp). **Per-footprint terrain
  seating** via ONE `sampleTerrainMostDetailed` batch (`globe.getHeight` is garbage in Forma —
  globe `show=false` → no tessellation). **§CTX-SOLID-CONTEXT (L-636):** all near-ring context now
  renders OPAQUE (the `heightProvenance==='assumed'` → translucent signal was dropped for visual
  parity; ⚠ C58 §1.4 trade-off, honest fix = real-height re-bake).
- **Envelope massing** — the "dumb rasteriser" (C58 §1.14): consumes `MassingSolid[]` from the pure
  `envelopeToMassing`, never re-derives a height; confident → violet, provisional → grey; shadows off.
- **Proposed building** — one solid per storey band, `proposedFill`, shadows on.
- **Parcel boundary** — faint-green fill + dashed top line.

### 5.3 Camera (terrain-aware, §L-635)
`SITE_FRAME_HEIGHT_M=600` is height **above ground**, so `frameSiteLocationOnTerrain` (`:2601`) →
`frameSiteLocationOnResolvedGround` awaits the terrain attach + `sampleTerrainMostDetailed`, then
frames at `groundBase + 600`. Framing at a raw ellipsoid-relative 600 m parked the camera **~100 m
UNDER Madrid's ~700 m ground → 3D-Site read blank until zoom-out** (Barcelona's ~12 m ground stayed
above it — why Barcelona always looked fine). `performInitialReframe` (`:6569`) fires at most once,
using `siteFramedInCurrentView()` (frustum visibility) as the honest predicate.

---

## 6 — The end-to-end onboarding checklist (do these, in order)

For a NEW city `<X>` in a covered country:

1. **Context + heights (L4/L5)** — add a `REGIONS` row in `bake.mjs` (Geofabrik extract + bbox);
   map/confirm the height source in `heightSources.mjs`; dispatch `context-bake.yml`; verify 206 +
   ≥50 KB + low `assumed` fraction.
2. **Terrain (L6)** — add a `REGIONS` row in `terrain.mjs` (`source` + **full** bbox, ~0.15° span);
   `--sample-city <X>` locally; dispatch `terrain-bake.yml` (full bbox, no hard-coded/centre box);
   verify `layer.json` 200 + extent matches bbox.
3. **Parcels (L1)** — reuse the country's cadastre adapter if it exists; else clone a proxy + add a
   registry row, OR accept the honest footprint fallback. Draw-boundary works with zero work.
4. **Rule pack / envelope (L3)** — the human-gated step: source the ordinance, author the pack, add
   the bbox gate + registry row + L5 dispatch, gate on a `VERIFICATION.md` sign-off. Until certified,
   ship a cited refusal (never a number).
5. **Render + camera (L7/L8)** — ZERO work; automatic once the data exists.
6. **Verify end-to-end** — draw/select a parcel in `<X>`, confirm: origin on the boundary, terrain
   shaded (not white — see §7), context buildings solid + real heights, green parks/blue water on the
   relief, a cited envelope or an honest refusal.
7. **Track it** — update `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` and the per-city status matrix (§7).

---

## 7 — Known open defect: the high-relief "white mask" (L-636 family)

**Symptom:** baked-terrain cities *with relief* (Madrid ~700 m, Zürich ~400 m, Amsterdam) show a
featureless near-white surface; flat/low cities (Barcelona ~12 m, Copenhagen ~5 m) render correctly.
Both groups have baked terrain attached — so it is NOT "terrain vs flat," and (extent disproves it)
NOT a bbox problem (Madrid is wider than Barcelona and still breaks).

**Proven from code (facts):**
1. `globe.enableLighting = false` (`CesiumViewport.ts:2915`) — terrain is flat-lit.
2. `requestVertexNormals: false` (`:6461`) — normals not requested.
3. The baked `layer.json` declares **no `octvertexnormals` extension** (`terrain.mjs:737-744`) — the
   tiles carry no per-vertex normals to shade with even if requested.
4. `globe.baseColor` #DDDCD9 and fog/sky are all near-white (`fogMinBrightness 0.92`).
5. `depthTestAgainstTerrain = false` — the white is NOT buildings being occluded; it is the terrain
   surface itself.

**Sound deduction (high-confidence, architecturally consistent; a render-model inference, not a
captured pixel):** with lighting off + no normals, Cesium paints every terrain triangle the flat
`baseColor`. Elevation produces **no value variation** → a Madrid ridge and the Barcelona plain both
resolve to the same uniform near-white plane. Flat cities have no relief to lose (so flat lighting is
invisible → "looks correct"); high-relief cities render as a single featureless near-white sheet — the
"white mask." The near-white fog/sky compound it toward the horizon.

**The candidate fix (to be implemented + verified as a SEPARATE tracked change, not asserted here):**
`globe.enableLighting = true` **AND** re-bake `layer.json`/tiles WITH `octvertexnormals` **AND**
`requestVertexNormals: true`. All three are required — lighting with no normals still shades by the
ellipsoid normal (uniform). This is a bake-pipeline change (`terrain.mjs` `emitTileChain` must emit
octvertexnormals + declare the extension) plus two render-flag flips. **Ship a probe
(`pryzmContextDiag` render-split fields) and confirm on a Madrid-vs-Copenhagen capture BEFORE
committing** (memory `probe-can-be-wrong-three-ways`, `context-data-honesty-family`: ship the probe
before the fix).

**Related, already-fixed (keep separate):** the camera-below/`getHeight`-garbage/re-seat family
(L-635, memory `madrid-context-blank-inplace-reseat-root`) is fixed; the *residual* defect is
specifically the unshaded-relief appearance.

**Also to standardise (from §4.4):** re-bake Amsterdam (256 m proof box → full bbox) and Zürich
(centre box → full mosaic) through the standard `--bake-city` path.

---

## 8 — Contract / ADR / spec index

| Layer | Governing contract | Key specs | Key ADRs |
|-------|--------------------|-----------|----------|
| L1/L2 Parcels/Site | **C19**, C57, C12 | `PARCEL-ZONING-FEATURE-SCOPING`, `PARCEL-SELECT-COVERAGE` | 0115, 0070, 0268 |
| L3 Envelope | **C58**, C57 | `ORDINANCE-EXTRACTION-PIPELINE`, `ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY`, `JURISDICTION-PLAYBOOK`, `ONBOARDING-PIPELINE-PORTABILITY` | 0269–0277 |
| L4/L5 Context/heights | C12, **C58** (§1.4 honesty) | `CONTEXT-3D-PERFORMANCE-ARCHITECTURE`, `CONTEXT-LOD-BUILD-PLAN`, `CONTEXT-DATA-COUNTRY-STUDY`, `LOD-RATE-MASTER` | — |
| L6 Terrain | **C12** | `CONTEXT-DATA-TERRAIN`, `CONTEXT-TERRAIN-COVERAGE`, `CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR` | — |
| L7/L8 Render/camera | **C12 §7/§9**, C58 §1.14, C04 | `CONTEXT-VIEW-DESIGN`, `FORMA-CONTEXT-ENGINE-AUDIT` | 0089, 0087, 0095 |

**The overarching debt every new city inherits:** **C12 §9 — the SiteFrame authority** (one owner of
origin + project-north θ + ground, constructed once in `composeRuntime`). Today origin/θ/ground have
competing authorities across ~13 sites, so the one seam surfaces as a *differently-shaped* bug per
city (Barcelona θ-pivot, Copenhagen terrain reseat, Madrid white-mask). Landing C12 §9 is the
structural fix that makes replication uniform.

---

## 9 — One-line summary

**Barcelona is not special-cased.** It is `es`/`spain`/`mds` rows in generic multi-region bakes +
entry-1 in the parcel registry + a hand-authored Art. 242.2 rule pack, rendered by a
jurisdiction-agnostic pipeline. A new city is: **add the bbox rows (context, heights, terrain),
dispatch two bakes, reuse or wire the cadastre, and — the only expensive part — source and author the
legal rule pack.** Everything else is automatic and degrades honestly. The one thing to get right that
Barcelona happens to dodge: **bake terrain with vertex normals and render it lit, or high-relief
cities show the white mask.**
