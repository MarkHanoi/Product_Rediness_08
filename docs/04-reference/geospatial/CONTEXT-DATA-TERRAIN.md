# Terrain / DTM — Context-Data Sourcing Study (L-522)

Part of the 3D-Context-Data country study — umbrella **L-511**
(`CONTEXT-DATA-COUNTRY-STUDY.md`), sibling of the Spain height deep-dive **L-512**
(`spain/SPAIN-HEIGHT-MEASUREMENT.md`). Source: founder deep-dive 2026-07-21.

> **STATUS — endpoints UNVERIFIED.** Unlike the L-512 Spain pass (live-probed 2026-07-21),
> **nothing below was live-probed this session.** Every endpoint, grid resolution, accuracy figure,
> licence, and coverage percentage is *per the founder deep-dive* and is a **spike lead to
> re-verify** before we rely on it (project discipline: *ship the probe before the fix*).
> Treat this as the terrain equivalent of the L-514 Portugal pass: documented, not verified.

## The reframing: terrain is NOT a new source

The single most important finding: **the terrain surface (DTM) is a byproduct of the SAME
classified LiDAR point cloud already pulled for building height** (L-512). Building height uses
`nDSM = DSM - DTM`; the **DTM half of that subtraction IS the terrain-draping surface.** The
class-2 (ASPRS bare-ground) returns that already get rasterized to produce the DTM for the height
pipeline are exactly the raster the rest of the 3D-Site needs to drape roads, gradient water,
terrain-follow park meshes, and grade the site.

```
Same classified LiDAR pull (per tile, already fetched for height)
    class 2 (bare ground)  -> rasterize -> DTM  <- TERRAIN SURFACE (this study)
    first-return / class 6 -> rasterize -> DSM
    nDSM = DSM - DTM       -> building height (L-512)
```

So for **Spain there is NO new sourcing** — the DTM falls out of the PNOA/ICGC class-2 pull the
height module (L-511c / L-512b) already does. The genuinely new work is:
1. **Per-country DTM adapters** for the countries whose terrain lead is *better* than their
   height lead (France LiDAR HD, UK EA composite) or *fragmented differently* (Germany per-Land).
2. A **global bare-earth fallback** (FABDEM) for everywhere with no national LiDAR.
3. **Terrain badging** — a grid-resolution badge + a vertical-RMSE badge, mirroring the height
   doc's PNOA coverage-cycle badge.

### Why terrain must be a bare-earth DTM, never a surface model (DSM)

This is the same trap the water-modeling section flags: **never drape roads or water on a surface
model with trees and buildings baked in.** A DSM (or raw SRTM / raw Copernicus GLO-30) includes
canopy and rooftops, so a road draped on it climbs over tree crowns and a water plane sampled from
it sits on rooftops. The draping surface must be a **bare-earth DTM** (class-2 ground only). This
is why the global fallback is **FABDEM, not raw GLO-30** (see below).

## Per-country terrain sources

| Country | Terrain source | Grid | Vertical accuracy | Licence | Integration effort | Notes (UNVERIFIED) |
|---|---|---|---|---|---|---|
| **Spain (ES)** | **PNOA** class-2 ground (or **ICGC** for Catalonia) rasterized to DTM | ~1-2 m (finer on 3rd coverage) | tracks PNOA cycle: 1st ~20-40 cm -> 3rd <=10 cm RMSE-Z | CC BY 4.0 (PNOA-LiDAR) | **NONE (reuse)** — DTM is the byproduct of the L-512 height pull | Add a **grid-resolution badge** alongside the coverage-cycle badge: 3rd-coverage tiles = finer terrain. |
| **France (FR)** | **IGN LiDAR HD** class-2 -> derived **MNT/DTM** GeoTIFF; fallback **RGE ALTI** | LiDAR HD MNT **50 cm** (1x1 km tiles); RGE ALTI **5 m** | LiDAR HD **~10 cm vertical / 30-50 cm planimetric**; RGE ALTI coarser, down to **~7 m RMSE on alpine steep terrain** | open (IGN, "etalab"-class — VERIFY) | LOW-MED | **Best in Europe.** LiDAR HD >=10 pulses/m2, national, completion targeted 2026. Better than PNOA even at 3rd coverage. Flag RGE-ALTI alpine tiles like a PNOA-1st tile (low confidence). |
| **UK** | **Environment Agency LIDAR Composite DTM** (England); **Scotland** own composite; **Wales + NI** separate programmes | **1 m** | **~+/-15 cm RMSE** (EA composite) | OGL (Open Government Licence — VERIFY per nation) | LOW (England); MED (devolved nations) | ~99% of England, OS Newlyn datum / OSTN'15. **Do NOT assume EA coverage extends to Wales or Northern Ireland — check each devolved programme individually.** |
| **Germany (DE)** | **DGM1** published **per-Land** (16 state portals) | **1 m** | per-state (often excellent) | per-Land (16 different licences/terms) | **MED-HIGH (16 adapters)** | **No single federal endpoint.** Each Land = own portal, tiling, cadence, licence. Genuine integration cost = 16 adapters; data quality per state often excellent. Mirrors the L-511 German building "state router" pattern. |
| **Netherlands (NL)** | **AHN** (Actueel Hoogtebestand Nederland) — DTM + DSM | sub-metre (LiDAR) | **sub-decimetre** | CC BY (VERIFY) | LOW | **Reference / gold-standard adapter.** One of the best national LiDAR terrain programmes in the world; DTM + DSM both published. Replicate this adapter shape for the others (same reference role AHN/3DBAG plays for the L-511 buildings pattern). |
| **Global fallback** | **FABDEM** (Forest And Buildings removed Copernicus DEM) | ~**30 m** | coarse, but genuinely **bare-earth** | CC BY-NC-SA (VERIFY — non-commercial clause matters) | LOW | GLO-30 DSM + ML correction (trained vs LiDAR across 12 countries) stripping building/tree bias. **Use INSTEAD of raw SRTM / raw Copernicus GLO-30** (those are SURFACE models with trees+buildings baked in). Coarse grid but honest bare-earth — the correct global default for draping. |

**Do NOT quote a national parity number where the source has not published one** (same discipline
as L-514 for DGT's unpublished RMSE-Z). Where a figure above is the founder's recollection, it is
flagged UNVERIFIED and must be re-probed against the provider's published spec at spike time.

## The `terrain_source` adapter interface (mirrors the height pattern)

Exactly the pattern the Spain doc established for height: the rest of the pipeline consumes a
**DTM raster + a confidence badge, and never needs to know the country.** The resolver maps
`country/region -> terrain adapter`, and each adapter yields a raster plus two provenance fields:

```
country/region  ->  terrain adapter
                      PNOA-ES        (ES; ICGC for Catalonia)   -- reuse the height pull
                      LiDAR-HD-FR    (FR; RGE-ALTI fallback)
                      EA-UK          (UK England; Scotland/Wales/NI variants)
                      Land-DE        (DE; 16 per-Land sub-adapters)
                      AHN-NL         (NL; reference adapter)
                      FABDEM-fallback (everywhere else)

each adapter yields:
   dtm_raster            -- bare-earth DTM (class-2 only; NEVER a DSM/surface model)
   grid_resolution       -- metres/pixel (e.g. 0.5 / 1 / 5 / 30)
   vertical_accuracy_rmse-- metres, or NULL where the provider has not published one
```

Same architecture as the height resolver: adapters are self-contained behind the existing
per-country resolver interface; the OSM/no-terrain path is the clean fallthrough (FABDEM). The
DTM raster + confidence badge is the ONLY thing the road/water/park/grading consumers see.

## Badging — grid-resolution + vertical-RMSE (mirrors the height coverage-cycle badge)

The height doc (`spain/SPAIN-HEIGHT-MEASUREMENT.md` S3) refuses to collapse provenance into one
REAL/ESTIMATED toggle: it carries `floor_count` + `measured_height_m` + `height_confidence`, and
tags the LiDAR **coverage cycle** on every measured height. Terrain mirrors this with **two
badges**, both travelling with the draping surface:

1. **`grid_resolution` badge** — metres/pixel of the DTM raster (0.5 m LiDAR HD vs 1 m EA/DGM1 vs
   5 m RGE-ALTI vs 30 m FABDEM). This is the terrain analogue of the PNOA **coverage-cycle badge**:
   a finer grid = a more trustworthy drape. For Spain specifically, add the grid-resolution badge
   **alongside** the existing height coverage-cycle badge (3rd-coverage tiles = finer terrain).
2. **`vertical_accuracy_rmse` badge** — RMSE-Z in metres, or **NULL** where the provider has not
   published one (do not invent a figure — same honesty rule as L-514's DGT RMSE-Z gap).

A road draped on a 50 cm LiDAR-HD DTM and one draped on a 30 m FABDEM DTM are BOTH real terrain,
but different confidence — the badge must say which, exactly as a "measured" height badge on a
PNOA-1st vs PNOA-3rd tile means different things.

### Provenance coverage gap (same one L-512 logged)

This graded, grid-tagged, RMSE-tagged terrain provenance is **richer than PRYZM's binary
REAL/ESTIMATED badge** (the zoning "Why these numbers?" panel, governed by **C23**). This is the
**same coverage gap already logged under L-512** for graded height provenance — extend C23's
provenance model to carry graded + source-tagged + grid/accuracy-tagged confidence, or add a
context-provenance spec. Do NOT silently collapse grid + RMSE into one "REAL".

## Open decisions (for the spike / a human)

- **Germany 16-adapter cost** — DGM1 has no federal endpoint; 16 per-Land adapters (own licence,
  tiling, cadence) is real integration effort. Decide whether to build all 16 up front or
  demand-drive per-Land as sites land (per-state, like the L-511 German building state router).
- **UK devolved coverage** — confirm Wales and Northern Ireland terrain programmes separately;
  do NOT assume EA (England) coverage extends to them. Scotland has its own composite.
- **FABDEM licence** — verify the CC BY-NC-SA (non-commercial) clause is compatible with PRYZM's
  commercial use before wiring it as the global default; if not, fall back to raw GLO-30 *only as
  terrain context, never as a drape surface* (it is a DSM), or find another bare-earth global DEM.
- **France completion** — LiDAR HD national completion targeted 2026; RGE ALTI (5 m) is the
  interim fallback where LiDAR HD has not yet rolled out. Flag alpine RGE-ALTI tiles low-confidence.

## Cross-links

- Umbrella: **L-511** (`CONTEXT-DATA-COUNTRY-STUDY.md`) — the tiered per-country resolver pattern.
- Height sibling: **L-512** (`spain/SPAIN-HEIGHT-MEASUREMENT.md`) — the nDSM method whose DTM half
  IS this terrain surface; the shared nDSM module (L-511c / L-512b) already produces the ES DTM.
- Delivery: **L-513** (`CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`) — the DTM raster is baked into the
  same static-tile delivery layer as the rest of the context.
</content>
</invoke>
