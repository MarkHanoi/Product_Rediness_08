# Data Readiness Rate — Porto (`pt-13 / 1315-porto`) city

**Headline rate: ~0%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

> **Why ~0%:** Porto's numeric planning values (índice de edificação, cércea / moda da cércea,
> afastamentos) live in the PDMP regulamento (Aviso n.º 12773/2021) — PDF only. No SNIT WFS probe
> has been run, no PDMP text has been read for any category, and Porto's cadastral regime is
> unconfirmed. Additionally, Porto's fabric-derived height rule (moda da cércea) requires a new
> C58 `fabricDerivedHeight` GeometricRule kind that does not yet exist — so even with a complete
> OCR pipeline, moda-da-cércea zones cannot be packed until the schema amendment is approved.

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
| **Porto** | **~0%** |

> Porto matches the national ~0% floor. It does not rate higher because no live probe, no primary
> PDMP read, and no confirmed cadastral geometry exist. Moda da cércea zones cannot exceed ~0%
> even after OCR extraction, until the C58 `fabricDerivedHeight` kind is added.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ❌ not confirmed | Carta Cadastral (SNIC/DGT): Porto is north of the Tagus — CGPR coverage was concentrated south of the Tagus and on rural land. Whether Porto's urban core is inside CGPR, SiNErGIC, or no-cadastre coverage is unconfirmed. Do NOT assume coverage. Not probed. | 0 |
| Plan/zone existence + boundary | ⚠️ partial | SNIT (`snit-mais.dgterritorio.gov.pt`): PDMP zone polygon confirmed to exist in SNIT; WFS attributes not probed. PDMP in force (Aviso n.º 12773/2021, 8 Jul 2021); updated since. | 0 — not confirmed queryable |
| Zone/use code (categoria de espaço) | ❌ not confirmed | SNIT WFS — not probed. Art. 11 PDMP defines two urban space categories by degree of urbanisation; Art. 12-family defines functional categories. Structured WFS attribute delivery unconfirmed. | 0 |
| Density metric (índice de edificação) | ❌ PDF only | PDMP regulamento (Aviso 12773/2021) — PDF only. Porto uses "índice de edificação" (not "índice de utilização"). The definitional formula (what counts as "área de edificação") at PDMP Art. 11 has NOT been read — even the formula, not just the number, is per-PDM. No values sourced. | 0 — confirmed PDF-only |
| Max height (cércea / moda da cércea, ALLOWED) | ❌ PDF only + schema gap | PDMP regulamento — PDF only. Porto introduces "moda da cércea" — the cércea value with greatest linear extension along the urban front — a fabric-derived height rule that cannot be expressed by any existing C58 §2.2 GeometricRule kind. A C58 `fabricDerivedHeight` amendment is required before any moda-da-cércea zone can be packed, regardless of data availability. | 0 — PDF-only + engine blocker |
| Setback / alignment (afastamentos / recuos) | ❌ PDF only | PDMP regulamento — PDF only. No values sourced. Alignment-governed vs. setback-governed distinction NOT determined for any Porto PDM category (ADR-0270). | 0 |
| Building footprint + height (EXISTING, LOD1/2) | ⚠️ partial | BGE (INE, CC-BY-4.0): national building footprints; VERIFIED-LEAD, not probed. DGT LiDAR PRR 2024–25: nDSM height derivable; VERIFIED-LEAD, not probed. No Porto-specific municipal LOD2/3 dataset identified (unlike Lisbon's CML model). | VERIFIED-LEAD |
| Terrain (DTM/DSM) | ⚠️ partial | DGT LiDAR PRR 2024–25, DTM 50 cm + DSM 2 m; open; ~90% continental; `cdd.dgterritorio.gov.pt`; VERIFIED-LEAD, not probed | VERIFIED-LEAD |
| Heritage overlay | ⚠️ partial | DGPC Atlas (`patrimoniocultural.gov.pt`): ZGP/ZEP/ZNA layers; VERIFIED-LEAD. Porto Historic Centre (Ribeira/Barredo) is a UNESCO World Heritage Site with a DGPC ZEP overlay — extent and any ZNA sub-zones not sourced. | VERIFIED-LEAD — UNESCO ZEP extent unconfirmed |

---

## The structural gap

Porto's fill-rate limitation has the same two layers as the national position — PDF-only numeric
values and unconfirmed parcel geometry — plus a Porto-specific third:

**Layers 1 & 2 (shared with national):** Numeric planning values are PDF-only in the PDMP
regulamento; parcel geometry is unconfirmed because Porto is north of the Tagus and likely outside
the CGPR rural-focused cadastral coverage. No structured source for the fill-rate triplet (zone +
density + height) has been confirmed for any Porto parcel.

**Layer 3 — moda da cércea requires a new engine rule kind.** Porto's PDMP defines height through
"moda da cércea" — the cércea value with the greatest linear extension along a given urban front.
This is a **numeric but context-derived rule**: it is not a fixed table value, it is derived by
surveying the existing built fabric of the street. It sits between Barcelona's fixed
amplada-de-vial table and Germany's §34 "fits the character" discretion. No existing C58 §2.2
GeometricRule kind can express it. A `fabricDerivedHeight` kind must be added to C58 by ADR — this
is an engine change, not a data-sourcing step. Until the ADR is approved and implemented, Porto
moda-da-cércea zones cannot be packed at all, regardless of how well the data layer is sourced.

Additionally, the Porto Historic Centre (Ribeira/Barredo) UNESCO World Heritage ZEP overlay layers
on top of whichever PDM categoria applies underneath. The ZEP spatial extent and any ZNA (non-
aedificandi) sub-zones have not been sourced.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Confirm Porto cadastral regime (DICOFRE 1315) via DGT SNIC | Gate-unlocking — no parcel pipeline can start | ~0.25 dev-days |
| Run SNIT WFS probe for Porto zone layer | Confirms whether zona category is a queryable structured attribute | ~0.5 dev-days |
| Read PDMP Art. 11 from Aviso n.º 12773/2021: confirm índice de edificação formula + source numeric values per categoria | First Porto-specific verified values; partial unblock for non-moda-da-cércea zones | ~1–2 dev-days |
| Draft and approve C58 `fabricDerivedHeight` GeometricRule kind amendment | Unblocks ALL moda-da-cércea zones in Porto (and any future jurisdiction using fabric-derived height) | ~1 dev-day (ADR + schema); then pack authoring |
| Probe DGPC Atlas live: download Porto Historic Centre ZEP polygon + ZNA sub-zones | Heritage overlay for UNESCO area; surface zoning risk for Ribeira/Barredo | ~0.5 dev-days |
| Build/reuse OCR pipeline + L-449 gate for PDMP PDF extraction | Required to serve any extracted value at `confidence: structured` | High — shared with PT national |

---

*Last updated: 2026-07-24. Legal structure characterised at country level; no Porto-specific live
probe run; PDMP text not read; cadastral regime unconfirmed. Moda da cércea documented; C58
`fabricDerivedHeight` amendment required before moda-da-cércea zones can be packed.
Maintainer: UNASSIGNED.*
