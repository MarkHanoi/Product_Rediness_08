# France (`fr`) — national data sources

**Status:** PARTIALLY PROBED — national API endpoints live-probed 2026-07-23. BD TOPO `hauteur` confirmed non-null. GPU WFS confirmed live with `apikey=gpu`. apicarto.ign.fr GPU paths have changed (see §B). No numeric rule values are verified — the national source for numeric rules (commune règlement PDFs) has not been read for any French commune.

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
| GPU API Carto endpoint | `apicarto.ign.fr/api/gpu` | — | IGN API Carto documentation | API Carto module GPU, current | `apicarto.ign.fr/api/gpu` | `corroborated` — **NOTE: /api/gpu/zone and /api/gpu/commune paths return 404 as of 2026-07-23 live probe; use GPU WFS directly (see below)** |
| GPU WFS confirmed live | `data.geopf.fr/annexes/ressources/wfs/gpu.xml?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities&apikey=gpu` — HTTP 200, feature types: `wfs_du:zone_urba`, `wfs_du:prescription_lin/pct/surf`, `wfs_du:habillage_lin/pct/surf/txt`, `wfs_du:info_lin/pct/surf`, `wfs_du:secteur_cc`, `wfs_sup:acte_sup`, `wfs_sup:assiette_sup_l/p/s`, `wfs_sup:generateur_sup_l/p/s`, `wfs_sup:gestionnaire_sup`, `wfs_sup:servitude`, `wfs_sup:servitude_acte_sup`, `wfs_scot:doc_urba`, `wfs_scot:doc_urba_com`, `wfs_scot:perimetre_scot`, `wfs_scot:scot`, `wfs_du:document`, `wfs_du:doc_urba`, `wfs_du:doc_urba_com`, `wfs_du:municipality` | — | Live probe 2026-07-23 | WFS GetCapabilities via `apikey=gpu` | `verified` — live response confirmed |
| GPU pagination cap | 5,000 objects per WFS request | objects | IGN WFS technical constraint | GPU WFS documentation | — | `corroborated` |
| GPU bulk extraction | Weekly ATOM/GeoPackage per layer | — | CNIG standard | "Standard CNIG PLU", CNIG, current | `cnig.fr` | `corroborated` |
| GPU zone fields returned | Zone code, document name + approval date, PDF link, SUP acts | — | GPU data model | GPU API documentation | `apicarto.ign.fr/api/gpu` | `corroborated` |
| Context buildings source | IGN BD TOPO® — feature type `BDTOPO_V3:batiment`, field **`hauteur`** (lowercase) | m (height) | IGN product specification | "BD TOPO® — Descriptif de contenu", IGN 3.0, current | `data.geopf.fr/wfs` with `apikey=essentiels` | `verified` — **live probe 2026-07-23: 5/5 features non-null in Paris 8th arr; sample values 9.5m, 21m, 9.6m** |
| BD TOPO `batiment` full schema | cleabs, nature, usage_1, usage_2, construction_legere, etat_de_l_objet, date_creation, date_modification, date_d_apparition, date_de_confirmation, sources, identifiants_sources, methode_d_acquisition_planimetrique, methode_d_acquisition_altimetrique, precision_planimetrique, precision_altimetrique, nombre_de_logements, **nombre_d_etages**, **hauteur**, altitude_minimale_sol, altitude_minimale_toit, altitude_maximale_toit, altitude_maximale_sol, origine_du_batiment, appariement_fichiers_fonciers, identifiants_rnb | — | Live probe 2026-07-23 | WFS GetFeature BBOX=2.3460,48.8520,2.3500,48.8560 EPSG:4326 COUNT=5 | `verified` — field names confirmed from live response |
| BD TOPO WFS access method | `GET https://data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:batiment&BBOX=<lon_min>,<lat_min>,<lon_max>,<lat_max>,EPSG:4326&SRSNAME=EPSG:4326&COUNT=<n>&OUTPUTFORMAT=application/json&apikey=essentiels` | — | Live probe 2026-07-23 | HTTP 200, JSON FeatureCollection | `verified` |
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
| `HAUTEUR` field non-null rate in BD TOPO | **RESOLVED 2026-07-23** — live probe: 5/5 features non-null in Paris 8th arr; field name is lowercase `hauteur` (not `HAUTEUR`); values 9.5m, 21m, 9.6m | ~~Run the probe in NEXT.md §8~~ — DONE; promote to §A |
| GPU WFS `HBCPRINC`/`PLAFOND` fields for Lyon | **RESOLVED 2026-07-23 — NEGATIVE** — live probe of `wfs_du:zone_urba` for Lyon Confluence bbox: these fields are NOT present in the national GPU WFS. Height data for Lyon is on `data.grandlyon.com` only (see Lyon SOURCES.md) | ~~Live GetFeature request~~ — DONE |
| ABF perimeter layer in GPU / API Carto | Not confirmed — apicarto.ign.fr `/api/gpu/zone` path returns 404 as of 2026-07-23; SUP types visible in `wfs_sup:assiette_sup_s` on GPU WFS; exact ABF sub-type code still unknown | Use GPU WFS `wfs_sup:assiette_sup_s` GetFeature for a known ABF parcel; check attribute containing sub-type |
| Paris "plan des hauteurs" as GIS layer | **RESOLVED 2026-07-23 — POSITIVE** — three GIS height datasets confirmed on `opendata.paris.fr`; see Paris SOURCES.md §A | ~~Check portals~~ — DONE |
| Marseille graphic layer (règlement graphique) machine-readability | Live probe of GPU WFS `wfs_du:zone_urba` for Marseille Vieux-Port bbox returned XML WFS Capabilities (not feature data — likely rate-limited). No height attributes found in zone_urba field schema. Graphic-primacy path UNCONFIRMED from GIS perspective — may still be PDF-only. | Retry GPU GetFeature for Marseille; check AMP portal `sig.ampmetropole.fr` or `ampmetropole.fr` for graphic WFS layer |
| Any numeric rule values (height, emprise, retraits) for any French commune | No commune règlement PDF has been read | For each target commune: obtain the PLU/PLUi règlement écrit PDF via the GPU-returned link; read the relevant zone articles; apply L-449 source-acceptance gate |

---

⚠ Numbers that appear only in blog posts, slides, papers, or a **neighbouring municipality's** republication of a règlement are SECONDARY and do not qualify for §A — record them as research notes only, never promote here.
