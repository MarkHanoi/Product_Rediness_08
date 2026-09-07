# Dubai — Cadastral Parcel Sourcing Survey

**Territory:** Emirate of Dubai, UAE
**Surveyed:** 2026-09-07
**Method:** every verdict below is backed by a probe with a recorded URL, HTTP status and response.
No verdict here rests on prose. Where a shape could not be probed it is recorded `undetermined`,
never `does-not-exist`.

> ⚠ **Read this before quoting anything below.** This survey exists because a previous sourcing
> sweep on this project recorded 14 blockers of which **9 were refusals about the wrong product** —
> the agent asked for a bulk download, was refused, and wrote "not available" while the query
> endpoint on the same server served the data freely
> ([[bulk-vs-query-endpoint-false-refusals]]). Dubai reproduces that pattern **exactly**: there is
> no bulk parcel download anywhere in the emirate, and there is a wide-open ArcGIS query endpoint
> serving 100,209 plot polygons with a complete buildable-envelope ruleset attached.

---

## 1. Headline

| | |
|---|---|
| **Best source** | `gis.dda.gov.ae` — Dubai Development Authority ArcGIS Server, `DDA/BASIC_LAND_BASE/MapServer` layer **2 `Plot`** |
| **Access** | **EXISTS AND OPEN** — no token, no key, no login. Queryable, paginated, GeoJSON, WGS84. |
| **Volume** | **100,209 plot polygons** across **209 named projects** |
| **Carries** | plot polygon · `PLOT_NUMBER` · area · **GFA** · **max height in floors** · **per-side building & podium setbacks** · land use |
| **Licence** | ⛔ **RESTRICTIVE — DDA T&C forbid copying, distributing and automated scraping.** See §5. **Do not bake to R2 without a written DDA licence.** |
| **Coverage gap** | master-developer / free-zone land only. The Dubai Municipality-governed historic core (Deira, Bur Dubai) is **absent**. |

**The access verdict and the licence verdict point in opposite directions.** That is the single most
important sentence in this document. The data is trivially fetchable and legally encumbered.

---

## 2. What PRYZM needs vs what Dubai serves

PRYZM resolves a parcel then computes what may be built on it. In Spain, Catastro yields a cadastral
reference, a legal boundary and an area — and the envelope rules must then be *constructed*
separately from a rule pack, which is where the whole per-city cost sits
([[barcelona-data-pipeline-map]]). In Dubai today the app falls back to an OSM building footprint
and honestly warns the user it is *"not a legal cadastral parcel … carries no cadastral reference."*

The DDA `Plot` layer closes that gap **and goes further than Catastro does**: it ships the envelope
rule *with the geometry, per plot*, already adjudicated by the authority.

| PRYZM need | Spain (Catastro) | Dubai (DDA `Plot`) |
|---|---|---|
| Parcel polygon | yes | **yes** |
| Parcel identifier | yes (cadastral ref) | **yes** (`PLOT_NUMBER`, 100 % populated) |
| Area | yes | **yes** (`AREA_SQM`, 100 %) |
| Land use / zoning | partial | **yes** (`MAIN_LANDUSE`, 99.7 %) |
| Max height | **no — must be constructed** | **yes** (`MAX_HEIGHT_FLOORS`, 95.2 %) |
| GFA / buildability | **no — must be constructed** | **yes** (`GFA_SQM`, 76.6 %) |
| Setbacks | **no — must be constructed** | **yes** (`BUILDING_SETBACK_SIDE1..4`, 99.1 %) |

⭐ This inverts the usual rollout economics. For Barcelona the rule pack *is* the cost. For the
DDA-governed half of Dubai the rule pack is **already in the attribute table** — the sourcing
problem is legal, not geometric.

---

## 3. Every access shape tried

All six shapes were attempted, as required before any negative may be recorded.

### 3.1 Bulk download — **NO parcel geometry, anywhere**

| Probe | Status | Result |
|---|---|---|
| `dubaipulse.gov.ae` → `dld_land_registry` CSV (via Wayback) | 200, 49.6 MB | 175,265 rows. **Attributes only — no geometry column.** See §4.1 |
| `dm.gov.ae/open-data2/` | 200 | Catalogue contains **only Makani**. Zero occurrences of plot/parcel/cadastre. |
| `gis.dda.gov.ae/.../BASIC_LAND_BASE/FeatureServer?f=json` | 500 | `"Server object extension 'featureserver' not found."` |
| `gis.dda.gov.ae/.../MapServer/extractData` | 400 | `Error: Invalid URL` |

**Verdict: no bulk parcel-polygon download exists in Dubai.** This is precisely the refusal that,
taken alone, would have produced a false "not available" — see §3.4.

### 3.2 OGC WFS — **not enabled on the reachable host**

| Probe | Status | Result |
|---|---|---|
| `gis.dda.gov.ae/server/rest/services/DDA/BASIC_LAND_BASE/MapServer/WFSServer?service=WFS&request=GetCapabilities` | **400** | `Error: Invalid URL` — WFS extension not enabled |
| `gis.dda.gov.ae/geoserver/ows?service=WFS&request=GetCapabilities` | **404** | no GeoServer on host |

`undetermined` for the geo-fenced DM hosts (§6) — they could not be reached to be tested.

### 3.3 OGC WMS — **not enabled**

| Probe | Status | Result |
|---|---|---|
| `.../BASIC_LAND_BASE/MapServer/WMSServer?service=WMS&request=GetCapabilities` | **400** | `Error: Invalid URL` |

Note the standing doctrine that **GetCapabilities is not an inventory**
([[getcapabilities-is-not-an-inventory]]). It was applied here in the ArcGIS form: the service
*folder listing* was likewise not treated as an inventory — see §3.4.

### 3.4 ArcGIS REST — **THE WIN**

```
GET https://gis.dda.gov.ae/server/rest/services?f=json
→ 200
{"folders":["ANALYSIS","BUILDINGS","DDA","DEMARCATION","DH","DIS","DM","DPS",
            "DUBAI_POLICE","EMAAR","EMAP","GEO_INSPECT","Hosted","SITEPLAN","Utilities"],
 "services":[],"currentVersion":12.1}
```

14 of 15 folders return `{"error":{"code":499,"message":"Token Required"}}`. **`DDA` does not.**

```
GET https://gis.dda.gov.ae/server/rest/services/DDA?f=json → 200
  MapServer :: DDA/BASIC_LAND_BASE      ("DCCA Map for SalesForce, Building Portal, MyLand")
  MapServer :: DDA/FREE_ZONE_PROJECTS   ("Free Zone Projects")
```

`BASIC_LAND_BASE/MapServer` — `capabilities: Map,Query,Data`, `singleFusedMapCache: false`,
SR wkid 3997:

| Layer | Name | Geometry |
|---|---|---|
| 0 | Project Limit | Polygon — **210 features** |
| 1 | Project Limit Outline | Polygon |
| **2** | **Plot** | **Polygon — 100,209 features** |

**Applying the "a listing is not an inventory" doctrine**, service names were also probed *directly*
inside the token-gated folders rather than trusting the folder listing —
`DEMARCATION/PLOT`, `DEMARCATION/DEMARCATION`, `SITEPLAN/SITEPLAN`, `DM/PLOT`, `DM/PARCEL`,
`BUILDINGS/BUILDINGS`, `Hosted/Plot`. All returned HTTP 200 carrying `499 Token Required`. The
gating here is genuinely per-folder; no hidden public layer was found behind it. That negative is
reported *because it was tested*, not assumed.

**Other ArcGIS hosts probed:**

| Host | Status | Result |
|---|---|---|
| `gis.dm.gov.ae/arcgis/rest/services?f=json` | 200 | **redirects to the `www.dm.gov.ae` WordPress CMS** — not an ArcGIS server |
| `gis.dubailand.gov.ae/arcgis/rest/services` | **404** | host is live but serves the **Apache2 Ubuntu default page** — no ArcGIS |
| `services.dm.gov.ae/arcgis/rest/services` | 404 | host resolves, no service |
| ArcGIS Online — `smartdubai` org (`2lzWODtLAfYXzk2g`) | 200 listing / **499 on fetch** | 77 items incl. `Parcel_zoning_3D_w_canal` (SceneServer), `zoning_2d_w_canal`, `Landuse_w_canal`. **All `Token Required`.** |

### 3.5 Tile endpoints

| Probe | Status | Result |
|---|---|---|
| `tiles.arcgis.com/.../Parcel_zoning_3D_w_canal/SceneServer?f=json` | 200 | `499 Token Required` |
| `tiles.arcgis.com/.../Basemap_Dubai_Municipality_TOPO/MapServer?f=json` | 200 | `499 Token Required` |
| DDA `BASIC_LAND_BASE` | — | `singleFusedMapCache: false` — dynamic service, no tile cache to read |
| Makani / DubaiHere viewers | — | geo-fenced, see §6 |

### 3.6 Open-data portal — **enumerated exhaustively, no parcel geometry**

`dubaipulse.gov.ae` is TCP-refused from outside the UAE (§6), so it was enumerated through the
Wayback CDX index instead:

```
http://web.archive.org/cdx/search/cdx?url=dubaipulse.gov.ae*&output=text&fl=original&collapse=urlkey
→ 8,106 archived URLs · 2,089 distinct dataset paths · 42 publishing organisations
```

- **DLD publishes ~22 datasets** (`land_registry`, `buildings`, `units`, `projects`, `transactions`,
  `rent_contracts`, `valuation`, `map_requests`, …). **None carries geometry.**
  `dld_map_requests` is a record of map-request *transactions*, not maps.
- **`dm-location`** — the only spatially-flavoured DM group: `Community`, `Sectors`,
  `Dmgisnet_Enterances`, `Heritage_Places`, `Parks_And_Beaches_X_And_Y_Coordinates`. Administrative
  boundaries and points. **No parcels.**
- API variants (`*-open-api`) require an **API Key + Secret issued by email** → gated, and still
  serve the same geometry-free tables.

**Verdict: Dubai's open-data portal publishes no parcel polygon.** Recorded after enumerating 2,089
dataset paths, not after one failed search.

---

## 4. The two datasets that matter

### 4.1 DLD Land Registry — the attribute half, no geometry

Retrieved via Wayback (host geo-fenced), 49.6 MB, **175,265 rows**:

```
property_id, area_id, zone_id, area_name_ar, area_name_en, land_number, land_sub_number,
actual_area, property_type_*, property_sub_type_*, munc_zip_code, munc_number, parcel_id,
is_free_hold, is_registered, pre_registration_number, separated_from, separated_reference,
project_id, project_name_*, master_project_*, land_type_id, land_type_ar, land_type_en
```

| Field | Fill |
|---|---|
| `land_number` | 100.0 % (175,264) |
| `parcel_id` | **82.3 %** (144,313) |
| distinct `area_name_en` | 265 |

`land_type_en`: Commercial 126,589 · Residential 19,757 · Industrial 8,380 · Public Facilities 6,537
· Government Authorities 3,282 · Agricultural 1,206.

⭐ **This is the emirate-wide cadastral *register* with no geometry, and it carries `parcel_id`.**
It is the natural join partner for any geometry source that keys on the same identifier. It covers
the historic core that DDA does not. **Whether `parcel_id` here joins to DDA `PLOT_NUMBER` is
untested and is the single highest-value open question in this survey (§7).**

### 4.2 DDA `Plot` — the geometry half, with the envelope attached

`https://gis.dda.gov.ae/server/rest/services/DDA/BASIC_LAND_BASE/MapServer/2/query`

**Attribute completeness over all 100,209 plots** (each measured with `returnCountOnly=true`):

| Field | Count | % |
|---|---:|---:|
| `PLOT_NUMBER` non-empty | 100,209 | **100.0** |
| `AREA_SQM > 0` | 100,209 | **100.0** |
| `MAIN_LANDUSE` non-empty | 99,898 | 99.7 |
| `BUILDING_SETBACK_SIDE1` non-empty | 99,358 | **99.1** |
| `MAX_HEIGHT_FLOORS` non-empty | 95,368 | 95.2 |
| `GFA_SQM > 0` | 76,719 | 76.6 |
| `MAX_PLOT_COVERAGE > 0` | 875 | **0.9 — effectively unusable** |

**Land use:** RESIDENTIAL 75,450 · OPEN SPACE 9,305 · UTILITIES 8,822 ·
COMMERCIAL-RESIDENTIAL 1,164 · INDUSTRIAL 991 · FACILITIES 884 · COMMERCIAL 722.
⭐ 75 % residential — directly aligned with PRYZM's residential typology.

**Verified live sample** (`resultOffset=50000`, `f=geojson`, `outSR=4326`):
`PLOT_NUMBER 67610017` · `GFA_SQM 155.79` · `MAX_HEIGHT_FLOORS "G+1+R"` ·
`BUILDING_SETBACK_SIDE1 "1.5"` · Polygon, 1 ring, 9 points.

**Harvest mechanics:** `maxRecordCount 2000`, `supportsPagination: true`, `resultOffset` confirmed
working at offset 50,000. Full extraction ≈ **51 requests**. Output `f=geojson` with `outSR=4326`
lands straight in PRYZM's coordinate frame.

**Coverage — measured by bounding box, honestly:**

| Window | Plots |
|---|---:|
| Whole emirate `54.8,24.7 → 55.7,25.4` | 100,209 (all of them) |
| Dubai Marina | 216 |
| Downtown / Burj Khalifa | 179 |
| **Deira / Bur Dubai (historic core)** | **8** |

Top projects: DAMAC HILLS 2 (15,034) · DAMAC LAGOONS (8,581) · DAMAC ISLANDS (6,384) ·
THE VALLEY (5,467) · DUBAI HILLS (5,114) · DAMAC HILLS (3,906) · MUDON (3,413) ·
JABEL ALI HILLS (3,398) · ARABIAN RANCHES I (3,294).

17 `ENTITY_NAME` values: DDA free zones (DIFC, Dubai Healthcare City), Emaar, Dubai Holding,
Jumeirah Group, Majid Al Futtaim, MAG, Shamal, Knowledge Fund, Global Village, Dubai Police.

⛔ **This is the master-developer cadastre, not the emirate cadastre.** It is comprehensive on
master-planned land and near-empty on the municipality-governed old city. Any claim of "Dubai
parcel coverage" must carry that qualifier.

---

## 5. Licence — the blocker

The DDA Terms & Conditions (`https://www.dda.gov.ae/terms-and-conditions`) state:

> **5.1** — *"The Sites and all intellectual property rights and trademarks in it, including but not
> limited to any Content, is owned by us"* … *"All rights not expressly granted are reserved."*
>
> **5.2** — *"We grant you a limited, non-exclusive, non-transferable, and revocable license to use
> certain portions of the Sites for their intended purposes"* … *"you may not copy, modify,
> distribute, sell, or lease any part of the Sites"* … *"you may not 'scrape' the Sites through
> automated means or 'frame' any part"*.

There is **no open-data licence and no clause permitting reuse of geospatial data.**

⛔ **PRYZM's intended use — harvest 100k polygons, bake them into R2 tiles, serve them to paying
users — is squarely inside "copy", "distribute" and "scrape through automated means".** Technical
openness is not permission. Do not bake this.

**One genuine ambiguity, recorded rather than resolved:** clause 1.2 defines "Sites" by enumeration —
`dda.gov.ae`, `webzoning.dda.gov.ae/Zoning`, `filmdubai.gov.ae`, `mpeservices.dda.gov.ae`, plus
"the DDA GIS App". **`gis.dda.gov.ae` is not itself named in that list.** A lawyer might argue the
ArcGIS service sits outside the enumerated Sites. **That argument should not be made by an
engineer, and must not be relied on to ship.** The safe reading is that the GIS service is covered.

**Makani (Dubai Municipality)** has an actual published usage statement, and it is materially better
but still fatal to resale:

> *"You can use MAKANI data as a geo-tagging system without any restrictions in applications,
> systems, locations and services"* · *"It is not allowed, however, to sell MAKANI data to anyone
> or any entity"* · *"Altering the content or source of this data is prohibited"* ·
> *"you should always mention its source, which is Dubai Municipality"*

Permissive for use, explicit prohibition on **selling** the data, and on **altering** it — which a
tile bake arguably is.

**Recommendation: a written data licence from DDA (and from DM for Makani) is the actual unblocking
action for Dubai. It is a commercial conversation, not an engineering task.**

---

## 6. The geo-fence — why half of Dubai's GIS is unreachable, and why that is not "absent"

A cluster of Dubai government hosts **resolve in DNS but refuse or time out TCP from outside the
UAE**. Verified from **two independent egress paths** (local ISP via `curl`, and Anthropic's
`WebFetch` infrastructure) — both fail identically, which is what distinguishes a geo-fence from an
outage:

| Host | DNS | Result |
|---|---|---|
| `www.dubaipulse.gov.ae` | 91.73.143.12 | `ECONNREFUSED` (WebFetch) / timeout (curl) |
| `www.makani.ae` | 213.42.50.142 | `connect … failed: Timed out` |
| `www.dubaihere.ae` | 213.42.50.143 | `ECONNREFUSED` |
| `geodubai.dm.gov.ae` | 213.42.55.155 | timeout |
| `gslb.dubaipulse.gov.ae` | — | timeout |

All on Etisalat address space (213.42.x, 91.73.x). Note `hub.dm.gov.ae` (213.42.55.228) **does**
respond — so this is per-host policy, not a blanket block.

⛔ **None of these may be recorded as "does not exist".** They are `undetermined` on access from
outside the UAE, and in Makani's case (§6.1) they are demonstrably **`exists-but-gated`**.

### 6.1 Makani serves parcel polygons — proven from its own client code

The viewers are unreachable, so their JavaScript was recovered from the Wayback Machine and read.
`www.makani.ae/desktop/makanipages/scripts/Smart_LandNumber_Search.js`:

```js
var DMServiceUrl = "SmartSearch";
GetMakaniDataNew(requestjson, DMServiceUrl, function (output) {
    var data = jsonData;           //  data.MAKANI / data.BUILDINGS / data.PARCEL
    ...
var landNumber = PARCEL[0].ParcelId;          // ← parcel IDENTIFIER
...
var parcelshape  = PARCEL[0].SHAPE;           // ← parcel POLYGON
var parcelpoints = parcelshape.split(", ");   //   "lng,lat" vertex list
...
var Zone_DMServiceUrl = "GetZoningRegulation";           // ← ZONING, keyed on Landno
jsonData.Zoningregulations.Regulation[0].Color
```

Service surface (from `desktop/public/js/common/config.js`):
- public proxy `https://www.makani.ae/makaniproxy/Makani.svc/getmakanidatanew` (POST JSON)
- backend actions `https://www.makani.ae/MakaniPhase2ProxyWebService/MakaniPhase2Proxy.svc/<Action>`
- actions observed: `SmartSearch`, **`GetZoningRegulation`**, `GetBuildingOutLine_EntrancePoints`,
  `GetLocation`
- requests carry a `Token` field (value deliberately not recorded here)

A live POST to the public proxy from outside the UAE returned `code=000` after 26 s — the geo-fence,
not a rejection.

⭐ **Dubai Municipality therefore does serve parcel polygons, parcel IDs and per-plot zoning — for
the whole municipality-governed emirate, including the historic core the DDA layer misses.** It is
`exists-but-gated` on two axes at once: geo-fenced **and** token-bearing. This is exactly the
identity-bootstrap-gate pattern ([[identity-bootstrap-gate-offline-legislation-pattern]]) — record
the dataset, record the gate, do not pretend it is absent.

### 6.2 Other gated DDA surfaces

`webzoning.dda.gov.ae/Zoning` → 200, **`<title>Login|Dubai Development Authority</title>`**.
`mpeservices.dda.gov.ae` → 200, Salesforce login. The official zoning viewer is account-gated while
the underlying `BASIC_LAND_BASE` service is not — a configuration asymmetry, and plausibly an
oversight on DDA's side rather than an intentional publication.

---

## 7. Open questions

1. **Does DLD `parcel_id` join to DDA `PLOT_NUMBER`?** If yes, the emirate-wide register (§4.1)
   gains geometry wherever DDA covers, and the join tells us exactly how much of Dubai is still
   uncovered. **Highest-value next probe.** Untested — both sides are in hand, so this is cheap.
2. **Will DDA grant a redistribution licence?** The blocker is legal, not technical (§5).
3. **Who holds the historic-core cadastre in machine-readable form?** Makani appears to (§6.1) but
   is geo-fenced. A UAE-egress probe would settle it in minutes.
4. **Do the 14 token-gated DDA folders** (`DEMARCATION`, `SITEPLAN`, `DM`, `BUILDINGS`) contain
   emirate-wide parcels? `SITEPLAN` and `DEMARCATION` are the suggestive names. Credentials unknown.
5. **Is the Makani token per-session or static?** Determines whether the service is usable at all
   from a licensed integration.
6. **`MAX_PLOT_COVERAGE` is 0.9 % populated** — is coverage expressed elsewhere, or genuinely not
   captured? Affects envelope fidelity.

---

## 8. Recommendation

1. ⛔ **Do not bake DDA plots to R2.** The licence forbids it (§5). This is a legal exposure, not a
   technical risk.
2. **Open a licensing conversation with DDA** for `BASIC_LAND_BASE`, and with Dubai Municipality for
   Makani. This is the real unblocking action.
3. **Run open question 1 now** — it is a local join against two datasets already in hand and it
   determines the true parcel coverage of Dubai.
4. **Until a licence exists, keep the honest OSM-footprint warning in the panel.** It is currently
   telling the user the truth, and replacing it with unlicensed data would be worse than the gap.
5. If a licence lands, the integration is small: one paginated ArcGIS query, 51 requests,
   GeoJSON/WGS84 out — and the envelope rules arrive **with** the geometry, which is a materially
   cheaper city onboarding than Barcelona's.

---

## Appendix — reproduce the headline

```bash
# service directory (open)
curl -s "https://gis.dda.gov.ae/server/rest/services?f=json"

# the Plot layer schema
curl -s "https://gis.dda.gov.ae/server/rest/services/DDA/BASIC_LAND_BASE/MapServer/2?f=json"

# count
curl -s -G "https://gis.dda.gov.ae/server/rest/services/DDA/BASIC_LAND_BASE/MapServer/2/query" \
  --data-urlencode "where=1=1" --data-urlencode "returnCountOnly=true" --data-urlencode "f=json"
# → {"count":100209}

# one parcel, WGS84 GeoJSON, with the envelope ruleset
curl -s -G "https://gis.dda.gov.ae/server/rest/services/DDA/BASIC_LAND_BASE/MapServer/2/query" \
  --data-urlencode "where=1=1" --data-urlencode "outFields=*" \
  --data-urlencode "resultRecordCount=1" --data-urlencode "outSR=4326" --data-urlencode "f=geojson"
```

⚠ Running the harvest loop against this endpoint is the act clause 5.2 prohibits. The commands above
are single verification probes. **Do not loop them without a licence.**
