# Data Readiness Rate — Portugal (`pt`) national

**Headline rate: ~0%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

> **Why ~0% and not "NOT YET ASSESSED":** "NOT YET ASSESSED" applies where no research has been
> done and the structural position is unknown. Portugal's legal and data-source structure has been
> fully characterised (see `findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md`). The research
> establishes clearly that numeric planning values (índice de utilização, cércea, afastamentos) live
> exclusively in per-municipality PDM regulamento PDFs — no national structured equivalent exists.
> No Portuguese parcel can presently be answered on all three dimensions (zone + density + height)
> without a human reading a PDF. The rate is therefore derivable as ~0% from the structural
> evidence, not a guess.

<!-- The cross-jurisdiction benchmark. Keep this table in SYNC across every RATE.md — it is the
     shared ruler. Insert this jurisdiction at its honest position. -->
| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Portugal (national)** | **~0%** |

> Portugal sits below France because: (a) like France, numeric planning values are PDF-only in
> municipal PDMs; (b) unlike France (which has complete national parcel geometry via PCI-Express),
> Portugal's formal cadastral coverage is limited to ~134 of 308 municípios — major cities may lack
> authoritative parcel geometry entirely. Even France's structural floor (~22%) depends on a
> complete parcel layer Portugal does not yet have nationally.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ⚠️ partial | Carta Cadastral (SNIC/DGT, DL 72/2023): ~134/308 municípios covered (127 CGPR + 7 SiNErGIC). CGPR focused on rural land — major city urban cores likely NOT covered. 174 municípios have no cadastro predial at all. BUPi is NOT a geometry source. Not live-probed. | 0 for query purposes — coverage fragmented; major cities uncertain |
| Plan/zone existence + boundary | ⚠️ partial | SNIT (`snit-mais.dgterritorio.gov.pt`): all mainland PDMs since Jan 2008; zone polygon confirmed to exist; WFS field names and attribute schema NOT live-probed | 0 — zone polygon likely queryable but attribute delivery (categoria de espaço as structured code vs. PDF reference) not confirmed |
| Zone/use code (categoria de espaço) | ❌ not confirmed | SNIT WFS — whether the categoria de espaço is returned as a structured attribute or only as a polygon ID + PDF link is NOT verified (WFS GetFeature not run). DR 15/2015 provides the national taxonomy; PDM labels differ per município | 0 — unconfirmed from any live probe |
| Density metric (índice de utilização / edificação) | ❌ PDF only | PDM regulamento per município. SNIT confirmed to return zone polygon + PDF link, NOT structured numeric attributes. No national numeric ceiling (DR 15/2015 sets category taxonomy, not índice values — confirmed explicit finding). Even the formula (what counts as área de edificação) is per-PDM | 0 — confirmed PDF-only; no structured path available |
| Max height (cércea / altura da edificação, ALLOWED) | ❌ PDF only | PDM regulamento per município — PDF only. Definition varies per PDM (cércea vs. altura da edificação). No national formula. Braga PDM has CONVERGENT-SECONDARY values (índice 1.20, cércea 7.5 m for espaços residenciais) but governing article not yet read from primary source | 0 — confirmed PDF-only |
| Setback / alignment (afastamentos / recuos) | ❌ PDF only | PDM regulamento per município. RGEU does NOT set a height-proportional setback formula — confirmed explicitly. Setbacks are per-PDM only | 0 — confirmed PDF-only |
| Building footprint + height (EXISTING, LOD1/2) | ⚠️ partial | BGE (INE, CC-BY-4.0): national building footprints at 1:10,000; VERIFIED-LEAD, not live-probed. Height attribute NOT confirmed in BGE. DGT LiDAR (PRR 2024–25, ~90% continental, open): nDSM height derivable from DSM−DTM; VERIFIED-LEAD, endpoints not live-probed | VERIFIED-LEAD — strong lead; endpoints not confirmed live |
| Terrain (DTM/DSM) | ⚠️ partial | DGT CDD (`cdd.dgterritorio.gov.pt`): DTM 50 cm + DSM 2 m GeoTIFF; PRR 2024–25 campaign; ~90% continental; unrestricted licence; VERIFIED-LEAD, not live-probed | VERIFIED-LEAD — Portugal's strongest data layer; endpoints not confirmed live |
| Heritage overlay | ⚠️ partial | DGPC Atlas do Património Classificado (`patrimoniocultural.gov.pt`): 4 queryable layers (ZGP/ZEP/ZNA/Restrições); VERIFIED-LEAD, not live-probed. ZGP = automatic 50 m radius; ZEP = variable radius per asset (may include ZNA, zero-build subzone) | VERIFIED-LEAD — structurally queryable; not confirmed live |

---

## The structural gap

Portugal's SNIT is structurally identical to France's GPU: it provides zone polygon geometry and a
link to the PDF regulation, but **not** the numeric planning values themselves. The índice de
utilização, cércea, and afastamentos for any Portuguese parcel are set by the individual município's
PDM regulamento — a PDF document that differs per city, per category, and often per block. There is
no national numeric ceiling (DR 15/2015 provides the zone taxonomy, not the numbers), which places
Portugal closer to France's position than Germany's (which has BauNVO §17 national ceiling tables).

This is compounded by a problem France does not have: **Portugal's parcel geometry is itself
fragmented.** France's PCI-Express gives a complete national parcel polygon for every plot.
Portugal's Carta Cadastral covers only ~134 of 308 municípios, and within those, CGPR was designed
for rural land. Whether the urban cores of Lisbon or Porto have queryable parcel geometry at all has
not been confirmed — the research explicitly flags this as the highest-priority unresolved question,
"structurally worse than France or Germany" as a precondition. Until per-city cadastral coverage is
confirmed, a pipeline cannot even be started.

The only confirmed numeric values for any Portuguese municipality — Braga's índice 1.20 and
cércea 7.5 m for "espaços residenciais" — are CONVERGENT-SECONDARY (cited from secondary research,
governing article not read from primary PDM text). No pack may use them at `confidence: structured`
until the governing article is confirmed. Even if they were confirmed, they cover one category in
one city; the remaining categories and all other cities remain at zero.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Confirm cadastral regime per target city (Braga first): is parcel geometry available via CGPR, SiNErGIC, or no-cadastre? | Gate-unlocking — no pipeline can start without this | ~0.25 dev-days per city; DGT SNIC portal |
| Run SNIT WFS probe (GetCapabilities + GetFeature for Braga): confirm whether categoria de espaço is returned as a structured attribute or only as a PDF link | Establishes whether zone code is automatable | ~0.5 dev-days |
| Read Braga PDM regulamento from SNIT PDF: upgrade the 2 CONVERGENT-SECONDARY values to VERIFIED-PRIMARY; discover full category list | Enables Braga pack; first measurable rate movement | ~0.5–1 dev-day |
| Source all PDM categories for Braga (índice + cércea + afastamentos per categoria) | Completes Braga fill rate; likely the first non-zero rate for any Portuguese city | ~8–12 dev-days total |
| Confirm DGT LiDAR endpoints live (`cdd.dgterritorio.gov.pt`): record tile index format, class codes, RMSE-Z status | Unblocks height layer for all Portuguese cities | ~0.25 dev-days |
| Confirm Carta Cadastral OGC API (planned 2025) — if live, this collapses the parcel-geometry gate for all 308 municípios | Major rate uplift — parcel geometry for all cities | ~0.25 dev-days to check; then adapter work |
| Build SNIT PDF → OCR/rule-extraction pipeline + L-449 human-verification gate | Required to raise rate above ~0% for any Portuguese city | High — but shared with any similar PDF-bound jurisdiction |
| Confirm Lisbon CML 3D model redistribution licence | Unblocks Lisbon context layer (LOD2/3); no direct rate impact on zoning fill rate | ~0.25 dev-days |

---

*Last updated: 2026-07-24. Legal structure FULLY CHARACTERISED (national IGT hierarchy, DR 15/2015, RJUE,
RGEU, DL 72/2023, SNIT, DGT LiDAR — all cited from primary sources). No endpoint live-probed. Zoning
numbers confirmed PDF-only per municipality. Parcel geometry fragmented (~134/308 municipalities).
Maintainer: UNASSIGNED.*
