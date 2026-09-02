# LANE AU — AUSTRALIA STATE-BY-STATE SWEEP (NSW · VIC · QLD · WA · SA · TAS · ACT · NT)

> Lane: geo-expansion/au · Researched **2026-09-02** · Method: the Europe sweep's, binding
> (`audit/europe-site-intel/2026-08-31/lanes/rest-of-europe-sweep.md` +
> `impl/e5-asis-national-sweep.md`): every channel claim below is **PROBED** (live HTTP request
> this session, transcript saved) or **DOC** (official page read this session) or **UNKNOWN**
> (with the probe that would measure it named). UNKNOWN stays distinct from zero. A bulk-download
> refusal is not a query-endpoint refusal; SURVEYED height ≠ NORMATIVE height; licence read from
> the licence record, never assumed.
>
> Raw probe transcripts: `audit/geo-expansion/2026-09-02/transcripts-au/` (all files cited below
> live there; JSON quoted verbatim from those files).
>
> Cadastre and planning are **STATE competencies** in Australia — there is no national cadastre
> and no national planning scheme. So the Europe per-country verdict vocabulary applies per
> STATE, and the AU-national verdict is a rollup: NATIONAL-NOW / NATIONAL-DERIVED /
> SUBNATIONAL(list) / GATED(gate named) / BLOCKED(reason).

## ⭐ THE HEADLINE, UP FRONT

**Two states — NSW and SA — serve NUMERIC buildable-envelope parameters as spatial data layers.**
The Europe E5 verdict (`memory: europe-e5-reuse-verdict`, 21/21 countries) was that the
development-potential envelope is *state-served NOWHERE* in Europe — every European path is
zone-polygon + document extraction. Australia refutes that pattern in two states, probe-verified
this session:

- **NSW** returns `MAX_B_H_M: 22.0` (metres) and `FSR: 3.5` as polygon attributes at a Surry
  Hills point (transcripts `nsw-epi-layer5-surryhills.json`, `nsw-epi-layer1-surryhills.json`).
- **SA** returns `"Maximum building height is 32.5m" / value: '32.5'` and
  `"Maximum building height is 9 levels" / value: '9'` from dedicated **Technical & Numeric
  Variation** layers, alongside spatial layers for **Minimum Primary/Side/Rear Setback, Site
  Coverage, Minimum Site Area, Minimum Frontage and even "Building Envelope"** (layer list in
  `sa-sappa-root3.json`; hits in `sa-l202-unley.json`, `sa-l203-unley.json`).

This is a different (better) product class than Europe's document-extraction path: the
buildable-max 3D envelope is directly computable from state-served numbers, no rule-pack
sourcing for the mapped controls. The honest limits (clause-based CBD areas, partial mapping,
setbacks-by-document in NSW) are recorded per state below.

---

## 0 — EXISTING PRYZM STATE (read before judging anything "new")

- `packages/site-parcel-data/src/parcelProviders/registry.ts` — the routing registry any AU
  provider lands in. Row shape: `regionCode / countryName / providerId / label / proxyPath /
  kind ('cadastral' | 'footprint-fallback') / contains(predicate) / note (probe evidence,
  dated)`. The existing **SA row is SAUDI ARABIA** (`regionCode: 'SA'`, kind
  `footprint-fallback`, note: "Balady / U-Maps cadastre is IP geo-fenced (WAF-blocks non-SA
  IPs, L-606)") — ⚠ an Australian **South Australia** row must NOT reuse code `SA`; use
  ISO 3166-2 style `AU-SA` (and `AU-NSW`, `AU-VIC`, …) to keep the two `SA`s distinct in
  `REGION_BBOX` (registry.ts:588 keys the specificity map by regionCode; a collision would be
  silent mis-routing). Every new row needs a `REGION_BBOX` entry —
  `parcelRegistryWiring.test.ts` asserts that invariant.
- `tools/context-bake/bake.mjs` §BAKE-EUROPE-NATIONAL — the whole-country row shape
  (`name / pbfUrl / pbf / bbox / clipped`), honest-OSM-defaults-until-a-height-stamp-lands rule
  (§MEASURED-HEIGHT-GATE: never declare a `heightJoin` that produces nothing), and the R2
  budget prerequisite before publishing large sets. AU states fit this shape as 8 rows (sizes
  in §9 below; all 8 together ≈ 0.98 GB pbf — cheaper than Poland alone).
- `tools/context-bake/terrain.mjs` — the datum rule (L-584/C12 §1.4): orthometric national DTM
  → WGS-84 ellipsoidal via per-city `geoidSepM` constant. AU rows would carry
  `vertDatum: 'AHD (EPSG:5711)'` and a per-city constant read from AUSGeoid2020 (§8).
- `docs/04-reference/jurisdictions/` — has `be ch de dk es fi fr gb it nl no pt sa se us`;
  **no `au/` folder exists**; `GEO-DATA-SOURCING-MASTER.md` has **zero Australia rows**
  (grep this session: no match for australia/sydney/melbourne/AHD). This sweep is net-new.
- Mapterhorn terrain is planet-wide and ADOPTED — terrain is NOT a blocker in any AU state;
  only the datum-lift constant is per-city (§8).
- ⛔ MS GlobalML building footprints stay EXCLUDED (unlicensed for us until the founder clears
  it). Where it WOULD help is stated per state; it is never relied on.

---

## 1 — NSW (New South Wales)

### 1.1 PARCELS — **PROBED, keyless, real lot/plan id**

`https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer`
(DCS Spatial Services) — ArcGIS FeatureServer, 13 layers (layer **8 = Lot**, 12 = Property;
`nsw-lppt-root.json`). Point query at Sydney Town Hall (151.20658, -33.87344), verbatim
(`nsw-lot-townhall.json`):

```json
{"lotidstring": "100//DP1048011", "lotnumber": "100", "sectionnumber": null,
 "planlabel": "DP1048011", "plannumber": 1048011, "cadid": 100105498}
```

⚠ A first probe at a street point (151.2070, -33.8720) returned **0 features**
(`nsw-lot-sydney.json`) — road corridors are not lots; the adapter needs the same
miss-falls-to-footprint behaviour every registry row already has.

**Licence:** data.nsw.gov.au CKAN (`nsw-ckan-parcel.json`): "NSW Foundation Spatial Data
Framework - Land Parcel and Property - Cadastral Fabric" → **`license_title: "Creative Commons
Attribution"`** (Department of Customer Service). The two *service* rows say "License Not
Specified" — cite the dataset licence, not the service row. → **GREEN**, keyless.

### 1.2 ENVELOPE RULES — ⭐ **PROBED: numeric HOB + FSR served as spatial attributes**

`https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/EPI_Primary_Planning_Layers/MapServer`
(NSW ePlanning). Layers (`nsw-epi-root.json`): **1 Floor Space Ratio · 2 Land Zoning ·
4 Lot Size · 5 Height of Building** (+ Heritage, Land Reservation Acquisition, Land
Application). Three point probes, all keyless:

| Point | LZN | HOB | FSR |
|---|---|---|---|
| Sydney CBD (151.2070, -33.8720) | `SYM_CODE: "SP5"`, `LAY_CLASS: "Metropolitan Centre"`, Sydney LEP 2012 | feature returned but `LAY_CLASS: "CA"`, `MAX_B_H_M: null`, `LEGIS_REF_CLAUSE: "Clause 6.17 & Clause 6.19"` | `LAY_CLASS: "CA"`, `FSR: null`, `LEGIS_REF_CLAUSE: "Clause 6.4"` |
| Surry Hills (151.2110, -33.8860) | — | **`MAX_B_H: 22.0, MAX_B_H_M: 22.0, UNITS: "m"`** (`LAY_CLASS: "21-22.9"`) | **`FSR: 3.5`** (`LAY_CLASS: "3.5-3.99"`) |
| Chatswood E2 (151.1860, -33.7970) · Bondi R2 (151.2620, -33.8960) | `E2` / `R2` returned | **0 features** at both | **0 features** at both |

(Transcripts: `nsw-epi-layer{1,2,5}-sydney.json` · `nsw-epi-layer{1,5}-surryhills.json` ·
`nsw-epi-layer{1,2,5}-chatswood.json` · `nsw-epi-layer{1,2,5}-bondi.json`.)

**Honest reading:** (a) where the LEP maps a number, the STATE serves the number — metres and
ratio, with the legislative clause reference attached (`LEGIS_REF_CLAUSE`) — this is the
data-served envelope class Europe lacks; (b) central Sydney is a **clause-based area** ("CA"):
the polygon tells you numeric control does NOT apply and cites the clause — sun-access planes
etc. remain document work; (c) coverage is partial — two suburban probe points with mapped
zoning had **no HOB/FSR polygon at all** (either genuinely un-mapped there or controls live in
the DCP). A coverage-fraction probe is owed before any % claim: count HOB features per LGA vs
LGA area (same MapServer, `returnCountOnly`). (d) **Setbacks are NOT in these layers** — they
live in per-council DCPs (documents) → extraction class for setbacks.

**Licence:** data.nsw CKAN "Environmental Planning Instrument - *" datasets →
**Creative Commons Attribution** (`ckan-nsw-epi.json`). → **GREEN**.

### 1.3 BUILDINGS — OSM/Overture + LiDAR-derive; **no open state footprint product found**

- `NSW_Features_of_Interest_Category` serves **BuildingComplexPoint** only — no footprint
  polygons (`nsw-foi-root.json`); the full portal service list (`nsw-portal-services.json`,
  55 Hosted services also grepped) has **no building-footprint service**; data.nsw CKAN
  `q=building+footprint` → 12 results, all flood studies (`ckan-nsw-bf.json`). Absent from the
  open channel — as measured this session, not asserted forever.
- Geoscape Buildings (national, incl. heights + roof form) is the commercial product —
  **gate:** sales agreement, cost class unreadable this session (geoscape.com.au → **HTTP 403**
  to our probe, `geoscape-buildings.html`); academic access via AURIN exists (gate: Australian
  university affiliation) — DOC-level, not probed.
- **Heights channel that IS open:** ELVIS (elevation.fsdf.org.au, **HTTP 200** probed) serves
  state LiDAR DTM/DSM (CC BY 4.0 per FSDF) → derive nDSM and stamp OSM footprints — the same
  class-D pattern as NO/UK/CH rows in `GEO-DATA-SOURCING-MASTER.md`. Per-capital LiDAR coverage
  fraction: UNKNOWN — probe: ELVIS index query over the Sydney metro bbox.
- MS GlobalML would fill regional-NSW footprint gaps; EXCLUDED (unlicensed).
→ Context = **OSM mass-only now** (bake row bakes honest defaults), nDSM stamp = the owed build.

### 1.4 TERRAIN datum — AHD; lift from AUSGeoid2020 (see §8). Vertical datum AHD (EPSG:5711).

### 1.5 SIZE — `australia/new-south-wales-latest.osm.pbf` = **266,748,889 bytes** (range-GET).

**VERDICT (state-level): NATIONAL-NOW equivalent** — parcels + zoning + numeric HOB/FSR all
keyless CC-BY; envelope = data-served where mapped, clause/DCP extraction for CBD + setbacks.

---

## 2 — VIC (Victoria)

### 2.1 PARCELS — **PROBED, keyless, real SPI**

`https://opendata.maps.vic.gov.au/geoserver/wfs` (Vicmap open-data GeoServer, WFS 2.0.0,
capabilities 734,521 bytes, `vic-wfs-caps.xml`). DefaultCRS **EPSG:7844 (GDA2020)** — ⚠ CQL
points are **lat lon** order (a lon-lat probe returns 0 silently; both transcripts kept:
`vic-parcelview-melb.json` = 0, `vic-parcelview-melb2.json` = hit). At Melbourne
(-37.8136 144.9631):

- `open-data-platform:parcel_view` → MultiPolygon, `pfi: '152191429'` (`vic-parcelview-melb2.json`)
- `open-data-platform:v_parcel_mp` → **`parcel_spi: 'PC366537'`**, `parcel_pfi: '152191430'`,
  `parcel_status: 'A'` (`vic-spi-melb.json`) — the Standard Parcel Identifier, i.e. the legal
  lot\plan id.

**Licence:** discover.data.vic CKAN: "Vicmap Property - Parcel Polygon" → **CC BY 4.0**
(`ckan-vic.json`). → **GREEN**, keyless, live WFS.

### 2.2 ENVELOPE RULES — zones + overlay CODES as data; NUMBERS in schedule documents

Same GeoServer, same point:
- `open-data-platform:plan_zone` → `zone_code: 'CCZ2'`, `zone_description: 'CAPITAL CITY ZONE -
  SCHEDULE 2'`, lga MELBOURNE (`vic-planzone-melb.json`)
- `open-data-platform:plan_overlay` → 6 overlays at the point, incl. `DDO2-A1` "DESIGN AND
  DEVELOPMENT OVERLAY - SCHEDULE 2 (HC-1)" + 2 heritage overlays (`vic-overlay-melb.json`)

**Product class:** the DDO overlay code is a PERFECT POINTER — `DDO2` names the exact schedule
in the Melbourne Planning Scheme (planning-schemes.app.planning.vic.gov.au, HTML) where the
height number lives — but the number itself is NOT a spatial attribute. → Europe-style
extraction (class F) with a far better join key than most of Europe: one schedule per overlay
code, HTML not scanned PDF. GRZ/NRZ residential zones carry statewide default heights
(clause 32, one state document) — derivable without per-LGA work. → zones **GREEN/live**,
numeric rules **extraction with pointer**.

### 2.3 BUILDINGS — state layer is notable-buildings only; City of Melbourne has REAL heights

- `open-data-platform:building_polygon` numberMatched **32,604 statewide** (`vic-bldg-hits.xml`)
  — that is a notable-structures layer, NOT a footprint product (0 features at Melbourne Town
  Hall, `vic-building-melb.json`).
- **City of Melbourne open data (ODS, CC BY): `2023-building-footprints`** with
  `footprint_extrusion`, `structure_extrusion`, `footprint_max/min_elevation` — real LoD1
  heights, city-scoped (`melb-2023-building-footprints.json`); plus CLUE
  `number_of_floors_above_ground` per property (`melb-buildings-with-name-...json`); plus a
  2018 3D textured mesh dataset (CC BY, `melb-ods.json`).
- Statewide: OSM/Overture mass-only; Vicmap DEM/LiDAR via ELVIS → nDSM derive (owed stamp).
→ Melbourne city = **LoD1-with-heights GREEN**; rest of VIC = OSM mass-only + derive.

### 2.4 TERRAIN datum — AHD, §8. · 2.5 SIZE — victoria pbf = **240,644,273 bytes**.

**VERDICT: NATIONAL-NOW for parcels+zoning (keyless live WFS, CC BY 4.0); envelope =
NATIONAL-DERIVED (overlay-code → schedule extraction; statewide residential defaults one
document); Melbourne launches with real building heights.**

---

## 3 — QLD (Queensland)

### 3.1 PARCELS — **PROBED, keyless, real lotplan**

`https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer`
(layer **4 = Cadastral parcels**; `qld-lppf-root.json`, copyright "© State of Queensland").
At Brisbane CBD (153.0260, -27.4705) — verbatim (`qld-parcel-brisbane.json`):

```json
{"lot": "47", "plan": "SP317615", "lotplan": "47SP317615", "tenure": "Lands Lease",
 "parcel_typ": "Lot Type Parcel", "locality": "Brisbane City", "shire_name": "Brisbane City"}
```

**Licence:** data.qld CKAN "Cadastral data - Queensland series" → **CC BY 4.0**
(`ckan-qld.json`). → **GREEN**, keyless.

### 3.2 ENVELOPE RULES — per-LGA schemes; Brisbane zoning PROBED open; numbers in scheme text

- Planning schemes are **per local government** (77 LGAs). Brisbane City Council AGOL org
  (2,254 services, `bcc-services.json`): `Zoning_opendata/FeatureServer/0` — **26,356 zone
  polygons**, EPSG:28356. At Paddington (152.9990, -27.4600), verbatim
  (`bcc-zoning-152.9990,-27.4600.json`):
  `{"ZONE_CODE": "CR", "LVL1_ZONE": "General residential", "LVL2_ZONE": "Character residential
  (Infill housing)", "ZONE_PREC_DESC": "CR2 - Infill housing"}` — CC BY 4.0 (data.qld harvest,
  `ckan-qld-zone.json`: "City Plan 2014 – Zoning overlay | CC BY 4.0").
  ⚠ Two CBD/New-Farm points returned 0 features (roads/river are unzoned in City Plan) —
  transcripts kept (`bcc-zoning-brisbane*.json`).
- Numeric height/site-cover values live in the City Plan CODE TEXT per zone precinct
  (document), though BCC publishes some numeric-height overlay services for renewal precincts
  (e.g. `Building_heights_proposed_Wynnum_SRP` in the service list). State-level
  `PlanningCadastre/StatePlanning` = regional plans only, no statewide zoning mosaic
  (`qld-stateplanning.json`). A statewide amalgamated zoning dataset on QSpatial: UNKNOWN —
  probe: QSpatial catalogue search "planning scheme zone state-wide", then layer probe.
→ zoning **SUBNATIONAL(per-LGA; Brisbane probed GREEN)**; numeric rules extraction class.

### 3.3 BUILDINGS — no open state footprint product found (data.qld `q=building+footprint` →
4 results, all geology; `ckan-qld-bf.json`). OSM/Overture + ELVIS LiDAR derive (SEQ has dense
open LiDAR). Geoscape gate as §1.3. MS GlobalML would help regional QLD; EXCLUDED.

### 3.4 TERRAIN — AHD, §8. · 3.5 SIZE — queensland pbf = **197,341,278 bytes**.

**VERDICT: parcels NATIONAL-NOW-equivalent; envelope SUBNATIONAL(Brisbane now, then LGA-by-LGA
adapters — same shape as Europe's per-city rule packs but with open zone polygons per LGA).**

---

## 4 — WA (Western Australia)

### 4.1 PARCELS — geometry keyless; **ATTRIBUTES GATED (Landgate custom licence)**

`https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer`
layer **2 = "Cadastre (No Attributes) (LGATE-001)"** — the name is the finding. At Perth CBD
(115.8575, -31.9505): 4 features, verbatim attributes in full
(`wa-layer2-perth.json`): `{"objectid": 1149809, "view_scale": "4K"}` — polygon geometry, **no
lot, no plan, no id**. The attributed cadastre datasets on catalogue.data.wa.gov.au ("Cadastre
(Polygon) (LGATE-217)" etc.) carry **`license_title: "Custom (Other)"`** = Landgate's own terms
(`ckan-wa.json`). **Gate: Landgate data agreement (pricing class unknown this session — probe:
Landgate "Cadastre" product page / Data WA resource terms).** → geometry GREEN / identifiers
**YELLOW-GATED**. Parcel selection works (click → polygon), but the LEGAL lot/plan label needs
the gated product or an on-screen-only join via Landgate's viewer terms.

### 4.2 ENVELOPE RULES — zones + R-Codes spatial; numbers in ONE state document

Same MapServer:
- Layer 48 Region Scheme Zones: Subiaco point (115.8280, -31.9480) →
  `{"descriptio": "Urban", "rs_class": "Zone", "reg_scheme": "MRS"}`
  (`wa-l48-115.8280,-31.9480.json`)
- Layer 112 Local Planning Scheme Zones: same point → `{"zone": "No zone", "scheme_nam":
  "SUBIACO"}` (a road); Scarborough point → `{"zone": "Development", "scheme_nam": "STIRLING"}`
- Layer 111 **R-Codes**: Tuart Hill (115.7910, -31.8960) → **`{"rcode_no": "R40",
  "scheme_nam": "STIRLING"}`** (`wa-rcode-115.7910,-31.8960.json`; two road/park points
  returned 0 — transcripts kept).

**Product class:** R40 → numeric site area/open space/height defaults come from **SPP 7.3
(Residential Design Codes), ONE state-uniform document** — the highest-leverage extraction in
Australia: extract one document, cover every R-coded parcel in the state. Perth CBD sits under
city planning schemes (document work). → **GREEN spatial codes + single-document derivation**.

### 4.3 BUILDINGS — "Buildings of WA (DPIRD-084)": **1,119,752 features** (count probe) but it
is an imagery-derived RURAL product — sample feature verbatim: `{"type": "housing cluster",
"accuracy_m": 8.5}` (`wa-bldg-sample.json`); 0 features at Perth CBD (`wa-bldg-perth.json`).
Not authoritative urban footprints, no heights. → OSM/Overture + ELVIS derive; Geoscape gate
as §1.3. MS GlobalML would help outback WA; EXCLUDED.

### 4.4 TERRAIN — AHD, §8 (⚠ Perth-region AUSGeoid separation is NEGATIVE-ish vs the east
coast — per-city constant mandatory, never a national one). · 4.5 SIZE — western-australia
pbf = **114,307,529 bytes**.

**VERDICT: GATED(parcels: Landgate custom licence on attributes; geometry + planning layers
keyless GREEN). Envelope = NATIONAL-DERIVED via R-Codes + one state document.**

---

## 5 — SA (South Australia)

### 5.1 PARCELS — **PROBED via SAPPA backend; Referer-gated CDN**

The SAPPA app (sappa.plan.sa.gov.au, HTTP 200) fronts
`https://lsa2.geohub.sa.gov.au/arcgis/rest/services/SAPPA/PropertyPlanningAtlasV19/MapServer`
(282 layers, `sa-sappa-root3.json`). ⚠ **Access gate measured precisely:** bare requests to
`location.sa.gov.au` and `lsa2.geohub.sa.gov.au` → **HTTP 403** CloudFront "Request blocked"
(browser UA alone does NOT unlock: `sa-services-root3.json`); adding
**`Referer: https://sappa.plan.sa.gov.au/`** → **HTTP 200** (`sa-sappa-root3.json`). So: not
IP-geo-fenced (unlike Saudi Balady), a WAF referer rule — a proxy can satisfy it, but the
TERMS behind that must be read before wiring (probe: PlanSA data terms page + data.sa dataset
rows, which ARE open: §5.2 licence).

Layer 41 "Parcels Combined" at Rundle Mall (138.6010, -34.9235), verbatim
(`sa-l41-rundle.json`):

```json
{"plan_t": "C", "plan": "21367", "parcel_t": "F", "parcel": "1", "title_t": "CT",
 "volume": "5954", "folio": "719", "parcel_id": "C21367   F1"}
```

— plan/parcel + certificate-of-title volume/folio. (Victoria Square point returned 0 — parkland;
transcript kept.)

### 5.2 ENVELOPE RULES — ⭐ **the richest numeric layer set in Australia, PROBED**

Same MapServer. The Planning & Design Code group (from `sa-sappa-root3.json`): **52 Zones ·
102 Subzones · 126 Overlays · 199 "Technical & Numeric Variations"** with child layers:
**349 Building Envelope · 202 Maximum Building Height (Metres) · 203 Maximum Building Height
(Levels) · 350 Minimum Building Height (Levels) · 204 Minimum Dwelling Allotment Size ·
205 Minimum Frontage · 206 Minimum Site Area · 352 Minimum Primary Street Setback ·
353 Minimum Side Boundary Setback · 369 Minimum Rear Boundary Setback · 354 Site Coverage ·
201 Finished Ground and Floor Levels** (+ gradient variants).

Point hits, verbatim:
- Zone at Rundle Mall: `{"id": "Z0905", "name": "Capital City", "value": "CC"}` (layer 394,
  `sa-l394-rundle.json`)
- TNV at Rundle Mall: `{"name": "Maximum Building Height (Metres)", "description": "No
  prescribed height limit", "value": "9999"}` (`sa-l202-rundle.json`) — the sentinel is
  DECLARED in the description, not a silent magic number.
- TNV at Greenhill Rd/Unley (138.6070, -34.9500): **`"Maximum building height is 32.5m",
  value: "32.5"`** and **`"Maximum building height is 9 levels", value: "9"`**
  (`sa-l202-unley.json`, `sa-l203-unley.json`).
- Setback/site-coverage layers: enumerated live, no feature at my two probe points
  (`sa-l354-rundle.json` etc. = 0) — a residential-area point probe is owed before claiming
  fill; the layers exist and are queryable.

**Licence:** data.sa.gov.au "Planning Zones and Policy Areas" → **Creative Commons
Attribution** (`ckan-sa2.json`). SA also publishes these as open downloads — so the
Referer-gated live endpoint is a CONVENIENCE channel, the data itself is open. → **GREEN
data + a soft WAF gate on the live API.**

**Product class:** state-served numeric envelope INCLUDING setbacks and site coverage — richer
than NSW (which maps HOB/FSR but leaves setbacks to DCP documents). SA is the single best
buildable-max-envelope jurisdiction found in any sweep so far (Europe included).

### 5.3 BUILDINGS — no open state footprint product found this session (UNKNOWN, not zero —
probe: data.sa `q=building outline`, and the Adelaide City Council open data portal). OSM +
ELVIS LiDAR derive; Geoscape gate as §1.3.

### 5.4 TERRAIN — AHD, §8. · 5.5 SIZE — south-australia pbf = **67,206,086 bytes**.

**VERDICT: NATIONAL-NOW equivalent WITH the best envelope data in AU; one soft gate (Referer
header / terms read) before the live channel is wired; open downloads exist regardless.**

---

## 6 — TAS (Tasmania)

### 6.1 PARCELS — **PROBED, keyless, richest parcel attributes in AU**

`https://services.thelist.tas.gov.au/arcgis/rest/services/Public/CadastreParcels/MapServer/0`
(theLIST). At Hobart (147.3272, -42.8821), verbatim (`tas-CadastreParcels-MapServer-0-hobart.json`):

```json
{"CID": 1358531, "VOLUME": "40374", "FOLIO": 3, "PID": 3321248,
 "TENURE_TY": "Council", "COMP_AREA": 28.678, "PROP_ADD": "49-51 MURRAY ST HOBART TAS 7000"}
```

— parcel id, title volume/folio, tenure, computed area AND the address on one row.
**Licence:** UNKNOWN this session — the WFS caps carry empty `Fees/AccessConstraints`
(`tas-odwfs-caps.xml`), the LIST open-data pages are JS apps (no licence string greppable:
`tas-open-data-page.html`); a data.gov.au harvest row seen this session shows
"notspecified"/"Other". **Probe owed: the per-record metadata on listdata.thelist.tas.gov.au
(LIST records usually carry CC BY 3.0 AU).** Access itself: keyless, probed. → access GREEN,
licence **UNKNOWN(read the record)**.

### 6.2 ENVELOPE RULES — statewide scheme zones spatial + ONE state rulebook

`Public/PlanningOnline/MapServer` layer **13 = Tasmanian Planning Scheme Zones**
(`tas-planning-root.json`; code + general overlays at 14/15). At the same Hobart point,
verbatim (`tas-PlanningOnline-MapServer-13-hobart.json`):

```json
{"LPS": "Hobart Local Provisions Schedule", "ZONE": "Central Business", "ZONE_ABB": "114.16"}
```

**Product class:** Tasmania runs a SINGLE statewide planning scheme — zone standards (height,
setback per zone) live in the **State Planning Provisions, one document for the whole state**,
with Local Provisions Schedules layering exceptions. Zone polygon (data) + SPP (one extraction)
= WA-class derivation, arguably cheaper. → **GREEN zones + single-document derivation.**

### 6.3 BUILDINGS — no open footprint product probed; LIST has building points (UNKNOWN
polygon product — probe: LISTdata catalogue "building footprints"). OSM + ELVIS derive.

### 6.4 TERRAIN — AHD-TAS (separate tide-gauge origin from mainland AHD71 — a per-state
`vertDatum` note, same mechanism). · 6.5 SIZE — tasmania pbf = **53,667,005 bytes**.

**VERDICT: NATIONAL-NOW equivalent (parcels+zones keyless; licence string to read);
envelope = single-document derivation.**

---

## 7 — ACT (Australian Capital Territory)

### 7.1 PARCELS — **PROBED, keyless; zoning denormalised onto the parcel row**

ACT AGOL org `https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services` (406
services, `act-agol.json`). `ACTGOV_BLOCKS/FeatureServer/0` at Civic (149.1300, -35.2809) —
verbatim (`act-ACTGOV_BLOCKS-civic.json`):

```json
{"BLOCK_KEY": 11080190012, "BLOCK_NUMBER": 12, "SECTION_NUMBER": 19,
 "LAND_USE_POLICY_ZONES": "DES: DESIGNATED",
 "NEW_TERRITORY_PLAN": "Territory Plan Land Use Policies: DES: DESIGNATED"}
```

— ACT is leasehold; block/section IS the parcel id, and the Territory-Plan zone is already an
attribute of the block. (4 features returned incl. RETIRED lifecycle rows — filter
`CURRENT_LIFECYCLE_STAGE`.)

### 7.2 ENVELOPE RULES — `ACTGOV_TP_LAND_USE_ZONE/FeatureServer/1` at Canberra Centre
(149.1339, -35.2777), verbatim (`act-tpzone-q.json`):
`{"LAND_USE_ZONE_CODE_ID": "CZ1", "LAND_USE_POLICY_DESC": "CORE ZONE", "GAZETTAL_NUMBER":
"NI2008-27"}`. Numeric rules live in the Territory Plan district/zone codes — ONE territory
document set → single-document derivation class. Licence: ACT open-data hub datasets carry
CC-BY-4.0 (probed example row `CC-BY-4.0` in `act-hub-search.json`; the footprints/zones rows
themselves did not surface in the hub search API — licence per-item UNKNOWN, probe: the item
page on actmapi-actgov.opendata.arcgis.com).

### 7.3 BUILDINGS — **open footprints, PROBED: `ACTGOV_BUILDING_FOOTPRINTS` count = 64,674**
(`where=1=1&returnCountOnly` → `{"count":64674}`); fields BLOCK/SECTION/USE_DESCRIPTION/
BUILDING_TYPE — **no height attribute** (`act-bf-layer.json`; my one point-probe missed a
polygon, `act-bf-q.json` = 0 — transcript kept). Heights: ACT has full open LiDAR (ELVIS) →
nDSM stamp joins on footprints by block/section. → **GREEN footprints + derive heights.**

### 7.4 TERRAIN — AHD, §8. · 7.5 SIZE — act pbf = **18,868,770 bytes** (the LU-class
calibration pick for an AU pilot bake: smallest, richest-per-byte).

**VERDICT: NATIONAL-NOW equivalent — the easiest full-stack state: parcels (with zone
attached), zones, AND open footprints, all keyless AGOL.**

---

## 8 — NT (Northern Territory)

### 8.1 PARCELS + RULES — **viewer-gated this session; UNKNOWN machine channel, not zero**

- NR Maps (nrmaps.nt.gov.au) → HTTP 200 but a JS app issuing a `jsessionid` (`nt-nrmaps.html`,
  1,843 bytes of loader); no REST/OGC endpoint greppable from its loader JS (`nt-core.js`).
- NTLIS/iPlan → 302 → dipl.nt.gov.au behind a **Cloudflare challenge, HTTP 403 "Just a
  moment…"** (`nt-iplan.html`).
- data.nt.gov.au CKAN works (CC BY rows, `nt-ckan*.json`) but has **no cadastre and no
  planning-scheme zoning dataset** (searches `cadastre`, `zoning`, `planning scheme zone`,
  `land parcel boundaries` — transcripts kept; best hits are weed/water zones).
- **Probes that would settle NT:** (a) browser-session network capture of NR Maps (its WMS/
  ArcGIS backend will show in DevTools; our curl environment cannot execute its JS), (b) the
  NTLIS metadata catalogue (www.ntlis.nt.gov.au/metadata — reachable; export_data links work
  per CKAN rows), (c) a direct ask to DIPL. NT Planning Scheme ZONE data may well exist behind
  NR Maps — report **UNKNOWN(gate: JS-app/Cloudflare mediation)**, never "absent".

### 8.2 BUILDINGS — OSM only (thin); MS GlobalML would help most here of all states; EXCLUDED.
### 8.3 TERRAIN — AHD, §8. · 8.4 SIZE — northern-territory pbf = **17,690,374 bytes**.

**VERDICT: GATED(viewer/JS-app mediation; Cloudflare on the planning host) — smallest market,
last in the launch order; do not claim BLOCKED, the data visibly exists behind the viewers.**

---

## 9 — CROSS-STATE ROWS

### 9.1 SIZE (all range-GET this session, `geofabrik-au-headers2.txt` + per-state loop)

| Extract | Bytes |
|---|---|
| australia-latest.osm.pbf (national, vintage 260901) | **960,789,435** |
| new-south-wales | 266,748,889 |
| victoria | 240,644,273 |
| queensland | 197,341,278 |
| western-australia | 114,307,529 |
| south-australia | 67,206,086 |
| tasmania | 53,667,005 |
| act | 18,868,770 |
| northern-territory | 17,690,374 |

Geofabrik serves per-state extracts (contrary to a common assumption — probe
`australia.html` lists them). Whole-of-Australia ≈ **0.96 GB** pbf — roughly a fifth of
Germany alone; the §BAKE-EUROPE-NATIONAL R2-budget concern is far smaller here. Eight bake
rows in the existing shape, ACT first as the calibration pick.

### 9.2 TERRAIN + DATUM (the §L-584 rule applied to AU)

- Mapterhorn is planet-wide and ADOPTED → terrain rendering is NOT a blocker in any state.
- Vertical datum for every AU LiDAR/DTM product: **AHD (EPSG:5711; AHD-TAS on Tasmania)**.
- Orthometric→ellipsoidal lift: **AUSGeoid2020**, grid PROBED this session:
  `https://cdn.proj.org/au_ga_AUSGeoid2020_20180201.tif` → **HTTP 200, Content-Length
  5,839,686, image/tiff** — open, plain-URL. ⚠ The separation varies by tens of metres across
  the continent (west-coast values sit far below east-coast ones) — **a single national
  `geoidSepM` is impossible**; derive one constant per city at wiring time from this grid
  (probe: `gdallocationinfo au_ga_AUSGeoid2020_20180201.tif -wgs84 <lon> <lat>`), exactly the
  per-city pattern `terrain.mjs` already uses for Madrid-vs-Barcelona.
- Open LiDAR channel: ELVIS (elevation.fsdf.org.au, HTTP 200) — state DTM/DSM (CC BY 4.0
  class) → the nDSM stamp build per capital, mirroring the `mds`/`dhm` stamps.

### 9.3 BUILDINGS ROLLUP (open channels only)

| State | Open footprints | Heights |
|---|---|---|
| ACT | **YES — 64,674 probed** | derive (LiDAR) |
| VIC | Melbourne city only (**with extrusions**, CC BY) | Melbourne served; else derive |
| WA | rural clusters (DPIRD-084, 1.1M, no ids/heights) | derive |
| NSW · QLD · SA · TAS | none found (searches transcripted) | derive |
| NT | none found | — |

OSM building density per capital: UNKNOWN — measured at bake time by the existing tilemaker
counters, not asserted here. Overture is the sanctioned fallback per §BAKE-OVERTURE's own
probe-first rule. Geoscape (the national commercial product, footprints+heights+solar):
**gate = commercial sales agreement; the product site returned HTTP 403 to our probe this
session so the cost class is unread; AURIN offers it under an academic gate.** MS GlobalML:
EXCLUDED (unlicensed for us); it would matter most in NT/regional QLD/outback WA.

### 9.4 LICENCE ROLLUP (each read from a CKAN licence field or a probe this session)

| State | Parcels | Planning |
|---|---|---|
| NSW | CC Attribution (CKAN) | CC Attribution (CKAN) |
| VIC | CC BY 4.0 (CKAN) | Vicmap-hosted, data.vic family — read per-dataset at wiring |
| QLD | CC BY 4.0 (CKAN) | CC BY 4.0 (BCC via CKAN) |
| WA | geometry keyless / attributes **Custom (Other)** = Landgate gate | keyless SLIP layers |
| SA | via SAPPA (soft WAF gate); data.sa rows CC Attribution | CC Attribution (CKAN) |
| TAS | keyless; licence string UNKNOWN (read LIST record) | keyless; same |
| ACT | keyless AGOL; hub items CC-BY-4.0 (example probed) | same |
| NT | UNKNOWN (viewer-gated) | UNKNOWN |

---

## 10 — NATIONAL ROLLUP + LAUNCH ORDER

**Can AU launch as parcels + context + envelope on open data? YES — as a state-by-state
rollout, and two states launch at a product class Europe cannot offer today.**

- **PARCELS: SUBNATIONAL(8 states) = NATIONAL-DERIVED via 8 adapters.** 6 of 8 probed live
  with real identifiers this session — 5 keyless (NSW lot/plan, VIC SPI, QLD lotplan, TAS
  PID+title+address, ACT block/section) + SA plan/parcel+title behind the soft Referer gate. WA is geometry-now/
  identifiers-GATED (Landgate). NT viewer-gated. All six probed adapters are the same
  ArcGIS/WFS point-query shape the registry already speaks.
- **CONTEXT (LoD200 + heights): NATIONAL-NOW mass-only** (0.96 GB pbf, 8 bake rows, honest
  OSM defaults) — with per-capital nDSM stamps (ELVIS) as the owed height build, and Melbourne
  + ACT joins available earlier (served extrusions / open footprints).
- **ENVELOPE: SUBNATIONAL, three classes** —
  1. **Data-served numeric (NSW, SA)** — better than anywhere in Europe; buildable-max from
     live layers where mapped; document work only for clause areas + NSW setbacks.
  2. **Code-served + single-document derivation (WA R-Codes, TAS SPP, ACT Territory Plan,
     VIC residential clauses)** — one extraction per state covers every coded parcel.
  3. **Per-LGA schemes (QLD)** — Brisbane now, then LGA-by-LGA (Europe's per-city shape, but
     zone polygons are open data per LGA).

**Launch order (evidence-weighted):**
1. **NSW (Sydney)** — parcels + zoning + numeric HOB/FSR, all keyless CC-BY, one endpoint each.
2. **SA (Adelaide)** — richest envelope layer set anywhere (heights + setbacks + site
   coverage + envelope layers); clear the Referer-gate terms first.
3. **ACT (Canberra)** — easiest full stack incl. open footprints; the pilot-bake calibration
   state (18.9 MB pbf).
4. **VIC (Melbourne)** — parcels/zones now, Melbourne building heights served; envelope via
   overlay-code→schedule extraction.
5. **QLD (Brisbane)** — parcels statewide + BCC zoning; envelope per-LGA.
6. **TAS** — cheap and complete once the SPP extraction lands; read the licence record.
7. **WA (Perth)** — planning layers now; decide the Landgate parcel-attribute gate (buy vs
   geometry-only honesty label).
8. **NT** — after a browser-session probe of NR Maps; smallest market, gated viewers.

**Owed probes (named, per the honesty rules):** NSW HOB/FSR coverage-fraction per LGA · QLD
statewide zoning amalgam existence · SA TNV setback-layer fill at residential points + PlanSA
live-endpoint terms · TAS LIST licence record · ACT per-item licences · NT NR Maps backend
capture · ELVIS per-capital LiDAR coverage · per-city AUSGeoid2020 constants · Landgate
attributed-cadastre price class · Geoscape cost class (site 403 to curl; ask sales or read
AURIN terms).
