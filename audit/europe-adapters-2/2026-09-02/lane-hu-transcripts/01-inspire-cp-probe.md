# LANE HU — live probe transcript (2026-09-03)

All commands run from this machine, Git Bash + curl, foreground, `$?` checked.

## 1. National INSPIRE entry point
- `GET https://inspire.gov.hu/` → HTTP 200, 1962 B, `text/html`.
  Title "Országos INSPIRE szerver" (National INSPIRE server); the only link is to
  `https://inspire.lechnerkozpont.hu`.
- `GET https://inspire.lechnerkozpont.hu/` → HTTP 302 → `location: .../geonetwork/`
  (a GeoNetwork 4 catalogue; the `srv/eng/q` API answers `"Use ES search instead."`).

## 2. Catalogue search (GeoNetwork ES), Accept-Language: hun
`POST .../geonetwork/srv/api/search/records/_search` query_string
`"cadastral OR kataszteri OR parcella OR CadastralParcels"` → 7 hits. The Cadastral-Parcels rows:
- dataset  "INSPIRE dataset Theme Annex I - Cadastral parcels - **Mesterszállás sampling area**"
  links: OGC:WMS `.../geoserver/CP/wms`, OGC:WFS `.../geoserver/CP/ows`,
         ATOM `.../inspire/atom/DLS_CadastralParcels.xml`, PDF `HU.CP.2019NFO.pdf`.
- service  "INSPIRE Annex I Theme - ATOM Download Service (predefined datasets) - Hungarian
           Cadastral Parcels" → ATOM `.../inspire/atom/DLS_CadastralParcels.xml`.
- service  "INSPIRE Annex I Theme - View Services - Hungarian Cadastral Parcels of
           **Mesterszállás sampling area**" → WMS GetCapabilities.

## 3. WFS GetCapabilities — KEYLESS, FREE
`GET https://inspire.lechnerkozpont.hu/geoserver/CP/ows?service=WFS&acceptversions=2.0.0&request=GetCapabilities`
→ HTTP 200, 90,332 B, `text/xml`.
- FeatureType `CP:CP.CadastralParcels`, DefaultCRS `urn:ogc:def:crs:EPSG::23700` (HD72 / EOV).
- `ows:Fees` = **NONE**; `ows:AccessConstraints` = **NONE**; ProviderName "Lechner Knowledge Centre".
- Declared WGS84 extent is national-looking (LowerCorner 15.9466 45.6743 / UpperCorner
  23.1092 48.6417) — the THEME extent, NOT the served-data extent (see §5).

## 4. ATOM download service
`GET .../inspire/atom/DLS_CadastralParcels.xml` → dataset feed titled
**"Cadastral Parcels of Mesterszállás"**. One predefined dataset (the sample municipality).

## 5. Served-data coverage — MEASURED, one municipality only
- Total features: `GetFeature resultType=hits` → **numberMatched="1774"** (a national cadastre is
  millions). 
- Full collection reprojected to WGS84 → all 1774 features carry `administrativeunit="Mesterszállás"`
  (raw UTF-8 bytes `4d 65 73 74 65 72 73 7a c3 a1 6c 6c c3 a1 73`). WGS84 extent
  **lon[20.399654, 20.500223] × lat[46.891381, 46.984411]** (~7.7 km × ~10.3 km).
- One feature (native EPSG:23700, GeoJSON): props include `nationalcadastralreference`, `label`,
  `inspireid`, `areavalue` (m²), `administrativeunit`, `validfrom/validto`, `beginlifespanversion`;
  geometry MultiPolygon in EOV eastings/northings (e.g. `[754934.74, 183142.22]`).

## 6. THE CAPITAL CLICK — Budapest (47.4979, 19.0402) → EMPTY (the deferral gate)
`GET .../geoserver/CP/ows?...&request=GetFeature&typeNames=CP:CP.CadastralParcels&outputFormat=application/json&bbox=47.4974,19.0397,47.4984,19.0407,urn:ogc:def:crs:EPSG::4326`
→ HTTP 200, verbatim body:
`{"type":"FeatureCollection","features":[],"totalFeatures":0,"numberMatched":0,"numberReturned":0,"timeStamp":"2026-09-03T14:31:17.448Z","crs":null}`
sha256 `c103102050ecc455d7548abbd2c45658191a6cd03db6e212328cc0c195e8e3c1`.
→ The keyless national INSPIRE CP service returns NO parcel at the capital: coverage is the
  Mesterszállás sample, not national territory.

## 7. THE SAMPLE CLICK — Mesterszállás (46.98416, 20.42691) → REAL PARCEL
Same request, sample bbox → `numberReturned:1 / totalFeatures:5`, parcel
`nationalcadastralreference="015"`, `label="015"`, `inspireid="HU.CP.015-"`, `areavalue=455` m²,
`administrativeunit="Mesterszállás"`. The service WORKS keyless — but only inside the sample.

## VERDICT
The keyless INSPIRE CP WFS answers (Fees/AccessConstraints NONE) but serves ONE sample
municipality (Mesterszállás, 1774 parcels). The NATIONAL cadastre (állami ingatlan-nyilvántartási
alaptérkép) is delivered by Lechner via TAKARNET / Geoshop — PAID, quarterly, SHP/DXF/WMS
(rest-of-europe sweep §HU; envelope-geometry census row 26 "OPAQUE"). Therefore the HU parcel leg
is a **DECLARED DEFERRAL** for national coverage, with a working keyless provider proven against the
Mesterszállás sample so the shape is real (not a spec-built fake). Gate named + reviewBy set in
`countryAdapters/hu/huParcelProvider.ts` (`HU_CADASTRE_DEFERRAL`).
