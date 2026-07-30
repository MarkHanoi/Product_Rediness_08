# Data Readiness Rate — Marseille / AMP Territoire 1 (`13055`) city

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: ~18%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> Marseille's open-data infrastructure.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Lyon Métropole | ~42% |
| Paris | ~35% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Marseille / AMP T1** | **~18%** |

Marseille is the **lowest-rated city** in this study. It sits below the national average (~22%)
despite having excellent GPU WFS zone coverage because the PLUi Territoire 1 establishes a
**graphic-primacy rule** — the règlement graphique (the drawing) overrides the règlement écrit
(the text) for height. The authoritative source for height on most Marseille parcels is not a
table or a GIS attribute but a zoning plan drawing, creating a structural barrier equivalent to
the Barcelona Pla Parcial height wall.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Full | IGN PCI Express — `apicarto.ign.fr/api/cadastre` | ~100% |
| Zone code | ✅ Full | GPU WFS (`data.geopf.fr/wfs?...&apikey=gpu`) VERIFIED LIVE 2026-07-23 — returns `libelle` (e.g. "UAe4", "UEc2", "UEsN1"), `libelong` (description), `typezone` | ~100% |
| Zone description | ✅ Full | GPU `libelong` field — e.g. "Centre-ville de Marseille en évolution" for UAe4 | ~100% |
| FAR / COS | ✅ N/A — definitively abolished | Abolished — loi ALUR 2014. Definitively "n/a" for every Marseille parcel. | 100% (N/A is the correct answer) |
| Règlement PDF link | ✅ Full | GPU `urlfic` field — direct PDF URL with page anchor: `https://plui.ampmetropole.fr/assets/documents/PLUi_CT1_L_Reglement.pdf#page=N`. VERIFIED LIVE 2026-07-23 (UAe4 → p.80, UEc2 → p.248, UQG → p.328, UEsN1 → p.274). | ~100% (link to PDF; not a numeric rule) |
| Max height | ❌ Graphic-primary | PLUi Territoire 1 règlement states explicitly: *"le règlement graphique prime sur le règlement écrit des zones."* GPU `zone_urba` schema has no height attributes (schema confirmed 2026-07-23). Height is on the graphic plan — a drawing. `sig.ampmetropole.fr` graphic layer machine-readability NOT YET CONFIRMED. | ~0–5% |
| Ground coverage (`emprise au sol`) | ❌ PDF | Règlement écrit — not in GPU WFS schema. | ~0% |
| Setback rules | ❌ PDF | Règlement écrit. | ~0% |
| Euroméditerranée OIN (Article 29) | ❌ Not yet confirmed | OIN Euroméditerranée (EPAEM) has derogating rules. Boundary GIS layer not yet found. | ~0% |
| SUP overlays (ABF, PSMV) | ⚠️ GPU only | GPU WFS `wfs_sup:assiette_sup_s` — GetFeature endpoint issue nationally; ABF sub-type not confirmed. PSMV (Vieux-Port / Panier) not confirmed in GPU. | ~15% |
| Existing building heights | ✅ Full | BD TOPO® `BATIMENT.hauteur` — national | ~90% |

---

## The structural gap

Marseille's gap from the national average (~22%) and from all other studied cities is caused by a
single explicit legal choice in the PLUi règlement: **the graphic plan is the primary source; the
written text is the fallback**. The règlement states verbatim: *"le règlement graphique prime sur
le règlement écrit des zones. Ainsi, à défaut d'indication sur le règlement graphique, c'est le
règlement écrit des zones qui s'applique."*

This creates the same structural ceiling as Barcelona's Pla Parcial height-on-plànol situation:
- A text-pull of the PDF règlement écrit yields the written height article (e.g. "zone UA: max
  R+4–6 storeys"). This is the fallback — the legally correct answer only where the graphic plan
  is silent.
- The graphic plan is the binding source for all other parcels. Without machine-reading the graphic
  plan, any height extracted from the written règlement is **potentially wrong** for any specific
  parcel.
- Whether the graphic plan is published as a machine-readable GIS layer or as scanned PDF plates is
  **NOT YET CONFIRMED** — this single probe determines whether the Marseille ceiling is ~20–25%
  (written fallback only, graphic-primacy flag) or ~45–55% (machine-readable graphic layer).

The **Euroméditerranée OIN** (EPAEM) is a state-led development zone inside Marseille with
derogating rules (analogous to Barcelona clau 18). Its boundary layer has not been found. Until
found and integrated, any parcel inside the OIN receives the wrong PLUi rules — this is a silent
accuracy risk, not a coverage gap.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe `sig.ampmetropole.fr` / AMP geoserver for graphic règlement vector layer machine-readability | +20 pp if machine-readable GIS layer confirmed — transforms Marseille ceiling from ~20–25% to ~45–55% | Medium — one API probe + schema inspection |
| Read PLUi Territoire 1 dispositions générales — confirm graphic-primacy text verbatim; record clause citation in `sources/SOURCES.md` | Required before any height can be shipped — converts "corroborated" to "VERIFIED" for the graphic-primacy rule itself | Low — one PDF section |
| Read zones UA and UB written height articles from the règlement écrit (fallback only) | +5 pp (written-règlement fallback tier for parcels where graphic plan is silent) | Low |
| Probe EPAEM for Euroméditerranée OIN boundary GIS layer | Closes the silent-accuracy risk for OIN-interior parcels; enables explicit refusal for derogating-rule zone | Medium |
| Fix GPU WFS `wfs_sup:assiette_sup_s` GetFeature nationally | Closes the ABF overlay gap for Marseille (high heritage density in the historic core) | Low |

### Ceiling analysis

| Path | Full-envelope ceiling |
|---|---|
| Written règlement fallback only (graphic plan not machine-readable) | ~20–25% |
| Machine-readable graphic layer confirmed on `sig.ampmetropole.fr` | ~45–55% |

The graphic-primacy rule makes Marseille architecturally closer to Barcelona's Pla Parcial problem
than to Lyon or Paris. The correct sequencing is to confirm the graphic layer's machine-readability
**before** committing any implementation resources — the answer to that probe determines whether
Marseille is a medium-cost or high-cost city.

---

*Last updated: 2026-07-24. GPU WFS `zone_urba` VERIFIED LIVE 2026-07-23 (23 features in bbox for
Marseille; full schema including `urlfic` with page anchors confirmed for UAe4, UEc2, UQG, UEsN1).
GPU schema has no height attributes (confirmed). `sig.ampmetropole.fr` graphic layer machine-
readability: NOT YET CONFIRMED — the ceiling-determining probe. Euroméditerranée OIN boundary layer:
NOT YET FOUND. Maintainer: UNASSIGNED.*
