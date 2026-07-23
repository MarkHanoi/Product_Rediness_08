# France (`fr`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `FR` · **Join key:** INSEE commune code (5 digits) ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — implementation pipeline ready

> **This file is the country-level umbrella.** Municipality-level packs live under
> `fr/<region>/<INSEE>-<slug>/`. The national data-source layer is fully characterised;
> no rule pack is implemented yet.

---

## 1 — What governs here (national structure)

### 1.1 Legal hierarchy

```
Constitution → Code de l'urbanisme (national statute)
  → RNU (Règlement National d'Urbanisme) — default where no local plan exists
  → PLU / PLUi (Plan Local d'Urbanisme, communal or intercommunal) — operative for most communes
    → règlement écrit (prose PDF per commune/EPCI)
    → règlement graphique (zoning map — LEGALLY PRIMACY in Marseille/AMP)
  → PSMV (Plan de Sauvegarde et de Mise en Valeur) — historic centres overlay
  → SUP (Servitudes d'Utilité Publique) — flood zones, aviation, heritage perimeters
```

Since **loi ALUR (2014)**, the **COS (coefficient d'occupation des sols — FAR)** was **abolished nationwide**. There is no FAR in any current French zone. Density is governed exclusively by height + footprint (emprise au sol) + setbacks. Write `n/a — abolished nationwide (loi ALUR 2014)` for every French pack's FAR field, not `not derived` — the distinction matters (absence of law vs gap in our engine).

Since **1 January 2023**, publication on **GPU (Géoportail de l'Urbanisme)** makes a PLU/SCoT legally executory (ordonnance n° 2021-1310). This is also our access point.

### 1.2 The headline structural finding

**There is no national height table for France.** Every one of ~34,900 communes (or ~1,200 intercommunal EPCI) writes its own règlement with its own zone codes and its own numeric parameters for hauteur maximale, emprise au sol, and retraits. Zone letter `UA` in one commune and `UA` in a neighbouring one are independent local mnemonics — there is no cross-commune lookup table.

This is categorically different from Barcelona (one PGM, one text, shared machinery across all zones). The correct unit of sourcing work is one commune's or one EPCI's règlement PDF, not one national document.

**The three large metros studied (Paris, Lyon, Marseille) use three structurally different height mechanisms** — not different numbers in the same mechanism, but different software problems. See `findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md`.

### 1.3 Height mechanism taxonomy (critical — read before scoping any French city)

| City / EPCI | Height mechanism | New engine kind? |
|---|---|---|
| **Paris** | Graphic "plan des hauteurs" sets a ceiling per sector, measured from a **computed block-level leveling surface** (surface de nivellement de l'îlot); then a **gabarit-enveloppe formula** (H = P + 3.00 + D) governs fill relative to street/neighbours | **YES** — reference-surface + relative-formula gabarit |
| **Lyon Métropole** | Structured GIS attribute on zoning polygon (`HBCPRINC`/`HBCSEC`/`PLAFOND`); **exception**: Lyon + Villeurbanne use separate "périmètres de hauteurs de façades" overlay | **PARTIAL** — config for outer communes; new overlay join for core 2 |
| **Marseille/AMP** | Graphic layer wins; written article is fallback only ("le règlement graphique prime sur le règlement écrit") | **YES** — precedence-resolution logic: graphic-first, written-fallback |

Do not assume the Lyon structured-attribute pattern generalises to Paris or Marseille. That is the C58 §1.11 flattening error.

---

## 2 — National data sources (one API, works identically everywhere in France)

| Layer | Source | API | Licence | Status |
|---|---|---|---|---|
| Cadastral parcels | IGN **Parcellaire Express (PCI)** | WFS `data.geopf.fr/wfs` or `apicarto.ign.fr/api/cadastre` | Open (Etalab 2.0) | **VERIFIED-LEAD** — same bbox/WFS pattern as Spanish `cp:CadastralParcel` |
| Alternative parcels | **cadastre.data.gouv.fr** (Etalab/DGFiP) | Bulk GeoJSON/Shapefile per commune | Open (ODbL) | Same underlying DGFiP source |
| Zoning (PLU/PLUi/POS/RNU) | **GPU** (Géoportail de l'Urbanisme) | WFS `data.geopf.fr/annexes/ressources/wfs/gpu.xml` (5,000 obj/req cap) or `apicarto.ign.fr/api/gpu` | Open | **VERIFIED-LEAD** — returns zone code, document name/date, PDF link, SUP acts |
| Zoning bulk | GPU ATOM feed | Weekly GeoPackage by layer | Open | Alternative to WFS for large-area ingestion |
| Context buildings + height | IGN **BD TOPO®** (`BATIMENT` + `HAUTEUR` field) | WFS `data.geopf.fr/wfs` | Open (Etalab 2.0) | **VERIFIED-LEAD** — national, continuously updated, photogrammetry/LiDAR-derived |
| Point cloud (LOD2-capable) | **LiDAR HD** (IGN) | `lidarhd.ign.fr` — tile download or `macarte.ign.fr` coverage check | Etalab 2.0 (commercial use OK, attribution only) | ~80% metropolitan France covered end-2025; full national end-2026 |
| DTM/DSM | LiDAR HD derived products | 50 cm and 5 m GeoTIFF tiles | Etalab 2.0 | Co-published with point cloud |
| SUP overlays | GPU — SUP layer | `apicarto.ign.fr/api/gpu` (returns surface/linear/point footprint) | Open | **Structurally queryable today** — unlike Ciutat Vella heritage catalogue |
| Numeric rules (height, emprise, retraits) | Per-commune règlement PDF | None (GPU returns PDF link, not structured data) | n/a | **NOT YET NATIONAL** — only 2 pilot communes in CNIG SRU standard as of 2026 |

**Parcel caveat (national):** parcel boundaries in France are not survey-precise — they are an imprecise graphic representation predating high-precision aerial photography. Same caveat as Spanish refcat geometry.

---

## 3 — Context-data layer status (LOD / 3D)

| Layer | Source | LOD achievable | Licence gate | Status |
|---|---|---|---|---|
| Building footprints | BD TOPO `BATIMENT` | LOD1 (footprint + height attribute) | None — Etalab 2.0 | Endpoint confirmed, NOT live-probed |
| Real height attribute | BD TOPO `HAUTEUR` | LOD1 | None | NOT live-probed |
| Roof shape | LiDAR HD → reconstruction | LOD2 (after processing) | None | Pipeline not written; data available |
| Trees / vegetation | LiDAR HD classified (11 classes, incl. low/med/high veg) | Object-level capable | None | Bundled with building point cloud — no separate dataset needed |
| Roads / pedestrian | IGN **BD TOPO `ROUTE`** or `apicarto.ign.fr` | Object-level | None | NOT live-probed |
| Water | IGN **BD TOPO `HYDROGRAPHIE`** | Object-level | None | NOT live-probed |

**France is unambiguously ahead of where Barcelona started for context data.** The licence/purchase barrier that blocked Catalonia LOD200 does not exist here. The remaining work is compute (LiDAR→LOD2 reconstruction, same 3dfier/GeoFlow-style pipeline) and endpoint live-probing, not a business decision.

---

## 4 — Overlay risk (the ABF / PSMV trap)

French base zoning returns a bare zone code whether or not a parcel sits inside:

| Overlay | Visibility in GPU base layer | Risk |
|---|---|---|
| **ABF perimeter** (500 m radius around any classified monument — nationwide) | **NOT visible** in base zone query | HIGH — silently overstates buildability; ABF sign-off is discretionary and case-by-case, not numeric data |
| **PSMV / secteur sauvegardé** (historic centre plan) | NOT visible in base zone query | HIGH — same class of problem as Ciutat Vella Pla Especial |
| **SUP** (flood, aviation, etc.) | **VISIBLE** — GPU returns SUP acts as a separate queryable layer | LOW — structurally queryable today; build SUP check into the pipeline |
| **Euroméditerranée / OIN** (Marseille state-led zone) | NOT in base GPU layer | MEDIUM — derogating rules; treat as explicit refusal until separately sourced |

The ABF-perimeter case is the most likely to silently overstate buildability. It is flagged here, not after a phased plan is built around it.

---

## 5 — Municipality coverage

| Municipality | INSEE | Region | Document | Height mechanism | Pack status | Dev-days est. |
|---|---|---|---|---|---|---|
| **Paris** | 75056 | `fr-idf` | PLU bioclimatique (1 commune) | Reference-surface + gabarit formula | NOT STARTED | ~24–29 (dominant `UG` zone only) |
| **Lyon Métropole** | 69123 (+ 57 communes) | `fr-ara` | PLU-H intercommunal (58 communes) | Structured GIS attr. (outer) + height-perimeter overlay (Lyon/Villeurbanne) | NOT STARTED | ~5–7 outer + ~8–10 Lyon/Villeurbanne |
| **Marseille / AMP T1** | 13055 | `fr-pac` | PLUi Marseille-Provence (Territoire 1) | Graphic-primacy over written | NOT STARTED | ~20–24 (T1 only; Pays d'Aix is a separate PLUi) |

> **CNIG SRU future path:** the national Structuration du Règlement d'Urbanisme (SRU) standard, when adopted, would provide structured numeric data per zone. As of 2026 only 2 pilot communes are live. Monitor — when SRU communes reach the scale of a target city, the sourcing bottleneck collapses.

---

## 6 — Files in this folder

```
fr/
├── README.md                   ← this file (country umbrella)
├── NEXT.md                     ← blockers, trip-wires, resume steps
├── sources/
│   ├── SOURCES.md              ← per-field national data source citations
│   └── VERIFICATION.md         ← human sign-off (open)
├── findings/
│   └── FRANCE-MASTER-DATA-SOURCE-STUDY.md   ← full source/rule-mechanism study
├── topics/
│   ├── buildings-lod-height.md
│   ├── parks-trees.md
│   ├── roads-pedestrian.md
│   └── water.md
├── regions/
│   └── README.md               ← France is ONE national product; no per-region routing needed
├── fr-idf/
│   └── 75056-paris/            ← Paris municipality
├── fr-ara/
│   └── 69123-lyon/             ← Lyon Métropole (PLU-H, 58 communes)
└── fr-pac/
    └── 13055-marseille/        ← Marseille / AMP Territoire 1
```

## 7 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Lyon GPU WFS:** do the `HBCPRINC`/`HBCSEC`/`PLAFOND` fields appear on the **national GPU WFS** response for Lyon parcels, or only on Lyon's own `data.grandlyon.com` portal? This is the single most important pre-implementation probe for Lyon — it determines whether Lyon is a national-pipeline config or a second data-source integration.
- **LiDAR HD tile coverage for Paris/Lyon/Marseille:** all three are almost certainly in the covered ~80 %, but confirm with a direct tile-check at `macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD` before committing a phase plan.
- **GPU graphic layer machine-readability (Marseille):** the graphic plan that takes precedence over the written règlement in AMP — is it published as a machine-readable GIS layer, or only as scanned PDF plates? This decides the cost of the Marseille graphic-first resolution logic.
- **Paris "plan des hauteurs" as a queryable layer:** is the hauteur plafond graphic published as a GIS layer, or only as the "atlas des planches au 1/2000" PDF plates? If the latter, this becomes a scanned-map-digitizing problem, not an API integration, and adds ~6–8 dev-days.
- **Scan of 22 French métropoles' open-data portals:** before committing to Paris or Marseille, a lightweight survey for `hauteur`/`gabarit`/`HBCPRINC` structured attributes on other métropoles' own GIS portals would identify additional Lyon-style Tier 1 cities cheaply.
