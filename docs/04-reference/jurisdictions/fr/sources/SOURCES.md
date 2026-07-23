# France (`fr`) — national data sources

**Status:** PARTIAL — national API endpoints characterised from research; no live probe yet (endpoints not verified against live responses). No numeric rule values are verified — the national source for numeric rules (commune règlement PDFs) has not been read for any French commune.

> **Trust gate:** a field with NO citable source stays `null` in the pack and is listed under §B.
> A pack may not ship confidence `structured` unless EVERY field it sets has a row in §A here.

---

## A — VERIFIED (research-cited; not yet live-probed)

| Field (pack key / layer) | Value / endpoint | Unit | Governing instrument | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Parcel geometry source | IGN Parcellaire Express (PCI) | — | IGN product decision | "Parcellaire Express (PCI) — Descriptif de contenu", IGN, current | `data.geopf.fr/wfs` or `apicarto.ign.fr/api/cadastre` | `corroborated` — multiple independent secondary sources, semi-annual cadence confirmed |
| Parcel alt. source | cadastre.data.gouv.fr (Etalab/DGFiP) | — | DGFiP repackaging | Etalab open-data portal, current | `cadastre.data.gouv.fr` | `corroborated` |
| Parcel geometry precision caveat | NOT survey-precise — imprecise graphic representation | — | National property of the cadastre | Research finding, corroborated multiple sources | — | `corroborated` |
| Zoning source | GPU (Géoportail de l'Urbanisme) | — | Ordonnance n° 2021-1310 (2021-10-07) — publication on GPU = legal executory force from 2023-01-01 | "Ordonnance n° 2021-1310 du 7 octobre 2021 portant modernisation du cadre de gestion des évolutions du territoire", JORF | `legifrance.gouv.fr` | `published` |
| GPU WFS endpoint | `data.geopf.fr/annexes/ressources/wfs/gpu.xml` | — | IGN technical documentation | GPU WFS capabilities descriptor | `data.geopf.fr/annexes/ressources/wfs/gpu.xml?SERVICE=WFS&REQUEST=GetCapabilities` | `corroborated` |
| GPU API Carto endpoint | `apicarto.ign.fr/api/gpu` | — | IGN API Carto documentation | API Carto module GPU, current | `apicarto.ign.fr/api/gpu` | `corroborated` |
| GPU pagination cap | 5,000 objects per WFS request | objects | IGN WFS technical constraint | GPU WFS documentation | — | `corroborated` |
| GPU bulk extraction | Weekly ATOM/GeoPackage per layer | — | CNIG standard | "Standard CNIG PLU", CNIG, current | `cnig.fr` | `corroborated` |
| GPU zone fields returned | Zone code, document name + approval date, PDF link, SUP acts | — | GPU data model | GPU API documentation | `apicarto.ign.fr/api/gpu` | `corroborated` |
| Context buildings source | IGN BD TOPO® — feature type `BATIMENT`, field `HAUTEUR` | m (height) | IGN product specification | "BD TOPO® — Descriptif de contenu", IGN 3.0, current | `data.geopf.fr/wfs` | `corroborated` |
| LiDAR HD licence | Etalab 2.0 — free including commercial use, attribution only | — | Licence text | "Licence Ouverte / Open Licence version 2.0", Etalab | `data.gouv.fr/licences/licence-ouverte` | `published` |
| LiDAR HD resolution | 10 points/m² | pts/m² | IGN LiDAR HD programme | IGN LiDAR HD programme documentation | `lidarhd.ign.fr` | `corroborated` |
| LiDAR HD coverage (metro France) | ~80% metropolitan France covered end-2025; full national end-2026 | % area | IGN rollout tracker | IGN LiDAR HD progress map | `macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD` | `corroborated` |
| LiDAR HD classification | 11 classes: ground, low/mid/high vegetation, buildings, water, etc. | — | IGN LiDAR HD point-cloud specification | IGN LiDAR HD classification scheme documentation | `lidarhd.ign.fr` | `corroborated` |
| COS (FAR) legal status | Abolished nationwide — loi ALUR 2014 | — | Loi n° 2014-366 du 24 mars 2014 (loi ALUR), Art. 157 (Code de l'urbanisme) | "Loi pour l'accès au logement et un urbanisme rénové (ALUR)", JORF 2014-03-26 | `legifrance.gouv.fr` | `published` |
| SRU standard national coverage | 2 pilot communes (Pechbonnieu 31, Preignan 32) as of 2026 | communes | CNIG SRU project status | "Structuration du Règlement d'Urbanisme — état d'avancement", CNIG | `cnig.fr/cnig/structuration-des-reglements` | `corroborated` |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| `HAUTEUR` field non-null rate in BD TOPO | No live WFS probe run | Run the probe in NEXT.md §8 against a Paris bbox; record what fraction of features have a non-null `HAUTEUR` |
| GPU WFS `HBCPRINC`/`PLAFOND` fields for Lyon | Not confirmed present in the national GPU WFS response (may only be on `data.grandlyon.com`) | Live `GetFeature` request against a Lyon parcel via `data.geopf.fr/annexes/ressources/wfs/gpu.xml` |
| ABF perimeter layer in GPU / API Carto | Not confirmed which SUP sub-type code corresponds to ABF perimeters | Query GPU SUP layer for a Paris parcel near a classified monument; check for `AC2` or `AS1` type codes |
| Paris "plan des hauteurs" as GIS layer | Unknown — may be PDF plates only ("atlas des planches au 1/2000") | Check `api-sig.paris.fr` and `opendata.paris.fr` for a layer named `plan_hauteurs`, `hauteur_plafond`, or similar |
| Marseille graphic layer (règlement graphique) machine-readability | Unknown — may be scanned PDF plates, not structured GIS | Query GPU WFS for AMP Territoire 1 for feature types beyond zone polygons; check for a graphic-rule attribute on zone features |
| Any numeric rule values (height, emprise, retraits) for any French commune | No commune règlement PDF has been read | For each target commune: obtain the PLU/PLUi règlement écrit PDF via the GPU-returned link; read the relevant zone articles; apply L-449 source-acceptance gate |

---

⚠ Numbers that appear only in blog posts, slides, papers, or a **neighbouring municipality's** republication of a règlement are SECONDARY and do not qualify for §A — record them as research notes only, never promote here.
