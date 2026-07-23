# Data Readiness Rate — Paris (75056)

**Headline rate: ~35%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a complete, machine-readable answer (zone code + height + coverage) without reading a PDF or graphic plan.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| **Paris** | **~35%** |
| France (national average) | ~22% |

Paris is the **best-positioned French city** for machine-readable building rules, due to three purpose-built GIS height layers published on `opendata.paris.fr`. It still sits well below Denmark and Madrid because height is coded (not numeric) in the primary layer, emprise au sol is PDF-only, and setback rules require reading the PLU bioclimatique règlement.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Full | IGN PCI Express — `apicarto.ign.fr/api/cadastre` | **100%** |
| Zone code | ✅ Full | GPU WFS / `apicarto.ign.fr/api/gpu/zone-urba` — returns UG, UGSU, UV, N etc. | **100%** |
| FAR / COS | ✅ N/A | Abolished — loi ALUR 2014. Definitively "n/a". | **100% (N/A)** |
| Height — zone-level ceilings | ✅ Partial | `plub_hauteur` — 116 records, **absolute metres** (e.g. 25 m), arrondissement-level zones. Live-confirmed 2026-07-23. | **~15%** (116 zone polygons across a city of 20,000+ parcels — covers specific height-capped sectors only) |
| Height — NGF absolute maxima | ✅ Partial | `plub_hmc` — 47 records, **NGF altitude** (e.g. 85 m, 67 m). Towers and major landmarks only. | **~3%** (very narrow scope) |
| Height — gabarit-enveloppe (primary layer) | ⚠️ Coded | `plub_filet` — 20,644 records, field `haut` = **letter code** (M, K, C, B, G confirmed). Letter maps to height-by-street-width ratio per PLU bioclimatique règlement UG.10. Machine-readable but NOT directly numeric — decoding table not yet in the system. | **~60%** (good coverage by street segment, but coded) → **~0% usable** until decoding table is read |
| Ground coverage (`emprise au sol`) | ❌ PDF | PLU bioclimatique règlement écrit — article UG.9. No GIS layer confirmed. | **~0%** |
| Setback / gabarit formula | ❌ PDF | PLU bioclimatique UG.6/UG.7/UG.10 — `H = P + 3.00 + D` formula. Requires reading the règlement verbatim. | **~0%** |
| SUP overlays (ABF) | ⚠️ Unconfirmed | GPU WFS `wfs_sup:assiette_sup_s` — layer listed in Capabilities; GetFeature returning Capabilities XML (endpoint issue). ABF sub-type code not yet confirmed. Paris has ~700 classified monuments → high ABF risk. | **~20%** (layer exists but not yet queryable) |
| Existing building heights | ✅ Full | BD TOPO® `hauteur` — live 2026-07-23: 5/5 non-null in 8th arr, values 9.5–21 m | **95%** |

**Composite score on the three critical parameters** (height numeric / coverage / setbacks): the `plub_hauteur` + `plub_hmc` cover a small fraction of Paris; `plub_filet` covers most street segments but is coded; for full parcel-level answers the decoding table is needed. Effective structured rate: **~35%** (zone + parcel + context buildings + partial coded height layers).

---

## Why Paris is above the national average

1. **Three purpose-built GIS height layers** exist and are live on `opendata.paris.fr` — no other French city has this equivalent.
2. **GPU WFS is fully functional** for zone identification and document linkage.
3. **BD TOPO non-null rate is confirmed** — context building heights are machine-readable.

## Why Paris is below Barcelona and Madrid

1. **`plub_filet` is coded, not numeric.** The primary height layer (20,644 records) stores a letter (M, K, C, B, G) that maps to a height formula. Until PLU bioclimatique UG.10 is read and the decoding table built into the system, this layer cannot return a parcel-ready height number.
2. **Emprise au sol is PDF-only.** No GIS layer for ground coverage has been found.
3. **The gabarit formula is complex.** Paris uses a reference-surface + gabarit-enveloppe system (ADR-0274) rather than a simple table. The formula `H = P + 3.00 + D` (where D = street width) is stated in text, not a GIS attribute.
4. **PSMV and ABF overlays** are not yet confirmed as machine-queryable — both carry significant derogating risk in Paris's historic core.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Read PLU bioclimatique UG.10 — extract `haut` letter decoding table | +20 pp (converts `plub_filet` from coded to numeric) | Low — one PDF section |
| Read UG.9 (emprise au sol) verbatim | +8 pp | Low |
| Read UG.6/7 (setbacks) verbatim | +5 pp | Low |
| Fix GPU WFS `wfs_sup:assiette_sup_s` GetFeature | +3 pp (ABF overlay confirmed) | Low |
| GPU `zone-urba` response for a specific Paris parcel | Confirms partition + idurba for the PLU bioclimatique | Low |

**Realistic ceiling after PDF reading: ~55–60%**. The remaining gap is the gabarit formula complexity (ADR-0274 engine required) and PSMV/ABF overlay risk.

---

*Last updated: 2026-07-23. Three opendata.paris.fr height layers live-confirmed; `plub_filet` haut codes M/K/C/B/G confirmed in second probe 2026-07-23.*
