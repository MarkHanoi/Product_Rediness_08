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
