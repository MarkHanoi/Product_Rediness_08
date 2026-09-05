// ─────────────────────────────────────────────────────────────────────────────
// §CUZK-NDSM (2026-09-05, lane HEIGHTS-AT-CZ-SI) — ČÚZK **DMP 1G** (digital SURFACE model, 1st gen)
// − **DMR 5G** (digital RELIEF model, 5th gen): the PURE, dependency-free half of the Czech national
// measured-height stamp. The network/raster half is `stampCzHeightsOnGeojsonseq` in
// heights/czHeightsStamp.mjs (the nl3dbagStamp / noHeightsStamp precedent — heightSources.mjs is a
// many-lane file and vitest cannot import it, so every DECISION lives here as a total function of its
// arguments and is unit-tested by czHeights.spec.ts).
//
// THE CHANNEL — LIVE-PROBED 2026-09-05, every number below is a measurement, not a reading:
//   • Two KEYLESS ArcGIS ImageServers on ags.cuzk.gov.cz (HTTP 200 `?f=json`, no token, no referer):
//       https://ags.cuzk.gov.cz/arcgis2/rest/services/dmp1g/ImageServer   (DMP 1G — surface, buildings + canopy)
//       https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer   (DMR 5G — bare earth, Bpv datum)
//     Both: pixelType F32 · one band · native S-JTSK Křovák (wkid 102067 / latestWkid 5514, vcs 8357
//     = Bpv) · service pixelSize 2 m · maxImageWidth 15000 · maxImageHeight 4100 · copyrightText
//     "© ČÚZK" · capabilities Catalog,Image(,Mensuration),Metadata · mosaic of the 2009–2013 ALS
//     campaign (DMP 1G σ 0.4 m on buildings / 0.7 m on vegetation; DMR 5G σ 0.18 m open / 0.3 m forest
//     — the services' own descriptions). The `?f=pjson` bodies are saved VERBATIM as
//     __tests__/fixtures/cz-cuzk-{dmp1g,dmr5g}-imageserver-2026-09-05.json.
//   • `exportImage` serves a **GeoTIFF in EPSG:4326** when asked (`bboxSR=4326&imageSR=4326&format=tiff
//     &pixelType=F32`): Prague Old Town, bbox 14.415,50.085,14.425,50.091 at size 700×670 → HTTP 200
//     image/tiff, 2,360,390 B, 1.5 s (DMP) / 1.1 s (DMR); geotiff.js reads back w 700 · h 670 ·
//     bbox [14.415, 50.08321, 14.425, 50.09279] · Float32 · EPSG 4326. ⚠ The served extent is NOT the
//     requested one — ArcGIS re-fits the bbox to the requested pixel aspect (50.085→50.08321,
//     50.091→50.09279). The georeference MUST be read from the GeoTIFF, never assumed from the URL;
//     the stamp does (readDhmRaster-shape) and `cuzkPxDims` sizes the request from metres so the
//     re-fit stays small.
//   • **DMP − DMR IS a real nDSM**: over that Old Town cell 469,000 px → p10 −0.01 · p50 6.87 ·
//     p90 24.39 · p99 29.83 · max 68.67 m, 57 % of pixels > 3 m (dense historic core; the 68 m is a
//     church tower). DMP p50 197.7 m · DMR p50 190.6 m orthometric. ⚠ DMP 1G is ALL sursol
//     (vegetation too) — P90 over the ERODED footprint interior, the DK/FR/CH mitigation.
//   • NODATA — the request passes `noData=-9999`; outside coverage (a cell 40 km inside Germany,
//     14.30,51.05–14.31,51.06) the GeoTIFF carries GDAL_NODATA −9999 and 3,876 of 10,000 px are exactly
//     −9999 (the rest valid — the mosaic extent is a rectangle that spills past the border). A cell
//     straddling the border read 20,000/20,000 valid. Failure and empty stay different values.
//   • REFUSAL SHAPE — an oversize request (size=100,5000) answers **HTTP 200** with a JSON body
//     `{"error":{"code":400,…,"details":["The requested image exceeds the size limit."]}}` (156 B,
//     verbatim below). A stamp that trusts the status code would hand a JSON document to the TIFF
//     decoder; the stamp therefore checks the content-type AND `parseCuzkRefusal` first.
//   • Licence: ČÚZK open data (Data ZABAGED®/výškopis released as open data; the services publish
//     copyrightText "© ČÚZK"). Attribution "© ČÚZK — DMP 1G / DMR 5G". No key, no account, no repo
//     secret.
//   • RÚIAN `pocet podlazi` (floor counts) is a DIFFERENT tier — derived-levels, never measured —
//     and the client renders derived-levels as an estimated ghost (CesiumViewport.ts
//     §CTX-HEIGHT-FIDELITY-RENDER: solid only for `tagged` / `measured-lidar`), so it is NOT wired here:
//     stamping floors × 3.2 m would change nothing the user can see and would put a constructed number
//     on a measured channel's footprints. heightSources.mjs REGION_SOURCE `ruian_cz` keeps the note.
// ─────────────────────────────────────────────────────────────────────────────

export const CZ_CUZK = {
  dsm: 'https://ags.cuzk.gov.cz/arcgis2/rest/services/dmp1g/ImageServer',
  dtm: 'https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer',
  crs: 'EPSG:4326',           // exportImage is asked for 4326 in AND out; the degree-gridded raster feeds mdsHeightForBuilding unchanged
  format: 'tiff',
  pixelType: 'F32',
  nodata: -9999,              // passed as `noData=` and read back as GDAL_NODATA (probed)
  servicePixelM: 2,           // the services' own pixelSizeX/Y; a ~1 m request is a server-side bilinear resample of it
  maxWidth: 15000,            // maxImageWidth (probed, both services)
  maxHeight: 4100,            // maxImageHeight (probed, both services) — the binding axis for a 0.01° cell
  heightSourceTag: 'cuzk-dmp1g-dmr5g-ndsm',
  attribution: '© ČÚZK — DMP 1G / DMR 5G (open data)',
};

/** The verbatim refusal body ags.cuzk.gov.cz answers (HTTP 200!) to an oversize exportImage, 2026-09-05. */
export const CZ_CUZK_OVERSIZE_REFUSAL_VERBATIM =
  '{"error":{"code":400,"extendedCode":-2147024809,"message":"Invalid or missing input parameters.","details":["The requested image exceeds the size limit."]}}';

export const M_PER_DEG_LAT = 111320;
export const mPerDegLon = (lat) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/**
 * Pixel dimensions for an exportImage over `[w,s,e,n]` at ~`resM` metres per pixel, capped at the
 * service maxima on each axis (the service refuses more — see CZ_CUZK_OVERSIZE_REFUSAL_VERBATIM).
 * Never below 2 px so a degenerate box still decodes. Sized from METRES so the pixel aspect matches
 * the ground aspect and ArcGIS's extent re-fit stays sub-pixel.
 */
export function cuzkPxDims([w, s, e, n], resM = 1.0, { maxWidth = CZ_CUZK.maxWidth, maxHeight = CZ_CUZK.maxHeight } = {}) {
  const midLat = (s + n) / 2;
  const widthM = Math.abs(e - w) * mPerDegLon(midLat);
  const heightM = Math.abs(n - s) * M_PER_DEG_LAT;
  const width = Math.max(2, Math.min(maxWidth, Math.round(widthM / resM)));
  const height = Math.max(2, Math.min(maxHeight, Math.round(heightM / resM)));
  return { width, height };
}

/**
 * ArcGIS ImageServer `exportImage` URL for ONE service over a WGS84 `[w,s,e,n]` box.
 * ⚠ AXIS ORDER: `bbox=xmin,ymin,xmax,ymax` = LON,LAT (the opposite of WMS 1.3.0 / WFS urn:EPSG::4326).
 * Live-verified 2026-09-05: `bbox=14.415,50.085,14.425,50.091` returned a GeoTIFF whose georeferenced
 * extent read back as [14.415, 50.08321, 14.425, 50.09279]. `noData=-9999` makes the void explicit;
 * `pixelType=F32` keeps metres as floats (the default would quantise); `f=image` returns bytes.
 */
export function cuzkExportImageUrl(service, [w, s, e, n], { width, height }, { nodata = CZ_CUZK.nodata } = {}) {
  return `${service}/exportImage?bbox=${w},${s},${e},${n}&bboxSR=4326&imageSR=4326&size=${width},${height}` +
    `&format=${CZ_CUZK.format}&pixelType=${CZ_CUZK.pixelType}&noData=${nodata}&interpolation=RSP_BilinearInterpolation&f=image`;
}

/**
 * The service's `?f=json` metadata → a verdict the stamp can refuse on BEFORE fetching a raster:
 * `{ ok, pixelType, maxWidth, maxHeight, nativeWkid, copyright, reason }`. `ok` is false when the body
 * is not the ImageServer document or the pixel type is not F32 (an 8-bit rendered service would decode
 * fine and stamp garbage). Returns **null** for an unparseable body — UNKNOWN, never "not ok".
 */
export function cuzkServiceVerdict(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  if (j.error) return { ok: false, reason: `service error ${j.error.code ?? ''}: ${j.error.message ?? ''}`.trim() };
  const pixelType = j.pixelType ?? null;
  const out = {
    ok: pixelType === 'F32', pixelType,
    maxWidth: Number(j.maxImageWidth) || null, maxHeight: Number(j.maxImageHeight) || null,
    nativeWkid: j.spatialReference?.latestWkid ?? j.spatialReference?.wkid ?? null,
    copyright: j.copyrightText ?? null, pixelSizeM: Number(j.pixelSizeX) || null,
  };
  if (!out.ok) out.reason = `pixelType ${pixelType} is not F32 — the service would not serve metres`;
  return out;
}

/**
 * ags.cuzk.gov.cz refuses INSIDE an HTTP 200: an oversize / malformed exportImage answers a JSON
 * `{"error":{…}}` body with the TIFF content-type absent. Returns the refusal message, or **null** when
 * the body is not such a document (a real TIFF starts with `II*` / `MM\0*`, never `{`).
 */
export function parseCuzkRefusal(text) {
  if (typeof text !== 'string' || !text.trimStart().startsWith('{')) return null;
  try {
    const j = JSON.parse(text);
    if (!j?.error) return null;
    const details = Array.isArray(j.error.details) ? j.error.details.join('; ') : '';
    return `${j.error.code ?? ''} ${j.error.message ?? ''}${details ? ' — ' + details : ''}`.trim();
  } catch { return null; }
}

/**
 * nDSM = DSM − DTM, pixel for pixel, as a NEW raster in the shared `{ width, height, values, bboxNative }`
 * shape (so `mdsHeightForBuilding` samples it like the ES MDS / FR MNH single-value rasters). A pixel is
 * NaN where EITHER input is the nodata sentinel or non-finite; the bilinear sampler drops NaN instead of
 * blending it (the L-422 family). Returns **null** when the two rasters do not share dimensions and
 * extent (a mismatched pair is a pipeline defect, not a void) — never a best-effort difference.
 */
export function ndsmDifference(dsm, dtm, { nodata = CZ_CUZK.nodata, extentTolDeg = 1e-6 } = {}) {
  if (!dsm || !dtm || dsm.width !== dtm.width || dsm.height !== dtm.height) return null;
  if (!Array.isArray(dsm.bboxNative) || !Array.isArray(dtm.bboxNative)) return null;
  for (let i = 0; i < 4; i++) if (Math.abs(dsm.bboxNative[i] - dtm.bboxNative[i]) > extentTolDeg) return null;
  const n = dsm.width * dsm.height;
  if (dsm.values.length !== n || dtm.values.length !== n) return null;
  const values = new Float32Array(n);
  let masked = 0;
  for (let i = 0; i < n; i++) {
    const a = dsm.values[i], b = dtm.values[i];
    if (a === nodata || b === nodata || !Number.isFinite(a) || !Number.isFinite(b)) { values[i] = NaN; masked++; continue; }
    values[i] = a - b;
  }
  return { width: dsm.width, height: dsm.height, values, bboxNative: dsm.bboxNative.slice(), masked };
}

// ─────────────────────────────────────────────────────────────────────────────
// §CZ-CITY-BBOXES — the `czechia` national row's stamp working set (the CZ analogue of
// MDS_CITY_BBOXES / MNH_FR_CITY_BBOXES / SWISS_CITY_BBOXES, mandatory for the same reason: §HEIGHT-
// STAMP-BUDGET / L-659 — a whole-country join with no bounded area holds every Czech footprint in the
// V8 heap). Footprints outside these bboxes stream through with their original OSM tags — never a
// fabricated height. Each bbox costs ≈ its populated 0.01° cells × 2 exportImage GETs (~2.4 MB and
// ~1.3 s each at ~1 m).
//
// PROVENANCE: terrain.mjs has NO `cz` city rows (only the national `czechia` row, probe Prague
// 14.42,50.09), so there is no §MDS-BBOX-MUST-COVER-THE-REGION twin to equal; czHeights.spec.ts pins
// instead that every bbox lies INSIDE the bake.mjs `czechia` row and that the CI spot-check point
// (Prague Old Town Square) lies inside `prague`. Tight metro-core extents centred on the city.
// ─────────────────────────────────────────────────────────────────────────────
export const CZ_CITY_BBOXES = [
  // city         [w, s, e, n] (WGS84, osmium -b order)
  { city: 'prague',   bbox: [14.35, 50.04, 14.52, 50.13] },   // Old Town Square 14.4213,50.0875 (CI gate row)
  { city: 'brno',     bbox: [16.55, 49.16, 16.66, 49.23] },
  { city: 'ostrava',  bbox: [18.20, 49.79, 18.32, 49.86] },
  { city: 'plzen',    bbox: [13.33, 49.72, 13.42, 49.77] },
  { city: 'olomouc',  bbox: [17.22, 49.57, 17.30, 49.62] },
];
