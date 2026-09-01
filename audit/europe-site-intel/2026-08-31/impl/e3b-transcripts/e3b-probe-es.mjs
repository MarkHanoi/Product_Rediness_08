// E3b PROBE — ES MDSnE (mdsn_e025) pre-computed building-height raster.
// Reuses the repo's EXISTING adapter (tools/context-bake/heightSources.mjs) — no rival built.
// (1) raw GetCoverage tile over Barcelona + Madrid AOIs (repo MDS_CITY_BBOXES sub-boxes)
// (2) fetchSpainBuildingHeights = Catastro footprints x MDSnE zonal stats (P90 eroded interior)
// (3) cross-compare measured MDS height vs Catastro floors (repo's current fallback signal)
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { writeFileSync } from 'fs';

const HS_PATH = 'C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/context-bake/heightSources.mjs';
const HS = await import(pathToFileURL(HS_PATH).href);
const req = createRequire(HS_PATH);
const geotiff = await import(pathToFileURL(req.resolve('geotiff')).href);

const AOIS = [
  { city: 'barcelona-eixample', bbox: [2.160, 41.390, 2.176, 41.402] }, // inside MDS_CITY_BBOXES barcelona [2.05,41.32,2.24,41.47]
  { city: 'madrid-centro',      bbox: [-3.712, 40.418, -3.696, 40.430] }, // inside madrid [-3.80,40.33,-3.58,40.52]
];

const out = { probedAt: new Date().toISOString(), endpoint: 'https://wcs-mds.idee.es/mds COVERAGEID=mdsn_e025', aois: [] };

function mdsUrl([w, s, e, n]) {
  return 'https://wcs-mds.idee.es/mds?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=mdsn_e025' +
    `&FORMAT=image/tiff&SUBSET=lat(${s},${n})&SUBSET=long(${w},${e})` +
    '&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326';
}

for (const { city, bbox } of AOIS) {
  const rec = { city, bbox };
  // (1) raw tile — prove a REAL raster comes back
  const t0 = Date.now();
  const resp = await fetch(mdsUrl(bbox));
  const ab = await resp.arrayBuffer();
  rec.rawTile = { httpStatus: resp.status, contentType: resp.headers.get('content-type'), bytes: ab.byteLength, ms: Date.now() - t0 };
  const magic = new DataView(ab).getUint16(0, false);
  rec.rawTile.tiffMagic = magic === 0x4949 || magic === 0x4D4D; // II / MM
  try {
    const tiff = await geotiff.fromArrayBuffer(ab.slice(0));
    const img = await tiff.getImage();
    const [vals] = await img.readRasters();
    let finite = 0, gt2 = 0, mx = -Infinity, sum = 0;
    for (const v of vals) { if (Number.isFinite(v) && Math.abs(v) < 1000) { finite++; sum += v; if (v > mx) mx = v; if (v > 2) gt2++; } }
    rec.rawTile.raster = { width: img.getWidth(), height: img.getHeight(), bboxNative: img.getBoundingBox(),
      finiteFrac: +(finite / vals.length).toFixed(3), meanM: +(sum / Math.max(1, finite)).toFixed(2),
      maxM: +mx.toFixed(2), fracAbove2m: +(gt2 / vals.length).toFixed(3) };
  } catch (e) { rec.rawTile.readError = String(e.message); }
  console.log(`[${city}] rawTile HTTP ${rec.rawTile.httpStatus} ${rec.rawTile.bytes}B tiff=${rec.rawTile.tiffMagic}`, rec.rawTile.raster ?? rec.rawTile.readError);

  // (2)+(3) the repo's own zonal-stats pipeline over Catastro footprints
  const t1 = Date.now();
  const r = await HS.fetchSpainBuildingHeights(bbox, { buildingCap: 1500 });
  rec.pipeline = { status: r.status, ms: Date.now() - t1, footprintCount: r.footprintCount, measuredCount: r.measuredCount,
    coverage: r.coverage, heightStats: r.heightStats, tilesProcessed: r.tilesProcessed, tileErrors: r.tileErrors,
    catastroErrors: r.catastroErrors, truncated: r.truncated, note: r.note, reason: r.reason };
  console.log(`[${city}] pipeline`, JSON.stringify(rec.pipeline));

  // cross-compare MDS measured height vs Catastro floor count x 3.2 m (repo's current derived-levels signal)
  if (r.status === 'ok') {
    const deltas = [], mPerFloor = [];
    for (const f of r.features) {
      const h = Number(f.properties?.height), fl = Number(f.properties?.['building:levels']);
      if (Number.isFinite(h) && h > 0 && Number.isFinite(fl) && fl > 0) {
        deltas.push(Math.abs(h - fl * 3.2)); mPerFloor.push(h / fl);
      }
    }
    deltas.sort((a, b) => a - b); mPerFloor.sort((a, b) => a - b);
    const P = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.round((p / 100) * (arr.length - 1)))] : null;
    rec.crossCheck = { nBoth: deltas.length,
      absDeltaVsFloorsX32_P50: P(deltas, 50) != null ? +P(deltas, 50).toFixed(2) : null,
      absDeltaVsFloorsX32_P90: P(deltas, 90) != null ? +P(deltas, 90).toFixed(2) : null,
      observedMetresPerFloor_P50: P(mPerFloor, 50) != null ? +P(mPerFloor, 50).toFixed(2) : null,
      within3m_frac: deltas.length ? +(deltas.filter((d) => d <= 3).length / deltas.length).toFixed(3) : null };
    console.log(`[${city}] crossCheck`, JSON.stringify(rec.crossCheck));
  }
  out.aois.push(rec);
}
writeFileSync(new URL('./e3b-es-results.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('WROTE e3b-es-results.json');
