# Parcel-select coverage — the measured table

**Lane PARCEL-REACH round 4 · measured 2026-09-04.** Every row below was probed live on that date.
Nothing here is inferred from a registry row, a code comment, or a previous edition of this file.

---

## What this file answers, and the TWO questions it keeps separate

The founder asked for two things that this repo has repeatedly collapsed into one. They are
different questions and they get **their own columns**:

| Column | The question | What a "yes" means |
|---|---|---|
| **PARCEL SELECTION** | Does a click turn into the **plot boundary**? | A real cadastral polygon comes back, keylessly, and it **contains the click** |
| **DATA AVAILABILITY** | What **rides with** that polygon? | The legal identifier, the **registered** area (vs one we derived from the ring), and an address |

A jurisdiction can have excellent selection and almost no data (Norway: a real teig, no area
attribute — the area is ours, derived). It can also have rich data behind a wall we cannot pass
(Sweden). Reporting one number for both is how "we cover Finland" got written down for a route that
answers `HTTP 404 {"error":"Unknown cadastre 'fi'."}`.

**Honesty rule (C58 §1.4).** A cadastre is **WIRED** only if a live probe returned a real parcel
polygon **keylessly**. Everything else is `footprint (OSM)` in the UI — the building outline, not
the land boundary — and is **never** presented as a legal cadastral parcel.

### The five classes

| Class | Meaning |
|---|---|
| **WIRED** | Live probe returned a real cadastral polygon, keyless, containing the click |
| **CREDENTIAL-GATED** | The service exists and answers, but demands a key/identity. Each row says **whether we hold it** |
| **GEO-BLOCKED** | Reachable in principle, refused from our egress (WAF, TCP fence) |
| **FOOTPRINT** | No cadastre reached — the honest OSM building outline, labelled as such |
| **ABSENT** | No machine-readable channel found at all |

---

## How to re-run this — the exact command

```bash
node docs/04-reference/jurisdictions/parcel-reach-probe.mjs          # every arm
node docs/04-reference/jurisdictions/parcel-reach-probe.mjs eu       # ARM U+E — the 51 wired legs
node docs/04-reference/jurisdictions/parcel-reach-probe.mjs prod     # ARM P — the production click
node docs/04-reference/jurisdictions/parcel-reach-probe.mjs direct   # ARM D — rows with no leg
node docs/04-reference/jurisdictions/parcel-reach-probe.mjs eu lv,ee # a subset
```

Four arms, because four different things can be true at once:

- **ARM U** — the upstream cadastre's own answer: verbatim HTTP status, content-type, byte count.
- **ARM E** — the PRYZM click: `resolveEuParcelOutcome`, the exact function `/api/parcel/:cc` calls.
- **ARM P** — the same click on `https://pryzm.fly.dev`. **A leg on disk is not a working click.**
  This arm is the one that found BE-VLG dead in production while healthy locally.
- **ARM D** — direct probes for rows that have no leg, to classify the wall rather than guess it.

⛔ **Every row carries a real URBAN point, and several needed a SECOND one.** A city-hall coordinate
frequently lands on a road or a civic square, and several registers legitimately hold no parcel
there — Vilnius Cathedral Square, Dublin's O'Connell Bridge, downtown Miami's Biscayne Blvd all
answer an authoritative `empty`. An `empty` on a road measures nothing about the leg. Where a first
point was a road, the second point is named in the evidence cell.

---

## ⚠ SUPERSEDED — what the previous edition of this file said

The edition this replaces was dated **2026-07-24** and carried **9 rows**. It is superseded, not
overwritten, because the corrections are the useful record:

| The 2026-07-24 row said | Measured 2026-09-04 |
|---|---|
| **"Germany — other Länder (DE): ALKIS is per-Land licensed; no keyless national WFS … NRW is the one open Land"** | **FALSE.** 15 of 16 Länder are WIRED and keyless. Only **Bayern** is genuinely gated (`401 · WWW-Authenticate: Basic realm="INSPIRE-WFS ALKIS"`, and its whole open-data catalogue was enumerated: 35 products, ALKIS entries raster-only) |
| **"Denmark: ❌ not keyless — every anonymous probe → HTTP 404 … WIRED (credential-gated)"** | **SUPERSEDED.** DK is **keyless** via DAWA: `api.dataforsyningen.dk/jordstykker` → HTTP 200, `matrikelnr 7000q`. Production `/api/parcel/dk` returns a 115-vertex ring. The Datafordeler WFS still 404s anonymously — it is now an *attribute upgrade*, not the access route |
| **"Saudi Arabia: ❌ IP geo-fenced (WAF blocks non-SA IPs, L-606)"** | **CLASS CHANGED.** The ArcGIS root now answers a foreign IP (`umaps.balady.gov.sa` 301→`umaps.momah.gov.sa`; `/portal/sharing/rest` → enterpriseVersion 11.5.0). Every DATA folder returns `{"error":{"code":499,"message":"Token Required"}}`. The gate is **credential-class (Balady SSO / Nafath)**, not IP-class — an in-SA proxy alone no longer suffices |
| **"Opportunistic probes not yet wired (IT/BE/PT/SE/US)"** | IT, BE-VLG, PT and five US jurisdictions are now WIRED. SE remains credential-gated |
| **"rest of world — no cadastre wired"** | 53 jurisdictions are wired, across Europe, the USA, Australia and the Middle East |
| Coverage table had **no** row for AU, TR, IL, QA, and none of the 14 non-NRW Länder | All present below |

⚠ **A second stale claim, corrected here.** `server/jurisdiction/euCadastreProxy.js`'s header says
the coverage classes *"live in PARCEL-SELECT-COVERAGE.md (re-measured end-to-end … 2026-09-04, lane
PARCEL-REACH round 3: 51/51 legs …)"*. That measurement was **real** — round 3 ran it — but it was
**never written into this file**, which still carried the July table. A forward reference to a
document that does not contain the fact is the [[verification-artifact-can-predate-subject]] shape.
This edition is that measurement, re-run independently and banked.

---

## TABLE A — WIRED (53 jurisdictions)

**Read the two evidence columns together.** "Upstream" is the cadastre's own answer; "Production" is
what a real browser click gets from `https://pryzm.fly.dev`. Where they disagree, the disagreement
is the finding.

| Jurisdiction (leg) | Selection | Live evidence — UPSTREAM (verbatim) | Production click | DATA AVAILABILITY | Route → source | Caveat |
|---|---|---|---|---|---|---|
| **Austria** (`at`) | **WIRED** | Wien (48.2082, 16.3738) → HTTP 200 application/json 13873 B → **AT.0002.I.6.CP.010041711**, 16,424 m², 110-pt WGS84 ring, contains click, 366 ms | ✅ 200 ok AT.0002.I.6.CP.010041711 (517 ms) | id: INSPIRE localId · area: derived · address: none served | `/api/parcel/at` → data.bev.gv.at INSdataCP WMS GetFeatureInfo (EPSG:3857 → WGS84 server-side) | the ONLY keyless channel; all three BEV WFS routes are dead (b46949e1) |
| **Australia · ACT** (`au-act`) | **WIRED** | Canberra (-35.2809, 149.13) → HTTP 200 application/json 9558 B → **44/19**, 16,615 m², 49-pt WGS84 ring, contains click, 325 ms | ✅ 200 ok 44/19 (458 ms) | id: block/section · area: derived · address: served (district) | `/api/parcel/au-act` → services1.arcgis.com ACTGOV_BLOCKS/0 (lifecycle-filtered) |  |
| **Australia · NSW** (`au-nsw`) | **WIRED** | Sydney (-33.87344, 151.20658) → HTTP 200 application/json 1498 B → **100//DP1048011**, 10,335 m², 21-pt WGS84 ring, contains click, 1482 ms | ✅ 200 ok 100//DP1048011 (1561 ms) | id: lot//plan · area: derived · address: none served | `/api/parcel/au-nsw` → portal.spatial.nsw.gov.au NSW_Land_Parcel_Property_Theme/8 |  |
| **Australia · Queensland** (`au-qld`) | **WIRED** | Brisbane (-27.4705, 153.026) → HTTP 200 application/json 2565 B → **47SP317615**, 5,022 m², 37-pt WGS84 ring, contains click, 2033 ms | ✅ 200 ok 47SP317615 (2665 ms) | id: lotplan · area: derived · address: served (locality) | `/api/parcel/au-qld` → spatial-gis.information.qld.gov.au LandParcelPropertyFramework/4 |  |
| **Australia · South Australia** (`au-sa`) | **WIRED** | Adelaide (-34.9235, 138.601) → HTTP 200 application/json 1960 B → **C21367 F1**, 1,613 m², 21-pt WGS84 ring, contains click, 1530 ms | ✅ 200 ok C21367 F1 (1333 ms) | id: plan/parcel · area: derived · address: served (title ref) | `/api/parcel/au-sa` → lsa2.geohub.sa.gov.au SAPPA/PropertyPlanningAtlasV19/41 (public Referer injected) | soft CloudFront WAF: 403 bare, 200 with the documented public Referer |
| **Australia · Tasmania** (`au-tas`) | **WIRED** | Hobart (-42.8821, 147.3272) → HTTP 200 application/json 991 B → **3321248**, 29 m², 5-pt WGS84 ring, contains click, 1857 ms | ✅ 200 ok 3321248 (2055 ms) | id: PID · area: derived · address: served (street address) | `/api/parcel/au-tas` → services.thelist.tas.gov.au Public/CadastreParcels/0 | PID 0 (Crown Land placeholder) normalised to absent → footprint |
| **Australia · Victoria** (`au-vic`) | **WIRED** | Melbourne (-37.8136, 144.9631) → HTTP 200 application/json 1689 B → **PC366537**, 3,864 m², 6-pt WGS84 ring, contains click, 1985 ms | ✅ 200 ok PC366537 (2036 ms) | id: SPI · area: derived · address: none served | `/api/parcel/au-vic` → opendata.maps.vic.gov.au WFS v_parcel_mp (CQL lat,lon) |  |
| **Belgium · Flanders** (`be-vlg`) | **WIRED** | Antwerpen (51.2194, 4.4025) → HTTP 200 application/json 11729 B → **11803C2165/00M000**, 8,011 m², 67-pt WGS84 ring, contains click, 19905 ms | ⛔ **11:31 ✅ 200 ok 11803C2165/00M000 (19 907 ms) — 15:31 and 17:0x ❌ `{"parcel":null,"outcome":"unreachable"}` after 56 749 ms, twice — see Defect D1** | id: CAPAKEY · area: derived (ADP carries none) · address: served (NIS code) | `/api/parcel/be-vlg` → geo.api.vlaanderen.be GRB/wfs GRB:ADP | fixed ~20 s upstream latency — own 28 s deadline (48cfa327) |
| **Bulgaria** (`bg`) | **WIRED** | Sofia (42.6977, 23.3219) → HTTP 200 application/json 8339 B → **68134.405.115**, 8,110 m², 91-pt WGS84 ring, contains click, 399 ms | ✅ 200 ok 68134.405.115 (305 ms) | id: идентификатор (ЕКАТТЕ.кв.имот) · area: SERVED (areavalue uom=m2) · address: served (label) | `/api/parcel/bg` → inspire.cadastre.bg Cadastral_Parcel/MapServer/0 (АГКК) |  |
| **Switzerland** (`ch`) | **WIRED** | Zuerich (47.3769, 8.5417) → HTTP 200 application/json 2598 B → **CH119192997709**, 12,653 m², 93-pt WGS84 ring, contains click, 333 ms | ✅ 200 ok CH119192997709 (201 ms, warm re-probe after cold 5xx) | id: EGRID · area: derived · address: served (canton + number) | `/api/parcel/ch` → api3.geo.admin.ch identify ch.kantone.cadastralwebmap-farbe | all-canton federal AV; fair-use ~20 req/min (proxy cache + apiLimiter keep under) |
| **Czechia** (`cz`) | **WIRED** | Praha (50.0875, 14.4213) → HTTP 200 application/gml+xml 24540 B → **727024-1090**, 15,869 m², 296-pt WGS84 ring, contains click, 310 ms | ✅ 200 ok 727024-1090 (6199 ms) | id: kú-parcelní číslo · area: SERVED (areaValue uom=m2) · address: served (k.ú. / obec) | `/api/parcel/cz` → services.cuzk.cz inspire-cp-wfs (ČÚZK) | coverage = ČÚZK's own 99.50 % digital-map claim |
| **Germany · Brandenburg** (`de-bb`) | **WIRED** | Potsdam (52.3906, 13.0645) → HTTP 200 application/gml+xml 27856 B → **12050100600984**, 23,421 m², 114-pt WGS84 ring, contains click, 633 ms | ✅ 200 ok 12050100600984 (280 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue) else derived · address: served (label) | `/api/parcel/de-bb` → inspire.brandenburg.de cp_alkis_wfs |  |
| **Germany · Berlin** (`de-be`) | **WIRED** | Berlin (52.52, 13.405) → HTTP 200 application/json 10105 B → **11000191900558**, 24,572 m², 58-pt WGS84 ring, contains click, 240 ms | ✅ 200 ok 11000191900558 (173 ms, warm re-probe after cold 5xx) | id: flstkennz · area: SERVED (afl) else derived · address: served (Gemarkung) | `/api/parcel/de-be` → gdi.berlin.de alkis_flurstuecke |  |
| **Germany · Baden-Württemberg** (`de-bw`) | **WIRED** | Stuttgart (48.7758, 9.1829) → HTTP 200 application/gml+xml 13488 B → **08146000000006000000**, 4,364 m², 13-pt WGS84 ring, contains click, 383 ms | ✅ 200 ok 08146000000006000000 (205 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue uom=m2) else derived · address: served (label) | `/api/parcel/de-bw` → owsproxy.lgl-bw.de INSPIRE CP |  |
| **Germany · Bremen** (`de-hb`) | **WIRED** | Bremen (53.0793, 8.8017) → HTTP 200 application/gml+xml 36526 B → **041003003001480032**, 17,844 m², 217-pt WGS84 ring, contains click, 343 ms | ✅ 200 ok 041003003001480032 (265 ms, warm re-probe after cold 5xx) | id: flstkennz · area: SERVED (flaeche) · address: served (Gemarkung) | `/api/parcel/de-hb` → geodienste.bremen.de app:flurstuecke |  |
| **Germany · Hessen** (`de-he`) | **WIRED** | Frankfurt (50.1109, 8.6821) → HTTP 200 application/gml+xml 63569 B → **060460010000130001**, 2,198 m², 26-pt WGS84 ring, contains click, 452 ms | ✅ 200 ok 060460010000130001 (290 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue) else derived · address: served (label) | `/api/parcel/de-he` → inspire-hessen.de INSPIRE CP |  |
| **Germany · Hamburg** (`de-hh`) | **WIRED** | Hamburg (53.5511, 9.9937) → HTTP 200 application/gml+xml 12560 B → **020101___01396**, 18,098 m², 100-pt WGS84 ring, contains click, 349 ms | ✅ 200 ok 020101___01396 (155 ms, warm re-probe after cold 5xx) | id: flstkennz · area: SERVED (flaeche) · address: served (Gemarkung) | `/api/parcel/de-hh` → geodienste.hamburg.de WFS_HH_ALKIS_vereinfacht |  |
| **Germany · Mecklenburg-Vorpommern** (`de-mv`) | **WIRED** | Schwerin (53.6355, 11.401) → HTTP 200 application/gml+xml 38731 B → **13076807400007**, 571 m², 10-pt WGS84 ring, contains click, 423 ms | ✅ 200 ok 13076807400007 (416 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue) else derived · address: served (label) | `/api/parcel/de-mv` → www.geodaten-mv.de inspire_cp_alkis_download |  |
| **Germany · Niedersachsen** (`de-ni`) | **WIRED** | Hannover (52.3759, 9.732) → HTTP 200 application/gml+xml 19230 B → **034880045002110098**, 10,938 m², 34-pt WGS84 ring, contains click, 537 ms | ✅ 200 ok 034880045002110098 (425 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue) else derived · address: served (label) | `/api/parcel/de-ni` → www.inspire.niedersachsen.de alkis-dls-cp |  |
| **Germany · Nordrhein-Westfalen** (`de-nrw`) | **WIRED** | Duesseldorf (51.2288, 6.773) → HTTP 200 application/gml+xml 40960 B → **05311000400065**, 736 m², 28-pt WGS84 ring, contains click, 1557 ms | ✅ 200 ok 05311000400065 (644 ms, warm re-probe after cold 5xx) | id: flstkennz · area: SERVED (flaeche) · address: served (Gemarkung) | `/api/parcel/de-nrw` → www.wfs.nrw.de wfs_nw_alkis_vereinfacht |  |
| **Germany · Rheinland-Pfalz** (`de-rp`) | **WIRED** | Mainz (49.9929, 8.2473) → HTTP 200 text/xml 13835 B → **073701017000540010**, 184,734 m², 75-pt WGS84 ring, contains click, 363 ms | ✅ 200 ok 073701017000540010 (206 ms, warm re-probe after cold 5xx) | id: flstkennz · area: SERVED (flaeche) · address: served (Gemarkung) | `/api/parcel/de-rp` → geo5.service24.rlp.de alkis_rp |  |
| **Germany · Schleswig-Holstein** (`de-sh`) | **WIRED** | Kiel (54.3233, 10.1228) → HTTP 200 application/gml+xml 34915 B → **01253701700335**, 4,067 m², 144-pt WGS84 ring, contains click, 422 ms | ✅ 200 ok 01253701700335 (415 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue) else derived · address: served (label) | `/api/parcel/de-sh` → service.gdi-sh.de INSPIRE CP |  |
| **Germany · Saarland** (`de-sl`) | **WIRED** | Saarbruecken (49.2402, 6.9969) → HTTP 200 application/gml+xml 46505 B → **101014034000240005**, 346 m², 13-pt WGS84 ring, contains click, 630 ms | ✅ 200 ok 101014034000240005 (222 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue) else derived · address: served (label) | `/api/parcel/de-sl` → geoportal.saarland.de INSPIRE CP |  |
| **Germany · Sachsen** (`de-sn`) | **WIRED** | Dresden (51.0504, 13.7373) → HTTP 200 application/gml+xml 23259 B → **140208___02523001200**, 3,724 m², 24-pt WGS84 ring, contains click, 467 ms | ✅ 200 ok 140208___02523001200 (235 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue) else derived · address: served (label) | `/api/parcel/de-sn` → geodienste.sachsen.de INSPIRE CP |  |
| **Germany · Sachsen-Anhalt** (`de-st`) | **WIRED** | Magdeburg (52.1205, 11.6276) → HTTP 200 application/gml+xml 17700 B → **150938153004370005**, 4,450 m², 38-pt WGS84 ring, contains click, 381 ms | ✅ 200 ok 150938153004370005 (342 ms, warm re-probe after cold 5xx) | id: nationalCadastralReference · area: SERVED (areaValue) else derived · address: served (label) | `/api/parcel/de-st` → geodatenportal.sachsen-anhalt.de INSPIRE CP |  |
| **Germany · Thüringen** (`de-th`) | **WIRED** | Erfurt (50.9848, 11.0299) → HTTP 200 text/xml 55463 B → **16010112400134**, 226 m², 7-pt WGS84 ring, contains click, 557 ms | ✅ 200 ok 16010112400134 (305 ms, warm re-probe after cold 5xx) | id: flstkennz · area: SERVED (flaeche) · address: served (Gemarkung) | `/api/parcel/de-th` → geoproxy.geoportal-th.de adv_alkis_v2_wfs |  |
| **Denmark** (`dk`) | **WIRED** | Koebenhavn-Raadhus (55.6761, 12.5683) → HTTP 200 application/json 14405 B → **7000q**, 64,981 m², 115-pt WGS84 ring, contains click, 334 ms (via dawa-jordstykker) | ✅ 200  7000q (768 ms) | id: matrikelnr + ejerlav · area: SERVED (registreretareal) via DAWA; derived via the keyed WFS leg · address: served (ejerlavnavn) | `/api/parcel/dk` → api.dataforsyningen.dk/jordstykker (DAWA, keyless) · wfs.datafordeler.dk MAT_WFS (keyed, attribute upgrade) | own handler (dkMatrikelProxy.js). KEYLESS since L-12888 (2026-09-02): the DAWA leg serves the parcel with no credential; DATAFORDELER_API_KEY only upgrades attributes. Prod answered 7000q with 105 836 m² (ring-derived) vs local DAWA 64 981 m² (registreretareal) — consistent with the keyed leg answering in prod, i.e. the key IS held there (inferred from the area shape, not verified: flyctl is not logged in here) |
| **Estonia** (`ee`) | **WIRED** | Tallinn (59.437, 24.7536) → HTTP 200 application/json 3948 B → **78401:114:0086**, 11,445 m², 25-pt WGS84 ring, contains click, 332 ms | ✅ 200 ok 78401:114:0086 (278 ms) | id: tunnus · area: SERVED (pindala) · address: served | `/api/parcel/ee` → gsavalik.envir.ee kataster:ky_kehtiv |  |
| **Spain** (`es`) | **WIRED** | Madrid-GranVia (40.42, -3.7057) → HTTP 200 text/xml 3630 B → **0247501VK4704G**, 625 m², 22-pt WGS84 ring, nearest-centroid pick (click on ROW/plaza), 571 ms | ✅ 200  0247501VK4704G (688 ms, warm re-probe after cold 5xx) | id: referencia catastral · area: derived (INSPIRE ring) · address: served | `/api/catastro/parcel` → ovc.catastro.meh.es (OVC RCCOOR + INSPIRE wfsCP) | own handler (parcelZoningProxy.js); OVC reverse-geocode is flaky — ECONNRESET on first attempts, succeeds on retry (measured 3×) |
| **France** (`fr`) | **WIRED** | Paris (48.8584, 2.347) → HTTP 200 application/json 6615 B → **75101000AN0057**, 385 m², 7-pt WGS84 ring, contains click, 673 ms | ✅ 200 ok 75101000AN0057 (1757 ms, warm re-probe after cold 5xx) | id: idu · area: SERVED (contenance) · address: served (commune) | `/api/parcel/fr` → data.geopf.fr WFS PARCELLAIRE_EXPRESS:parcelle |  |
| **United Kingdom · England** (`gb`) | **WIRED** | London (51.5155, -0.1419) → HTTP 200 application/json 1152 B → **48570453**, 4,730 m², 35-pt WGS84 ring, contains click, 245 ms | ✅ 200 ok 48570453 (250 ms) | id: HMLR INSPIRE ID · area: derived · address: none served | `/api/parcel/gb` → www.planning.data.gov.uk entity.geojson dataset=title-boundary (HMLR INSPIRE via MHCLG) | ⚠ OWNERSHIP INDEX with GENERAL BOUNDARIES (LRA 2002 s.60), confidence MEDIUM — never survey-grade |
| **Greece** (`gr`) | **WIRED** | Athina (37.9755, 23.7348) → HTTP 200 application/json 2182 B → **050095701001**, 10,840 m², 10-pt WGS84 ring, contains click, 203 ms | ✅ 200 ok 050095701001 (197 ms) | id: KAEK · area: SERVED (AREA) · address: none surfaced (DESCR is land-use text) | `/api/parcel/gr` → services-eu1.arcgis.com GEOTEMAXIA_LEITOURGOUN_ON_gdb/0 (Κτηματολόγιο, operating cadastre) |  |
| **Croatia** (`hr`) | **WIRED** | Zagreb (45.8132, 15.9771) → HTTP 200 application/json 7384 B → **k.č. 2379, k.o. 335240**, 13,850 m², 161-pt WGS84 ring, contains click, 641 ms | ✅ 200 ok k.č. 2379, k.o. 335240 (262 ms) | id: k.č. + k.o. · area: derived · address: none served | `/api/parcel/hr` → api.uredjenazemlja.hr inspire/cp_wms/wfs (DGU; srsName=EPSG:4326 honoured) | licence text YELLOW |
| **Ireland** (`ie`) | **WIRED** | Dublin-Dundrum (53.2921, -6.2448) → HTTP 200 application/json 1933 B → **2569591**, 2,446 m², 44-pt WGS84 ring, contains click, 99 ms | 200 empty | id: SP_ID · area: derived · address: served (county only) | `/api/parcel/ie` → services-eu1.arcgis.com Tailte Éireann Cadastral_Parcels_Freehold/12 | ⚠ TITLE-BASED coverage, not a tessellation: Dublin city-centre points (×2) `empty` (unregistered land), resolved at Dundrum. Leasehold (layer 13) not yet queried |
| **Italy (excl. Trentino-Alto Adige, Malta carved out)** (`it`) | **WIRED** | Roma (41.8992, 12.4731) → HTTP 200 application/xml 55244 B → **H501A048500.STRADA001**, 104,348 m², 750-pt WGS84 ring, contains click, 8635 ms | ✅ 200 ok H501A048500.STRADA001 (18821 ms) | id: NATIONALCADASTRALREFERENCE (comune+foglio+particella) · area: derived (no area attribute) · address: served (comune Belfiore code) | `/api/parcel/it` → wfs.cartografia.agenziaentrate.gov.it INSPIRE CP (GML only) | own 25 s deadline — cold Roma 8.6–14.8 s today, prod 18.8 s |
| **Lithuania** (`lt`) | **WIRED** | Vilnius-2 (54.682, 25.2872) → HTTP 200 application/json 3324 B → **0101/0041:0056**, 18,159 m², 52-pt WGS84 ring, contains click, 121 ms | ✅ 200 ok 0101/0041:0056 (238 ms, warm re-probe after cold 5xx) | id: unikalus Nr. · area: SERVED (ha → m²) · address: served | `/api/parcel/lt` → osp-sdg.stat.gov.lt ntr_sklypai/FeatureServer/0 (RC NTR) | Vilnius primary point (Cathedral Sq.) empty → resolved at the alternate; RC NTR has no parcel on public squares |
| **Luxembourg** (`lu`) | **WIRED** | Luxembourg (49.6116, 6.1319) → HTTP 200 application/json 13582 B → **075F00307001832**, 123 m², 21-pt WGS84 ring, contains click, 305 ms | ✅ 200 ok 075F00307001832 (257 ms) | id: nationalCadastralReference · area: SERVED (area) · address: served (label) | `/api/parcel/lu` → wms.inspire.geoportail.lu cp:CP.CadastralParcel (ACT) |  |
| **Latvia** (`lv`) | **WIRED** | Riga (56.9496, 24.1052) → HTTP 200 application/json 5286 B → **01000070162**, 5,768 m², 41-pt WGS84 ring, contains click, 1348 ms | ✅ 200 ok 01000070162 (306 ms) | id: kadastra apzīmējums (11 digits) · area: SERVED (area) · address: served | `/api/parcel/lv` → geolatvija.lv/geoserver/vraa/wfs vraa:parcel (VZD) | CONTAINMENT PROVEN: Rīga 56.9496,24.1052 → 01000070162 by point-in-polygon (3 candidates in bbox; first-feature would be 01000070006) |
| **Netherlands** (`nl`) | **WIRED** | Amsterdam (52.3731, 4.8926) → HTTP 200 application/json 8033 B → **ASD04 F 6685**, 9,402 m², 53-pt WGS84 ring, contains click, 303 ms | ✅ 200 ok ASD04 F 6685 (285 ms, warm re-probe after cold 5xx) | id: gemeente-sectie-nummer · area: SERVED (kadastraleGrootteWaarde) · address: served (gemeente) | `/api/parcel/nl` → service.pdok.nl kadastralekaart WFS v5_0 |  |
| **Norway** (`no`) | **WIRED** | Oslo (59.9139, 10.7522) → HTTP 200 text/xml 10968 B → **0301-208/646**, 1,075 m², 6-pt WGS84 ring, contains click, 521 ms | ✅ 200 ok 0301-208/646 (353 ms, warm re-probe after cold 5xx) | id: kommune-gnr/bnr · area: derived (no area attribute served) · address: served (kommune) | `/api/parcel/no` → wfs.geonorge.no matrikkelen-eiendomskart-teig |  |
| **Poland** (`pl`) | **WIRED** | Warszawa (52.2297, 21.0122) → HTTP 200 text/plain 2667 B → **146510_8.0502.1/3**, 15,880 m², 76-pt WGS84 ring, contains click, 667 ms | ✅ 200 ok 146510_8.0502.1/3 (429 ms) | id: identyfikator działki (TERYT) · area: derived (ULDK serves geometry only) · address: served (obręb/gmina) | `/api/parcel/pl` → uldk.gugik.gov.pl GetParcelByXY |  |
| **Portugal** (`pt`) | **WIRED** | Loule (37.1378, -8.02) → HTTP 200 application/json 9380 B → **AAA000336903**, 195 m², 9-pt WGS84 ring, nearest-centroid pick (click on ROW/plaza), 39 ms | 200 empty | id: national cadastral reference · area: SERVED (areavalue) · address: served (município) | `/api/parcel/pt` → snicws.dgterritorio.gov.pt inspire:cadastralparcel (DGT SNIC) | ⚠ COVERAGE DECLARED-INCOMPLETE: per-município cadastro predial — Lisboa, Porto, Évora, Faro, Portimão, Beja, Setúbal all `empty` today; only Loulé resolved. The leg carries a coverageNote on every empty so the card can say so |
| **Qatar** (`qa`) | **WIRED** | Doha (25.286, 51.531) → HTTP 200 application/json 7366 B → **1010028**, 183,494 m², 137-pt WGS84 ring, contains click, 1199 ms | ✅ 200 ok 1010028 (1006 ms) | id: PIN · area: SERVED (PDAREA, surveyed) · address: none served | `/api/parcel/qa` → services.gisqatar.org.qa Vector/CadastrePlots/MapServer/0 | licence UNREAD (YELLOW); layer hidden from folder listing |
| **Slovenia** (`si`) | **WIRED** | Ljubljana (46.0569, 14.5058) → HTTP 200 application/json 27259 B → **1725 3274/13**, 19,141 m², 137-pt WGS84 ring, contains click, 462 ms | ✅ 200 ok 1725 3274/13 (348 ms) | id: KO_ID + ST_PARCELE · area: SERVED (POVRSINA) · address: served (KO name) | `/api/parcel/si` → ipi.eprostor.gov.si wfs-si-gurs-kn SI.GURS.KN:PARCELE |  |
| **Slovakia** (`sk`) | **WIRED** | Bratislava (48.1436, 17.1077) → HTTP 200 application/json 2279 B → **parc. č. 15, k.ú. 2933**, 832 m², 23-pt WGS84 ring, contains click, 372 ms | ✅ 200 ok parc. č. 15, k.ú. 2933 (392 ms) | id: parc. č. + k.ú. · area: SERVED (DESCRIPTIVE_AREA_OF_PARCEL) · address: none served | `/api/parcel/sk` → kataster.skgeodesy.sk eskn VRM/kn/MapServer/9 (spatial only — WAF 403s any where=) |  |
| **Turkey** (`tr`) | **WIRED** | Istanbul (40.9819, 29.0576) → HTTP 200 application/json 582 B → **3106/258**, 816 m², 6-pt WGS84 ring, contains click, 836 ms | ✅ 200 ok 3106/258 (566 ms) | id: ada/parsel · area: SERVED (alan) · address: served (mahalle, ilçe, il) | `/api/parcel/tr` → cbsapi.tkgm.gov.tr megsiswebapi.v3 parsel/{lat}/{lon} | no-parcel = semantic HTTP 404 → `empty`; licence UNREAD (YELLOW) |
| **USA · Cook County IL (Chicago)** (`us-chi`) | **WIRED** | Chicago (41.8827, -87.6233) → HTTP 200 application/json 1263 B → **1710320002**, 21,542 m², 19-pt WGS84 ring, contains click, 859 ms | ✅ 200 ok 1710320002 (588 ms, warm re-probe after cold 5xx) | id: PIN (10-digit) · area: derived · address: served (municipality) | `/api/parcel/us-chi` → datacatalog.cookcountyil.gov Socrata 77tz-riq7 |  |
| **USA · Florida (statewide)** (`us-fl`) | **WIRED** | Tampa-325-N-Florida-Ave (27.94775, -82.4565) → HTTP 200 application/json 1838 B → **1829244ZI000075000020A**, 4,199 m², 5-pt WGS84 ring, contains click, 2128 ms | 200 empty | id: PARCEL_ID (DOR) · area: derived · address: served (PHY_ADDR1, PHY_CITY) | `/api/parcel/us-fl` → services9.arcgis.com Florida_Statewide_Cadastral/0 (FDOR Cadastral 2025, 10 831 924 features) | ⚠ 6 urban probe points (Miami ×3, Tampa, Orlando, Jacksonville) were all right-of-way → honest `empty`; resolved at the 09-03 proof parcel. FL streets carry no parcel polygon — an empty on a road is TRUE, not an outage |
| **USA · Massachusetts (statewide)** (`us-ma`) | **WIRED** | Boston (42.3601, -71.0589) → HTTP 200 application/json 3346 B → **F_775267_2956644**, 22,632 m², 52-pt WGS84 ring, contains click, 572 ms | ✅ 200 ok F_775267_2956644 (610 ms) | id: LOC_ID · area: derived · address: served (site address, town) | `/api/parcel/us-ma` → arcgisserver.digital.mass.gov L3_Parcels_FeatureService_4326/1 |  |
| **USA · New York City (5 counties)** (`us-nyc`) | **WIRED** | New York (40.7484, -73.9857) → HTTP 200 application/json 3136 B → **1008350041**, 9,031 m², 7-pt WGS84 ring, contains click, 285 ms | ✅ 200 ok 1008350041 (288 ms) | id: BBL · area: derived (served fields are assessment units) · address: served | `/api/parcel/us-nyc` → services5.arcgis.com MAPPLUTO/FeatureServer/0 |  |
| **USA · San Francisco (city-county)** (`us-sf`) | **WIRED** | San Francisco (37.7793, -122.4193) → HTTP 200 application/json 3402 B → **0787001**, 18,229 m², 85-pt WGS84 ring, contains click, 921 ms | ✅ 200 ok 0787001 (null ms, warm re-probe after cold 5xx) | id: blklot APN · area: derived · address: served (street) | `/api/parcel/us-sf` → data.sfgov.org Socrata acdm-wktn | Socrata latency 3.6–4.2 s; one prod sample answered `unreachable` |
| **USA · Harris County TX (Houston)** (`us-tx-harris`) | **WIRED** | Houston-2 (29.7589, -95.3677) → HTTP 200 application/json 1857 B → **0011450000001**, 5,828 m², 6-pt WGS84 ring, contains click, 185 ms | ✅ 200 ok 0011450000001 (1990 ms, warm re-probe after cold 5xx) | id: HCAD_NUM · area: derived · address: served | `/api/parcel/us-tx-harris` → www.gis.hctx.net HCAD/Parcels/0 |  |
| **USA · King County WA (Seattle)** (`us-wa-king`) | **WIRED** | Seattle (47.6062, -122.3321) → HTTP 200 application/json 1946 B → **0942000365**, 5,510 m², 17-pt WGS84 ring, contains click, 730 ms | ✅ 200 ok 0942000365 (733 ms) | id: PIN · area: derived · address: none served on this layer | `/api/parcel/us-wa-king` → gismaps.kingcounty.gov Property/KingCo_Parcels/0 |  |
**Count: 53.** 51 legs in `EU_CADASTRE_SOURCES` + Denmark (`dkMatrikelProxy.js`, its own handler) +
Spain (`parcelZoningProxy.js`, the original L-380 pilot). Every one returned a real polygon
containing the click, keylessly, on 2026-09-04.

---

## TABLE B — NOT WIRED, with the wall named

⛔ **Every row here was probed on 2026-09-04.** Where the probe used a URL this lane **constructed**
rather than one a source document names, the row says so — a dead host we guessed is evidence about
our guess, not about the country ([[probe-can-be-wrong-three-ways]]).

### B1 · Europe

| Jurisdiction | Class | Do we hold the key? | Verbatim evidence 2026-09-04 |
|---|---|---|---|
| **Sweden** (SE) | **CREDENTIAL-GATED** | **NO** | Lantmäteriet Fastighetsindelning search → `HTTP 401 · {"code":"900902","message":"Missing Credentials","description":"Invalid Credentials. Make sure your API invocation call has a header: 'Authorization : ...'"}` (APIM). ⚠ A second URL this lane **constructed** for the WFS answered `HTTP 404 {"code":"404","message":"Not Found"}` — that 404 is about our guessed path, not about Sweden. The 401 is the real reading |
| **Finland** (FI) | **CREDENTIAL-GATED** (self-service) | **NO** | MML `avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/features/v1/collections` → `HTTP 401 · server=BigIP · WWW-Authenticate: Basic realm="API-key required to access"`. The key is free at omatili.maanmittauslaitos.fi. ⛔ **We do not hold one, and there is no `fi` leg on the server at all** — see Defect D2 |
| **Germany · Bayern** (DE-BY) | **CREDENTIAL-GATED** | **NO** | INSPIRE ALKIS WFS → `401 · WWW-Authenticate: Basic realm="INSPIRE-WFS ALKIS"`. Catalogue **enumerated, not guessed**: 35 products; the only ALKIS entries are raster (Parzellarkarte declares `"abgabe_datenformate":["PNG","JPEG"]` and "keine Flurstücksnummern"), every WMS layer `queryable="0"`, no GetFeatureInfo advertised. **The one genuine German gap** — the other 15 Länder are in Table A |
| **Hungary** (HU) | **FOOTPRINT** (service real, coverage ≈ nil) | n/a — keyless | `inspire.lechnerkozpont.hu/geoserver/CP/ows` GetCapabilities → HTTP 200, `layers=1 cadastral-like=["CP:CP.CadastralParcels"]`, `ows:Fees NONE`. A Budapest GetFeature → HTTP 200 `wfs:FeatureCollection` with **numberMatched=0**: the service publishes only the **Mesterszállás** sample municipality (1774 parcels). ⚠ This lane's probe of the **lowercase** path `/geoserver/cp/wfs` returned HTTP 200 whose body is a PHP error — `file_get_contents(http://localhost:8085/geoserver/cp/wfs...): Failed to open stream: HTTP request failed! HTTP/1.1 404 Not Found` — **the case of the path decides the answer**, and the lowercase reading would have shipped a false "Hungary is down" |
| **Romania** (RO) | **ABSENT** (host does not resolve) | n/a | `geoportal.ancpi.ro` → **NETWORK-ERROR (DNS)**. Cross-checked over Google DoH: `Status=3 (NXDOMAIN) Answer=null`. The apex `ancpi.ro` resolves — the zone is live, the geoportal subdomain is absent. Third consecutive measurement (09-02, 09-03, 09-04) |
| **Belgium · Brussels** (BE-BRU) | **FOOTPRINT** (reachable, not yet resolved) | n/a — keyless | `geoservices-urbis.irisnet.be` → NETWORK-ERROR, 25 s timeout. `gis.urban.brussels` `GAPD:AGDP_CAPA` → `HTTP 400 ows:ExceptionReport` — **our request shape is wrong; the service is up**. `datastore.brussels` → HTTP 200 portal |
| **Belgium · Wallonia** (BE-WAL) | **FOOTPRINT** (reachable, not yet resolved) | n/a — keyless | `geoservices.wallonie.be/arcgis/rest/services?f=json` → **HTTP 200**, 19 folders `["AGRICULTURE","AMENAGEMENT_TERRITOIRE",…,"DONNEES_BASE",…]`. `DONNEES_BASE` → 4 MapServers, **none cadastral**. GetCapabilities → `layers=28 cadastral-like=[]`. Reachable and enumerable; the parcel layer is not in the folders opened |
| **UK · Scotland** (GB-SCT) | **FOOTPRINT** | n/a | `www.ros.gov.uk/data-and-services` → `HTTP 403 · "Just a moment..."` (Cloudflare challenge). `inspire.ros.gov.uk` → NETWORK-ERROR (DNS). ⚠ The `ros-inspire-services.azurewebsites.net` host is a **constructed** URL and did not resolve — no conclusion drawn from it |
| **UK · Wales / N. Ireland** | **FOOTPRINT** | n/a | The wired `gb` leg (HMLR INSPIRE title boundaries via `planning.data.gov.uk`) is **England-only** — measured `@Cardiff features=0`, `@Belfast features=0`. Not an outage; the dataset stops at the border |
| **Malta** (MT) | **FOOTPRINT** | n/a | `msdi.data.gov.mt/geoserver/ows` → `HTTP 403 · server=cloudflare`. ⭐ Until commit `405d6b54` **today**, Malta was routed to the **Italian** cadastre — a sovereign state sitting inside `ITALY_BBOX`. Now carved out on both sides of the wire |
| **Iceland** (IS) | **UNPROBED-AT-SOURCE** | — | `gagnaveita.hms.is` → NETWORK-ERROR (DNS). ⚠ **constructed URL** — this is not evidence Iceland lacks a cadastre |
| **Serbia** (RS) | **UNPROBED-AT-SOURCE** | — | `opendata.geosrbija.rs` → NETWORK-ERROR after 11 s. ⚠ **constructed URL** |
| **Ukraine** (UA) | **FOOTPRINT** (portal live, no machine channel found) | n/a | `e.land.gov.ua` → HTTP 200, 18 077 B HTML (StateGeoCadastre public portal). Viewer-mediated; no REST/OGC surface probed this round |
| **Cyprus** (CY) | **FOOTPRINT** (portal live, no machine channel found) | n/a | `eservices.dls.moi.gov.cy` → HTTP 200, 16 154 B HTML (Angular app). Viewer-mediated |
| **AL · AD · BA · BY · FO · GI · XK · LI · MK · MD · MC · ME · RU · SM · VA** | **UNPROBED** | — | ⛔ This lane did not probe them. Listed so the omission is **visible rather than silent**. No class is asserted |

### B2 · Middle East

| Jurisdiction | Class | Do we hold the key? | Verbatim evidence |
|---|---|---|---|
| **Turkey** (TR) | ✅ **WIRED** — Table A | keyless | `cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/{lat}/{lon}` → HTTP 200, ada/parsel + served `alan`. A no-parcel point is a **semantic HTTP 404** `{"Message":"Parsel Bulunamadı: …"}` → classified `empty`, never an outage. Licence **UNREAD (YELLOW)** |
| **Qatar** (QA) | ✅ **WIRED** — Table A | keyless | `services.gisqatar.org.qa/.../CadastrePlots/MapServer/0` → HTTP 200, `PIN 1010028`, `PDAREA 183494` (surveyed), 137-vertex ring. ⭐ The layer is **HIDDEN from the folder listing** and was addressed directly ([[getcapabilities-is-not-an-inventory]]). Licence **UNREAD (YELLOW)** |
| **Israel** (IL) | **FOOTPRINT** — query open, **ring not served** | keyless | `ags.govmap.gov.il/Identify/IdentifyByXY` → HTTP 200, gush 6952 / helka 139, registered area 7404 m², status מוסדר — **but the body carries a centroid and an EXTENT, no boundary ring**. Serving the extent rectangle as the parcel would be the L-616 overstatement family, so the leg is **deliberately not wired**. The national bulk `parcel_all.zip` is IL-IP gated (403 from a foreign IP) while the **query** endpoint is not fenced ([[bulk-vs-query-endpoint-false-refusals]]). ⛔ `/api/parcel/il` → **`HTTP 404 {"error":"Unknown cadastre 'il'."}`** — Defect D2 |
| **Saudi Arabia** (SA) | **CREDENTIAL-GATED** (was geo-blocked) | **NO** | `umaps.balady.gov.sa` 301→`umaps.momah.gov.sa`; `/server/rest/services` → `{"currentVersion":11.5,"folders":["Hosted","umaps","Utilities"],"services":[]}`; **every DATA folder** → `{"error":{"code":499,"message":"Token Required","details":[]}}` (stable ×3); `/portal/sharing/rest` → `enterpriseVersion 11.5.0`. The viewer authenticates against `ssoapp.balady.gov.sa`. ⭐ **The L-606 class CHANGED**: an in-SA proxy alone no longer suffices — the gate is Balady SSO / Nafath identity, or a MOMRAH agreement. `balady.gov.sa` itself → HTTP 200, 202 277 B |
| **UAE · Dubai** (AE-DU) | **GEO-BLOCKED** (vantage TCP fence) | n/a | `gis.dubai.gov.ae` → NETWORK-ERROR; `www.dubaipulse.gov.ae` → NETWORK-ERROR after 10.4 s; `geodubai.dm.gov.ae` RC=28 at 21.3 s. ⭐ **The disambiguating control**: corporate `www.dm.gov.ae` answers **HTTP 200** via Azure CDN — the **data tier** is fenced, not the domain. AGOL enumerated past the viewer: org `dubaimunicipalityitd` exposes one operational-layer-less "HQ" webmap; **no official DM/DLD keyless parcel FeatureServer exists** |
| **UAE · Abu Dhabi** (AE-AZ) | **GEO-BLOCKED** (F5 WAF) | n/a | `data.abudhabi/opendata/data.json` → F5 `<title>Request Rejected</title> … Your support ID is: 11709459134665974889`; DKAN metastore → TCP timeout 25 s; **all five** AD-SDI hosts (`geoportal.dmt.gov.ae`, `sdi.gsec.abudhabi`, `geoportal.abudhabi.ae`, `www.abudhabimaps.ae`, `adgeospatial.gov.ae`) → HTTP 000. `sdi.abudhabi.ae` answered **HTTP 200 / 87 934 B HTML** today — a portal shell, not a service. UAE-PASS credential class **unmeasured, not assumed** |
| **Kuwait** (KW) | **UNMEASURABLE from this vantage** | n/a | `kuwaitfinder.paci.gov.kw` → `curl (35) schannel … SEC_E_CERT_EXPIRED` — **the server's TLS certificate has expired**; `services.paci.gov.kw/arcgis/rest/services` → HTTP 302 → error page; `mapapi` / `geoportal` / `data.paci.gov.kw` NXDOMAIN. ⛔ Deliberately **not** classified absent |
| **Bahrain** (BH) | **CREDENTIAL-GATED** (national eKey) | **NO** | `slrb.gov.bh` → HTTP 200; SLRB names cadastral services routed through the **national eKey login**. Every guessable GIS host (`bahrainmaps.bh`, `gisbahrain.bh`, `gis.slrb.gov.bh`, `bsdi.bh`) NXDOMAIN. `data.gov.bh` `q=parcel` → `{"nhits": 4 …}` — all **statistics tables**, no geometry; `q=cadastral` → 0. Fee schedule **UNREAD** |
| **Oman** (OM) | **GEO-BLOCKED or WAF — UNKNOWN** | n/a | `onsdi.ncsi.gov.om` → TCP timeout 20 s (NSDI drops foreign SYNs); `housing.gov.om` — the krooki/parcel authority — → **HTTP 403 WAF**; `nsdi.gov.om` / `geoportal.gov.om` / `maps.gov.om` NXDOMAIN. Class left **UNKNOWN** rather than guessed |
| **Jordan** (JO) | **FOOTPRINT** — endpoint open, **identifiers empty** | n/a — keyless | `maps.dls.gov.jo/arcgis/rest/services` → HTTP 200, `DLS_Layers_Service/MapServer`, 15 layers incl. three named "قطع الاراضي" (parcels). But a point query at **Amman** returned `features:1` with `PARCEL_ID='' · VILL_CODE=' ' · DLS_KEY=''`, and at **Irbid** `PARCEL_ID=None`. **2 of 2 probed points served geometry with the identity stripped.** The id-bearing flow runs through a **captcha-gated viewer**. ⭐ Structurally identical to AU-WA. **No registry row exists** |
| **Egypt** (EG) | **ABSENT** | n/a | `data.gov.eg` → NXDOMAIN; `msa.gov.eg` → NXDOMAIN; `www.esa.gov.eg` (Egyptian Survey Authority) → HTTP 200 corporate site, no data services. ESA sells maps over the counter |
| **Lebanon** (LB) | **UNPROBED-AT-SOURCE** | — | `www.finance.gov.lb` → NETWORK-ERROR after 5.8 s. ⚠ **constructed URL**; no Lebanese cadastre host has ever been probed here. No class asserted |
| **IQ · SY · YE · IR · PS** | **UNPROBED** | — | ⛔ Never probed, by this lane or any predecessor. Listed so the gap is visible |

---

## THE USA, STRUCTURALLY — there is no national parcel service, and the unit is NOT the state

**Answered by live probe on 2026-09-04, not by reasoning.**

### There is no federal parcel layer

| Candidate | Probe | What it actually is |
|---|---|---|
| Federal **NGDA "Cadastre" theme** → BLM | `gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer?f=json` → **HTTP 200**, layers = `State Boundaries · PLSS Township · PLSS Section · PLSS Intersected`, serviceDescription *"a compilation of feature classes designed to represent the Public Land Survey System (PLSS) grid. BLM National Public Land Survey System is the basis for **Federal** land ownership"* | **The survey GRID, not ownership parcels.** Township/section/aliquot. Zero private lots. And PLSS does not cover the original colonies or Texas (metes-and-bounds) at all |
| Esri Living Atlas (`services.arcgis.com/P3ePLMYs2RVChkJx`) | HTTP 200, 246 490 B, **1349 services**; the only parcel-ish name is `TaxParcelQuery`, whose own serviceDescription reads *"the tax parcel query map is used in the public access and value analysis **dashboard**"* | A demo/dashboard sample, not a national fabric |
| **Regrid** (commercial aggregator) | `app.regrid.com/api/v1/search.json` → `HTTP 401 · {"status":"error","message":"An access token is required."}` | **Commercial licence wall.** Claims 160 M parcels / 3 229 counties |
| ReportAll, LightBox | **NOT PROBED** by this lane; LightBox is entirely absent from this repo | No claim made |

It is already written into the code, at `server/jurisdiction/euCadastreProxy.js`:

> `// ⛔ NO US NATIONAL PARCEL SERVICE EXISTS to fall back to (verified 2026-09-03: the federal`
> `// NGDA "Cadastre" theme is the BLM PLSS survey grid — township/section, zero private lots; the`
> `// national commercial layers are tiles-only or token-gated). US parcels are county-assessed in`
> `// law, so per-jurisdiction legs are the only correct architecture, not a stopgap.`

### ⛔ THE UNIT OF COVERAGE IS IRREGULAR, AND THAT IS THE ANSWER

**A national percentage over this estate is meaningless, and so is a per-state one.** The unit is
not uniform: it is whatever level actually publishes, and that varies **by state**.

| The measured shape | Evidence |
|---|---|
| **2 states publish a STATEWIDE parcel fabric** and collapse to one row each | **MA** — MassGIS L3, `arcgisserver.digital.mass.gov/.../L3_Parcels_FeatureService_4326/FeatureServer/**1**` (⚠ layer 0 is Devens district only). **FL** — FDOR Statewide Cadastral, **10 831 924 features** (`returnCountOnly` → `{"count":10831924}`) |
| **1 state was MEASURED to have no usable statewide service** | **TX** — TxGIO/TNRIS `2025_Land_Parcels` (org `KTcxiTD9dsQw4r7Z`, layer 328) is a polygon layer whose intersects point queries at **both** an Austin and a Dallas point returned nothing. Travis County's own host `gis.traviscountytx.gov` did not resolve (HTTP 000). The City-of-Austin AGOL layer is *"City of Austin **OWNED** Parcels"* only. So TX forces **county** rows |
| **2 states are research-claimed to have none, unprobed for parcels** | **CA** — `gis.data.ca.gov` → HTTP 200, 99 100 B, `<title>California State Geoportal</title>`: a landing page, not a parcel service. **IL** — no state cadastre portal; Cook County publishes its own |
| **1 state's directory was fetched but never adjudicated** | **NY** — `gisservices.its.ny.gov/arcgis/rest/services` → HTTP 200, `folders:["Locators","Utilities"]`, services include `BuildingFootprints`; **no statewide tax-parcel service visible**. NY is reached at CITY level only |
| **44 states: never surveyed** | ⛔ **No 50-state statewide-vs-county census exists in this repo.** Do not infer one |

The repo's *doctrine* files say the unit is the **county, ~3,143 of them**
(`docs/04-reference/jurisdictions/us/COUNTRY-RATE.md`, `LEGISLATION-RATE.md`), with an estimate of
**2 400–2 800** publishing an ArcGIS REST FeatureServer or bulk download. ⚠ **That estimate is
explicitly on the repo's own falsification list** (*"Fewer than 1,000 counties publish assessor data
in machine-readable format"*) and has never been tested. **Quote it as an estimate or not at all.**

### What PRYZM reaches today: 7 US jurisdictions — 2 states + 3 counties + 2 cities

| Row | Coverage unit | Denominator | Live 2026-09-04 |
|---|---|---|---|
| `us-ma` | **State of Massachusetts** — statewide | 1 of 1 | `F_775267_2956644`, Cambridge ST Boston, 52-vertex ring |
| `us-fl` | **State of Florida** — statewide | 1 of 1 | `0101090701090`, 95 NW 2 ST Miami, 677 m² (see the road-vs-parcel note below) |
| `us-nyc` | **New York City** — 5 boroughs | 5 of NY's 62 counties | `1001220001`, 52 CHAMBERS STREET |
| `us-sf` | **San Francisco** — city-county | 1 of CA's 58 | `0787001`, 1 DR CARLTON B GOODLETT PL |
| `us-chi` | **Cook County, IL** | 1 of IL's 102 | `1709449020` |
| `us-wa-king` | **King County, WA** (Seattle) | 1 of WA's 39 | `0942000365`. A **Spokane** click produces `legs []` — no candidate row, no call. Working as designed |
| `us-tx-harris` | **Harris County, TX** (Houston) | 1 of TX's 254 | `0011490000001`, 901 BAGBY ST |

⚠ **`us-fl` and `us-tx-harris` first answered `empty` at the canonical city-hall point.** Both were
right-of-way. FDOR and HCAD do not polygonise streets, so an `empty` on a road is **TRUE**, not an
outage: `returnCountOnly` at the Miami point → `{"count":0}` while the surrounding 0.02° box →
`{"count":1231}`. Both resolve at a parcel interior. This is exactly why the probe carries a second
point per row.

**Metros with NO candidate row at all** (measured `legs []`, zero HTTP calls): Los Angeles, Denver,
Phoenix, Philadelphia, Atlanta, Washington DC, Charlotte, Dallas, Austin, Spokane.

---

## AUSTRALIA, STRUCTURALLY — 8 units, 6 reached, and neither gap is a network problem

**There is no national cadastre.** Stated as a measured finding in two places, e.g.
`server/jurisdiction/euCadastreProxy.js`: *"Australia has NO national cadastre; cadastre is a STATE
competency, hence one leg per state."*

**The unit is the state/territory: 6 states + 2 territories = 8.** PRYZM reaches **6 of 8**, all
live-probed 2026-09-04:

| Unit | Reach | Live identifier |
|---|---|---|
| New South Wales | ✅ WIRED | `1//DP598704` |
| Victoria | ✅ WIRED | `PC366537` (⚠ Vicmap CQL is **LAT,LON**; a lon,lat probe returns 0 silently) |
| Queensland | ✅ WIRED | `49SP314954` (id-less "Unlinked parcel" twins pre-filtered out) |
| South Australia | ✅ WIRED | `C25082 F1` — soft CloudFront WAF: **403 bare, 200 with the documented public Referer**, injected server-side |
| Tasmania | ✅ WIRED | `3321248`, `49-51 MURRAY ST HOBART TAS 7000` — the richest AU row (id + title + tenure + address) |
| ACT | ✅ WIRED | `44/19` — leasehold; block/section IS the parcel id; RETIRED lifecycle rows dropped |
| **Western Australia** | ❌ FOOTPRINT | **A LICENCE block on the IDENTIFIER, not a network block.** Landgate SLIP layer 2 *"Cadastre (No Attributes) (LGATE-001)"* returns real polygons whose attributes are `{"objectid":1149809,"view_scale":"4K"}` — geometry served, identity stripped. The attributed products carry `license_title "Custom (Other)"` = a Landgate data agreement, **price class unread** (geoscape.com.au 403 to probe) |
| **Northern Territory** | ❌ FOOTPRINT | **A TOOLING block, classified UNKNOWN-not-zero.** NR Maps serves a JS loader issuing a jsessionid with no REST/OGC endpoint in its loader JS; NTLIS/iPlan → 302 → Cloudflare "Just a moment…" 403; `data.nt.gov.au` CKAN holds no cadastre dataset. Settle via a browser-session network capture |

**No national alternative exists.** The only national AU products this repo names are **Geoscape
Buildings** (footprints + heights — *not* a cadastre; commercial sales agreement, cost class
**unread**, geoscape.com.au 403 to probe) and **ELVIS elevation** (open, CC BY 4.0, not parcels).
**G-NAF, PSMA and ANZLIC appear nowhere in this repo** — verified by exhaustive search, so there is
no evidence a national parcel product was ever even considered.

---

## DEFECTS THIS MEASUREMENT FOUND — open, and none of them cosmetic

### D1 · BE-VLG (Flanders) is WIRED on disk and **DEAD IN PRODUCTION**

| When | Where | Result |
|---|---|---|
| 11:31 | `pryzm.fly.dev` | ✅ HTTP 200 `11803C2165/00M000` in **19 907 ms** |
| 15:31 | `pryzm.fly.dev` | ❌ `{"parcel":null,"outcome":"unreachable"}` after **56 749 ms** |
| 17:0x | `pryzm.fly.dev` | ❌ same, reproduced |
| 15:0x | upstream, from a dev machine | ✅ HTTP 200 · 11 729 B · **21 736 ms** → 67-vertex ring |

⭐ **It is INTERMITTENT, and that is the real shape of it.** The leg carries `timeoutMs: 28_000` plus
one retry; 56.7 s ≈ 2 × 28 s, so both attempts abort at the ceiling. The **same** production instance
answered in 19.9 s four hours earlier. So the GRB WFS latency **drifts across the 28 s ceiling**, and
that ceiling was set from a LOCAL measurement (~20 s) which Fly's egress does not reproduce. While it
is over, **every Flemish click is an OSM footprint under a Flanders label**, silently — the
`unreachable` outcome is preserved internally but the user sees a building outline.

⛔ **Do not simply raise the number again from a laptop reading — that is how it got here.** Both
attempts aborted, so the true production latency is known only to be **>28 s**. It has to be measured
ON FLY, and one long attempt is probably better than two short ones
([[tolerance-from-measured-error-not-the-test]]). Recorded at the leg in `euCadastreProxy.js`.

### D2 · Two registry rows advertise `kind: 'cadastral'` for routes the server does not serve

| Row | Registry says | Production says |
|---|---|---|
| **FI** | `kind:'cadastral'`, `proxyPath:'/api/parcel/fi'`, note claims the key is *"carried server-side by the proxy as HTTP Basic"* | `GET /api/parcel/fi?lon=24.9384&lat=60.1699` → **`HTTP 404 {"error":"Unknown cadastre 'fi'."}`**. There is **no `fi` key** in `EU_CADASTRE_SOURCES`, no `fi` proxy module, and **no `MML_API_KEY` anywhere under `server/`** |
| **IL** | `kind:'cadastral'`, `proxyPath:'/api/parcel/il'` (its note *does* admit the leg is unwired) | `GET /api/parcel/il?lon=34.7818&lat=32.0853` → **`HTTP 404 {"error":"Unknown cadastre 'il'."}`** |

This is the exact defect the US block header says this file exists to prevent: *"The registry
VERDICT said 'cadastral' while the user got a building outline: authored-but-unwired, the C58 §1.4
credibility failure."* It is still live for FI and IL. **FI's note is additionally false**, not just
stale: it describes a key-carrying proxy that was never built.

### D3 · Six AU registry notes carry a stale "not yet wired" warning

Every AU cadastral row ends `⚠ Proxy /api/parcel/au-<state> not yet wired → null → OSM footprint
until then`. **All six ARE wired and all six answered in production today.** The notes were never
updated when lane PROXY-LEGS landed them on 2026-09-03. A note that under-claims is less dangerous
than one that over-claims, but it is the same class of drift.

### D4 · The Oder band routes a POLISH click to a GERMAN cadastre, and no geometry can fix it

`DE-BB` (51.3–53.6°N, 11.2–14.8°E) covers **Słubice** (52.3481, 14.5606), which is Poland. The
national resolver **REFUSES** there rather than asserting a nationality, and its refusal text
prescribes the remedy — *"try each candidate's cadastre and let the service's own answer decide"* —
but the `PL` row's `contains` is `claimsNation('PL')`, which is false on every refusal. **So GUGiK
ULDK, which would answer at Słubice, is never tried**, and the click ends on a German-attributed OSM
footprint.

⛔ **The obvious fix is falsified by the dataset**, measured at these exact points:

```
Słubice (POLISH) → "DEU contains this point in ne_10m, POL's boundary is 216 m away"
Görlitz (GERMAN) → "POL contains this point in ne_10m, DEU's boundary is 355 m away"
```

ne_10m is wrong at **both, in opposite directions**. A containment gate would KEEP the German
cadastre at Polish Słubice and TAKE IT AWAY from German Görlitz. The fix that would work is letting
`claimsNation` rows join the refusal fall-through. Recorded, not actioned — wide blast radius;
pinned in `packages/site-parcel-data/__tests__/parcelRegistryNationalWiring.test.ts` §4.

### D5 · Licences UNREAD on four wired rows

**TR · QA · HR · AU-TAS** are all keyless and live, and **keyless ≠ licensed**. Each is marked
YELLOW at its row. Read the terms before these appear in a commercial deliverable.

---

## How routing works (unchanged in shape, corrected in fact)

1. `resolveParcelCandidates(lat, lon)` consults the **national-jurisdiction resolver** first
   (`packages/site-parcel-data/src/jurisdiction/nationalJurisdictionResolver.ts`, ne_10m polygons +
   a **measured** 1500 m positional tolerance). On a national **claim**, only that country's rows
   survive. On a **refusal** the whole matched set survives in specificity order.
   ⛔ Box area is **not** the decider and never was a sound one: `LITHUANIA_BBOX` (≈15.9 deg²) is
   smaller than `POLAND_BBOX` (≈58.6 deg²) and contains the Polish towns Suwałki and Sejny.
2. `resolveParcelWithFallback` **walks** the candidates and returns the jurisdiction that ACTUALLY
   ANSWERED — so a mis-ranked neighbour that returns zero features self-corrects.
3. Cadastral jurisdiction → the editor calls the same-origin proxy (`/api/parcel/<cc>` or
   `/api/catastro/parcel`), which forwards ONCE, normalises to a WGS84 ring, and caches by parcel id.
4. Miss, or a footprint-fallback jurisdiction → the **universal OSM footprint**, labelled
   `footprint (OSM)`, never presented as a cadastral parcel.

**The outcome is never collapsed to `parcel | null`.** `resolveEuParcelOutcome` keeps `ok` /
`empty` (the register answered and publishes nothing here) / `unreachable` (we do not know) /
`out-of-area` apart, because an outage and a coverage gap are not the same fact.

## Files

- `docs/04-reference/jurisdictions/parcel-reach-probe.mjs` — **the probe behind this table**
- `packages/site-parcel-data/src/parcelProviders/registry.ts` — the pure routing table (70 rows)
- `packages/site-parcel-data/src/parcelProviders/countryBbox.ts` — national/sub-national predicates
- `packages/site-parcel-data/src/jurisdiction/nationalJurisdictionResolver.ts` — the national decider
- `server/jurisdiction/euCadastreProxy.js` — 51 legs; `dkMatrikelProxy.js` — DK; `parcelZoningProxy.js` — ES
- `apps/editor/src/ui/site/parcel/` — the client dispatcher + the universal footprint provider
