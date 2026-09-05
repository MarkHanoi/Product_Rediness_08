// ─────────────────────────────────────────────────────────────────────────────
// §EA-LIDAR-GB (2026-09-05, lane HEIGHTS-GB-IE) — Environment Agency LiDAR Composite First-Return DSM
// 1 m − LiDAR Composite DTM 1 m: the PURE, dependency-free half of the England measured-height stamp.
//
// WHY THIS FILE IS SEPARATE (the heights/swissNdsm.mjs + heights/mnhFr.mjs rule): vitest cannot import
// heightSources.mjs, so every DECISION the stamp makes — the WCS URL shape, the British National Grid
// tile keying, the coverage envelope, the raster verdict, the city working set — lives here as a total
// function of its arguments and is unit-tested (ealidarGb.spec.ts against a VERBATIM live fixture);
// the network + raster half (`heights/ealidarGbStamp.mjs`) imports these and only moves bytes.
//
// ⚠ THE DIFFERENCING IS OURS. Unlike France (IGN publishes the MNH — the pixel IS the height above
// ground) the Environment Agency publishes NO nDSM: it serves a first-return DSM and a DTM as two
// separate WCS coverages, both in metres ODN (Newlyn), and this stamp computes nDSM = DSM − DTM per
// footprint itself (`ndsmHeightForBuilding`: metric erosion, P90 over the eroded interior, minSamples —
// the DK DHM / CH swisstopo statistic, unchanged). Same vertical datum on both products, so the
// difference is datum-free height above ground. First-return DSM = all sursol (trees too); the P90-over-
// eroded-interior is the mitigation DK/CH apply. OS Building Heights is a licensed premium product and
// is NOT used (X3-refused, unchanged).
//
// THE CHANNEL — LIVE-PROBED 2026-09-05, every number is a measurement (fixture: __tests__/fixtures/
// gb-ealidar-london-stmartin-2026-09-05.json holds the verbatim window):
//   • DSM  https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs
//         GetCapabilities HTTP 200 application/xml 7,459 B · WCS 2.0.1 · CoverageId
//         `df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m` (+ a Hillshade
//         sibling). ⚠ The slug `…-digital-surface-model-dsm-1m` (the DTM's naming pattern) is HTTP 404 —
//         so are `…-first-return-digital-surface-model-dsm-1m` and `…-last-return-…`. DescribeCoverage:
//         EPSG:27700, envelope E 133000–656000 · N 11000–657601, grid 523000 × 646601, offset (1,0)/(0,−1).
//   • DTM  https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs
//         (the coverage terrain.mjs DTM_FETCH.gb already drapes) · CoverageId
//         `13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m` · envelope
//         E 80000–656000 · N 4000–665000.
//   • GetCoverage shape (both): `SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=<id>&FORMAT=image/tiff
//         &SUBSET=E(x0,x1)&SUBSET=N(y0,y1)&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/27700` — axis
//         labels are `E`/`N` (terrain.mjs DTM_FETCH.gb axisX/axisY), SCALESIZE is rejected (terrain.mjs
//         note) and is not wanted: the stamp samples at native 1 m.
//   • Response: HTTP 200 image/tiff, big-endian, ONE IFD, 1 sample, 32-bit float (SampleFormat 3),
//         UNCOMPRESSED (Compression 1), GDAL_NODATA `-3.4028234663852886E38`, GeoKey 27700, 1 m cells.
//         Bytes ≈ 4 × area: 500 m box 3,936,707 B (7.2 s cold) · 1 km 4,194,755 B (2.25 s) · 2 km
//         16,777,763 B (4.0 s) · 4 km 67,109,795 B (13.5 s) — NO area cap hit at 4 km; the stamp still
//         tiles at 1 km (the OS grid km square) so one lost request costs one tile, not a city.
//   • Ground truth (Trafalgar Square box E 529800–530300 / N 180200–180700): St Martin-in-the-Fields
//         nave DSM 36.22 − DTM 11.41 = 24.8 m · Charing Cross station 19.62 − 6.59 = 13.0 m · the
//         square's pavement 9.392 − 9.391 = 0.001 m. Manchester / Birmingham / Leeds / Bristol 200 m
//         probes all HTTP 200 with real relief (p50 56.2 / 148.5 / 56.6 / 18.8 m ODN).
//   • ⚠ ZERO-FILL COVERAGE HOLE (§CONTEXT-DATA-HONESTY): Cardiff E 318000–318300 / N 176500–176800 sits
//         INSIDE both envelopes and answers HTTP 200 · 370,048 B · 300 × 300 — every cell 0.0 on the DSM
//         AND the DTM (90,000 / 90,000 zeros, 0 nodata sentinels). The composite is England-only; Wales
//         is served as zeros, not as nodata. `eaRasterVerdict` therefore calls a raster ≥ 99 % exact
//         zeros a VOID, never ground — DSM − DTM = 0 would otherwise read as "nothing measurable" and
//         hide a coverage hole inside an honest-looking empty count.
//   • Outside the envelope (Edinburgh E 325500 / N 673500): HTTP 500
//         `{"message":"Internal server error","statusCode":500,"code":"internal_error"}` — not an OGC
//         exception. `inEaEnvelope` refuses such tiles BEFORE the request and counts them as void.
//   • Licence: Open Government Licence v3 (terrain.mjs TERRAIN_SOURCES.gb, `commercialOk: true,
//         auth: 'none'`) — keyless, no repo secret, attribution "© Environment Agency copyright and/or
//         database right 2015–2024. All rights reserved." applies.
//
// SCOTLAND AND WALES ARE NOT COVERED, on evidence (EA_LIDAR_GB_ASSESSED below): Scotland's Remote
// Sensing Portal (remotesensingdata.gov.scot) is a JS app whose catalogue host srsp-catalog.jncc.gov.uk
// timed out at 20 s and again at 15 s on 2026-09-05; DataMapWales' GeoServer WCS 2.0.1 GetCapabilities
// (HTTP 200, 565,889 B) lists 18 coverages, none of them LiDAR (geonode__cog_WG_IN_* noise maps), its
// WMS GetCapabilities timed out at 20 s, and its CKAN API answers 404 on both /api/3/action and
// /api/action. Edinburgh and Cardiff footprints stream through with their OSM tags — never a height.
// ─────────────────────────────────────────────────────────────────────────────

export const EA_LIDAR_GB = {
  dsmEndpoint: 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs',
  dsmCoverageId: 'df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m',
  dtmEndpoint: 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs',
  dtmCoverageId: '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m',
  subsettingCrs: 'http://www.opengis.net/def/crs/EPSG/0/27700',
  axisX: 'E', axisY: 'N',          // the coverage's axis labels (terrain.mjs DTM_FETCH.gb) — NOT x/y
  nativeCrs: 'EPSG:27700',         // OSGB36 / British National Grid — reproject.mjs carries the Helmert def
  tileM: 1000,                     // the OS grid km square; 1 km = 4.19 MB per coverage, 2.25 s (probed)
  nodata: -3.4028234663852886e38,  // GDAL_NODATA on both coverages (probed) — sampleRasterNative's |v|>1e6 rule masks it too
  // INTERSECTION of the two DescribeCoverage envelopes (E,N): a tile outside it cannot yield a difference.
  envelope: [133000, 11000, 656000, 657601],
  zeroFillFraction: 0.99,          // ≥ 99 % exact 0.0 cells = the Cardiff zero-fill hole → VOID, never ground
  heightSourceTag: 'ea-lidar-ndsm',
  attribution: '© Environment Agency copyright and/or database right 2015–2024 (Open Government Licence v3) — LiDAR Composite First-Return DSM 1 m − DTM 1 m, differenced by PRYZM',
};

/** BNG easting/northing (m) → the OS 1 km square key { e, n } (km), e.g. 530120,180500 → { e: 530, n: 180 }. */
export function bngTileKey(X, Y, tileM = EA_LIDAR_GB.tileM) {
  return { e: Math.floor(X / tileM), n: Math.floor(Y / tileM) };
}

/** Native BNG [minX, minY, maxX, maxY] of a tile key. */
export function bngTileBbox({ e, n }, tileM = EA_LIDAR_GB.tileM) {
  return [e * tileM, n * tileM, (e + 1) * tileM, (n + 1) * tileM];
}

/** Is a native BNG box wholly inside the served envelope? (Edinburgh → false → void, no request.) */
export function inEaEnvelope([x0, y0, x1, y1], envelope = EA_LIDAR_GB.envelope) {
  const [ex0, ey0, ex1, ey1] = envelope;
  return x0 >= ex0 && y0 >= ey0 && x1 <= ex1 && y1 <= ey1;
}

/**
 * The WCS 2.0.1 GetCoverage URL for ONE coverage over a native BNG box — the exact shape that answered
 * HTTP 200 image/tiff on 2026-09-05 (SUBSET on the `E`/`N` axis labels, SUBSETTINGCRS 27700, no SCALESIZE).
 */
export function eaGetCoverageUrl(endpoint, coverageId, [x0, y0, x1, y1], { axisX = EA_LIDAR_GB.axisX, axisY = EA_LIDAR_GB.axisY, subsettingCrs = EA_LIDAR_GB.subsettingCrs } = {}) {
  return `${endpoint}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${coverageId}&FORMAT=image/tiff`
    + `&SUBSET=${axisX}(${Math.round(x0)},${Math.round(x1)})&SUBSET=${axisY}(${Math.round(y0)},${Math.round(y1)})`
    + `&SUBSETTINGCRS=${subsettingCrs}`;
}
export const eaDsmUrl = (box) => eaGetCoverageUrl(EA_LIDAR_GB.dsmEndpoint, EA_LIDAR_GB.dsmCoverageId, box);
export const eaDtmUrl = (box) => eaGetCoverageUrl(EA_LIDAR_GB.dtmEndpoint, EA_LIDAR_GB.dtmCoverageId, box);

/**
 * Classify ONE decoded raster (any array-like of numbers) — the §CONTEXT-DATA-HONESTY split at the point
 * where "the server answered 200" could become "there are heights here":
 *   'ok'          — measurable cells exist;
 *   'void-nodata' — every cell is the nodata sentinel (or non-finite): served, nothing measurable;
 *   'void-zero'   — ≥ `zeroFillFraction` of the cells are EXACTLY 0.0 — the Cardiff/Wales zero-fill hole.
 *                   A real English tile never does this (London 1 km: 0 zeros in 1,000,000; sea-level
 *                   marsh has fractional values), so the threshold trades nothing real for the hole;
 *   'empty'       — zero-length input (the decoder returned nothing) — a FAILURE upstream, kept distinct.
 */
export function eaRasterVerdict(values, { nodata = EA_LIDAR_GB.nodata, zeroFillFraction = EA_LIDAR_GB.zeroFillFraction } = {}) {
  const n = values?.length ?? 0;
  if (n === 0) return 'empty';
  let zeros = 0, voids = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v) || v === nodata || Math.abs(v) > 1e6) voids++;
    else if (v === 0) zeros++;
  }
  if (voids === n) return 'void-nodata';
  if (zeros / n >= zeroFillFraction) return 'void-zero';
  return 'ok';
}

// ─────────────────────────────────────────────────────────────────────────────
// §EA-LIDAR-GB-CITY-BBOXES — the `greatbritain` national row's stamp working set (the GB analogue of
// SWISS_CITY_BBOXES / MNH_FR_CITY_BBOXES, mandatory for the same reason: §HEIGHT-STAMP-BUDGET / L-659 —
// a whole-country join with no bounded area holds every British footprint in the V8 heap). Footprints
// outside these bboxes stream through with their original OSM tags — never a fabricated height. Each
// bbox costs ≈ its populated 1 km-square count × 2 GetCoverage × ~4.2 MB.
//
// PROVENANCE: london is BYTE-IDENTICAL to terrain.mjs's `gb` REGIONS row AND to the bake.mjs `london`
// city row it replaced on 2026-09-02 (5faa71ba; the §MDS-BBOX-MUST-COVER-THE-REGION invariant, pinned by
// ealidarGb.spec.ts) so the baked terrain and the stamped heights cover the same ground. The other four
// are tight metro-core extents centred on the city; all five are ENGLAND (probed real relief above).
// Edinburgh (Scotland) and Cardiff (Wales) are deliberately NOT here — see EA_LIDAR_GB_ASSESSED.
// ─────────────────────────────────────────────────────────────────────────────
export const EA_LIDAR_GB_CITY_BBOXES = [
  // city           [w, s, e, n] (WGS84, osmium -b order)                       ≈ 1 km squares
  { city: 'london',     bbox: [-0.20, 51.44, 0.02, 51.55] },  // = terrain.mjs gb row = former bake.mjs row · ~15×12
  { city: 'manchester', bbox: [-2.28, 53.45, -2.19, 53.50] }, // city centre + Salford Quays · ~6×6
  { city: 'birmingham', bbox: [-1.94, 52.46, -1.86, 52.50] }, // city centre + Digbeth · ~6×5
  { city: 'leeds',      bbox: [-1.58, 53.78, -1.51, 53.82] }, // city centre · ~5×5
  { city: 'bristol',    bbox: [-2.63, 51.44, -2.56, 51.48] }, // city centre + Harbourside · ~5×5
];

/**
 * Cities INSIDE the `greatbritain` extract that this stamp does NOT serve, with the probe that says why.
 * Recorded so the omission reads as a measured refusal, not a forgotten row (the AU_OPEN_HEIGHTS_ASSESSED
 * pattern). A future Scottish / Welsh adapter is its own module; it is not this one with a wider bbox.
 */
export const EA_LIDAR_GB_ASSESSED = [
  { city: 'edinburgh', nation: 'scotland', bbox: [-3.25, 55.93, -3.15, 55.98], status: 'no-source', probedAt: '2026-09-05',
    reason: 'EA composite does not reach Scotland: DSM GetCoverage at E 325500 / N 673500 → HTTP 500 internal_error (N above the 657601 envelope). '
      + 'Scottish Remote Sensing Portal (remotesensingdata.gov.scot) is a JS app; its catalogue host srsp-catalog.jncc.gov.uk timed out at 20 s and 15 s — no reachable WCS/WMS to probe.' },
  { city: 'cardiff', nation: 'wales', bbox: [-3.21, 51.46, -3.14, 51.50], status: 'no-source', probedAt: '2026-09-05',
    reason: 'EA composite answers Wales with ZERO-FILL (HTTP 200, 300×300 cells all 0.0 on DSM and DTM — eaRasterVerdict "void-zero"). '
      + 'DataMapWales GeoServer WCS 2.0.1 GetCapabilities HTTP 200 (565,889 B) lists 18 coverages, none LiDAR; WMS GetCapabilities timed out at 20 s; CKAN /api/3/action and /api/action both 404.' },
];
