// ─────────────────────────────────────────────────────────────────────────────
// §ADSDI-NDSM (2026-09-05, lane ME-ABUDHABI-I3S) — Abu Dhabi **50 cm DSM − DTM** (Department of Government
// Enablement, Abu Dhabi Spatial Data Infrastructure): the PURE, dependency-free half of the FIRST licensed
// per-building measured-height stamp in the Gulf. The network/raster half is `stampAdNdsmHeightsOnGeojsonseq`
// in heights/abudhabiNdsmStamp.mjs (the czHeightsStamp precedent — heightSources.mjs is a many-lane file and
// vitest cannot import it, so every DECISION lives here as a total function of its arguments and is
// unit-tested by abudhabiNdsm.spec.ts).
//
// ⛔ WHY THIS IS NOT THE I3S STAMP THE BRIEF NAMED — THE LICENCE READ (2026-09-05, every line a measurement):
//   • The previous lane found `Hosted/abu_dhabi_3d_city_model/SceneServer` (I3S 1.6, keyless, per-building
//     MaxHeight). Its portal item 1a83d67b4ac24411bd37a20c93c74156 (`sharing/rest/content/items/…?f=json`, HTTP 200
//     1,077 B) reads `"licenseInfo":null,"accessInformation":null,"access":"public","listed":false`; the layer's
//     `copyrightText` is null; ALL 18 `owner:adsdiadmin type:"Scene Service"` items read licenseInfo null.
//   • The SDI Data Catalog Terms and Conditions (sdi.gov.abudhabi/sdi/locales/en/translation.json, 66,946 B —
//     saved VERBATIM as __tests__/fixtures/ae-adsdi-sdi-terms-and-conditions-clauses-2026-09-05.json) say:
//       §8.2 "Unless explicitly stated in these Terms and Conditions, nothing in these Terms should be construed as
//            conferring any license to intellectual property rights, whether by estoppel, implication, or otherwise."
//       §8.3 "Except as part of the intended use of the SDI Data Catalog permitted by these Terms and Conditions or as
//            otherwise expressly permitted in writing by DGE, you may not copy, download, use, redesign, reconfigure,
//            or retransmit anything from the SDI Data Catalog without DGE's express prior written consent."
//       Access to Data · Open Data: "Users are permitted to download, use, and integrate Open Data within their own
//            business operations, subject to these Terms and Conditions and any other accompanying licenses. When
//            utilizing Open Data, users should credit the SDI Data Catalog as the source, unless indicated otherwise."
//       Definitions · "Open Data": "geospatial data that is made available to the public, free of charge and without
//            restrictions on its use, redistribution, or adaptation."
//     The permission is therefore SCOPED to datasets the catalogue classifies "Open Data". The 3D city model is in
//     NEITHER catalogue list (`Datacatalogue_API/api/DataCatalogueList/webdatacataloguelist` 670 entries 920,030 B ·
//     `…/DGEDataCatalogue` 704 entries 479,753 B — no "3D", "city model", "mesh" or "LOD" entry; the two lists
//     classify 215 / 234 layers Open Data, 444 / 458 Confidential, 7 / 8 Restricted). An uncatalogued item shared
//     "public" on the portal is a SHARING LEVEL, not a licence class — under §8.2/§8.3 reuse of the I3S model is
//     NOT permitted without DGE's written consent. ⛔ The I3S stamp is REFUSED; nothing is read from it.
//   • The SAME catalogue classifies **sid 2012 `50CM_AD_DSM_DTM`** and **sid 2013 `50CM_DSM_PartsOfAbuDhabiEmirate`**
//     as **"Open Data"** (custodian "Department of Government Enablement", layer_type "Satellite Imagery", geometry
//     "Raster"; records verbatim in __tests__/fixtures/ae-adsdi-datacatalogue-building-dsm-dtm-records-2026-09-05.json)
//     — and the portal serves that dataset's rasters keylessly as ImageServers (portal search `q=DSM` → 9 items,
//     `type:"Image Service"` → 8: IMGSER_AUH_DSM1…7_50CM + IMGSER_AUH_DTM_50CM, every one access public). The
//     `Sat/50CM_AD_DSM_DTM/MapServer` (documentInfo Keywords "DSM,DTM,50CM") lists the SAME tiles by file name
//     (AUH_DSM_PART1…8.TIF, AUH_DTM.TIF); the ImageServer names carry the same part numbers. INFERENCE, stated
//     as one: the ImageServers are the pixel-serving form of the catalogued Open Data dataset. Attribution owed:
//     "Abu Dhabi SDI Data Catalog (Department of Government Enablement)". THIS is the channel wired below.
//
// THE CHANNEL — LIVE-PROBED 2026-09-05 (every number a measurement; the two `?f=json` bodies are saved verbatim
// as __tests__/fixtures/ae-adsdi-imgser-auh-{dsm3,dtm}-50cm-imageserver-2026-09-05.json):
//   • https://arcgis.sdi.abudhabi.ae/agsimage/rest/services/ImageService/IMGSER_AUH_DSM3_50CM/ImageServer
//       HTTP 200 4,408 B · pixelType F32 · 1 band · pixelSize 0.4999999 m · native wkid 102100 / latestWkid 3857 ·
//       extent 6,037,116–6,241,416 × 2,674,607–2,875,914 m (≈ lon 54.23–56.06, lat 23.37–25.00 — the Abu Dhabi
//       metro mosaic; the whole bake `abudhabi` row 54.28–54.75 × 24.33–24.62 lies inside it) · minValues −17.2 ·
//       maxValues 1,168.8 · capabilities Image,Metadata,Pixels,Mensuration · maxImageWidth 15000 · maxImageHeight 4100.
//   • https://arcgis.sdi.abudhabi.ae/agsimage/rest/services/ImageService/IMGSER_AUH_DTM_50CM/ImageServer
//       HTTP 200 4,246 B · F32 · 0.5 m · 3857 · extent 6,040,000–6,240,871 × 2,740,000–2,874,238 m (≈ lon 54.26–56.06,
//       lat 23.90–24.99 — also covers the whole row) · minValues −9999 (a nodata sentinel inside the mosaic) ·
//       maxValues 1,168.6 · same caps.
//   • DSM1/2/4/5/6/7 are OTHER parts of the emirate (Al Ain, Al Dhafra, islands) — outside the bake row; not used.
//   • `exportImage` serves a **GeoTIFF in EPSG:4326** when asked (`bboxSR=4326&imageSR=4326&format=tiff&pixelType=F32
//     &noData=-9999`): the CI gate cell 54.369,24.449,54.381,24.461 at 1216×1336 px (~1 m) → HTTP 200 image/tiff
//     7,210,674 B (tiled 128×128, uncompressed, 110 tiles), **29.4 s (DSM) / 24.7 s (DTM)**; at 608×668 (~2 m) →
//     1,967,154 B in 22.1 s / 20.2 s — the server is resample-bound, not bandwidth-bound, so ~1 m is the honest
//     default and each populated cell costs ≈ 55 s. The served extent read back as [54.369, 24.448408, 54.381,
//     24.461592] — ArcGIS re-fits the bbox to the pixel aspect exactly as ags.cuzk.gov.cz does; the georeference
//     is read from the GeoTIFF, never assumed from the URL.
//   • **DSM3 − DTM IS a real nDSM** over that downtown cell: 1,624,576 px, 0 nodata → p10 −0.01 · p50 0.96 · p90 10.02 ·
//     p99 16.28 · max 82.0 m, 33.3 % of pixels > 3 m. DSM p50 4.45 m / DTM p50 2.66 m orthometric-ish (the island
//     is 1–7 m above sea). The DSM is catalogue-typed "Satellite Imagery": a satellite-stereo PHOTOGRAMMETRIC surface,
//     NOT LiDAR — the catalogue publishes no sensor, date or accuracy metadata (data_updated_year 0). The stamp
//     writes the repo's single measured marker (`pryzm:height_src=measured-lidar`, the value the client ranks
//     above `tagged`) because the metre IS measured, and names the method in `heightSource` so the tile carries
//     the truth: photogrammetric, 50 cm, DSM − DTM.
//   • REFUSAL SHAPE — an oversize request (size=100,5000) answers **HTTP 200 with content-type image/tiff and a 156 B
//     JSON body** `{"error":{"code":400,…,"details":["The requested image exceeds the size limit."]}}` (verbatim below).
//     ⚠ The content-type LIES here (ags.cuzk.gov.cz at least drops it); a stamp that trusts EITHER the status code
//     OR the content-type hands JSON to the TIFF decoder. The stamp sniffs the first bytes (`sniffBodyKind`).
//   • HOLLOW TIFF — a cell OUTSIDE the mosaic (53.30,24.90–53.31,24.91, 60 km offshore) answers **HTTP 200 image/tiff
//     994 B**: a well-formed 505×557 tiled GeoTIFF whose 20 TileByteCounts are ALL 0 and TileOffsets all 0 — no
//     pixels at all. geotiff.js throws "Offset is outside the bounds of the DataView" on it. That is the honest
//     EMPTY shape (no coverage), not a failure, and `hollowTiffVerdict` names it BEFORE readRasters; a PARTIALLY
//     hollow file (some tiles empty) is a server-side defect and is counted as an error, never differenced.
//     The FIRST 1 m fetch of the gate cell in this lane's own probe ALSO decoded with that error and the second
//     succeeded with 0 nodata — a transient partial answer from inside the mosaic exists; the stamp reports it by name.
//   • KEYLESS: no token, no referer, no account. No repo secret. `Res` and `ADP` folders on agspublish answer 499
//     Token Required — the OpenData/ImageService doors are the only ones used.
//   • The catalogued Open Data **BUILDING** layer (sid 1046, DMT; OpenData/ADSDI_OpenData/MapServer/353, keyless,
//     65,714 footprints in the row bbox) carries BUILDINGNUMBEROFFLOORS and NO height field — floors are the
//     derived-levels tier (the RÚIAN precedent: never stamped as a metre). Recorded, not wired.
// ─────────────────────────────────────────────────────────────────────────────

export const AD_ADSDI = {
  dsm: 'https://arcgis.sdi.abudhabi.ae/agsimage/rest/services/ImageService/IMGSER_AUH_DSM3_50CM/ImageServer',
  dtm: 'https://arcgis.sdi.abudhabi.ae/agsimage/rest/services/ImageService/IMGSER_AUH_DTM_50CM/ImageServer',
  crs: 'EPSG:4326',           // exportImage is asked for 4326 in AND out; the degree-gridded raster feeds mdsHeightForBuilding unchanged
  format: 'tiff',
  pixelType: 'F32',
  nodata: -9999,              // passed as `noData=` and read back as GDAL_NODATA "-9999" (probed)
  servicePixelM: 0.5,         // the services' own pixelSizeX/Y; a ~1 m request is a server-side bilinear resample of it
  maxWidth: 15000,            // maxImageWidth (probed, both services)
  maxHeight: 4100,            // maxImageHeight (probed, both services) — the binding axis for a 0.01° cell
  nativeWkid: 3857,           // latestWkid of both services; the mosaic extents below are in these metres
  // Mosaic extents in EPSG:3857 metres, VERBATIM from the two ?f=json bodies (fixtures). A cell that intersects
  // neither is refused BEFORE a request (the EA-LIDAR-GB "Scotland squares" precedent).
  mosaic3857: {
    dsm: [6037116.418121272, 2674606.900065266, 6241415.872782333, 2875914.1639316645],
    dtm: [6040000, 2740000, 6240870.5, 2874238],
  },
  heightSourceTag: 'adsdi-dsm50cm-dtm-ndsm-photogrammetric',
  attribution: 'Abu Dhabi SDI Data Catalog (Department of Government Enablement) — 50CM_AD_DSM_DTM (Open Data)',
  licence: 'SDI Data Catalog Terms and Conditions · Open Data class (sid 2012 / 2013): download, use and integrate permitted; credit the SDI Data Catalog as the source',
  method: 'satellite-stereo photogrammetric 50 cm DSM − DTM (catalogue layer_type "Satellite Imagery"; NOT LiDAR; sensor/date/accuracy not published)',
};

/** The verbatim refusal body arcgis.sdi.abudhabi.ae answers (HTTP 200, content-type image/tiff!) to an oversize exportImage, 2026-09-05. */
export const AD_ADSDI_OVERSIZE_REFUSAL_VERBATIM =
  '{"error":{"code":400,"extendedCode":-2147024809,"message":"Invalid or missing input parameters.","details":["The requested image exceeds the size limit."]}}';

export const M_PER_DEG_LAT = 111320;
export const mPerDegLon = (lat) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/**
 * Pixel dimensions for an exportImage over `[w,s,e,n]` at ~`resM` metres per pixel, capped at the service maxima
 * on each axis (the service refuses more — AD_ADSDI_OVERSIZE_REFUSAL_VERBATIM). Never below 2 px. Sized from
 * METRES so the pixel aspect matches the ground aspect and ArcGIS's extent re-fit stays sub-pixel.
 */
export function adNdsmPxDims([w, s, e, n], resM = 1.0, { maxWidth = AD_ADSDI.maxWidth, maxHeight = AD_ADSDI.maxHeight } = {}) {
  const midLat = (s + n) / 2;
  const widthM = Math.abs(e - w) * mPerDegLon(midLat);
  const heightM = Math.abs(n - s) * M_PER_DEG_LAT;
  const width = Math.max(2, Math.min(maxWidth, Math.round(widthM / resM)));
  const height = Math.max(2, Math.min(maxHeight, Math.round(heightM / resM)));
  return { width, height };
}

/**
 * ArcGIS ImageServer `exportImage` URL for ONE service over a WGS84 `[w,s,e,n]` box.
 * ⚠ AXIS ORDER: `bbox=xmin,ymin,xmax,ymax` = LON,LAT. Live-verified 2026-09-05: `bbox=54.369,24.449,54.381,24.461`
 * returned a GeoTIFF whose georeferenced extent read back as [54.369, 24.448408, 54.381, 24.461592].
 */
export function adNdsmExportImageUrl(service, [w, s, e, n], { width, height }, { nodata = AD_ADSDI.nodata } = {}) {
  return `${service}/exportImage?bbox=${w},${s},${e},${n}&bboxSR=4326&imageSR=4326&size=${width},${height}` +
    `&format=${AD_ADSDI.format}&pixelType=${AD_ADSDI.pixelType}&noData=${nodata}&interpolation=RSP_BilinearInterpolation&f=image`;
}

/**
 * The service's `?f=json` metadata → a verdict the stamp can refuse on BEFORE fetching a raster:
 * `{ ok, pixelType, maxWidth, maxHeight, nativeWkid, pixelSizeM, extent3857, reason }`. `ok` is false when the body
 * is an error document or the pixel type is not F32 (an 8-bit rendered service would decode fine and stamp
 * garbage). Returns **null** for an unparseable body — UNKNOWN, never "not ok".
 */
export function adNdsmServiceVerdict(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  if (j.error) return { ok: false, reason: `service error ${j.error.code ?? ''}: ${j.error.message ?? ''}`.trim() };
  const pixelType = j.pixelType ?? null;
  const ex = j.extent && typeof j.extent === 'object' ? [j.extent.xmin, j.extent.ymin, j.extent.xmax, j.extent.ymax].map(Number) : null;
  const out = {
    ok: pixelType === 'F32', pixelType,
    maxWidth: Number(j.maxImageWidth) || null, maxHeight: Number(j.maxImageHeight) || null,
    nativeWkid: j.spatialReference?.latestWkid ?? j.spatialReference?.wkid ?? null,
    pixelSizeM: Number.isFinite(Number(j.pixelSizeX)) ? Number(j.pixelSizeX) : null,
    extent3857: ex && ex.every(Number.isFinite) ? ex : null,
    copyright: j.copyrightText ?? null,
  };
  if (!out.ok) out.reason = `pixelType ${pixelType} is not F32 — the service would not serve metres`;
  return out;
}

/**
 * What an exportImage body IS, from its first bytes — because arcgis.sdi.abudhabi.ae labels its 156 B JSON refusal
 * `image/tiff` (probed). 'tiff' for the II*\0 / MM\0* magic, 'json' for a body whose first non-whitespace byte is
 * `{`, 'other' for anything else (HTML maintenance page, empty). Never throws; accepts Uint8Array / ArrayBuffer / Buffer.
 */
export function sniffBodyKind(bytes) {
  let u8;
  if (bytes instanceof Uint8Array) u8 = bytes;
  else if (bytes instanceof ArrayBuffer) u8 = new Uint8Array(bytes);
  else return 'other';
  if (u8.length >= 4) {
    const le = u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2a && u8[3] === 0x00;
    const be = u8[0] === 0x4d && u8[1] === 0x4d && u8[2] === 0x00 && u8[3] === 0x2a;
    if (le || be) return 'tiff';
  }
  let i = 0;
  while (i < u8.length && (u8[i] === 0x20 || u8[i] === 0x09 || u8[i] === 0x0a || u8[i] === 0x0d)) i++;
  if (i < u8.length && u8[i] === 0x7b) return 'json';
  return 'other';
}

/**
 * The refusal-inside-a-200 parser: returns the message of a `{"error":{…}}` body, or **null** when the text is not
 * such a document (a TIFF header, a non-error JSON, nothing).
 */
export function parseAdNdsmRefusal(text) {
  if (typeof text !== 'string' || !text.trimStart().startsWith('{')) return null;
  try {
    const j = JSON.parse(text);
    if (!j?.error) return null;
    const details = Array.isArray(j.error.details) ? j.error.details.join('; ') : '';
    return `${j.error.code ?? ''} ${j.error.message ?? ''}${details ? ' — ' + details : ''}`.trim();
  } catch { return null; }
}

/**
 * A GeoTIFF's tile/strip byte counts → `{ tiles, empty, hollow, partial }`. `hollow` (EVERY tile 0 bytes) is the
 * server's shape for a cell with NO coverage — an honest EMPTY, counted as a void cell; `partial` (some tiles 0)
 * is a defective answer — counted as an error, never differenced. Returns **null** for no counts at all
 * (UNKNOWN: the decoder decides).
 */
export function hollowTiffVerdict(byteCounts) {
  if (!byteCounts || typeof byteCounts.length !== 'number' || byteCounts.length === 0) return null;
  let empty = 0;
  for (let i = 0; i < byteCounts.length; i++) if (!(Number(byteCounts[i]) > 0)) empty++;
  return { tiles: byteCounts.length, empty, hollow: empty === byteCounts.length, partial: empty > 0 && empty < byteCounts.length };
}

/** WGS84 lon/lat → EPSG:3857 metres (the mosaic extents' frame). Pure spherical Mercator, R = 6378137. */
export function lonLatTo3857(lon, lat) {
  const R = 6378137;
  const x = (lon * Math.PI / 180) * R;
  const phi = Math.max(-89.9, Math.min(89.9, lat)) * Math.PI / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
}

/**
 * Does a WGS84 `[w,s,e,n]` cell intersect BOTH mosaics (DSM3 and DTM)? A cell that misses either can only answer
 * hollow (or nodata on one side, which `ndsmDifference` masks anyway), so the stamp refuses it before a request
 * and counts it as `outsideMosaic` — never a fetch, never an error.
 */
export function cellInsideMosaics([w, s, e, n], mosaics = AD_ADSDI.mosaic3857) {
  const [x0, y0] = lonLatTo3857(w, s);
  const [x1, y1] = lonLatTo3857(e, n);
  const hit = ([mx0, my0, mx1, my1]) => x1 >= mx0 && x0 <= mx1 && y1 >= my0 && y0 <= my1;
  return hit(mosaics.dsm) && hit(mosaics.dtm);
}

// nDSM = DSM − DTM pixel-for-pixel with the nodata / mismatch rules of the CZ module — REUSED, not re-implemented
// (§grep-for-the-existing-solver). The sentinel is the same −9999 on both servers.
export { ndsmDifference } from './czHeights.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// §AD-CITY-BBOXES — the `abudhabi` row's stamp working set (the CZ_CITY_BBOXES analogue; mandatory for the same
// reason: §HEIGHT-STAMP-BUDGET / L-659 — a whole-row join with no bounded area would hold every Overture footprint
// of the 0.47° × 0.29° row). Footprints outside these bboxes stream through with their original Overture tags —
// never a fabricated height. BUDGET, measured: each populated 0.01° cell costs 2 exportImage GETs of ~7.2 MB and
// ~27 s EACH (the server resamples 50 cm → 1 m; 2 m saves bandwidth, not time: 22 s / 20 s). The island core
// below is 9 × 7 = 63 cells → ≤ ~1 h if every cell is populated; widen it only with that number in the commit.
//
// PROVENANCE: terrain.mjs carries an `abudhabi` region row (group 'middleeast', [54.28,24.33,54.75,24.62] — the
// bake row's twin, pinned by middleEastTerrainRows.spec.ts), no city rows; abudhabiNdsm.spec.ts pins that every
// bbox lies INSIDE the bake `abudhabi` row, intersects BOTH mosaics, and that the CI spot-check point
// (Al Markaziyah, 54.3773,24.4539) AND the terrain.mjs `abudhabi` probe point [54.37, 24.47] both lie inside `abudhabi-core`.
// ─────────────────────────────────────────────────────────────────────────────
export const AD_CITY_BBOXES = [
  // city               [w, s, e, n] (WGS84, osmium -b order)
  { city: 'abudhabi-core', bbox: [54.33, 24.43, 54.42, 24.50] },   // Al Markaziyah / Corniche / Al Zahiyah — CI gate point 54.3773,24.4539
];
