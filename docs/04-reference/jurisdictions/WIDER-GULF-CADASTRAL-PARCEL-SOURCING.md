# Wider Gulf — Cadastral Parcel Sourcing Survey

**Territory:** Saudi Arabia · Qatar · Kuwait · Bahrain · Oman
**Surveyed:** 2026-09-07
**Companion documents:** [`ae/DUBAI-CADASTRAL-PARCEL-SOURCING.md`](ae/DUBAI-CADASTRAL-PARCEL-SOURCING.md) ·
[`ae/findings/ABU-DHABI-PARCEL-SOURCE.md`](ae/findings/ABU-DHABI-PARCEL-SOURCE.md)

**Method:** every verdict below is backed by a probe with a recorded URL, HTTP status and response
body. No verdict here rests on prose. Where a shape could not be probed it is recorded
`undetermined`, never `does-not-exist`.

> ⚠ **Read this before quoting anything below.** This survey exists because a previous sourcing
> sweep on this project recorded 14 blockers of which **9 were refusals about the wrong product** —
> the agent asked for a bulk download, was refused, and wrote "not available" while the query
> endpoint on the same server served the data freely
> ([[bulk-vs-query-endpoint-false-refusals]]). **Three of the five territories below reproduce that
> pattern exactly:** Qatar, Bahrain and Oman each publish no bulk parcel download whatsoever, and
> each runs a wide-open, anonymous ArcGIS query endpoint serving hundreds of thousands of parcel
> polygons.

---

## 1. Headline

| Territory | Status | Parcels reached | Identifier | Licence |
|---|---|---|---|---|
| **Qatar** | ⭐ **EXISTS AND OPEN** | **251,282** | `PIN` | ⛔ **no grant found** |
| **Bahrain** | ⭐ **EXISTS AND OPEN** | **297,261** | `parcel_no` | ⛔ **no grant found** |
| **Oman (Muscat)** | ⭐ **EXISTS AND OPEN** | **293,860** | `PLOTNUM` / `KROOKINO` | ⛔ **no grant found** |
| **Saudi Arabia** | ⚠ **EXISTS BUT GATED** | 0 — `Token Required` | — | n/a |
| **Kuwait** | ⚠ **EXISTS BUT GATED** (geo-fenced) | 0 — TCP refused | — | n/a |

**842,403 anonymously-fetchable cadastral parcel polygons** were reached across Qatar, Bahrain and
Oman during this survey. **None of the three carries a licence permitting redistribution.** That
tension is the single most important fact in this document and it mirrors Dubai exactly: *the data
is trivially fetchable and legally unresolved.*

⛔ **Nothing in this document authorises baking any of it to R2.** See §7.

---

## 2. What PRYZM needs vs what the Gulf serves

PRYZM resolves a parcel then computes what may be built on it. In Dubai today it falls back to an
OSM building footprint and honestly warns the user it is *"not a legal cadastral parcel … carries no
cadastral reference."* Closing that warning needs, at minimum, a **polygon** and an **identifier**.

| PRYZM need | Spain (Catastro) | Qatar | Bahrain | Oman (Muscat) |
|---|---|---|---|---|
| Parcel polygon | yes | **yes** | **yes** | **yes** |
| Parcel identifier | yes | **yes** (`PIN`) | **yes** (`parcel_no`) | **yes** (`PLOTNUM`, `KROOKINO`) |
| Area | yes | **yes** (`PDAREA`) | **yes** (`par_area`) | partial (`AREA_SQ_M2`, **36 %**) |
| Land use / zoning | partial | no | **yes** (separate `Zones` layer) | **yes** (`LANDUSE`, ~100 %) |
| Max height | must be constructed | no | no | partial (`HEIGHT`, **20 %**) |
| Floors | must be constructed | no | no | partial (`FLOORE`, **31 %**) |
| Setbacks | must be constructed | no | no | partial (`SB_FRONT/BACK/SIDE`, **30 %**) |

⭐ **Oman ships envelope parameters on the parcel record itself** — height, floors, setbacks, built
area, parking and conditions are *columns in the attribute table*, the same inversion of rollout
economics that makes Dubai's DDA layer valuable. **But they are 20–36 % populated, not 95 %+ like
Dubai's.** See §5.3 — this is precisely the [[envelope-solid-overstates-partial-data]] hazard
(L-616): a NULL setback is **UNKNOWN**, and drawing it as zero or unbounded overstates on real land.

---

## 3. Qatar — EXISTS AND OPEN ⭐

**Authority:** Centre for GIS, Ministry of Municipality (MME)

### 3.1 The endpoint

```
https://services.gisqatar.org.qa/server/rest/services/Vector/CadastrePlot/MapServer/0
```

Layer 0 = **`حدود الأراضي المساحية المعتمدة`** ("Approved cadastral land boundaries"),
`esriGeometryPolygon`, `capabilities: Map,Query,Data`, `maxRecordCount: 2000`.

### 3.2 How it was found — and why a directory listing would have missed it

The service is **not listed** in its own parent folder. `GET /server/rest/services/Vector?f=json`
returns only six services (`Landmarks`, three geocoders, two GP servers) — **`CadastrePlot` is absent
from it.** It was found instead through the **ArcGIS Enterprise Portal search API**:

```
https://aldeera.gisqatar.org.qa/portal/sharing/rest/search?q=plot&f=json
```

which is `"access":"public"` and returned it as *"PIN Cadstral Plots"*. This is the
[[getcapabilities-is-not-an-inventory]] lesson landing again, on a different protocol: **the
directory listing is not the layer set.** A sweep that enumerated `/Vector` and stopped would have
recorded Qatar as having no cadastre.

### 3.3 Probes run

| Probe | Status | Result |
|---|---|---|
| `…/CadastrePlot/MapServer?f=json` | 200 | 1 polygon layer, Query enabled |
| `…/MapServer/0?f=json` | 200 | 14 fields; native SR **EPSG:2932** (Qatar National Grid) |
| `…/0/query?where=1=1&returnCountOnly=true` | 200 | **`{"count":251282}`** |
| `…/0/query?…&resultRecordCount=1&f=geojson&outSR=4326` | 200 | real WGS84 polygon, see below |
| `…/0/query?geometry=51.46359,25.31456&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects` | 200 | **1 feature — point-in-polygon works** |
| `…/0/query?geometry=51.52,25.28,51.53,25.29&geometryType=esriGeometryEnvelope&returnCountOnly=true` | 200 | `{"count":141}` — bbox works |
| `/server/rest/services?f=json` | 200 | folders: Collector, Imagery, MobileMapping, Routing, Tafteesh, Utilities, Vector, Vectors |
| `www.gisqatar.org.qa/arcgis/rest/services?f=json` | **200 but soft-404** | ⚠ HTTP 200 with a 404 HTML body — do not read the status alone |
| `services-beta.gisqatar.org.qa/…/QP_Cadastral`, `Parcelswgs84`, `ParcelsPricingFS` | **000** | internal/staging host, not externally reachable |
| `data.gov.qa` API `q=parcel`, `q=cadastral` | 200 | **`nhits: 0`** — the cadastre is *not* on the open-data portal |

**Verified specimen** (`PIN 52220112`, Doha):

```json
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[51.463584719616705,25.314703239949591], …]]},
 "properties":{"PIN":52220112,"PDAREA":509,"GFCODE":"PDGVCDST","CDST_KEY":52220112,
               "JOB":308114,"SHAPE.AREA":508.93489049999999}}
```

**Fields:** `OBJECTID`, `ENDDATE`, `PDSM`, `GFCODE`, `CDST_KEY`, **`PIN`** (plot identification
number), `JOB`, **`PDAREA`** (area m²), `STARTDATE`, `EMP_NUM`, `SHAPE.AREA`, `SHAPE.LEN`, `GLOBALID`.

`ENDDATE`/`STARTDATE` imply a temporal cadastre — parcels are versioned, so a
`where=ENDDATE IS NULL` filter is likely required to get only *current* parcels. **Not verified.**

### 3.4 What is missing

No zoning, no height, no setbacks, no land use. Qatar gives geometry + id + area only — a Catastro
equivalent, no more. The envelope rule pack must still be **constructed** ([[barcelona-data-pipeline-map]]).

---

## 4. Bahrain — EXISTS AND OPEN ⭐

**Authority:** Ministry of Municipalities Affairs & Agriculture (host redirects to `mun.gov.bh`)

### 4.1 The endpoint

```
https://www.ma-investment.gov.bh/arcgis/rest/services/Identify_pg/MapServer/13     ← Parcels
https://www.ma-investment.gov.bh/arcgis/rest/services/Identify_pg/MapServer/14     ← Zones
```

ArcGIS Server **11.3**. Four separate services carry a parcel layer:

| Service | Parcel layer | Also carries |
|---|---|---|
| `Identify_pg/MapServer` | **13 `Parcels`** | `14 Zones`, `15 Block`, `16 Area`, `3 Address`, `19 Bps Zones` |
| `LandClass_En/MapServer` | **1 `parcel`** | `9 Zone`, `16 Block`, `12 Building`, `18 Coast Lines` |
| `bps_gis_pg/MapServer` | **10 `Parcel`** | `12 Zone`, `3 INDUSTRIAL_AREAS`, `8 airport_res`, `17 Building boundary` |
| `MunBaseMapEn_pg/MapServer` | **13 `Parcels`** | `14 Zones`, `1 Green Zone`, `0 Park` |

### 4.2 ⛔ THE TRAP — this host returns 403 to a default `curl` and 200 to a browser

```
curl "…/arcgis/rest/services?f=pjson"                    → HTTP 403
curl -A "Mozilla/5.0 … Chrome/140.0 …" "…?f=pjson"       → HTTP 200
```

**A WAF rejects the default user-agent.** This is a new member of the same family as the bulk-vs-query
error: **the probe was wrong, not the data absent** ([[probe-can-be-wrong-three-ways]]). Every
negative in this document was re-run with a browser UA after this was discovered (§8).

### 4.3 Probes run

| Probe | Status | Result |
|---|---|---|
| `/arcgis/rest/services?f=pjson` (default UA) | **403** | ⚠ WAF false negative |
| `/arcgis/rest/services?f=pjson` (browser UA) | 200 | v11.3; 7 root services + 4 folders |
| `/arcgis/rest/info?f=pjson` | 200 | `isTokenBasedSecurity: true` — *but the parcel layers answer anonymously anyway* |
| `Identify_pg/MapServer/13?f=pjson` | 200 | polygon; native SR **EPSG:20499** (Ain el Abd / Bahrain Grid) |
| `…/13/query?where=1=1&returnCountOnly=true` | 200 | **`{"count":297261}`** |
| `…/13/query?…&resultRecordCount=1&f=geojson&outSR=4326` | 200 | real WGS84 polygon, see below |
| `…/13/query?geometry=50.54190,26.08940&geometryType=esriGeometryPoint&spatialRel=…Intersects` | 200 | **1 feature — point-in-polygon works** |
| `…/14?f=pjson` (Zones) | 200 | `nzp_code`, `nzp_leg`, `nzp_desc_en`, `nzp_desc_ar`, `nzp_source`, `nzp_date` |
| `data.gov.bh` ODS API, `q=parcel` / `cadastral` / `plot` | 200 | **no parcel geometry** — see §4.5 |
| `geoportal.slrb.gov.bh` (`/`, `/arcgis/rest/services`, `/server/rest/services`, `/portal/sharing/rest`, `/geoserver/wfs`) | **503** on all | resolves (54.246.67.146, AWS) but serves nothing; retried with browser UA — still 503 |
| `www.bahrain.bh/geoserver/wms?…GetCapabilities` | 404 | no WMS |
| `gis.slrb.gov.bh`, `gis.gov.bh`, `maps.bahrain.bh`, `gisportal.gov.bh`, `benayat.gov.bh` | NXDOMAIN | — |
| `www.benayat.bh/building-permits/` | 200 | marketing site; the plot map is behind permit-portal login |

**Verified specimen** (`parcel_no 12005932`):

```json
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[50.541625436272966,26.089427168783217], …]]},
 "properties":{"objectid":1,"parcel_no":"12005932","par_area":1501.379,
               "parcel_cl":"NUM","st_area(shape)":1500.2553564514758}}
```

**Fields:** `objectid`, `shape`, **`parcel_no`**, **`par_area`**, `parcel_cl` (parcel class),
`st_area(shape)`, `st_perimeter(shape)`.

### 4.4 Zoning is a separate, joinable layer ⭐

`Identify_pg/MapServer/14 Zones` carries `nzp_code` / `nzp_desc_en` — the **National Zoning Plan**
classification, as polygons. Bahrain is therefore the only territory in this survey offering
**parcel geometry and a normative zoning classification from the same server**, joinable spatially.
Whether `nzp_code` maps to a published height/FAR table is **undetermined** — the legal rule pack
still has to be sourced.

### 4.5 The open-data portal is a dead end, and this is worth recording

`data.gov.bh` is Opendatasoft with **514 datasets, 37 of them geo-enabled**. All 37 were enumerated:
they are **POI point layers without exception** — cemeteries, petrol stations, hospitals, mosques,
schools, embassies. SLRB publishes only **statistical tables** there ("Area by Governorate", "Number
of GCC Nationals Owning Real Estate"). **There is no parcel geometry on the open-data portal.**

⭐ A sweep that probed only the open-data portal — the shape most sourcing exercises reach for
first — would have recorded Bahrain as `does-not-exist`, while 297,261 parcels sat on an unadvertised
ArcGIS server behind a UA check.

---

## 5. Oman — EXISTS AND OPEN ⭐ (Muscat only)

**Authority:** Muscat Municipality (بلدية مسقط)

### 5.1 The endpoints

```
https://geoportal.mm.gov.om/server/rest/services/MM/EnglishWebsite_mmm12c/MapServer/6   ← Plots, 293,860, city-wide
https://geoportal.mm.gov.om/server/rest/services/SeebContract_MIL1/MapServer/11         ← MUSCAT.Plots, 94,630, Seeb
```

ArcGIS Server **11.5**, anonymous, browser UA required (same WAF family as Bahrain).

### 5.2 Probes run

| Probe | Status | Result |
|---|---|---|
| `/server/rest/services?f=pjson` | 200 | v11.5; 22 root services + 8 folders |
| `MM/EnglishWebsite_mmm12c/MapServer?f=pjson` | 200 | 10 layers incl. **`6 Plots`** |
| `…/6/query?where=1=1&returnCountOnly=true` | 200 | **`{"count":293860}`** |
| `…/6/query?…&resultRecordCount=1&f=geojson&outSR=4326` | 200 | real WGS84 polygon |
| `SeebContract_MIL1/MapServer/11?f=pjson` | 200 | `MUSCAT.Plots`, 21+ fields, field-level descriptions |
| `…/11/query?where=1=1&returnCountOnly=true` | 200 | `{"count":94630}` |
| `…/11/query?…&f=geojson&outSR=4326` | 200 | carries **`KROOKINO`** = `"01-05-013-01-1118"` |
| `nsaomangeoportal.gov.om/arcgis|server|portal/…` | **500** on all | Drupal CMS, not an ArcGIS host; retried with browser UA — still 500 |
| `nsdi.gov.om`, `www.nsdi.gov.om`, `nsgia.gov.om`, `ngdb.nsa.gov.om`, `arcgis.ncsi.gov.om` | NXDOMAIN | — |
| `nsdig2gapps.ncsi.gov.om` | 000 | resolves, TCP unreachable |
| `gis.mm.gov.om`, `mohup.gov.om` | 000 | resolve, TCP unreachable |

**Verified specimen** (Seeb, `PLOTNO 1118`):

```json
{"properties":{"KROOKINO":"01-05-013-01-1118","PLOTNO":"1118","PLOTAREA":748,"PLOTUSAGECD":2,
               "PERMITNO":1008,"PERMITYEAR":1993,"PERMITTYPE":"Major",
               "WILAYATNAME_E":"al Seeb","NEWHOUSINGAREANAME_E":"al Hail North"}}
```

`KROOKINO` is the **Krooki** (كروكي) survey-plan reference — Oman's legal cadastral identifier, the
true Catastro-reference analogue in this survey.

### 5.3 ⚠ The envelope columns exist but are 20–36 % populated — MEASURED, not assumed

The city-wide `Plots` layer schema includes `FLOORE`, `HEIGHT`, `B_AREA`, `SB_FRONT`, `SB_BACK`,
`SB_SIDE`, `PARKING`, `CONDITIONS`, `LANDSTATUS`. Population was **measured**, not eyeballed, with
`returnCountOnly` against `<field> IS NOT NULL` over all 293,860 rows:

| Field | Non-null | Share |
|---|---|---|
| `PLOTNUM` | 293,838 | **99.99 %** |
| `LANDUSE` | 293,847 | **99.99 %** |
| `AREA_SQ_M2` | 104,398 | **35.5 %** |
| `FLOORE` (floors) | 90,455 | **30.8 %** |
| `SB_FRONT` (setback) | 88,410 | **30.1 %** |
| `HEIGHT` | 58,571 | **19.9 %** |

⛔ **Do not present Oman as "Dubai-grade envelope data".** Geometry, identifier and land use are
complete; the envelope parameters are a minority of rows. Per
[[envelope-solid-overstates-partial-data]] (L-616) a NULL here is **UNKNOWN** and must refuse or be
marked unknown — never rendered as zero setback or unbounded height.

### 5.4 Coverage is Muscat, not Oman

This is a **municipal** server. The national authority (NSGIA) runs
`nsaomangeoportal.gov.om` as a Drupal **product catalogue** — ~600 products behind
"Product Categories / Commercial status / Product Type" filters, i.e. a **sales catalogue**, with a
"Free downloads" section. National cadastre sits with the Ministry of Housing & Urban Planning
(`mohup.gov.om`, TCP unreachable). Sohar and Dhofar municipalities were **not probed** —
`undetermined`, not absent.

---

## 6. Saudi Arabia and Kuwait — EXISTS BUT GATED

### 6.1 Saudi Arabia — the dataset is real, served, and token-gated ⚠

> ⛔ **This partially overturns the inherited project verdict.** Saudi was previously recorded as
> "nationally blocked". The precise, probed truth is **`exists-but-gated`, not `does-not-exist`** —
> and the distinction matters, because this project has a standing pattern for gated datasets
> ([[identity-bootstrap-gate-offline-legislation-pattern]]): record the dataset, record the gate,
> ship offline legislation plus a deferred stub rather than pretending the data is absent.

**Authority:** Ministry of Municipalities & Housing (MOMAH) / Balady — *Urban Maps* (الخرائط الحضرية)

The live application is `https://umaps.momah.gov.sa/` (reached by following
`balady.gov.sa/en/start-service/11432` → 200). Its Angular bundle names `/portal/` and
`/api/{App,App2,Config,Identity}.Api/`, plus SSO at `ssoapp.balady.gov.sa`.

| Probe | Status | Result |
|---|---|---|
| `umaps.momah.gov.sa/portal/sharing/rest/portals/self?f=json` | **200** | live ArcGIS Enterprise Portal, `"access":"public"` |
| `umaps.momah.gov.sa/server/rest/services?f=json` | **200** | **ArcGIS Server 11.5**, folders `["Hosted","umaps","Utilities"]` |
| `…/server/rest/services/umaps?f=json` | 200 | **empty service list** — directory listing suppressed |
| `…/server/rest/services/umaps/{Balady,Landbase_Parcel,Parcel,Parcels,BaseMap,UrbanMaps}/{Map,Feature}Server?f=json` (16 probes) | 200 | **`{"error":{"code":499,"message":"Token Required"}}`** on every one |
| `…/portal/sharing/rest/search?q=orgid:…&type="Feature Service"` (+ Map Service, Vector Tile, Web Map) | 200 | **`total: 0`** — 305 portal items, all stock Esri catalogue entries, zero public data services |
| `webgis.eamana.gov.sa/arcgisnew/rest/services/Balady/MapServer` | **NXDOMAIN** | cited in search results as carrying `Landbase_Parcel`; **dead from two independent networks** — stale search index, see §8 |
| `data.gov.sa`, `open.data.gov.sa` | 000 | TCP unreachable from two networks |
| `gasgi.gov.sa` (+ 4 subdomains) | **NXDOMAIN** | national authority's host does not resolve from either network |
| `maps.rega.gov.sa`, `gis.momah.gov.sa`, `gis.alriyadh.gov.sa`, `maps.amanatjeddah.gov.sa` (+6) | NXDOMAIN | — |
| `rega.gov.sa` | 503 | — |

**Verdict:** the parcel data demonstrably exists and is served by a running ArcGIS Server. The gate
is an **ArcGIS token obtained through Balady SSO**, which is bound to Saudi national identity
(Absher/NAFATH). Balady's own service description advertises *"land categories, plot sizes, and
building regulations"* — i.e. parcel **and** envelope rules. `Token Required` is an application-level
answer from a live service; it is not a network failure and must not be recorded as absence.

**Note on `Landbase_Parcel`.** Search results confidently cite a Balady MapServer with layers
`Landbase_Parcel`, `restricted_parcels`, `Plan_Data`. That host is **NXDOMAIN from two independent
networks**. Those layer names are good evidence of *what MOMAH holds*; they are **not** a reachable
endpoint. Do not paste that URL into code.

### 6.2 Kuwait — PACI is real and geo-fenced ⚠

**Authority:** Public Authority for Civil Information (PACI)

| Probe | Status | Result |
|---|---|---|
| `exgisapps.paci.gov.kw` | DNS **91.102.146.137**; TCP **timeout** (sandbox) / **ECONNREFUSED** (Anthropic US network) | resolves, refuses |
| `kuwaitportal.paci.gov.kw` | DNS **91.102.145.80**; TCP 000 | resolves, refuses |
| `gis.paci.gov.kw`, `kuwaitfinder.paci.gov.kw`, `www.paci.gov.kw` | 000 | resolve, refuse |
| `paci-esridubaioffice.opendata.arcgis.com` | 200 (Hub SPA shell) | `hub.arcgis.com/api/v3/domains/…` → **404 "Domain record… does not exist"** — dead Hub site |
| `arcgis.com/sharing/rest/search?q=owner:PACI` | 200 | `total: 0` — PACI publishes nothing to ArcGIS Online under that owner |
| `arcgis.com/…/items/4f2468bb19a144f792f61e5b86244840/data` | 200 | ⭐ public webmap references `https://kuwaitportal.paci.gov.kw/arcgisportal/rest/services/Hosted/KuwaitBasemap/MapServer` |
| `data.gov.kw` | 000 | unreachable |
| `www.e.gov.kw` | 403 | — |

**Verdict: `exists-but-gated` (geo-fenced), not `does-not-exist`.** PACI demonstrably operates an
ArcGIS Portal — a *public* ArcGIS Online webmap points straight at it — but every PACI host refuses
connections from **two independent networks on two continents**, while `gisqatar.org.qa` answered
fine from the same vantage point. That pattern is IP geo-fencing to Kuwait, not absence.

⚠ **Separately, and importantly: PACI may be the wrong authority for parcels.** PACI's mandate is
**addressing** — Kuwait Finder resolves to flat level, and its units are block / street / building /
unit. Legal land parcels sit with the Ministry of Justice's real-estate registration and Kuwait
Municipality. **Whether PACI serves parcel POLYGONS at all is `undetermined`.** A future probe from
a Kuwait-resident IP should establish which of the two questions it is answering before concluding
anything. Do not record Kuwait as "no cadastre" on the strength of this survey.

---

## 7. ⛔ Licence — the blocking axis for all three open sources

**Being able to fetch data is not authority to redistribute it.** PRYZM bakes context into R2 tiles
and serves them to users; that is redistribution.

| Source | Licence probe | Result |
|---|---|---|
| Qatar `CadastrePlot` | service `copyrightText` | **empty string** |
| Qatar | `data.gov.qa` licence (CC BY) | ⚠ **does not apply** — `q=parcel` and `q=cadastral` both return `nhits: 0`; the cadastre is not published there |
| Qatar | AGOL item `5ba2266f06a741138614852c86b35175` (*Qatar Geoportal*, owner `CGIS_Qatar`) `licenseInfo` / `accessInformation` | **both empty** |
| Qatar | `gisqatar.org.qa` homepage terms | could not retrieve — **UNREAD** |
| Bahrain | service `copyrightText` (all four services) | **empty string** |
| Bahrain | `mun.gov.bh/newportal/en/terms-and-conditions` | **404** — **UNREAD** |
| Oman | service `copyrightText` | **empty string** |
| Oman | NSGIA catalogue | a **commercial** product catalogue with a "Commercial status" filter — implies national geodata is **sold**, which is evidence *against* free redistribution |

**Verdict for all three: NO LICENCE GRANT WAS FOUND.** That is not the same as permissive. Absent an
express grant, government geospatial data defaults to **all rights reserved**.

⛔ **Do not bake Qatar, Bahrain or Oman parcels to R2 on the strength of this survey.** The correct
next step is a written licence enquiry to each authority (MME Centre for GIS; Bahrain Ministry of
Municipalities Affairs; Muscat Municipality), exactly as Dubai's DDA finding concluded. A wrong "yes"
here is a legal problem, not a technical one.

**A live per-request proxy is a materially different legal act from baking**, and may be defensible
where baking is not — but that is a decision for the founder with counsel, not an inference this
document is entitled to make.

---

## 8. Method notes — three ways this survey nearly produced false negatives

Recorded because each one would have manufactured a blocker, and this project has paid for exactly
that mistake before.

1. **A 403 that was a user-agent check.** Bahrain's entire cadastre — 297,261 parcels — sat behind a
   WAF that rejects `curl`'s default UA with **HTTP 403** and serves **HTTP 200** to a browser UA.
   After discovering this, **every** negative in this survey was re-run with a browser UA; none of
   the others flipped, but Bahrain alone would have been recorded `does-not-exist`.
2. **An HTTP 200 that was a 404.** `www.gisqatar.org.qa/arcgis/rest/services?f=json` returns **status
   200 with a 404 HTML body**. Reading the status code alone would have recorded a working endpoint;
   reading the body alone, on the *correct* host, found 251,282 parcels.
3. **A directory listing that was not the layer set.** Qatar's `CadastrePlot` is absent from its own
   `/Vector` folder listing and was found only via the Portal search API. Bahrain's parcel services
   are on a host (`ma-investment.gov.bh`) that redirects to an unrelated ministry homepage and is
   advertised nowhere. **Enumerate, then probe past the enumeration**
   ([[getcapabilities-is-not-an-inventory]]).

**Two independent network vantage points** were used throughout (the local sandbox and Anthropic's
US-based fetcher) specifically to separate *geo-fenced* from *dead*. That distinction is what
separates Kuwait (`exists-but-gated`) from `webgis.eamana.gov.sa` (NXDOMAIN from both — genuinely
gone).

---

## 9. Open questions

1. **Qatar temporal filter** — do `STARTDATE`/`ENDDATE` mean superseded parcels are retained? Is
   `where=ENDDATE IS NULL` required for current-state? Unverified.
2. **Bahrain `nzp_code` → rule pack** — does the National Zoning Plan code map to a published
   height/FAR/setback table? If so Bahrain becomes a full envelope source.
3. **Oman beyond Muscat** — Sohar and Dhofar municipality servers were never probed.
4. **Kuwait from a Kuwaiti IP** — does PACI serve parcel polygons, or only addressing? And is the
   real cadastral authority the Ministry of Justice instead?
5. **Saudi token** — is a Balady/NAFATH token obtainable by a non-resident commercial entity, and do
   its terms permit re-serving? This determines whether the largest Gulf market is reachable at all.
6. **Licence, for all three open sources** — the blocking question. §7.
