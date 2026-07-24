# Data Readiness Rate — Lyon Métropole (`69123`) city

**Headline rate: ~42%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> Lyon's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| **Lyon Métropole** | **~42%** |
| Paris | ~35% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| Marseille / AMP T1 | ~18% |

Lyon is the **highest-rated French city** in this study. The `data.grandlyon.com` `pluhauteur` layer
provides **absolute metre height values** directly queryable via WFS — a genuinely structured,
numeric, immediately usable height source with no decoding step required. This is qualitatively
different from Paris (coded letters requiring an ADR-0274 engine KIND) and Marseille (graphic-
primacy over the written règlement). Lyon is the cheapest implementation path among the three
studied French cities and the recommended starting point.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Full | IGN PCI Express — `apicarto.ign.fr/api/cadastre` | ~100% |
| Zone code | ✅ Full | GPU WFS + `data.grandlyon.com` `pluzone` layer (`zonage` field: UEi2, URm1, UL, UPr, UCe2a, etc.) | ~100% |
| FAR / COS | ✅ N/A — definitively abolished | Abolished — loi ALUR 2014. Definitively "n/a" for every Lyon parcel. | 100% (N/A is the correct answer) |
| Max height | ✅ Direct numeric | `data.grandlyon.com` `plu_h_opposable.pluhauteur` — field `hauteur` as absolute metres (e.g. "16"). VERIFIED LIVE 2026-07-23 (last_update_fme: 2026-04-23). **No decoding step required.** | ~60% (layer is live and numeric; fraction of all Lyon parcels covered — null rate across full bbox — not yet confirmed) |
| Height — bande principale / secondaire | ❌ Confirmed null | `pluzone` fields `hauteur_bande_principale`, `hauteur_bande_secondaire` — confirmed NULL across 10 diverse zone types (UEi2, URm1, UL, UPr, UCe2a, UEi1, USP, N2). VERIFIED 2026-07-23. | ~0% (schema exists; values absent; may be in règlement PDF) |
| Ground coverage (`emprise au sol` / CES) | ❌ Confirmed null | `pluzone` fields `ces`, `ces_bande_principale`, `ces_bande_secondaire` — confirmed NULL across same 10 zone types. VERIFIED 2026-07-23. | ~0% |
| Setback rules | ❌ PDF | PLU-H règlement écrit — article series. Not in any confirmed GIS layer. | ~0% |
| PLU-H document URL | ✅ Full | `pludocumentcommune` — `url_documents_plu_commune` field (e.g. `pluh.grandlyon.com/plu.php?select_commune=LYON5E`) | ~100% (document link; not a numeric rule) |
| SUP overlays (ABF, etc.) | ⚠️ GPU only | GPU WFS `wfs_sup:assiette_sup_s` — GetFeature endpoint issue (same as nationally). | ~20% |
| Existing building heights | ✅ Full | BD TOPO® `BATIMENT.hauteur` — national, confirmed non-null | ~90% |

---

## The structural gap

Lyon's gap from Denmark (~96%) has two components. The first is partially closable; the second is
structural.

**Closable gap — `pluhauteur` coverage confirmation and emprise-from-PDF:**
The `pluhauteur` layer is confirmed live and numeric, but the fraction of Lyon's parcels that fall
inside a `pluhauteur` polygon is unconfirmed. If coverage is 70%, the effective height fill is
~70% not ~60%. If it is 30%, the rate is lower. **This is the single most important remaining
probe for Lyon** — one WFS count query against the full Lyon bbox resolves it.

Emprise au sol (CES) and setbacks are in the PLU-H règlement PDFs, one document, one sourcing
effort — a per-zone transcription task covering the main zone families (UCe, UEi, URm) adds ~10 pp.

**Structural gap — Lyon and Villeurbanne height-perimeter overlay:**
The PLU-H règlement uses separate "périmètres de hauteurs de façades" overlay zones for Lyon city
and Villeurbanne — NOT the `pluhauteur` polygon attribute used for the 56 outer communes. This is
a structural exception inside the same PLUi document: two communes inside a 58-commune document use
a different height mechanism. Implementing the Lyon/Villeurbanne overlay join is an independent data-
layer integration task (~8–10 dev-days), not a config change to the outer-commune attribute path.

**Whether `pluhauteur` attributes appear on the national GPU WFS** (rather than only on
`data.grandlyon.com`) is the critical unresolved pre-implementation probe. If GPU carries them →
config-only implementation. If only `data.grandlyon.com` carries them → second data-source
integration required.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe `pluhauteur` null rate — WFS count for full Lyon bbox vs parcel count | Confirms the true height-coverage fraction; may raise the ~60% height sub-score significantly | Low — one WFS count query |
| Probe `pluhauteur` for Lyon 1er/2e arrondissement parcel — confirm Lyon city-centre coverage vs outer-commune coverage | Confirms whether the overlay-zone exception applies only to core Lyon/Villeurbanne or more broadly | Low |
| Confirm whether `HBCPRINC`/`HBCSEC`/`PLAFOND` appear on the national GPU WFS or only on `data.grandlyon.com` | Determines the implementation path (config vs second data-source integration) | Low — one GPU WFS GetFeature for a Lyon parcel |
| Read PLU-H règlement for a sample zone (e.g. UCe1a) — extract CES value verbatim | +10 pp on emprise (manually, for that zone family) | Medium |
| Probe GPU zone-urba for a Lyon parcel — get `idurba` and règlement PDF link | Enables règlement PDF download for CES and setback sourcing | Low |

**Realistic ceiling after coverage confirmation and key PDF reads: ~55–65%.** Lyon could reach near-
Barcelona levels if the `pluhauteur` coverage fraction turns out to be high (>70% of parcels) and a
PDF-reading programme covers the CES and setback articles for the main zone families.

---

*Last updated: 2026-07-24. `pluhauteur` VERIFIED LIVE 2026-07-23 (absolute metres; last_update_fme
2026-04-23). `pluzone` height + CES fields confirmed NULL across 10 zone types 2026-07-23. GPU zone
identification confirmed. `pluhauteur` null rate across full bbox: NOT YET PROBED — the single
most important remaining probe. Maintainer: UNASSIGNED.*
