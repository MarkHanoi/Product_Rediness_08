# Rich Contextual 3D Data at Maximum Performance — Architecture (L-513)

**Item:** L-513 (`ISSUE-LOG.md`). Supersedes the ad-hoc latency fixes
(L-476/478/482/506) with a root-cause architecture. **Directly governs L-511/L-512** — the
national-authoritative data study is the *content*; this doc is the *delivery* that makes it fast.

## 1. The symptom (founder, live-tested 2026-07-21)
"Type Barcelona → the 3D Site (right screen) is terrible, doesn't render the 3D context, takes
toooo long." Context buildings/roads/water do eventually appear but slowly and unreliably.

## 2. Root cause — live-reproduced this session, not theorised
The context layer (`apps/editor/src/ui/geospatial/contextBuildings.ts` → `fetchContextBuildings`)
fetches OSM buildings/roads/water **live from public Overpass on every site visit**, via
`/api/overpass` (server proxy → public mirrors → GeoJSON → Cesium extruded polygons).

**Live probe, dense Eixample (Passeig de Gràcia), 2026-07-21 from the dev environment:**
| Endpoint | Result |
|---|---|
| `overpass-api.de` | **HTTP 406** (rejects; finicky about headers) |
| `overpass.kumi.systems` | **HTTP 000 after 45 s** (hung) |
Earlier session probes also saw 429 rate-limits + empty-200s. This is the SAME class of failure the
proxy work (L-476 mirror rotation, L-478 45 s budget) has been fighting — it can only rotate among
mirrors that are *themselves* unreliable.

**Conclusion (architectural, not tunable):** a live public-Overpass hot-path **cannot** be made fast
or reliable. Query cost on a dense city is high, the public mirrors rate-limit + reject + hang, and
even a perfect proxy inherits their worst case. Tuning bbox size (L-482/506) reduces but never fixes
it. This is L-504, now root-caused with evidence.

Two secondary costs stack on top:
- **Client-side geometry build** — footprints extrude to Cesium `PolygonGraphics` per visit (no cache).
- **Backend is a passthrough** — `/api/overpass` forwards per-request; nothing is pre-computed or cached.

## 3. The sound architecture — pre-baked static context tiles (bake once, serve cold)
Replace the **live query** with a **static tile read**. The winning property: a byte-range GET of a
pre-baked tile off our own CDN/object storage is ~20–50 ms, cacheable forever, no rate limit, no query
cost — independent of city density. This is the delivery counterpart to the L-511/L-512 tiered resolver.

```
INGEST (offline, per region, re-run when source updates)          ← L-511/L-512 data feeds in here
  authoritative source (3DBAG / Catastro+PNOA nDSM / BTN25 / Overture / OSM)
    → normalize to internal schema (footprint + height + provenance badge)
    → BAKE tiles:
        • buildings (LOD1/nDSM height): PMTiles vector tiles (footprint+height attrs)  OR
          Cesium 3D Tiles / glTF (for native LOD2 roofs: NL/DK/CH/DE)
        • roads / water / parks: PMTiles vector tiles
    → upload to object storage (single-file PMTiles = one addressable archive per layer per region)

SERVE (hot path)
  CDN / object storage, HTTP range requests, immutable + long cache TTL
    → NO Overpass, NO per-request query, NO rate limit

CLIENT (hot path)
  fetch only the tiles covering the viewport (z/x/y) via range request
    → decode in a Web Worker (off main thread)
    → instanced render (one InstancedMesh per tile, not per building)
    → near ring extruded+shadowed; far ring flat/low-poly (keep the existing L-482 near/far split)
```

### Why PMTiles specifically
- **Single static file** per layer/region on plain object storage — no tile server process to run.
- **HTTP range requests** fetch only the needed tiles from inside the archive (the client library
  issues `Range:` GETs); works directly off S3/R2/Fly volumes + a CDN.
- Vector tiles carry the footprint + height + **provenance attributes** (the L-512 three-tier badge
  travels *in* the tile), so the "Why these numbers?" panel stays honest with zero extra requests.
- Native-LOD2 countries (NL 3DBAG etc.) additionally bake **Cesium 3D Tiles** for real roofs; PMTiles
  covers the LOD1/nDSM + roads/water/parks tiers.

## 4. Performance budget (targets, measurable)
| Stage | Live-Overpass today | Static-tile target |
|---|---|---|
| First context bytes | 0.5 s – 45 s (or fail) | **< 50 ms** (CDN range GET) |
| Full near-ring visible | seconds, variable | **< 500 ms** |
| Rate-limit / hang risk | high (proven) | **none** (static) |
| Repeat visit (cached) | re-queries | **~0 ms** (HTTP cache / SW) |
| Main-thread stall | extrude on main thread | **~0** (worker decode + instancing) |
"<2 s ALWAYS" (L-504) becomes trivially true because the variable, failure-prone hop is deleted.

## 5. Migration path — low-risk, the code already anticipates it
`contextBuildings.ts` header comment (lines ~36/98) already states: *"the ONLY change is to replace
`fetchContextBuildings`'s body"* with an Overture/tile-keyed swap — consumers speak GeoJSON, so the
resolver can emit the same shape from tiles. Staged:
1. **Bake Barcelona first** (matches the ship-first priority): Overture/OSM buildings+roads+water →
   PMTiles → Fly object storage. Prove the read path + worker decode + instanced render.
2. **Swap `fetchContextBuildings` body** to read tiles, keep Overpass as an emergency fallback only
   (badged ESTIMATED), behind the existing resolver.
3. **Feed L-511/L-512 authoritative data** into the same bake (Catastro footprints + PNOA nDSM height
   for ES; 3DBAG for NL) — the tile format doesn't change, only the ingest source improves.
4. Roll out region-by-region on the L-511 build order.

## 6. What this does NOT fix (scope honesty)
- The **right-screen grey-scanline / broken render** in the screenshot is a *rendering* fault
  (webgl-fallback backend, `§PERF-WEBGPU-FRAGMENT`), NOT the data-latency issue — separate item
  (relates L-503). Fast tiles won't fix a broken framebuffer; that needs live-browser diagnosis.
- Roof-shape for Spain stays reconstructed (L-512) — tiling changes delivery speed, not data fidelity.

## 7. Cross-links
Governs/absorbs **L-504** (context <2 s). Delivery layer for **L-511** (country study) + **L-512**
(Spain sources). Provenance-in-tile ties **C23** (+ the graded-provenance gap in MISSING-CONTRACTS).
Render-fault is **L-503**-adjacent, tracked separately. Contracts: **C12** (context/tiles), C55
(geodata layers), C19 (site model), C10 (perf budget).

## 8. Bake sources — LIVE-VERIFIED 2026-07-21 (the architecture rests on these)
The entire premise ("get context in bulk WITHOUT Overpass") is confirmed — both candidate ingest
sources are static, no-rate-limit, and reachable right now:

| Source | Probe result | Role |
|---|---|---|
| **Geofabrik Cataluña** `download.geofabrik.de/europe/spain/cataluna-latest.osm.pbf` | **200** → `cataluna-260720.osm.pbf`, **265,839,733 B (~266 MB)**, `application/octet-stream`, Last-Modified **2026-07-21** (daily-refreshed) | **Pragmatic Barcelona source (L-513a).** The whole region's OSM (buildings+roads+water+parks) in ONE static file. Download once, bake, done. |
| **Overture Maps** `overturemaps-us-west-2.s3.amazonaws.com` | **200**, latest release `release/2026-06-17.0/` listed, anonymous HTTPS | Cleaner/conflated buildings+transport (GeoParquet); the better long-term source, needs a Parquet→tile step. |

**Implication for L-513a:** the bake is `download cataluna-*.osm.pbf (266 MB, one GET) → filter
buildings/roads/water → PMTiles → upload to Fly object storage`. Deterministic, offline, re-runnable
on Geofabrik's daily refresh. NOT a live query. This is the same object-storage pattern already used
for the furniture-GLB catalogue (memory §furniture-glb-404-object-storage), so the hosting path exists.
No blocker remains between here and a working Barcelona context tileset — only the bake job itself.

## 9. L-513b — client tile-reader: turnkey implementation spec

This is the ONLY remaining piece and it is deliberately NOT coded blind: it needs (a) real tiles
from the bake to test decode, and (b) a new dependency whose lockfile must be synced or the Fly
build fails (memory §agent-packagejson-breaks-frozen-lockfile). Follow these steps exactly.

### Dependency (do the lockfile sync in the SAME commit)
- Add **`pmtiles`** (the official reader; issues HTTP `Range` requests against a static `.pmtiles`)
  and **`@mapbox/vector-tile`** + **`pbf`** (decode the vector-tile blobs to features).
- `pnpm --filter @pryzm/editor add pmtiles @mapbox/vector-tile pbf` then COMMIT the updated
  `pnpm-lock.yaml` in the same commit (run root `tsc --skipLibCheck` first — Fly build is strict).

### New module: `apps/editor/src/ui/geospatial/contextTiles.ts`
- `export async function fetchContextBuildingsFromTiles(lat, lon, signal?): Promise<ContextBuildingsNearFar>`
  — SAME return shape as `fetchContextBuildingsNearAndFar`, so it is a drop-in.
- Impl: `const p = new PMTiles(TILE_BASE_URL + '/buildings.pmtiles')` (module-singleton, reused);
  compute the z/x/y tiles covering the near bbox (`CONTEXT_BBOX_HALF_DEG`) + far bbox
  (`CONTEXT_BBOX_FAR_HALF_DEG`); `await p.getZxy(z,x,y)` per tile; decode with
  `new VectorTile(new Pbf(buf)).layers.buildings`; map each feature → the existing
  `ContextBuildingFootprint` shape (ring lon/lat + `heightM` from the tile attr + a
  `heightProvenance` of `'tiled'`). Instanced render is unchanged downstream.
- Decode OFF the main thread if it stutters: move the Pbf/VectorTile step into a Web Worker
  (the tiles are small per-viewport; measure first — may not be needed).

### Swap point (the code already anticipates it)
`contextBuildings.ts` header says *"the ONLY change is to replace `fetchContextBuildings`'s body."*
Concretely: in `fetchContextBuildingsNearAndFar`, try the tile reader first and fall through to the
existing Overpass path on any miss/error (badged ESTIMATED). Keep the per-bbox cache + the L-524a
parcel prefetch — they now cache tile reads (already ~instant, but the cache still dedups).

### Config
`const TILE_BASE_URL = import.meta.env.VITE_CONTEXT_TILES_URL ?? ''`; when empty, skip tiles and use
Overpass (so nothing changes until the tiles are uploaded + the env var is set). Point it at the
object-storage prefix the bake uploaded to (README §Upload).

### Test plan (needs the baked tiles)
1. Run the bake (`tools/context-bake`), upload `out/*.pmtiles`, set `VITE_CONTEXT_TILES_URL`.
2. Draw an Eixample parcel → 3D Site context should paint in <500 ms with NO `/api/overpass` call
   in the network tab (confirm the tile reads instead).
3. Kill the env var → confirm the Overpass fallback still works (badged ESTIMATED).
4. Spot-check building heights against the current Overpass render (should match; tiles carry the
   same OSM tag heights until the L-511/L-512 authoritative data feeds the bake).

### Why this is the last mile
Once wired, the context render latency the founder kept hitting (`502→failover`, "takes too long")
is gone — replaced by a static <50 ms range read. Everything upstream (envelope, panel, prefetch
timing) is already done and confirmed sound (v247–v253).
