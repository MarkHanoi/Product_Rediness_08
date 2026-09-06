// ─────────────────────────────────────────────────────────────────────────────
// §NATIONAL-HEIGHTS-ASSESSED (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the countries this lane was
// asked to take WHOLE-COUNTRY and could NOT, each with the probe that says why and the service's own
// answer, verbatim.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
// "Heights fail in 60 of 61 countries" is the ledger's top blocker, and the expensive part of closing
// it is not writing joins — it is DISCOVERING whether a national door exists. That discovery is worth
// exactly as much as the joins are, and it evaporates unless it is written down: the next lane
// otherwise re-probes the same nine hosts and re-learns the same nine answers.
//
// ⛔ AND A REFUSAL RECORDED WITHOUT ITS ANSWER IS WORSE THAN NO RECORD. "Ireland has no open LiDAR" is
//    the kind of sentence that gets copied forward and rots (this repo's §GETCAPABILITIES-IS-NOT-AN-
//    INVENTORY and §BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS lessons: nine of fourteen Spanish "blockers"
//    turned out to be refusals about the WRONG PRODUCT). So every row below carries the URL, the HTTP
//    status, the content type, the byte count and the discriminating field — enough for the next
//    reader to overturn it in one command rather than trust it.
//
// ⭐ THE MOST USEFUL ROW HERE IS `ireland`, AND IT IS THE ONE MOST EASILY GOT WRONG. Geological Survey
//    Ireland publishes NINE ArcGIS ImageServers under `imagehost/rest/services/Lidar`, CC BY 4.0,
//    keyless, named DSM and DTM. A join that saw "DSM ImageServer, exportImage, TIFF" would decode
//    them happily and stamp numbers that look like metres. They are `pixelType: U8` — EIGHT-BIT
//    HILLSHADES ("_HS_" in every service name). That is the exact defect `cuzkServiceVerdict` was
//    written to refuse ("an 8-bit rendered service would decode fine and stamp garbage"), and it is
//    why the verdict here is REFUSED-WITH-A-DOOR rather than "no source".
//
// The four countries this lane DID take national (netherlands / czechia / austria / france) are rows
// too, so the file reads as a complete answer to its half of the brief rather than as a list of
// failures. Their evidence lives in their own modules' headers; the row points at it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `status` values, and what each one licenses the next lane to do:
 *   'wired-national'   — the join's retain set IS the country. Nothing owed here.
 *   'wired-partial'    — a real measured join exists but reaches only part of the country, and the
 *                        REST is a different publisher. Widening it is a NEW adapter, not a bigger bbox.
 *   'refused-rendered' — the national service exists and is open, but serves RENDERED pixels (U8
 *                        hillshade, PNG/JPEG). Decodable, and therefore DANGEROUS: it would stamp
 *                        plausible garbage. ⛔ Never wire one.
 *   'refused-coarse'   — the only national elevation is too coarse, or is terrain-only, to yield a
 *                        building height. A 50 m DTM cannot be differenced into a roof.
 *   'refused-bulk'     — the data is open and measured, but only as a whole-country download far too
 *                        large for a bake run. A different pipeline (one-time bake into R2), not a join.
 *   'unreachable'      — the host did not answer. UNKNOWN, never "empty" (§CONTEXT-DATA-HONESTY).
 *   'wired-national-gated' — ⭐ ADDED 2026-09-06 (lane HEIGHTS-LAST-NINE), and it exists because
 *                        'wired-national' would have been a lie by omission for Denmark. The retain set
 *                        IS the country and the sweep is real — but the SOURCE needs a credential this
 *                        repo may or may not hold, so NOTHING is measured until the secret exists. The
 *                        ceiling is removed; the door is still shut. Stretching 'wired-national' to
 *                        cover it would let a reader conclude that Danish buildings carry measured
 *                        heights today. They do not.
 *   'not-done-shape'   — ⭐ THE HONEST ONE, and it earns its own value rather than hiding inside
 *                        'wired-partial'. The SOURCE is national and open and already wired; what is
 *                        missing is OUR sweep shape. There is no probe here because there is nothing to
 *                        refuse — recording a fabricated 'measurement' to satisfy a table's own rule
 *                        would be the exact dishonesty the table exists to prevent. A row with this
 *                        status must name the missing PIECE instead.
 */
export const NATIONAL_HEIGHTS_ASSESSED = [
  // ── TAKEN NATIONAL BY THIS LANE ───────────────────────────────────────────────────────────────
  { country: 'NL', region: 'netherlands', status: 'wired-national', join: '3dbag', probedAt: '2026-09-06',
    evidence: 'heights/nl3dbagStamp.mjs §NL-3DBAG-NATIONAL-SWEEP — BAG3D:lod12 hits outside the six cities: '
      + 'Maastricht 5,294 · Leeuwarden 10,303 · Enschede 10,050 · Middelburg 8,230 · Den Bosch 190, all HTTP 200.' },
  { country: 'CZ', region: 'czechia', status: 'wired-national', join: 'cuzk_cz', probedAt: '2026-09-06',
    evidence: 'heights/czHeightsStamp.mjs §CUZK-NATIONAL-SWEEP — dmp1g exportImage at Liberec / České Budějovice / '
      + 'Zlín / Cheb, all HTTP 200 image/tiff, 131,912 B, ~0.56 s.' },
  { country: 'AT', region: 'austria', status: 'wired-national', join: 'bev_at', probedAt: '2026-09-05',
    evidence: "heights/atHeights.mjs — BEV's INSPIRE ATOM service feed lists 55/55 DSM and 55/55 DTM 50 km COG "
      + 'tiles covering Austria. The join opened five city boxes out of them until §BEV-NATIONAL-SWEEP.' },
  { country: 'FR', region: 'france', status: 'wired-national', join: 'mnh_fr', probedAt: '2026-09-06',
    evidence: 'heights/mnhFrNationalStamp.mjs §MNH-FR-NATIONAL-SWEEP — IGN dalle hits far from the thirteen: '
      + 'Dordogne 105 · Clermont 108 · Nancy 106 · Dunkerque 64 · inland Corsica 115 · Vannes 0 (a REAL empty).' },

  // ── NOT TAKEN NATIONAL, WITH THE MEASUREMENT THAT SAYS WHY ────────────────────────────────────
  {
    country: 'IE', region: 'ireland', status: 'refused-rendered', join: null, probedAt: '2026-09-06',
    door: 'https://gsi.geodata.gov.ie/imagehost/rest/services/Lidar',
    reason:
      'Geological Survey Ireland DOES publish open (CC BY 4.0) keyless ArcGIS ImageServers for LiDAR — the '
      + 'data.gov.ie dataset "Open Topographic Lidar Data" names them — and the folder listing answered HTTP 200 '
      + 'application/json, 834 B, 0.45 s with NINE ImageServers. ⛔ EVERY ONE IS A HILLSHADE. `?f=json` on the '
      + 'three national-scale candidates: IE_GSI_Photogrammetry_DSM_HS_GSI_25cm_IE26_ITM → pixelType "U8", 1 band, '
      + '0.25 m, wkid 2157; IE_GSI_LiDAR_DTM_HS_GSI_Phase2_1m_IE26_ITM → "U8", 1 m; IE_GSI_LiDAR_DTM_HS_OPW_2m_IE26_ITM '
      + '→ "U8", 2 m. "HS" is in every service name. An 8-bit shaded-relief raster decodes fine and would stamp '
      + 'plausible garbage (the exact case cuzkServiceVerdict refuses). And the extents do not even pair: the 25 cm '
      + 'DSM covers ITM 430,961–727,982 E × 596,862–766,354 N, the 1 m DTM only 512,000–604,000 × 694,000–768,000. '
      + 'The gsi.geodata.gov.ie/server/rest/services/Lidar folder holds COVERAGE FOOTPRINT layers (Feature/MapServer), '
      + 'not rasters. NEXT STEP: ask GSI for the float service, or read the per-tile GeoTIFFs the web app downloads.',
  },
  {
    country: 'PT', region: 'portugal', status: 'refused-coarse', join: null, probedAt: '2026-09-06',
    door: 'https://geo2.dgterritorio.gov.pt/geoserver/wms',
    reason:
      "DGT's GeoServer answers WMS 1.3.0 GetCapabilities HTTP 200 text/xml, 133,856 B, 0.42 s, with 159 layers and "
      + '`image/geotiff` among its GetMap formats — so the SHAPE is right. The CONTENT is not: the only elevation '
      + 'layers are `altimetria:Cota_altimetrica` (spot heights), `altimetria:Curva_de_nivel` (contours) and '
      + '`MDT50m:MDT50m` — a 50 m TERRAIN model. There is no surface model to difference, and 50 m cannot resolve a '
      + 'building at all. WCS is off: version=2.0.1 AND version=1.0.0 both return HTTP 200 application/xml, 568 B, an '
      + '`ows:ExceptionReport exceptionCode="NoApplicableCode"`. cartografia.dgterritorio.gov.pt/wcs/mdt and '
      + '/arcgis/rest/services → HTTP 404 text/html 196 B. NEXT STEP: the 2018 national LiDAR is a DGT product; find '
      + 'its distribution (not on this GeoServer).',
  },
  {
    country: 'LU', region: 'luxembourg', status: 'refused-bulk', join: null, probedAt: '2026-09-06',
    door: 'https://data.public.lu/api/1/datasets/?q=lidar',
    reason:
      'Luxembourg is the best-documented refusal here, because the data is unambiguously OPEN and unambiguously '
      + 'UNREACHABLE FROM A BAKE. (a) `wms.geoportail.lu/opendata/service` GetCapabilities → HTTP 200 text/xml, '
      + '49,503 B, 0.41 s, and it DOES carry `lidar_2019_mns_public` + `lidar_2019_mnt_public` over the whole country '
      + '(EX_GeographicBoundingBox 5.720–6.546 E, 49.438–50.185 N) — but its ONLY GetMap formats are `image/jpeg` and '
      + '`image/png`. Rendered, not metres. (b) WCS: `?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1` → HTTP 400 '
      + 'text/xml 515 B. (c) The float rasters exist as ONE national CC0 zip each: '
      + 'ACT2019_MNS_EPSG2169.zip → HEAD HTTP 200 application/x-zip-compressed, **Content-Length 27,963,792,148** '
      + '(27.96 GB), with an MNT sibling. (d) ⭐ A NATIONAL 3D BUILDING DATABASE EXISTS AND IS CC0 — "Base de données '
      + 'nationale des bâtiments 3D 2023" (LoD 2.2, photogrammetric, EMQ ≤ 20 cm) — but its cheap resources are '
      + 'FOOTPRINTS ONLY: act2023-buildings3d-footprints.zip (46,439,846 B, downloaded and read here) is 256 MB of '
      + 'GeoJSON whose properties are OBJECTID / BuildingID / Source / Area / gml_id / SHAPE_Length / SHAPE_Area — '
      + 'NO height field; the polygon Z is a single constant per building. The heights live in the 3D multipatch '
      + 'GDB (act2023v2-buildings.gdb.zip, 7,336,977,332 B) or in ~100 per-commune zips. NEXT STEP: this is a '
      + 'ONE-TIME BAKE (extract heights once, publish a small join table), not a per-run join. LU is otherwise ONE '
      + 'condition from COMPLETE, so it is the cheapest country on the board to finish.',
  },
  {
    country: 'BE', region: 'belgium', status: 'wired-partial', join: 'be_dhmv', probedAt: '2026-09-06',
    door: 'https://geoservices.wallonie.be/arcgis/rest/services/RELIEF',
    reason:
      'The wired join (DHMV II DSM − DTM) is FLANDERS ONLY, so a whole-Belgium retain set would spend requests on '
      + 'ground its source does not serve — which is why this lane did NOT widen it. Wallonia has the data: the SPW '
      + 'REST folder answers HTTP 200 application/json, 1,022 B, 0.24 s and lists WALLONIE_MNS_2021_2022, '
      + 'WALLONIE_MNT_2021_2022 (plus the 2013–2014 pair). ⛔ ALL FIFTEEN ARE `MapServer`, NOT `ImageServer`: '
      + '`.../WALLONIE_MNS_2021_2022/ImageServer?f=json` → HTTP 200 with the body '
      + '`{"error":{"code":404,"message":"Service not found","details":[]}}`. A MapServer renders; it does not export '
      + 'F32. Brussels: geoservices-urbis.irisnet.be/geoserver/wfs GetCapabilities → HTTP 200 application/xml but only '
      + '500 B (an exception-sized body, not a capabilities document) — UNKNOWN, re-probe. NEXT STEP: a Wallonia '
      + 'adapter is a NEW door kind (MapServer identify, or the SPW tile downloads), not a wider bbox on DHMV.',
  },
  {
    country: 'GB', region: 'greatbritain', status: 'wired-partial', join: 'ealidar_gb', probedAt: '2026-09-06',
    door: 'https://datamap.gov.wales/geoserver/ows',
    reason:
      'The wired join (EA First-Return DSM − DTM) is ENGLAND ONLY and refuses Scottish squares before requesting '
      + 'them. RE-MEASURED TODAY, and both devolved refusals STAND. Wales: DataMapWales WCS 2.0.1 GetCapabilities now '
      + 'ANSWERS — HTTP 200 application/xml, 565,889 B, 10.44 s (the 2026-09-05 note recorded a timeout) — and it '
      + 'advertises exactly NINE coverages, every one a NOISE map: cog_WG_{IN,RD,RL}_{L16H,LDEN,LNGT}_All. No '
      + 'elevation coverage at all. Scotland: srsp-catalog.jncc.gov.uk still times out (curl exit 28 after 21.2 s); '
      + 'remotesensingdata.gov.scot answers HTTP 200 text/html 7,309 B — a JS app with no machine door behind it. '
      + '⭐ The Welsh answer CHANGED (timeout → 200) without changing the verdict; that is why the probe is recorded '
      + 'rather than the conclusion.',
  },
  {
    country: 'DE', region: 'germany', status: 'wired-partial', join: 'lod2de', probedAt: '2026-09-06',
    door: 'heights/deLod2Laender.mjs',
    reason:
      '⭐ THIRTEEN of sixteen Länder are wired behind one router as of 2026-09-06 (lane DE-HEIGHTS-BEYOND-'
      + 'SIXTEEN-BBOXES armed `by`), and Bayern is the FIRST Land served by MORE THAN ONE CITY — the working '
      + 'set is now 17 cities over 13 Länder. Germany is still TWO steps from national and the SECOND step is '
      + 'barely begun: arm the remaining Länder, THEN widen each to its own extent. Eleven wired Länder are '
      + 'still ONE city each. ⛔ SO `germany` REMAINS `wired-partial`, AND THE WORD MEANS SOMETHING SMALLER '
      + 'THAN IT SOUNDS: measured LoD2 heights exist inside 17 CITY BBOXES and NOWHERE ELSE IN GERMANY. Outside '
      + 'them a footprint keeps its original OSM tags, which for most of the country is no height at all. That '
      + 'is exactly the defect the founder reported from Nürnberg, and arming BY fixed it for five Bavarian '
      + 'cities — not for Bavaria, and not for Germany. '
      + '⚠ THE BAYERN READING PREVIOUSLY IN THIS ROW WAS WRONG, AND IS CORRECTED HERE RATHER THAN DELETED. It '
      + 'read `download1.bayernwolke.de/a/lod2/` → HTTP 403 text/html 146 B and called it "a listing refusal, '
      + 'not an absence". The observation was right and THE CONCLUSION DRAWN FROM IT WAS THE MISTAKE: that 403 '
      + 'is the DIRECTORY INDEX declining to list, measured at a path that serves no data, and it was never '
      + 'evidence about the tiles. RE-PROBED 2026-09-06 ONE LEVEL DOWN: all 69 candidate 2 km tiles over the '
      + 'five Bavarian working-set cities answer HEAD 200 (nürnberg 20/20, münchen 12/12, augsburg 16/16, '
      + 'würzburg 9/9, regensburg 12/12; 334,607 – 161,627,079 B; 5.29 GB total; Accept-Ranges: bytes), while '
      + 'off-Land 300_5300.gml and 400_5990.gml both answer 404 — two distinguishable answers, so an absent '
      + 'tile here is honestly absent. The metalink feed the earlier note read as "wrong path shape, so '
      + 'UNKNOWN" is real, but it is keyed by Gemeinde AGS and not by tile, so it can never answer "does tile '
      + 'e,n exist"; the index kind is therefore `head-probe` gated by both controls, exactly as BW. Licence '
      + 'CC BY 4.0, keyless. '
      + 'STILL OPEN, unchanged and NOT softened: `he` Hessen BLOCKED (gds.hessen.de Downloadcenter is '
      + 'registration-gated, and the keyless gds-srv WMS carries no LoD2/3D layer among its 46). `hb` Bremen '
      + 'PROBED-OPEN-UNSUPPORTED (open, keyless, and its b3dm batch table really does carry measuredHeight — '
      + 'it is 3D Tiles rather than CityGML, so it needs a new door KIND: a BUILD, not a barrier). `sl` '
      + 'Saarland UNPROBED (geoportal.saarland.de answers 200, but its catalogue search is CLIENT-SIDE and '
      + 'returned a byte-identical page to three different queries — the query never ran, so this is UNKNOWN, '
      + 'not empty).',
  },
  {
    // ⭐ PROMOTED 2026-09-06 (lane HEIGHTS-LAST-NINE) from 'not-done-shape'. The previous row read
    // "NOT REFUSED — NOT DONE … the blocker is shape, not data … a tile-key ordinal", and named the
    // shared kernel's missing piece. That ordinal now exists (`nativeTileGrid`, heights/nationalSweep.mjs
    // §NATIVE-TILE-GRID) and `stampBboxesFor` returns SWISS_NATIONAL_BBOXES.
    country: 'CH', region: 'switzerland', status: 'wired-national', join: 'swiss', probedAt: '2026-09-06',
    evidence: 'heights/swissNationalStamp.mjs §SWISS-NATIONAL-SWEEP — five 0.02° boxes in NONE of the nine cities, '
      + 'both products, four acquisition years: DSM Chur HTTP 200 22,856 B 0.596 s 10 items · Sion 13,856 B 6 items · '
      + 'Bellinzona 13,863 B 6 items · Davos 22,866 B 10 items · Appenzell 22,874 B 10 items; DTM Chur HTTP 200 29,886 B '
      + '10 items / 10 `_2_2056_*.tif` assets, Davos 29,896 B 10 assets. Collection extent (HTTP 200, 1,819 B) '
      + '[[5.9503666, 45.7213375, 10.4998461, 47.8216742]]. Ordinal control: LV95 2683189,1248069 → tile key 2683-1248.',
  },
  {
    country: 'IT', region: 'italy', status: 'unreachable', join: null, probedAt: '2026-09-06',
    door: 'http://wms.pcn.minambiente.it/ogc',
    reason:
      "Italy publishes elevation REGIONALLY, and the national aggregator did not answer: the Geoportale Nazionale WMS "
      + '→ HTTP 500 text/html 530 B; gn.mase.gov.it/portale/ → HTTP 301 with an empty body; Lombardia '
      + '`cartografia.servizirl.it/arcgis4/rest/services?f=json` → HTTP 200 but only 260 B (not a service listing); '
      + '`cartografia.regione.lombardia.it/ArcGIS10/services` → no response in 40 s (curl exit 28). ⛔ THIS IS '
      + '"UNKNOWN", NOT "ITALY HAS NO OPEN LIDAR" — several Regioni (Lombardia, Emilia-Romagna, Toscana, Veneto, '
      + 'Piemonte, Trentino, Alto Adige, Sardegna) are known to publish LiDAR, and none of them was reached today. '
      + 'The honest shape for IT is a per-REGIONE router, exactly like DE\'s per-Land one — a subsystem, not a row.',
  },
  {
    country: 'KR', region: 'southkorea', status: 'unreachable', join: null, probedAt: '2026-09-06',
    door: 'https://api.vworld.kr/req/data (V-World 공간정보 오픈플랫폼)',
    reason:
      'SOUTH KOREA IS "UNKNOWN", NOT "NO SOURCE" — and the distinction is the whole value of this row. Korea '
      + 'demonstrably HAS national building-height data: the 건축물대장 (building register, 층수/높이 per building) and '
      + "V-World's 3D building layer. Neither could be reached from here on 2026-09-06, and the answers are: "
      + '(1) V-World — SEVEN probes across THREE hosts, every one refused at the ORIGIN: '
      + '`api.vworld.kr/req/data?...&data=LP_PA_CBND_BUBUN` → curl exit 52 "Empty reply from server"; '
      + '`api.vworld.kr/req/wfs` → HTTP 502 text/html 107 B; `api.vworld.kr/req/wms?REQUEST=GetCapabilities` → '
      + 'curl exit 52; `api.vworld.kr/req/address` → curl exit 52; `www.vworld.kr/` → HTTP 502 107 B; '
      + '`www.vworld.kr/dev/v4dv_2ddataguide2_s001.do` (the API docs page itself) → HTTP 502 107 B; '
      + '`map.vworld.kr/` → HTTP 502 107 B. ⭐ TCP AND TLS SUCCEEDED EVERY TIME (curl -v: "Trying '
      + '211.188.33.95:443", "SSL/TLS connection renegotiated", then "< HTTP/1.1 502 Bad Gateway"), so this is an '
      + 'UPSTREAM/ORIGIN outage or block, NOT a DNS failure and NOT a network egress block — dns.google resolves '
      + 'api.vworld.kr to 211.188.33.95. ⛔ RE-PROBE BEFORE BELIEVING THIS ROW: a 502 is transient by nature. '
      + '(2) `nsdi.go.kr` and `openapi.nsdi.go.kr` — the 국가공간정보포털 cited by most documentation — DO NOT RESOLVE '
      + 'AT ALL (dns.google: "Non-existent domain"). That door is gone, not shut. '
      + '(3) The national open-data gateways ARE up and are KEYED, which is a different and better answer than a '
      + '502: `api.odcloud.kr/api` → HTTP 401 application/json 60 B, body {"code":-401,"msg":"인증키는 필수 항목 '
      + '입니다."} ("an authentication key is a required field"); `apis.data.go.kr/` → HTTP 400 application/xml '
      + '292 B, NO_OPENAPI_SERVICE_ERROR (a wrong path, i.e. the gateway itself answers). A data.go.kr 서비스키 is '
      + 'free on registration, so the 건축물대장 route is a §KEYED-LEG away, not a dead end. '
      + '⚠ WHAT KOREA BAKES TODAY, MEASURED so nobody mistakes it for coverage: OSM tags only. A '
      + '0.015°×0.010° Jongno / central-Seoul rectangle (live Overpass, 2026-09-06, HTTP 200 application/json '
      + '288,544 B) holds 2,038 OSM building ways, of which 104 carry `height` (5.1 %) and 138 carry '
      + '`building:levels` (6.8 %). ~93 % of central-Seoul buildings therefore bake at a fabricated default. '
      + 'That is the gap; it is not closed and is not claimed to be.',
  },

  // ── LANE HEIGHTS-LAST-NINE, 2026-09-06 ── the NINE joins that still had CITY-LIST working sets after the
  //    two lanes above. Two are taken national HERE (CH above, DK below); the rest carry the measurement
  //    that says why not, and TWO of those measurements are FINDINGS rather than refusals — Japan and
  //    Canada each have a real national door that nobody had opened. ⛔ A row here is never "no source":
  //    it is the exact answer a named host gave on a named day.
  {
    country: 'DK', region: 'denmark', status: 'wired-national-gated', join: 'dhm', probedAt: '2026-09-06',
    door: 'https://api.dataforsyningen.dk/dhm_wcs_DAF',
    reason:
      'The retain set IS Denmark as of this lane (`stampBboxesFor` → DHM_NATIONAL_BBOXES, §DHM-NATIONAL-SWEEP), '
      + 'and the publisher declares the reach in a KEYLESS capabilities document even though the pixels are gated: '
      + 'GetCapabilities → HTTP 200 text/xml;charset=utf-8, 2,170 B, 0.28 s, `<fees>NONE</fees>`, '
      + '`<accessConstraints>NONE</accessConstraints>`, offering BOTH `dhm_terraen` AND `dhm_overflade` over '
      + 'lonLatEnvelope CRS84 8.00830949937517 54.4354651516217 → 15.5979112056959 57.7690657013977 — the whole '
      + 'country, Bornholm included, and those two names are byte-identical to DHM_WCS.dtm/.dsm in heightSources.mjs. '
      + '⛔ THE DISCRIMINATING TEST WAS RUN: keyless GetCoverage at Copenhagen (EPSG:25832 725000,6176000 +200 m) '
      + 'and at Esbjerg (467000,6153000 — in none of the four wired cities) → HTTP 403 text/plain;charset=utf-8, '
      + '40 B, body `User not authorized`, for BOTH coverages. Identical inside and outside the city list, so the '
      + 'gate is the ACCOUNT, not the geography. The WIRED endpoint wcs.datafordeler.dk/DHMNedboer/dhm_wcs/1.0.0/WCS '
      + 'answers HTTP 401, 0 B to a keyless GetCapabilities; services.datafordeler.dk/… → HTTP 403 '
      + 'application/vnd.ogc.se_xml 239 B; api.dataforsyningen.dk/dhm → HTTP 404 text/html 604 B. '
      + '⚠ SO NOTHING IS MEASURED IN DENMARK TODAY, before this change or after it: without DATAFORDELER_API_KEY '
      + 'the join returns `blocked` and every footprint keeps its honest OSM default. What was removed is the '
      + 'CEILING that would still have been there on the day the secret lands. NEXT STEP: provision the secret.',
  },
  {
    country: 'JP', region: 'japan', status: 'wired-partial', join: 'plateau_jp', probedAt: '2026-09-06',
    door: 'https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets',
    reason:
      '⭐ THE CHEAPEST NATIONAL WIN LEFT ON THE BOARD, and it is a FINDING, not a refusal. The join already '
      + 'resolves its tilesets from the LIVE index at run time (`plateauRecordsForBboxes`), so the ONLY thing '
      + 'bounding it is JP_CITY_BBOXES — ten boxes that resolve to 38 municipalities. MLIT’s own national '
      + 'catalogue answers HTTP 200 application/json, 9,121,829 B, 4.31 s and carries 7,776 datasets, of which '
      + '**1,065 are building models (`type_en: "bldg"`) across 45 prefectures and 306 DISTINCT city codes**, each '
      + 'with a 3D Tiles `tileset.json` URL on a public CDN (sample row, verbatim: id `01101_bldg_lod1`, '
      + 'format "3D Tiles", url https://assets.cms.plateau.reearth.io/assets/a6/031403-…/tileset.json). The CKAN '
      + 'sibling www.geospatial.jp/ckan/api/3/action/package_search?q=PLATEAU → HTTP 200, 212,606 B, count 495. '
      + 'So the reach is 306 municipalities against 38 wired — 8× — with no new source and no new decoder. '
      + 'NOT DONE HERE because the sweep UNIT is a municipality tileset, not a raster cell, so the shared '
      + '`sweepPopulatedCells` km²/cursor accounting does not fit unmodified; that is a third sweep shape and '
      + 'half-doing it would have produced a national retain set with no honest truncation sentence. NEXT STEP: '
      + 'band by latitude with runSwathedNationalStamp and account the budget in MUNICIPALITIES, not cells.',
  },
  {
    country: 'CA', region: 'ontario', status: 'wired-partial', join: 'ca_open', probedAt: '2026-09-06',
    door: 'https://datacube.services.geo.ca/stac/api/collections/hrdem-mosaic-1m',
    reason:
      '⭐ A REAL NATIONAL DOOR NOBODY HAD OPENED, and it is the SAME SHAPE as the Swiss join this lane just took '
      + 'national (STAC → paired DSM/DTM COG → nDSM). The wired `ca_open` is two CITY portals (Vancouver ODS, '
      + 'Toronto ArcGIS) with per-building attributes; NRCan’s CanElevation publishes something else entirely. '
      + 'datacube.services.geo.ca/stac/api/collections → HTTP 200 application/json, 150,158 B, 1.53 s, 52 '
      + 'collections, among them hrdem-mosaic-1m, hrdem-mosaic-2m, hrdem-lidar, hrdem-arcticdem, cdsm, cdem, '
      + 'mrdem-30. hrdem-mosaic-1m extent [[-150.958, 38.500, -50.761, 76.495]]. A Toronto items query → HTTP 200 '
      + 'application/geo+json, 13,212 B, 0.53 s, item `8_2-mosaic-1m` carrying BOTH `dsm` and `dtm` COG assets '
      + '(https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-mosaic-1m/8_2-mosaic-1m-dsm.tif) plus '
      + 'dsm-vrt/dtm-vrt, an `extent` GeoJSON and a `coverage` gpkg. The S3 object is PUBLIC and range-readable: '
      + 'HEAD → HTTP 200, Content-Type image/tiff, Accept-Ranges bytes, **Content-Length 954,145,068,231** '
      + '(954 GB — so it is only usable by COG range reads, exactly as swisstopo’s is). Published OUTSIDE the two '
      + 'wired cities, five for five: Halifax HTTP 200 13,237 B · Saskatoon 13,647 B · Yellowknife 13,652 B · '
      + 'Trois-Rivières 13,222 B · Kelowna 13,631 B. ⚠ NOT WIRED HERE, and the honest reason is that HRDEM is a '
      + 'LiDAR-PROJECT mosaic with real holes: an item INTERSECTING a bbox is not coverage, so a wiring lane must '
      + 'read each item’s own `extent` asset as a three-valued precheck rather than trusting the intersection '
      + '(the §GETCAPABILITIES-IS-NOT-AN-INVENTORY rule). That is a new adapter, not a wider bbox. NEXT STEP: '
      + 'clone heights/swissNdsm.mjs — same STAC→COG→nDSM shape, different collection ids.',
  },
  {
    country: 'AU', region: 'victoria', status: 'wired-partial', join: 'au_open', probedAt: '2026-09-06',
    door: 'https://data.gov.au/geoserver/geelong-roofprints-kml/wfs',
    reason:
      'Australia is the starkest row on the board — EIGHT published state rows and a height working set of ONE '
      + 'city (Melbourne LGA) — and it stays that way on evidence, not on effort. There is no national height '
      + 'door: Geoscience Australia services.ga.gov.au/gis/rest/services → HTTP 403, and ELVIS '
      + 'elevation.fsdf.org.au is an HTML bulk portal (HTTP 200 text/html, 13,250 B) with no keyless raster '
      + 'endpoint. What DOES exist is a second measured CITY, already probed by lane HEIGHTS-WHOLE-COUNTRY-B and '
      + 'still unwired: "Roofprints - City of Greater Geelong", CC BY 3.0 AU, keyless GeoServer WFS — a 3×4 km CBD '
      + 'box → HTTP 200, 3,092,245 B, 4.57 s, 7,111 features / numberMatched 7,111, ROOF_HT p50 3.759 m / max '
      + '38.694 m (height above ground, not an AHD elevation). ⚠ The bbox MUST be EPSG:28355: the same box in '
      + 'EPSG:4326 answers HTTP 200 with an EMPTY collection (147 B, numberMatched 0) — a silent-empty trap. '
      + 'It needs an MGA-zone-55 projector plus a native-bbox WFS adapter kind. NEXT STEP: that adapter; it is the '
      + 'cheapest measured-height win in Australia and it is still a CITY, not a country.',
  },
  {
    country: 'AE', region: 'gccstates', status: 'wired-partial', join: 'ad_ndsm', probedAt: '2026-09-06',
    door: 'https://arcgis.sdi.abudhabi.ae/agsimage/rest/services/ImageService/IMGSER_AUH_DSM3_50CM/ImageServer',
    reason:
      '⭐ THE BINDING LIMIT HERE IS COST, NOT PUBLICATION, AND THE NUMBER SAYS SO. The DSM ImageServer answers '
      + '?f=json → HTTP 200 application/json;charset=UTF-8, 4,408 B, 1.55 s, pixelType **F32** (real metres, not a '
      + 'U8 hillshade — the Ireland trap does not apply), pixelSizeX 0.49999988903805703, and its OWN extent is '
      + 'EPSG:3857 xmin 6037116.418 ymin 2674606.900 xmax 6241415.873 ymax 2875914.164 — i.e. roughly 54.23–56.07 E '
      + 'by 23.30–24.96 N. AD_CITY_BBOXES is a SINGLE 0.09° × 0.07° island-core box: about 0.2 % of the ground '
      + 'the service already serves. Widening is refused on a MEASURED budget, not on doubt: heights/abudhabiNdsm.mjs '
      + 'records 2 exportImage GETs of ~7.2 MB and ~27 s EACH per populated 0.01° cell, and the served extent is '
      + '~184 × 166 = 30,544 such cells — ~466 hours at 55 s per cell, against a 330-minute job ceiling. '
      + 'And `gccstates` is SIX COUNTRIES in one bake row, so even the whole served extent is not "the country". '
      + 'The other emirates were probed by name and none resolved: gis.dubai.gov.ae, gisservices.dubai.gov.ae, '
      + 'gisservices.dm.gov.ae and gis.shj.ae all → curl exit 6 (Could not resolve host); data.abudhabi '
      + 'opendata/api/3/action/package_search → HTTP 404 text/html 7,989 B. ⛔ Hostname guessing is the WRONG '
      + 'method (§BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS) and those four rows are recorded as UNKNOWN, never as '
      + 'absence. NEXT STEP: a server-side raster tiling or a mosaic download would cut the 55 s/cell; find the '
      + 'emirates’ real SDI hostnames through a catalogue, not by guessing.',
  },
];

/** The regions this lane was asked about, so a spec can assert that none was silently dropped. */
export const NATIONAL_HEIGHTS_ASSESSED_REGIONS = NATIONAL_HEIGHTS_ASSESSED.map((r) => r.region);

/** Rows whose join reaches the whole country today. */
export const nationalHeightsWired = () => NATIONAL_HEIGHTS_ASSESSED.filter((r) => r.status === 'wired-national');
