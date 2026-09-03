# LANE BG — live probe transcript (2026-09-03, from this machine)

Channel hint (brief): "the KAIS/cadastre.bg channels per the sweep — likely credential-gated:
probe, and defer honestly if so." → **The hint was over-pessimistic for the PARCEL leg.** The
GCCA/AGKK INSPIRE Cadastral-Parcels service answers a **keyless** ArcGIS REST query returning a
real national cadastral identifier + a WGS84 ring at the capital. The gate the sweep saw is on the
*official PDF extract* (a paid service) and on the app-backend host `arcgis.cadastre.bg` (WAF), not
on the INSPIRE view/query channel at `inspire.cadastre.bg`.

All requests below sent `curl 8.19.0`. Browser `User-Agent` was needed ONLY for the WAF-guarded
app backend `arcgis.cadastre.bg`; the INSPIRE host `inspire.cadastre.bg` answers with the DEFAULT
curl UA (Node/undici-safe — measured).

## 1. Discovery

- `https://kais.cadastre.bg/` → HTTP 200. Map viewer `/bg/Map/Index` references ArcGIS MapServers
  on `arcgis.cadastre.bg/arcgisnopki/rest/services/` (ExternalKais/ParcelsCache, InternalKais/
  CmcrPublic, …) and `kaiscad.cadastre.bg/api` (503).
- `arcgis.cadastre.bg` is **WAF-guarded (F5-style "Request Rejected / support ID")**: the service
  ROOT `.../CmcrPublic/MapServer?f=json` and `/export` are allowed, but every attribute/geometry
  path — `/1`, `/layers`, `/identify`, `/1/query`, `WFSServer`, `WMSServer` — returns **HTTP 403**.
  That backend is an anti-scraping dead end for machine-readable parcels.
- The national INSPIRE geoportal `https://inspire.egov.bg/` → HTTP 200 ("INSPIRE Геопортал"), whose
  GeoNetwork catalog `https://inspireportal.egov.bg/geonetwork/` (ES search API) returns the
  authoritative service records:
  - **"Cadastral parcels - GCCA"** → `https://inspire.cadastre.bg/arcgis/services/Cadastral_Parcel/MapServer/WMSServer` (WMS 1.3.0).
  - **"Buildings - GCCA"** → `.../Building/MapServer/WMSServer`.
  - "Administrative units - GCCA" → InspireView (WMS) **and** InspireFeatureDownload (WFS).
  - "Statistical units - NUTS/LAU - NSI" → `inspire.nsi.bg/geoserver` (WMS+WFS).

## 2. The parcel channel — `inspire.cadastre.bg` (keyless)

`GET .../Cadastral_Parcel/MapServer/WMSServer?request=GetCapabilities&service=WMS` → **HTTP 200**,
WMS 1.3.0. Layer `0` Title `CP.CadastralParcel`, **queryable="1"**, `MaxScaleDenominator 18898.8`
(visible below ~1:18900). CRS advertised: CRS:84, EPSG:4326, EPSG:4258, **EPSG:7801 (BGS2005)**,
EPSG:32635. GetFeatureInfo formats include `text/html`, `text/plain`, `text/xml`,
**`application/geo+json`**.

`GET .../Cadastral_Parcel/MapServer?f=json` → **HTTP 200** (NOT WAF-blocked, unlike arcgis.cadastre.bg).
`.../MapServer/0?f=json` → **capabilities `Data,Map,Query`**, `esriGeometryPolygon`, SR 4258;
fields incl. `nationalcadastralref, id_localid, id_namespace, areavalue, label, admunit, validfrom`.
`.../MapServer/exts/InspireFeatureDownload/service?...WFS` → HTTP 200 **ExceptionReport** ("No
operation…") — the INSPIRE **download (WFS) service is DISABLED for parcels** (matches sweep:
"WFS confirmed only for geographic names"). The **REST `query`** and the **WMS `GetFeatureInfo`**
are the two working keyless channels.

## 3. THE LIVE CLICK PROOF — Sofia capital (42.6975 N, 23.3223 E)

### 3a. ArcGIS REST query (primary — identifier + geometry)
```
GET https://inspire.cadastre.bg/arcgis/rest/services/Cadastral_Parcel/MapServer/0/query
    ?geometry={"x":23.3223,"y":42.6975,"spatialReference":{"wkid":4326}}
    &geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects
    &inSR=4326&outSR=4326&outFields=nationalcadastralref,id_localid,id_namespace,areavalue,areavalue_uom,label,admunit,validfrom,beginlifespanversion
    &returnGeometry=true&f=json
→ HTTP 200, 3543 B, spatialReference {wkid:4326}
  feature[0].attributes = {
    "nationalcadastralref":"68134.100.5", "id_localid":"68134.100.5", "id_namespace":"BG.CP",
    "areavalue":3499, "areavalue_uom":"m2", "label":"5", "admunit":4656,
    "validfrom":1303084800000 (=2011-04-18), "beginlifespanversion":1510338917000 (=2017-11-10)
  }
  feature[0].geometry.rings[0].length = 51 (WGS84 lon,lat vertices around 23.322,42.697)
```
`68134` = the EKATTE settlement code for **гр. София (Sofia)**; `.100` = кадастрален район;
`.5` = parcel → a real Bulgarian cadastral identifier at the capital. Recorded:
`__tests__/fixtures/bg-sofia-2026-09-03/recorded-live-2026-09-03.json` key `sofiaCenterPoint`.

### 3b. WMS GetFeatureInfo (sweep-confirmed INSPIRE view channel — identifier, geometry null)
```
GET .../Cadastral_Parcel/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo
    &LAYERS=0&QUERY_LAYERS=0&CRS=CRS:84&BBOX=23.3208,42.6960,23.3238,42.6990
    &WIDTH=500&HEIGHT=500&I=250&J=250&INFO_FORMAT=application/geo+json&FEATURE_COUNT=5
→ HTTP 200, application/geo+json:
  properties.nationalCadastralReference = "68134.100.5", areaValue "3499", inspireId_namespace "BG.CP"
  geometry = null (ArcGIS WMS GFI returns attributes only)
```
Same parcel as 3a. Recorded: `.../wms-getfeatureinfo-sofia.geojson`.

## 4. Controls (empty ≠ failure; failure ≠ empty)

- **Black Sea point (43.20 N, 28.90 E)** REST query → HTTP 200, **0 features, no error body** →
  a durable `absent`. Fixture key `seaAbsent`.
- **Invalid field (`outFields=NOTAFIELD`)** → HTTP 200 with `{"error":{"code":400,"message":
  "Failed to execute query.","details":[]}}` → classified `transient` (upstream-failed), never
  "no parcel here". Fixture key `badField`.
- **By-reference** `where=nationalcadastralref='68134.100.5'` → the same parcel, 51-vertex ring.
  Fixture key `refLookup`.
- **Non-browser UA robustness**: 3a re-run with the DEFAULT curl UA (no browser UA) → HTTP 200,
  same body — so the container's Node `fetch` reaches it (no UA gate on `inspire.cadastre.bg`).

## 5. Verdict

BG PARCEL leg = **LIVE, keyless, proven at the capital** — the GR/HR/SI class, NOT a deferral of
the data. What is deferred is the shared-infrastructure ROUTING wiring (BGR is not in the national
resolver → `claimsNation('BG')` is false everywhere today) and the server proxy row — both named
in `bgJurisdiction.ts BG_ROUTING_DEFERRAL`. Rules = DOCUMENTS-ONLY (OUP/PUP per municipality PDF;
Sofia has a city GIS island — Sofiaplan). The paid **official PDF extract** (KAIS) is a separate,
fee-gated *legally-authoritative* product, recorded as a second, deferred source row.
