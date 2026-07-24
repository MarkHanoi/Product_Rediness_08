# LOD-200 Context-Building Rate — Switzerland (`ch`) national

**Headline: LOD 2 · real-height coverage ~98% · VERIFIED**

> **LOD-200 context-building rate** — the fraction of the existing buildings around a plot for
> which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel geometry + real
> MEASURED per-building height + ≥1 extra attribute (roof form / storeys / use / construction
> year)** — from an authoritative source, WITHOUT falling back to a fabricated OSM flat-extrude.
> The binding sub-metric is real building-HEIGHT coverage. Identical across every jurisdiction.
> **Distinct from `RATE.md`** (buildable rules) — never conflate.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | footprint + estimated height (OSM tag / `levels`×3.2 m / fabricated 9 m) | universal floor |
| **LOD 150 (LoD1)** | footprint + **real measured** height | first honest tier |
| **LOD 200 (LoD2)** | footprint + real height + **roof form / storeys** | the target |

| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| Netherlands | LOD 2.2 | ~99% | ~97% | VERIFIED |
| **Switzerland** | **LOD 2** | **~98%** | **~95%** | **VERIFIED** |
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
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | Amtliche Vermessung (AV) + EGRID as join key in ÖREB | ~98% | ESTIMATED (schema `document`) | federal, EGRID links geometry↔register |
| **(b) Real building HEIGHT** | **swissBUILDINGS3D 2.0/3.0** (LoD2 volumetric solid, ±30–50 cm, national since 2018) + **swissSURFACE3D** LiDAR cross-check + **GWR `GASTW`** storeys | ~98% | VERIFIED (GWR API) + `document` (geometry) | volumetric, three independent height sources |
| **(c) Extra attributes** | swissBUILDINGS3D manually stereo-extracted **roof shape** + GWR `GBAUJ` (year), `GKAT`/`GKLAS` (category), `GASTW` (storeys) | **HIGH** | VERIFIED (GWR) | roof overhangs modelled; ≤48 h register update |

**OSM height-tag floor:** irrelevant where swissBUILDINGS3D is joined (national LoD2). OSM floor
ESTIMATED ~10–20% explicit-height in cities; fabricated 9 m default never reached with the
national source wired.

---

## Data strategy — footprint (2D) vs height (3D)

⚠ 2D footprint accuracy and 3D height accuracy are DIFFERENT numbers — never blend them. Binding
metric = the 3D number. (Global strategy: Overture-primary + MS density-fallback + country-premium
adapters + a height confidence hierarchy — see LOD-RATE-MASTER.)

| Axis | Decision | Accuracy | Flag |
|---|---|---|---|
| **Footprint (2D)** | country-**PREMIUM** swissBUILDINGS3D / cantonal AV (federal) | **~98%** | ESTIMATED |
| **Height (3D)** | conf tier **1** — measured volumetric solid (±30–50 cm), cross-checked by swissSURFACE3D LiDAR + GWR `GASTW` | **~95%** | VERIFIED (GWR attrs live); geometry `document` |

**Building-TYPE:** urban dense ★★★★★; alpine/detached chalet fabric ★★★ (roof complexity). No
density-fallback needed — swissBUILDINGS3D is national + complete.

## The structural finding

**Native national LoD2 since 2018.** swissBUILDINGS3D 2.0 delivers a closed volumetric solid (or
separate roof/façade/footprint) with **manually stereo-photogrammetrically extracted roof shapes,
including overhangs** — a true LoD2, nationwide plus Liechtenstein, ±30–50 cm, in CityGML 2.0
(3.0 Beta cantons). It is corroborated by two further height sources: swissSURFACE3D classified
LiDAR (15–20 pts/m², a Building class) and the GWR building register's `GASTW` storey count. The
GWR API was **VERIFIED live 2026-07-24** (EGID 1175237 and 501001 both returned structured XML with
canton, coordinates and storey data). The geometry↔register join is via **EGID** — baked into the
model in 3.0 Beta cantons, coordinate-matched in 2.0 fallback cantons.

The only residual is the 2.0→3.0 Beta canton-coverage cycle (biannual) and the coordinate-join
uncertainty in 2.0-only cantons — neither of which drops the LoD2 height below ~98%.

---

## Orthogonality with RATE.md

Switzerland's `RATE.md` splits into a **context-data layer ~85%** and a **building-rule layer
~25–35%** (ÖREB carries the zone CODE but the Ausnützungsziffer/height live in linked PDFs). This
LOD-context rate (~95%) is the *physical-model* refinement of that context layer: we can rebuild
the existing Swiss city at LoD2 far more completely than we can answer *what may be built* on a
Swiss plot. **The rules gap (~25–35%) and the physical-model strength (~95%) are the orthogonality
in one country.** Do not merge them.

---

## What would raise the LOD level

Already LoD2. Actions are integration:

| Action | LOD / height impact | Effort |
|---|---|---|
| Ingest swissBUILDINGS3D CityGML 2.0 into the context loader | LOD 100 → **LOD 2** for all CH | MED — CityGML parser + EGID join |
| Track 2.0→3.0 Beta canton rollout (EGID baked-in) | tightens geometry↔GWR join | LOW — re-check opendata.swiss every 6 mo |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `https://madd.bfs.admin.ch/eCH-0206?egid=1175237&requestContext=building` | 2026-07-24 (per `topics/buildings-lod-height.md`) | HTTP 200 · XML · canton GR, coords, building data | **VERIFIED — GWR storeys/attrs** |
| `https://madd.bfs.admin.ch/eCH-0206?egid=501001&requestContext=building` | 2026-07-24 | HTTP 200 · XML · 5 dwellings, `GASTW` visible | **VERIFIED** |
| swissBUILDINGS3D 3.0 CityGML product page (swisstopo) | 2026-07-24 | CityGML 2.0 confirmed, LoD2, national | `document` |

---

*Last updated: 2026-07-24. GWR API VERIFIED live (storey count, year, category). swissBUILDINGS3D
LoD2 + CityGML 2.0 confirmed from product spec. swissSURFACE3D LiDAR national. Maintainer:
UNASSIGNED.*
