// PROBE 06 — MEASURED building height (CNIG MDS Edificación nDSM) + the vacancy control test.
//
// Three things happen here, and they are deliberately separated:
//
//  (A) CONTROL — run the same GetBuildingByParcel stored query against a NEIGHBOURING refcat. If the
//      neighbour returns features and the target returns a well-formed empty collection, then the
//      target's emptiness is a real VACANT parcel, not a broken query. Failure != absence.
//  (B) MEASURED — sample mdsn_e025 (CNIG MDS normalizado Edificación, a building-class nDSM: pixel
//      value IS metres of building above ground) inside each Catastro footprint. Per-building
//      statistic = P90 of the interior cells, NOT max (max is inflated by lift overruns/antennae/HVAC)
//      and NOT mean (dragged down by sloped roofs and edge cells).
//  (C) CROSS-CHECK — divide the measured P90 by the DECLARED floor count to obtain an OBSERVED
//      metres-per-floor for this neighbourhood. This is a derived diagnostic; it is never used to
//      manufacture a height for a building we did not measure.
//
// Run:  node tools/murcia-terrain-probe/probe-06-ndsm.mjs

import { probeFetch, owsException, saveJson, loadProj4, SITE } from './lib.mjs';

const BU = 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx';
const MDS = 'https://wcs-mds.idee.es/mds';
const crsUri = (e) => `http://www.opengis.net/def/crs/EPSG/0/${e}`;

const proj4 = await loadProj4();
proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const fwd = proj4('EPSG:4326', 'EPSG:25830');
const centre = fwd.forward([SITE.lon, SITE.lat]);
const out = { site: SITE, probedAt: new Date().toISOString() };

// ── (A) CONTROL: does the stored query return anything for a neighbour that definitely has buildings?
{
  const neighbour = '3482901XH6038S';
  const url = `${BU}?service=WFS&version=2.0.0&request=getfeature&STOREDQUERIE_ID=GetBuildingByParcel&refcat=${neighbour}&srsname=EPSG::25830`;
  const r = await probeFetch(url, { label: 'control-neighbour', accept: 'text/xml', timeoutMs: 120_000 });
  // NOTE: the GetBuildingByParcel stored query returns bu-ext2d:Building elements, NOT BuildingPart.
  // Counting only parts made an earlier run read as "neighbour also empty" — a probe bug, not a data
  // fact. Count BOTH element types before drawing any absence conclusion.
  const parts = (r.text ?? '').match(/<bu-ext2d:BuildingPart\b/g) ?? [];
  const bldgs = (r.text ?? '').match(/<bu-ext2d:Building\b(?!Part)/g) ?? [];
  const wellFormed = /<\/gml:FeatureCollection>/.test(r.text ?? '');
  const found = parts.length + bldgs.length;
  out.control = {
    neighbourRefcat: neighbour, status: r.status, bytes: r.bytes,
    buildingElements: bldgs.length, buildingParts: parts.length,
    currentUse: r.text?.match(/currentUse>([^<]+)</)?.[1] ?? null,
    numberOfDwellings: r.text?.match(/numberOfDwellings>\s*(\d+)/)?.[1] ?? null,
    grossFloorAreaM2: r.text?.match(/value uom="m2">\s*([\d.]+)/)?.[1] ?? null,
    floorsNilReason: r.text?.match(/numberOfFloorsAboveGround[^>]*nilReason="([^"]+)"/)?.[1] ?? null,
    horizontalGeometryEstimatedAccuracy: r.text?.match(/horizontalGeometryEstimatedAccuracy[^>]*>([^<]+)</)?.[1]?.trim() ?? null,
    wellFormedCollection: wellFormed, exception: owsException(r.text),
    verdict: found > 0
      ? 'STORED-QUERY-WORKS — neighbour returns a Building; the target parcel\'s empty collection is a REAL VACANCY, not a query failure'
      : 'INCONCLUSIVE (neighbour also empty)',
  };
  console.log(`[CONTROL ${neighbour}] HTTP ${r.status} ${r.bytes}B Building=${bldgs.length} Part=${parts.length} wellFormed=${wellFormed}`);
  console.log('  use=', out.control.currentUse, 'dwellings=', out.control.numberOfDwellings, 'GFA=', out.control.grossFloorAreaM2, 'm2');
  console.log('  Building-level floors nilReason:', out.control.floorsNilReason);
  console.log('  verdict:', out.control.verdict);
}

// ── Footprints in native metres (EPSG:25830) over a 300 m box ───────────────────────────────────
const HALF = 150;
function posList(s) { const n = s.trim().split(/\s+/).map(Number).filter(Number.isFinite); const p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); return p; }
const areaOf = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return Math.abs(a / 2); };
function inPoly(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }

let footprints = [];
{
  // srsName=EPSG::25830 → the server returns native easting/northing posLists (no client reprojection).
  const url = `${BU}?service=WFS&version=2.0.0&request=GetFeature&typeNames=bu:BuildingPart`
    + `&srsName=EPSG::25830&bbox=${centre[0] - HALF},${centre[1] - HALF},${centre[0] + HALF},${centre[1] + HALF},EPSG::25830&count=800`;
  const r = await probeFetch(url, { label: 'bu-bbox-25830', accept: 'text/xml', timeoutMs: 180_000 });
  const parts = (r.text ?? '').match(/<bu-ext2d:BuildingPart\b[\s\S]*?<\/bu-ext2d:BuildingPart>/g) ?? [];
  for (const m of parts) {
    const ext = m.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
    if (!ext) continue;
    const ring = posList(ext[1]);
    if (ring.length < 4) continue;
    footprints.push({
      gmlId: m.match(/gml:id="([^"]+)"/)?.[1] ?? null,
      refcat: m.match(/gml:id="ES\.SDGC\.BU\.([^"_]+)/)?.[1] ?? null,
      floorsAbove: Number(m.match(/numberOfFloorsAboveGround>\s*(-?\d+)/i)?.[1] ?? NaN),
      floorsBelow: Number(m.match(/numberOfFloorsBelowGround>\s*(-?\d+)/i)?.[1] ?? NaN),
      areaM2: Number(areaOf(ring).toFixed(1)), ring,
    });
  }
  out.footprintFetch = { status: r.status, bytes: r.bytes, boxM: HALF * 2, parts: parts.length, usable: footprints.length,
    wellFormed: /<\/gml:FeatureCollection>/.test(r.text ?? '') };
  console.log(`\n[footprints 25830] HTTP ${r.status} parts=${parts.length} usable=${footprints.length} wellFormed=${out.footprintFetch.wellFormed}`);
}

// ── Fetch the nDSM (float ArcGrid, native 25830) ────────────────────────────────────────────────
function parseAsc(text) {
  const i = text.search(/ncols\s+\d+/i); if (i < 0) return null;
  let b = text.slice(i); const e = b.indexOf('--wcs--'); if (e > 0) b = b.slice(0, e);
  const h = {}; const re = /(ncols|nrows|xllcorner|yllcorner|cellsize|NODATA_value)\s+(-?[\d.]+)/gi;
  let m, last = 0; while ((m = re.exec(b))) { h[m[1].toLowerCase()] = Number(m[2]); last = re.lastIndex; }
  const v = b.slice(last).trim().split(/\s+/).map(Number).filter(Number.isFinite);
  return { W: h.ncols, H: h.nrows, xll: h.xllcorner, yll: h.yllcorner, cell: h.cellsize,
    noData: h.nodata_value ?? null, v, expected: h.ncols * h.nrows, got: v.length };
}
let grid = null;
{
  // ⚠ PAD the nDSM box beyond the footprint box. The WFS returns every building that INTERSECTS the
  // bbox, so footprints extend past it; an unpadded raster silently yields n=0 for edge buildings,
  // which would read as "no measurement available" when it is really "not fetched". Absence of a
  // sample must never be manufactured by the probe's own window.
  const NDSM_HALF = HALF + 120;
  const url = `${MDS}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=mdsn_e025&FORMAT=ArcGrid`
    + `&SUBSET=x(${centre[0] - NDSM_HALF},${centre[0] + NDSM_HALF})&SUBSET=y(${centre[1] - NDSM_HALF},${centre[1] + NDSM_HALF})`
    + `&SUBSETTINGCRS=${crsUri('25830')}&OUTPUTCRS=${crsUri('25830')}`;
  const r = await probeFetch(url, { label: 'mds-ndsm', timeoutMs: 180_000 });
  const g = r.ok ? parseAsc(r.text) : null;
  const truncated = g ? g.got !== g.expected : null;
  out.ndsmFetch = { url, status: r.status, bytes: r.bytes, grid: g && { W: g.W, H: g.H, cell: g.cell, xll: g.xll, yll: g.yll, expected: g.expected, got: g.got },
    truncated, verdict: !r.ok ? `HTTP ${r.status}` : !g ? 'non-grid-200' : truncated ? 'TRUNCATED-BUT-200' : 'grid-ok' };
  console.log(`\n[MDS mdsn_e025] HTTP ${r.status} ${r.bytes}B -> ${out.ndsmFetch.verdict}`);
  if (g) console.log(`  ${g.W}x${g.H} @ ${g.cell} m cell, cells expected=${g.expected} got=${g.got}`);
  if (g && !truncated) grid = g;
}

/** Sample the nDSM at cell centres inside a ring. ASC rows run north->south. */
function sampleRing(g, ring) {
  const vals = [];
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const c0 = Math.max(0, Math.floor((Math.min(...xs) - g.xll) / g.cell));
  const c1 = Math.min(g.W - 1, Math.ceil((Math.max(...xs) - g.xll) / g.cell));
  const yTop = g.yll + g.H * g.cell;
  const r0 = Math.max(0, Math.floor((yTop - Math.max(...ys)) / g.cell));
  const r1 = Math.min(g.H - 1, Math.ceil((yTop - Math.min(...ys)) / g.cell));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const x = g.xll + (c + 0.5) * g.cell, y = yTop - (r + 0.5) * g.cell;
    if (!inPoly(x, y, ring)) continue;
    const val = g.v[r * g.W + c];
    if (val == null || !Number.isFinite(val) || (g.noData != null && val === g.noData)) continue;
    vals.push(val);
  }
  return vals;
}
const p = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

// ── (B) MEASURED heights per footprint ──────────────────────────────────────────────────────────
if (grid) {
  const rows = [];
  const gridE = [grid.xll, grid.xll + grid.W * grid.cell];
  const gridN = [grid.yll, grid.yll + grid.H * grid.cell];
  const insideGrid = (ring) => ring.every(([x, y]) => x >= gridE[0] && x <= gridE[1] && y >= gridN[0] && y <= gridN[1]);
  for (const f of footprints) {
    const v = sampleRing(grid, f.ring);
    // n is reported for EVERY statistic. A footprint covering <4 cells cannot support a P90.
    const p90 = v.length >= 4 ? p(v, 0.9) : null;
    // Classify WHY a footprint has no measurement — the three reasons are not the same result.
    const coverage = insideGrid(f.ring)
      ? (v.length >= 4 ? 'measured'
        : f.areaM2 < 4 * grid.cell * grid.cell ? 'unmeasurable-footprint-smaller-than-4-cells'
          : 'in-raster-but-too-few-cell-centres')
      : 'footprint-outside-fetched-raster';
    rows.push({
      coverage,
      refcat: f.refcat, gmlId: f.gmlId, areaM2: f.areaM2,
      declaredFloorsAbove: Number.isFinite(f.floorsAbove) ? f.floorsAbove : null,
      declaredFloorsBelow: Number.isFinite(f.floorsBelow) ? f.floorsBelow : null,
      nCells: v.length,
      measuredP90m: p90 == null ? null : Number(p90.toFixed(2)),
      measuredMaxm: v.length ? Number(Math.max(...v).toFixed(2)) : null,
      measuredMedianm: v.length ? Number(p(v, 0.5).toFixed(2)) : null,
      impliedMetresPerFloor: (p90 != null && f.floorsAbove > 0) ? Number((p90 / f.floorsAbove).toFixed(2)) : null,
    });
  }
  out.measuredBuildings = rows;
  const usable = rows.filter((r) => r.measuredP90m != null && r.declaredFloorsAbove > 0 && r.measuredP90m > 1);
  const mpf = usable.map((r) => r.impliedMetresPerFloor).filter(Number.isFinite).sort((a, b) => a - b);
  out.metresPerFloorObserved = {
    n: mpf.length,
    median: mpf.length ? Number(mpf[Math.floor(mpf.length / 2)].toFixed(2)) : null,
    p10: mpf.length ? Number(mpf[Math.floor(mpf.length * 0.1)].toFixed(2)) : null,
    p90: mpf.length ? Number(mpf[Math.floor(mpf.length * 0.9)].toFixed(2)) : null,
    min: mpf.length ? mpf[0] : null, max: mpf.length ? mpf[mpf.length - 1] : null,
    method: 'measured nDSM P90 per BuildingPart / declared numberOfFloorsAboveGround; parts with P90<=1 m or 0 floors excluded',
  };
  const covHist = {};
  for (const r of rows) covHist[r.coverage] = (covHist[r.coverage] ?? 0) + 1;
  out.coverageBreakdown = covHist;
  console.log(`\n[measured] ${rows.length} footprints; ${usable.length} with both a measured P90 and a declared floor count`);
  console.log('  coverage breakdown:', JSON.stringify(covHist));
  console.log('  observed metres/floor:', JSON.stringify(out.metresPerFloorObserved));
  for (const r of rows.filter((x) => x.coverage === 'measured').slice(0, 14)) {
    console.log(`   ${r.refcat} area=${String(r.areaM2).padStart(7)} floors=${String(r.declaredFloorsAbove).padStart(3)} n=${String(r.nCells).padStart(4)} P90=${String(r.measuredP90m).padStart(6)}m max=${String(r.measuredMaxm).padStart(6)}m m/floor=${r.impliedMetresPerFloor}`);
  }
}

// ── The TARGET PARCEL: is it measurably empty? ───────────────────────────────────────────────────
if (grid) {
  const CP = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx';
  const r = await probeFetch(`${CP}?service=WFS&version=2.0.0&request=getfeature&STOREDQUERIE_ID=GetParcel&refcat=${SITE.refcat}&srsname=EPSG::25830`, { accept: 'text/xml' });
  const ext = r.text?.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
  const ring = ext ? posList(ext[1]) : null;
  if (ring) {
    const v = sampleRing(grid, ring);
    const nonZero = v.filter((x) => x > 0.5).length;
    out.targetParcelNdsm = {
      nCells: v.length, cellSizeM: grid.cell,
      min: v.length ? Number(Math.min(...v).toFixed(2)) : null,
      max: v.length ? Number(Math.max(...v).toFixed(2)) : null,
      mean: v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)) : null,
      p90: v.length >= 4 ? Number(p(v, 0.9).toFixed(2)) : null,
      cellsAbove0_5m: nonZero, fractionAbove0_5m: v.length ? Number((nonZero / v.length).toFixed(3)) : null,
      interpretation: 'mdsn_e025 is a building-class nDSM: value 0 = no building detected at that cell.',
    };
    console.log(`\n[target parcel nDSM] n=${v.length} cells @ ${grid.cell} m  min=${out.targetParcelNdsm.min} max=${out.targetParcelNdsm.max} mean=${out.targetParcelNdsm.mean} cells>0.5m=${nonZero}`);
  }
}

saveJson('out-06-ndsm.json', out);
console.log('\nwrote out-06-ndsm.json');
