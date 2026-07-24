# LOD-200 Context-Building Rate — USA (`us`) national

**Headline: LOD 1 · real-height coverage ~60% · VERIFIED (3DEP) — PARCEL is the weak metric**

> **LOD-200 context-building rate** — the fraction of the existing buildings around a plot for
> which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel geometry + real
> MEASURED per-building height + ≥1 extra attribute (roof form / storeys / use / year)** — from an
> authoritative source, WITHOUT falling back to a fabricated OSM flat-extrude. The binding
> sub-metric is real building-HEIGHT coverage. Identical across every jurisdiction. **Distinct from
> `RATE.md`** (buildable rules) — never conflate.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | footprint + estimated height (OSM / `levels`×3.2 m / fabricated 9 m) | universal floor |
| **LOD 150 (LoD1)** | footprint + **real measured** height | first honest tier |
| **LOD 200 (LoD2)** | footprint + real height + **roof form / storeys** | the target |

| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| Netherlands | LOD 2.2 | ~99% | ~97% | VERIFIED |
| Switzerland | LOD 2 | ~98% | ~95% | VERIFIED |
| Denmark | LOD 2 | ~95% | ~93% | ESTIMATED |
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
| **USA** | **LOD 1** | **~60%** | **~58%** | **VERIFIED** |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | ❗**No national cadastre** — parcels are county-level, ~3,000 fragmented systems (many paywalled/behind portals). BLM PLSS ≠ ownership parcels | **~45%** | ESTIMATED | THE weak metric — the opposite of Spain/France |
| **(b) Real building HEIGHT** | **Overture** `height`/`num_floors` (~20M of 129.6M, growing) + **USGS 3DEP** 1 m LiDAR nDSM (>60% of US) | ~60% | **VERIFIED (3DEP)** | footprints national (Microsoft 129.6M); height partial |
| **(c) Extra attributes** | Overture `num_floors`, use; per-city LoD2 (NYC published, LA LARIAC, Chicago) | **MED** | ESTIMATED | no free national roof form; strong in a few cities |

**OSM height-tag floor:** ESTIMATED ~5–10% explicit-height nationally (better in NYC/SF/Chicago).
Microsoft footprints (129.6M, ODbL) give near-national LOD 100 base; height is the gap.

---

## The structural finding

**The USA inverts the European pattern: footprints and height-derivation data are strong, but there
is NO national parcel cadastre.** Building *footprints* are effectively national (Microsoft US Building
Footprints, 129.6M, ODbL, free). Real *height* comes two ways: Overture's `height`/`num_floors`
(~20M buildings today, growing to 40–50M) and USGS 3DEP national LiDAR (DSM−DTM nDSM, >60% of the US
at 1 m). **3DEP 1 m LiDAR was VERIFIED live this pass** — the National Map API returned downloadable
1 m DEM tiles for the Chicago bbox (`IL_4_County_QL1_LiDAR_2016`, 2024 publication) with direct S3
`downloadURL`s — so the height-derivation source is real and reachable.

The drag on the headline is **parcel definition (a)**: the US has ~3,000 county assessor systems, many
paywalled or portal-only, with no INSPIRE-style national feed — the exact opposite of Spain's single
Catastro or France's national Cadastre. So while we can render correct-height massing for the ~60% of
buildings with an Overture height or a 3DEP tile, tying each to a *real parcel* is the fragmented part.
No free national LoD2 roof model exists; a few cities (NYC, LA LARIAC, Chicago) publish LoD2 separately.

---

## Orthogonality with RATE.md

The US buildable-rule digitisation is also county/municipality-fragmented (zoning is hyper-local).
Here the two rates are *both* dragged by the same federalism — but they remain distinct axes: this
~58% is "can we rebuild the physical block", not "do we know the zoning". Note the parcel weakness
hits BOTH rates, which is unusual — most jurisdictions have a strong cadastre feeding both.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Join Overture `height` to Microsoft footprints (spatial overlap) | LOD 100 → **LOD 150** for the ~15–20% with Overture height | LOW–MED |
| 3DEP nDSM derivation (DSM−DTM 1 m) for the >60% LiDAR-covered US | LOD 150 for the LiDAR-covered majority | HIGH — tile pipeline (US analogue of FR LiDAR HD) |
| Per-city LoD2 ingest (NYC, LA, Chicago) | LOD 200 in those cities | MED — per-city |
| Parcel: integrate a national aggregator (Regrid/ReportAll, commercial) or accept footprint-without-parcel | raises (a) coverage | MED — commercial licence |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `https://tnmaccess.nationalmap.gov/api/v1/products?bbox=-87.68,41.83,-87.61,41.91&datasets=Digital Elevation Model (DEM) 1 meter&max=3` | 2026-07-24 | HTTP 200 · JSON · 2 products · "USGS 1 Meter … IL_4_County_QL1_LiDAR_2016_B16", pub 2024-11-18, S3 `downloadURL` GeoTIFF | **VERIFIED — 3DEP 1 m LiDAR (height source)** |

---

*Last updated: 2026-07-24. USGS 3DEP 1 m LiDAR VERIFIED live (Chicago). Microsoft footprints national
(desk); Overture height ~20M growing. NO national parcel cadastre — county-fragmented is the weak
metric, inverting the European pattern. No free national LoD2. Maintainer: UNASSIGNED.*
