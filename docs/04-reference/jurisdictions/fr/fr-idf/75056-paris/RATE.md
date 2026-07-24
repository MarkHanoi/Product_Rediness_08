# Data Readiness Rate — Paris (`75056`) city

**Headline rate: ~35%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> Paris's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Lyon Métropole | ~42% |
| **Paris** | **~35%** |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| Marseille / AMP T1 | ~18% |

Paris is the **second-highest-rated French city** in this study — above the national average (~22%)
and above Marseille (~18%), but below Lyon (~42%). It scores higher than the national average
because three purpose-built GIS height layers exist and are live on `opendata.paris.fr` — no other
French city has this equivalent. It still sits below Barcelona (~48%) and well below Denmark (~96%)
because the primary height layer is coded (letter codes, not metres), emprise au sol is PDF-only,
and the gabarit formula requires a new engine KIND to compute.

**Why Paris differs from the national average (~22%):**
Paris has ~3 dedicated height GIS layers published by the city, where the national average is near
zero structured height fields. The ~35% reflects zone + parcel (100% each) + coded height coverage
via `plub_filet` (useful once decoded) + confirmed existing building heights via BD TOPO.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Full | IGN PCI Express — `apicarto.ign.fr/api/cadastre` | ~100% |
| Zone code | ✅ Full | GPU WFS / `apicarto.ign.fr/api/gpu/zone-urba` — returns UG, UGSU, UV, N | ~100% |
| FAR / COS | ✅ N/A — definitively abolished | Abolished — loi ALUR 2014. Definitively "n/a" for every Paris parcel. | 100% (N/A is the correct answer) |
| Height — zone-level ceilings | ✅ Partial | `plub_hauteur` (opendata.paris.fr) — 116 records, absolute metres (e.g. 25 m), arrondissement-level zones. VERIFIED LIVE 2026-07-23. | ~15% (116 zone polygons across a city of 20,000+ parcels — covers specific height-capped sectors only) |
| Height — NGF absolute maxima | ✅ Partial | `plub_hmc` — 47 records, NGF altitude (e.g. 85 m, 67 m). Towers and major landmarks only. | ~3% (very narrow scope) |
| Height — gabarit-enveloppe (primary layer) | ⚠️ Coded, not numeric | `plub_filet` — 20,644 records, field `haut` = letter code (M, K, C, B, G confirmed). Maps to height formula per PLU bioclimatique UG.10. Machine-readable but NOT directly numeric — decoding table not yet in system. | ~60% coverage → ~0% usable until UG.10 decoding table read |
| Ground coverage (`emprise au sol`) | ❌ PDF | PLU bioclimatique règlement écrit — article UG.9. No GIS layer confirmed. | ~0% |
| Setback / gabarit formula | ❌ PDF | PLU bioclimatique UG.6/UG.7/UG.10 — `H = P + 3.00 + D` formula. Requires reading the règlement verbatim. | ~0% |
| SUP overlays (ABF) | ⚠️ Unconfirmed | GPU WFS `wfs_sup:assiette_sup_s` — layer listed in Capabilities; GetFeature returning Capabilities XML (endpoint issue). ABF sub-type code not confirmed. Paris has ~700 classified monuments → high ABF exposure. | ~20% (layer exists; not yet queryable per parcel) |
| Existing building heights | ✅ Full | BD TOPO® `BATIMENT.hauteur` — VERIFIED LIVE 2026-07-23: 5/5 non-null in Paris 8th arr., values 9.5–21 m | ~95% |

---

## The structural gap

Paris's gap from Denmark (~96%) is driven by a single structural fact: **height in Paris is not a
lookup table — it is a two-layer geometric construction**. The PLU bioclimatique uses:

1. A computed **"surface de nivellement de l'îlot"** (block-level leveling surface) as the height
   datum — not street level, not sea level, but a derived geometric construction from the block
   ring. This surface must be computed, not looked up.
2. A **gabarit-enveloppe formula** governing how the building fills its ceiling: `H = P + 3.00 + D`
   at the side boundary (P = prospect distance, D ≤ 6 m), and `H = P + 4.00` with a 1:1 oblique
   for vis-à-vis facades.

Neither of these is a numeric field in an API — the `plub_filet` layer stores the result of the
first step as a letter code (M/K/C/B/G), and the gabarit formula is in the PLU text. **No French
city generalises to Paris's mechanism, and Paris's mechanism generalises to no other city.** A new
engine KIND (ADR-0274, reference-surface + gabarit) is required before any Paris parcel-level
height fill is possible.

The `plub_filet` coded layer (20,644 records, ~60% coverage by street segment) is the largest
piece of structured data in Paris's pack — but it is currently producing ~0% usable fills because
the decoding table (PLU bioclimatique UG.10) has not been read and ingested. This is the highest-
value single action for Paris: one PDF section read → +20 pp.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Read PLU bioclimatique UG.10 — extract `haut` letter decoding table (M/K/C/B/G → height formula) | +20 pp — converts `plub_filet` from coded to usable | Low — one PDF section |
| Read UG.9 (emprise au sol) verbatim | +8 pp | Low |
| Read UG.6/7 (implantation/setback formulas) verbatim | +5 pp | Low |
| Fix GPU WFS `wfs_sup:assiette_sup_s` GetFeature endpoint | +3 pp — ABF overlay confirmed | Low |
| Build ADR-0274 reference-surface + gabarit engine KIND | Prerequisite for `plub_filet` computed outputs — enables the gabarit formula to produce a parcel-level height number | High — 4–5 dev-days for the ADR; 10–12 for implementation |
| Probe whether the "plan des hauteurs" is published as a queryable GIS layer or PDF plates only | Resolves a ±6–8 dev-day uncertainty in the hauteur plafond ingestion path | Low — one direct URL probe |

**Realistic ceiling after PDF reading and ADR-0274 implementation: ~55–60%.** The remaining gap
is the gabarit formula complexity (ADR-0274 KIND required) and PSMV/ABF overlay risk in the historic
core.

---

*Last updated: 2026-07-24. Three opendata.paris.fr height layers VERIFIED LIVE (2026-07-23):
`plub_hauteur` (116 records, absolute metres), `plub_hmc` (47 records, NGF altitude), `plub_filet`
(20,644 records, haut codes M/K/C/B/G confirmed). BD TOPO® hauteur VERIFIED LIVE (2026-07-23).
GPU zone_urba confirmed live for Paris. Emprise au sol, setbacks, gabarit formula: PDF-only.
Maintainer: UNASSIGNED.*
