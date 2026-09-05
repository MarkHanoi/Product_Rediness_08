// ─────────────────────────────────────────────────────────────────────────────
// §BE-DHMV (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — Digitaal Vlaanderen DHMV II (Digitaal Hoogtemodel
// Vlaanderen II) DSM 1 m − DTM 1 m: the PURE, dependency-free half of the Belgian measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as heights/mnhFr.mjs, swissNdsm.mjs,
// noHeights.mjs: vitest cannot import heightSources.mjs, so every DECISION the stamp makes (endpoint, URL
// shape and axis order, tile keying, the multipart split, the nodata rule, the city working set) lives
// here as a total function of its arguments and is unit-tested against bytes copied VERBATIM from the
// live service; the network + raster half (heights/beHeightsStamp.mjs) imports these.
//
// THE CHANNEL — LIVE-PROBED 2026-09-05, every number below is a measurement, not a reading:
//   • WCS 2.0.1 at https://geo.api.vlaanderen.be/DHMV/wcs — GetCapabilities HTTP 200 text/xml 20,128 B in
//     0.59 s. Coverages: DHMVII_DSM_1m · DHMVII_DTM_1m · DHMV_II_HILL_25cm · DHMV_II_SVF_25cm · DHMVI_DTM_5m.
//     <Fees>Het gebruik van de service is kosteloos.</Fees>; AccessConstraints point at the Vlaanderen
//     "gebruiksrecht geografische webdiensten" page. NO key, NO account, NO repo secret. formatSupported
//     image/tiff ONLY; crsSupported includes 31370 / 3812 / 25831 / 3857 / 4326 / 4258 / 3035.
//   • DescribeCoverage DHMVII_DSM_1m: EPSG:31370, axisLabels "x y", envelope [17000,148000]–[264000,250000]
//     (Lambert 72 m), gml:high 246999 101999 (247 km × 102 km at 1 m), offsetVector 1 0 / 0 −1,
//     nilValue −9999 ("inapplicable"), nativeFormat image/tiff. The DTM sibling reads identically.
//   • GetCoverage is answered as **multipart/related; boundary="wcs"** — a GML-Part (text/xml, the
//     RectifiedGridCoverage header, 2,805 B) and then a part `Content-Type: image/tiff / Content-ID: 1.tif`
//     holding the GeoTIFF, closed by `--wcs--`. `FORMAT=image/tiff`, `FORMAT=image/geotiff` and no FORMAT at
//     all return the SAME multipart; `MEDIATYPE=image/tiff` → HTTP 404 ServiceException. So the stamp SPLITS
//     the multipart (splitWcsMultipart below) — never assumes a bare TIFF body.
//   • The TIFF: Float32 (SampleFormat 3, 32 bit), uncompressed, ONE band, GDAL_NODATA −9999, georeferenced
//     in EPSG:31370 (ProjectedCSTypeGeoKey 31370). 200 m window → 200×200 px, 266,250 B in 0.54 s;
//     1 km window → 1000×1000 px, 4,198,890 B in 0.94 s. Both DSM and DTM decode with geotiff.js.
//   • Antwerp Grote Markt [152400,212200]–[152600,212400]: DSM p50 18.4 · p90 25.9 · max 61.5 m; DTM p50 7.6
//     · p90 8.1 m (0 nodata cells); DSM − DTM p50 10.8 · p90 18.2 · max 54.0 m, 68.7 % of cells > 3 m —
//     a dense historic core, as it should read. Ghent Korenmarkt [104500,193900]–[104700,194100]: DSM p90
//     25.6 m over DTM p90 8.7 m, nDSM p90 17.2 m. ⭐ Brussels Grand-Place [148800,170650]–[148900,170750]
//     (OUTSIDE Flanders): DSM p90 46.6 · max 114.6 m over DTM p50 21.4 m, 0 nodata — DHMV II's flight
//     covers the Brussels-Capital Region too, so the REGION_SOURCE `brussels: blocked` row (which assumed
//     "GRB height is Flanders-only") was wrong about the RASTER: the block model is Flanders-only, the
//     height model is not. Brussels is therefore in the working set below.
//   • Both models share the DHMV II LiDAR flight (2013–2015) and the TAW vertical datum, so DSM − DTM is a
//     datum-free height above ground — the DK/CH/NO nDSM shape, `ndsmHeightForBuilding` unchanged.
//     ⚠ The DSM is ALL sursol (vegetation too) — P90 over the ERODED footprint interior, holes excluded,
//     exactly the DK/FR/CH/NO mitigation.
//   • A window OUTSIDE the published data (sea, [20000,240000]–[20100,240100]) answers HTTP 200 with a
//     4,071 B multipart whose TIFF part is a stub geotiff.js cannot decode ("Offset is outside the bounds of
//     the DataView") — NOT a −9999-filled raster. The stamp counts that as a tile ERROR by name (it cannot
//     tell "nothing published" from "truncated"), never as a void; the working-set bboxes below are inland
//     cores where it was never observed.
//   • The 3D GRB LoD1 block model (geo.api.vlaanderen.be/3DGRB/wms, layer GRBGEBL1D2 — "benaderende
//     verticale afstand tussen nok en maaiveld", relative height) is WMS-only: /3DGRB/wfs → 302 to an error
//     page. A picture of a height is not a height, so it is not used. Brussels UrbIS (geoservices-urbis.
//     irisnet.be/geoserver/UrbisAdm/ows, WFS 2.0, CC0): UrbisAdm:Bu carries GEOM · BU_INSPIRE_ID · BU_CAPAKEY
//     · BU_STATUS · BU_CATEGORY · BU_ID — NO height field; /Urbis3D and /UrbisTopo workspaces → HTTP 404.
//     Attribute channels are therefore not a Belgian height source; the DHMV raster is.
// ─────────────────────────────────────────────────────────────────────────────

export const BE_DHMV = {
  wcs: 'https://geo.api.vlaanderen.be/DHMV/wcs',
  dsm: 'DHMVII_DSM_1m',           // surface model — buildings + vegetation (LiDAR 2013–2015)
  dtm: 'DHMVII_DTM_1m',           // bare-earth model, same flight, same datum (TAW)
  crs: 'EPSG:31370',              // Belgian Lambert 72 — LCC on International 1924 → reproject.mjs / proj4, not a UTM helper
  nativeResM: 1.0,
  tileM: 500,                     // 500 m native tiles: 540 px at 1 m ≈ 1.2 MB per raster (1 km probed at 4.2 MB / 0.94 s)
  padM: 20,                       // erosion + bilinear margin so a footprint on a tile edge is not sampled against void
  nodata: -9999,                  // GDAL_NODATA on both coverages (DescribeCoverage nilValue, and the TIFF tag — probed)
  multipartBoundary: 'wcs',       // GetCoverage answers multipart/related; boundary="wcs" (probed, every FORMAT spelling)
  heightSourceTag: 'dhmv2-ndsm',
  attribution: '© Digitaal Vlaanderen — Digitaal Hoogtemodel Vlaanderen II, DSM 1 m & DTM 1 m (free web service; gebruiksrecht geografische webdiensten)',
};

/**
 * WCS 2.0.1 GetCoverage URL for ONE DHMV coverage over a native EPSG:31370 box → a multipart/related body
 * whose second part is the GeoTIFF. `which` ∈ {'dsm','dtm'}. Axis labels are `x` / `y` (DescribeCoverage
 * axisLabels="x y"), each SUBSET closed-open in native metres. FORMAT=image/tiff is the only supported
 * format string and is sent explicitly so a future server that honours it returns a bare TIFF that
 * `splitWcsMultipart` passes through unchanged.
 */
export function beDhmvCoverageUrl(which, [x0, y0, x1, y1], cfg = BE_DHMV) {
  const coverage = which === 'dsm' ? cfg.dsm : cfg.dtm;
  return `${cfg.wcs}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${coverage}` +
    `&SUBSET=x(${x0.toFixed(0)},${x1.toFixed(0)})&SUBSET=y(${y0.toFixed(0)},${y1.toFixed(0)})&FORMAT=image/tiff`;
}

/** WCS 2.0.1 DescribeCoverage URL (the coverage-level probe: CRS, envelope, nodata, native format). */
export function beDhmvDescribeUrl(which, cfg = BE_DHMV) {
  return `${cfg.wcs}?SERVICE=WCS&VERSION=2.0.1&REQUEST=DescribeCoverage&COVERAGEID=${which === 'dsm' ? cfg.dsm : cfg.dtm}`;
}

/** Lambert 72 easting/northing (m) → the stamp's 500 m tile key { e, n }, e.g. Grote Markt 152162,212373 → { e: 304, n: 424 }. */
export function lambert72TileKey(X, Y, tileM = BE_DHMV.tileM) {
  return { e: Math.floor(X / tileM), n: Math.floor(Y / tileM) };
}

/** Native EPSG:31370 [minX, minY, maxX, maxY] of a tile key. */
export function lambert72TileBbox({ e, n }, tileM = BE_DHMV.tileM) {
  return [e * tileM, n * tileM, (e + 1) * tileM, (n + 1) * tileM];
}

/** The padded native box ONE tile costs (500 m + 2 × 20 m at 1 m → 540 × 540 px). */
export function beDhmvTileRequest(key, { tileM = BE_DHMV.tileM, padM = BE_DHMV.padM } = {}) {
  const [x0, y0, x1, y1] = lambert72TileBbox(key, tileM);
  return { box: [x0 - padM, y0 - padM, x1 + padM, y1 + padM] };
}

/** DHMV void rule — the GDAL_NODATA sentinel (−9999) or any non-finite value is void. */
export function isDhmvNodata(v, nodata = BE_DHMV.nodata) {
  return !Number.isFinite(v) || v === nodata;
}

/**
 * Replace the nodata sentinel (and any non-finite value) with NaN, IN PLACE. Returns the count. WHY (the
 * MNH-FR lesson): the shared bilinear sampler recognises nodata only as |v| > 1e6 or non-finite; −9999 is
 * neither, so an unmasked coverage edge would be BLENDED into its neighbours and read as a plausible height.
 */
export function maskDhmvNodata(values, nodata = BE_DHMV.nodata) {
  let masked = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === nodata || !Number.isFinite(v)) { values[i] = NaN; masked++; }
  }
  return masked;
}

const II = [0x49, 0x49, 0x2a, 0x00], MM = [0x4d, 0x4d, 0x00, 0x2a];
const findBytes = (buf, pat, from = 0) => {
  outer: for (let i = from; i <= buf.length - pat.length; i++) {
    for (let j = 0; j < pat.length; j++) if (buf[i + j] !== pat[j]) continue outer;
    return i;
  }
  return -1;
};
const asciiBytes = (s) => Array.from(s, (c) => c.charCodeAt(0));

/**
 * The GeoTIFF bytes out of a DHMV GetCoverage body — the `Content-Type: image/tiff` part of the
 * multipart/related answer (probed shape: GML-Part, then the TIFF part, then `--wcs--`), or the body
 * itself when it already IS a TIFF (magic at byte 0). Returns **null** when no TIFF magic follows a TIFF
 * part header or the body is an exception document: the caller must count that as a tile ERROR (the
 * service answered, but not with a raster), never as an empty tile. The trailing `\r?\n--wcs--` closing
 * boundary is cut off so geotiff.js sees exactly the file. Pure — a Uint8Array in, a Uint8Array view out.
 */
export function splitWcsMultipart(bytes, boundary = BE_DHMV.multipartBoundary) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return null;
  const magicAt = (from) => { const a = findBytes(bytes, II, from), b = findBytes(bytes, MM, from); return a < 0 ? b : b < 0 ? a : Math.min(a, b); };
  if (magicAt(0) === 0) return bytes; // a bare TIFF — pass through
  const hdr = findBytes(bytes, asciiBytes('Content-Type: image/tiff'));
  if (hdr < 0) return null;
  const start = magicAt(hdr);
  if (start < 0) return null;
  const close = findBytes(bytes, asciiBytes(`--${boundary}--`), start);
  let end = close < 0 ? bytes.length : close;
  while (end > start && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end--; // the CRLF/LF before the closing boundary
  return bytes.subarray(start, end);
}

/**
 * Parse a WCS 2.0.1 DescribeCoverage document → { coverageId, crs, axisLabels, lowerCorner, upperCorner,
 * nilValue, nativeFormat } or **null** when the body is not one (an exception report, HTML, empty). The
 * caller must treat null as UNKNOWN — never as "no coverage".
 */
export function parseWcs2DescribeCoverage(text) {
  if (typeof text !== 'string' || !/<wcs:CoverageDescription\b/.test(text)) return null;
  const num = (s) => s?.trim().split(/\s+/).map(Number) ?? null;
  const crsUrl = text.match(/<gml:Envelope[^>]*srsName="([^"]+)"/)?.[1] ?? null;
  return {
    coverageId: text.match(/<wcs:CoverageId>([^<]+)<\/wcs:CoverageId>/)?.[1]?.trim() ?? null,
    crs: crsUrl ? `EPSG:${crsUrl.split('/').pop()}` : null,
    axisLabels: text.match(/<gml:Envelope[^>]*axisLabels="([^"]+)"/)?.[1]?.trim().split(/\s+/) ?? null,
    lowerCorner: num(text.match(/<gml:lowerCorner>([^<]+)</)?.[1]),
    upperCorner: num(text.match(/<gml:upperCorner>([^<]+)</)?.[1]),
    // `<swe:nilValue reason=…>` — the singular element; `[^>]*` alone would also match the plural wrapper
    // `<swe:nilValues>` (whitespace content → Number('  ') === 0, a silent wrong nodata). Pinned by the spec.
    nilValue: Number(text.match(/<swe:nilValue(?:\s[^>]*)?>([^<]+)</)?.[1] ?? NaN),
    nativeFormat: text.match(/<wcs:nativeFormat>([^<]+)</)?.[1]?.trim() ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §BE-CITY-BBOXES — the `belgium` national row's stamp working set (the BE analogue of MDS_CITY_BBOXES /
// DHM_CITY_BBOXES / MNH_FR_CITY_BBOXES / SWISS_CITY_BBOXES / NO_NDH_CITY_BBOXES, mandatory for the same
// reason: §HEIGHT-STAMP-BUDGET / L-659 — a whole-country join with no bounded area holds every Belgian
// footprint in the V8 heap). Footprints outside these bboxes stream through with their original OSM
// tags — never a fabricated height. Each bbox costs ≈ its 500 m Lambert-72 tile count × 2 GetCoverage
// fetches (~1.2 MB each at 1 m).
//
// PROVENANCE: brussels is BYTE-IDENTICAL to terrain.mjs's `be` REGIONS row (the §MDS-BBOX-MUST-COVER-THE-
// REGION invariant, pinned by beHeights.spec.ts) — that row is terrain-BLOCKED ("Brussels-Capital DTM
// route/licence unsourced"), which is a TERRAIN verdict and does not bind this stamp: the DHMV DSM/DTM
// probe at Grand-Place above measured real data there. antwerp / ghent / leuven / bruges are tight
// metro-core extents; every bbox is inside the bake.mjs `belgium` region bbox (2.50,49.50,6.40,51.60).
// Wallonia (Liège, Charleroi, Namur) is NOT listed: DHMV II stops at the regional border and the Walloon
// MNT/MNS (geoportail.wallonie.be) was not probed by this lane — an honest gap, said by name.
// ─────────────────────────────────────────────────────────────────────────────
export const BE_CITY_BBOXES = [
  // city         [w, s, e, n] (WGS84, osmium -b order)                     ≈ 500 m tiles
  { city: 'antwerp',  bbox: [4.35, 51.19, 4.47, 51.25] },   // Grote Markt / Zuid / Borgerhout core · ~17×14
  { city: 'ghent',    bbox: [3.68, 51.02, 3.76, 51.08] },   // Kuip + station · ~11×13
  { city: 'brussels', bbox: [4.30, 50.80, 4.42, 50.90] },   // = terrain.mjs be row (blocked for TERRAIN, not for this raster) · ~17×22
  { city: 'leuven',   bbox: [4.67, 50.86, 4.73, 50.90] },   // ~8×9
  { city: 'bruges',   bbox: [3.19, 51.19, 3.25, 51.23] },   // ~8×9
];
