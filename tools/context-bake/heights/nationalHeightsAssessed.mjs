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
      'Twelve of sixteen Länder are wired behind one router, and the working set is one CITY per wired Land — so '
      + 'Germany is TWO steps from national, not one: arm the remaining Länder, THEN widen each Land to its own '
      + 'extent. This lane did neither (it is the DE router lane\'s subsystem) and probed only the two open '
      + 'questions in its notes, without resolving them: Bayern `download1.bayernwolke.de/a/lod2/` → HTTP 403 '
      + 'text/html 146 B (a listing refusal, not an absence — BY is catalogued CC BY 4.0), and '
      + '`geodaten.bayern.de/odd/a/lod2/meta/metalink/09.meta4` → HTTP 404 text/html 196 B (wrong path shape, so '
      + 'UNKNOWN). Saarland: geoportal.saarland.de answers HTTP 200 (30,160 B) but its Mapbender WMS entry point '
      + 'returns 284 B of XHTML, not capabilities. ⛔ NONE of these three is evidence of absence; DE stays '
      + 'wired-partial with named unknowns.',
  },
  {
    country: 'CH', region: 'switzerland', status: 'not-done-shape', join: 'swiss', probedAt: '2026-09-05',
    missing: 'a tile-key ordinal for swisstopo’s 1 km LV95 grid, so the shared kernel’s resume cursor applies',
    door: 'heights/swissNdsm.mjs',
    reason:
      'swissSURFACE3D − swissALTI3D IS national (STAC → LV95 COG), and the retain set is SWISS_CITY_BBOXES: nine '
      + 'cities. ⚠ NOT REFUSED — NOT DONE. The blocker is shape, not data: this join sweeps by swisstopo\'s OWN 1 km '
      + 'LV95 tile key rather than by a degree grid, so the shared kernel\'s cell `ord` (and therefore its resume '
      + 'cursor) does not apply unmodified. Taking CH national is a real, tractable piece of work — a tile-key '
      + 'ordinal — and it is the cheapest of the four `wired-partial` rows above. It is named here rather than '
      + 'quietly left out of the lane\'s report.',
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
];

/** The regions this lane was asked about, so a spec can assert that none was silently dropped. */
export const NATIONAL_HEIGHTS_ASSESSED_REGIONS = NATIONAL_HEIGHTS_ASSESSED.map((r) => r.region);

/** Rows whose join reaches the whole country today. */
export const nationalHeightsWired = () => NATIONAL_HEIGHTS_ASSESSED.filter((r) => r.status === 'wired-national');
