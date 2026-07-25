# Context tile bake (L-513a)

Bakes the Barcelona 3D-Site context (buildings/roads/water/parks) into static **PMTiles** so the
client reads a tile in **<50 ms** via HTTP range requests instead of hitting live public Overpass
(406/45s/429/502-flaky — see `docs/04-reference/CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`, L-513/L-523).

Deterministic, offline, re-runnable. Source = Geofabrik's Cataluña `.osm.pbf` (~266 MB, daily-refreshed,
live-verified) — NOT a live query.

## Prerequisites
Either the local tools **`osmium`** (osmium-tool) + **`tippecanoe`** (felt fork), OR **Docker**
(the orchestrator auto-detects and falls back to the bundled image). Node ≥ 20 for `bake.mjs`.

```bash
# reproducible toolchain (if you don't have osmium/tippecanoe locally):
docker build -t pryzm-context-bake tools/context-bake
```

## Run
```bash
node tools/context-bake/bake.mjs --check      # tool availability + plan (safe, no work)
node tools/context-bake/bake.mjs --dry-run    # print every command, execute nothing
node tools/context-bake/bake.mjs              # full bake → tools/context-bake/out/*.pmtiles
node tools/context-bake/bake.mjs --layer buildings   # one layer
```
Pipeline per layer: download pbf → `osmium extract` (clip to the Barcelona bbox) →
`osmium tags-filter` → `osmium export` (GeoJSONSeq) → `tippecanoe -o <layer>.pmtiles`. Building
height / `building:levels` and road/water classes ride along as tile attributes (styling + the
C23 provenance badge).

## Upload (object storage)
The client reads PMTiles over HTTP range requests, so any static host with range support works —
same pattern as the furniture-GLB catalogue (memory §furniture-glb-404-object-storage). E.g. Fly
Tigris / S3:
```bash
aws s3 cp tools/context-bake/out/buildings.pmtiles s3://<bucket>/context/barcelona/buildings.pmtiles
# ...roads / water / parks likewise. Set a long immutable cache TTL.
```
Then wire the client tile reader (L-513b/c) at those URLs and demote Overpass to an emergency
fallback (badged ESTIMATED). Re-run the bake on Geofabrik's daily refresh to keep context current.

## Terrain compiler (`terrain.mjs`) — Phase 3 (North Star §6.3)

A **separate, standalone** compiler for elevation. It does NOT touch `bake.mjs`'s building/PMTiles
core — `bake.mjs` owns footprints, `terrain.mjs` owns the DTM→quantized-mesh path. They meet only
at the shared tile key and the shared vertical datum (L-584).

```bash
node terrain.mjs --list                     # per-country DTM source registry (§1)
node terrain.mjs --probe                     # live-probe every national DTM (HTTP + Content-Type)
node terrain.mjs --fetch-nl out/ams.tif      # keyless AHN WCS GetCoverage → a DTM GeoTIFF (no GDAL)
# full compile + independent-decode proof need standalone deps (NOT the pnpm workspace):
#   npm i geotiff@2 @mapbox/martini@0.2 @here/quantized-mesh-decoder@1   (in a scratch dir)
node terrain.mjs --tif out/ams.tif --country nl --out out/terrain/amsterdam
node terrain.verify.mjs out/ams.tif nl       # encode → INDEPENDENT decode round-trip (all LODs PASS)
```

Pipeline: national DTM GeoTIFF (bare-earth) → fill nodata → resample to a 2^k+1 grid → orthometric→
ellipsoidal datum lift (`geoidSepM`, the L-584 fix) → MARTINI error-bounded TIN → LOD pyramid →
self-contained **Cesium quantized-mesh** `.terrain` tiles + `layer.json` → R2 at
`terrain/<city>/{layer.json,{z}/{x}/{y}.terrain}` (mirrors the `<layer>.pmtiles` layout). Runtime =
`Cesium.CesiumTerrainProvider.fromUrl(...)` in `CesiumViewport.ts` (wiring documented in
`terrain.mjs` §9). **Registry verdicts (live-probed 2026-07-25):** NL/CH/FR/ES/NO/DE/US keyless;
DK token-gated (`&apikey=<DATAFORDELER_API_KEY>`, per commit 1fc5bc8b). Proof city: Amsterdam (AHN
0.5 m), keyless end-to-end.

## Scope / notes
- **§L-607 multi-region (2026-07-24).** Was Barcelona-only — which is why every other jurisdiction
  city showed *"No surrounding building data"* on the 3D Site (the client reads baked PMTiles first;
  R2 only held Barcelona). `bake.mjs` now bakes a `REGIONS` list — **whole Spain (national)** + key
  cities across Portugal, France, Italy, Germany, UK, Denmark, Belgium, Netherlands, Norway, Sweden,
  Finland, and Saudi — and merges them into **one `<layer>.pmtiles`** per layer. Output filenames are
  unchanged, so R2 + the client reader need no change. **To add a city: append one entry to
  `REGIONS`** (`pbfUrl` = smallest Geofabrik extract containing it; `bbox` = generous city clip).
- **Disk:** country extracts are downloaded grouped, clipped, then **deleted** (`--keep-pbf` retains
  them for local reruns). Whole-Spain + ~13 extracts fits the CI runner with this reclaim.
- This tool does NOT modify the running app — it produces tiles. The client reader is `contextTiles.ts`.
- Buildings are OSM footprints + tag heights for now; the L-511/L-512 authoritative data
  (3DBAG / Catastro + PNOA nDSM) feeds the SAME bake later without changing the tile format.
- **§BAKE-OVERTURE (2026-07-24) — denser buildings where OSM is thin.** OSM is a building desert in
  Saudi/Gulf (live-probed: Riyadh OSM 56,278 vs **Overture 299,918 — 5.3×**; Jeddah 7.2×). A region
  can flip its **buildings** layer to [Overture Maps](https://overturemaps.org) via
  `buildingsSource: 'overture'` (Riyadh + Jeddah do). Overture is read with **DuckDB** from its
  public GeoParquet on S3, bbox-clipped, mapped to the SAME `building`/`height`/`building:levels`
  tags → the SAME `buildings.pmtiles` (no client change). Roads/water/parks stay OSM for every
  region. Global override: `--buildings-source overture|osm`. The Docker image now bundles DuckDB;
  the pinned release is `OVERTURE_RELEASE` in `bake.mjs` (bump monthly). **Full evaluation +
  delta table + licence/attribution note:** `docs/04-reference/CONTEXT-BUILDING-SOURCE-EVALUATION.md`.
  ⚠ Overture height is ~0% in Saudi (ML footprints) but ~73% in Barcelona (OSM+IGN) — density is
  universal, the height two-for-one is European. ⚠ Attribution: Overture regions need "© Overture
  Maps Foundation" added to the credit line (a client-UI follow-up).
