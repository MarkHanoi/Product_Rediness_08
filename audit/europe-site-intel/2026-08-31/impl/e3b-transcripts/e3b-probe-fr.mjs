// E3b PROBE — FR MNH LiDAR HD (pre-computed normalised height model, IGN Geoplateforme).
// Reuses repo machinery: fetchBdTopo (footprints + hauteur) + mdsHeightForBuilding (zonal P90).
// Raster via the SAME WMS-R image/geotiff GetMap pattern terrain.mjs already uses for RGE ALTI.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { writeFileSync } from 'fs';

const HS_PATH = 'C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/context-bake/heightSources.mjs';
const HS = await import(pathToFileURL(HS_PATH).href);
const req = createRequire(HS_PATH);
const geotiff = await import(pathToFileURL(req.resolve('geotiff')).href);

const LAYER = 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G';
const AOI = { city: 'paris-marais', bbox: [2.345, 48.850, 2.357, 48.858] }; // repo Paris control point 2.349,48.853 (reproject.mjs)
const out = { probedAt: new Date().toISOString(), layer: LAYER, endpoint: 'https://data.geopf.fr/wms-r/wms', aoi: AOI };

function wmsUrl([w, s, e, n], { crs, W, H, style = 'normal' }) {
  const order = crs === 'CRS:84' ? [w, s, e, n] : [s, w, n, e]; // WMS 1.3.0 EPSG:4326 = lat,lon
  return `https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${LAYER}&STYLES=${style}` +
    `&CRS=${crs}&BBOX=${order.join(',')}&WIDTH=${W}&HEIGHT=${H}&FORMAT=${encodeURIComponent('image/geotiff')}`;
}

const [w, s, e, n] = AOI.bbox;
const midLat = (s + n) / 2;
const mPerDegLon = 111320 * Math.cos((midLat * Math.PI) / 180), mPerDegLat = 111320;
// ~0.55 m/px keeps the scale denominator (~2000) inside the layer's [0.019, 2511] window.
const W = Math.round(((e - w) * mPerDegLon) / 0.55), H = Math.round(((n - s) * mPerDegLat) / 0.55);
out.pxDims = { W, H };

let raster = null;
for (const crs of ['CRS:84', 'EPSG:4326']) {
  const url = wmsUrl(AOI.bbox, { crs, W, H });
  const t0 = Date.now();
  const resp = await fetch(url);
  const ab = await resp.arrayBuffer();
  const attempt = { crs, httpStatus: resp.status, contentType: resp.headers.get('content-type'), bytes: ab.byteLength, ms: Date.now() - t0 };
  out.fetchAttempts = out.fetchAttempts ?? []; out.fetchAttempts.push(attempt);
  if (resp.status !== 200 || !/tiff/i.test(attempt.contentType ?? '')) {
    attempt.bodyHead = Buffer.from(ab.slice(0, 300)).toString('utf8'); console.log('attempt failed', JSON.stringify(attempt)); continue;
  }
  try {
    const tiff = await geotiff.fromArrayBuffer(ab.slice(0));
    const img = await tiff.getImage();
    const [vals] = await img.readRasters();
    const gbox = img.getBoundingBox();
    let finite = 0, gt2 = 0, mx = -Infinity, sum = 0;
    for (const v of vals) { if (Number.isFinite(v) && Math.abs(v) < 1000) { finite++; sum += v; if (v > mx) mx = v; if (v > 2) gt2++; } }
    attempt.raster = { width: img.getWidth(), height: img.getHeight(), bboxNative: gbox,
      finiteFrac: +(finite / vals.length).toFixed(3), meanM: +(sum / Math.max(1, finite)).toFixed(2),
      maxM: +mx.toFixed(2), fracAbove2m: +(gt2 / vals.length).toFixed(3), sample0: vals[0] };
    // internal raster shape mdsHeightForBuilding expects: bboxNative in lon/lat
    const looksLonLat = gbox[0] >= w - 0.01 && gbox[2] <= e + 0.01;
    const bboxNative = looksLonLat ? gbox : [gbox[1], gbox[0], gbox[3], gbox[2]];
    raster = { width: img.getWidth(), height: img.getHeight(), values: Float32Array.from(vals), bboxNative };
    attempt.usedAsLonLat = looksLonLat;
    console.log('MNH raster OK', JSON.stringify(attempt.raster));
    break;
  } catch (err) { attempt.readError = String(err.message); console.log('read error', attempt.readError); }
}

// BD TOPO hauteur over the same AOI (repo's CURRENT FR height signal)
const t1 = Date.now();
const bd = await HS.fetchBdTopo(AOI.bbox, { limit: 5000 });
out.bdtopo = { status: bd.status, ms: Date.now() - t1, rawCount: bd.rawCount, withHauteur: bd.features?.length, truncated: bd.truncated, reason: bd.reason };
console.log('bdtopo', JSON.stringify(out.bdtopo));

if (raster && bd.status === 'ok') {
  const rows = [], deltas = [], signed = [];
  let sampled = 0, noSample = 0;
  for (const f of bd.features) {
    const g = f.geometry; if (!g) continue;
    let rings = null;
    if (g.type === 'Polygon') rings = g.coordinates;
    else if (g.type === 'MultiPolygon') { let best = null, bestN = 0; for (const p of g.coordinates) if (p[0]?.length > bestN) { bestN = p[0].length; best = p; } rings = best; }
    if (!rings?.[0]) continue;
    const hAttr = Number(f.properties?.height);
    const z = HS.mdsHeightForBuilding(rings[0], rings.slice(1), raster, { erodeM: 1.0, percentile: 90, minSamples: 3, sampleStepM: 1.0 });
    if (z) { sampled++; if (Number.isFinite(hAttr) && hAttr > 0) { rows.push({ hauteur: hAttr, mnhP90: +z.height.toFixed(2), samples: z.samples }); deltas.push(Math.abs(z.height - hAttr)); signed.push(z.height - hAttr); } }
    else noSample++;
  }
  deltas.sort((a, b) => a - b); signed.sort((a, b) => a - b);
  const P = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.round((p / 100) * (arr.length - 1)))] : null;
  out.zonal = { footprintsWithHauteur: bd.features.length, mnhSampled: sampled, mnhNoSample: noSample, comparedN: deltas.length,
    absDelta_P50: P(deltas, 50) != null ? +P(deltas, 50).toFixed(2) : null,
    absDelta_P90: P(deltas, 90) != null ? +P(deltas, 90).toFixed(2) : null,
    signedDelta_P50: P(signed, 50) != null ? +P(signed, 50).toFixed(2) : null, signedDelta_P10: P(signed, 10) != null ? +P(signed, 10).toFixed(2) : null, signedDelta_P90s: P(signed, 90) != null ? +P(signed, 90).toFixed(2) : null, within2m_frac: deltas.length ? +(deltas.filter((d) => d <= 2).length / deltas.length).toFixed(3) : null,
    within3m_frac: deltas.length ? +(deltas.filter((d) => d <= 3).length / deltas.length).toFixed(3) : null,
    exampleRows: rows.slice(0, 10) };
  console.log('zonal', JSON.stringify(out.zonal));
} else {
  out.zonal = { verdict: 'NOT-RUN', reason: raster ? `bdtopo ${bd.status}: ${bd.reason ?? ''}` : 'no usable MNH raster fetched' };
  console.log('zonal NOT-RUN', JSON.stringify(out.zonal));
}
writeFileSync(new URL('./e3b-fr-results.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('WROTE e3b-fr-results.json');
