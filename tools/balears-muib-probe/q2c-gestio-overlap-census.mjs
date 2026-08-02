/**
 * Q2c - DOES `GESTIO` RESOLVE A UNIQUE GOVERNING INSTRUMENT? A CENSUS OF ALL 2,210.
 *
 * ⭐ This is the brief's headline Q2 question, answered WITHOUT SAMPLING and
 * WITHOUT depending on the external parcel frame.
 *
 * GESTIO is the management layer - unitats d'actuacio through to the delimitation
 * polygons of plans parcials and plans especials. If it is Catalunya's `PD*`
 * published as geometry, the test is whether its polygons STACK: a point inside
 * two GESTIO polygons has TWO management instruments, and R is not single-valued
 * there.
 *
 * METHOD: fetch ALL 2,210 geometries in one request (maxRecordCount is 60,000,
 * so there is no paging and no truncation), then compute containment LOCALLY
 * with a ray-casting point-in-polygon test. The local PIP is an algorithm
 * INDEPENDENT of the server's spatial engine (PROBE-DISCIPLINE R2) - so it is a
 * genuine cross-check on the ArcGIS `esriSpatialRelIntersects` results used
 * elsewhere in this probe, not a variant of them.
 *
 * ⚠ WHAT THIS CANNOT SEE (R7): it tests polygon CENTROIDS, so it detects
 * stacking where centroids fall, not every overlapping sliver. A parcel lying in
 * an overlap whose centroid sits outside it is not counted. Reported as a lower
 * bound on stacking, never as "no overlap exists".
 *
 * Run:  node tools/balears-muib-probe/q2c-gestio-overlap-census.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agsGet, count } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const GESTIO = 8;

const expected = await count(GESTIO, '1=1');
console.error(`GESTIO advertised count (independent oracle): ${expected.count}`);

const body = await agsGet(`/${GESTIO}/query`, {
  where: '1=1',
  outFields: 'OBJECTID,CODIMUNI,MUNICIPI,CODIPLA,CODIMUIB,NOM,URL',
  returnGeometry: 'true',
  outSR: '25831',
  geometryPrecision: '2',
}, { timeoutMs: 300000 });

const feats = body.features || [];
console.error(`fetched ${feats.length} features, exceededTransferLimit=${body.exceededTransferLimit === true}`);

// ⛔ RECONCILE THE WALK AGAINST THE COUNT ORACLE before computing anything.
const reconciled = feats.length === expected.count && body.exceededTransferLimit !== true;
if (!reconciled) {
  console.error(`⛔ RECONCILIATION FAILED: fetched ${feats.length} vs oracle ${expected.count}. NOT COMPUTING A RATE.`);
}

// ── local geometry ───────────────────────────────────────────────────────────
function ringsOf(g) { return (g && g.rings) ? g.rings : []; }
function bboxOf(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
function areaOf(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
/** Representative point: centroid of the largest ring (by |area|). */
function repPoint(rings) {
  let best = null, bestA = -1;
  for (const r of rings) { const a = Math.abs(areaOf(r)); if (a > bestA) { bestA = a; best = r; } }
  if (!best) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = best.length; i < n; i++) {
    const [x1, y1] = best[i], [x2, y2] = best[(i + 1) % n];
    const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return best[0];
  return [cx / (6 * a), cy / (6 * a)];
}
/** Ray-casting PIP over all rings (even-odd handles holes). */
function pointInRings(px, py, rings) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi + 0e0) + xi) inside = !inside;
    }
  }
  return inside;
}

const items = feats.map((f) => {
  const rings = ringsOf(f.geometry);
  return { a: f.attributes, rings, bbox: bboxOf(rings), rep: repPoint(rings) };
}).filter((i) => i.rings.length && i.rep);

console.error(`usable geometries: ${items.length}`);

const result = {
  probe: 'q2c-gestio-overlap-census',
  runAt: new Date().toISOString(),
  method: 'CENSUS of all GESTIO features; local ray-casting PIP (independent of the server spatial engine)',
  oracleCount: expected.count,
  fetched: feats.length,
  reconciled,
  usableGeometries: items.length,
  perFeature: [],
};

let unique = 0, ambiguous = 0;
const examples = [];
for (const it of items) {
  const [px, py] = it.rep;
  const containing = [];
  for (const other of items) {
    const [x0, y0, x1, y1] = other.bbox;
    if (px < x0 || px > x1 || py < y0 || py > y1) continue;
    if (pointInRings(px, py, other.rings)) containing.push(other.a);
  }
  const instruments = [...new Set(containing.map((c) => c.CODIPLA).filter(Boolean))];
  const rec = {
    objectId: it.a.OBJECTID, muni: it.a.MUNICIPI, codiPla: it.a.CODIPLA, codiMuib: it.a.CODIMUIB,
    containingPolygons: containing.length, distinctInstruments: instruments.length,
  };
  if (instruments.length > 1) {
    ambiguous++;
    if (examples.length < 25) examples.push({ ...rec, instruments });
  } else unique++;
  result.perFeature.push(rec);
}

const n = items.length || 1;
result.summary = {
  featuresTested: items.length,
  uniqueInstrument: unique,
  multipleInstruments: ambiguous,
  uniquePct: +((100 * unique) / n).toFixed(2),
  multiplePct: +((100 * ambiguous) / n).toFixed(2),
  maxContainingPolygons: Math.max(...result.perFeature.map((r) => r.containingPolygons)),
  maxDistinctInstruments: Math.max(...result.perFeature.map((r) => r.distinctInstruments)),
  namedWorstCases: examples,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'q2c-gestio-overlap-census.json'), JSON.stringify(result, null, 2));
console.error('\n=== GESTIO SELF-OVERLAP CENSUS ===');
console.error(JSON.stringify({ ...result.summary, namedWorstCases: `${examples.length} recorded` }, null, 2));
console.error('\n--- named worst cases (R4) ---');
for (const e of examples.slice(0, 10)) console.error(`  ${e.muni} obj=${e.objectId} ${e.codiMuib} -> ${e.distinctInstruments} instruments: ${e.instruments.join(' | ').slice(0, 140)}`);
