// PROBE 09 — municipality-wide feasibility: what does ONE GetCoverage actually cap at, and what
// does the whole of Murcia therefore cost in requests and bytes?
//
// This decides the architecture question: bake a municipality-wide DTM, or retrieve per-site.
// Both the request cap and the municipal extent are MEASURED here, not assumed.
//
// Run:  node tools/murcia-terrain-probe/probe-09-scale.mjs

import { probeFetch, saveJson, loadProj4, SITE } from './lib.mjs';

const MDT = 'https://servicios.idee.es/wcs-inspire/mdt';
const crsUri = (e) => `http://www.opengis.net/def/crs/EPSG/0/${e}`;
const proj4 = await loadProj4();
proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const centre = proj4('EPSG:4326', 'EPSG:25830').forward([SITE.lon, SITE.lat]);

const out = { site: SITE, probedAt: new Date().toISOString(), capTests: [] };

// ── A. How big can ONE MDT05 GetCoverage be? Escalate until it stops returning a valid full grid ──
for (const halfM of [250, 500, 1000, 2000, 4000, 8000]) {
  const url = `${MDT}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=Elevacion25830_5&FORMAT=ArcGrid`
    + `&SUBSET=x(${centre[0] - halfM},${centre[0] + halfM})&SUBSET=y(${centre[1] - halfM},${centre[1] + halfM})`
    + `&SUBSETTINGCRS=${crsUri('25830')}&OUTPUTCRS=${crsUri('25830')}`;
  const r = await probeFetch(url, { label: `cap-${halfM}`, timeoutMs: 300_000 });
  let verdict = `HTTP ${r.status}`, W = null, H = null, got = null, expected = null;
  if (r.ok) {
    const i = (r.text ?? '').search(/ncols\s+\d+/i);
    if (i < 0) verdict = 'non-grid-200';
    else {
      let b = r.text.slice(i); const e = b.indexOf('--wcs--'); if (e > 0) b = b.slice(0, e);
      const h = {}; const re = /(ncols|nrows|xllcorner|yllcorner|cellsize)\s+(-?[\d.]+)/gi;
      let m, last = 0; while ((m = re.exec(b))) { h[m[1].toLowerCase()] = Number(m[2]); last = re.lastIndex; }
      const vals = b.slice(last).trim().split(/\s+/).map(Number).filter(Number.isFinite);
      W = h.ncols; H = h.nrows; expected = W * H; got = vals.length;
      // The header's own cell count is the contract. Fewer values = truncated behind a 200.
      verdict = got === expected ? 'grid-ok' : 'TRUNCATED-BUT-200';
    }
  }
  const row = { halfM, sideM: halfM * 2, sideKm: (halfM * 2) / 1000, status: r.status, bytes: r.bytes,
    ms: r.ms, cached: r.cached, W, H, expectedCells: expected, gotCells: got, verdict };
  out.capTests.push(row);
  console.log(`[cap ${(halfM * 2 / 1000).toFixed(1)} km box] ${verdict}  HTTP ${r.status} ${(r.bytes / 1e6).toFixed(2)} MB  grid ${W}x${H}  cells ${got}/${expected}  ${r.cached ? '(cached)' : `${r.ms} ms`}`);
  if (verdict !== 'grid-ok') break;
}

// ── B. Murcia municipal extent — MEASURED from the IGN/CNIG administrative-unit WFS ─────────────
// Never assume a municipal area; ask the boundary service and compute from the returned envelope.
const AU = 'https://www.ign.es/wfs-inspire/unidades-administrativas';
{
  const url = `${AU}?service=WFS&version=2.0.0&request=GetFeature&typeNames=au:AdministrativeUnit`
    + `&count=8&srsName=urn:ogc:def:crs:EPSG::4326`
    + `&CQL_FILTER=${encodeURIComponent("nationalCode='30030'")}`;
  const r = await probeFetch(url, { label: 'ign-au-murcia', accept: 'text/xml', timeoutMs: 120_000 });
  const env = (r.text ?? '').match(/<gml:lowerCorner>([^<]+)<\/gml:lowerCorner>[\s\S]*?<gml:upperCorner>([^<]+)<\/gml:upperCorner>/);
  // ⚠ SANITY GATE: an envelope is only Murcia's if it CONTAINS the target site. A server that
  // silently ignores CQL_FILTER returns some other municipality with a perfectly well-formed
  // envelope — which would look like success. Verify containment before believing the extent.
  let contains = null, lc = null, uc = null;
  if (env) {
    lc = env[1].trim().split(/\s+/).map(Number); // urn CRS -> lat lon order
    uc = env[2].trim().split(/\s+/).map(Number);
    contains = SITE.lat >= lc[0] && SITE.lat <= uc[0] && SITE.lon >= lc[1] && SITE.lon <= uc[1];
  }
  out.municipalExtent = {
    endpoint: AU, status: r.status, bytes: r.bytes,
    lowerCorner: env?.[1] ?? null, upperCorner: env?.[2] ?? null,
    containsTargetSite: contains,
    verdict: !r.ok ? `http-${r.status}` : !env ? 'no-envelope-in-response'
      : contains ? 'envelope-read-AND-contains-site'
        : 'REJECTED — envelope does not contain the target site; the CQL_FILTER was ignored and this is a DIFFERENT municipality',
    head: r.head?.slice(0, 200) ?? null,
  };
  console.log(`\n[IGN admin-unit 30030] HTTP ${r.status} ${r.bytes}B -> ${out.municipalExtent.verdict}`);
  if (env) console.log(`  envelope: ${env[1]}  ..  ${env[2]}   containsSite=${contains}`);
  else console.log('  head:', r.head?.slice(0, 220));
}

// ── C. Scaling arithmetic, parameterised so the conclusion survives a corrected area ────────────
const okTests = out.capTests.filter((t) => t.verdict === 'grid-ok');
const largestOk = okTests[okTests.length - 1] ?? null;
function budget(areaKm2, postingM, tileSideKm) {
  const cells = (areaKm2 * 1e6) / (postingM * postingM);
  return {
    areaKm2, postingM, tileSideKm,
    cells: Math.round(cells),
    bytesFloat32: Math.round(cells * 4), bytesInt16: Math.round(cells * 2),
    gbFloat32: Number((cells * 4 / 1e9).toFixed(2)),
    tiles: Math.ceil(areaKm2 / (tileSideKm * tileSideKm)),
  };
}
const tileKm = largestOk ? largestOk.sideKm : 1;
// Murcia municipality area — ASSERTED-UNVERIFIED unless the envelope above resolved it.
const AREA_ASSERT_KM2 = 881.86;
out.scaling = {
  largestVerifiedSingleRequest: largestOk,
  tileSideKmUsed: tileKm,
  murciaAreaKm2_source: 'ASSERTED-UNVERIFIED (commonly cited municipal area; not read from a live service in this probe)',
  murciaAreaKm2: AREA_ASSERT_KM2,
  atMdt05: budget(AREA_ASSERT_KM2, 5, tileKm),
  atMdt25: budget(AREA_ASSERT_KM2, 25, tileKm),
  measuredBytesPerCellAscii: largestOk ? Number((largestOk.bytes / largestOk.gotCells).toFixed(2)) : null,
};
console.log('\n── scaling ──');
console.log('  largest VERIFIED single request:', largestOk ? `${largestOk.sideKm} km box = ${largestOk.W}x${largestOk.H} cells, ${(largestOk.bytes / 1e6).toFixed(1)} MB ASCII` : 'none');
console.log('  MDT05 whole-municipality:', JSON.stringify(out.scaling.atMdt05));
console.log('  ASCII bytes/cell (measured):', out.scaling.measuredBytesPerCellAscii);

saveJson('out-09-scale.json', out);
console.log('\nwrote out-09-scale.json');
