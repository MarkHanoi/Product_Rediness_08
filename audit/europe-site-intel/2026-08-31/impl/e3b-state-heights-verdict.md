# E3b — ES/FR PRE-COMPUTED HEIGHT TRIAL: VERDICT

Lane E3b (Wave E3, DECISION-SUMMARY row 7: "stop ES/FR nDSM differencing — the states
pre-computed it (MDSnE, MNH LiDAR HD)"). PROBE lane: nothing deleted, nothing committed,
no DO-NOT-TOUCH path entered. Probed 2026-09-01. All numbers below are MEASURED this lane
unless marked READ or INTERPRETATION; raw transcripts, results JSON and the probe scripts
are in `impl/e3b-transcripts/` (scripts reuse `tools/context-bake/heightSources.mjs`
exports — no rival sampler was written; the FR raster fetch mirrors the WMS-R
`image/geotiff` GetMap pattern `terrain.mjs` already uses for RGE ALTI).

## Verdicts

| Country | Product | Verdict | One-line basis |
|---|---|---|---|
| ES | IGN/CNIG **MDSnE** `mdsn_e025` (2.5 m building-class nDSM) | **ADOPT — already adopted; re-verified live** | The repo's ES path (`fetchSpainBuildingHeights`, `stampMdsHeightsOnGeojsonseq`) already samples the pre-computed raster; live GetCoverage + zonal stats measured over Barcelona and Madrid AOIs this lane. ES DSM−DTM differencing was never built — nothing to retire but two PLAN rows (below). |
| FR | IGN **MNH LiDAR HD** (0.5 m normalised height, Géoplateforme) | **ADOPT (as the raster leg beside BD TOPO `hauteur`)** | Keyless live endpoint found and probed; real float GeoTIFF over Paris; the repo's existing zonal sampler (`mdsHeightForBuilding`) worked **unmodified** against it; 1,032 buildings cross-checked against BD TOPO `hauteur`. Caveats below (coverage gate, vegetation, eaves-vs-surface semantics, ZICAD). |

Neither country is BLOCKED. Both endpoints answered on the first attempt.

## The comparison the brief asked for — stated honestly

The brief says "compare zonal statistics … against the repo's current nDSM-differencing
outputs where those exist." **They do not exist for ES or FR.** Grep evidence: the only
call sites of the differencing functions are DK and CH —
`ndsmHeightForBuilding` at `heightSources.mjs:1274` (DK `fetchGeoDanmarkHeights`) and
`:1925` (DK `stampDhmHeightsOnGeojsonseq`), `swissNdsmHeightForBuilding` at `:2022` (CH).
The ES "option B — nDSM (DSM − DTM) from PNOA LiDAR" is a **PLAN row, never built**
(`docs/04-reference/GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md:377`,
`docs/04-reference/geospatial/SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md:344`; the
`catastro` source note in `heightSources.mjs` says "licence UNVERIFIED — not built").
Building that differencing now, just to compare against it, would construct the exact
thing decision row 7 stops — **refused**. The comparison ran instead against the repo's
current **production** height signals: ES = Catastro `numberOfFloorsAboveGround`
(derived-levels), FR = BD TOPO `hauteur` (tagged).

## ES — measured results (transcript `e3b-es-transcript.txt`)

Endpoint (already in `heightSources.mjs`, re-verified live this lane):
`https://wcs-mds.idee.es/mds` WCS 2.0.1 `GetCoverage COVERAGEID=mdsn_e025`, keyless.
DescribeCoverage → HTTP 200. Raw GetCoverage per AOI → HTTP 200 `image/tiff`, 529,329 B,
523×505 px (= the native 2.5 m grid), 100% finite pixels.

| AOI (bbox WGS84) | Raster mean / max (m) | Catastro parts | Measured (P90 zonal) | Coverage | Height median (m) |
|---|---|---|---|---|---|
| barcelona-eixample [2.160, 41.390, 2.176, 41.402] | 11.46 / 49 | 8,421 | 3,390 | 40.3% | 23.46 |
| madrid-centro [−3.712, 40.418, −3.696, 40.430] | 13.19 / 107 | 9,424 | 3,031 | 32.2% | 19.58 |

Both AOIs sit inside the repo's `MDS_CITY_BBOXES` rows for those cities. Pipeline run =
the repo's own `fetchSpainBuildingHeights` (0 raster errors, 0 Catastro errors, honest
partial→APPEND at <0.6 coverage).

Cross-check vs the current derived-levels signal (floors × 3.2 m), footprints with both:

| AOI | n | P50 abs Δ | P90 abs Δ | observed m/floor P50 | within 3 m |
|---|---|---|---|---|---|
| barcelona-eixample | 3,302 | 3.67 m | 9.85 m | **3.84** | 40.8% |
| madrid-centro | 2,926 | 3.05 m | 9.05 m | **3.76** | 49.6% |

INTERPRETATION: the observed ~3.8 m/floor in these centres means the 3.2 m/floor proxy
systematically understates by ~0.6 m/floor — the pre-computed raster is a strict upgrade
over the floor-count signal, which is precisely why the repo already ranks
`mds_edificacion` above `catastro` for every ES region (`REGION_SOURCE`).

DISCOVERY (recorded, not acted on — control 10): per-footprint measured coverage is only
32–40% inside these dense AOIs. Cause is structural (many tiny Catastro `BuildingPart`
polygons fail `minSamples:3` after 1 m erosion at 2.5 m sampling) and honest (parts keep
floors/assumed, never a fabricated height). Whether erode/minSamples deserve tuning for
small parts is a bake-lane question, not this lane's. Also: every `MDS_CITY_BBOXES` row
still reads `baked: false` (probe-verified-bake pending) — unchanged by this lane.

## FR — measured results (transcript `e3b-fr-transcript.txt`)

Endpoint LOCATED and probed this lane (the lane file carried only portal leads):
`https://data.geopf.fr/wms-r/wms` WMS 1.3.0 GetMap,
`LAYERS=IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G`, `STYLES=normal`
("Données brutes"), `CRS=CRS:84`, `FORMAT=image/geotiff`, keyless. Sibling layers exist
for LAMB93 native, MNS and MNT. NOTE the scale window: the layer's
MaxScaleDenominator ≈ 2511 forces requests at ≲0.7 m/px (probe used 0.55 m/px);
a coarse whole-city GetMap will NOT serve — tile the requests (the bake already tiles).

Paris AOI [2.345, 48.850, 2.357, 48.858] (contains the repo's own EPSG:2154 control
point 2.349, 48.853): 1598×1619 float GeoTIFF, 100% finite, mean 8.68 m, max 87.65 m,
56.4% of pixels above 2 m — a real normalised-height surface, not a styled image.

Zonal stats (repo's `mdsHeightForBuilding`, P90 over 1 m-eroded interior, unmodified)
vs BD TOPO `hauteur` (repo's current FR signal, via the repo's `fetchBdTopo`):

- 1,209 BD TOPO buildings; 1,118 with `hauteur`; 1,032 sampled (86 too small after erosion).
- abs Δ: P50 **3.26 m**, P90 **6.98 m**; within 2 m 29.4%, within 3 m 45.8%.
- signed Δ (MNH P90 − hauteur): P10 −1.49 m, P50 **+2.77 m**, P90 +6.36 m.

INTERPRETATION: the +2.8 m median offset is semantics, not noise — BD TOPO `hauteur` is
an **eaves** height (ground→gutter; READ from IGN's BD TOPO description) while MNH is the
**roof surface**; Haussmann mansard roofs sit metres above the gutter. The two signals
answer different questions and should be kept distinct (execution control 7/8: the
measurement basis is a load-bearing qualifier — stamp `mnh-surface-P90` vs
`bdtopo-eaves`, never blend them into one number).

FALSIFICATION CONTROL (`e3b-fr-control-transcript.txt`) — scramble test, corpus never
jittered without a control: shifting every footprint +73 m east against the same raster
degrades the match (n 1032→799, abs P50 3.26→4.71 m, within-3m 0.458→0.320). The
agreement is signal, not harness artifact. (Partial, not total, collapse is expected:
a 73 m shift in a uniform-height Haussmann block often lands on another similar roof.)

ADOPT caveats (all recorded from the actual sources):
1. **Coverage gate**: full metropolitan + DROM-minus-Guyane by end-2026; per-département
   availability map `https://macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD` must be
   checked per bake (same discipline as PNOA coverage). No-coverage → the sampler's null
   return already keeps the footprint's prior tags (UNKNOWN stays UNKNOWN — control 9).
2. **ZICAD** zones carry confidential nodata — the nodata path must stay an honest skip.
3. **Vegetation**: MNH is all-above-ground (canopy included); P90-over-eroded-footprint
   confines sampling to inside building outlines, but street trees overhanging small
   footprints are a residual risk — the 86 no-sample + a share of the P10 negative tail.
4. BD TOPO `hauteur` stays valuable as the independent second signal (the ES-style
   cross-check triangle: footprint × attribute × raster).

## Licence colour — from the actual licence pages, not the lane file

| Source | Licence (verbatim from the licence document/service) | Colour |
|---|---|---|
| ES MDSnE (`mdsn_e025`) | CC-BY 4.0 per **Orden FOM/2807/2015 Art. 4** — read from `https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf` (fetched this lane): products attribution "«<identificador del producto> <fecha> CC-BY 4.0 <atribución de productores>»", abbreviated form "CC-BY 4.0 scne.es <fecha>", derived works prefix "Obra derivada de …", and for modified datasets the attribution must also enter metadata (abstract, lineage, AccessConstraints). The WCS service's own GetCapabilities `<ows:AccessConstraints>` says **"CC BY 4.0 scne.es"**, `<ows:Fees>` "No se aplican condiciones" (fetched this lane, `e3b-transcripts/` has the caps). | **GREEN** (attribution + derived-work wording obligations) |
| FR MNH LiDAR HD | **"Licence Ouverte / Open Licence version 2.0"**, producer IGN — read from the data.gouv.fr dataset page (`data.gouv.fr/datasets/675871bd6e60265b46ab356f`, fetched this lane). 1 km GeoTIFF tiles at 50 cm also downloadable; ZICAD restriction noted on the dataset. | **GREEN** (Etalab 2.0, attribution) |

## What this verdict recommends (for later lanes — no scope taken here)

1. ES: no build. The differencing PLAN rows (tracker §3 option B, two docs cited above)
   should be annotated "superseded by MDSnE — never build" by the lane that owns those
   docs; per §L-1056 only a superseding commit retires a path, and here there is no code
   path to retire — only the plan rows.
2. FR: wire an `mnh_lidar_hd` source into `heightSources.mjs` beside `bdtopo` using the
   probed layer/params above — the sampler and the WMS-GeoTIFF fetch pattern both exist;
   keep `hauteur` as the second signal with distinct measurement-basis stamps.
3. PT (and NO/SE/US documented rows) still need the differencing module — DECISION row 7
   stops ES/FR differencing only; `ndsmHeightForBuilding` is NOT dead code (DK/CH live).

## Scope + honesty attestation

- DO-NOT-TOUCH surfaces (`packages/schemas/src/siteintel/`, `packages/site-parcel-data/**`,
  Source Registry data modules): **not read for modification, not touched**.
- Repo tree changes made by this lane: **only new files** under
  `audit/europe-site-intel/2026-08-31/impl/` (this doc + `e3b-transcripts/`). No file
  modified, none deleted, nothing committed. Root tsc: RC=0
  (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`).
- No ceiling raised, no gate disabled, no gate-debt entry, no rival machinery: both
  probes import the repo's own exports; the only new logic is transcript plumbing and
  the scramble control.
