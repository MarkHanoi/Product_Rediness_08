# Paris (75056) — data sources

> **Status:** NOT STARTED — no live probe run, no règlement PDF read, no numeric value certified.

---

## A — VERIFIED (corroborated research leads)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel source | IGN PCI Express `apicarto.ign.fr/api/cadastre` | National — see `../../sources/SOURCES.md` | `apicarto.ign.fr/api/cadastre` | `corroborated` |
| Zone code identification | GPU API — zone code `UG` / `UGSU` / `UV` / `N` | PLU bioclimatique de Paris, in force | `apicarto.ign.fr/api/gpu` | `corroborated` |
| Governing PLU document | PLU bioclimatique de Paris | Délibération du Conseil de Paris — date TBD from GPU response | GPU-returned PDF link | `corroborated` |
| Context buildings + height | BD TOPO `BATIMENT` + `HAUTEUR` field | National — see `../../sources/SOURCES.md` | `data.geopf.fr/wfs` | `corroborated` |
| COS/FAR | `n/a — abolished nationwide (loi ALUR 2014)` | Loi n° 2014-366, JORF 2014-03-26 | `legifrance.gouv.fr` | `published` |

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
| **Plan des hauteurs — machine-readable?** | `opendata.paris.fr` / `api-sig.paris.fr` WFS capabilities | Search for `plan_hauteurs`/`hauteur_plafond` layer — see `../NEXT.md §B2` |
| **Plan des hauteurs — sector ceiling values** | GIS layer (if confirmed) or PDF atlas plates | After machine-readability confirmed, probe sample values for 2 arrondissements |
| ABF perimeter SUP sub-type | GPU SUP layer response for known ABF parcel | See `../NEXT.md §B3` probe command |
| PSMV zones in Paris | GPU or a separate PSMV GIS layer | Query GPU for a known Le Marais parcel; check whether zone returned is `PSMV` or `UG` |

---

⚠ Nothing in §A includes a numeric height, emprise, or setback value. Until those are read
verbatim from the PLU bioclimatique text and recorded here by a verifier, no Paris pack may ship.
