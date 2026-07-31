// PROBE 03 — retrieve real terrain over the Murcia target parcel + surround and derive
// elevation range / slope / aspect, WITH the posting spacing that produced each number.
//
// Method notes (state these with every figure):
//  * Source requested in its NATIVE projected CRS (EPSG:25830, ETRS89/UTM30N) so one pixel step is a
//    known ground distance in metres — no reprojection blur between the grid and the statistic.
//  * Slope by the Horn (1981) 3x3 kernel, the standard for DEM slope; computed per interior cell,
//    reported as a distribution (n, mean, median, p90, max) not a single scalar.
//  * Aspect as the CIRCULAR mean of downslope azimuth, weighted by slope magnitude (an unweighted
//    mean of azimuths on a near-flat cell is noise; weighting lets the real trend dominate).
//  * The SAME window is measured at 5 m and at 25 m so the resolvability claim is demonstrated,
//    not asserted.
//
// Run:  node tools/murcia-terrain-probe/probe-03-terrain.mjs

import { probeFetch, isTiff, owsException, loadGeoTiff, loadProj4, saveJson, saveBin, SITE } from './lib.mjs';

const MDT = 'https://servicios.idee.es/wcs-inspire/mdt';
const crsUri = (e) => `http://www.opengis.net/def/crs/EPSG/0/${e}`;

const proj4 = await loadProj4();
// ETRS89 / UTM zone 30N — the native grid for Murcia. GRS80 ellipsoid, ETRS89 datum.
proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toUtm = proj4('EPSG:4326', 'EPSG:25830');
const centre = toUtm.forward([SITE.lon, SITE.lat]); // [E, N]
console.log(`site ${SITE.lat},${SITE.lon} -> EPSG:25830 E=${centre[0].toFixed(2)} N=${centre[1].toFixed(2)}`);

/** GetCoverage a projected MDT coverage over a native-metre box -> decoded raster. */
async function fetchMdt(coverageId, [minE, minN, maxE, maxN]) {
  const url = `${MDT}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${coverageId}`
    + `&FORMAT=image/tiff&SUBSET=x(${minE},${maxE})&SUBSET=y(${minN},${maxN})`
    + `&SUBSETTINGCRS=${crsUri('25830')}&OUTPUTCRS=${crsUri('25830')}`;
  const r = await probeFetch(url, { label: `getcov:${coverageId}`, accept: 'image/tiff', binary: true, timeoutMs: 120_000 });
  // ── payload validation: NEVER trust the status code (the truncated-but-200 lesson).
  const tiff = isTiff(r.buf);
  const exc = tiff ? null : owsException(r.buf?.toString('utf8'));
  const verdict = !r.ok ? `HTTP ${r.status}` : tiff ? 'tiff-ok' : exc ? 'ows-exception-behind-200' : 'non-tiff-200';
  if (!tiff) return { url, verdict, status: r.status, bytes: r.bytes, exception: exc, head: r.head };

  const { fromArrayBuffer } = await loadGeoTiff();
  const t = await fromArrayBuffer(r.buf.buffer.slice(r.buf.byteOffset, r.buf.byteOffset + r.buf.length));
  const img = await t.getImage();
  const [data] = await img.readRasters();
  const bbox = img.getBoundingBox();          // [minX,minY,maxX,maxY] in the file's CRS
  const [rx, ry] = img.getResolution();       // ground units per pixel — the ACTUAL delivered posting
  return {
    url, verdict, status: r.status, bytes: r.bytes, cached: r.cached,
    width: img.getWidth(), height: img.getHeight(),
    resX: Math.abs(rx), resY: Math.abs(ry), bbox,
    noData: img.getGDALNoData?.() ?? null,
    values: Float64Array.from(data, Number),
  };
}

/** Horn 3x3 slope + aspect over a regular grid. Returns per-cell arrays plus the window stats. */
function slopeAspect(g) {
  const { values: z, width: W, height: H, resX, resY, noData } = g;
  const bad = (v) => v == null || !Number.isFinite(v) || (noData != null && v === noData)
    || v < -200 || v > 4000; // Spain's real range; anything outside is a sentinel, NOT an elevation
  const slopes = [], asp = [];
  let sinSum = 0, cosSum = 0, wSum = 0;
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      const k = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) k.push(z[(r + dr) * W + (c + dc)]);
      if (k.some(bad)) continue;
      const [a, b, cc, d, , f, gg, h, i] = k;                 // NW N NE W C E SW S SE
      const dzdx = ((cc + 2 * f + i) - (a + 2 * d + gg)) / (8 * resX);
      const dzdy = ((gg + 2 * h + i) - (a + 2 * b + cc)) / (8 * resY);
      const rise = Math.hypot(dzdx, dzdy);
      slopes.push(rise);
      // Downslope azimuth, clockwise from north = bearing of the downhill vector (-dzdx,-dzdy).
      // NOTE probe 04 supersedes this file's figures (it reads the FLOAT encoding); kept for the
      // int16-vs-float comparison only.
      const az = (Math.atan2(-dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
      asp.push(az);
      const rad = az * Math.PI / 180;
      sinSum += Math.sin(rad) * rise; cosSum += Math.cos(rad) * rise; wSum += rise;
    }
  }
  const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const meanSlope = slopes.length ? slopes.reduce((a, b) => a + b, 0) / slopes.length : null;
  const meanAz = wSum > 0 ? (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360 : null;
  const zs = [...z].filter((v) => !bad(v));
  return {
    nSlopeCells: slopes.length, nElevSamples: zs.length,
    elevMin: zs.length ? Math.min(...zs) : null, elevMax: zs.length ? Math.max(...zs) : null,
    elevMean: zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null,
    slopeMeanPct: meanSlope == null ? null : meanSlope * 100,
    slopeMedianPct: pct(slopes, 0.5) == null ? null : pct(slopes, 0.5) * 100,
    slopeP90Pct: pct(slopes, 0.9) == null ? null : pct(slopes, 0.9) * 100,
    slopeMaxPct: slopes.length ? Math.max(...slopes) * 100 : null,
    slopeMeanDeg: meanSlope == null ? null : Math.atan(meanSlope) * 180 / Math.PI,
    aspectMeanDeg: meanAz,
    aspectCompass: meanAz == null ? null : ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(meanAz / 22.5) % 16],
  };
}

// ── Windows: a 1 km context box (slope/aspect trend) and a 120 m plot box (what the plot itself does)
const WINDOWS = [
  { name: 'context-1km', half: 500 },
  { name: 'plot-120m',   half: 60 },
];
const COVERAGES = [
  { id: 'Elevacion25830_5',  nominal: 5 },
  { id: 'Elevacion25830_25', nominal: 25 },
];

const results = [];
for (const w of WINDOWS) {
  const box = [centre[0] - w.half, centre[1] - w.half, centre[0] + w.half, centre[1] + w.half];
  for (const cov of COVERAGES) {
    const g = await fetchMdt(cov.id, box);
    if (g.verdict !== 'tiff-ok') {
      console.log(`\n[${w.name} @ ${cov.id}] FAILED verdict=${g.verdict} status=${g.status} bytes=${g.bytes}`);
      results.push({ window: w.name, coverage: cov.id, ...g, values: undefined });
      continue;
    }
    const stats = slopeAspect(g);
    const spanM = w.half * 2;
    const cellsAcross = spanM / g.resX;
    console.log(`\n[${w.name} @ ${cov.id}] ${g.width}x${g.height}px  delivered posting ${g.resX} x ${g.resY} m  (nominal ${cov.nominal} m)`);
    console.log(`  window ${spanM} m across = ${cellsAcross.toFixed(1)} cells`);
    console.log(`  elev  n=${stats.nElevSamples}  min=${stats.elevMin?.toFixed(2)}  max=${stats.elevMax?.toFixed(2)}  mean=${stats.elevMean?.toFixed(2)} m`);
    console.log(`  slope n=${stats.nSlopeCells}  mean=${stats.slopeMeanPct?.toFixed(2)}%  median=${stats.slopeMedianPct?.toFixed(2)}%  p90=${stats.slopeP90Pct?.toFixed(2)}%  max=${stats.slopeMaxPct?.toFixed(2)}%`);
    console.log(`  aspect ${stats.aspectMeanDeg?.toFixed(1)}deg (${stats.aspectCompass})`);
    saveBin(`${w.name}_${cov.id}.tif.cached`, Buffer.from([]));
    results.push({
      window: w.name, windowSpanM: spanM, coverage: cov.id, nominalPostingM: cov.nominal,
      deliveredPostingM: { x: g.resX, y: g.resY }, gridPx: { w: g.width, h: g.height },
      cellsAcrossWindow: cellsAcross, bbox: g.bbox, noData: g.noData, url: g.url, ...stats,
    });
  }
}

saveJson('out-03-terrain.json', {
  site: SITE, siteUtm30n: { E: centre[0], N: centre[1] }, probedAt: new Date().toISOString(),
  method: 'WCS 2.0.1 GetCoverage in native EPSG:25830; Horn 3x3 slope; slope-weighted circular-mean aspect',
  results,
});
console.log('\nwrote out-03-terrain.json');
