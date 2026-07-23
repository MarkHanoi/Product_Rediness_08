# Paris (75056) — data sources

> **Status:** PARTIALLY PROBED 2026-07-23 — three height GIS layers confirmed on `opendata.paris.fr`. BD TOPO live-probed. apicarto GPU paths stale. No règlement PDF read, no numeric value certified.

---

## A — VERIFIED (corroborated research leads)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel source | IGN PCI Express `apicarto.ign.fr/api/cadastre` | National — see `../../sources/SOURCES.md` | `apicarto.ign.fr/api/cadastre` | `corroborated` |
| Zone code identification | GPU API — zone code `UG` / `UGSU` / `UV` / `N` | PLU bioclimatique de Paris, in force | `apicarto.ign.fr/api/gpu` | `corroborated` |
| Governing PLU document | PLU bioclimatique de Paris | Délibération du Conseil de Paris — date TBD from GPU response | GPU-returned PDF link | `corroborated` |
| Context buildings + height | BD TOPO `BDTOPO_V3:batiment` field `hauteur` (lowercase) — confirmed non-null in Paris 8th arr (5/5 features, values 9.5m–21m) | National — see `../../sources/SOURCES.md` | `data.geopf.fr/wfs?apikey=essentiels` | `verified` — live probe 2026-07-23 |
| COS/FAR | `n/a — abolished nationwide (loi ALUR 2014)` | Loi n° 2014-366, JORF 2014-03-26 | `legifrance.gouv.fr` | `published` |
| **Paris height GIS layer 1** | `opendata.paris.fr` dataset `plub_filet` — "PLU bioclimatique - Filets gabarit-enveloppe" — **20,644 records** — schema: `n_sq_fil`, **`haut`** (coded letter: **M, K, C, B, G** confirmed in live probe — mapping to height-by-street-width per PLU bioclimatique règlement), `cour` (X=exterior / C=courtyard), `n_sq_ca` (arrondissement number), `c_sec`, `n_pc`, `c_asp` (parcel ref: format `<arr>-<section>-<parcel>`), `st_length_shape`, `geo_shape` (geometry). Sample records: 15th arr → M; 19th arr → M, K, G; 10th arr → B. | PLU bioclimatique de Paris | `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_filet/records` | `verified` — live probe 2026-07-23; 20,644 records confirmed; **field `haut` is coded, NOT absolute metres** — decoding table in PLU bioclimatique règlement UG.10; letter codes M/K/C/B/G confirmed in second probe 2026-07-23 |
| **Paris height GIS layer 2** | `opendata.paris.fr` dataset `plub_hauteur` — "PLU bioclimatique - Plafonds des hauteurs" — **116 records** — schema: `objectid`, **`hauteur`** (absolute metres, e.g. 25m), `n_sq_ca` (arrondissement), `st_area_shape`, `st_perimeter_shape` | PLU bioclimatique de Paris | `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_hauteur/records` | `verified` — live probe 2026-07-23; absolute metre values confirmed (sample: 25m ×2 records) |
| **Paris height GIS layer 3** | `opendata.paris.fr` dataset `plub_hmc` — "PLU bioclimatique - Hauteur maximale constructible" — **47 records** — schema: `objectid`, `n_sq_hmc`, **`hmc`** (datum type: "NGF" = altitude above sea level), **`ht_hmc`** (absolute height, e.g. 85m, 67m), `st_area_shape` | PLU bioclimatique de Paris | `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_hmc/records` | `verified` — live probe 2026-07-23; NGF-referenced absolute height values confirmed (samples: 85m, 67m) |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| GPU response field names for Paris | Live `apicarto.ign.fr/api/gpu` response | `GET /api/gpu/zone?lon=2.3470&lat=48.8530` |
| BD TOPO `HAUTEUR` non-null rate | Live WFS response | Run probe in `../../NEXT.md §8` |
| **PLU bioclimatique — UG.6 implantation voies** | PLU bioclimatique règlement écrit — article UG.6 | Read PDF (GPU-returned link) verbatim; record date of consolidated text |
| **PLU bioclimatique — UG.7 implantation limites séparatives** | PLU règlement article UG.7 — setback formula `H = P + 3.00 + D` | Read verbatim; note if formula is stated in UG.7 or cross-referenced from UG.10 |
| **PLU bioclimatique — UG.8 implantation buildings on same lot** | PLU règlement article UG.8 — vis-à-vis formula | Read verbatim |
| **PLU bioclimatique — UG.10 (hauteur / gabarit)** | PLU règlement articles UG.10.1–UG.10.4 — hauteur de façade, gabarit-enveloppe formula, hauteur plafond mechanism | **Most critical article** — read verbatim before writing ADR-0274 |
| **Plan des hauteurs — machine-readable?** | **RESOLVED 2026-07-23 — CONFIRMED GIS** — three datasets found: `plub_filet` (gabarit-enveloppe, coded height letters), `plub_hauteur` (zone-level absolute height ceilings), `plub_hmc` (NGF absolute maxima). Promoted to §A above. | ~~Search portals~~ — DONE |
| **`haut` coded letter decoding table** | `plub_filet.haut` field contains letter codes (M, K, C, B, G confirmed in live probes 2026-07-23; likely additional codes exist). Decoding table maps letter → height-by-street-width ratio per PLU bioclimatique UG.10 règlement | Read PLU bioclimatique règlement UG.10 verbatim for the gabarit-enveloppe decoding table. GPU-returned PDF link for a Paris parcel will provide the règlement. |
| **Plan des hauteurs — sector ceiling values (specific zones)** | Sample values: `plub_hauteur` record = 25m (arrondissement 12, area 168,121 m²); `plub_hmc` record = 85m NGF (area 1,166 m²) | Additional records needed for target arrondissements; probe `plub_filet` for specific parcel ref `c_asp` = "arrondissement-section-parcel" |
| ABF perimeter SUP sub-type | GPU SUP layer response for known ABF parcel | See `../NEXT.md §B3` probe command |
| PSMV zones in Paris | GPU or a separate PSMV GIS layer | Query GPU for a known Le Marais parcel; check whether zone returned is `PSMV` or `UG` |

---

⚠ Nothing in §A includes a numeric height, emprise, or setback value. Until those are read
verbatim from the PLU bioclimatique text and recorded here by a verifier, no Paris pack may ship.
