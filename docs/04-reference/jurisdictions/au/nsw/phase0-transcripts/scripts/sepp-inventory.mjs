// §SEPP-INVENTORY (round 3) — the SEPP vertical/FSR family: schema, LAY_NAME/UNITS/clause
// population, and whether a SEPP HOB polygon COEXISTS with an LEP HOB polygon at the same point.
// The founder's claim under test: "an LEP-only engine is wrong wherever a SEPP applies".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, pool, HOST, SVC } from './probe.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../sepp-inventory.json');
const base = (id) => `https://${HOST}/arcgis/rest/services/${SVC.SEPP}/MapServer/${id}`;
// Every SEPP DIRECT/GEOMETRIC layer in the vertical, floor-space or airspace family that M1 found
// carrying features (m1-classified.json + m1m2-population-raw.json).
const LAYERS = [715,718,134,118,614,631,44,648,684,799,726, 713,116,611,628,43,645,682,800,798, 278];
const HOB = new Set([715,134,118,614,631,44,648,684,799,726]);
const nul = (v) => v === null || v === undefined || (typeof v === 'string' && ['', 'Null', '<Null>', 'NULL', 'null'].includes(v.trim()));
const inc = (m, k) => { m[k] = (m[k] || 0) + 1; };

const out = { probedAt: new Date().toISOString().slice(0, 10), service: `https://${HOST}/arcgis/rest/services/${SVC.SEPP}/MapServer`, layers: {}, overlap: {} };
const rows = await pool(LAYERS, 4, async (id) => {
  const meta = await get(`${base(id)}?f=json`);
  const q = await get(`${base(id)}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json`);
  const feats = q.body?.features || [];
  const fields = (meta.body?.fields || []).map((f) => `${f.name}|${f.alias}|${String(f.type).replace('esriFieldType', '')}`);
  const g = { epi: {}, layName: {}, units: {}, clause: {}, layClassSample: {}, maxBH: {}, nullClause: 0, nullLayName: 0 };
  for (const f of feats) {
    const a = f.attributes;
    inc(g.epi, a.EPI_NAME ?? '(no EPI_NAME)');
    if (nul(a.LAY_NAME)) g.nullLayName++; else inc(g.layName, a.LAY_NAME);
    if ('UNITS' in a) inc(g.units, nul(a.UNITS) ? '(null)' : a.UNITS);
    if (nul(a.LEGIS_REF_CLAUSE)) g.nullClause++; else inc(g.clause, a.LEGIS_REF_CLAUSE);
    if (!nul(a.LAY_CLASS) && Object.keys(g.layClassSample).length < 25) inc(g.layClassSample, a.LAY_CLASS);
    if ('MAX_B_H' in a && !nul(a.MAX_B_H) && Object.keys(g.maxBH).length < 25) inc(g.maxBH, a.MAX_B_H);
  }
  const parent = meta.body?.parentLayer?.name ?? null;
  console.log(`\n=== SEPP/${id} "${meta.body?.name}"  parent="${parent}"  features=${feats.length}`);
  console.log(`  fields: ${fields.map((x) => x.split('|')[0]).join(', ')}`);
  console.log(`  EPI_NAME: ${JSON.stringify(g.epi)}`);
  console.log(`  LAY_NAME: ${JSON.stringify(g.layName)}  (null on ${g.nullLayName})`);
  if (Object.keys(g.units).length) console.log(`  UNITS: ${JSON.stringify(g.units)}`);
  console.log(`  LEGIS_REF_CLAUSE: ${JSON.stringify(g.clause)}  (null on ${g.nullClause})`);
  console.log(`  LAY_CLASS sample: ${JSON.stringify(g.layClassSample)}`);
  if (Object.keys(g.maxBH).length) console.log(`  MAX_B_H sample: ${JSON.stringify(g.maxBH)}`);
  return { id, name: meta.body?.name ?? null, parent, geometryType: meta.body?.geometryType ?? null, features: feats.length, fields, groups: g, sampleRow: feats[0]?.attributes ?? null };
});
for (const r of rows) out.layers[r.id] = r;

// ── OVERLAP: for each SEPP HOB layer, take up to 10 polygons, find an interior point, identify
//    Principal/14 + 11 there. Does an LEP HOB coexist? Same value or different?
function ringCentroid(ring) { let a = 0, cx = 0, cy = 0; for (let i = 0; i < ring.length - 1; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[i + 1]; const c = x1 * y2 - x2 * y1; a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; } a *= 0.5; return a === 0 ? ring[0] : [cx / (6 * a), cy / (6 * a)]; }
function inRing(p, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ins = !ins; } return ins; }
function interior(ring) { let c = ringCentroid(ring); if (inRing(c, ring)) return c; let a = ring[0]; for (let k = 0; k < 12; k++) { const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; if (inRing(m, ring)) return m; c = m; } return null; }
const idUrl = (svc, layers, x, y) => { const d = 0.0004; const q = new URLSearchParams({ geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', sr: '4283', layers: 'all:' + layers.join(','), tolerance: '0', mapExtent: `${x - d},${y - d},${x + d},${y + d}`, imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' }); return `https://${HOST}/arcgis/rest/services/${SVC[svc]}/MapServer/identify?${q}`; };

for (const id of LAYERS.filter((l) => HOB.has(l) && out.layers[l].features > 0)) {
  const q = await get(`${base(id)}/query?where=1%3D1&outFields=OBJECTID,EPI_NAME,LAY_NAME,LAY_CLASS,MAX_B_H,UNITS,LEGIS_REF_CLAUSE&returnGeometry=true&outSR=4283&resultRecordCount=10&f=json`);
  const feats = (q.body?.features || []).slice(0, 10);
  const res = await pool(feats, 3, async (f) => {
    const ring = f.geometry?.rings?.[0]; if (!ring) return null;
    const p = interior(ring); if (!p) return null;
    const pr = await get(idUrl('Principal', [14, 11], p[0], p[1]));
    const hits = pr.body?.results || [];
    const lepHob = hits.filter((h) => h.layerId === 14).map((h) => ({ epi: h.attributes['EPI Name'], v: h.attributes['Maximum Building Height'], units: h.attributes['Units'], clause: h.attributes['Legislative Clause'] }));
    const a = f.attributes;
    return { objectid: a.OBJECTID, seppEpi: a.EPI_NAME, seppLayName: a.LAY_NAME, seppClass: a.LAY_CLASS, seppMaxBH: a.MAX_B_H ?? null, seppUnits: a.UNITS ?? null, lon: p[0], lat: p[1], lepHob };
  });
  const rs = res.filter(Boolean);
  const coexist = rs.filter((r) => r.lepHob.length > 0).length;
  const differ = rs.filter((r) => r.lepHob.length > 0 && String(r.lepHob[0].v) !== String(r.seppMaxBH ?? r.seppClass)).length;
  out.overlap[id] = { sampled: rs.length, lepHobCoexists: coexist, valuesDiffer: differ, rows: rs };
  console.log(`\n--- OVERLAP SEPP/${id}: sampled ${rs.length} · LEP HOB coexists on ${coexist} · values differ on ${differ}`);
  for (const r of rs) console.log(`   ${r.objectid} SEPP=${r.seppMaxBH ?? r.seppClass}${r.seppUnits ? ' ' + r.seppUnits : ''} | LEP=${r.lepHob.map((l) => `${l.v} ${l.units} (${l.epi}; ${l.clause})`).join(' ; ') || 'NONE'}`);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
