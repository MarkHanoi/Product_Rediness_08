# Data Readiness Rate — Lisboa (`pt-11 / 1106-lisboa`) city

**Headline rate: ~0%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

> **Why ~0%:** Lisboa's numeric planning values (índice, altura da edificação, afastamentos) are in
> the PDM Lisboa regulamento PDF — no structured machine-readable equivalent exists. No SNIT WFS
> probe has been run, no PDM text has been read, and Lisboa's cadastral regime (the prerequisite
> for even having a parcel polygon to attach rules to) is unconfirmed. The rate is derivable as
> ~0% from structural evidence, not a guess or a placeholder.

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
| **Lisboa** | **~0%** |

> Lisboa matches the national ~0% floor. It does not rate higher because no live probe, no primary
> PDM read, and no confirmed cadastral geometry exist. It does not rate lower because the national
> floor already reflects the worst-case structural position.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ❌ not confirmed | Carta Cadastral (SNIC/DGT): Lisboa is in Distrito de Lisboa, north of the Tagus — CGPR coverage was concentrated south of the Tagus and on rural land. Whether Lisboa's urban core falls inside CGPR, SiNErGIC, or no-cadastre coverage is the P0 unresolved question. Do NOT assume coverage. Not probed. | 0 |
| Plan/zone existence + boundary | ⚠️ partial | SNIT (`snit-mais.dgterritorio.gov.pt`): PDM Lisboa zone polygon confirmed to exist in SNIT; WFS attributes not probed. PDM in force since DR 2.ª série n.º 168, 30 Aug 2012; under ongoing revision. | 0 — not confirmed queryable |
| Zone/use code (categoria de espaço) | ❌ not confirmed | SNIT WFS — not probed; category "Espaços centrais e residenciais consolidados" identified in research but WFS attribute delivery unconfirmed | 0 |
| Density metric (índice / altura da edificação) | ❌ PDF only | PDM Lisboa regulamento — PDF only; SNIT returns PDF link, not structured numeric attributes. Lisboa uses "altura da edificação" (not "cércea") — definition differs from other Portuguese PDMs. No numeric values sourced from any Lisboa PDM category. | 0 — confirmed PDF-only |
| Max height (parcel-level, ALLOWED) | ❌ PDF only | PDM Lisboa regulamento — PDF only. "Altura da edificação" definition not yet read from PDM text. No values sourced. | 0 — confirmed PDF-only |
| Setback / alignment (afastamentos / recuos) | ❌ PDF only | PDM Lisboa regulamento — PDF only. No values sourced. Alignment-governed vs. setback-governed distinction NOT yet determined for any Lisboa PDM category (ADR-0270). | 0 |
| Building footprint + height (EXISTING, LOD1/2) | ⚠️ partial | BGE (INE, CC-BY-4.0): national building footprints; VERIFIED-LEAD, not probed. Lisboa CML "Modelo Tridimensional" (LOD2/3, ~1:1,000): richer than any Spain municipal source — but redistribution licence at `geodados-cml.hub.arcgis.com` is UNVERIFIED. Do NOT integrate CML 3D model until licence confirmed. | VERIFIED-LEAD (BGE); LICENCE BLOCKED (CML 3D model) |
| Terrain (DTM/DSM) | ⚠️ partial | DGT LiDAR PRR 2024–25, DTM 50 cm + DSM 2 m; open; ~90% continental; `cdd.dgterritorio.gov.pt`; VERIFIED-LEAD, not probed | VERIFIED-LEAD |
| Heritage overlay | ⚠️ partial | DGPC Atlas (`patrimoniocultural.gov.pt`): ZGP/ZEP/ZNA layers queryable nationally; VERIFIED-LEAD. Lisboa has many classified monuments. Lisbon also has its own Carta Municipal de Património overlaid on DGPC layers — extent not sourced. | VERIFIED-LEAD — not probed |

---

## The structural gap

Lisboa's fill-rate limitation has three layers, each compounding the one before:

**Layer 1 — parcel geometry is unconfirmed.** The prerequisite for any planning-rule query is a
parcel polygon. Lisboa's cadastral regime has not been confirmed. CGPR was rural-focused and
concentrated south of the Tagus; Lisboa is north. The urban core may sit entirely outside formal
cadastral coverage, which would mean no authoritative parcel polygon exists for any Lisboa plot —
a problem France and Germany never face (both have complete national parcel geometry).

**Layer 2 — numeric planning values are PDF-only.** Like the national position, Lisboa's índice,
altura da edificação, and afastamentos live in the PDM Lisboa regulamento — a PDF document. SNIT
delivers a zone polygon and a PDF link; the numbers are not structured attributes. No Lisboa PDM
category has had its numeric values sourced from the primary text.

**Layer 3 — Lisboa-specific unique mechanisms require new engine features.** Even after parcel
geometry and OCR extraction are available:
- **Créditos de construção** (Arts. 84/88/89 of the Lisboa incentives regulation) are tradeable
  floor-area rights that can raise the achievable FAR above the base PDM value. A Lisboa pack that
  ignores them understates legally achievable floor area. No C58 `transferableRights` overlay type
  currently exists — a schema amendment is required before any Lisboa pack can be complete.
- **Seismic-risk overlay** (delimited by LNEC / Civil Protection): a condicionante with no
  France/Germany parallel. Spatial extent not sourced.
- **PDM revision in progress**: the current PDM (in force since 2012) is under ongoing revision.
  Numeric values sourced from the current text may change. The amendment status must be checked
  via SNIT before any value is committed to a pack.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Confirm Lisboa cadastral regime (CGPR / SiNErGIC / no-cadastre) via DGT SNIC for DICOFRE 1106 | Gate-unlocking — no pipeline can start | ~0.25 dev-days |
| Run SNIT WFS probe for Lisboa zone layer | Confirms whether categoria de espaço is a queryable structured attribute | ~0.5 dev-days |
| Confirm Lisbon CML 3D model redistribution licence (`geodados-cml.hub.arcgis.com`) | Unblocks LOD2/3 context layer; no direct zoning rate impact | ~0.25 dev-days |
| Read PDM Lisboa regulamento: source full categoria list + altura da edificação definition + índice + afastamentos per categoria | First Lisboa-specific numeric values; required for any pack | ~2–4 dev-days (after PDM revision status confirmed) |
| Draft C58 `transferableRights` overlay type amendment (for créditos de construção) | Required before any Lisboa pack can correctly represent achievable FAR | ~1 dev-day (ADR + schema) |
| Build/reuse OCR pipeline + L-449 gate for PDM PDF extraction | Required to serve any extracted value at `confidence: structured` | High — shared with PT national effort |

---

*Last updated: 2026-07-24. Legal structure characterised at country level; no Lisboa-specific live
probe run; PDM text not read; cadastral regime unconfirmed. Créditos de construção and seismic-risk
overlay documented but not spatially sourced. CML 3D model licence unverified.
Maintainer: UNASSIGNED.*
