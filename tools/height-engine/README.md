# `tools/height-engine/` — the nDSM building-height engine (PHASE 4 scaffold)

**What this is.** The Python side of the height programme in
`docs/04-reference/CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md` §6.4 — a **height *computation
engine***, not a height *dataset*. It measures a building's height (and roof type) from national
LiDAR by computing an nDSM (`DSM − DTM`) under the footprint. The defensible IP is *everything after
`DSM − DTM`*: footprint conditioning, the eroded-footprint sample, robust statistics, the
terrain-plane ground fit, roof segmentation, confidence + provenance.

**Status: SCAFFOLD (design + runnable honesty-core + live LiDAR discovery). NOT a built service.**
This is Phase 4 of a multi-quarter programme; Phases 1–2 (heights in the bake + the `HeightProfile`
L0 schema) ship first. Nothing here is claimed as production. Per §CONTEXT-DATA-HONESTY: a height is
never fabricated — a stage without its library **refuses** (`MissingDependency`) rather than inventing
a number.

## What runs today vs what is stubbed

The heavy point-cloud/raster libraries (`pdal`, `laspy`, `rasterio`, `open3d`, `numpy`, `scipy`,
`shapely`) are **absent** in this environment (`python -c "import pdal,laspy,rasterio"` → `ModuleNotFoundError`).
So:

- **RUNS NOW (pure stdlib, proven by `python pipeline.py`):** the algorithmic core — eroded-footprint
  sampling, P90 / trimmed-median (never the max), the least-squares **terrain-plane** ground fit, the
  nDSM height, the confidence score, and the `HeightProfile` emitter. The self-test drives these on
  synthetic points and asserts the honesty rules (see below). This is a *real* proof of the maths, not
  a faked LiDAR run.
- **STUBBED (`MissingDependency`):** stages 1–6 & 10 — LiDAR acquire, CRS reprojection, point read,
  DTM/DSM rasterisation, and roof-plane RANSAC. These need the heavy libs and a real `.laz` tile.

Install the stack to light up the stubs (a build-farm worker image, not this box):

```bash
pip install pdal laspy rasterio shapely numpy scipy open3d pyproj
python pipeline.py     # then stages 1-6/10 become runnable against a real tile
```

## Files

| File | What |
|---|---|
| `pipeline.py` | The 12-stage pipeline. Runnable honesty core (stages 7–9, 11–12) + stubbed heavy stages. `python pipeline.py` runs the self-test. |
| `registry.py` | The **LiDAR Tile Registry** (§6.4.1) + per-country discovery descriptors. `python registry.py` prints the country table + a round-trip self-test. |
| `probe_lidar_indexes.mjs` | Reproducible live-probe of the national LiDAR index services (`node probe_lidar_indexes.mjs`). |

The Python emits a dict that matches the L0 Zod `HeightProfile`
(`packages/schemas/src/site/context/heightProfile.ts`) field-for-field — the engine and the schema
are one contract.

## The 12-stage per-building pipeline (§6.4.2)

```
footprint bbox
  1  ACQUIRE        registry → covering .laz tile(s), cached            [stub: needs registry + download]
  2  NORMALIZE CRS  reproject to the tile metric CRS (never geographic) [stub: pdal/pyproj]
  3  READ           XYZ + Intensity + Classification + ReturnNumber     [stub: laspy/pdal]
  4  DTM            ground pts (class 2 / SMRF/CSF) → TIN/IDW raster     [stub: pdal/rasterio]
  5  DSM            highest return per pixel → raster                    [stub: pdal/rasterio]
  6  nDSM           DSM − DTM                                           [stub: rasterio]
  7  FOOTPRINT COND validate/repair, split merged polys, buffer −0.5 m  [RUNS: points_in_eroded_footprint]
  8  SAMPLE         nDSM cells inside the eroded footprint              [RUNS]
  9  VEG REJECT     class 5, else planarity/roughness → drop rough      [partial: hook in confidence]
  10 ROOF RANSAC    plane count → roof_type + pitch (1 flat/2 gable/4 hip) [stub: open3d]
  11 HEIGHTS        P90 roof; ground = perimeter-DTM PLANE fit (slope)  [RUNS: percentile + fit_plane]
  12 CONFIDENCE     weighted 0..1 → emit HeightProfile                  [RUNS: confidence_score]
```

**Honesty invariants (§6.6 C-CONTEXT §2/§3 — asserted by the self-test):**
1. the building height is **P90 / trimmed-median of the nDSM, never the peak** (chimneys/antennae);
2. sampling uses the footprint **eroded inward −0.5 m** (façade/overhang returns excluded);
3. ground is a **terrain-plane fit** under the building (handles slope — the L-584 fix: ground at the
   façade, not one centroid sample);
4. every `HeightProfile` carries **provenance + confidence** — a value without them cannot ship.

Self-test output (`python pipeline.py`, this environment, all heavy libs ABSENT):
```
[selftest] profile: {'building_height_m': 10.0, 'roof_p90_m': 110.36, 'roof_median_m': 110.2,
                     'roof_peak_m': 115.22, 'ground_elevation_m': 100.2, 'floors_est': 3,
                     'confidence': 1.0, 'provenance': 'lidar_ndsm'}
[selftest] honesty core OK — P90≠peak, eroded footprint, terrain-plane ground, provenance+confidence present
```
The synthetic building is a flat 10 m roof on a 2 % slope with 15 m chimney spikes and façade returns:
the engine recovers **10.0 m** (not 15), drops the edge points, and reconstructs the slope — the exact
failure modes the invariants exist to prevent.

## LiDAR Tile Registry schema (§6.4.1)

Postgres/PostGIS in production; `registry.py` is the in-memory stand-in with an identical query
surface (`tiles_for_bbox`, `by_country`, JSON round-trip). One row per tile:

| column | type | notes |
|---|---|---|
| `country` | text | ISO-3166 alpha-2 |
| `tile_id` | text | national tile name (`32_355_5644`, `w0474n4427`) |
| `bbox` | box | in the tile's own `epsg` (metric, never geographic) |
| `epsg` | int | e.g. 28992 (NL), 2056 (CH), 6350 (US) |
| `density_ppm2` | real \| null | last-return pts/m²; null = unknown (honest) |
| `year` | int \| null | acquisition |
| `classification` | bool | points carry an ASPRS class (ground=2, veg=3–5) |
| `license` | text | SPDX id / free-form; `''` = unverified (resolve before use) |
| `download_url` | text | direct `.laz`/`.copc.laz` or a per-tile resolver |

## Per-country national-LiDAR table — LIVE-PROBED 2026-07-25

`reachable_keyless` and the HTTP verdict are **VERIFIED live** (run `node probe_lidar_indexes.mjs` to
reproduce). `density_ppm2` / licence are **ESTIMATED** from each programme's public spec, not a
per-tile measurement.

| Country | Programme | Density (ppm², est.) | Classified | Licence | Keyless? | Live verdict 2026-07-25 |
|---|---|---|---|---|---|---|
| **NL** | AHN (AHN4/5), PDOK ATOM | ~10–14 | yes | CC-BY-4.0 | **yes** | `200` xml — REACHABLE-KEYLESS |
| **DK** | DHM / GeoDanmark punktsky (Datafordeler) | ~4 | yes | Free (registration) | **no** | `403` — AUTH-GATED (service user; same gate as GeoDanmark bygning) |
| **CH** | swissSURFACE3D (STAC) | ~15–20 | yes | swisstopo open (BGDI) | **yes** | `200` json (STAC v0.9 + v1) — REACHABLE-KEYLESS |
| **NO** | NDH / hoydedata.no (ArcGIS REST) | ~2–5 | yes | CC-BY-4.0 (Kartverket) | **yes** | `200` json — REACHABLE-KEYLESS. (FKB survey height is licensed; free path is the NDH nDSM.) |
| **FR** | IGN LiDAR HD (geopf WFS tile index) | ~10 | yes | Etalab 2.0 (open) | **yes** | `200` — public WFS REACHABLE; `/private/` 401 |
| **ES** | PNOA-LiDAR 2nd/3rd cov (CNIG) | ~1 (1st ~0.5) | yes | CC-BY 4.0 (CNIG) | **yes** | `200` — CNIG portal REACHABLE. Coarse → LoD1-grade. |
| **US** | USGS 3DEP LPC (TNM API + S3) | ~2–8+ | yes | US Public Domain | **yes** | `200` — TNM bbox query returned **162 LPC products** live; usgs-lidar-public S3 also `200` |

**Phase-ordering read (per §6.9):** do the **keyless, dense, classified** countries first — **NL, CH,
FR, US** (and NO/ES at lower density). **DK** needs a Datafordeler service credential before its
pipeline is built (`DATAFORDELER_USER`/`DATAFORDELER_PASS`), consistent with the GeoDanmark height
gate in `tools/context-bake/heightSources.mjs`. Licence per country is verified *before* building that
country's pipeline — some national programmes are non-commercial (top risk §6.9a).

## Tech stack & build farm (§6.4.3, §6.8)

Python (PDAL · laspy · rasterio · shapely · open3d · numpy · scipy · pyproj). Tile queue (SQS/Redis)
→ containerised workers → write one `HeightProfile` per `building_id` (anchored on the Overture id) to
Postgres + a per-tile Arrow file. **Incremental:** a LiDAR-tile republish recomputes only its
buildings and bumps `algorithm_version` (never overwrite — §6.0). API `GET /building/{id}` → the
HeightProfile JSON, feeding the bake's top `tagged` tier (§6.4.4), the scene tiles (§6.5) and C58.

## Cross-refs

- `docs/04-reference/CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md` §6.4 (the spec) · §6.6 (C-CONTEXT invariants) · §6.7 (data-source table)
- `packages/schemas/src/site/context/heightProfile.ts` — the L0 `HeightProfile` this engine emits (Phase 2)
- `tools/context-bake/heightSources.mjs` — the national LoD1 height ingest (Phase 1); shares the honesty framing
- L-584 — terrain as the legal datum (the terrain-plane ground fit here is that fix at the building scale)
