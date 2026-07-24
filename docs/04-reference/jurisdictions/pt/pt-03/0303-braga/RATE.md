# Data Readiness Rate — Braga (`pt-03 / 0303-braga`) city

**Headline rate: ~0%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

> **Why ~0% and not "NOT YET ASSESSED":** Research has established the structural position: Braga's
> PDM numeric values (índice, cércea, afastamentos) live in a PDF regulamento — SNIT returns a zone
> polygon and a PDF link, not structured numeric attributes. The two partially-cited values for
> "espaços residenciais" (índice 1.20, cércea 7.5 m) are CONVERGENT-SECONDARY — the governing
> article has not been read from the primary PDM text and cannot be used in any pack at `confidence:
> structured`. No parcel can be answered on all three dimensions (zone + density + height) without a
> PDF. The rate is derivable as ~0% from structural evidence.

> **Braga differs from Lisboa and Porto in one important way:** it is the recommended first-mover
> city because (a) two numeric values are partially cited (the only city in Portugal where this is
> true), (b) no unique engine features are required (no créditos de construção, no moda da cércea,
> no UNESCO overlay), and (c) mid-size municipalities are more likely to have CGPR cadastral
> coverage. Braga's rate is ~0% today but is **closest to becoming measurable** with the smallest
> effort.

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
| Portugal (national) | ~0% |
| **Braga** | **~0%** |

> Braga matches the national ~0% floor. It does not rate higher because no live probe, no
> primary PDM read, and no confirmed cadastral geometry exist. When Phase 0 and Phase 1 are
> complete, Braga is expected to be the first Portuguese city to record a non-zero rate.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ⚠️ not confirmed | Carta Cadastral (SNIC/DGT): Braga is a mid-size municipality — research notes that mid-size municipalities trend better for CGPR coverage than the two largest cities. However, this is not confirmed. Must verify DICOFRE 0303 in DGT SNIC before any pipeline design. Not probed. | 0 — unconfirmed; most tractable of the three PT cities |
| Plan/zone existence + boundary | ⚠️ partial | SNIT (`snit-mais.dgterritorio.gov.pt`): Braga PDM zone polygon confirmed to exist in SNIT; WFS attributes not probed. PDM in force, SNIT-listed. | 0 — not confirmed queryable |
| Zone/use code (categoria de espaço) | ❌ not confirmed | SNIT WFS — not probed. Category "espaços residenciais" identified in research. Structured WFS attribute delivery unconfirmed. | 0 |
| Density metric (índice de utilização, ALLOWED) | ❌ PDF + unverified | CONVERGENT-SECONDARY: índice de utilização máximo 1.20 (0.80 above cota de soleira) for "espaços residenciais" — cited in secondary research. Governing article NOT confirmed from primary PDM text. Cannot be used at `confidence: structured`. All other categorias: not sourced. | 0 — not primary-verified; other categories entirely unsourced |
| Max height (cércea máxima, ALLOWED) | ❌ PDF + unverified | CONVERGENT-SECONDARY: cércea máxima 7.5 m for "espaços residenciais" — same secondary citation. Governing article NOT read. Definition of "cércea" vs "altura da edificação" not confirmed for Braga PDM. All other categorias: not sourced. | 0 — not primary-verified |
| Setback / alignment (afastamentos / recuos) | ❌ PDF only | PDM Braga regulamento — PDF only. Country research mentions Art. 14 as the likely afastamentos article but the article number is not confirmed. No values sourced. Alignment-governed vs. setback-governed distinction NOT determined (ADR-0270). | 0 |
| Building footprint + height (EXISTING, LOD1/2) | ⚠️ partial | BGE (INE, CC-BY-4.0): national building footprints; VERIFIED-LEAD, not probed. DGT LiDAR PRR 2024–25: nDSM height derivable; VERIFIED-LEAD, not probed. No Braga-specific municipal dataset. | VERIFIED-LEAD |
| Terrain (DTM/DSM) | ⚠️ partial | DGT LiDAR PRR 2024–25, DTM 50 cm + DSM 2 m; open; ~90% continental; `cdd.dgterritorio.gov.pt`; VERIFIED-LEAD, not probed | VERIFIED-LEAD |
| Heritage overlay | ⚠️ partial | DGPC Atlas (`patrimoniocultural.gov.pt`): ZGP/ZEP/ZNA layers; VERIFIED-LEAD. No Braga-specific heritage complexity identified (no UNESCO overlay, no créditos-style mechanism). | VERIFIED-LEAD — simpler heritage profile than Lisboa or Porto |

---

## The structural gap

Braga's gap has the same root cause as the national position — numeric planning values are in the
PDM regulamento PDF, not in structured machine-readable fields — but Braga is the closest any
Portuguese city comes to having a measurable foundation:

**The two CONVERGENT-SECONDARY values** (índice 1.20, cércea 7.5 m for "espaços residenciais") are
the only numeric planning values cited for any Portuguese city in this research pass. They are not
yet primary-source verified — the governing article in the Braga PDM regulamento has not been read.
Until that article is read and cited in `sources/SOURCES.md` with a direct document reference, these
values cannot be used in any pack at `confidence: structured`. The gap between "cited in research"
and "verified from primary text" is exactly the gap the L-449 human-verification gate exists to
enforce.

**No unique engine features are required for Braga** — no créditos de construção, no moda da
cércea, no UNESCO overlay. This is what makes Braga the recommended first-mover city: the path from
~0% to a non-zero rate requires only (a) cadastral confirmation, (b) SNIT WFS probe, and (c)
reading the PDM regulamento. No ADR amendment, no new schema type.

**The full category list is unknown.** Only "espaços residenciais" has even partial values. The
Planta de Ordenamento will contain multiple zone categories (espaços centrais, espaços de atividade
económica, etc.) — each requiring its own PDM article citation before any pack can claim to cover
more than one fraction of Braga's land.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Confirm Braga cadastral regime (DICOFRE 0303) via DGT SNIC | Gate-unlocking — no pipeline can start | ~0.25 dev-days |
| Run SNIT WFS probe for Braga zone layer (GetCapabilities + GetFeature) | Confirms whether categoria de espaço is a queryable structured attribute; determines pipeline design | ~0.5 dev-days |
| Read Braga PDM regulamento from SNIT PDF: confirm governing article for índice 1.20 + cércea 7.5 m; discover full category list; source afastamentos | Upgrades 2 CONVERGENT-SECONDARY values to VERIFIED-PRIMARY; discovers all zones; enables pack skeleton | ~0.5–1 dev-day (0.75 dev-days estimated in NEXT.md) |
| Source all PDM categorias (índice + cércea + afastamentos per categoria) | First non-zero fill rate for Braga upon OCR pipeline completion | ~8–12 dev-days total (per research estimate) |
| Build/reuse OCR pipeline + L-449 gate | Required to serve any extracted value at `confidence: structured` | High — shared with PT national |
| Confirm DGT LiDAR endpoints live + download test tile | Unblocks height and terrain layers for Braga (and all PT cities) | ~0.25 dev-days |

---

*Last updated: 2026-07-24. Two numeric values (índice 1.20, cércea 7.5 m for "espaços residenciais")
cited from secondary research — CONVERGENT-SECONDARY, governing article NOT confirmed. No live probe
run. Cadastral regime unconfirmed but mid-size municipality trend is more favourable than Lisboa/Porto.
No unique engine blockers. Recommended first-mover Portuguese city.
Maintainer: UNASSIGNED.*
