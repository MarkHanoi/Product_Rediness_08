# Data Readiness Rate — Marseille / AMP Territoire 1 (13055)

**Headline rate: ~18%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a complete, machine-readable answer (zone code + height + coverage) without reading a PDF or graphic plan.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Lyon | ~42% |
| Paris | ~35% |
| France (national average) | ~22% |
| **Marseille** | **~18%** |

Marseille is the **lowest-rated city** in this study. The PLUi Territoire 1 establishes a **graphic-primacy rule** — the règlement graphique (the drawing) overrides the règlement écrit (the text) for height. This means the authoritative source for height on most Marseille parcels is not a table or a GIS attribute but a zoning plan drawing, creating a structural barrier equivalent to the Barcelona Pla Parcial height wall.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Full | IGN PCI Express — `apicarto.ign.fr/api/cadastre` | **100%** |
| Zone code | ✅ Full | GPU WFS (`data.geopf.fr/wfs?...&apikey=gpu`) confirmed live 2026-07-23 — returns `libelle` (e.g. "UAe4", "UEc2", "UEsN1"), `libelong` (description), `typezone` | **100%** |
| Zone description | ✅ Full | GPU `libelong` field — e.g. "Centre-ville de Marseille en évolution" for UAe4 | **100%** |
| FAR / COS | ✅ N/A | Abolished — loi ALUR 2014. Definitively "n/a". | **100% (N/A)** |
| Règlement PDF link | ✅ Full | GPU `urlfic` field — **direct PDF URL with page anchor**: `https://plui.ampmetropole.fr/assets/documents/PLUi_CT1_L_Reglement.pdf#page=N`. Confirmed live 2026-07-23 (zone UAe4 → p.80, UEc2 → p.248, UQG → p.328, UEsN1 → p.274). | **100%** (link, not numeric rule) |
| **Max height** | ❌ Graphic-primary | PLUi Territoire 1 declares: *"le règlement graphique prime sur le règlement écrit des zones."* GPU `zone_urba` schema has **no height attributes** (confirmed). Height is on the graphic plan — a drawing, not a GIS attribute. AMP `sig.ampmetropole.fr` graphic layer machine-readability **not yet confirmed**. | **~0–5%** |
| Ground coverage (`emprise au sol`) | ❌ PDF | Règlement écrit — not in GPU WFS schema. | **~0%** |
| Setback rules | ❌ PDF | Règlement écrit. | **~0%** |
| Euroméditerranée OIN | ❌ Not yet confirmed | OIN Euroméditerranée (EPAEM) has derogating rules (Article 29). Boundary GIS layer not yet found. | **~0%** |
| SUP overlays (ABF, PSMV) | ⚠️ GPU only | GPU WFS `wfs_sup:assiette_sup_s` — GetFeature endpoint issue; sub-type not confirmed. PSMV (Vieux-Port / Panier area) not confirmed in GPU. | **~15%** |
| Existing building heights | ✅ Full | BD TOPO® `hauteur` — national | **90%** |

---

## The graphic-primacy structural barrier

The PLUi Territoire 1 règlement states explicitly that the graphic plan is the **primary source** and the written règlement is only a fallback. This creates the same structural ceiling as Barcelona's Pla Parcial height-on-plànol situation:

- A text-pull of the PDF règlement écrit yields the written height article (e.g. "zone UA: max 25 m")
- BUT this number is legally superseded anywhere the graphic plan shows otherwise
- Without machine-reading the graphic plan, any height extracted from the written règlement is **potentially wrong** for any specific parcel

This is why the rate is **below the national average** despite Marseille having excellent GPU WFS coverage for zone identification.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe `sig.ampmetropole.fr` or AMP geoserver for graphic règlement vector layer | +20 pp if a machine-readable graphic layer exists | Medium |
| Read PLUi Territoire 1 dispositions générales — confirm graphic-primacy text verbatim | Required before any height can be shipped; currently "corroborated" not "verified" | Low — one PDF section |
| Read zones UA and UB written height articles from the règlement écrit | +5 pp (written-règlement fallback tier only; graphic primacy still applies) | Low |
| Probe EPAEM for Euroméditerranée OIN boundary GIS layer | Confirms whether OIN derogation applies to a given parcel | Medium |

**Realistic ceiling:**
- If `sig.ampmetropole.fr` provides a machine-readable graphic layer: **~45–55%**
- If graphic layer is raster-only (like Barcelona's plànols): **~20–25%** (zone-level text fallback only)
- The graphic-primacy rule makes Marseille architecturally closer to Barcelona than to Lyon or Paris.

---

*Last updated: 2026-07-23. GPU WFS zone_urba confirmed live for Marseille (23 features in bbox; full schema including `urlfic` with page anchors confirmed). `sig.ampmetropole.fr` not yet probed.*
