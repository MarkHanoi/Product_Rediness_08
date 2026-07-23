# Data Readiness Rate — Lyon Métropole (69123)

**Headline rate: ~42%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a complete, machine-readable answer (zone code + height + coverage) without reading a PDF or graphic plan.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| **Lyon** | **~42%** |
| Paris | ~35% |
| France (national average) | ~22% |

Lyon is the **highest-rated French city** in this study. The `data.grandlyon.com` `pluhauteur` layer provides **absolute metre height values** directly queryable via WFS — a genuinely structured, numeric, immediately usable height source with no decoding step required. This is qualitatively different from Paris (coded letters) and Marseille (graphic-primacy).

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Full | IGN PCI Express — `apicarto.ign.fr/api/cadastre` | **100%** |
| Zone code | ✅ Full | GPU WFS + `data.grandlyon.com` `pluzone` layer (`zonage` field: UEi2, URm1, UL, UPr, etc.) | **100%** |
| FAR / COS | ✅ N/A | Abolished — loi ALUR 2014. Definitively "n/a". | **100% (N/A)** |
| **Max height** | ✅ **Direct numeric** | `data.grandlyon.com` `plu_h_opposable.pluhauteur` — field `hauteur` (absolute metres, e.g. "16"). Live 2026-07-23 (last_update_fme: 2026-04-23). **No decoding step required.** | **~60%** (layer exists and is numeric; coverage across all Lyon PLU-H communes and % of parcels covered not yet confirmed — null rate unprobed) |
| Ground coverage (`emprise au sol` / CES) | ❌ Confirmed null | `pluzone` layer has `ces`, `ces_bande_principale`, `ces_bande_secondaire` fields — **all confirmed NULL across 10 diverse zone types** (UEi2, URm1, UL, UPr, UCe2a, UEi1, USP, N2) in live probe 2026-07-23. | **~0%** |
| Height — band-specific | ❌ Confirmed null | `pluzone` layer has `hauteur_bande_principale`, `hauteur_bande_secondaire` — **all confirmed NULL** across same 10 zones. | **~0%** (null in structured layer; may be in règlement PDF) |
| Setback rules | ❌ PDF | PLU-H règlement écrit — article series. Not in any confirmed GIS layer. | **~0%** |
| PLU-H document URL | ✅ Full | `pludocumentcommune` layer — `url_documents_plu_commune` field (e.g. `pluh.grandlyon.com/plu.php?select_commune=LYON5E`). | **100%** (document link, not numeric rule) |
| SUP overlays (ABF, etc.) | ⚠️ GPU only | GPU WFS `wfs_sup:assiette_sup_s` — GetFeature issue (same as nationally). | **~20%** |
| Existing building heights | ✅ Full | BD TOPO® `hauteur` — national, confirmed non-null | **90%** |

---

## Why Lyon outperforms Paris and Marseille

The `pluhauteur` layer is a **Tier 2 data source** that doesn't exist anywhere else at this granularity in France. It provides:
- A WFS endpoint directly queryable by BBOX or commune
- The `hauteur` field as a **string representing absolute metres** (not a coded letter, not a formula variable)
- Regular update cadence: last_update_fme 2026-04-23

This is as close to "structured" as any French city gets for height. The layer represents the "Périmètres de hauteurs de façades" concept from the PLU-H règlement as a GIS overlay.

## Why Lyon is still below ~48% (Barcelona ceiling)

1. **`pluhauteur` null-rate unknown.** The layer is confirmed live and has non-null values in its sampled records, but the fraction of all Lyon-area parcels that fall inside a `pluhauteur` polygon is unknown. If coverage is 30%, the effective height fill rate is 30%, not 60%.
2. **CES (emprise au sol) is confirmed null** in `pluzone` — the layer has the right schema but stores no values. Emprise must come from the PDF règlement.
3. **`hauteur_bande_principale`/`hauteur_bande_secondaire` also null** — bande principale/secondaire height differentiation exists in the règlement but is not surfaced in the GIS.
4. **Lyon vs Villeurbanne split** — whether the `pluhauteur` coverage regime differs between Lyon city, Villeurbanne, and the 56 outer communes is not yet probed.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe `pluhauteur` null rate — GetFeature count for full Lyon bbox vs total parcel count | Confirms the true coverage fraction (may raise or lower the ~60% height score) | Low — one WFS count query |
| Probe `pluhauteur` for Lyon 1er/2e arrondissement parcel — confirm Lyon city centre coverage | Confirms whether Lyon's specific height overlay applies | Low |
| Read PLU-H règlement for a sample zone — extract CES value | +10 pp on emprise (but only for that zone, manually) | Medium |
| Probe GPU zone-urba for a Lyon parcel — get idurba and règlement PDF link | Enables règlement PDF download for further PDF-gated fields | Low |

**Realistic ceiling after coverage confirmation and key PDF reads: ~55–65%.**

Lyon could reach near-Barcelona levels if the `pluhauteur` coverage fraction turns out to be high (>70% of parcels) and a PDF-reading programme covers the CES and setback articles for the main zone types.

---

*Last updated: 2026-07-23. `pluhauteur` confirmed live (absolute metres). `pluzone` height fields confirmed null across 10 zone types.*
