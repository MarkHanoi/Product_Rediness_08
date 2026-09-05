# Official building-footprint registers — the per-region survey

**Lane FOOTPRINT-REGISTER-SURVEY · row L-12941 · surveyed 2026-09-05.**
Founder ask (2026-09-05 close): *"official footprints by floor (Catastro/BD TOPO) … this probably is
the case also in France etc — I want this level of detail"* — **everywhere**, not in Spain alone.

This file answers one question, for **every one of the 50 rows in `tools/context-bake/bake.mjs`
`ALL_REGIONS`**:

> Is there an **OPEN official building register with FOOTPRINTS** for this region — and should we
> build an adapter for it, or does OSM stay?

---

## 0 — What this file is NOT

Three sibling docs already exist and are each about a *different* axis. Collapsing them is how
"we have Spain" gets written for four incompatible meanings.

| Doc | Axis | A "yes" means |
|---|---|---|
| `PARCEL-SELECT-COVERAGE.md` | **land boundary** | a click returns the cadastral *parcel* polygon |
| `GEO-DATA-SOURCING-MASTER.md` | **terrain + height** | a DTM and a per-building *height* exist |
| `HEIGHTS-COVERAGE-AND-BLOCKED.md` | height *pipeline status* | a height join is wired and green |
| **THIS FILE** | **the building outline itself** | an **official** register publishes the *footprint* |

Today **every bake region except the four Gulf rows draws its footprints from OSM**
(`buildingsSource` defaults to `osm`; riyadh/jeddah/dubai/abudhabi use `overture`). Every
`heightJoin` in `bake.mjs` — `mds`, `dhm`, `mnh_fr`, `3dbag`, `swiss`, `ealidar_gb`, `bev_at`,
`cuzk_cz`, `gurs_si`, `ee_etak`, `be_dhmv`, `ndh_no`, `lod2de`, `lod2nrw`, `us_open`, `au_open`,
`ad_ndsm` — is a **STAMP onto OSM geometry**, never a footprint source. That is the gap this
survey scopes: *the outline is OSM's everywhere, even where the state publishes a better one.*

---

## 1 — Legend

### Verdicts

| Verdict | Meaning | What we do |
|---|---|---|
| **ADOPT** | An open official footprint register exists, reachable without a paid licence, and it plausibly beats OSM on completeness or attributes | build an adapter (§4 says which kind) |
| **KEY-GATED** | The register exists and is open-licensed, but the download demands a credential — free self-service, free-with-approval, or org onboarding | acquire the credential first; the row names it |
| **OSM-STAYS** | Either no official footprint register, or one that is *worse* than OSM (generalised, partial, no attribute lift) for our purpose | do nothing; keep OSM and say so |
| **NONE** | No open official footprint register located at all | keep OSM/Overture; the row records what was checked |

### Evidence grades — every cell carries one

| Grade | Meaning |
|---|---|
| **PROBED** | curl'd on **2026-09-05 from this machine**; the exact status / bytes / content-type / first bytes are in §2 |
| **VERIFIED-BY-CODE** | asserted by a live in-repo artefact — `tools/context-bake/heightSources.mjs` `SOURCES`, a bake `heightJoin`, or `PARCEL-SELECT-COVERAGE.md`'s measured table |
| **VERIFIED-BY-DOC** | asserted by `GEO-DATA-SOURCING-MASTER.md` (founder-verified 2026-07-25) and **not re-probed here** |
| **UNVERIFIED** | not probed, not in a repo artefact. **A claim, not a measurement.** Never wire from an UNVERIFIED row |

⛔ **No URL in this file was invented.** Where a plausible endpoint was guessed and 404'd, the row
says the guess failed and drops to UNVERIFIED — it does **not** silently keep the URL. (Luxembourg
is the one such row; see §2 probe 36.)

### The completeness column is an ESTIMATE, and says so

**Nowhere in this survey did anyone measure "how many post-2015 buildings does the register have
that OSM lacks".** That measurement is *owed*, it is cheap, and §6 specifies it exactly. Until it
runs, the "post-2015 gain" column is a **prior**, and the build order it feeds is a **proposal**,
not a finding. Treating it otherwise is exactly the defect
[[confident-register-rows-are-the-wrong-ones]] records.

---

## 2 — Probe log — 36 live probes, verbatim answers (2026-09-05)

Run with `curl -sS -m 35..90` from the dev machine. Every line is the real answer; a failure is
recorded as a failure (§C57 §1.5 — *failure ≠ empty*).

### 2.1 — The six priority endpoints the lane was told to probe

**① 🇳🇿 NZ — LINZ Data Service, NZ Building Outlines (layer 101290)**

| # | Request | Answer |
|---|---|---|
| 1 | `GET https://data.linz.govt.nz/layer/101290-nz-building-outlines/` | **HTTP 200 · 12,099 B · text/html** — a Koordinates SPA shell (`<title>LINZ Data Service</title>`); no machine-readable metadata in the HTML |
| 2 | `GET https://data.linz.govt.nz/services/wfs?service=WFS&request=GetCapabilities` | **HTTP 401 · 486 B · text/html;charset=iso-8859-1** — `<title>Error 401 Unauthorized</title>`, `URI: /geoserver/data.linz.govt.nz/wfs` |
| 3 | same with `;key=0000000000000000000000000000000` | **HTTP 401 · 486 B** — byte-identical body. The key is real auth, not a path decoration |
| 4 | `GET https://data.linz.govt.nz/services/api/v1.x/layers/101290/` | **HTTP 200 · 12,129 B · application/json — KEYLESS** |

Probe 4 is the find. The **metadata API is open even though the data is not**:

```
title            NZ Building Outlines
licence          Creative Commons Attribution 4.0 International (id 171, type cc-by)
first_published  2019-05-08T23:10:49Z      published  2026-05-18T03:14:26Z
feature_count    3,236,141                 geometry   polygon      CRS  EPSG:2193
publisher        LINZ National Topographic Office
fields           building_id, name, use, suburb_locality, town_city, territorial_authority,
                 capture_method, capture_source_group, capture_source_id, capture_source_name,
                 capture_source_from, capture_source_to, last_modified, shape
```

⭐ **3.24 M national footprints, CC BY 4.0, one dataset, no per-region assembly.** ⚠ **No height
field and no floor field** — the attribute list above is complete. NZ is a *footprint* win and a
*height* nothing.

**② 🇦🇺 NSW — Spatial Services**

| # | Request | Answer |
|---|---|---|
| 5 | `GET https://portal.spatial.nsw.gov.au/server/rest/services?f=json` | **HTTP 200 · 4,988 B · application/json** — `currentVersion 10.91`, folders `[Hosted, Portal, public, SCA, sixmaps, Utilities]`, **48 distinct service names** |
| 6 | `.../services/public?f=json` and `.../services/sixmaps?f=json` | **HTTP 200 · 62 B each** — both folders empty to an anonymous caller |
| 7 | `GET .../portal/sharing/rest/search?q=building&f=json&num=20` | **HTTP 200 · 204,617 B** — `total 113` |

The 48 service names contain **no `Building*`, no `Structure*`, no topographic-base service**. The
full list is Cadastre_History, Fauna/Flora/Floods/Linescan, NSW_Administrative_Boundaries_Theme,
NSW_Elevation_and_Depth_Theme, NSW_FOI_{Education,Emergency,Health,Justice,Transport}_Facilities,
NSW_Features_of_Interest_Category, NSW_Geocoded_Addressing_Theme, NSW_Imagery_Theme,
NSW_Land_Parcel_Property_Theme, NSW_Physiography_Category, NSW_Property_Address_History,
NSW_Transport_Theme, NSW_Water_Theme, StrataHub, SurveyMarkGDA2020/94, Water_Quality/Quantity_Trends
(each also in a `_multiCRS` twin).

The 113 hub hits that *mention* "building" are **not footprints**: `Building Complex Point`
(a POI **point** in the Features-of-Interest theme), `EPI_Height of Building` (the **planning
height limit** from an Environmental Planning Instrument — a legal ceiling, not a measured
building), `3D Heights of Building Scene`, and Esri layer templates.
⚠ **`EPI_Height of Building` is a zoning constraint. Reading it as a building height would be a
category error of exactly the kind C58 §1.4 forbids.**

**③ 🇦🇺 VIC — Vicmap (opendata.maps.vic.gov.au)**

| # | Request | Answer |
|---|---|---|
| 8 | `GET .../geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities` | **HTTP 200 · 734,521 B · application/xml** — `open-data-platform:building_polygon` and `open-data-platform:building_point` both present, **keyless** |
| 9 | `.../DescribeFeatureType&typeNames=open-data-platform:building_polygon` | **HTTP 200 · 2,386 B · application/gml+xml** |

Complete field list from probe 9 — **14 fields, zero vertical**:

```
ufi:int · pfi:int · feature_type:string · feature_subtype:string · state:string
auth_org_code:string · auth_org_id:string · auth_org_verified:dateTime
create_date_pfi:dateTime · superceded_pfi:int · create_date_ufi:dateTime
feature_ufi:int · feature_create_date_ufi:dateTime · geom:MultiSurface
```

**No height, no floors, no roof.** This corroborates `heightSources.mjs` `elvis_au`
(*"Vicmap statewide building layers carry no height"*) and adds the exact schema.

**④ 🇩🇰 DK — GeoDanmark / BBR (Datafordeler)**

| # | Request | Answer |
|---|---|---|
| 10 | `GET https://services.datafordeler.dk/GeoDanmarkVektor/GeoDanmark60_NOHIST_GML3/1.0.0/WFS?service=WFS&request=GetCapabilities` | **HTTP 503 · 74 B · text/plain** — verbatim: `This service has been deliberately (and temporarily) taken out of service.` |
| 11 | `.../GeoDanmark60_GML3/1.0.0/WFS?...` | **HTTP 404 · 0 B** |
| 12 | `GET https://services.datafordeler.dk/BBR/BBRPublic/1/rest/bygning?format=json&id=1` | **HTTP 403 · 25 B · text/plain** — verbatim: `(403) Unauthorized access` |
| 13 | `GET https://api.dataforsyningen.dk/` | **HTTP 404 · 604 B · text/html** — "Dataforsyningen API Gateway" index page |
| 14 | `GET https://api.dataforsyningen.dk/geodanmark_ows?service=WFS&request=GetCapabilities` | **HTTP 404 · 604 B** — same gateway page; that route does not exist |

⚠ **Probe 10 is a NEW fact and it is not a credential failure.** `heightSources.mjs` `geodanmark`
records the host as `wfs.datafordeler.dk` returning **401** without a key. The `services.` host
returns **503 with a deliberate-withdrawal message** — a different wall. *Which host is current is
an OPEN question* (§7 Q1); do not treat "DK needs the key" as the whole story until it is answered.
BBR's public REST is a plain 403 → credential.

**⑤ 🇫🇮 FI — NLS / Maanmittauslaitos**

| # | Request | Answer |
|---|---|---|
| 15 | `GET https://inspire-wfs.maanmittauslaitos.fi/inspire-wfs/bu_mtk_polygon/wfs?service=WFS&version=2.0.0&request=GetCapabilities` | **HTTP 404 · 472 B · application/xml** — `<ows:Exception exceptionCode="NotFound"><ows:ExceptionText>No service with identifier 'bu_mtk_polygon/wfs' available.</ows:ExceptionText>` |
| 16 | `GET https://inspire-wfs.maanmittauslaitos.fi/inspire-wfs/bu/wfs?...` | **connection reset** — `curl: (56) Recv failure` (HTTP 000, 0 B) |
| 17 | `GET https://inspire-wfs.maanmittauslaitos.fi/inspire-wfs/` | **connection reset** — `curl: (56)` |
| 18 | `GET https://avoin-paikkatieto.maanmittauslaitos.fi/maastotiedot/features/v1/collections?f=json` | **HTTP 401 · 0 B** |

⛔ **This CORRECTS `GEO-DATA-SOURCING-MASTER.md` §1.** That table's Finland row says the national
building footprints are *"INSPIRE Buildings WFS `inspire-wfs.maanmittauslaitos.fi/inspire-wfs/
bu_mtk_polygon` — **ANONYMOUS/keyless** … **OK — VERIFIED live 2026-07-25**"*, and §2 row 2 says
*"national **building footprints via INSPIRE WFS are ANONYMOUS** (no key at all)"*.
**That service identifier no longer resolves** — the host answers, and names the identifier it does
not have. The host also refuses a bare service listing (probe 17), so the current identifier could
not be discovered from here. **Finland's footprints are, from this machine today, NOT keylessly
reachable.** The correction is filed in §5 and appended to the master.

**⑥ 🇵🇱 PL — GUGiK BDOT10k**

| # | Request | Answer |
|---|---|---|
| 19 | `GET https://mapy.geoportal.gov.pl/wss/service/PZGIK/BDOT/WFS/PobieranieBDOT10k?service=WFS&request=GetCapabilities` | **HTTP 200 · 15,236 B · text/xml** — `<ows:Title>Usługa WFS pobierania danych BDOT10k</ows:Title>`, **`<ows:AccessConstraints>NONE`**, exactly ONE feature type: `ms:BDOT10k_powiaty` |
| 20 | `.../GetFeature&typeNames=ms:BDOT10k_powiaty&count=1` | **HTTP 200 · 92,680 B · `text/xml; subtype="gml/3.2.1"`** |
| 21 | `HEAD https://opendata.geoportal.gov.pl/bdot10k/schemat2021/04/0401_GML.zip` | **HTTP 200 · Content-Length 26,840,114 · application/octet-stream · keyless**, `Content-Disposition: attachment; filename="0401_GML.zip"` |
| 22 | `GET https://opendata.geoportal.gov.pl/bdot10k/schemat2021/04/` | **HTTP 404 · 43 B** — `plik nie istnieje: /bdot10k/schemat2021/04/` (no directory listing; the WFS **is** the index) |

Probe 20's single feature, verbatim:

```
TERYT              0401
NAZWA_POWIATU      powiat aleksandrowski
Data_aktualizacji  2023-12-21 00:00:00
URL_GML            https://opendata.geoportal.gov.pl/bdot10k/schemat2021/04/0401_GML.zip
CRS                EPSG:2180
```

⭐ **This is the classic INSPIRE pre-defined-dataset pattern and it is fully keyless: the WFS is a
DOWNLOAD INDEX** — one polygon per powiat, each carrying its own bulk-GML URL and its own currency
date. 380 powiats ⇒ 380 zips ⇒ national coverage with no credential and no pagination trap.
The building class inside is `OT_BUBD_A`; `heightSources.mjs` `bdot10k_pl` records its storey
attribute as `derived-levels`, **and records that the storey fill is UNMEASURED** — that honesty
carries straight over to the footprint verdict.

### 2.2 — The additional probes (opportunistic, all keyless-candidate)

**🇪🇸 ES — Catastro INSPIRE Buildings (the founder's named anchor)**

| # | Request | Answer |
|---|---|---|
| 23 | `GET https://www.catastro.hacienda.gob.es/INSPIRE/buildings/ES.SDGC.BU.atom.xml` | **HTTP 200 · 682,565 B · text/xml — keyless** — `<title>Download service of Buildings. Territorial Office</title>`, **56 `<entry>`** (one per territorial office / province); first entry "Territorial office 02 Albacete", `<updated>2026-02-20T00:00:00Z</updated>` |
| 24 | `GET http://www.catastro.hacienda.gob.es/INSPIRE/buildings/02/ES.SDGC.bu.atom_02.xml` | **HTTP 200 · 151,473 B · text/xml** — **87 entries** (municipalities of Albacete); first = `02001-ABENGIBRE buildings` → `https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/02/02001-ABENGIBRE/A.ES.SDGC.BU.02001.zip` |
| 25 | `GET .../A.ES.SDGC.BU.02001.zip` | **HTTP 200 · 338,212 B · application/x-zip-compressed** |

Zip members (probe 25, read with `zipfile`):

```
A.ES.SDGC.BU.02001.building.gml            3,284,361 B
A.ES.SDGC.BU.02001.buildingpart.gml        4,512,143 B
A.ES.SDGC.BU.02001.otherconstruction.gml      13,701 B
A.ES.SDGC.BU.MD.02001.xml                     20,004 B   (metadata)
```

Parsed content — **this is the load-bearing measurement of the whole survey**:

| File | Features | `numberOfFloorsAboveGround` | Other |
|---|---|---|---|
| `building.gml` | **704** `bu-ext2d:Building` | **NIL — `nilReason="other:unpopulated"`** | `horizontalGeometryReference footPrint`, `horizontalGeometryEstimatedAccuracy 0.1 m`, EPSG:25830, `currentUse 3_industrial`, `dateOfConstruction 1994-01-01`, `externalReference/reference 000700100XJ24B` (referencia catastral), a facade-photo `documentLink` per building |
| `buildingpart.gml` | **1,782** `bu-ext2d:BuildingPart` | **1,782 / 1,782 populated — 100 %, zero nil.** Histogram: `1`×977 · `2`×713 · `3`×51 · `0`×39 · `4`×2 | `numberOfFloorsBelowGround` 1,782/1,782; `heightBelowGround uom="m"` present |

⭐ **The founder's "footprints by floor" is literally this file.** A Catastro *Building* is one
cadastral reference; its *BuildingParts* are the **massing stack** — each part is a footprint
polygon carrying its own above- and below-ground storey count. 704 buildings → 1,782 parts in one
small town: the parts are what let you extrude a stepped volume instead of a single prism.

⚠ **Two honest caveats, both measured:**
1. **The floor count is on the PART, never on the Building.** Any adapter that reads
   `Building/numberOfFloorsAboveGround` reads `unpopulated` and will silently produce nothing. This
   is a live tripwire: the field *exists in the schema* at both levels.
2. **There is NO above-ground metre height anywhere in the payload.** `heightBelowGround` is the
   only length. So Catastro is `derived-levels` on the vertical axis — exactly what
   `heightSources.mjs` `catastro` already says (*"a COUNT, ×3.2 m — NOT a measurement"*) — and the
   *measured* Spanish height stays MDS Edificación (`heightJoin:'mds'`).

🟡 **LICENCE UNREAD — this blocks adoption, not the engineering.** The ATOM feed's own
`<rights>` element reads, verbatim:

```
Copyright (c) 2012", ES.SDGC; all rights reserved
```

That string is INSPIRE-feed boilerplate and almost certainly does not describe the actual reuse
regime (Spanish public-sector reuse, Ley 37/2007), but **this survey did not read the actual
licence** and will not paraphrase one it has not read. **Resolve before adopting** (§7 Q2).

**🇫🇷 FR — IGN BD TOPO® `batiment` via the Géoplateforme WFS**

| # | Request | Answer |
|---|---|---|
| 26 | `GET https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities` | **HTTP 200 · 5,192,751 B · application/xml — keyless** — `BDTOPO_V3:batiment` present (also `BDTOPO_V3_DIFF:batiment` and `BDTOPO_V3_DIFF:batiment_rnb_lien_bdtopo`) |
| 27 | `.../DescribeFeatureType&TYPENAMES=BDTOPO_V3:batiment` | **HTTP 200 · 4,040 B** — 28 fields |
| 28 | `.../GetFeature&COUNT=1&SRSNAME=urn:ogc:def:crs:OGC:1.3:CRS84&BBOX=2.34,48.85,2.35,48.86,urn:ogc:def:crs:OGC:1.3:CRS84&OUTPUTFORMAT=application/json` | **HTTP 200 · 1,494 B — real GeoJSON, keyless** |

Probe 27's field list — the richest register schema in this survey:

```
cleabs · nature · usage_1 · usage_2 · construction_legere · etat_de_l_objet
date_creation · date_modification · date_d_apparition · date_de_confirmation
sources · identifiants_sources
methode_d_acquisition_planimetrique · methode_d_acquisition_altimetrique
precision_planimetrique · precision_altimetrique
nombre_de_logements · nombre_d_etages
materiaux_des_murs · materiaux_de_la_toiture
hauteur · altitude_minimale_sol · altitude_minimale_toit
altitude_maximale_toit · altitude_maximale_sol
origine_du_batiment · appariement_fichiers_fonciers · identifiants_rnb
geometrie (MultiSurface, 3D — z carried per vertex)
```

Probe 28's real Paris building, verbatim:

```json
{"id":"batiment.5805548","properties":{
  "cleabs":"BATIMENT0000000241936036","nature":"Indifférenciée","usage_1":"Résidentiel",
  "date_creation":"2010-08-17","date_modification":"2019-03-15",
  "methode_d_acquisition_planimetrique":"BDParcellaire recalée",
  "methode_d_acquisition_altimetrique":"Interpolation bâti BDTopo",
  "precision_planimetrique":3,"precision_altimetrique":2.5,
  "nombre_de_logements":5,"nombre_d_etages":4,
  "hauteur":21.2,"altitude_minimale_sol":35.7,"altitude_minimale_toit":56.9}}
```
Geometry came back as 3D coordinates (`[2.33987437, 48.85253807, 56.9]`).

⭐ **France beats Spain on the vertical axis**: `hauteur` **in metres**, `nombre_d_etages`
**and** the acquisition method and its stated precision — i.e. the register hands us the
provenance C58 §1.4 demands instead of making us assert it. `identifiants_rnb` links to the
Référentiel National des Bâtiments, the new national building identifier.

⚠ **One trap, measured:** `BBOX=…,EPSG:4326` (lat,lon) returned `numberMatched="0"`. Only the
**CRS84 (lon,lat)** form returns features. A silent zero from an axis-order mistake is
indistinguishable from "no buildings here" — precisely the failure `[[context-data-honesty-family]]`
names. Any adapter must assert non-zero on a known-dense control cell.

**🇳🇱 NL — Kadaster BAG via PDOK**

| # | Request | Answer |
|---|---|---|
| 29 | `GET https://service.pdok.nl/lv/bag/wfs/v2_0?service=WFS&version=2.0.0&request=GetCapabilities` | **HTTP 200 · 19,699 B · text/xml — keyless** — feature types `bag:pand`, `bag:ligplaats`, `bag:standplaats`, `bag:verblijfsobject`, `bag:woonplaats`; **`<ows:AccessConstraints>https://creativecommons.org/publicdomain/zero/1.0/deed.nl` → CC0** |

`bag:pand` is the national building-footprint register (with `bouwjaar`, the construction year).
Heights already come from 3D BAG (`heightJoin:'3dbag'`, wired 2026-09-05).

**🇨🇿 CZ — ČÚZK INSPIRE Buildings (RÚIAN-derived)**

| # | Request | Answer |
|---|---|---|
| 30 | `GET https://services.cuzk.cz/wfs/inspire-bu-wfs.asp?service=WFS&request=GetCapabilities` | **HTTP 200 · 23,642 B · text/xml** (Marushka 4.2.22.8) — `bu:Building` + `bu:BuildingPart`; **`<ows:Fees>none`**, **`<ows:AccessConstraints>none`** |
| 31 | `.../GetFeature&typeNames=bu:Building&count=1` | **HTTP 200 · 9,121 B** |

Probe 31's feature `BU.16478`:
```
heightAboveGround   NIL — nilReason=".../VoidReasonValue/Unpopulated"
elevation           NIL — Unpopulated
dateOfConstruction  1998-02-25
externalReference   informationSystem http://vdp.cuzk.cz/ · name "ISÚI" · reference 84123699
```
⇒ **Footprints yes, keyless, no fee. Vertical: nothing.** Czech floor counts (`počet podlaží`)
live in the **RÚIAN VFR bulk export** at `vdp.cuzk.cz`, not in this WFS — which is exactly what
`heightSources.mjs` `ruian_cz` already says (*"the WFS height slot is NIL, never read it as data"*).
This probe independently confirms it.

**🇪🇪 EE — Maa-amet ETAK (mirror at gsavalik.envir.ee)**

| # | Request | Answer |
|---|---|---|
| 32 | `GET https://gsavalik.envir.ee/geoserver/etak/wfs?service=WFS&version=2.0.0&request=GetCapabilities` | **HTTP 200 · 147,052 B · application/xml — keyless** — `etak:e_401_hoone_ka` (buildings, area) and `etak:e_404_maaalune_hoone_ka` (underground) present |

Same layer the wired `heightJoin:'ee_etak'` already reads for `korgus_m`. **Estonia's footprint
adapter is nearly free — the fetcher exists; it currently discards the geometry.**

**🇳🇴 NO — Geonorge (Kartverket)**

| # | Request | Answer |
|---|---|---|
| 33 | `GET https://kartkatalog.geonorge.no/api/search?text=FKB-Bygning&limit=3` | **HTTP 200 · 60,543 B** — `NumFound 81`; FKB-Bygning uuid `8b4304ea-4fb0-479c-a24d-fa225e2c6e97` |
| 34 | `GET https://kartkatalog.geonorge.no/api/getdata/8b4304ea-…` | **HTTP 200 · 16,776 B** |
| 35 | `GET https://kartkatalog.geonorge.no/api/getdata/ea192681-…` (N50 Kartdata) | **HTTP 200 · 23,514 B** |

Probe 34, verbatim constraints on **FKB-Bygning** — the detailed national building register:
```
AccessConstraints      "Norge digitalt begrenset"
UseLimitations         "Nedlasting av data begrenset til Norge digitalt avtaleparter."
OtherConstraintsAccess http://inspire.ec.europa.eu/metadata-codelist/
                       LimitationsOnPublicAccess/INSPIRE_Directive_Article13_1d
OtherConstraintsLink   .../norge-digitalt-lisens
```
⇒ **Download restricted to Norge digitalt agreement parties.** This is a *membership* gate, not a
self-service key. It independently confirms `GEO-DATA-SOURCING-MASTER.md`'s *"Do NOT license FKB"*
and supplies the exact reason, which that doc did not carry.

Probe 35, **N50 Kartdata** (the open alternative): `AccessConstraints "Åpne data"`,
**CC BY 4.0**, `noLimitations`. But N50 is a **1:50 000 generalised topographic product** — it is
not a building register and its outlines are coarser than OSM's in any Norwegian town. **OSM stays.**

**🇬🇧 GB — Ordnance Survey OpenData**

| # | Request | Answer |
|---|---|---|
| 36 | `GET https://api.os.uk/downloads/v1/products/OpenMapLocal` | **HTTP 200 · 1,399 B · application/json — keyless** — `{"id":"OpenMapLocal","name":"OS OpenMap - Local","version":"2026-04", …}` |

The OS **OpenData downloads API needs no key**. OS OpenMap Local carries a `Building` layer under
OGL v3. ⚠ It is a **cartographic** product (buildings merged into blocks at 1:10 000), and OS's
per-building **Building Height Attribute is commercial** — both facts already recorded in
`GEO-DATA-SOURCING-MASTER.md` §3. Against Britain's near-complete OSM building coverage this is a
downgrade, not an upgrade.

**🇮🇪 IE — data.gov.ie**

| # | Request | Answer |
|---|---|---|
| 37 | `GET https://data.gov.ie/api/3/action/package_search?q=building+footprint&rows=5` | **HTTP 200 · 40,891 B** — `count 24`; top hits: *BER Ratings Building Certs FCC* (Fingal CoCo), *INFOMAR Seabed Survey Trackline*, *Corporate Energy Audit DCC*, *INSPIRE Strategic noise maps* |

**No national building-footprint dataset surfaced.** Tailte Éireann's Prime2 is the national
large-scale base and is **licensed, not open** (UNVERIFIED here — not probed).

**🇱🇺 LU — the one guessed URL**

| # | Request | Answer |
|---|---|---|
| 38 | `GET https://wfs.inspire.geoportail.lu/geoserver/bu/wfs?service=WFS&request=GetCapabilities` | **HTTP 404 · 146 B · nginx** |

⛔ This URL was **constructed by analogy** with the LU cadastral-parcel endpoint that
`PARCEL-SELECT-COVERAGE.md` records as WIRED (`wms.inspire.geoportail.lu … cp:CP.CadastralParcel`).
It 404'd. **The correct Buildings path was not found, so Luxembourg is UNVERIFIED — not "none".**

---

## 3 — The master table — all 50 `ALL_REGIONS` rows

Columns: **Register / publisher** · **Access** · **Licence** · **Cadence** · **Coverage** ·
**Vertical attribute** · **Expected post-2015 gain over OSM** (⚠ prior, unmeasured — §6) ·
**Verdict** · **Evidence**.

### 3.1 — Europe

| Bake region(s) | Register / publisher | Access | Licence | Cadence | Coverage | Vertical attr. | Post-2015 gain (prior) | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| **spain** | **Catastro INSPIRE Buildings** (Dirección General del Catastro) — `building` + **`buildingpart`** GML | **keyless bulk** ATOM: national feed → 56 province feeds → per-municipality zip | 🟡 feed `<rights>` says *"all rights reserved"* — **UNREAD**, resolve first | province feed `updated 2026-02-20`; Catastro is continuously maintained | **national** (common regime; ES-PV/ES-NA foral cadastres are separate — UNVERIFIED) | **floors per BuildingPart** — 1782/1782 populated in the probe. **No metre height** | **HIGH** — Catastro is the *legal* record; a licensed new build enters it on declaration | **ADOPT** *(licence-gated)* | **PROBED** 23–25 |
| **france**, **paris**, **lyon** | **IGN BD TOPO® `batiment`** (Géoplateforme WFS) | **keyless** WFS 2.0, GeoJSON out | Licence Ouverte / Etalab (VERIFIED-BY-DOC) | BD TOPO ships quarterly; `date_modification` per feature | **national** | **`hauteur` (m) + `nombre_d_etages` + roof/ground altitudes + `methode_d_acquisition_altimetrique` + `precision_altimetrique`** | **HIGH** — plus it retires the 4 h MNH raster join (L-12937) | **ADOPT** ⭐ | **PROBED** 26–28 |
| **netherlands** | **Kadaster BAG `pand`** via PDOK | **keyless** WFS 2.0 | **CC0** (`AccessConstraints` header, probed) | BAG is continuous (statutory) | **national** | none on `pand` (`bouwjaar` only) — heights already from 3D BAG | **MED** — NL OSM is strong, but BAG ids let the 3D BAG join go **id-level instead of spatial** | **ADOPT** | **PROBED** 29 |
| **poland** | **GUGiK BDOT10k `OT_BUBD_A`** — per-powiat GML | **keyless bulk**; the WFS *is* the download index (`URL_GML` per powiat) | `AccessConstraints NONE` (probed); PL open-data regime | per-powiat `Data_aktualizacji` (sample: 2023-12-21) | **national** (380 powiats) | **storey count** (`derived-levels`; **fill UNMEASURED** per `heightSources.mjs`) | **HIGH** — PL is baked mass-only today, no height join at all | **ADOPT** | **PROBED** 19–22 |
| **czechia** | **ČÚZK INSPIRE BU** (`bu:Building` + `bu:BuildingPart`), RÚIAN-derived | **keyless** WFS; `Fees none`, `AccessConstraints none` | open (fees none, probed) | RÚIAN continuous | **national** (ČÚZK claims 99.50 % digital map — VERIFIED-BY-CODE via `PARCEL-SELECT-COVERAGE.md`) | **NIL in the WFS** (`heightAboveGround` Unpopulated). Floors only in the **VFR bulk** at `vdp.cuzk.cz` | **MED-HIGH** | **ADOPT** *(footprints from WFS; floors need the VFR parse)* | **PROBED** 30–31 |
| **estonia** | **Maa-amet ETAK `e_401_hoone_ka`** (mirror `gsavalik.envir.ee`) | **keyless** WFS; ⚠ hard **5,000-object cap per request**, applies to hit counts too | Maa-amet open data, attribution "Maa- ja Ruumiamet" | ETAK continuous | **national** | **`korgus_m` — surveyed metres**, already stamped | **MED** — the fetcher already runs; only the geometry is discarded | **ADOPT** *(cheapest in the set)* | **PROBED** 32 + **VERIFIED-BY-CODE** (`eesti3d_ee`, `heightJoin:'ee_etak'`) |
| **slovenia** | **GURS KN `STAVBE` / `STAVBE_OBRIS`** | keyless WFS | **CC BY 4.0** | continuous | **national** | **register metres** (lowest/highest elevation + characteristic height); per-floor `ETAZE`/`VISINA_ETAZE` exists | **MED** | **ADOPT** | **VERIFIED-BY-CODE** (`gurs_si`, `heightJoin:'gurs_si'`) — footprint arm **UNVERIFIED** |
| **denmark** | **GeoDanmark `Bygning`** (Datafordeler) + **BBR** attributes | **CREDENTIAL** — `services.datafordeler.dk` → **503 deliberate withdrawal**; BBR REST → **403**; `wfs.datafordeler.dk` → 401 w/o key (repo record). We *hold* `DATAFORDELER_API_KEY` (Fly; repo-secret action owed) | Danish open data | continuous | **national** | **footprint only — NO height attr** (verified against the objekttypekatalog). BBR `ETAGER_ANT` = floors via `BBRUUID` | **MED** — heights already come from the DHM nDSM join | **KEY-GATED** | **PROBED** 10–14 + **VERIFIED-BY-CODE** (`geodanmark`) |
| **finland** | NLS/MML national topographic buildings | ⛔ **the documented keyless identifier is GONE** — `bu_mtk_polygon` → 404 *"No service with identifier … available"*; OGC-API → 401 | CC BY 4.0 | — | national | Buildings 3D LoD2 exists but **PARTIAL** coverage; Helsinki's own WFS has `i_kerrlkm` floors, capital-only | **MED** | **KEY-GATED** ⚠ *(was documented as keyless — see §5 correction 1)* | **PROBED** 15–18 |
| **sweden** | Lantmäteriet **Byggnad** | **CREDENTIAL** — OAuth2 `client_credentials`, needs **organisation onboarding** | CC BY 4.0 | — | national | **no height attribute**; no DSM raster exists to difference either (re-probed 2026-09-05) | **MED** | **KEY-GATED** | **VERIFIED-BY-DOC** + **VERIFIED-BY-CODE** (`lidar_se`) |
| **norway** | **FKB-Bygning** (Kartverket) | ⛔ **`Norge digitalt begrenset`** — *"Nedlasting … begrenset til Norge digitalt avtaleparter"*, INSPIRE Art. 13(1)(d) | Norge digitalt licence — **not open** | continuous | national | detailed (roof lines, ridge) | — | **KEY-GATED** *(membership, not a key)*. **N50 Kartdata is CC BY 4.0 but 1:50 000 generalised → not a register** | **PROBED** 33–35 |
| **germany** | per-Land **LoD2 CityGML** + ALKIS `Gebäude`; **no single national footprint service** | mixed per-Land; Berlin & Bavaria keyless, Bayern's ALKIS WFS `401 Basic realm="INSPIRE-WFS ALKIS"` | mostly DL-DE / CC BY 4.0 | per-Land | 16 separate connectors | LoD2 `measuredHeight` — already the wired `lod2de` join | **LOW-MED** — DE OSM building coverage is among the world's best | **OSM-STAYS** *(footprints)* — LoD2 stays the **height** source | **VERIFIED-BY-CODE** (`lod2de`, `lod2de_nrw`) + **VERIFIED-BY-DOC** |
| **koln** | LoD2 NRW (same as above, city bbox) | keyless | DL-DE/Zero | — | NRW | `measuredHeight` (wired `lod2nrw`) | LOW | **OSM-STAYS** | **VERIFIED-BY-CODE** |
| **switzerland** | **swissBUILDINGS3D** (swisstopo) | free account / bulk (UNVERIFIED here) | swisstopo open data | continuous | national | LoD2 solids; heights already via swissSURFACE3D nDSM (`heightJoin:'swiss'`) | **LOW-MED** — CH OSM is dense | **OSM-STAYS** *(revisit if the LoD2 mesh tier lands)* | **UNVERIFIED** (footprint arm) + **VERIFIED-BY-CODE** (height arm) |
| **austria** | **BEV** / per-Land ALS; `data.bev.gv.at` | the only keyless BEV channel found is a **WMS GetFeatureInfo** (parcels) | CC BY 4.0 | — | national | heights already via `bev_at` ALS nDSM | **LOW-MED** | **UNVERIFIED** → treat as **OSM-STAYS** until a Buildings endpoint is probed | **VERIFIED-BY-CODE** (`geoland_at`, parcels row) |
| **belgium** | **Flanders** GRB / Basisregisters `gebouwen` (anonymous REST, verified 2026-07-25) · **Brussels** UrbIS 3D Constructions (CC0) · **Wallonia** regional | keyless in all three regions | Open Data / CC0 | continuous | **regional, 3 connectors** | Flanders 3D GRB LoD1; heights already via `be_dhmv` | **MED** — but three adapters for one bake row | **ADOPT (deferred)** | **VERIFIED-BY-DOC** |
| **luxembourg** | ACT / BD-L-TC | ⛔ the guessed INSPIRE BU URL **404'd** | — | — | — | — | — | **UNVERIFIED** | **PROBED** 38 (negative) |
| **italy** | **DBSN** (Istat) + regional CTR — no unified national footprint service | UNVERIFIED | — | — | **regional patchwork** | — | **LOW-MED** | **UNVERIFIED** → **OSM-STAYS** for now | **VERIFIED-BY-DOC** (the *height* half: "no unified national connector yet — re-check quarterly") |
| **greatbritain** | **OS OpenMap Local** (`Building`) | **keyless** downloads API, `version 2026-04` | OGL v3 | ~2×/yr | GB | none — OS **Building Height Attribute is commercial** | **LOW** — generalised to blocks; GB OSM buildings are near-complete | **OSM-STAYS** | **PROBED** 36 + **VERIFIED-BY-DOC** |
| **ireland** | Tailte Éireann Prime2 | licensed (UNVERIFIED); `data.gov.ie` search surfaces **no national footprint set** | — | — | — | — | — | **NONE** *(open)* | **PROBED** 37 |
| **portugal** | DGT — **no national footprint layer** (the master doc says so explicitly: *"No national FOOTPRINT layer (use Overture/OSM)"*) | — | — | — | — | — | — | **NONE** | **VERIFIED-BY-DOC** |
| **croatia** | DGU (`uredjenazemlja.hr` serves **parcels**) | UNVERIFIED for buildings | 🟡 licence text YELLOW even for parcels | — | — | — | — | **UNVERIFIED** | **VERIFIED-BY-CODE** (parcels only) |
| **greece** | Κτηματολόγιο (serves **parcels**) | UNVERIFIED for buildings | — | — | — | — | — | **UNVERIFIED** | **VERIFIED-BY-CODE** (parcels only) |
| **hungary** | Lechner / földhivatal | UNVERIFIED | — | — | — | — | — | **UNVERIFIED** | — |
| **romania** | ANCPI | UNVERIFIED | — | — | — | — | — | **UNVERIFIED** | — |
| **slovakia** | ÚGKK (`kataster.skgeodesy.sk` serves **parcels**; WAF 403s any `where=`) | UNVERIFIED for buildings | — | — | — | — | — | **UNVERIFIED** | **VERIFIED-BY-CODE** (parcels only) |
| **bulgaria** | АГКК (`inspire.cadastre.bg` serves **parcels**) | UNVERIFIED for buildings | — | — | — | — | — | **UNVERIFIED** | **VERIFIED-BY-CODE** (parcels only) |
| **lithuania** | RC / NŽT | UNVERIFIED | — | — | — | — | — | **UNVERIFIED** | — |
| **latvia** | VZD (`geolatvija.lv` serves **parcels**) | UNVERIFIED for buildings | — | — | — | — | — | **UNVERIFIED** | **VERIFIED-BY-CODE** (parcels only) |

> ⚠ **Nine EU rows are UNVERIFIED, and that is the honest answer, not a gap in effort.** The lane
> was scoped to six probes; it ran 38. Each UNVERIFIED row above names the *publisher* we would
> probe, which is the actionable half — and none of them names a URL nobody checked.

### 3.2 — United States (6 bake rows)

| Bake region(s) | Register / publisher | Access | Licence | Coverage | Vertical attr. | Gain (prior) | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|
| **newyork** | NYC DoITT / OTI **Building Footprints** (Open Data) | keyless (Socrata / ArcGIS) | public domain / open | city | roof + ground elevation → real height; already the `us_open` height source | **LOW** — NYC OSM buildings were **imported from this very dataset** | **OSM-STAYS** *(same lineage)* | **VERIFIED-BY-CODE** (`us_open_heights`) |
| **sanfrancisco** | SF **Building Footprints** (DataSF) | keyless | open | city | height; already `us_open` | **LOW** — same import lineage | **OSM-STAYS** | **VERIFIED-BY-CODE** |
| **boston** | City of Boston / MassGIS footprints | keyless | open | city | height; already `us_open` | **LOW** | **OSM-STAYS** | **VERIFIED-BY-CODE** |
| **chicago** | Cook County / City of Chicago `syp8-uezg` | keyless | open | city | ⚠ **`stories` only, no height** — and the bake row deliberately declares **no** `heightJoin` on that evidence | **LOW** | **OSM-STAYS** | **VERIFIED-BY-CODE** (bake.mjs comment) |
| **austin**, **houston** | city open-data portals; TX has no state footprint register | UNVERIFIED | — | city | — | LOW | **OSM-STAYS** | **VERIFIED-BY-CODE** (no `heightJoin` declared) |
| *(all US)* | **Overture Maps Buildings** (Microsoft/Esri/OSM union) | keyless Parquet | ODbL-family / CDLA-Permissive | **national** | height (3DEP-derived, completeness varies) | **MED nationally, LOW in our 6 metros** | **OSM-STAYS** in the 6 metros; Overture is the answer if US coverage ever goes national | **VERIFIED-BY-DOC** |

> ⭐ **The US "official register" is a category error.** There is no federal building register. What
> exists is (a) per-city open footprints — from which OSM's buildings in those very cities were
> imported — and (b) Overture, a *derived* union. In the six metros PRYZM bakes, an adapter buys
> almost nothing; the real US gap is *outside* them, and Overture answers that.

### 3.3 — Australia (8 bake rows) + New Zealand

| Bake region(s) | Register / publisher | Access | Licence | Coverage | Vertical attr. | Gain (prior) | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|
| **victoria** | **Vicmap `building_polygon`** (DEECA, `opendata.maps.vic.gov.au`) | **keyless** WFS 2.0 | CC BY 4.0 (Vicmap) | **statewide** | **none** — full 14-field schema probed, zero vertical | **MED** — statewide vs Melbourne-LGA-only heights; regional VIC OSM is thin | **ADOPT** *(footprints only; heights stay `au_open`, Melbourne LGA)* | **PROBED** 8–9 |
| **newsouthwales** | — | **48 services enumerated, none is buildings**; the 113 "building" hub hits are POI points, planning height limits and templates | — | — | — | — | **NONE** | **PROBED** 5–7 |
| **act** | ACT `ACTGOV_BUILDING_FOOTPRINTS/FeatureServer/0` | keyless | open | ACT only | **no height field** | LOW (64,674 features, small territory) | **ADOPT (low priority)** | **VERIFIED-BY-CODE** (`elvis_au`) |
| **queensland**, **westernaustralia**, **southaustralia**, **tasmania**, **northernterritory** | no open state footprint register located | — | — | — | — | — | **NONE** | **VERIFIED-BY-CODE** (`elvis_au` AU sweep) |
| *(all AU)* | **Geoscape Buildings** (national footprints **+ heights + roof**) | ⛔ **commercial sales agreement**; site 403s a probe. AURIN offers it under an **academic** gate | proprietary | national | height + roof form | — | **KEY-GATED (PAID)** — do not pursue for V1 | **VERIFIED-BY-CODE** |
| **newzealand** ⚠ `pending:true` | **LINZ NZ Building Outlines** — 3,236,141 polygons | **KEY-GATED**, free self-service LDS account; **metadata API is keyless** | **CC BY 4.0** | **national** | **none** (14 fields, all listed in §2 probe 4) | **HIGH** — national, authoritative, and the region has **never been baked** | **ADOPT** ⭐ *(needs one free key)* | **PROBED** 1–4 |

### 3.4 — Gulf (4 bake rows, all already `buildingsSource:'overture'`)

| Bake region(s) | Register | Access | Verdict | Evidence |
|---|---|---|---|---|
| **riyadh**, **jeddah** | Balady / GEOSA — the ArcGIS root answers a foreign IP now, but **every DATA folder returns `{"error":{"code":499,"message":"Token Required"}}`** | credential-class (Balady SSO / Nafath), not IP-class | **KEY-GATED (unobtainable today)** → Overture stays | **VERIFIED-BY-CODE** (`PARCEL-SELECT-COVERAGE.md` §correction) |
| **dubai** | Dubai Municipality / DM GeoHub — no open footprint download located | — | **NONE** → Overture stays | **VERIFIED-BY-DOC** |
| **abudhabi** | AD SDI — publishes an **nDSM** (already the wired `ad_ndsm` height join) but no open footprint set | — | **NONE** *(footprints)* → Overture stays | **VERIFIED-BY-CODE** (`adsdi_ndsm_ae`) |
| **qatar** *(not a bake region; parcels wired)* | GIS Qatar serves **plots**, not buildings | — | out of scope | **VERIFIED-BY-CODE** |

---

## 4 — Per-verdict adapter list

### 4.1 — First, the architectural fork nobody has decided yet

An adapter can do **two very different things**, and the choice changes the licence story, the tile
size and the id space. **This is a founder/architecture decision, not an implementation detail.**

| Mode | What it does | Pros | Cons |
|---|---|---|---|
| **AUGMENT** | keep every OSM footprint; **add** register footprints that OSM lacks (no OSM building within *d* of the register centroid) | strictly additive; never regresses a well-mapped city; can ship per-region behind a flag | two geometry lineages in one layer ⇒ **ODbL + CC-BY mixing**, and a dedup threshold that will be wrong somewhere |
| **REPLACE** | drop OSM buildings for the region; use the register's geometry alone | one lineage, one licence, clean attribution, ids join to the height source natively | a register with a coverage hole renders a **hole**, where OSM had a building. Needs the §6 fill measurement *first* |

**Recommendation:** REPLACE for **ES / FR / NZ / PL** (national, authoritative, legally maintained);
AUGMENT is the wrong default there because the register *is* the record. Ship **behind the existing
per-region mechanism** (`buildingsSource`, which already has an `overture` precedent) so a bad
region is one field away from reverting.

### 4.2 — ADOPT → build an adapter

| # | Region(s) | Adapter | Shape | Notes |
|---|---|---|---|---|
| A1 | `spain` | `footprints/esCatastro.mjs` | **bulk ATOM crawl**: national feed → 56 province feeds → ~8,100 municipal zips → parse `buildingpart.gml` | ⚠ read floors from **BuildingPart**, never Building. ⚠ resolve the licence first. Keep `heightJoin:'mds'` for measured metres |
| A2 | `france`, `paris`, `lyon` | `footprints/frBdTopo.mjs` | **keyless WFS**, GeoJSON out, tile the national bbox | ⚠ **CRS84 axis order** — assert non-zero on a control cell. Brings `hauteur` + `nombre_d_etages` + provenance ⇒ **retires the `mnh_fr` raster join** |
| A3 | `newzealand` | `footprints/nzLinz.mjs` | **keyed** LDS WFS or bulk export | needs `LINZ_API_KEY` (free, self-service) as a **repository** secret. Region is `pending:true` — adopt *before* its first bake, not after |
| A4 | `poland` | `footprints/plBdot10k.mjs` | **WFS-as-index** → 380 powiat GML zips → `OT_BUBD_A` | fully keyless. Also delivers the storey count PL has never had |
| A5 | `netherlands` | `footprints/nlBag.mjs` | **keyless WFS** `bag:pand` | CC0. Turns the 3D BAG join from spatial into **id-level** |
| A6 | `estonia` | extend `heights/eeHeights.mjs` | the fetcher already runs — **stop discarding the geometry** | cheapest adapter in the set. Mind the **5,000-object cap** (it applies to hit counts too) |
| A7 | `czechia` | `footprints/czRuian.mjs` | **keyless WFS** for geometry + **VFR bulk** for floors | the WFS height slot is NIL — never read it |
| A8 | `victoria` | `footprints/auVicmap.mjs` | **keyless WFS** `building_polygon` | statewide footprints; heights stay Melbourne-LGA |
| A9 | `slovenia` | `footprints/siGurs.mjs` | keyless WFS `STAVBE_OBRIS` | **probe the geometry fill first** — `heightSources.mjs` records *"GEOM present 1 of 2 sampled"* |
| A10 | `belgium` | 3 connectors (VLG / BRU / WAL) | keyless in all three | three adapters for one bake row — defer |
| A11 | `act` | ArcGIS FeatureServer | keyless | 64,674 features, tiny territory |

### 4.3 — KEY-GATED → acquire the credential first

| Jurisdiction | Credential | Gate class | Who acts |
|---|---|---|---|
| 🇳🇿 **New Zealand** | `LINZ_API_KEY` | **free self-service** — LDS account, no approval | founder: 10 minutes. **Highest value/effort ratio in this file** |
| 🇩🇰 **Denmark** | `DATAFORDELER_API_KEY` (held as a Fly secret) | add as a **repository** secret | repo admin — already owed by `GEO-DATA-SOURCING-MASTER.md` §2 row 3 |
| 🇫🇮 **Finland** | `MML_API_KEY` | free self-service | ⚠ **and** the current footprint service identifier must be re-discovered (§5 correction 1) |
| 🇸🇪 **Sweden** | `LANTMATERIET_CLIENT_ID/SECRET` | **organisation onboarding** | founder — long lead time |
| 🇳🇴 **Norway** | Norge digitalt **agreement party** status | membership | ⛔ do not pursue — N50 is open but useless here; OSM stays |
| 🇦🇺 **Geoscape** | commercial sales agreement | **PAID** | ⛔ not for V1 |
| 🇸🇦 **Saudi** | Balady SSO / Nafath | credential-class, effectively unobtainable | ⛔ Overture stays |

### 4.4 — OSM-STAYS → do nothing, and say why

`germany` · `koln` · `switzerland` · `austria` · `greatbritain` · `italy` · all six **US** rows.

The reason differs and matters:
- **DE / CH / GB** — OSM building coverage is already near-complete; the open official product is
  either per-Land (DE), unverified (CH) or **cartographically generalised** (GB OpenMap Local).
- **US metros** — OSM's buildings **were imported from the very city datasets** an adapter would
  fetch. Building it would re-fetch our own data through a longer pipe.
- **IT / AT** — no unified national footprint service located; regional patchwork.

### 4.5 — NONE

`ireland` (no open national set) · `portugal` (explicitly no national footprint layer) ·
`newsouthwales` · `queensland` · `westernaustralia` · `southaustralia` · `tasmania` ·
`northernterritory` · `dubai` · `abudhabi` · (`riyadh`/`jeddah` = KEY-GATED-unobtainable).

### 4.6 — UNVERIFIED — name the publisher, do not guess the URL

`luxembourg` · `croatia` · `greece` · `hungary` · `romania` · `slovakia` · `bulgaria` ·
`lithuania` · `latvia` · `austria` (buildings arm) · `switzerland` (footprint arm) · `italy`.

---

## 5 — Corrections this survey makes to existing docs

**Correction 1 — 🇫🇮 Finland's footprints are NOT keyless (`GEO-DATA-SOURCING-MASTER.md` §1 + §2 row 2).**
The master table asserts the national building footprints come from
`inspire-wfs.maanmittauslaitos.fi/inspire-wfs/bu_mtk_polygon` as *"ANONYMOUS/keyless … VERIFIED live
2026-07-25"*, and §2 row 2 repeats *"national building footprints via INSPIRE WFS are ANONYMOUS (no
key at all)"*. **Measured 2026-09-05: HTTP 404 — `No service with identifier 'bu_mtk_polygon/wfs'
available.`** The host is alive and is telling us it does not have that identifier; the OGC-API door
is 401; a bare service listing resets the connection. The claim is now **stale-optimistic**, which
is the dangerous direction. Filed as a delimited section in the master (§`FOOTPRINT-REGISTERS`).

**Correction 2 — 🇩🇰 Denmark has a SECOND wall, and it is not the key.**
`heightSources.mjs` `geodanmark` records `wfs.datafordeler.dk → 401 without a key`. The
`services.datafordeler.dk` host returns **HTTP 503 · `This service has been deliberately (and
temporarily) taken out of service.`** A deliberate withdrawal is not an auth failure. **Which host
is current is open** — do not report "DK just needs the repo secret" until probe 10 is re-run
against the host the key actually targets.

**Correction 3 — 🇳🇴 Norway's FKB restriction now has its exact wording.**
`GEO-DATA-SOURCING-MASTER.md` §3 says *"do NOT license FKB"* without saying why. The reason,
verbatim from Geonorge: `AccessConstraints "Norge digitalt begrenset"` ·
`UseLimitations "Nedlasting av data begrenset til Norge digitalt avtaleparter."` ·
INSPIRE Art. 13(1)(d). It is a **membership** gate, not a purchasable licence — which also means
*no amount of budget unblocks it*, a materially different fact.

**Correction 4 — the ES floor count is on the PART, not the Building.**
`heightSources.mjs` `catastro` already says `heightField: 'BuildingPart numberOfFloorsAboveGround'`
— correct. This survey adds the measurement that makes it a **tripwire**: the same element name
exists on `Building` and is **`nilReason="other:unpopulated"` there**, 704 times out of 704. An
adapter that reads the Building level gets zeros and no error.

---

## 6 — The owed measurement (the one that turns §7's priors into findings)

Every "post-2015 gain" cell in §3 is a **prior**. The measurement that replaces it is small and
identical in every region:

> **§FOOTPRINT-FILL-PROBE.** For N control cells per region (dense-urban, suburban-2015+,
> rural — never city-hall only, per the `PARCEL-SELECT-COVERAGE.md` lesson that civic squares lie):
> 1. count register footprints in the cell;
> 2. count baked OSM footprints in the same cell from `buildings.pmtiles`;
> 3. count register footprints with **no** OSM building whose centroid falls inside them → the
>    **gain**;
> 4. count OSM buildings with no register match → the **register's own hole**;
> 5. where the register carries a construction date (ES `dateOfConstruction`, FR `date_creation`,
>    NL `bouwjaar`, CZ `dateOfConstruction`), split (3) by **≥ 2015 vs < 2015**.

Report all five numbers. ⛔ **(3) alone is the number that flatters an adapter; (4) is the number
that decides REPLACE vs AUGMENT.** Reporting (3) without (4) is how a REPLACE ships a hole.

⚠ The suburban cell is the one that matters. The failure this whole survey is chasing is a
**post-2015 estate that OSM has never been walked through** — a dense-urban control will show a
gain near zero everywhere and prove nothing.

---

## 6.5 — §CONCURRENT-LANES — rows 1 and 2 of the build order are ALREADY IN FLIGHT

⭐ **Discovered on disk 2026-09-05, after this survey was written, and it corroborates it.** Two
sibling lanes were building the top two adapters **while this file was being drafted**, from a
completely different starting point — the founder's own house:

| Lane | Row | On disk |
|---|---|---|
| **ES-CATASTRO-FOOTPRINTS** (L-12939) | build-order **#2** | `tools/context-bake/footprints/esCatastro.mjs` · `officialFootprints.mjs` · `footprintMerge.mjs` · `__tests__/esCatastro.spec.ts` + GML fixtures |
| **FR-BDTOPO-FOOTPRINTS** (L-12940) | build-order **#1** | `tools/context-bake/footprints/frBdtopo.mjs` · `__tests__/frBdtopo.spec.ts` + a WFS page fixture |
| *(client side)* | — | `apps/editor/src/ui/geospatial/officialFootprint.ts` |

**Their triggering defect is sharper than this survey's framing and should be quoted instead of
it:** *CL Isla Lanzarote 4, Arroyo del Moro, Córdoba — refcat `1950501UG4915S`, "Residencial ·
320 m² · 2020" on the Sede Electrónica — is **ABSENT** from PRYZM's 2D map and 3D context.* Not
mis-sized. Absent, because every `buildings` tile PRYZM ships is OSM and OSM has not mapped that
2020 estate. That is the post-2015 gap this file's §6 measurement was designed to quantify, found
in the wild first.

**Three consequences for this document:**

1. **§8 Q4 (AUGMENT or REPLACE) is ANSWERED by their code, not by this file.**
   `footprintMerge.mjs` runs at the top of `pushBuildingsWithNationalHeights` and emits ONE merged
   `baseGeo` under an **official-wins merge** predicate — so the existing `heightJoin` chain stamps
   Catastro/BD TOPO geometry exactly as it stamped an OSM clip, unchanged. That is per-feature
   REPLACE inside an AUGMENT envelope, and it is a better answer than either of §4.1's two modes.
   **Read `officialFootprints.mjs`, not §4.1, before building adapters 3–12.**
2. **The §5 correction-4 tripwire is INDEPENDENTLY CONFIRMED at scale.** This survey measured
   `Building.numberOfFloorsAboveGround` nil in 704/704 features of a 338 KB Albacete municipality.
   `officialFootprints.mjs` records the same nil across **Córdoba's 184 MB** `building.gml`, and
   derives the Building floor count as `max` over its parts, labelled `floorsKind:'max-of-parts'`.
   Two lanes, two municipalities, two access paths, one finding — which is the standard
   [[probe-can-be-wrong-three-ways]] asks for.
3. **They found a defect this survey did not, and it invalidates a naive id join.** BuildingPart
   **local ids are not stable across access paths**: for refcat `1950501UG4915S` the ATOM ZIP and
   the WFS `GetBuildingPartByParcel` stored query agree (4 parts: 26.7 m²/0 · 10.2 m²/2 ·
   44.8 m²/3 · 62.4 m²/2), but the WFS **bbox** form returns the same four geometries with parts 1
   and 2 **swapped** and the 26.7 m² part carrying floors **1** instead of **0** — same service,
   same day, same refcat. ⛔ **Never key a part on `_partN`, and never diff two access paths and
   call the difference a change.** Also: **`floors 0` is a real value** (an uncovered patio), not a
   missing one — it must be emitted and must not be extruded.

**So the orchestrator's next footprint work is rows 3 and 4 — 🇳🇿 NZ LINZ and 🇵🇱 BDOT10k — not
rows 1 and 2.** Everything below stands, with #1 and #2 re-read as *in progress*.

---

## 7 — Build order, ranked by (post-2015 gain × parcels served)

**Scoring — stated so it can be disagreed with.**
`P` = post-2015 gain prior (0–3, §3's column, **unmeasured** — §6 replaces it) ·
`R` = bake `ALL_REGIONS` rows the one adapter serves ·
`U` = does it *unblock* something already stuck ·
`C` = cost, low/med/high.
Rank = `P × R`, then `U`, then `1/C`. **`P` is a prior, so this is a proposal.**

| # | Adapter | Region(s) | P | R | Score | Unblocks | Cost | Why here |
|---|---|---|---|---|---|---|---|---|
| **1** | **🇫🇷 BD TOPO `batiment`** | `france` `paris` `lyon` | 3 | **3** | **9** | ⭐ retires the `mnh_fr` raster join that burned 4 h and died on `RangeError` (L-12937) | **LOW** — keyless WFS, GeoJSON out, no reprojection | Best evidence in the file: measured metres **and** floors **and** the acquisition method. One adapter fixes three regions and deletes a failing pipeline |
| **2** | **🇪🇸 Catastro BuildingPart** | `spain` | 3 | 1 | **3** | the founder's literal ask ("footprints by floor"); ES is PRYZM's deepest jurisdiction (BCN/MAD/CDB/VAL zoning wired) | **MED** — bulk ATOM crawl, ~8,100 zips | 100 % floor fill measured. 🟡 **licence must be read first** — that is the gate, not the code |
| **3** | **🇳🇿 LINZ Building Outlines** | `newzealand` | 3 | 1 | **3** | ⭐ the region is `pending:true` — **never baked**. Adopt *before* the first bake, not after | **LOW** — one dataset, one key | 3.24 M national polygons, CC BY 4.0. Needs one free self-service key. Highest value-per-hour in the file **once the key exists** |
| **4** | **🇵🇱 BDOT10k** | `poland` | 3 | 1 | **3** | PL is baked mass-only with **no** height join at all | **MED** — 380 zips, GML parse | Fully keyless, `AccessConstraints NONE`, and it brings PL its first storey attribute |
| **5** | **🇦🇺 Vicmap `building_polygon`** | `victoria` | 2 | 1 | **2** | statewide coverage where heights are Melbourne-LGA-only | **LOW** — keyless WFS | Regional Victoria is where OSM is thin; the register is not |
| **6** | **🇨🇿 ČÚZK BU + VFR** | `czechia` | 2 | 1 | **2** | — | **MED** — two channels (WFS geometry + VFR floors) | Keyless, `Fees none`. Floors need the bulk parse `heightSources.mjs` already flags as owed |
| **7** | **🇪🇪 ETAK geometry** | `estonia` | 2 | 1 | **2** | — | **VERY LOW** — the fetcher already runs | Cheapest adapter here: stop discarding geometry we already download. Good **first** one to build, to prove the AUGMENT/REPLACE mechanism |
| **8** | **🇳🇱 BAG `pand`** | `netherlands` | 2 | 1 | **2** | id-level 3D BAG join instead of spatial | **LOW** — keyless CC0 WFS | Attribute-quality win more than a coverage win |
| **9** | **🇸🇮 GURS `STAVBE_OBRIS`** | `slovenia` | 2 | 1 | **2** | — | MED | ⚠ **fill probe first** — geometry present in only 1 of 2 sampled |
| **10** | **🇩🇰 GeoDanmark** | `denmark` | 2 | 1 | **2** | — | **BLOCKED** on §5 correction 2 | Resolve *which host is current* before spending the repo-secret action |
| **11** | **🇧🇪 GRB / UrbIS / SPW** | `belgium` | 2 | 1 | 2 | — | **HIGH** — three regional connectors | Defer: three adapters, one bake row |
| **12** | **🇦🇺 ACT footprints** | `act` | 1 | 1 | 1 | — | LOW | 64,674 features, one small territory |

**Below the line — do not build:** `germany` `koln` `switzerland` `austria` `greatbritain` `italy`
and all six **US** rows (§4.4), every remaining AU state, both Gulf pairs, `ireland`, `portugal`.

### The four that matter, stated plainly

> **FR → ES → NZ → PL.** France first because it is the cheapest and it *deletes* a broken pipeline.
> Spain second because it is the founder's literal ask and the deepest jurisdiction — gated on
> reading a licence, not on writing code. New Zealand third because one free key turns a
> never-baked region into 3.24 M authoritative outlines. Poland fourth because it is keyless,
> national, and the region currently has nothing at all.

---

## 8 — Open questions, by name

| # | Question | Why it blocks |
|---|---|---|
| **Q1** | **Which Datafordeler host is current for GeoDanmark?** `services.` = 503 deliberate; `wfs.` = 401 (repo record); `api.dataforsyningen.dk/geodanmark_ows` = 404 | DK adoption *and* the owed repo-secret action both point at a host we have not confirmed |
| **Q2** | **What licence actually governs Catastro INSPIRE BU?** The feed's `<rights>` says *"all rights reserved"* verbatim | Blocks #2 in the build order. Engineering is ready; the licence is not read |
| **Q3** | **What is Finland's current INSPIRE Buildings service identifier?** The documented one 404s and the host refuses a listing | FI stays KEY-GATED-and-unlocatable until answered |
| **Q4** | **AUGMENT or REPLACE?** (§4.1) | Changes licence mixing, tile size, id space and revert story for every adapter |
| **Q5** | **What is Luxembourg's INSPIRE Buildings endpoint?** The analogy-guessed URL 404'd | LU is UNVERIFIED, not NONE |
| **Q6** | **Do ES-PV / ES-NA (foral cadastres) publish the same INSPIRE BU?** Not probed | A national ES adapter may have two regional holes |

---

*Created 2026-09-05 by lane FOOTPRINT-REGISTER-SURVEY (ISSUE-LOG L-12941). Maintainer: UNASSIGNED.*
*Sourcing authority for terrain + height remains `GEO-DATA-SOURCING-MASTER.md`; parcel selection
remains `PARCEL-SELECT-COVERAGE.md`. This file is the FOOTPRINT axis and defers to both on theirs.*
*Amend in place — do not fork a `*-AUDIT.md` derivative (C31 / C00 §"How to amend").*
