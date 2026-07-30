# Brussels (21004) — data sources

> **Status:** PARTIALLY PROBED — federal cadastre + Wallonia/Flanders leads live-verified 2026-07-24 (see
> `../../findings/`); Brussels PRAS bot-blocked (cache-confirmed). No RRU numeric value read verbatim, none certified.

---

## A — VERIFIED (corroborated research leads)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel geometry (federal) | CADMAP/CadGIS INSPIRE CP WFS | AGDP / SPF Finances (federal) | `ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/exts/InspireFeatureDownload/service` | `VERIFIED LIVE` 2026-07-24 — HTTP 200 application/xml |
| Context buildings/roads/water/parks | OSM baked PMTiles | `bake.mjs` REGIONS `brussels` (`belgium-latest.osm.pbf`, bbox `4.30,50.80,4.42,50.90`) | `s3://pryzm-assets/tiles/…` | `live` (baked) |
| Land-use plan (PRAS) | `PERSPECTIVE_FR:Affectations` | PRAS (region-wide affectation) | `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` | `cache-confirmed` — bot-blocked on direct fetch |
| Regional building regulation | RRU (Règlement Régional d'Urbanisme), 7 Titres; Titre I = gabarit baseline | arrêté 3 Jun 1999, re-adopted 21 Nov 2006 | urban.brussels | `stated` — PDF not yet read verbatim |

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| **RRU Titre I gabarit/implantation formulas** | RRU règlement PDF — `H = P + 3.00 + D`, profondeur de bâti | Read verbatim (Belgian-IP); record article numbers + consolidated-text date |
| PRAS affectation for a Brussels parcel | Live `PERSPECTIVE_FR:Affectations` GetFeature | Belgian-IP probe → affectation category + document link |
| Federal CADMAP building sublayer height attribute | Live federal WFS GetFeature | One `GetFeature`; inspect for height/storey field |
| UrbIS building layer height field / LiDAR programme | UrbIS WFS schema | Probe `geoservices-urbis.irisnet.be` capabilities |
| Brussels-Capital DTM service + licence | Bruxelles-Environnement / CIRB | Locate elevation WCS/tiles; confirm commercial licence |
| PPAS / RRUZ / PAD precedence for a target district | Brussels district-plan layers | Confirm override layers + precedence rules |
| Heritage overlay (urban.brussels) | Direction du Patrimoine culturel register | Confirm queryable GIS layer |

⚠ Nothing in §A includes a numeric height, gabarit, or setback value. Until RRU Titre I is read verbatim and
recorded here by a verifier, no Brussels pack may ship (§CONTEXT-DATA-HONESTY).

*Cross-refs: `../../sources/SOURCES.md` (national) · `../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`.*
