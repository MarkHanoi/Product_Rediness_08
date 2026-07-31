# Brussels (21004) — data sources

> **Status:** PARTIALLY PROBED — federal cadastre + Wallonia/Flanders leads live-verified 2026-07-24 (see
> `../../findings/`); Brussels PRAS bot-blocked (cache-confirmed). No RRU numeric value read verbatim, none certified.

---

## A — VERIFIED (corroborated research leads + founder primary-source dig 2026-07-31)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel geometry (federal) | CADMAP/CadGIS INSPIRE CP WFS — the parcel-GEOMETRY authority | AGDP / SPF Finances (federal) | `ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/exts/InspireFeatureDownload/service` | `VERIFIED LIVE` 2026-07-24 — HTTP 200 application/xml |
| Parcel+building+address (regional) | Official UrbIS **"Parcels and buildings"** combined product (CadGIS parcels + Paradigm buildings + BeSt addresses; `INSPIRE_ID`, `CAPA_ID`/`CAPAKEY`, `BL_ID`) | UrbIS (CIRB / paradigm.brussels) | `datastore.brussels` (GPKG/SHP ⭐) · `data.gov.be` mirror ⭐ · OGC API Features `data.mobility.brussels` · Opendatasoft `opendata.brussels.be` · Urban GeoServer WFS (fallback) | `documented` — multiple official surfaces; sync-first (see `parcelProviders/brusselsParcelProvider.ts`) |
| Context buildings/roads/water/parks | OSM baked PMTiles | `bake.mjs` REGIONS `brussels` (`belgium-latest.osm.pbf`, bbox `4.30,50.80,4.42,50.90`) | `s3://pryzm-assets/tiles/…` | `live` (baked) |
| Land-use plan (PRAS) | `PERSPECTIVE_FR:Affectations` — multiple official surfaces exist; pick the best live path | PRAS (region-wide affectation) | `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` (bot-blocked direct) + open-data mirrors | `cache-confirmed` — direct fetch bot-blocked; NOT "inaccessible" |
| Buildable DEPTH (RRU Titre I Art. 4) | ≤ **¾ parcel depth** (Art. 4 §1(1), excl. front-setback, along median axis) + neighbour rule (deeper-profile / shallower +3 m unless ≥3 m lateral setback) → `depthLimit = min(0.75·parcelDepth, neighbourRule())` | RRU Titre I Art. 4 | `urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf` (+ etaamb) | `read-verbatim` — substantially resolved; cite the consolidated article before shipping |
| Implantation (RRU Titre I Art. 3) | Front façade at the **alignment / building line** (categorical, NOT metres); construction on/against shared boundary | RRU Titre I Art. 3 | same PDF | `read-verbatim` — encode as "alignment", not a metre value |
| Regional building regulation | RRU (Règlement Régional d'Urbanisme), 7 Titres; Titre I = the gabarit chapter | arrêté 3 Jun 1999, re-adopted 21 Nov 2006 | `urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf` | `AVAILABLE` — canonical PDF located + partially extracted (Art. 3, Art. 4) |

## B — UNVERIFIED / HONEST BLOCKERS (need live/Belgian-IP access — do NOT invent)

| Field | Revised status | What to verify against | Method |
|---|---|---|---|
| **Height — `H = P + 3 + D` formula** | ⚠ **UNCONFIRMED — NOT a rule.** No per-zone height table exists (Brussels height is contextual); the widely-cited `H = P + 3 + D` is **NOT located** in the official RRU Titre I. **Do NOT encode.** | Official RRU Titre I full text | Already read — formula absent; leave UNCONFIRMED unless a governing consolidated article is located |
| **Height — geometric derivation** | Derivable, schema unprobed | UrbIS-3D **CityGML** — `height = maxRoofZ − minGroundZ` (RoofSurface/GroundSurface Z) | Probe UrbIS-3D product schema: field names, CRS, LoD (base UrbIS Buildings has NO height attribute) |
| **FAR / plot ratio** | ✅ **Genuine absence** — record `n-a`/`unknown`, NEVER 0 | Brussels regulates by affectation + gabarit, not FAR | No action — do not fabricate a 0 |
| Street width P (façade-to-façade) | Geometrically computable (not attribute-blocked) | Road-polygon median cross-section / street-section layer | Compute geometrically; NB not needed for a confirmed height rule (formula unconfirmed) |
| PPAS / RRUZ / PAD instrument-priority chain | HONEST BLOCKER — coverage fraction unknown | Brussels district-plan layers | Grid-sample coverage + precedence (PPAS/PAD/RRUZ > RRU) — needs live access |
| PRAS affectation (live schema) for a parcel | HONEST BLOCKER — current WFS schema | Live `PERSPECTIVE_FR:Affectations` GetFeature | Belgian-IP / open-data-surface probe → affectation + document link |
| UrbIS road-width attribute presence | HONEST BLOCKER | UrbIS road/street layer | Probe for a width attribute (else compute P geometrically) |
| Heritage overlay (urban.brussels) GIS liveness | HONEST BLOCKER | Direction du Patrimoine culturel register | Confirm queryable GIS layer |
| Building-height (DSM−DTM) fields | HONEST BLOCKER | UrbIS-3D / any Brussels elevation surface | Confirm elevation product + licence |

⚠ The Art. 4 depth resolver + Art. 3 implantation ARE now read verbatim and encodable — but no numeric rule
ships until the governing consolidated articles are cited here by a verifier and the instrument-priority
chain is resolved (§CONTEXT-DATA-HONESTY). Height stays contextual/geometry-derived — the `H = P + 3 + D`
formula must NOT be shipped as a rule.

*Cross-refs: `../../sources/SOURCES.md` (national) · `../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`.*
