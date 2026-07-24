# LOD-200 Context-Building Rate — Spain (`es`) national

**Headline: LOD 1 (hybrid) · real-height coverage ~45% · VERIFIED (footprint) — height needs nDSM**

> **LOD-200 context-building rate** — the fraction of the existing buildings around a plot for
> which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel geometry + real
> MEASURED per-building height + ≥1 extra attribute (roof form / storeys / use / year)** — from an
> authoritative source, WITHOUT falling back to a fabricated OSM flat-extrude. The binding
> sub-metric is real building-HEIGHT coverage. Identical across every jurisdiction. **Distinct from
> `RATE.md`** (buildable rules) — never conflate.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | footprint + estimated height (OSM / Catastro floor-count×3 m / fabricated 9 m) | universal floor |
| **LOD 150 (LoD1)** | footprint + **real measured** height (LiDAR nDSM) | first honest tier |
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
| **Spain** | **LOD 1 (hybrid)** | **~45%** | **~52%** | **VERIFIED (footprint)** |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

⚠ **Spain's parcel + footprint base is strong (~95%, VERIFIED) but real MEASURED height is weak
(~45%).** The headline (~52%) is buoyed by the excellent footprint/floor-count base and dragged by
the absence of a measured-height source — the mirror image of France (weak footprint attributes,
strong national height). This is why the binding metric is HEIGHT, not footprint.

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | **Catastro INSPIRE** — CP (parcel) national WFS, one endpoint, free | ~95% | **VERIFIED** | foral exception: País Vasco + Navarra separate cadastres |
| **(b) Real building HEIGHT** | Catastro `BuildingPart.ALTURAS` = **floor COUNT** (real count, NOT measured height — flat 3 m/floor = same category as OSM `levels`). True height needs **LiDAR nDSM** (PNOA/ICGC), licence UNVERIFIED, not built | **~45%** | ESTIMATED | floor-count national; measured height must be DERIVED |
| **(c) Extra attributes** | Catastro year-built, use, floor composition (`CONSTRU` Roman-numeral); **no national roof form** (ICGC Catalonia is LoD1 flat-top) | **MED** | VERIFIED (footprint attrs) | no nationwide LoD2 exists in Spain |

**OSM height-tag floor:** measured 9.0% of 16,187 central-Barcelona buildings have NO use tag; explicit
`height` is lower still. Where Catastro is joined, floor-count×~3 m beats OSM but is still an *estimate*,
not a measurement — carry `floor_count`, `measured_height_m`, `height_confidence` as separate fields.

---

## Data strategy — footprint (2D) vs height (3D)

⚠ 2D footprint accuracy and 3D height accuracy are DIFFERENT numbers — never blend them. Spain is the
sharpest case FOR the split: a top-tier 2D base, a weak 3D one. Binding metric = the 3D number.

| Axis | Decision | Accuracy | Flag |
|---|---|---|---|
| **Footprint (2D)** | country-**PREMIUM** Catastro INSPIRE (national); geometry direct in EPSG:4326 | **~95%** | **VERIFIED** (live footprint + geometry) |
| **Height (3D)** | conf tier **4** — floor COUNT `numberOfFloorsAboveGround` × 3.2 m → `derived-levels`. Real MEASURED (tier 2 PNOA/ICGC nDSM) NOT built; would lift to ~75–85% | **~45%** measured | **VERIFIED** (live: `bu:BuildingPart` ×334, 334 floor counts 1/6/2/7/8…) — floor count, NOT a measurement |

**Building-TYPE:** dense apartment cores ★★★★★ (BCN Eixample, Madrid centro). But Spanish **villa /
low-density** fabric is ★★ — courtyards and attached garages create the **"one polygon = 3 villas"**
FAR over-statement. Carry `footprint_type_confidence` and prefer BuildingPart splits over the
merged Building outline for low-density plots.

## The structural finding

**Spain has the best footprint+parcel base in the benchmark after the Netherlands, but NO measured
building height and NO national LoD2 — its height is a floor-COUNT estimate, not a measurement.**
Catastro publishes parcel geometry AND building footprints as a single national INSPIRE WFS
(**VERIFIED live this pass**: `wfsBU.aspx` GetCapabilities returned `bu:Building`, `bu:BuildingPart`,
`bu:OtherConstruction`). `BuildingPart.ALTURAS` gives a real floor *count* — but Catastro's own 3D
viewer flat-extrudes every floor at 3 m, which systematically **under**-states ambitious buildings
(Benidorm towers measured ~3.6 m/floor). That is the *same category of estimate as OSM `building:levels`*,
just from an authoritative count.

A true measured height requires a LiDAR nDSM (90th-percentile under the footprint) from PNOA or ICGC —
whose licence is **UNVERIFIED** and whose pipeline is **not built**. No nationwide Spanish LoD2 exists;
the best regional layer (ICGC Catalonia, Barcelona's 18k-volume showcase) is explicitly **LoD1** flat-top.
So Spain is an LoD1 *hybrid* today (footprint real + height estimated from floor count), climbing to a
real LoD1 only once the nDSM is derived, and to LoD2 only via self-run RANSAC roof reconstruction
(badge "reconstructed", not "official").

---

## Orthogonality with RATE.md

Spain's `RATE.md` is ~34% (zoning numbers in ~8,131 PGOU PDFs). Its context rate ~52% is higher,
carried by Catastro geometry — but note **both** are constrained by the *same* national posture of
"geometry is open, everything numeric/measured is not". City variance is large: Barcelona/Madrid have
bespoke context work; the national ~52% is the honest baseline for a random municipality. The ~34%
(rules) and ~52% (context) are independent — do not add.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Resolve the PNOA/ICGC LiDAR licence (L-584 V2) and derive a national nDSM | floor-count estimate → **real measured LoD1**; ~45% → ~85% height | MED–HIGH — licence can veto |
| Self-run RANSAC roof-plane segmentation on ICGC dense LiDAR (Barcelona-first) | LoD1 → **LoD2 (reconstructed)** | HIGH — badge non-official |
| Ship a non-Catastro foral adapter (País Vasco / Navarra) | restores footprint/parcel for 16 SEED munis | MED |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?service=WFS&request=GetCapabilities` | 2026-07-24 | HTTP 200 · WFS 2.0 XML · feature types `bu:Building`, `bu:BuildingPart`, `bu:OtherConstruction`; default CRS EPSG:25830; GML 3.2.1 | **VERIFIED — footprint national** |
| PNOA / ICGC LiDAR nDSM | — | NOT probed; licence UNVERIFIED (L-584 §6 V2); pipeline not built | ESTIMATED (height) |

---

*Last updated: 2026-07-24. Catastro Buildings WFS VERIFIED live (footprint + floor-count national).
Real MEASURED height (LiDAR nDSM) NOT built — licence unverified; ALTURAS is a floor COUNT, not a
measurement. No national LoD2. Maintainer: UNASSIGNED.*
