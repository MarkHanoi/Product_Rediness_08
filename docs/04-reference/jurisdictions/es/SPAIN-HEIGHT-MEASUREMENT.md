# Spain — Real Building Height: Methods, Accuracy, Implementation (L-512)

Part of the context-data study — umbrella **L-511**, deep-dive **L-512**
(`../ISSUE-LOG.md`). Source: founder deep-dive 2026-07-21, endpoints re-verified live.

**Problem:** Catastro `ALTURAS` = a real, trustworthy floor *count*, but Catastro's own 3D viewer turns
it into height by flat-extruding every floor at 3 m — an administrative approximation, not a measurement.
Real measured height needs an independent geometric source: airborne LiDAR (primary for Spain) or
satellite (secondary/fallback).

**Bottom line:** for Spain, **airborne LiDAR (PNOA / ICGC) is the primary source** — 100% national
coverage, free, <10 cm RMSE on newest coverage. Every satellite method is currently *less* accurate than
Spain's own airborne LiDAR, so they belong as a cross-check / non-LiDAR-market fallback, not primary.

## 1. Airborne LiDAR nDSM (primary)
- **DTM** = rasterized bare-ground points (ASPRS class 2). **DSM** = highest/first-return points.
  **nDSM = DSM - DTM** = height above ground = building height under a footprint.
- **Per-building statistic: use the 90th (or 95th) percentile of nDSM within the footprint.**
  - `max` alone is WRONG — inflated by antennas/chimneys/HVAC/lift-overruns.
  - `mean/median` under-estimates on sloped/complex roofs + is sensitive to sparse footprint edges.
  - 90th pctile = the height most of the roof sits at, without a single spike pulling it up.
  - Keep `max` separately (model rooftop equipment as a thinner volume later); keep point count (confidence).

### PNOA accuracy by coverage cycle (their published specs — accuracy DIFFERS by tile)
| Coverage | Years | Density | Vertical RMSE Z |
|---|---|---|---|
| 1st | 2009-2015 | 0.5 pt/m2 | <=40 cm spec, ~20 cm typical |
| 2nd | 2015-2021 | 0.5-4 pt/m2 | <=20 cm |
| 3rd | 2022-2025 (rolling; Catalonia 2022, Aragon/Extremadura/Cantabria/Canarias 2023) | 5 pt/m2 | <=10 cm |
**Always record which cycle produced a height** — a "measured" badge on a 1st-cycle tile (~20-40 cm)
and on a 3rd-cycle tile (<10 cm) are both REAL but different confidence.
**Catalonia:** prefer **ICGC's own** LiDAR over PNOA — newer + denser (3rd coverage done, "much higher
detail"), and ICGC already derives DTMv (terrain+veg) / DTMe (terrain+buildings) composites, saving the
DSM-classification step.

### Implementation pipeline (deterministic, no ML)
```
1. Find PNOA/ICGC tile(s) intersecting the bbox (2x2 km LAZ; usually 1 tile per site).
2. Download classified LAZ from centrodedescargas.cnig.es (or ICGC portal).
3. Filter by ASPRS class: class 2 -> DTM; class 6 (or all first-returns if bldg class unreliable) -> DSM.
4. nDSM = DSM - DTM  (gdal_calc.py -A dsm.tif -B dtm.tif --calc="A-B").
5. Per Catastro footprint: clip nDSM -> 90th pctile = measured height; also store max + point count.
6. Cross-check vs ALTURAS x ~3-3.2 m/floor: agree within ~1 floor -> "REAL - measured"; else FLAG.
```
Tooling: PDAL / laspy (points) + GDAL (raster + zonal stats). Footprints already ingested. Re-runnable
when a newer coverage lands. **This is the shared nDSM module (L-511c) — build once, reused by FR + PT.**

## 2. Satellite methods (secondary/fallback — NOT primary for Spain)
| Method | Type | Accuracy | Role |
|---|---|---|---|
| TanDEM-X SAR tomography | radar | ~2 m std dev; 63% within 2 m (Munich, 36k bldgs) | non-LiDAR markets only |
| Stereo-photogrammetry (VHR: GF-7/Pleiades/WorldView) | optical | ~2.1 m RMSE (vs ICESat-2) | fallback, non-LiDAR markets |
| Copernicus GLO-30 / SRTM | global DEM | 30 m grid — smaller than a footprint | terrain context only, NOT per-building |
| ICESat-2 | spaceborne laser | LiDAR-grade but sparse ground-tracks | validation reference only |
All coarser than PNOA — a ~2 m uncertainty blurs a 1-floor difference (bad for massing/shadow).

## 3. What to badge in PRYZM (three fields, not one REAL/ESTIMATED toggle)
1. **`floor_count`** — Catastro `ALTURAS` (real count).
2. **`measured_height_m`** — PNOA/ICGC nDSM 90th-pctile, tagged with LiDAR coverage cycle.
3. **`height_confidence`** — from (a) floor_count x floor-height vs measured agreement, (b) footprint point count.

> **Architectural note (coverage gap):** PRYZM's provenance model today is a binary REAL/ESTIMATED badge
> (the zoning "Why these numbers?" panel, governed by **C23**). This graded, multi-field, cycle-tagged
> height provenance is RICHER than that binary. Either extend C23's provenance model to carry graded +
> source-tagged confidence, or add a context-provenance spec. Logged as a coverage gap under **L-512**;
> do not silently collapse the three fields into one "REAL".
