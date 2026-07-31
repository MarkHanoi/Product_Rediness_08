// PROBE 04 — the DEFINITIVE terrain computation, on the FLOAT encoding.
//
// Probe 03 established that `FORMAT=image/tiff` on the IGN INSPIRE MDT WCS returns Int16 — a 1 m
// vertical quantisation that caps the smallest resolvable non-zero Horn slope at 1 m / (8*posting).
// `FORMAT=ArcGrid` (multipart, an ESRI ASCII grid part) returns the same coverage with real decimals.
// So EVERY figure here is computed on the float grid, and the int16-vs-float delta is reported as
// evidence rather than hidden.
//
// Two axes of fidelity must BOTH be stated for any slope number to mean anything:
//   HORIZONTAL posting spacing (how far apart the samples are), and
//   VERTICAL quantisation     (how finely each sample is recorded).
//
// Run:  node tools/murcia-terrain-probe/probe-04-terrain-float.mjs

import { probeFetch, loadProj4, saveJson, SITE } from './lib.mjs';

const MDT = 'https://servicios.idee.es/wcs-inspire/mdt';
const crsUri = (e) => `http://www.opengis.net/def/crs/EPSG/0/${e}`;

const proj4 = await loadProj4();
proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const fwd = proj4('EPSG:4326', 'EPSG:25830');
const centre = fwd.forward([SITE.lon, SITE.lat]);

/** Parse the ESRI ASCII grid out of the WCS multipart/related body. */
function parseAsc(text) {
  const i = text.search(/ncols\s+\d+/i);
  if (i < 0) return { error: 'no ESRI-ASCII header found in body', head: text.slice(0, 300) };
  let body = text.slice(i);
  const end = body.indexOf('--wcs--');
  if (end > 0) body = body.slice(0, end);
  const hdr = {};
  const re = /(ncols|nrows|xllcorner|yllcorner|cellsize|NODATA_value)\s+(-?[\d.]+)/gi;
  let m; let lastIdx = 0;
  while ((m = re.exec(body))) { hdr[m[1].toLowerCase()] = Number(m[2]); lastIdx = re.lastIndex; }
  const nums = body.slice(lastIdx).trim().split(/\s+/).map(Number).filter((v) => Number.isFinite(v));
  return {
    width: hdr.ncols, height: hdr.nrows, resX: hdr.cellsize, resY: hdr.cellsize,
    xll: hdr.xllcorner, yll: hdr.yllcorner, noData: hdr.nodata_value ?? null,
    values: Float64Array.from(nums),
    // validation: the header PROMISES ncols*nrows samples. Fewer = a truncated payload behind a 200.
    expected: hdr.ncols * hdr.nrows, got: nums.length,
  };
}

async function fetchAsc(coverageId, [minE, minN, maxE, maxN]) {
  const url = `${MDT}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${coverageId}`
    + `&FORMAT=ArcGrid&SUBSET=x(${minE},${maxE})&SUBSET=y(${minN},${maxN})`
    + `&SUBSETTINGCRS=${crsUri('25830')}&OUTPUTCRS=${crsUri('25830')}`;
  const r = await probeFetch(url, { label: `asc:${coverageId}`, timeoutMs: 120_000 });
  if (!r.ok) return { url, verdict: `HTTP ${r.status}`, status: r.status, bytes: r.bytes };
  const g = parseAsc(r.text);
  if (g.error) return { url, verdict: 'non-grid-200', ...g };
  // ── TRUNCATION GATE: never trust the 200; the header's own cell count is the contract.
  if (g.got !== g.expected) return { url, verdict: 'TRUNCATED-BUT-200', ...g, values: undefined };
  return { url, verdict: 'grid-ok', status: r.status, bytes: r.bytes, cached: r.cached, ...g };
}

function slopeAspect(g) {
  const { values: z, width: W, height: H, resX, resY, noData } = g;
  const bad = (v) => v == null || !Number.isFinite(v) || (noData != null && v === noData) || v < -200 || v > 4000;
  const slopes = []; let sinSum = 0, cosSum = 0, wSum = 0;
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) {
    const k = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) k.push(z[(r + dr) * W + (c + dc)]);
    if (k.some(bad)) continue;
    const [a, b, cc, d, , f, gg, h, i] = k;
    const dzdx = ((cc + 2 * f + i) - (a + 2 * d + gg)) / (8 * resX);
    // ASC rows run north->south, so a +row step is -y; negate to get true dz/dy(north).
    const dzdy = -(((gg + 2 * h + i) - (a + 2 * b + cc)) / (8 * resY));
    const rise = Math.hypot(dzdx, dzdy);
    slopes.push(rise);
    // Downslope azimuth, clockwise from north. The gradient (dzdx,dzdy) points UPHILL, so the
    // downhill vector is (-dzdx,-dzdy) and its bearing is atan2(east, north).
    // Unit-checked against 5 synthetic gradients (N/S/E/W/NE) — see probe notes.
    const az = (Math.atan2(-dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
    const rad = az * Math.PI / 180;
    sinSum += Math.sin(rad) * rise; cosSum += Math.cos(rad) * rise; wSum += rise;
  }
  const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const zs = [...z].filter((v) => !bad(v));
  const mean = slopes.length ? slopes.reduce((a, b) => a + b, 0) / slopes.length : null;
  const meanAz = wSum > 0 ? (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360 : null;
  const nonInt = zs.filter((v) => !Number.isInteger(v)).length;
  return {
    nElevSamples: zs.length, nSlopeCells: slopes.length,
    verticalIsFloat: nonInt > 0, fractionNonIntegerElev: zs.length ? nonInt / zs.length : null,
    elevMin: zs.length ? Math.min(...zs) : null, elevMax: zs.length ? Math.max(...zs) : null,
    elevMean: zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null,
    elevRangeM: zs.length ? Math.max(...zs) - Math.min(...zs) : null,
    slopeMeanPct: mean == null ? null : mean * 100,
    slopeMedianPct: pct(slopes, 0.5) == null ? null : pct(slopes, 0.5) * 100,
    slopeP90Pct: pct(slopes, 0.9) == null ? null : pct(slopes, 0.9) * 100,
    slopeMaxPct: slopes.length ? Math.max(...slopes) * 100 : null,
    slopeMeanDeg: mean == null ? null : Math.atan(mean) * 180 / Math.PI,
    aspectMeanDeg: meanAz,
    aspectCompass: meanAz == null ? null : ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(meanAz / 22.5) % 16],
  };
}

const WINDOWS = [
  { name: 'context-1km', half: 500 },
  { name: 'plot-120m',   half: 60 },
  { name: 'plot-40m',    half: 20 },   // ~the parcel itself (935 m2 ~ 30 m across)
];
const COVERAGES = ['Elevacion25830_5', 'Elevacion25830_25'];

const results = [];
for (const w of WINDOWS) {
  const box = [centre[0] - w.half, centre[1] - w.half, centre[0] + w.half, centre[1] + w.half];
  for (const id of COVERAGES) {
    const g = await fetchAsc(id, box);
    if (g.verdict !== 'grid-ok') {
      console.log(`\n[${w.name} @ ${id}] ${g.verdict} (expected ${g.expected} cells, got ${g.got})`);
      results.push({ window: w.name, coverage: id, ...g, values: undefined }); continue;
    }
    const s = slopeAspect(g);
    console.log(`\n[${w.name} @ ${id}] ${g.width}x${g.height} cells @ ${g.resX} m posting  (window ${w.half * 2} m)`);
    console.log(`  vertical: float=${s.verticalIsFloat} (non-integer share ${(s.fractionNonIntegerElev * 100).toFixed(1)}%)`);
    console.log(`  elev  n=${s.nElevSamples} min=${s.elevMin?.toFixed(2)} max=${s.elevMax?.toFixed(2)} mean=${s.elevMean?.toFixed(2)} range=${s.elevRangeM?.toFixed(2)} m`);
    console.log(`  slope n=${s.nSlopeCells} mean=${s.slopeMeanPct?.toFixed(2)}% median=${s.slopeMedianPct?.toFixed(2)}% p90=${s.slopeP90Pct?.toFixed(2)}% max=${s.slopeMaxPct?.toFixed(2)}%`);
    console.log(`  aspect ${s.aspectMeanDeg?.toFixed(1)}deg (${s.aspectCompass})`);
    results.push({ window: w.name, windowSpanM: w.half * 2, coverage: id, postingM: g.resX,
      cellsAcrossWindow: (w.half * 2) / g.resX, gridPx: { w: g.width, h: g.height }, url: g.url, ...s });
  }
}

saveJson('out-04-terrain-float.json', {
  site: SITE, siteUtm30n: { E: centre[0], N: centre[1] }, probedAt: new Date().toISOString(),
  method: 'IGN INSPIRE MDT WCS 2.0.1 GetCoverage FORMAT=ArcGrid (float ESRI-ASCII) in native EPSG:25830; '
    + 'Horn 3x3 slope; slope-weighted circular-mean downslope aspect. Payload validated by header cell count.',
  results,
});
console.log('\nwrote out-04-terrain-float.json');
