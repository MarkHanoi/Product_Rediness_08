# Data Readiness Rate — Spain (`es`) national

**Headline rate: ~34%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| **Spain (national)** | **~34%** |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| Córdoba | ~8% |

Spain's national score is carried almost entirely by **one asset: the Catastro**. The *Dirección
General del Catastro* publishes parcel geometry AND building footprints as a single national INSPIRE
WFS — no per-region fragmentation, free, no login. That is a genuinely stronger geometry base than
Germany's per-Land ALKIS or Norway's licence-gated FKB building footprint, and it is why Spain sits
marginally above Norway despite having **no national zoning data model at all**. It is held to ~34%
for the reason the whole Spain programme turns on: **the numeric zoning — density and height — is
authored per-municipality inside ~8,131 PGOU/PGM PDFs (L-450), and even the regions that publish a
planning WFS deliver the zone CODE, never the number** (Cataluña MUC → `CODI_QUAL_*`; Madrid
`PG_ORDENACION` → code + ficha reference; verified live 2026-07-20, `SPAIN-ZONING-LIVE-VERIFICATION`).

⚠ **A country rate is not a city rate.** Two Spanish cities sit far above this national baseline —
**Madrid ~68%** and **Barcelona ~48%** — because bespoke municipal data (Madrid's live NZ 1 footprint
geometry) and one-time PGM transcription (Barcelona's clau packs) have been done there. A third,
**Córdoba ~8%**, sits below it, because its zoning numbers live in scanned ordinance PDFs covering
2 of ~10 districts. The national ~34% is the honest baseline for a *random* Spanish municipality,
where nothing structured exists beyond Catastro geometry and, in the largest regions, a zone code.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Structured | Catastro INSPIRE WFS — national, one endpoint, free, GML, parcel polygons for all common-regime Spain. In production (`BARCELONA-DATA-PIPELINE.md`). | **~95%** — the one unambiguously national, unambiguously structured layer. Foral exception below. |
| Building footprint + height (LOD1) | ⚠️ Partial | Catastro *constructions* — footprint national + structured; height only as a coarse floor-count attribute. True height needs an nDSM (PNOA LiDAR, licence UNVERIFIED — L-584 §6 V2). | **~55%** (footprint national; height coarse/absent) |
| Plan/zone existence + boundary | ⚠️ Partial | Per-CCAA, no national aggregator. Cataluña MUC WMS; Madrid ArcGIS `PG_ORDENACION`; Valencia `Planeamiento.Zonificacion`; Andalucía SIU `Planeamiento_Vigente` (existence only). | **~45%** (schema per-region; live confirmed for the 3–4 largest CCAA) |
| Zone/use code | ⚠️ Partial | Structured in the largest regions: Cataluña `CODI_QUAL_AJUNT`, Madrid Norma Zonal, Valencia zone code **+ `url_abs`** (direct doc link on the polygon). Elsewhere the code is in the PDF. | **~40%** (the three Tier-1 regions ≈ 42% of the SEED-318 tier; the long tail is unpublished) |
| Density metric (FAR / coverage / %-utilisation) | ❌ mostly PDF/ficha | **Only one national numeric source found:** Valencia `ms:InventarioSuSuz` → `sup_m2` + `edif_m2` ⇒ FAR — but **sector-level, developable land only**. Madrid `COEF_Z` is a coded string, block-level, NZ 1 only. Everywhere else: the PGOU PDF. | **~8%** |
| Max height (parcel-level) | ❌ Text/PDF | Lives in the per-municipality PGOU *Normas Urbanísticas*. No region publishes it as a parcel attribute. | **~5%** |
| Setback / alignment | ⚠️/❌ | ADR-0270: Spain uses ALL THREE shapes, and getting the kind right is per-municipality. Madrid publishes `Fondo de la Edificación` as a **polyline with no attributes** — the depth is a line you build to, not a number; the C58 setback triple cannot represent it (`es/README.md`). | **~15%** |
| Terrain (DTM/DSM) | ✅ / ❌ | DTM: IGN MDT + Cesium World Terrain, sampled in production (L-584). nDSM (building heights): ❌ — must be DERIVED (DSM−DTM), licence-gated, not built. | **~90%** terrain; nDSM ❌ |
| Heritage overlay | ⚠️ Absent as data | Per-municipality *Planes Especiales* / catálogos (Barcelona Ciutat Vella, Córdoba PEPCH). Rarely a queryable layer; the calificación/clau service does NOT report whether one binds (`BARCELONA-COMPLETE-COVERAGE-PLAN.md` §3.4). | **~15%** |

**Foral exception (load-bearing):** **16 SEED municipalities sit behind the foral-cadastre blocker**
— País Vasco (14) + Navarra (2) run separate cadastres; parcel-select does not work there at all
until a non-Catastro adapter exists (`es/README.md`). So even the ~95% geometry layer is not 100%
national.

---

## The structural gap

**The schema slot exists; the number is in a PDF, one PDF per municipality, ~8,131 of them.** Spain's
planning law delegates the numeric envelope (edificabilidad, ocupación, altura, retranqueos) to each
municipality's PGOU, whose *Normas Urbanísticas* are prose documents. The regional WFS layers that do
exist were built to serve the zone **classification** (a code + a polygon + sometimes a document
link), not the dimensional **values**. This is confirmed live, not inferred: all three Tier-1 regions
were probed 2026-07-20 and **none publishes numeric envelope fields** — Cataluña returns
`DESC_QUAL_*`, Madrid returns `COND_EDIF` (a code) + `FESPECIFICA` (a ficha reference), and the one
region carrying a computable FAR (Valencia) does so only at sector granularity for developable land.

Consequently ~42% of the priority-318 tier (the three Tier-1 regions, 133 municipalities) still
requires **100% PDF curation for every number surfaced**, and the remaining ~85% of municipalities
publish nothing structured beyond Catastro geometry. The national ceiling is capped until a
per-municipality transcription pipeline + the L-449 human-verification gate exist — exactly the
Barcelona/Córdoba OCR programme, generalised.

A second, quieter gap decides *shape* before *number*: the C58 envelope (setbacks + height + FAR)
cannot represent Madrid's published data model — `Fondo de la Edificación` as an attribute-less
polyline is a *buildable depth expressed as a line*, not a setback. Getting the geometricRule kind
right per municipality (ADR-0270) is a prerequisite the national geometry layer does nothing to help.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Transcribe the zone→number tables for the three Tier-1 regions' most common zones (one-time, per-region, L-449-gated) | Converts the structured zone CODE into a structured density+height answer for ~42% of the SEED tier | High (human, per-region) |
| Build the OCR/ordinance-extraction pipeline (shape-B cities: clean scanned PGOU PDFs → values) | Raises the long-tail municipalities from geometry-only to a partial numeric answer, after sign-off | High (pipeline + per-city verification) |
| Resolve the PNOA LiDAR licence (L-584 V2) and derive an nDSM | Upgrades building height from coarse floor-count to measured | Medium–High (licence gate can veto) |
| Ship a non-Catastro foral adapter (País Vasco / Navarra) | Restores parcel-select for 16 SEED municipalities | Medium |
| Adopt Valencia `url_abs` as the model — the polygon carrying its own governing-document link | Turns PDF enumeration from a hunt into a lookup, region-wide | Low (Valencia); per-region elsewhere |

---

*Last updated: 2026-07-24. Catastro parcel + construction WFS and IGN/Cesium terrain confirmed live
and national. All three Tier-1 region planning WFS confirmed live 2026-07-20 and confirmed to carry
zone CODE only, no numeric envelope. Valencia `InventarioSuSuz` (sector-level FAR) is the only
national numeric source found. nDSM/heights and the foral-cadastre adapter not built.
Maintainer: UNASSIGNED.*
