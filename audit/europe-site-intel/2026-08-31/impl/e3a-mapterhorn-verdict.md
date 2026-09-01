# E3a — THE MAPTERHORN TERRAIN TRIAL: MEASURED VERDICT

Lane E3a (plan Wave E3a; DECISION row 7). Probe lane — NO production deletions, NO cutover.
Trial run **2026-09-01** from the repo box (Windows/Git Bash, Node 24.15.0), foreground, live network.
All numbers below were MEASURED this session; transcripts inline. §L-1056 binds: the old path
retires only via a later superseding commit, never here.

**VERDICT: ADOPT — as the bake-time DTM SOURCE for visual context terrain, behind the existing
compiler.** Not as a runtime tile source, and not as the legal sampling source (datum-lift +
façade-rasant stay on the national DTM per L-584). Exact seam in §5.

---

## 1 · What Mapterhorn actually is (recorded from the actual source, 2026-09-01)

- **Tile endpoint:** `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` — TileJSON 3.0.0 at
  `tiles.mapterhorn.com/tilejson.json`: `encoding: "terrarium"`, `tileSize: 512`, bounds
  world, scheme xyz. Tiles are **lossless** WebP (RIFF fourCC `VP8L` verified on a Barcelona
  z15 and a Madrid z17 tile) — terrarium decode `(R*256 + G + B/256) - 32768`, 1/256 m
  quantisation.
- **Archives (download.mapterhorn.com, HEAD-verified):** `planet.pmtiles` z0–z12 =
  **705,886,514,815 B (657.4 GiB)**, Last-Modified **2026-08-20** (fresh). Regional z13–z17
  archives per z6 cell: **`6-32-23.pmtiles` (contains Barcelona) = 368.2 GiB**;
  **`6-31-24.pmtiles` (contains Madrid) = 363.0 GiB**. Negative control: bogus
  `6-99-99.pmtiles` → HTTP **404** (the 200s are real files, not a catch-all).
  ⚠ The OSS-lane figure "~350 GB up to z12" is stale — it is now 657 GiB and growing.
- **Sources/licence (`download.mapterhorn.com/attribution.json`, 148 entries):** code BSD-3.
  Data per-source. **Spain is INGESTED as national lidar, not GLO-30**: `es2a/b/c` =
  IGN **MDT02 2 m** (CC-BY 4.0 scne.es, 360 GiB raw), `es5a–d` = MDT05 5 m, `esmdt50a–d` =
  MDT50 — the SAME producer/licence/attribution the current pipeline already carries for ES.
  Global fill = Copernicus GLO-30 (285.3 GiB raw, Copernicus free-use licence). The OSS lane's
  "GLO-30-only, national lidar is roadmap" is superseded: the roadmap landed.
- **Coverage/zoom for our two cities (measured, not read off a page):** Barcelona serves to
  **z16** (0.90 m/px at 41.4°N; z17 → HTTP 404 across the whole city bbox, 12/12 sampled tiles).
  Madrid serves to **z17** (0.45 m/px). Max zoom VARIES BY PLACE — an adapter must probe or pin z15.
- **Vertical datum: none declared per tile.** Terrarium carries no datum field. Where national
  lidar is ingested (ES) the values ride the national orthometric datum (proven by agreement
  below); elsewhere GLO-30/EGM2008. No nodata sentinel — gaps are FILLED (GLO-30), never
  marked UNKNOWN. Fine for visuals; **disqualifying for legal sampling** (control 9: a filled
  value is not distinct from a measured one).

## 2 · Datum/height accuracy at the repo's own probe points

Method: terrarium bilinear samples vs the CURRENT pipeline's own `--sample-city` runs (live IGN
WCS `Elevacion4258_25`, the wired 25 m coverage), same 7 probe points (`SAMPLE_PROBES` in
`tools/context-bake/terrain.mjs`). All values ORTHOMETRIC (the +51/+49 lift applies equally to
both and stays ours). Independent scale control: OpenTopoData `eudem25m` (excludes gross datum
error only — its own RMSE ~7 m, DSM-contaminated in cities).

| Probe point | current pipeline (25 m WCS) | Mapterhorn z15 | Δ | EU-DEM ctrl |
|---|---|---|---|---|
| BCN Port/beach | 4.0 m | 3.85 m | **0.15 m** | 7.3 |
| BCN Montjuïc | 87.0 m | 87.12 m | **0.12 m** | 99.6 |
| BCN Tibidabo | 485.0 m | 495.63 m | **10.63 m** — see anchor | 492.1 |
| BCN Eixample | 29.7 m | 31.37 m | **1.67 m** | 49.0 |
| MAD Puerta del Sol | 649.7 m | 649.74 m | **0.04 m** | 663.5 |
| MAD Retiro | 662.3 m | 661.95 m | **0.35 m** | 675.4 |
| MAD North M-30 | 712.3 m | 711.56 m | **0.74 m** | 716.4 |

**The Tibidabo delta indicts the CURRENT pipeline, not Mapterhorn.** Truth anchor fetched from
IGN's own finer coverage on the SAME WCS (`Elevacion4258_5`, 5 m): probe point = **492 m**
(3×3 neighbourhood 487–497, steep summit). Mapterhorn 495.63 is inside the neighbourhood
spread; the current 25 m fetch reads 485 — 7 m low from grid smoothing. On flat/urban ground the
two pipelines agree to **≤ 0.74 m** (6 of 7 points) — also proof the ES tiles carry the national
orthometric datum, so the existing `geoidSepM` lift constants remain valid unchanged.

Sub-metre agreement with data PRYZM already trusts, better-than-current on steep terrain.

## 3 · Resolution · seams · size/cost

- **Resolution:** current ES bake fetches `Elevacion4258_25` at ~25 m/px (Barcelona raster
  622×666 px over the city bbox, measured). Mapterhorn Barcelona z16 = **0.90 m/px** from MDT02
  2 m — ~25× finer than what the wired adapter fetches today (NB the registry row optimistically
  says `resolutionM: 5.0`; the wired coverage is the 25 m one).
- **Seam quality:** 21 bilinear pairs straddling the z15 tile boundary at lon 2.164307 through
  Eixample: **mean |Δ| = 0.058 m, max 0.47 m**. Cross-zoom consistency: Tibidabo z13 495.22 vs
  z15 495.63; Montjuïc 87.11 vs 87.12; Sol identical z15/z16/z17 (649.74). No visible-seam risk
  at city scale.
- **Size/cost:** tile fetch latency 16–713 ms (Cloudflare CDN, cold vs warm). City-bbox tile
  volumes (12-tile sampled averages × counts): BCN z15 = 247 tiles ≈ 32.5 MiB, z16 = 962 ≈
  58.5 MiB; MAD z16 = 1,886 ≈ 301.5 MiB, z17 = 7,371 ≈ 540.6 MiB. As a bake-time SOURCE the
  per-re-bake fetch is ~33 MiB (BCN @ z15) and the shipped R2 product stays the quantized-mesh
  tileset (the existing local Barcelona bake is **2,214,450 B for 14 tiles, z0–z10** — unchanged
  by source). Self-host mirror option: `pmtiles extract` per city (~110 MiB BCN z13–16,
  ~0.97 GiB MAD z13–17); full-cell mirrors (368/363 GiB) are NOT needed. Cash cost ≈ 0;
  bandwidth is Cloudflare-sponsored — a commons courtesy, not an SLA.

## 4 · The finding that reshapes the DO-NOT-BUILD row

REPORT §O put the terrain compiler at "REPLACE (candidate, gated) → Mapterhorn/external
tileset", and the code map hoped "an external planet tileset … would delete most of this file."
**Measured: FALSE for the encoder, TRUE for the fetch zoo.** Mapterhorn serves terrarium
raster-dem for MapLibre-style consumers; Cesium's `CesiumTerrainProvider` (what
`terrainCoverage.ts` + `CesiumViewport.ts` consume from R2) reads quantized-mesh. There is no
Cesium-consumable external tileset here. What Mapterhorn replaces is the part that actually
hurts: the per-country DTM FETCH adapter zoo (`DTM_FETCH` — 8 wired protocols across
WCS1/WCS2/WMS/STAC, 3 apikey-gated, GB area-capped, CH 25-tile-stitched) stops needing a new
adapter per country for VISUAL terrain. The hand-written quantized-mesh encoder, MARTINI, the
datum lift, the verify round-trip, and the R2/client contract all STAY.

## 5 · ADOPT — the exact integration seam (for the later superseding commit; NOT executed here)

1. **Add one source kind** to `tools/context-bake/terrain.mjs` `DTM_FETCH`:
   `mapterhorn: { kind: 'terrarium-zxy', endpoint: 'https://tiles.mapterhorn.com', z: 15 }` —
   fetch the clamped city bbox's tiles, decode lossless WebP (the standalone bake artefact gains
   one dep, e.g. `sharp`; it is already its own npm-install/Docker artefact, so the dep never
   touches the pnpm workspace), terrarium-decode into the existing
   `{ values: Float32Array, bboxNative, nativeCrs }` raster shape (WebMercator → the shared
   proj4 path in `reproject.mjs`). Everything downstream is UNTOUCHED: MARTINI TIN → in-file
   quantized-mesh encoder → `terrain.verify.mjs` independent decode → R2 → `terrainCoverage.ts`.
   Zero client change; L-513 (no new runtime fetch path) respected.
2. **What stays OURS regardless** (the brief's own line, now measurement-backed): the datum rule
   (`geoidSepM` orthometric→ellipsoidal lift — validated unchanged by the ≤0.74 m ES agreement)
   and `fitFootprintGroundPlane()` façade-rasant sampling on the NATIONAL DTM fetch (L-584 legal
   requirement). Mapterhorn is ineligible for the legal path on two measured grounds: no per-tile
   vertical-datum declaration, and no UNKNOWN/nodata channel (gaps silently filled with GLO-30 —
   control 9). Measured visual-vs-legal divergence bound if visuals move: ≤0.74 m flat, ~3.6 m
   at the steep-summit extreme (495.63 vs the 492 m 5 m-grid anchor).
3. **Not adopted:** runtime consumption of `tiles.mapterhorn.com` by the client (sponsored
   bandwidth ≠ SLA; L-513); deletion of the `DTM_FETCH` national adapters (they REMAIN the legal
   sampling source; §L-1056 — removal only in a superseding commit after the founder gate).
4. **Gates before any cutover commit:** (a) full `--bake-city` through the mapterhorn kind +
   `terrain.verify.mjs --tileset` PASS for both cities; (b) attribution shipped (Mapterhorn +
   per-source rows from the machine-readable `attribution.json`; ES rows are the SAME
   CC-BY 4.0 scne.es attribution already carried); (c) founder choice: bake-time direct fetch
   vs self-hosted `pmtiles extract` mirror on R2; (d) per-city max-zoom probe in the adapter
   (measured: BCN z16, MAD z17 — z17 404s across Barcelona).

## 6 · Discoveries recorded for later lanes (control 10 — NOT acted on)

- **`Elevacion4258_5` exists on the already-wired IGN WCS** (GetCapabilities, 2026-09-01) — a
  one-token coverage upgrade (25 m → 5 m) for the CURRENT pipeline, independent of Mapterhorn;
  it is also the cheap fix for the Tibidabo-class smoothing if adoption stalls.
- **ES `geoidSepM: 51.0` (Madrid) is applied to Barcelona too** — the row's own comment says
  "~49 m Barcelona"; the per-city constant debt predates this trial and is unaffected by tile
  source. (The registry's `resolutionM: 5.0` vs wired 25 m coverage is the same class of row rot.)
- OSS-lane L6 §9 sizes/scope for Mapterhorn are stale (now 657 GiB planet + z13–17 national-lidar
  regionals incl. Spain MDT02); re-verify per-country licence rows when new national sources land
  (their own attribution row discipline makes this cheap).

## 7 · Falsification & transcripts

Probe harness (scratchpad-only, nothing written into the repo tree):
`scratchpad/mapterhorn-trial/probe.mjs` + `sizes2.mjs` (sharp 0.33 for WebP decode). Controls
that could have failed and were seen behaving: bogus archive `6-99-99.pmtiles` → **404**;
Barcelona z17/z18 → **404** (endpoint does not fabricate tiles); EU-DEM independent source
excludes a gross datum error (no ~50 m geoid-shift class mistake in either pipeline); lossless
`VP8L` fourCC checked on both cities' tiles; cross-zoom and seam replicates above. Current-
pipeline numbers come from the repo's own `node terrain.mjs --sample-city barcelona|madrid`
run live this session (IGN WCS HTTP 200, rasters 622×666 / 977×843, zero nodata cells).
Repo control: `git status` shows only concurrent Wave-E4 lane files (schemas/siteintel,
countryAdapters — this lane's DO-NOT-TOUCH list, untouched); root
`npx tsc --noEmit -p tsconfig.json` → **RC=0**. Nothing committed.

Key raw readings (abridged):

```
tilejson: {"encoding":"terrarium","tileSize":512,"tiles":["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"]}
planet.pmtiles           HTTP 200  Content-Length: 705886514815   Last-Modified: 20 Aug 2026
6-32-23.pmtiles (BCN)    HTTP 200  Content-Length: 395330147707
6-31-24.pmtiles (MAD)    HTTP 200  Content-Length: 389789533803
6-99-99.pmtiles (bogus)  HTTP 404
bcn Eixample z10..z16: 29.33 / 31.29 / 31.39 / 31.37 / 31.37 / 31.37 m ; z17 404
mad Sol      z10..z17: 649.77 / 649.6 / 649.66 / 649.73 / 649.74 / 649.73 / 649.74 m ; z18 404
seam z15 @ lon 2.164307 (21 samples): mean|d|=0.058 m  max|d|=0.47 m
IGN 5 m anchor, Tibidabo: 492 m (3x3: 487..497) — Mapterhorn 495.63 / current-25m 485
current --sample-city barcelona: 4 / 87 / 485 / 29.7 m ortho (+51 lift)   [WCS Elevacion4258_25]
current --sample-city madrid:    649.7 / 662.3 / 712.3 m ortho (+51 lift) [WCS Elevacion4258_25]
```
