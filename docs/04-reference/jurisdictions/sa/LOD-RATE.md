# LOD-200 Context-Building Rate — Saudi Arabia (`sa`) national

**Headline: LOD 1 (ML-footprint) · real-height coverage ~20% · ESTIMATED — the honest floor**

> **LOD-200 context-building rate** — the fraction of the existing buildings around a plot for
> which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel geometry + real
> MEASURED per-building height + ≥1 extra attribute (roof form / storeys / use / year)** — from an
> authoritative source, WITHOUT falling back to a fabricated OSM flat-extrude. The binding
> sub-metric is real building-HEIGHT coverage. Identical across every jurisdiction. **Distinct from
> `RATE.md`** (buildable rules) — never conflate.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | footprint + estimated height (OSM / ML footprint / GLO-30 DEM / fabricated 9 m) | universal floor |
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
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| **Saudi Arabia** | **LOD 1 (ML)** | **~20%** | **~18%** | **ESTIMATED** |

**Saudi Arabia is the honest floor of the benchmark** — the OSM/ML-footprint-only case, where the
national product line exists but is licensed or geo-fenced from outside the country.

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | ❗Balady `MapServer/28` (parcel) is **geo-fenced** (NXDOMAIN/WAF from outside SA); GEOSA national cadastre **licensed**, not open. No open reachable parcel geometry | **~15%** | ESTIMATED (geo-fence measured) | needs a GEOSA/Balady data agreement |
| **(b) Real building HEIGHT** | Microsoft/Google ML footprints carry only a coarse/occasional height; **Copernicus GLO-30** DEM (30 m) DSM−DTM = very coarse. No measured per-building height reachable | **~20%** | ESTIMATED | ML height is a sanity-check layer, NOT authoritative |
| **(c) Extra attributes** | none reachable (Balady `NOOFFLOORS` geo-fenced); no roof form | **LOW** | ESTIMATED | attributes exist behind the geo-fence |

**OSM height-tag floor:** the *reachable* primary. Microsoft Global ML Building Footprints (KSA covered,
+2.5M buildings, ODbL) + Google Open Buildings + OSM in dense cores (Riyadh/Jeddah/Dammam). Explicit
height tags sparse; the fabricated 9 m default dominates without a DEM assist.

---

## Data strategy — footprint (2D) vs height (3D)

⚠ 2D footprint accuracy and 3D height accuracy are DIFFERENT numbers — never blend them. Saudi is the
CANONICAL density-fallback case AND the sharpest building-type-risk case. Binding metric = the 3D number.

| Axis | Decision | Accuracy | Flag |
|---|---|---|---|
| **Footprint (2D)** | **Overture PRIMARY → Microsoft FALLBACK, per-tile density-triggered** (Riyadh: Overture ~8k vs MS ~50k → use MS). **MERGE, don't replace** — keep Overture attribution, fill gaps with MS polygons | Overture **~80%** / **MS ~90%+** | ESTIMATED |
| **Height (3D)** | conf tier **3** ML footprint height / conf tier **4** type assumption / GLO-30 30 m DEM as a sanity layer. National line (Balady `NOOFFLOORS`) GEO-FENCED (403 measured) | **~20%** | ESTIMATED |

**Building-TYPE — the load-bearing risk here.** Saudi **villa** fabric is ★★: walled compounds,
interior courtyards and attached garages make ML footprints merge or split, so **"one polygon = 3
villas"** badly over-states GFA — a direct FAR/opportunity error. This is WHY the density-fallback +
`footprint_type_confidence` exist. Dense apartment cores (central Riyadh/Jeddah) are ★★★★. Two height
concepts must never be conflated: the regulatory cap (villa ≤14 m, MOMRAH, geo-fenced) vs the physical
context height (ML/DEM) — the latter is never a source for the former.

## The structural finding

**Saudi Arabia's national geospatial product exists but is walled off from a commercial engine outside
the country — so the reachable layer is almost entirely global ML fallbacks.** GEOSA (the national
custodian) runs the National Geoportal under a **licensed**, not open, publishing policy, and the
per-parcel building backend (Balady `MapServer/27` building + `/28` parcel, which carries real
`NOOFFLOORS`) is **geo-fenced** — measured this session: `my.gov.sa/en/content/gis` returned **HTTP
403** from outside SA. There is no confirmed open national LoD2 volumetric model.

What is reachable: Microsoft Global ML Building Footprints (KSA covered, ODbL, free) and Google Open
Buildings — 2D footprint polygons (LOD0/LOD1), some with a coarse height estimate — plus a DEM
(Copernicus GLO-30, 30 m) for a DSM−DTM height that is `corroborated`, not authoritative. That yields a
weak LoD1 (footprint + estimated/coarse height), the honest floor of the benchmark. Two height concepts
must never be conflated: the **regulatory** cap (villa ≤14 m, apartment ≤23 m, MOMRAH 2024, geo-fenced
per-parcel) vs the **physical** height for context massing (ML/DEM) — the latter is never a source for
the former.

To reach a real LoD1+ Saudi Arabia needs a **GEOSA** and/or **Balady** data agreement — the same licence
gate as Norway's FKB-Bygning, but broader (it gates the whole national line, not just footprints).

---

## Orthogonality with RATE.md

Saudi Arabia's `RATE.md` is ~55% — relatively HIGH, because MOMRAH publishes structured national
building-rule caps and setback tables. Its context rate ~18% is LOW, because the physical-model data is
geo-fenced. **Saudi is the MIRROR of France** (France: rules ~22% low, context ~80% high). This inverse
pair is the sharpest possible demonstration that the two rates are orthogonal: knowing the RULES (~55%)
and being able to rebuild the existing CITY (~18%) are entirely different capabilities. Never conflate.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Wire Microsoft Global ML footprints + Copernicus GLO-30 DEM | LOD 100 (coarse) nationally, no licence | LOW |
| Resolve a GEOSA data agreement (licensed national line) | real footprint/height product | HIGH — licence/legal |
| Resolve a Balady data agreement (`/27`+`/28`, geo-fenced) | unblocks real `NOOFFLOORS` per parcel + parcel geometry | HIGH — licence + geo |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `my.gov.sa/en/content/gis` (National Portal GIS) | 2026-07-24 (per topic doc) | **HTTP 403** from outside SA — WAF/geo block | geo-fenced (measured) |
| Balady `Umaps_Click/MapServer/27`,`/28` | prior | NXDOMAIN on ArcGIS host / WAF on proxy | geo-fenced |
| Microsoft Global ML Building Footprints (GitHub) | — | not probed this pass; ODbL, KSA covered (published) | ESTIMATED (reachable) |

---

*Last updated: 2026-07-24. National line (GEOSA licensed; Balady geo-fenced, 403 measured). Reachable =
Microsoft/Google ML footprints + GLO-30 DEM = weak LoD1, the honest floor. Mirror of France on the
rules-vs-context orthogonality. Maintainer: UNASSIGNED.*
