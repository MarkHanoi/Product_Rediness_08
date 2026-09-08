# Abu Dhabi (UAE) — cadastral PARCEL source (sourcing survey, all six access shapes probed)

**Dated:** 2026-09-07 · **Probe origin:** US-region egress (Windows/curl) · **Territory:** Emirate of
Abu Dhabi only (Dubai and the wider Gulf are sibling lanes).
**Status:** **DATA FOUND, OPEN, AND PRODUCTION-SHAPED — but `LICENCE UNREAD`, so NOT cleared to bake.**

> ⚠ **RE-TESTED ADVERSARIALLY 2026-09-07 — see [Appendix A](#appendix-a--adversarial-re-test-2026-09-07-independent-lane).**
> **Five verdicts moved**, including a third ArcGIS context (`agsimage`) carrying a **0.5 m DTM/DSM**
> and a working **raster bulk export**. The licence blocker **survives and is reinforced**:
> `licenseInfo` is present-and-empty, not absent. **Nothing here is cleared to bake.**

> **Founder's ask:** *"gather cadastral parcel at middle east — dubai and abu dhabi not just osm
> buildings — i need parcels — cadastral data."* Today an Abu Dhabi site falls back to an OSM
> building footprint and the panel honestly says *"⚠ Building footprint (OSM) — NOT a legal cadastral
> parcel."* **This document closes the data half of that gap and leaves the legal half open.**

---

## 0 — VERDICT (read this first)

**A public, keyless, no-account ArcGIS REST endpoint serves the Abu Dhabi emirate plot cadastre —
polygon geometry, plot identifier, plot number, district, community, municipality — for all
425,975 plots across all three municipalities.** It answers point-in-polygon queries, which is
exactly the shape PRYZM needs to resolve a parcel under a map click.

| Axis | Reading |
|---|---|
| Status | **exists-and-open** (HTTP 200, no key, no login, no referer check) |
| Parcel polygon | **YES** — `esriGeometryPolygon`, native **WGS84 (wkid 4326)** |
| Parcel identifier | **YES** — `PLOTID` **and** `PLOTNUMBER`, both **100% populated** (425,975 / 425,975) |
| Coverage | **Emirate-wide** — ADM 231,794 + AAM 153,371 + WRM 40,810 = **425,975 exactly** |
| Land use | **PARTIAL and DIRTY** — `PRIMARYUSEARA` populated on **151,878 (35.7%)**; the code↔label map is **not 1:1** |
| Bulk download | **NO** — but **paged query serves the whole layer** (213 pages × 2,000) |
| **Licence** | 🔴 **UNREAD.** No `licenseInfo`, no `accessInformation`, no terms page. **Blocker for baking.** |

**The one thing that must happen before this ships:** written confirmation from AD-SDI / DGE that
this layer may be redistributed. **Reaching the data is not authority to redistribute it.**

---

## 1 — THE DECIDING PROBE (verbatim, live 2026-09-07)

**Service:** `https://arcgis.sdi.abudhabi.ae/agspublish/rest/services/Pub/Generic_Search/MapServer`
**Layer 10 = `Plots`** · `copyrightText: "Copyright:© 2018 AD-SDI, DPM"` · `capabilities: Map,Query,Data`

Point-in-polygon, the real PRYZM call — a point in Mohamed Bin Zayed City:

```
GET .../Pub/Generic_Search/MapServer/10/query
  ?geometry={"x":54.5433,"y":24.35918,"spatialReference":{"wkid":4326}}
  &geometryType=esriGeometryPoint&inSR=4326
  &spatialRel=esriSpatialRelIntersects
  &outFields=PLOTID,PLOTNUMBER,DISTRICTENG,PRIMARYUSEENG
  &returnGeometry=true&outSR=4326&f=geojson
→ HTTP 200
```

```json
{"type":"FeatureCollection","features":[{"type":"Feature",
 "geometry":{"type":"Polygon","coordinates":[[
   [54.543635292,24.359471020],[54.543035239,24.359447302],
   [54.543061139,24.358897683],[54.543661190,24.358921392],
   [54.543635292,24.359471020]]]},
 "properties":{"PLOTID":"437972","PLOTNUMBER":"39",
   "DISTRICTENG":"MOHAMED BIN ZAYED CITY","PRIMARYUSEENG":13}}]}
```

Computed from the returned ring: **3,730.0 m², perimeter 244.3 m, 4 corners.** A plausible real plot.

**Second municipality, to prove it is not just Abu Dhabi island** — a point in Al Ain:

```
...&geometry={"x":55.7047,"y":24.1994,...} → HTTP 200, features=1
{"PLOTID":"49614","PLOTNUMBER":"5","DISTRICTENG":"AL MUWAIJ`I","MUNICIPALITYENG":"AAM"}
```

This is the Catastro-equivalent for Abu Dhabi: a legal plot boundary with a plot reference,
replacing the OSM-footprint fallback.

---

## 2 — HOW IT WAS FOUND (and why a naive sweep would have missed it)

Three traps, all of which a previous-generation sweep would have recorded as "not available":

1. **The documented host path is dead.** Every search result and the SDI portal's own HTML point at
   `https://arcgis.sdi.abudhabi.ae/arcgis/rest/services` → **HTTP 404**. Stopping there yields a
   false negative. The server is alive; only the *context name* changed.
2. **The real contexts are `/agspublish/` and `/agshost/`, not `/arcgis/`.** These were recovered
   **from the ArcGIS Portal's own `portals/self` response** (`defaultBasemap.baseMapLayers[].url`),
   not from any documentation.
3. **The parcel layer is not called "parcel" or "cadastre".** It is layer **10** inside a service
   named **`Generic_Search`**. A keyword sweep for *parcel* / *cadastre* returns **0 relevant hits**
   on this portal (`q=cadastr` → `total: 0`). Only full enumeration of every folder found it.

**Also note (⚠ the folder listing is not an inventory either):** `agspublish` folders `Res`,
`ADCMC`, `Conf` and `ITC` all return HTTP 200 with `services: []` — they exist but list nothing.
Those are permission-hidden, not empty. There may be more here than is enumerable anonymously.

---

## 3 — FULL PROBE LOG — ALL SIX ACCESS SHAPES

Per the standing doctrine, no negative below is recorded without the probe that produced it.

### Shape 1 — Bulk download — ❌ NEGATIVE (but irrelevant, see shape 4)
| Probe | Result |
|---|---|
| `.../Pub/Generic_Search/MapServer/createReplica?f=json` | HTTP 200 but returns the *service description*, i.e. endpoint absent — MapServer has no replica/extract |
| `portal/sharing/rest/content/items/69329c9429c440edb8b6c8d9ec04798b/data` (VTPK package) | HTTP 200, `content-type: application/json`, **size 0** — empty, no package served |

**No zipped SHP / GeoPackage / GeoJSON export exists.** ⚠ **This is precisely the refusal that must
NOT be written down as "no data" — the query endpoint on the same server serves the entire layer.**

### Shape 2 — OGC WFS — ❌ NEGATIVE (extension not enabled)
| Probe | Result |
|---|---|
| `/agspublish/services/Pub/Generic_Search/MapServer/WFSServer?service=WFS&request=GetCapabilities` | **HTTP 400** — ArcGIS Server Error page |
| `/agspublish/rest/services/Pub/Generic_Search/MapServer/exts/WFSServer?request=GetCapabilities&service=WFS` | HTTP 200 but an **HTML error page**, not a WFS capabilities document |

### Shape 3 — OGC WMS — ❌ NEGATIVE (extension not enabled)
| Probe | Result |
|---|---|
| `/agspublish/services/Pub/Generic_Search/MapServer/WMSServer?service=WMS&request=GetCapabilities` | **HTTP 400** — ArcGIS Server Error page |

WFS/WMS extensions are simply not turned on. This does **not** gate anything — ArcGIS REST is
strictly more capable here.

### Shape 4 — ArcGIS REST — ✅ **THIS IS THE ONE THAT WORKS**
| Probe | Result |
|---|---|
| `/arcgis/rest/services?f=json` | **HTTP 404** — the documented path, dead (trap #1) |
| `/portal/sharing/rest?f=json` | HTTP 200 `{"currentVersion":"9.2"}` |
| `/portal/sharing/rest/portals/self?f=json` | HTTP 200 · **`"access":"public"`** · leaked the real contexts |
| `/agshost/rest/services?f=json` | HTTP 200 · v10.91 · 8 folders · **75 services** |
| `/agspublish/rest/services?f=json` | HTTP 200 · v10.91 · 17 folders · **41 services** |
| `.../Pub/Generic_Search/MapServer?f=json` | HTTP 200 · 15 layers · L10 = **Plots** |
| `.../MapServer/10?f=json` | HTTP 200 · polygon · SR 4326 · `Map,Query,Data` · maxRecordCount 2000 |
| `.../10/query?where=1=1&outFields=*&resultRecordCount=1&f=geojson` | **HTTP 200 — real plot + polygon** |
| `.../10/query?where=1=1&returnCountOnly=true` | HTTP 200 · **`{"count":425975}`** |
| `.../10/query` point-in-polygon (MBZ City, Al Ain) | HTTP 200 · 1 feature each |
| `.../10/query?resultOffset=200000&resultRecordCount=3&orderByFields=OBJECTID` | **HTTP 200** — deep pagination works |
| `.../10/query?resultRecordCount=5000` | HTTP 200 · returns **2000** (server cap) · `exceededTransferLimit:true` |

**Bulk extraction is therefore available via paged query:** 425,975 ÷ 2,000 = **213 requests**.
This is the "bulk vs query endpoint" pattern in its textbook form.

### Shape 5 — Vector / raster tiles — ✅ SERVED, but ❌ USELESS AS A DATA SOURCE
`/agshost/rest/services/Hosted/Plots_AD/VectorTileServer` → HTTP 200, `"name":"AD Plots"`, maxzoom 19.

Fetched a real tile `tile/14/7043/10666.pbf` → **HTTP 200, 15,201 bytes gzip**, decoded with a
hand-written MVT parser:

```
LAYER 'AD_Plots_NoZayedCity'  features=14  extent=4096
KEYS(2): ['_symbol', '_minzoom']
FEATURE 0: geomtype=POLYGON  _symbol=2
```

⭐ **The plot ID and area were stripped at cache-bake time — only `_symbol` and `_minzoom` survive.**
So the tiles give geometry with **no cadastral reference**. This endpoint would reproduce exactly the
defect the founder is trying to fix. **Use the query endpoint, not the tiles.**
(`_symbol` does decode to a land-use class via `resources/styles/root.json`: 0 Agricultural,
2 Commercial, 8 Private, 11 Residential, 13 Other-Undefined, etc. — **but see §5, this is a
*different* code list from `PRIMARYUSEENG` and the two must not be conflated.**)
Sibling tile services: `Hosted/ZayedCity_Master_Plots`, `Hosted/ZayedCityMasterPlotPlan2023`
(Zayed City master plot plan, land-use classified, 19 style layers).

### Shape 6 — Open-data portals — ⚠️ UNDETERMINED (network-blocked from this egress)
| Portal | Probe | Result |
|---|---|---|
| `data.abudhabi/opendata/` | GET | HTTP 200 (Drupal) — reachable |
| `data.abudhabi/opendata/api/3/action/package_search?q=parcel` | GET | **HTTP 404** — not CKAN |
| `data.abudhabi/opendata/search?query=parcel` | GET | HTTP 200 **`Request Rejected`** (BIG-IP ASM WAF) |
| `addata.gov.ae` (AD Open Data Platform, has an AD-SDI group) | GET, IPv4 forced, `-k` | **TCP connect to 185.66.18.56:443 hangs — HTTP 000.** WebFetch: `self signed certificate` |
| `ssdi.gov.abudhabi/dev_datacatalogue_API/.../webdatacataloguelist` (the SDI's own catalogue API, found in the portal's JS) | GET | DNS returns **only a sinkhole IPv6**; via `--resolve` to the SDI IPv4 → **`SEC_E_WRONG_PRINCIPAL`** cert mismatch. On the reachable host → WAF `Request Rejected` |
| `sdi.gov.abudhabi/sdi/opendata.html` | GET | HTTP 200 — **"AD-SDI Open Data Services"**, themes incl. **Land Use**, **Urban** |

⚠ **These are `undetermined`, NOT `does-not-exist`.** They fail at the network/WAF layer from this
egress. A probe from a UAE-region egress should be re-run before anyone concludes anything about
`addata.gov.ae` or the AD-SDI data catalogue API — the catalogue API in particular is the artefact
that would tell us whether the Plots layer is formally classified as Open Data (§6).

---

## 4 — THE LAYER, IN FULL

`.../Pub/Generic_Search/MapServer/10` — `Plots` — `esriGeometryPolygon` — SR **4326** — 425,975 rows.

| Field | Type | Notes |
|---|---|---|
| `PLOTID` | String | **the cadastral reference — 100% populated** |
| `PLOTNUMBER` | String | plot number within district — **100% populated** (e.g. `39`, `C58`) |
| `DISTRICTENG` / `DISTRICTARA` / `DISTRICTID` | String | e.g. `MOHAMED BIN ZAYED CITY` |
| `COMMUNITYENG` / `COMMUNITYARA` | String | e.g. `Z6` / `محمد بن زايد 6` |
| `MUNICIPALITYENG` / `MUNICIPALITYARA` | String | `ADM` / `AAM` / `WRM` |
| `PRIMARYUSEENG` | **Integer** | land-use **code**, 19 distinct values 0–18 — ⚠ see §5 |
| `PRIMARYUSEARA` | String | Arabic land-use label — **only 35.7% populated** |
| `ROADID`, `FLAT_ID`, `SOURCEOFORIGIN` | String | `SOURCEOFORIGIN` domain: ADM / ADNOC / ADSIC / ADWEA / TPSS… |
| `SHAPE.STArea()` | Double | ⛔ **in square DEGREES** (`3.30e-07`), not m² — must be recomputed geodetically |

**Sibling layers in the same service** (all queryable, same access):
`0 Landmarks · 1 POI · 2 Gazetteer · 3 Street Addressing (Onwani) · 4 Address Unit · 5 Streets ·
6 District · 7 Buildings · 8 Main Buildings · 9 Misc. Constructions · 10 Plots ·
11 Administrative Boundaries · 12 Community · 13 District · 14 Municipality`

⭐ **Bonus: layer 8 `Main Buildings` = 785,002 authoritative building footprints** with `BUILDINGID`
(polygon, `Map,Query,Data`). That is a candidate replacement for the OSM building fallback in its own
right, and it lives behind the same access and the same unresolved licence.

---

## 5 — ⚠ DATA-QUALITY CAVEATS (do not skip these)

1. **`SHAPE.STArea()` is in square degrees.** Any area shown to a user must be recomputed from the
   ring. Shipping the raw field would print a nonsense area on a legal document surface.
2. **`PRIMARYUSEENG` is NOT a clean coded domain.** No coded-value domain is attached to the field.
   A `groupBy` of code × Arabic label (HTTP 200) shows **collisions**:
   - code `2` → `تجارية` (commercial, 3,486) **and** `سكنية` (residential, 8,010)
   - code `13` → `سكنية` (residential, 82,043) **and** `مباني سكنية` (1)
   - code `16` → `عامة` (public, 5,001), `صحية` (health, 1,496) **and** `تجارية/سكنية` (139)
   - code `0` → `زراعية` (agricultural, 39,627), `مزارع` (farms, 94), `أخرى` (other, 1)
   **A single code maps to multiple uses.** This layer's land use is *indicative*, **not normative
   zoning**, and must not be fed to a buildable-envelope calculation as if it were a zoning class.
   (MEMORY §getcapabilities-is-not-an-inventory: *surveyed ≠ normative*.)
3. **Land use is absent on 64.3% of plots** (`PRIMARYUSEARA IS NOT NULL` → 151,878 of 425,975).
   Per MEMORY §envelope-solid-overstates-partial-data, an UNKNOWN land use must render as UNKNOWN,
   never as a permissive default.
4. **The vector-tile `_symbol` list (14 classes) and `PRIMARYUSEENG` (19 codes) are different code
   lists.** They must not be joined. The tile symbology is a cartographic reclass, not the domain.
5. **A point can legitimately return zero features** — roads, corniche and public realm are not
   plots. My first probe at (54.3773, 24.4539) returned `features: 0`; that was a genuine miss, not
   an endpoint failure, proven by the same query succeeding on a known-inside point. The UI must
   distinguish *"no plot here"* from *"lookup failed"* (MEMORY §context-data-honesty-family:
   **failure and empty are the same value** unless you separate them deliberately).

---

## 6 — 🔴 LICENCE — THE ACTUAL BLOCKER

**I could not read a licence for this dataset. It is therefore `UNREAD`, and baking is NOT cleared.**

What was checked:

| Probe | Result |
|---|---|
| Portal item `69329c9429c440edb8b6c8d9ec04798b` (`.../content/items/<id>?f=json`) | HTTP 200 — **`licenseInfo` ABSENT, `accessInformation` ABSENT** |
| `sdi.gov.abudhabi/sdi/{terms,legal,disclaimer,privacy,copyright,termsofuse,terms-conditions}.html` | **all HTTP 404** — no terms page exists on the SDI site |
| Service `copyrightText` | `"Copyright:© 2018 AD-SDI, DPM"` — an **assertion of copyright**, not a grant |
| `data.abudhabi/addata_open_license` | HTTP 200 but a **JS shell**; extracted text = 49 chars. **Licence body not readable.** WebFetch also returned only the header |
| ADDA *Open Data Implementation Guidelines* PDF | **HTTP 301 → `www.dge.gov.ae/intro/`** — ADDA is now DGE; the PDF is gone |
| `u.ae` open-government-data pages | The "UAE federal open data licence" is referenced as a PDF but **no direct URL surfaced**; the two page variants returned 404 / no licence body |

**What is reported second-hand but NOT verified:** search summaries describe a **UAE Federal Open
Data License** permitting reuse, modification, redistribution and **commercial** use subject to
attribution and non-misrepresentation. **I did not read that text**, so I am not relying on it.

**Two distinct reasons that is insufficient even if true:**

1. **I have not read it.** The lane rule is explicit — *do not recommend baking anything whose
   licence you have not read.*
2. **Scope.** The Plots layer is **not published on `data.abudhabi`**. It sits in the `Pub` folder of
   the AD-SDI ArcGIS server under an `© AD-SDI, DPM` notice, with no licence metadata. Even a fully
   read federal open-data licence would not automatically extend to it. AD-SDI *does* separately
   brand an `OpenData/ADSDI_OpenData` service and an "AD-SDI Open Data Services" page — and
   **`Plots` is not in that OpenData service.** That distinction is the whole question.

⛔ **Verdict: fetchable ≠ redistributable.** PRYZM bakes context into R2 tiles and serves them to
users; that is redistribution. **Do not bake this layer** until AD-SDI / DGE confirms in writing.

---

## 7 — RECOMMENDED WIRING (once, and only once, the licence clears)

**Live query, not a bake** — this sidesteps the redistribution question almost entirely, because
nothing is copied or re-served:

```
POST/GET https://arcgis.sdi.abudhabi.ae/agspublish/rest/services/Pub/Generic_Search/MapServer/10/query
  geometry={"x":<lon>,"y":<lat>,"spatialReference":{"wkid":4326}}
  geometryType=esriGeometryPoint  inSR=4326
  spatialRel=esriSpatialRelIntersects
  outFields=PLOTID,PLOTNUMBER,DISTRICTENG,COMMUNITYENG,MUNICIPALITYENG,PRIMARYUSEENG,PRIMARYUSEARA
  returnGeometry=true  outSR=4326  f=geojson
```

- Mirrors the Catastro path: click → real plot polygon + `PLOTID` + `PLOTNUMBER`.
- Recompute area geodetically from the ring; **never** surface `SHAPE.STArea()`.
- Render land use as **indicative**, and as **UNKNOWN** for the 64.3% that lack it.
- ⚠ The server is behind a **BIG-IP WAF** that sets `TS…` cookies and rejects some request shapes —
  expect to need a browser-ish UA, and treat a `Request Rejected` HTML body as a distinct failure
  mode from an HTTP error (it arrives with **HTTP 200**).
- ⚠ No CORS check was performed. A browser-direct call may need the existing same-origin proxy
  (MEMORY §csp-is-not-cors-r2-bucket). **Probe before designing around it.**

---

## 8 — OPEN QUESTIONS

1. **Licence — the blocker.** Written confirmation from AD-SDI / DGE that the `Pub/Generic_Search`
   Plots layer may be redistributed and cached. Until then: live query only, or nothing.
2. **Is `Plots` formally classified Open Data?** Answerable from the AD-SDI data-catalogue API
   (`ssdi.gov.abudhabi/dev_datacatalogue_API/...`) — **unreachable from this egress**. Re-probe from
   a UAE-region egress.
3. **`addata.gov.ae` is entirely unprobed** (TCP hang + cert fault). It hosts an AD-SDI group and may
   carry the same layers under an explicit open licence — which would resolve Q1 outright.
4. **`PRIMARYUSEENG` domain.** No published code list. Needs an authoritative mapping from AD-SDI, or
   it stays indicative forever.
5. **Hidden folders.** `Res`, `ADCMC`, `Conf`, `ITC` return `services: []` — permission-hidden. An
   authenticated or UAE-egress probe may reveal a richer (possibly zoning-bearing) service.
6. **Zoning / buildable envelope is NOT solved by this.** This gives the plot and an indicative use.
   The DPM plot-and-zoning *regulations* that would drive an envelope were not located in machine-
   readable form; `agshost/Hosted/abu_dhabi_landuse` (SceneServer) and
   `Hosted/ZayedCityMasterPlotPlan2023` are the nearest leads and are unprobed for attributes.
7. **CORS**, and whether `arcgis.sdi.abudhabi.ae` rate-limits sustained paging (213 pages).
8. **DMT / Abu Dhabi City Municipality are closed from here** — `dmt.gov.ae` returns the WAF
   `Request Rejected`; `gis.adm.gov.ae` is HTTP 403 at root with every ArcGIS context 404
   (`/arcgis/`, `/agshost/`, `/agspublish/`, `/server/`, `/portal/`, `/gis/`). Host exists, nothing
   anonymously reachable. **undetermined, not absent.**

---

## 9 — ENDPOINT QUICK REFERENCE

| Purpose | URL |
|---|---|
| **Plots (the answer)** | `https://arcgis.sdi.abudhabi.ae/agspublish/rest/services/Pub/Generic_Search/MapServer/10` |
| Main Buildings (785,002) | `.../Pub/Generic_Search/MapServer/8` |
| Service root (public) | `https://arcgis.sdi.abudhabi.ae/agspublish/rest/services?f=json` |
| Hosted root (public) | `https://arcgis.sdi.abudhabi.ae/agshost/rest/services?f=json` |
| ArcGIS Portal (public) | `https://arcgis.sdi.abudhabi.ae/portal/sharing/rest/portals/self?f=json` |
| Plot tiles (⛔ no IDs) | `https://arcgis.sdi.abudhabi.ae/agshost/rest/services/Hosted/Plots_AD/VectorTileServer` |
| AD-SDI open-data service | `.../agspublish/rest/services/OpenData/ADSDI_OpenData/MapServer` |
| SDI portal | `https://sdi.gov.abudhabi/sdi/` |
| ⛔ dead (documented everywhere) | `https://arcgis.sdi.abudhabi.ae/arcgis/rest/services` → 404 |

---

# APPENDIX A — ADVERSARIAL RE-TEST (2026-09-07, independent lane)

**Mandate:** treat every negative above as wrong until re-probed. **Five verdicts moved.** The
headline verdict — *data open, licence unread, DO NOT BAKE* — **survives, and is now better
evidenced.** Every probe below was run from this machine (Windows/curl, US egress) unless marked
otherwise; HTTP status is quoted for each.

## A.1 — OVERTURNED

### A.1.1 🔴→🟢 The open-data portal is **DKAN**, and its API is live. ("undetermined" was premature)
The prior sweep tried CKAN `/api/3/action/*`, got **404**, wrote *"not CKAN"*, and stopped at
`undetermined`. **It is DKAN**, and the catalogue API answers keyless:

```
GET https://data.abudhabi/opendata/api/1/metastore/schemas   → HTTP 200, 35,920 bytes
  {"catalog":{"@context":"https://project-open-data.cio.gov/v1.1/schema/catalog.jsonld", …
```
Discovered by grepping the portal's own JS bundle (`js_4AGubwd-…js`, 13,384,822 bytes) for API
paths — **not** from documentation. This is the same shape as the nine blockers this project lost
last time: *the wrong product was asked for, refused, and recorded as absent.*

**And it names the licence.** The DKAN dataset schema carries a single-value licence enum:
```
"license":{"ui:options":{"widget":"list","source":{
  "enum":["https://data.abudhabi/opendata/addata_open_license"],
  "enumNames":["Abu Dhabi Government Open Data License"]}}}
```
So the licence **has a name and a canonical URL**. It was previously recorded only as a dead end.

*Still failing:* `/api/1/search` and `/api/1` → **HTTP 500**; `/api/1/metastore/schemas/dataset/items`
→ times out (**HTTP 000** at 120 s); `/opendata/data.json` and `/opendata/sitemap.xml` → **HTTP 200
with a BIG-IP ASM `Request Rejected` body**. The catalogue *contents* remain unenumerated.

### A.1.2 🔴→🟢 A **third ArcGIS context** exists: `agsimage`. The prior sweep found only two.
Recovered from the same JS bundle (`…/agsimage/rest/services/Sat/IMG_SAT_50CM_GCS/MapServer`).
```
GET https://arcgis.sdi.abudhabi.ae/agsimage/rest/services?f=json → HTTP 200
  {"currentVersion":10.91,"folders":["ImageService","Sat","Utilities"],"services":[]}
```
It holds **31 services** the prior survey never saw, including **elevation and imagery**:
`ImageService/IMGSER_AUH_DTM_50CM`, `IMGSER_AUH_DSM1…7_50CM`, `Sat/15CM_AD_URBAN_AREAS`,
`Sat/30CM_ABUDHABI_EMIRATE`, and **KhalifaSat 70 cm covering Dubai, Sharjah, Ajman, RAK, UAQ and
Fujairah** — i.e. *other emirates*, on an Abu Dhabi server.

### A.1.3 🔴→🟢 **Bulk download is NOT uniformly unavailable — it works for the RASTER data.**
`hasBulk=no` was correct for the *vector* plots and **wrong as a general statement**. The DTM
ImageServer serves raw float pixels:
```
GET …/IMGSER_AUH_DTM_50CM/ImageServer/exportImage?bbox=6056400,2814200,6056600,2814400
    &bboxSR=102100&size=100,100&format=tiff&pixelType=F32&f=image
→ HTTP 200 · content-type image/tiff · 66,706 bytes
  file(1): "TIFF image data, little-endian, width=100, height=100, bps=32, compression=none"
```
`maxImageWidth: 15000` × `maxImageHeight: 4100` per request ⇒ **7.5 km × 2.05 km of 0.5 m terrain
per call**. `allowRasterFunction: true`. That is a bulk raster extraction path.

### A.1.4 🔴→🟢 **Abu Dhabi has 0.5 m TERRAIN and DERIVABLE BUILDING HEIGHTS.** Never found before.
```
GET …/IMGSER_AUH_DTM_50CM/ImageServer?f=json → HTTP 200
  pixelSizeX/Y 0.5 · pixelType F32 · SR 102100 · capabilities "Image,Metadata,Pixels,Mensuration"
  minValues [-9999] · maxValues [1168.6046142578]
```
Point sample at Al Reem Island (54.4064, 24.4986):
```
DTM  …/IMGSER_AUH_DTM_50CM/ImageServer/identify  → HTTP 200  value "4.01106"
DSM3 …/IMGSER_AUH_DSM3_50CM/ImageServer/identify → HTTP 200  value "27.3164"
⇒ surface-above-ground ≈ 23.31 m
```
**Numerically validated**, `computeStatisticsHistograms` over a 1 km × 1 km envelope there:
```
min 1.0e-06 · max 9.4652929 · mean 3.4421838 · median 3.1922171 · stdDev 2.9255015 · count 4,000,000
```
**4,000,000 pixels over exactly 1 km² is 2000×2000 — the 0.5 m cell size is confirmed by the pixel
count, not merely asserted by the header.** Mean 3.44 m on a low-lying coastal island is plausible;
`maxValues` 1168.6 m is consistent with Jebel Hafeet at the emirate's edge.

⚠ This bears directly on **L-584 (terrain/rasant is a LEGAL defect — sampling ONE centroid point
where the ordinance measures at the façade)**. A 0.5 m DTM with a point-`identify` API is the exact
instrument that defect needs. **It is not licensed — see A.3.**

### A.1.5 🔴→🟢 Hidden folders are **not all "empty"** — one is explicitly token-gated.
The prior sweep reported hidden folders as *"HTTP 200 with an empty services array"*. That is not
the only shape:
```
GET https://arcgis.sdi.abudhabi.ae/agshost/rest/services/GeoHUB?f=json → HTTP 200
  {"error":{"code":499,"message":"Token Required","details":[]}}
```
**`code 499 Token Required`** is `exists-but-access-gated`, not `empty`. Per this project's
identity-bootstrap pattern that is a recorded dataset behind a gate, not an absence.

## A.2 — UPHELD, but on a STRONGER probe than the one originally used

### A.2.1 WFS and WMS: still NO — now proven from service metadata, not from one guessed URL
The prior sweep guessed two `…/WFSServer` URLs and got HTTP 400. That is weak evidence (a wrong
path also yields 400). The authoritative field is `supportedExtensions`, read per service:
```
Pub/Generic_Search      → capabilities "Map,Query,Data"   supportedExtensions ""
Pub/Generic_Search_WM   → capabilities "Query,Map,Data"   supportedExtensions ""
OpenData/ADSDI_OpenData → capabilities "Query,Map,Data"   supportedExtensions ""
DGE_POI/POI             → capabilities "Query,Map,Data"   supportedExtensions ""
Pub/AD_Navigable_Roads  → capabilities "Query,Map,Data"   supportedExtensions "NAServer"
```
**No OGC extension is deployed anywhere on this server.** Because WMS is absent entirely, the
`DescribeLayer` hidden-layer technique (25-of-47 on a prior project) has no surface. The equivalent
discipline was applied instead by enumerating **all 17 `agspublish` folders + all 8 `agshost`
folders + the 3 new `agsimage` folders** directly. **Not a blocker** — ArcGIS REST `/query` strictly
supersedes WFS here.

### A.2.2 Bulk download of the **vector plots**: still NO
```
Pub/Generic_Search/FeatureServer      → HTTP 200 body {"error":{"code":500,…}}  (no such service)
Pub/Generic_Search_WM/FeatureServer   → HTTP 200 body {"error":{"code":500,…}}
SDI_APPS/SmartMap/FeatureServer       → HTTP 200 · capabilities "Query" · syncEnabled false
                                        · supportsDisconnectedEditing false (health/education data)
```
No FeatureServer, no Extract, no Sync ⇒ no `createReplica`. **The paged `/query` remains the only
route to the full 425,975 rows** (2,000/page, 213 pages). Upheld.

### A.2.3 The parcel data itself: **independently re-verified at a different point**
I did not trust the prior sweep's coordinates. A fresh point-in-polygon at **Al Reem Island**:
```
GET …/Pub/Generic_Search/MapServer/10/query
    &geometry={"x":54.4064,"y":24.4986,…}&geometryType=esriGeometryPoint&inSR=4326
    &spatialRel=esriSpatialRelIntersects&returnGeometry=true&outSR=4326&f=geojson
→ HTTP 200 · 3,285 bytes · 1 feature · a real MULTI-VERTEX polygon (not a rectangle)
  "properties":{"PLOTID":"488501","PLOTNUMBER":"C4_to_C9","DISTRICTENG":"AL REEM ISLAND",
                "COMMUNITYENG":"RT3","MUNICIPALITYENG":"ADM","PRIMARYUSEENG":2}
GET …/10/query?where=1=1&returnCountOnly=true → HTTP 200 {"count":425975}   (exact match)
```
**The find is real and live.** Note `PRIMARYUSEENG: 2` on a residential tower district — first-hand
confirmation of the documented code-2 collision (commercial *and* residential). Land use here is
**indicative, never normative zoning.**

### A.2.4 DMT and Abu Dhabi City Municipality: still undetermined — the WAF is path-based, not UA-based
I hypothesised the BIG-IP rejections were User-Agent filtering and retried with full browser headers
(Chrome UA + Accept + Referer). **The hypothesis was wrong and is recorded as wrong:**
```
dmt.gov.ae/arcgis/rest/services?f=json           → HTTP 200, body "Request Rejected" (ASM)
dmt.gov.ae/server/rest/services?f=json           → HTTP 200, body "Request Rejected" (ASM)
sdi.gov.abudhabi/dev_datacatalogue_API/…         → HTTP 200, body "Request Rejected" (ASM)
ssdi.gov.abudhabi/dev_datacatalogue_API/…        → HTTP 000 (no route)
gis.adm.gov.ae/                                   → HTTP 403 (host alive)
gis.adm.gov.ae/{arcgis,agspublish}/rest/services  → HTTP 404
```
`undetermined`, not `does-not-exist`. Re-probe from a UAE-region egress.

### A.2.5 Two access shapes newly closed (real negatives, fully probed)
- **AD-SDI on ArcGIS Online** — org `HZaOojVCdfEiKlFc`, owner `adsdi.admin`, reached keyless via
  `arcgis.com/sharing/rest/search?q=orgid:HZaOojVCdfEiKlFc` → **HTTP 200, total 91 items**, all
  enumerated. **No parcel, plot or cadastral item** — overwhelmingly Year-of-Zayed story maps.
  `licenseInfo: null` on items checked. Shape closed: **AGO is not a route to AD parcels.**
- **`geoportal.abudhabi.ae`** — a host not previously known, found in the AGO item's `url`
  (`https://geoportal.abudhabi.ae/rest/services/BaseMapArabic/MapServer`). **HTTP 000 from this
  egress AND `getaddrinfo ENOTFOUND` from WebFetch's independent egress** ⇒ it does not resolve
  publicly. A **dead legacy host in a 2017 item**, not a gate.

## A.3 — 🔴 LICENCE: THE BLOCKER STANDS, AND IS NOW HARDER TO EXPLAIN AWAY

The prior sweep said *"portal item: `licenseInfo` ABSENT, `accessInformation` ABSENT"*. It probed
the **portal item** only. The **service item** answers, and says more:
```
GET …/Pub/Generic_Search/MapServer/info/iteminfo?f=json → HTTP 200, 928 bytes
  "accessInformation":"Copyright:© 2018 AD-SDI, DPM"      ← PRESENT (prior sweep said absent)
  "licenseInfo":""                                        ← PRESENT AND DELIBERATELY EMPTY
GET …/Pub/Generic_Search/MapServer/info/metadata?f=xml  → HTTP 200, 22,661 bytes
  <resConst><Consts><useLimit/>                           ← ISO use-limitation element, EMPTY
```
**This is worse for us, not better.** The publisher populated `accessInformation` with a copyright
*assertion* and left the licence *grant* blank, in both the Esri item model and the ISO metadata.
There is no grant to read because none was published.

Licence text attempts, all reported:
- `data.abudhabi/addata_open_license` → **HTTP 200, 2,789 bytes**, a Drupal shell; body renders
  client-side. `?_format=json`, the `/opendata/` prefix, and `/ar/` (→ HTTP 404) all return the same
  shell. **WebFetch (independent egress) confirmed: header only, no licence body.** Unread.
- `data.abudhabi/en/addata_open_license` → HTTP 200 `Request Rejected` (ASM).
- **`AD-Gov-Data-Management-Policy-EN-v1.0.pdf` → HTTP 200, 576,314 bytes, 22 pages, extracted with
  `pdftotext` (46,922 chars) — READ IN FULL.** §5.10 *Open Data* is an **internal governance
  obligation**, not a public grant: *"Treat data as being 'open by default'… Ensure that all
  published data is covered by an appropriate legal authority."* **It confers nothing on a third
  party and does not license redistribution.**
- `bayanat.ae/en/Copyright` → **read via WebFetch: CC BY 4.0**, redistribution and commercial use
  permitted with attribution. ⚠ **But Bayanat is the UAE FEDERAL portal and that grant is scoped to
  datasets published ON Bayanat.** The Abu Dhabi Plots layer is **not** on Bayanat, and is **not**
  in the branded `OpenData/ADSDI_OpenData` service either — it sits in the `Pub` folder. **The chain
  does not reach layer 10.** Do not borrow this licence.
- The 0.5 m DTM/DSM and all satellite services carry **`copyrightText: ""`** — not even a copyright
  assertion, and no licence.

### VERDICT — unchanged and reinforced
**Fetchable ≠ redistributable. PRYZM bakes context into R2 tiles and serves them to users; that is
redistribution.** Nothing in this appendix may be baked:

| Asset | Access | Licence read? | Bake? |
|---|---|---|---|
| Plots (layer 10) | open, keyless | **NO** — `licenseInfo:""` | ⛔ NO |
| Main Buildings (layer 8) | open, keyless | **NO** — same service | ⛔ NO |
| DTM 0.5 m / DSM 0.5 m | open, keyless | **NO** — `copyrightText:""` | ⛔ NO |
| 15/30/50 cm imagery, KhalifaSat | open, keyless | **NO** — `copyrightText:""` | ⛔ NO |

**LIVE QUERY ONLY** until AD-SDI / DGE confirm redistribution in writing. The named instrument to
ask them about is the **"Abu Dhabi Government Open Data License"** (A.1.1) — that name is the one
concrete thing this re-test added to the legal conversation.

## A.4 — Follow-ups this re-test opened
1. **The 0.5 m DTM/DSM may be a bigger prize than the parcels** for PRYZM (L-584 façade-level
   rasant, plus building heights without OSM). Put it in the same written licence request.
2. `agsimage` **KhalifaSat 70 cm covers Dubai and five other emirates** — hand to the Dubai lane.
3. DKAN `/api/1/metastore/schemas/dataset/items` times out at 120 s; retry paged / in-region to
   enumerate the catalogue and confirm whether Plots is formally classified Open Data.
4. `GeoHUB` (**499 Token Required**) is a gated folder of unknown size — an account may open it.
5. `Hosted/ZayedCityMasterPlotPlan2023` VectorTileServer exposes **19 land-use style classes**
   (root.json → HTTP 200, 4,349 bytes) but **its tile attributes were NOT decoded** (z14 tile →
   HTTP 404, indexedVector overzoom). Zoning remains **unsolved**; do not assume these tiles carry
   usable attributes — the sibling `Plots_AD` cache proves the bake strips them.
