// ─────────────────────────────────────────────────────────────────────────────
// §EU-REG-WEST — official building registers for WESTERN EUROPE (lane EU-REG-WEST, 2026-09-06)
//
// THE DEFECT. L-12969/L-12970: the founder's village renders almost nothing because OSM holds 25
// buildings there and the official register holds 2,856. Spain's answer is `esCatastro.mjs`. This
// file is the same answer for the countries whose register is served over a **by-bbox query API**
// rather than a per-municipality archive — and it is deliberately ONE adapter with a table of
// DOORS, not eleven adapters, because the differences between these registers are configuration
// (endpoint, axis order, page cap, field names) and the differences that are NOT configuration are
// exactly the ones this header records as refusals.
//
// ⚠ EVERY NUMBER IN THIS FILE IS AN ANSWER THIS MACHINE RECEIVED ON 2026-09-06. Where a claim is
// not measured it says so. Where a register refused, the refusal carries the verbatim HTTP answer
// (§CONTEXT-DATA-HONESTY, C57 §1.5/§1.9) — a country we could not source is a NAMED refusal, never
// a quiet omission and never an optimistic "available".
//
// ═════════════════════════════════════════════════════════════════════════════
// A. THE FOUR SILENT-TRUNCATION TRAPS, MEASURED. Read these before touching the paging loop; each
//    one returns HTTP 200 and a plausible file while losing most of a country.
// ═════════════════════════════════════════════════════════════════════════════
//
// A1. ⛔ **AXIS ORDER — the wrong order is a 200 with ZERO features.** Both NL and BE-Flanders take
//     the bbox as **lat,lon** under `urn:ogc:def:crs:EPSG::4326`. Measured over the densest cells:
//       NL  BBOX=52.997,7.185,53.010,7.205 → numberMatched **249**  ·  7.185,52.997,7.205,53.010 → **0**
//       VL  BBOX=50.79,5.15,50.81,5.18     → numberMatched **1409** ·  5.15,50.79,5.18,50.81     → **0**
//     ⚠ THIS IS THE OPPOSITE OF FRANCE. `frBdtopo.mjs` builds **lon,lat** and is correct there. A
//     copied builder is a silently empty country, which is why `door.axis` is an explicit field and
//     `euBboxToken()` is the only place that orders the four numbers.
//
// A2. ⛔ **NL WITHOUT `srsName` RETURNS EPSG:28992 (RD metres) AND SAYS SO ONLY IN A `crs` MEMBER.**
//       …&OUTPUTFORMAT=application/json (no srsName) → 200, 1,110 B, verbatim:
//         "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::28992" } }
//       …&srsName=urn:ogc:def:crs:EPSG::4326          → CRS84 [4.8895954, 52.3709893]
//     A pipeline that omits `srsName` writes RD metres into a WGS84 tile and NOTHING errors. Both
//     fixtures are saved: `nl-bag-pand-bourtange-2026-09-06.json` (right) and
//     `nl-bag-pand-nosrsname-rd-2026-09-06.json` (wrong), and a spec pins the difference.
//
// A3. ⛔⛔ **`numberMatched` ON A GetFeature PAGE IS A RUNNING TOTAL, NOT THE MATCHED TOTAL — and
//     the PDOK page cap is ~970–982 features NO MATTER WHAT `COUNT` SAYS.** This is the worst of
//     the four and it is measured, not inferred. Same bbox (52.30,4.80,52.42,5.00), same service:
//       RESULTTYPE=hits                       → numberMatched **192,181**
//       COUNT=1000  STARTINDEX=0              → returned  **969**, numberMatched **969**
//       COUNT=5000  STARTINDEX=0              → returned  **969**, numberMatched **969**
//       COUNT=20000 STARTINDEX=0              → returned  **969**, numberMatched **969**
//       (no COUNT at all)                     → returned  **969**, numberMatched **969**
//       COUNT=5000  STARTINDEX=969            → returned  **981**, numberMatched **1950**
//       COUNT=1000  STARTINDEX=5000           → returned  **928**, numberMatched **5928**
//     So `numberMatched` on a page is exactly `STARTINDEX + numberReturned`. A pager that stops at
//     `startIndex >= numberMatched` — which is what `fetchBdtopoCell` does, correctly, for IGN —
//     **stops on page one, every time, and reports the cell complete**. Over Amsterdam that ships
//     969 of 192,181 buildings, 0.5 %, with no error anywhere. `euFetchCell` therefore stops ONLY
//     on an empty page or on the `hits` total, and `door.pageStopsOnMatched` is `false` for WFS
//     doors so nobody re-introduces it.
//
// A4. ⛔ **BE-Flanders `RESULTTYPE=hits` IS CAPPED AT THE LITERAL 10000.** Rural Limburg → 1,409
//     (a real count). Antwerp 51.15,4.30–51.30,4.50 → **10000**; whole Flanders → **10000**. The
//     GeoJSON page cap is the same literal (COUNT=20000 → 10,000 returned; COUNT=5000 → 5,000). So
//     for GRB a `hits` reading of exactly 10000 is a CEILING, not a census, and `euParseHits()`
//     returns it flagged (`atCeiling`) rather than as a total. GRB pages carry **no**
//     `numberMatched` at all, so paging there stops on a short page and on nothing else.
//
// ═════════════════════════════════════════════════════════════════════════════
// B. THE ELEVEN COUNTRIES — reachable endpoint · product shape · licence · height/storeys ·
//    national volume · cadence · WIRED / WIRE-NOT-BUILD / BLOCKED. Probed 2026-09-06.
// ═════════════════════════════════════════════════════════════════════════════
//
// ── WIRED BY THIS FILE ───────────────────────────────────────────────────────
// 1. **NETHERLANDS — `nl_bag`. WIRED.** PDOK **BAG** `bag:pand`, WFS 2.0 by bbox, keyless.
//    https://service.pdok.nl/lv/bag/wfs/v2_0 · caps 200, 19,699 B, text/xml.
//    NATIONAL VOLUME: whole-country `RESULTTYPE=hits` over 3.30,50.70–7.25,53.60 →
//    **numberMatched 11,429,771** in 47.3 s. Village Bourtange → 249 (villages ARE covered).
//    HEIGHT/STOREYS: **NEITHER.** Fields measured verbatim: identificatie · rdf_seealso ·
//    bouwjaar · status · gebruiksdoel · oppervlakte_min · oppervlakte_max ·
//    aantal_verblijfsobjecten. So this door supplies GEOMETRY + YEAR + USE, and the height keeps
//    coming from the already-wired `heightJoin:'3dbag'` stamp (heights/nl3dbag.mjs) — the two
//    compose exactly as ES Catastro composes with the MDS raster.
//    LICENCE: caps `<ows:Fees>none</ows:Fees>` + `<ows:AccessConstraints>` =
//    https://creativecommons.org/publicdomain/zero/1.0/deed.nl → **CC0 1.0**.
//    CADENCE: BAG is a live register; PDOK republishes near-daily.
//    ⛔ DO NOT CITE the OGC API: api.pdok.nl/lv/bag/ogc/v1 landing, /collections and
//    /collections/pand/items ALL → **404 nginx, 153 B**.
//
// 2. **BELGIUM (Flanders) — `be_grb`, part of `be_registers`. WIRED.** Digitaal Vlaanderen **GRB**
//    https://geo.api.vlaanderen.be/GRB/wfs · caps 200, 184,465 B. Footprint layer **`GRB:GBG`**
//    (Gebouw aan de Grond). Antwerp 51.215,4.395–51.225,4.410 → 3,958. Rural Limburg → 1,409.
//    HEIGHT/STOREYS: **NEITHER.** Fields: UIDN · OIDN · VERSIE · BEGINDATUM · VERSDATUM · TYPE ·
//    LBLTYPE · OPNDATUM · BGNINV · LBLBGNINV. Measured LBLTYPE vocabulary over 3,000 Antwerp rows:
//    "hoofdgebouw" 2,834 · "bijgebouw" 154 · "gebouw afgezoomd met virtuele gevels" 12.
//    Height keeps coming from the wired DHMV II raster stamp (`heightJoin:'be_dhmv'`).
//    LICENCE: `<ows:Fees>Het gebruik van de service is kosteloos.</ows:Fees>`. CADENCE: continuous.
//    NATIONAL VOLUME: **UNKNOWN AND SAID SO** — see A4; hits saturates at 10000.
//
// 3. **BELGIUM (Wallonia) — `be_picc`, part of `be_registers`. WIRED.** **PICC** ArcGIS REST,
//    https://geoservices.wallonie.be/arcgis/rest/services/TOPOGRAPHIE/PICC_VDIFF/MapServer,
//    **layer 11 "Construction - Bâtiment - Emprise"**, `maxRecordCount` **2000**,
//    `copyrightText` "Service public de Wallonie", source SR wkid 102199 / latestWkid 3812.
//    WHOLE-WALLONIA `returnCountOnly` → **count 3,887,403** (8.4 s). Namur cell → 7,648.
//    NATUR_DESC vocabulary over 2,000 Namur rows: Annexe 1,045 · Habitation 877 · Administration 22
//    · Scolaire 20 · Lieu de culte 11 · … (16 values).
//    HEIGHT/STOREYS: **NO ATTRIBUTE.** ⚠ `returnZ=true` yields `hasZ:true` and rings carrying Z
//    (e.g. 83.06870) but **all three probed vertices of a ring carried the SAME Z** — that is a
//    per-object constant (ground or eave), not a surface, and layer 9 "Bâtiment - Bord" is the
//    likely roof carrier. **This adapter therefore requests `returnZ=false` and emits NO height
//    from PICC.** Treating that Z as a building height is the one thing the measurement forbids.
//
// 4. **IRELAND — `ie_tailte`. WIRED.** Tailte Éireann (OSi Prime2) **"High Value Dataset -
//    Buildings"**, ArcGIS Feature Service, PUBLIC:
//    https://services-eu1.arcgis.com/FH5XCsx8rYXqnjF5/arcgis/rest/services/Buildings/FeatureServer/0
//    Item cd14d445bb6d4af586f4edcfa01da895, owner TailteEireannMapGenie, `access:"public"`.
//    LICENCE (verbatim from the item's licenseInfo): "Tailte Éireann content published as open data
//    is licenced under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence" ·
//    layer `copyrightText` "© Tailte Éireann".
//    NATIONAL VOLUME: `where=1=1&returnCountOnly=true` → **count 3,785,414** (0.2 s).
//    Rural Killorglin cell (-9.79,52.09,-9.77,52.11) → **1,281** — villages ARE covered.
//    HEIGHT/STOREYS: **NEITHER, and the field list is the whole story**: GUID · OBJECTID ·
//    Shape__Area · Shape__Length. `maxRecordCount` 2000, `supportsPagination` true.
//    CADENCE: layer `editingInfo.dataLastEditDate` 1783003917499 = 2026-07-02.
//    ⚠ Ireland has NO wired height join today, so these footprints ride the honest `assumed`
//    default. That is still strictly better than absent: the founder's complaint is SHAPE first.
//
// ── NOT WIRED BY THIS FILE, AND WHY ──────────────────────────────────────────
// 5. **FRANCE — ALREADY WIRED ELSEWHERE (`fr_bdtopo`), plus a SECOND unwired door.** Not touched
//    here. Re-measured 2026-09-06: national `RESULTTYPE=hits` **51,450,444** (was 49,948,635 on
//    2026-09-05 — the constant in `FR_BDTOPO.nationalFeatureCount` is a day stale, left for that
//    file's owner). ⭐ THE LITERAL CADASTRE IS A SECOND DOOR AND IS *NOT* WIRED:
//    **cadastre.data.gouv.fr / etalab-cadastre**, vintage 2026-06-01, per-commune AND
//    per-département GeoJSON on an OVH S3 mirror, accept-ranges bytes. Jouy-en-Josas 78322
//    `batiments.json.gz` → 200, **138,882 B**, gunzip → **3,042 features** (type "01" dur 2,456 /
//    "02" léger 586). Département 78 → 200, **34,506,194 B**; **102 département dirs**; there is NO
//    national file (`geojson/france/cadastre-france-batiments.json.gz` → **404**). No height, no
//    storeys, Licence Ouverte. It matters because BD TOPO returned **2** buildings over the Jouy
//    parcel while the cadastre returns **3,042** for the commune: BD TOPO is the HEIGHT and the
//    cadastre is the complete legal footprint SET. Wiring it is the France lane's call, not this
//    lane's file. ⚠ SEAM FOR THAT LANE: `frBdtopo.mjs:31` says "AXIS ORDER: lon,lat with
//    SRSNAME=EPSG:4326". Measured six forms over one Paris cell: SRSNAME=EPSG:4326 **alone** with
//    lon,lat → **0**; with lat,lon → 7,092; the 5-token `BBOX=…,EPSG:4326` with lon,lat → 7,092.
//    The builder is CORRECT (it emits both) — the COMMENT is incomplete, and a next adapter that
//    copies only the comment gets a silent zero.
//
// 6. **GERMANY — WIRE-NOT-BUILD, and the work is SMALLER than it looks.** `heights/deLod2Laender.mjs`
//    already routes **12 wired Länder** of LoD2-DE and its `partFromBlock()` already parses the
//    `GroundSurface` posList into a native-metre RING and the `measuredHeight` beside it. That is a
//    FOOTPRINT SOURCE WITH A MEASURED HEIGHT that is currently consumed only as a height stamp. The
//    missing piece is a UTM→WGS84 ring reprojection and a `write*WorkingSet` wrapper — not a new
//    door, not a new probe. NOT DONE HERE because that file is owned by the DE heights lane and is
//    modified in the working tree; two lanes writing one CityGML parser is the duplication this
//    repo has been burned by. Named as the single highest-value follow-up in Western Europe.
//    (Its own honest gaps stay: `he` BLOCKED — account-gated Downloadcenter; `sl` UNPROBED;
//    `by` open but held by a founder decision; `hb` probed-open-unsupported.)
//
// 7. **SWITZERLAND — WIRE-NOT-BUILD (open, but no reader on this machine).** swisstopo STAC is
//    live and keyless: `ch.swisstopo.swissbuildings3d_3_0` → 200, 1,474 B, extent
//    5.2229406,45.3204053–11.2575962,48.2425816, EPSG 2056, variants tiled+fullcoverage. ⛔ but its
//    per-tile assets are **DWG only** (`swissbuildings3d_3_0_2013_1172-31_2056_5728.dwg.zip`,
//    `application/x.dwg+zip`) and there is no DWG reader here. `ch.swisstopo.swisstlm3d` → 200; its
//    national item `swisstlm3d_2026-02` carries `.gdb.zip`, `.gpkg.zip`, `.shp.zip`, `.xtf.zip`;
//    the 2020 shp.zip HEAD → 200, **3,025,945,650 B (3.03 GB)**. `node_modules` has geotiff/proj4/
//    sharp and **no gpkg, gdb, shapefile or DWG reader**, and there is no ogr2ogr on PATH — the
//    same wall `frBdtopo.mjs` hit on IGN's GPKG. ⚠ The STAC `"license"` field reads literally
//    **"proprietary"** on both collections; swisstopo's free-of-charge OGD terms are asserted on
//    their website, NOT in this JSON, so the licence must be confirmed by a human before publish.
//
// 8. **UNITED KINGDOM — WIRE-NOT-BUILD (open and keyless, but zipped GML per grid square).**
//    OS **OpenMap Local** via the keyless OS Downloads API: `/downloads/v1/products/OpenMapLocal`
//    → 200, 1,399 B, version **2026-04**, formats ESRI Shapefile / GML 3 / GeoTIFF / GeoPackage,
//    **55 grid areas** (HP…TV) plus "GB". `/downloads?format=GeoPackage` → national
//    `opmplc_gpkg_gb.zip` **3,517,973,251 B**; `?format=GML` → **per-area** zips, e.g. TQ
//    (London) `opmplc_gml3_tq.zip` **222,733,316 B**, HT (Shetland) **94,171 B** — a natural
//    resumable 55-unit sweep. NOT WIRED because each unit is a ZIP of OSGB36/EPSG:27700 GML that
//    needs a zip-entry stream + a 27700→4326 reprojection, and this lane's budget went to the four
//    doors above. **OS OpenMap Local carries NO height and NO storey count** and its buildings are
//    GENERALISED; **OS MasterMap Topography (the true building geometry) is LICENSED** and is not
//    in the keyless product list (26 products enumerated, verbatim, none of them MasterMap).
//    Licence: OS OpenData / OGL v3. The EA-LiDAR height stamp (`heightJoin:'ealidar_gb'`) is
//    already wired and would compose with these footprints.
//
// 9. **AUSTRIA — BLOCKED. BEV serves neither WFS nor a keyless download from this machine.**
//      data.bev.gv.at/geoserver/BEVdataKAT/wfs?…GetCapabilities → 200, 518 B, verbatim:
//        `<ows:Exception exceptionCode="ServiceUnavailable"><ows:ExceptionText>Service GeoServer
//         Enterprise WFS is disabled</ows:ExceptionText>` — same for `/geoserver/wfs` and for 1.1.0.
//      data.bev.gv.at/download/Kataster/ and /download/Kataster/gpkg/national/ → **403**, 1,912 B,
//        "GeoCat Live - 403"; …/KAT_DKM_GST.gpkg → **404**, 2,064 B.
//      kataster.bev.gv.at/api/v1/ → 404 {"message":"Route Not found"} · inspire.bev.gv.at → 404 ·
//      data.gv.at CKAN katalog/api/3/action/package_search → 404 (5,122 B HTML).
//    ⭐ A REGIONAL DOOR IS OPEN AND IS NOT THE COUNTRY: Vienna's OGD WFS
//    (data.wien.gv.at/daten/geo, caps 200, 371,745 B) publishes `ogdwien:FMZKGEBOGD` and
//    `ogdwien:GEBAEUDEINFOOGD`. One city is not Austria, so Austria is recorded BLOCKED with the
//    Vienna door named rather than a country marked green on a city's evidence.
//
// 10. **PORTUGAL — BLOCKED nationally; the real door is MUNICIPAL, and the defect is confirmed.**
//     DGT's national GeoServer serves NO building layer and no WFS at all:
//       geo2.dgterritorio.gov.pt/geoserver/ows?service=WFS → 200, 568 B, verbatim
//         "org.geoserver.platform.ServiceException: Service WFS is disabled".
//       The WMS DOES answer (200, 133,856 B, **159 layers**) and the only building-ish ones are
//       `AE:AreasEdificadas2018` / `AreasEdificadas` — built-up AREAS, i.e. urban-fabric polygons,
//       **not buildings**. INSPIRE ATOM geo2…/inspire/atom/BU.xml → **404**. dados.gov.pt
//       `q=edificios` → 213 datasets, all INE statistics (counts), none of them geometry.
//     ⭐ AND THE FOUNDER'S DEFECT IS ALREADY MEASURED IN THIS REPO FOR PT: a sibling probe
//     (docs/04-reference/jurisdictions/pt/findings/belverde-footprint-coverage-probe.json,
//     2026-09-05) queried **sig.cm-seixal.pt** ArcGIS MapServer layer 998 over Belverde → HTTP 200,
//     258,694 B, **480 official buildings**, of which OSM held **91 — a 20.1 % hit rate, 362
//     missing**. So Portugal's buildings exist and are served, ONE MUNICIPALITY AT A TIME, by ~308
//     municipal SIGs with no national index. That is a per-municipality registry-of-registries job
//     (the ES ATOM shape without the ATOM), not a bbox door, and it is named here as such.
//
// 11. **ITALY — BLOCKED. The cadastre's WFS refuses this machine at the edge.**
//       wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owsChkWFS.php?…GetCapabilities →
//       **403**, 439 B, verbatim "Access Denied … Reference #18.12931602…errors.edgesuite.net"
//       (an Akamai edge denial, identical with a browser User-Agent — so it is not UA-gating).
//       The same path on the WMS host → **500** SOAP "Internal Error (from client)"; ows02.php →
//       **401** "Rejected by policy".
//     ⭐ CHECKED THE OTHER PRODUCT SHAPE, AS THE BRIEF REQUIRES: the AdE **WMS** is fully open —
//       inspire/wms/ows01.php GetCapabilities → 200, 27,566 B, `<AccessConstraints>Dato
//       pubblico</AccessConstraints>`, and among its 23 layers is **`fabbricati`** (buildings) next
//       to CP.CadastralParcel and CP.CadastralZoning. But WMS is RASTER: it renders buildings, it
//       does not hand over geometry. A raster is not a footprint, and painting one into a vector
//       tile is not something this pipeline can or should do.
//       Also probed: wms.pcn.minambiente.it Edificato.map WFS → **500**; Lombardia
//       /geoserver/wfs → **404**. Italy's real open vector buildings are REGIONAL (DBT/BDTRE/DBTR),
//       one region at a time, and are not attempted here.
//
// 12. **LUXEMBOURG — WIRE-NOT-BUILD (open, CC0, but archive-shaped).** No WFS: wfs.geoportail.lu
//     → **DNS failure** ("fetch failed", 904 ms); inspire.geoportail.lu/geoserver/bu/wfs → **404**
//     Tomcat; data.geoportail.lu → the stock nginx welcome page (615 B). ⭐ The door that DOES open
//     is data.public.lu: dataset `base-de-donnees-nationale-des-batiments-3d-2023`, acronym
//     **BD-L-BATI3D**, organisation **Administration du cadastre et de la topographie**, licence
//     **`cc-zero`**. Its resources include the national footprints as
//     `act2023v2-buildings3d-footprints.gpkg.zip` **63,246,093 B** (63 MB — the whole country) and
//     **per-commune** `act2023v2-bati3d-<commune>.zip` (100 of them: luxembourg 5.38 GB, mersch
//     796 MB, saeul 86 MB) — a natural per-unit sweep. NOT WIRED for the same reason as CH/UK: the
//     national file is a GeoPackage and there is no gpkg reader here. **63 MB is the cheapest
//     whole-country footprint set in Western Europe** and it needs exactly one thing: a reader.
//
// 13. **BELGIUM (Brussels) — BLOCKED, and it is a real hole in a wired country.** UrbIS's GeoServer
//     answers, but exposes ONE type: `/geoserver/UrbisAdm/wfs?…GetCapabilities` → 200, 93,819 B,
//     **TYPENAMES = `UrbisAdm:Pz` and nothing else**. `/geoserver/Urbis/wfs` → 200, 93,279 B with
//     **zero** `<Name>` entries; `/geoserver/ows` (no workspace) → `<ows:ExceptionText>No workspace
//     specified`; urbisadm, urbis, UrbisTopo, UrbisBu, Urbis_Adm → **404**;
//     geoservices.irisnet.be/geoserver/wfs → 404; datastore.brussels/geoserver/wfs → 404 JSON.
//     So Brussels' 19 communes keep their OSM footprints, BY DESIGN, and this is exactly why the
//     covered set is derived from cells that PRODUCED footprints (§COVERED-IS-PARSED). A `belgium`
//     bake with `be_registers` must not, and does not, delete Brussels.
//
// ═════════════════════════════════════════════════════════════════════════════
// C. WHAT THIS FILE DOES NOT OWN. The merge (`mergeReplaceInBbox`), the covered manifest, the
//    chunked seq writer, the WFS hits parser, the HTTP retry and the bbox tiler ALL already exist
//    in `frBdtopo.mjs` and are IMPORTED, not re-written. The record shape and the tag contract come
//    from `officialFootprints.mjs`. This file adds a DOOR TABLE, four field mappings, an ArcGIS
//    page reader, and a resumable grid sweep — and nothing else.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, statSync, writeFileSync } from 'node:fs';

import { HEIGHT_KIND_FLOORS, OFFICIAL_METRES_PER_FLOOR, OFFICIAL_TAGS } from './officialFootprints.mjs';
import {
  appendFeaturesSeq,
  httpGetText,
  parseWfsHits,
  stripZ,
  tileBboxes,
  writeCoveredManifest,
} from './frBdtopo.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// THE DOOR TABLE
// ─────────────────────────────────────────────────────────────────────────────

/** The `axis` values a door may declare. There is no default — see trap A1. */
export const EU_AXES = Object.freeze(['latlon', 'lonlat']);

/** The `kind` values a door may declare. */
export const EU_DOOR_KINDS = Object.freeze(['wfs2', 'arcgis']);

/**
 * Every Western-European door this lane PROBED, wired or not. A row with `status !== 'wired'`
 * carries no URL builder and is here so the refusal is data rather than prose — `euRefusals()`
 * prints it, and a future lane re-probes the exact string instead of re-deriving the country.
 *
 * ⚠ `nationalCount` is `null` where the server refuses to say (GRB saturates `hits` at 10000 —
 * trap A4). `null` means UNKNOWN and must never be rendered as 0.
 */
export const EU_REGISTER_DOORS = Object.freeze({
  // ── WIRED ──────────────────────────────────────────────────────────────────
  nl_bag: {
    key: 'nl_bag', country: 'Netherlands', status: 'wired', kind: 'wfs2',
    label: 'Kadaster BAG pand (PDOK, CC0 1.0)',
    attribution: 'Kadaster / BAG — CC0 1.0',
    licence: 'CC0 1.0 (ows:Fees "none"; ows:AccessConstraints creativecommons.org/publicdomain/zero/1.0/deed.nl)',
    endpoint: 'https://service.pdok.nl/lv/bag/wfs/v2_0',
    typeName: 'bag:pand',
    axis: 'latlon',
    bboxCrs: 'urn:ogc:def:crs:EPSG::4326',
    // ⛔ trap A2 — omit this and the geometry comes back in EPSG:28992 with no error.
    srsName: 'urn:ogc:def:crs:EPSG::4326',
    sortBy: 'identificatie',
    // The MEASURED effective page (trap A3): COUNT is ignored above ~970–982. Asking for 1000 and
    // paging by what actually came back is the only shape that terminates correctly.
    pageSize: 1000,
    measuredPageCap: 982,
    pageStopsOnMatched: false,
    idField: 'identificatie',
    builtField: 'bouwjaar',
    useField: 'gebruiksdoel',
    conditionField: 'status',
    heightField: null, floorsField: null,
    // Measured over 1,966 rows (969 Amsterdam + 997 rural Drenthe): "Pand in gebruik" 1,941 ·
    // "Verbouwing pand" 21 · "Bouwvergunning verleend" 2 · "Sloopvergunning verleend" 2.
    // ⚠ DROP-LIST, NOT ALLOW-LIST, AND ONLY MEASURED SPELLINGS. An allow-list of four measured
    // values would drop every unmeasured status — i.e. real buildings — and completeness loss
    // beats attribute loss (§BDTOPO-CAP-TRUNCATE). "Bouwvergunning verleend" is a permit with no
    // structure on the ground; "Sloopvergunning verleend" is a DEMOLITION PERMIT on a building
    // that is still standing and is therefore KEPT. Statuses this lane did not observe are kept.
    dropConditions: ['Bouwvergunning verleend'],
    nationalBbox: [3.30, 50.70, 7.25, 53.60],
    nationalCount: 11_429_771,
    cellDeg: 0.02,
    probe: '2026-09-06 hits national 11,429,771 (47.3 s) · Bourtange village 249 · Amsterdam cell 192,181 · '
      + 'page 969–982 rows/~1.5 s (774–1,099 B/feature)',
  },
  be_grb: {
    key: 'be_grb', country: 'Belgium (Flanders)', status: 'wired', kind: 'wfs2',
    label: 'Digitaal Vlaanderen GRB GBG (kosteloos)',
    attribution: 'Digitaal Vlaanderen — GRB',
    licence: 'Free of charge (ows:Fees "Het gebruik van de service is kosteloos.")',
    endpoint: 'https://geo.api.vlaanderen.be/GRB/wfs',
    typeName: 'GRB:GBG',
    axis: 'latlon',
    bboxCrs: 'urn:ogc:def:crs:EPSG::4326',
    srsName: 'EPSG:4326',
    sortBy: 'UIDN',
    pageSize: 5000,
    measuredPageCap: 10_000,
    pageStopsOnMatched: false,
    idField: 'UIDN',
    builtField: 'BEGINDATUM',
    useField: 'LBLTYPE',
    conditionField: null,
    heightField: null, floorsField: null,
    dropConditions: [],
    // Flanders only. Wallonia is `be_picc`; Brussels has NO door (see B13) and keeps its OSM.
    nationalBbox: [2.53, 50.68, 5.92, 51.51],
    // ⚠ null = UNKNOWN, not zero: `hits` saturates at the literal 10000 (trap A4).
    nationalCount: null,
    cellDeg: 0.02,
    probe: '2026-09-06 Antwerp cell 3,958 · rural Limburg 1,409 · hits CEILING 10000 over any large box · '
      + 'COUNT=20000 → 10,000 returned, COUNT=5000 → 5,000 (666 B/feature, 3,958 rows in 711 ms)',
  },
  be_picc: {
    key: 'be_picc', country: 'Belgium (Wallonia)', status: 'wired', kind: 'arcgis',
    label: 'SPW PICC couche 11 — Bâtiment Emprise',
    attribution: 'Service public de Wallonie (PICC)',
    licence: 'copyrightText "Service public de Wallonie" (geoportail.wallonie.be catalogue b795de68-726c-4bdf-a62a-a42686aa5b6f)',
    endpoint: 'https://geoservices.wallonie.be/arcgis/rest/services/TOPOGRAPHIE/PICC_VDIFF/MapServer/11/query',
    axis: 'lonlat',
    outFields: 'GEOREF_ID,NATUR_CODE,NATUR_DESC',
    orderByFields: 'OBJECTID',
    pageSize: 2000,
    measuredPageCap: 2000,
    idField: 'GEOREF_ID',
    useField: 'NATUR_DESC',
    builtField: null, conditionField: null, heightField: null, floorsField: null,
    dropConditions: [],
    nationalBbox: [2.84, 49.49, 6.41, 50.85],
    nationalCount: 3_887_403,
    cellDeg: 0.02,
    probe: '2026-09-06 whole-Wallonia returnCountOnly 3,887,403 (8.4 s) · Namur cell 7,648 · rural 1,301 · '
      + 'page 2,000 rows / 2.24 s (523 B/feature) · exceededTransferLimit true drives the offset loop',
  },
  ie_tailte: {
    key: 'ie_tailte', country: 'Ireland', status: 'wired', kind: 'arcgis',
    label: 'Tailte Éireann HVD Buildings (Prime2, CC BY 4.0)',
    attribution: '© Tailte Éireann — CC BY 4.0',
    licence: 'CC BY 4.0 (item licenseInfo, verbatim: "Tailte Éireann content published as open data is licenced under a '
      + 'Creative Commons Attribution 4.0 International (CC BY 4.0) licence")',
    endpoint: 'https://services-eu1.arcgis.com/FH5XCsx8rYXqnjF5/arcgis/rest/services/Buildings/FeatureServer/0/query',
    axis: 'lonlat',
    outFields: 'GUID',
    orderByFields: 'OBJECTID',
    pageSize: 2000,
    measuredPageCap: 2000,
    idField: 'GUID',
    useField: null, builtField: null, conditionField: null, heightField: null, floorsField: null,
    dropConditions: [],
    // The island of Ireland; the layer holds the Republic only, and Northern Ireland's cells will
    // return zero — which is why an empty cell NEVER licenses a deletion (§COVERED-IS-PARSED).
    nationalBbox: [-10.70, 51.30, -5.30, 55.50],
    nationalCount: 3_785_414,
    cellDeg: 0.02,
    probe: '2026-09-06 where=1=1 returnCountOnly 3,785,414 · Killorglin village cell 1,281 · '
      + 'page 2,000 rows / 0.93 s (422 B/feature) · fields GUID·OBJECTID·Shape__Area·Shape__Length only',
  },

  // ── PROBED AND NOT WIRED. No URL builder; the reason is the payload. ────────
  de_lod2: {
    key: 'de_lod2', country: 'Germany', status: 'wire-not-build', kind: null,
    reason: 'heights/deLod2Laender.mjs already routes 12 wired Länder and its partFromBlock() already parses the '
      + 'GroundSurface ring AND measuredHeight. The missing piece is a UTM→WGS84 ring reprojection plus a '
      + 'write*WorkingSet wrapper — not a door. NOT done here because that file is owned by the DE heights lane '
      + 'and is modified in the working tree.',
  },
  ch_swisstopo: {
    key: 'ch_swisstopo', country: 'Switzerland', status: 'wire-not-build', kind: null,
    reason: 'swisstopo STAC live and keyless (ch.swisstopo.swissbuildings3d_3_0 → 200, 1,474 B) but per-tile assets are '
      + 'DWG only (application/x.dwg+zip); swisstlm3d ships .gdb/.gpkg/.shp/.xtf zips (2020 shp.zip HEAD 200, '
      + '3,025,945,650 B). No DWG/GPKG/GDB/SHP reader in node_modules and no ogr2ogr on PATH. '
      + 'STAC "license" reads literally "proprietary" — the OGD terms are on the website, not in the JSON.',
  },
  uk_os_openmap: {
    key: 'uk_os_openmap', country: 'United Kingdom', status: 'wire-not-build', kind: null,
    reason: 'OS Downloads API keyless: OpenMapLocal 2026-04, 55 grid areas, per-area GML3 zips (TQ 222,733,316 B; '
      + 'HT 94,171 B) or national GeoPackage 3,517,973,251 B — a natural 55-unit sweep. Needs a zip-entry stream and '
      + 'an EPSG:27700→4326 reprojection. NO height, NO storeys, GENERALISED geometry; OS MasterMap Topography is '
      + 'LICENSED and absent from the 26 keyless products enumerated.',
  },
  lu_act: {
    key: 'lu_act', country: 'Luxembourg', status: 'wire-not-build', kind: null,
    reason: 'No WFS (wfs.geoportail.lu DNS failure; inspire.geoportail.lu/geoserver/bu/wfs 404). data.public.lu dataset '
      + 'base-de-donnees-nationale-des-batiments-3d-2023 (BD-L-BATI3D, Administration du cadastre et de la topographie, '
      + 'licence cc-zero) serves act2023v2-buildings3d-footprints.gpkg.zip = 63,246,093 B for the WHOLE COUNTRY, plus '
      + '100 per-commune zips. Cheapest national footprint set in Western Europe; needs only a GeoPackage reader.',
  },
  at_bev: {
    key: 'at_bev', country: 'Austria', status: 'blocked', kind: null,
    reason: 'BEV WFS answers 200 with `<ows:Exception exceptionCode="ServiceUnavailable">Service GeoServer Enterprise WFS '
      + 'is disabled` (518 B, both /geoserver/wfs and /geoserver/BEVdataKAT/wfs, 2.0.0 and 1.1.0); '
      + 'data.bev.gv.at/download/Kataster/ → 403 (1,912 B "GeoCat Live - 403"); kataster.bev.gv.at/api/v1/ → 404; '
      + 'inspire.bev.gv.at → 404. Vienna alone is open (data.wien.gv.at WFS, ogdwien:FMZKGEBOGD / GEBAEUDEINFOOGD) — '
      + 'one city is not a country, so Austria is BLOCKED with the city door named.',
  },
  pt_dgt: {
    key: 'pt_dgt', country: 'Portugal', status: 'blocked', kind: null,
    reason: 'DGT geo2.dgterritorio.gov.pt WFS → 200, 568 B, "Service WFS is disabled". Its WMS answers (159 layers) and '
      + 'the only building-ish ones are AE:AreasEdificadas2018 — built-up AREAS, not buildings. INSPIRE atom BU.xml 404. '
      + 'dados.gov.pt q=edificios → 213 datasets, all INE statistics. The real door is MUNICIPAL: sig.cm-seixal.pt '
      + 'MapServer/998 served 480 official buildings over Belverde where OSM held 91 (20.1 % hit rate) — ~308 municipal '
      + 'SIGs with no national index, i.e. a registry-of-registries job, not a bbox door.',
  },
  it_ade: {
    key: 'it_ade', country: 'Italy', status: 'blocked', kind: null,
    reason: 'Agenzia delle Entrate WFS → 403 Akamai edge denial (439 B, "Access Denied … errors.edgesuite.net"), identical '
      + 'with a browser User-Agent; same path on the WMS host → 500 SOAP; ows02.php → 401 "Rejected by policy". THE OTHER '
      + 'PRODUCT SHAPE WAS CHECKED: the AdE WMS is fully open (200, 27,566 B, AccessConstraints "Dato pubblico") and does '
      + 'carry a `fabbricati` layer — but WMS is RASTER and cannot hand over geometry. pcn.minambiente.it Edificato WFS '
      + '→ 500; Lombardia /geoserver/wfs → 404. Italy\'s open vector buildings are REGIONAL (DBT/BDTRE/DBTR).',
  },
  be_urbis: {
    key: 'be_urbis', country: 'Belgium (Brussels)', status: 'blocked', kind: null,
    reason: 'UrbIS GeoServer answers but exposes ONE type: /geoserver/UrbisAdm/wfs GetCapabilities → 200, 93,819 B, '
      + 'TYPENAMES = UrbisAdm:Pz and nothing else. /geoserver/Urbis/wfs → 200, 93,279 B, ZERO <Name> entries; '
      + '/geoserver/ows → "No workspace specified"; urbisadm|urbis|UrbisTopo|UrbisBu|Urbis_Adm → 404; '
      + 'geoservices.irisnet.be/geoserver/wfs → 404; datastore.brussels/geoserver/wfs → 404. Brussels keeps its OSM.',
  },
  fr_cadastre_etalab: {
    key: 'fr_cadastre_etalab', country: 'France (literal cadastre)', status: 'wire-not-build', kind: null,
    reason: 'cadastre.data.gouv.fr / etalab-cadastre vintage 2026-06-01: per-commune and per-département GeoJSON on an OVH '
      + 'S3 mirror. Jouy-en-Josas 78322 batiments.json.gz → 200, 138,882 B → 3,042 features; département 78 → 34,506,194 B; '
      + '102 département dirs; NO national file (404). No height, no storeys, Licence Ouverte. BD TOPO returned 2 buildings '
      + 'over the founder\'s Jouy parcel while the cadastre returns 3,042 for the commune — a SECOND door France needs. '
      + 'Owned by the France lane (fr_bdtopo), not wired here.',
  },
});

/**
 * A `footprintSource` key → the doors it sweeps. A country with more than one register (Belgium)
 * is ONE source with TWO doors rather than two region rows, because the OSM extract and the merge
 * are per-region and Belgium is one region.
 */
export const EU_REGISTER_SOURCES = Object.freeze({
  nl_bag: ['nl_bag'],
  be_registers: ['be_grb', 'be_picc'],
  ie_tailte: ['ie_tailte'],
});

/** The doors behind a source key, in sweep order. Throws on an unknown key — a config error. */
export function euDoorsFor(sourceKey) {
  const keys = EU_REGISTER_SOURCES[sourceKey];
  if (!keys) throw new Error(`euRegisters: unknown footprint source '${sourceKey}'`);
  return keys.map((k) => {
    const d = EU_REGISTER_DOORS[k];
    if (!d || d.status !== 'wired') throw new Error(`euRegisters: door '${k}' is not wired`);
    return d;
  });
}

/** Every probed country that is NOT wired, as `{ country, status, reason }` — for the log/report. */
export function euRefusals(table = EU_REGISTER_DOORS) {
  return Object.values(table)
    .filter((d) => d.status !== 'wired')
    .map((d) => ({ country: d.country, status: d.status, reason: d.reason }));
}

/** The whole-country bbox union a source covers, one entry per door. */
export function euNationalBboxes(sourceKey) {
  return euDoorsFor(sourceKey).map((d) => d.nationalBbox);
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE URL CONSTRUCTION. Everything below here is a total function of its arguments.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The four bbox numbers in the order THIS door wants them — the ONE place axis order is decided.
 * ⛔ See trap A1: NL and BE-Flanders want lat,lon and the wrong order is HTTP 200 with 0 features
 * over the densest cell in the country. France (`frBdtopo.mjs`) wants lon,lat. There is no
 * defensible default, so `axis` is required and an unknown value throws rather than guessing.
 */
export function euBboxToken(door, [w, s, e, n]) {
  if (door.axis === 'latlon') return `${s},${w},${n},${e}`;
  if (door.axis === 'lonlat') return `${w},${s},${e},${n}`;
  throw new Error(`euRegisters: door '${door.key}' declares no axis order`);
}

const wfsBase = (door, cell) => `${door.endpoint}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature`
  + `&TYPENAMES=${encodeURIComponent(door.typeName)}`
  + `&BBOX=${euBboxToken(door, cell)},${door.bboxCrs}`;

/** `RESULTTYPE=hits` — the only reading of a cell's TRUE total (trap A3). */
export function euHitsUrl(door, cell) {
  if (door.kind === 'wfs2') return `${wfsBase(door, cell)}&RESULTTYPE=hits`;
  const [w, s, e, n] = cell;
  return `${door.endpoint}?geometry=${w},${s},${e},${n}&geometryType=esriGeometryEnvelope&inSR=4326`
    + '&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json';
}

/**
 * One page of features as GeoJSON.
 *
 * ⚠ `srsName` is NEVER omitted on a WFS door (trap A2) and `returnZ` is NEVER set on an ArcGIS one:
 * PICC's Z is a per-object constant, not a surface, and requesting it would tempt a later reader to
 * treat it as a height.
 */
export function euPageUrl(door, cell, { startIndex = 0, count = door.pageSize } = {}) {
  const c = Math.min(door.pageSize, Math.max(1, Math.floor(count)));
  const i = Math.max(0, Math.floor(startIndex));
  if (door.kind === 'wfs2') {
    return `${wfsBase(door, cell)}&COUNT=${c}&STARTINDEX=${i}`
      + (door.sortBy ? `&SORTBY=${door.sortBy}` : '')
      + `&srsName=${door.srsName}&OUTPUTFORMAT=application/json`;
  }
  const [w, s, e, n] = cell;
  return `${door.endpoint}?geometry=${w},${s},${e},${n}&geometryType=esriGeometryEnvelope&inSR=4326`
    + '&spatialRel=esriSpatialRelIntersects'
    + `&outFields=${encodeURIComponent(door.outFields ?? '*')}`
    + `&returnGeometry=true&returnZ=false&outSR=4326&resultRecordCount=${c}&resultOffset=${i}`
    + `&orderByFields=${encodeURIComponent(door.orderByFields ?? '')}&f=geojson`;
}

/**
 * The TRUE total for a cell, out of whichever body its door returns.
 *
 * Returns `{ total, atCeiling }`. `total` is `null` for UNKNOWN — a failed or unparseable count is
 * NOT zero. `atCeiling` is true when the server returned exactly its documented saturation value
 * (GRB's literal 10000, trap A4), which means "at least this many", never "this many".
 */
export function euParseHits(door, body) {
  if (door.kind === 'wfs2') {
    const total = parseWfsHits(body);
    return { total, atCeiling: total === door.measuredPageCap && door.key === 'be_grb' };
  }
  let n = null;
  try { n = JSON.parse(body)?.count ?? null; } catch { n = null; }
  return { total: Number.isFinite(n) ? n : null, atCeiling: false };
}

/**
 * One page body → `{ features, matched, more }`.
 *
 * `more` is the ONLY thing the pager may trust for "is there another page", and each door answers
 * it differently — which is precisely why it is computed here once:
 *   • WFS (NL)  — `numberMatched` is `STARTINDEX + numberReturned` (trap A3), so it says nothing
 *                 about what is left. `more` is "the page was full".
 *   • WFS (VL)  — no `numberMatched` at all. Same rule.
 *   • ArcGIS    — `properties.exceededTransferLimit` is the server's own explicit answer, MEASURED
 *                 true on both PICC and Tailte at the 2000-row cap.
 */
export function euParsePage(door, body, { requested = door.pageSize } = {}) {
  let json;
  try { json = JSON.parse(body); } catch { return { status: 'error', reason: `unparseable body (${String(body).slice(0, 120)})` }; }
  const features = Array.isArray(json?.features) ? json.features : [];
  const etl = json?.properties?.exceededTransferLimit ?? json?.exceededTransferLimit ?? null;
  const more = door.kind === 'arcgis'
    ? etl === true
    : features.length >= Math.min(requested, door.measuredPageCap);
  return { status: 'ok', features, more, exceededTransferLimit: etl, raw: json };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORD MAPPING — one register row → the shared footprint record.
// ─────────────────────────────────────────────────────────────────────────────

/** `"2006-11-16"` / `"1980"` / 1980 → 1980. Anything else → null (never 0). */
export function euYear(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1000 && v < 3000 ? Math.trunc(v) : null;
  if (typeof v !== 'string') return null;
  const m = /(\d{4})/.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  return y > 1000 && y < 3000 ? y : null;
}

/** A GeoJSON geometry with any ring of ≥3 vertices? Nothing else is a footprint. */
export function euHasRing(geometry) {
  const t = geometry?.type;
  if (t === 'Polygon') return Array.isArray(geometry.coordinates?.[0]) && geometry.coordinates[0].length >= 3;
  if (t === 'MultiPolygon') return Array.isArray(geometry.coordinates?.[0]?.[0]) && geometry.coordinates[0][0].length >= 3;
  return false;
}

/**
 * ONE register row → the record shape `officialFootprints.mjs` and `frBdtopo.mjs` both use, or
 * `null` when the row must be dropped.
 *
 * §CONTEXT-DATA-HONESTY. **Not one of these four doors publishes a height or a storey count**, and
 * this function does not invent one: `height` is always `null` and `heightKind` is always
 * `'unknown'`. The footprint still ships — the founder's complaint is SHAPE first, and an outline
 * at the client's honest `assumed` default is strictly better than no building at all. Metres come
 * from the height joins that are ALREADY wired over the same ground (`3dbag` for NL, `be_dhmv` for
 * BE) and from nowhere else. The `floors` branch below is dead for today's doors and is kept
 * because it is one line and the next door (LU BD-L-BATI3D, DE LoD2) will use it.
 */
export function euFootprintRecord(door, feature) {
  const p = feature?.properties ?? {};
  const geometry = feature?.geometry;
  if (!euHasRing(geometry)) return null;

  const condition = door.conditionField ? (p[door.conditionField] ?? null) : null;
  if (condition && door.dropConditions?.includes(condition)) return null;

  const floorsRaw = door.floorsField ? Number(p[door.floorsField]) : NaN;
  const floors = Number.isFinite(floorsRaw) && floorsRaw > 0 ? Math.trunc(floorsRaw) : null;
  const heightRaw = door.heightField ? Number(p[door.heightField]) : NaN;

  let height = null;
  let heightKind = 'unknown';
  if (Number.isFinite(heightRaw) && heightRaw > 0) { height = heightRaw; heightKind = 'measured'; }
  else if (floors !== null) { height = floors * OFFICIAL_METRES_PER_FLOOR; heightKind = HEIGHT_KIND_FLOORS; }

  const useRaw = door.useField ? p[door.useField] : null;
  return {
    source: door.key,
    // These registers publish WHOLE-BUILDING outlines, not Catastro-style BuildingParts. Stated,
    // not omitted: `part` drives which tag the feature carries and therefore whether the 2D plan
    // filter sees it at all (`building` vs `building:part`).
    part: false,
    ref: door.idField && p[door.idField] != null ? String(p[door.idField]) : null,
    floors,
    floorsBelow: null,
    floorsKind: floors !== null ? 'register' : null,
    height,
    heightKind,
    use: typeof useRaw === 'string' && useRaw !== '' ? useRaw : null,
    built: door.builtField ? euYear(p[door.builtField]) : null,
    condition,
    geometry,
  };
}

/**
 * Record → the GeoJSON Feature the geojsonseq bake input carries.
 *
 * §OFFICIAL-FOOTPRINT-TAG-CONTRACT — the SAME keys `officialFootprintProps` and `footprintTags`
 * emit, so a tile from this adapter is interchangeable with an ES or FR one and the client's
 * `readOfficialFootprint` reads it with no new branch.
 */
export function euFootprintFeature(rec) {
  const props = { building: rec.use || 'yes' };
  if (Number.isFinite(rec.floors) && rec.floors > 0) props['building:levels'] = rec.floors;
  if (Number.isFinite(rec.height) && rec.height > 0) {
    props[OFFICIAL_TAGS.heightM] = Number(rec.height.toFixed(1));
  }
  props[OFFICIAL_TAGS.heightKind] = rec.heightKind;
  props[OFFICIAL_TAGS.source] = rec.source;
  if (rec.ref) props[OFFICIAL_TAGS.ref] = rec.ref;
  props[OFFICIAL_TAGS.part] = 'false';
  if (rec.floorsKind) props[OFFICIAL_TAGS.floorsKind] = rec.floorsKind;
  if (rec.built) props[OFFICIAL_TAGS.built] = rec.built;
  if (rec.condition) props[OFFICIAL_TAGS.condition] = rec.condition;
  return { type: 'Feature', geometry: stripZ(rec.geometry), properties: props };
}

// ─────────────────────────────────────────────────────────────────────────────
// §EU-NATIONAL-SWEEP — the resumable per-unit sweep. The UNIT is a grid cell of the door's own
// national bbox, NOT a city: a city list is what left the founder's village empty in the first
// place. Mirrors `esCatastroNational.mjs` deliberately, clause for clause, so an operator resuming
// either sweep types the same kind of thing and reads the same kind of sentence.
// ─────────────────────────────────────────────────────────────────────────────

/** Stable key for a cell — the resume cursor's alphabet. Fixed 3dp so the order is lexicographic. */
export function euCellKey([w, s]) {
  const f = (v) => (v < 0 ? '-' : '+') + Math.abs(v).toFixed(3).padStart(7, '0');
  return `${f(w)}${f(s)}`;
}

/** [w,s,e,n] overlap, null-safe. A null bbox NEVER overlaps — it is unknown, not everywhere. */
export function euBboxesOverlap(a, b) {
  if (!a || !b || a.length < 4 || b.length < 4) return false;
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * Every cell of a door's national bbox, ordered: PRIORITY cells (those overlapping a caller-supplied
 * bbox — the region's metros) first, then lexicographically by cell key.
 *
 * `cursor` resumes AT that cell key, inclusive. Priority cells are ALWAYS re-swept regardless of the
 * cursor: they are a rounding error against the nation, and a run that skipped the metros to reach
 * the tail would have the ordering exactly backwards (the same guarantee `catastroSweepOrder` gives).
 */
export function euSweepOrder(door, { priorityBboxes = [], cursor = null, cellDeg = door.cellDeg } = {}) {
  const ranked = tileBboxes(door.nationalBbox, cellDeg).map((cell) => ({
    cell,
    key: euCellKey(cell),
    priority: priorityBboxes.some((b) => euBboxesOverlap(cell, b)),
  }));
  ranked.sort((a, b) => (a.priority === b.priority ? a.key.localeCompare(b.key) : (a.priority ? -1 : 1)));
  if (!cursor) return ranked;
  return ranked.filter((c) => c.priority || c.key.localeCompare(cursor) >= 0);
}

/**
 * Measured seconds per cell, per door. Derived from the page rate and the door's OWN national
 * density — not from a city, which is the bias that made the Spanish 250 s figure wrong for 7,611
 * municipalities (§CATASTRO-MEASURED-INVENTORY).
 *
 *   cells        = area(nationalBbox) / cellDeg²
 *   perCell      = nationalCount / cells            (buildings, mean)
 *   seconds      = hitsSeconds + ceil(perCell / pageSize) × pageSeconds
 *
 * ⚠ Returns `null` when `nationalCount` is null (GRB — the server refuses to say). A null is
 * carried through the plan as UNKNOWN and printed as such; it is never silently treated as cheap.
 */
export const EU_PAGE_SECONDS = Object.freeze({ nl_bag: 1.6, be_grb: 1.9, be_picc: 2.3, ie_tailte: 1.0 });
export const EU_HITS_SECONDS = Object.freeze({ nl_bag: 0.7, be_grb: 0.3, be_picc: 0.4, ie_tailte: 0.4 });

export function euSecondsPerCell(door, { cellDeg = door.cellDeg } = {}) {
  if (!Number.isFinite(door.nationalCount)) return null;
  const [w, s, e, n] = door.nationalBbox;
  const cells = Math.max(1, ((e - w) / cellDeg) * ((n - s) / cellDeg));
  const perCell = door.nationalCount / cells;
  const pages = Math.max(1, Math.ceil(perCell / door.pageSize));
  return (EU_HITS_SECONDS[door.key] ?? 0.5) + pages * (EU_PAGE_SECONDS[door.key] ?? 2);
}

/**
 * How much of an ordered sweep fits in `budgetSeconds`.
 *
 * ⚠ IT STOPS BEFORE THE CELL THAT WOULD OVERRUN, not after it — the same rule as
 * `catastroBudgetPlan`, and for the same reason: a half-written cell has its features already
 * appended while its bbox would still be reported covered, which is §COVERED-IS-PARSED inverted.
 * ⚠ A door with an UNKNOWN per-cell cost (GRB) is planned at the table's most expensive KNOWN cost
 * rather than at zero — an unknown must never buy a cell for free.
 */
export function euBudgetPlan(ordered, { budgetSeconds = 4 * 3600, secondsPerCell = 2 } = {}) {
  const cost = Number.isFinite(secondsPerCell) && secondsPerCell > 0 ? secondsPerCell : 2;
  const planned = [];
  const skipped = [];
  let seconds = 0;
  for (const c of ordered ?? []) {
    if (!c?.priority && seconds + cost > budgetSeconds) { skipped.push(c); continue; }
    planned.push(c);
    seconds += cost;
  }
  return { planned, skipped, seconds: Math.round(seconds), nextCursor: skipped.length ? skipped[0].key : null };
}

/**
 * §COVERED-IS-PARSED — the DELETION SET, derived from what was actually WRITTEN.
 *
 * `kept > 0`, never `status === 'ok'`. This is the rule that keeps BRUSSELS ON THE MAP: a `belgium`
 * bake sweeps GRB over Flanders and PICC over Wallonia, and every cell over the Brussels-Capital
 * Region answers 200 with zero features because neither register covers it (B13). Counting a clean
 * zero as covered would hand `mergeReplaceInBbox` a licence to delete 19 communes' OSM footprints
 * and leave the capital blank. Same for Northern Ireland under `ie_tailte`, and for the North Sea.
 */
export function euCoveredBboxes(areas) {
  const out = [];
  for (const a of areas ?? []) {
    if (!a || !Array.isArray(a.bbox) || a.bbox.length < 4) continue;
    if (!Number.isFinite(a.kept) || a.kept <= 0) continue;
    out.push(a.bbox);
  }
  return out;
}

/** §LOUD-AND-ORDERED-TRUNCATION — the sentence a truncated sweep prints. */
export function formatEuSweepSummary(st) {
  const n = (v) => Number(v ?? 0).toLocaleString('en-US');
  const refused = st.refused?.length
    ? ` ${n(st.refused.length)} cell(s) REFUSED and KEPT THEIR OSM footprints `
      + `(${st.refused.slice(0, 3).map((r) => `${r.key}: ${r.reason}`).join('; ')}${st.refused.length > 3 ? '; …' : ''}).`
    : '';
  if (st.stopReason === 'complete') {
    return `${st.source} sweep COMPLETE — ${n(st.covered)} cell(s) produced footprints of ${n(st.total)} swept.${refused}`;
  }
  return `⚠ ${st.source} sweep TRUNCATED (${st.stopReason}) — ${n(st.covered)} cell(s) produced footprints of `
    + `${n(st.total)}; ${n(st.skipped)} SKIPPED. Skipped ground KEEPS its OSM footprints (§COVERED-IS-PARSED — `
    + `it is absent from the deletion set, not emptied).${refused} `
    + `RESUME with EU_SWEEP_CURSOR=${st.nextCursor ?? '(none)'} (cell key). `
    + 'Priority cells are swept UNCAPPED on every run and are unaffected.';
}

/**
 * The national switch and its resume cursor, read from the environment — the shape
 * `catastroSweepEnv` established, so an operator resuming either sweep types the same kind of thing.
 *
 *   EU_REGISTER_NATIONAL=1        sweep the whole national bbox instead of the region's bboxes
 *   EU_SWEEP_CURSOR=<cell key>    resume AT that cell (from the previous run's summary)
 *   EU_BUDGET_SECONDS=<n>         wall-clock the pull may spend (default 4 h)
 *
 * ⚠ DEFAULTS ARE THE EXISTING BEHAVIOUR: with none of these set the sweep is OFF and only the
 * region's declared bboxes are pulled. Safe to land before any national bake has been dispatched.
 */
export function euSweepEnv(env = process.env) {
  const national = env.EU_REGISTER_NATIONAL === '1' || env.EU_REGISTER_NATIONAL === 'true';
  const budget = Number(env.EU_BUDGET_SECONDS);
  return {
    national,
    cursor: env.EU_SWEEP_CURSOR || null,
    ...(Number.isFinite(budget) && budget > 0 ? { budgetSeconds: budget } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK HALF. Everything above is a total function of its arguments and is what the spec pins.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every standing building in ONE cell, as footprint records.
 *
 * ⛔ THE STOP CONDITION IS NOT `startIndex >= numberMatched`. See trap A3: on a PDOK page that
 * expression is true after page one, always, and would ship 0.5 % of Amsterdam while reporting the
 * cell complete. We stop when the door says there is no more (`more === false`), when a page comes
 * back empty, or when we have reached the `hits` total — which is the only trustworthy total.
 */
export async function euFetchCell(door, cell, { pageSize = door.pageSize, maxPages = 400, hitsTotal = null, ...http } = {}) {
  const out = { status: 'ok', cell, records: [], pages: 0, matched: hitsTotal, dropped: 0, duplicates: 0 };
  const seen = new Set();
  let startIndex = 0;
  for (let page = 0; page < maxPages; page++) {
    const r = await httpGetText(euPageUrl(door, cell, { startIndex, count: pageSize }), http);
    if (r.status !== 'ok') return { ...out, status: 'error', reason: `page ${page} @${startIndex}: ${r.reason}` };
    const parsed = euParsePage(door, r.body, { requested: pageSize });
    if (parsed.status !== 'ok') return { ...out, status: 'error', reason: `page ${page} @${startIndex}: ${parsed.reason}` };
    out.pages++;
    for (const f of parsed.features) {
      const id = door.idField ? (f?.properties?.[door.idField] ?? f?.id ?? null) : (f?.id ?? null);
      if (id !== null && seen.has(id)) { out.duplicates++; continue; }
      if (id !== null) seen.add(id);
      const rec = euFootprintRecord(door, f);
      if (!rec) { out.dropped++; continue; }
      out.records.push(rec);
    }
    if (parsed.features.length === 0) break;
    startIndex += parsed.features.length;
    if (!parsed.more) break;
    if (Number.isFinite(hitsTotal) && hitsTotal > 0 && startIndex >= hitsTotal) break;
  }
  return out;
}

/**
 * One cell end to end: the `hits` probe (the only true total) then the pages.
 *
 * The hits probe is not decoration — it is the ONLY reading that can tell a genuinely empty cell
 * (Brussels under GRB, the North Sea under BAG) from a cell whose paging stopped early, and the two
 * must never be confused because the first keeps its OSM and the second is a bug.
 */
export async function euSweepCell(door, cell, opts = {}) {
  const h = await httpGetText(euHitsUrl(door, cell), opts);
  let hits = { total: null, atCeiling: false };
  if (h.status === 'ok') hits = euParseHits(door, h.body);
  // A refused count is UNKNOWN, not zero: page anyway and let the pages answer.
  if (hits.total === 0) return { status: 'ok', cell, records: [], pages: 0, matched: 0, dropped: 0, duplicates: 0, hits };
  const r = await euFetchCell(door, cell, { ...opts, hitsTotal: hits.atCeiling ? null : hits.total });
  return { ...r, hits };
}

/**
 * Write one source's official footprints for `bboxes` into ONE GeoJSONSeq at `outPath`.
 *
 * Returns EXACTLY the field set `applyNationalFootprints` drives both existing countries through —
 * `{ status, written, measured, floorsDerived, unknown, cells, cellsFailed, areas, coveredBboxes }`
 * — so ES, FR and these four doors share one code path and none can acquire a private branch.
 *
 * ⚠ `measured` IS ALWAYS 0 HERE, and that is the honest answer rather than a gap: none of these
 * four registers publishes a height or a storey count (section B). Counting a footprint with no
 * height as `measured` would rank it above a real OSM survey — the honesty inversion C57 §1.9 bans.
 */
export async function writeEuRegisterWorkingSet(sourceKey, outPath, bboxes, {
  onArea = () => {}, national = false, priorityBboxes = [], cursor = null, budgetSeconds = 4 * 3600,
  cellDeg = null, ...http
} = {}) {
  const doors = euDoorsFor(sourceKey);
  writeFileSync(outPath, '');

  const areas = [];
  const refused = [];
  let written = 0, unknown = 0, floorsDerived = 0, cellsFailed = 0, cellsTotal = 0, skippedTotal = 0;
  let nextCursor = null;
  const startedAt = Date.now();

  for (const door of doors) {
    const deg = cellDeg ?? door.cellDeg;
    let ordered;
    if (national) {
      ordered = euSweepOrder(door, { priorityBboxes, cursor, cellDeg: deg });
    } else {
      // Region-declared working set: tile each declared bbox with this door's cell size and keep
      // only the cells that actually intersect the door's own country. Sweeping GRB over Wallonia
      // is not wrong — it returns zero and keeps its OSM — but it is 2,000 wasted requests.
      ordered = [];
      for (const raw of bboxes ?? []) {
        const box = typeof raw === 'string' ? raw.split(',').map(Number) : raw;
        if (!euBboxesOverlap(box, door.nationalBbox)) continue;
        for (const cell of tileBboxes(box, deg)) {
          if (!euBboxesOverlap(cell, door.nationalBbox)) continue;
          ordered.push({ cell, key: euCellKey(cell), priority: true });
        }
      }
    }
    const plan = euBudgetPlan(ordered, { budgetSeconds, secondsPerCell: euSecondsPerCell(door, { cellDeg: deg }) ?? 3 });
    if (plan.nextCursor && !nextCursor) nextCursor = plan.nextCursor;
    skippedTotal += plan.skipped.length;
    cellsTotal += ordered.length;

    for (const c of plan.planned) {
      // The live wall-clock guard. The plan above is an ESTIMATE from measured rates; this is the
      // truth, and a sweep that overran its estimate must still stop cleanly with a cursor rather
      // than be killed mid-cell by the job timeout.
      if (!c.priority && (Date.now() - startedAt) / 1000 > budgetSeconds) {
        skippedTotal++;
        if (!nextCursor) nextCursor = c.key;
        continue;
      }
      const before = written;
      let res;
      try { res = await euSweepCell(door, c.cell, http); }
      catch (e) { res = { status: 'error', reason: String(e?.message ?? e) }; }
      if (res.status !== 'ok') {
        cellsFailed++;
        refused.push({ key: c.key, reason: res.reason });
      } else {
        const feats = res.records.map((rec) => euFootprintFeature(rec));
        if (feats.length) written += appendFeaturesSeq(outPath, feats);
        for (const rec of res.records) {
          if (rec.heightKind === HEIGHT_KIND_FLOORS) floorsDerived++;
          else unknown++;
        }
      }
      const area = {
        area: `${door.key}:${c.key}`,
        // §COVERED-IS-PARSED — the cell's own bbox travels with its OUTCOME, so the deletion set is
        // derived from what was written, never from what was requested.
        bbox: c.cell,
        status: res.status === 'ok' ? 'ok' : 'error',
        reason: res.status === 'ok' ? null : res.reason,
        kept: written - before,
        measured: 0,
        floorsDerived: 0,
        unknown: written - before,
        dropped: res.dropped ?? 0,
        cells: 1,
        cellsFailed: res.status === 'ok' ? 0 : 1,
      };
      areas.push(area);
      onArea(area.area, area);
    }
  }

  const coveredBboxes = euCoveredBboxes(areas);
  writeCoveredManifest(outPath, coveredBboxes);
  const sweep = formatEuSweepSummary({
    source: sourceKey,
    total: cellsTotal,
    covered: coveredBboxes.length,
    skipped: skippedTotal,
    nextCursor,
    stopReason: skippedTotal ? 'budget' : 'complete',
    refused,
  });
  console.log(`  ${sweep}`);

  if (written === 0) {
    return {
      status: 'error', written: 0, measured: 0, floorsDerived: 0, unknown: 0,
      cells: cellsTotal, cellsFailed, areas, coveredBboxes, sweep, refused,
      reason: `swept ${cellsTotal} cell(s) across ${doors.length} door(s) and produced ZERO footprints`,
    };
  }
  return {
    status: cellsFailed > 0 || skippedTotal > 0 ? 'partial' : 'ok',
    written, measured: 0, floorsDerived, unknown,
    cells: cellsTotal, cellsFailed, areas, coveredBboxes, sweep, refused,
    bytes: existsSync(outPath) ? statSync(outPath).size : 0,
  };
}

/**
 * The `FOOTPRINT_SOURCES` row bake.mjs registers, for one source key.
 *
 * ⚠ `write`'s PARAMETER ORDER IS THE CONSUMER'S — `(outPath, bboxes, onArea)`, exactly as
 * `applyNationalFootprints` calls it and exactly as the `fr_bdtopo` and `es_catastro` rows declare
 * it. That signature was silently inverted once already (footprintMerge.mjs's own note), so it is
 * restated here rather than assumed.
 *
 * ⚠ `optIn: 'footprints'` — these pulls are national sweeps and may not run unasked, the same rule
 * the Catastro row carries. Absent `--footprints official` the table is never entered and every
 * existing bake is byte-identical.
 */
export function euRegisterFootprintSource(sourceKey) {
  const doors = euDoorsFor(sourceKey);
  return Object.freeze({
    label: doors.map((d) => d.label).join(' + '),
    attribution: doors.map((d) => d.attribution).join(' · '),
    optIn: 'footprints',
    defaultBboxes: () => doors.map((d) => d.nationalBbox),
    write: (outPath, bboxes, onArea) => writeEuRegisterWorkingSet(sourceKey, outPath, bboxes, {
      onArea,
      ...euSweepEnv(),
      priorityBboxes: Array.isArray(bboxes) ? bboxes.map((b) => (typeof b === 'string' ? b.split(',').map(Number) : b)) : [],
    }),
  });
}

/** The wired source keys, for `FOOTPRINT_SOURCE_KEYS` and the config assertion. */
export const EU_FOOTPRINT_SOURCE_KEYS = Object.freeze(Object.keys(EU_REGISTER_SOURCES));

/**
 * The measured runtime projection for one source's WHOLE national sweep — the number the dispatch
 * list quotes. Honest about UNKNOWN: a door whose national count the server refuses to give
 * (GRB, trap A4) contributes `null` and the total is reported as "at least".
 */
export function euNationalProjection(sourceKey) {
  const doors = euDoorsFor(sourceKey);
  let seconds = 0;
  let unknownDoors = 0;
  let buildings = 0;
  for (const d of doors) {
    if (!Number.isFinite(d.nationalCount)) { unknownDoors++; continue; }
    buildings += d.nationalCount;
    const pages = Math.ceil(d.nationalCount / d.pageSize);
    seconds += pages * (EU_PAGE_SECONDS[d.key] ?? 2);
  }
  return {
    source: sourceKey,
    buildings,
    hours: Number((seconds / 3600).toFixed(1)),
    unknownDoors,
    atLeast: unknownDoors > 0,
  };
}
