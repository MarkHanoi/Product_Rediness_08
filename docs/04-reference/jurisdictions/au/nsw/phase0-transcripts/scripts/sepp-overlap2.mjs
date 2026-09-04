// §SEPP-OVERLAP-2 (round 3) — the half of sepp-inventory.mjs that came back EMPTY, redone.
// The first pass asked the legacy-schema SEPP HOB layers (134/118/614/631/44/648/684) for
// LAY_NAME/LAY_CLASS, which they do not carry, so ArcGIS refused the query and "sampled 0" looked
// like a result. It was a failed request. (§GREP-SILENCE-HAS-THREE-CAUSES, in ArcGIS costume.)
//
// Three questions, each answered by a different request:
//   Q1  At an interior point of a SEPP-service HOB polygon, what does Principal/14 return —
//       nothing, one polygon (whose EPI?), or two (LEP + SEPP stacked)?
//   Q2  How many Principal/14 polygons are SEPP-drawn (EPI_TYPE), and which SEPPs?
//   Q3  Did the M3 census ever see TWO layer-14 hits on one parcel (a real LEP+SEPP stack)?
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, pool, HOST, SVC } from './probe.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../sepp-overlap2.json');
const base = (id) => `https://${HOST}/arcgis/rest/services/${SVC.SEPP}/MapServer/${id}`;
const nul = (v) => v === null || v === undefined || (typeof v === 'string' && ['', 'Null', '<Null>', 'NULL', 'null'].includes(v.trim()));
function ringCentroid(ring) { let a = 0, cx = 0, cy = 0; for (let i = 0; i < ring.length - 1; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[i + 1]; const c = x1 * y2 - x2 * y1; a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; } a *= 0.5; return a === 0 ? ring[0] : [cx / (6 * a), cy / (6 * a)]; }
function inRing(p, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ins = !ins; } return ins; }
function interior(ring) { let c = ringCentroid(ring); if (inRing(c, ring)) return c; let a = ring[0]; for (let k = 0; k < 12; k++) { const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; if (inRing(m, ring)) return m; c = m; } return null; }
const idUrl = (svc, layers, x, y) => { const d = 0.0004; const q = new URLSearchParams({ geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', sr: '4283', layers: 'all:' + layers.join(','), tolerance: '0', mapExtent: `${x - d},${y - d},${x + d},${y + d}`, imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' }); return `https://${HOST}/arcgis/rest/services/${SVC[svc]}/MapServer/identify?${q}`; };

const out = { probedAt: new Date().toISOString().slice(0, 10), q1: {}, q2: null, q3: null, extra: {} };

// ── Q1 ────────────────────────────────────────────────────────────────────────────────────────
for (const id of [715, 134, 118, 614, 631, 44, 648, 684, 799, 726]) {
  const q = await get(`${base(id)}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4283&resultRecordCount=12&f=json`);
  if (q.body?.error) { out.q1[id] = { error: q.body.error }; console.log(`\n--- SEPP/${id}: QUERY ERROR ${JSON.stringify(q.body.error).slice(0, 200)}`); continue; }
  const feats = (q.body?.features || []).slice(0, 12);
  const res = await pool(feats, 3, async (f) => {
    const ring = f.geometry?.rings?.[0]; if (!ring) return { skipped: 'no ring' };
    const p = interior(ring); if (!p) return { skipped: 'no interior point' };
    const pr = await get(idUrl('Principal', [14], p[0], p[1]));
    const hits = (pr.body?.results || []).filter((h) => h.layerId === 14).map((h) => ({ epi: h.attributes['EPI Name'], epiType: h.attributes['EPI Type'], v: h.attributes['Maximum Building Height'], units: h.attributes['Units'], clause: h.attributes['Legislative Clause'] }));
    const a = f.attributes;
    const seppVal = !nul(a.MAX_B_H) ? a.MAX_B_H : a.LAY_CLASS ?? null;
    return { objectid: a.OBJECTID, seppEpi: a.EPI_NAME, seppVal, seppUnits: a.UNITS ?? null, lon: p[0], lat: p[1], principal14: hits };
  });
  const rs = res.filter((r) => r && !r.skipped);
  const none = rs.filter((r) => r.principal14.length === 0).length;
  const one = rs.filter((r) => r.principal14.length === 1).length;
  const two = rs.filter((r) => r.principal14.length >= 2).length;
  const oneIsSepp = rs.filter((r) => r.principal14.length === 1 && /State Environmental Planning Policy/i.test(r.principal14[0].epi ?? '')).length;
  const oneIsLep = rs.filter((r) => r.principal14.length === 1 && !/State Environmental Planning Policy/i.test(r.principal14[0].epi ?? '')).length;
  const sameValue = rs.filter((r) => r.principal14.length >= 1 && r.principal14.some((h) => String(h.v) === String(r.seppVal))).length;
  out.q1[id] = { sampled: rs.length, skipped: res.length - rs.length, principal14None: none, principal14One: one, principal14Two: two, oneIsSepp, oneIsLep, sameValueAsSepp: sameValue, rows: rs };
  console.log(`\n--- SEPP/${id}: sampled ${rs.length} · P14 none=${none} one=${one} (SEPP-drawn ${oneIsSepp}, LEP-drawn ${oneIsLep}) two+=${two} · same value ${sameValue}`);
  for (const r of rs) console.log(`   ${r.objectid} SEPP=${r.seppVal}${r.seppUnits ? ' ' + r.seppUnits : ''} | P14=${r.principal14.map((h) => `${h.v} ${h.units} [${h.epiType}: ${h.epi}; ${h.clause}]`).join(' + ') || 'NONE'}`);
}

// ── Q2 ────────────────────────────────────────────────────────────────────────────────────────
const P14 = `https://${HOST}/arcgis/rest/services/${SVC.Principal}/MapServer/14`;
const meta = await get(`${P14}?f=json`);
const epiTypeField = (meta.body?.fields || []).find((f) => /EPI_TYPE/i.test(f.name))?.name ?? 'EPI_TYPE';
const total = await get(`${P14}/query?where=1%3D1&returnCountOnly=true&f=json`);
const seppCount = await get(`${P14}/query?where=${encodeURIComponent(`${epiTypeField} <> 'Local Environment Plan'`)}&returnCountOnly=true&f=json`);
const seppRows = await get(`${P14}/query?where=${encodeURIComponent(`${epiTypeField} <> 'Local Environment Plan'`)}&outFields=EPI_NAME,${epiTypeField},UNITS,LEGIS_REF_CLAUSE,LGA_NAME&returnGeometry=false&f=json`);
const byEpi = {}; const byType = {}; const clauseByEpi = {};
for (const f of seppRows.body?.features || []) { const a = f.attributes; byEpi[a.EPI_NAME] = (byEpi[a.EPI_NAME] || 0) + 1; byType[a[epiTypeField]] = (byType[a[epiTypeField]] || 0) + 1; clauseByEpi[a.EPI_NAME] ??= { cited: 0, clauses: {} }; if (!nul(a.LEGIS_REF_CLAUSE)) { clauseByEpi[a.EPI_NAME].cited++; clauseByEpi[a.EPI_NAME].clauses[a.LEGIS_REF_CLAUSE] = (clauseByEpi[a.EPI_NAME].clauses[a.LEGIS_REF_CLAUSE] || 0) + 1; } }
out.q2 = { epiTypeField, totalHob: total.body?.count ?? null, nonLepHob: seppCount.body?.count ?? null, returned: seppRows.body?.features?.length ?? null, exceeded: seppRows.body?.exceededTransferLimit ?? false, byEpiType: byType, byEpi, clauseByEpi, fields: (meta.body?.fields || []).map((f) => f.name) };
console.log(`\n=== Q2 Principal/14: ${out.q2.totalHob} HOB polygons; ${out.q2.nonLepHob} NOT typed 'Local Environment Plan' (returned ${out.q2.returned}, exceeded=${out.q2.exceeded})`);
console.log('   by EPI_TYPE:', JSON.stringify(byType));
for (const [k, v] of Object.entries(byEpi).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(5)}  ${k}  cited=${clauseByEpi[k].cited} ${JSON.stringify(clauseByEpi[k].clauses)}`);

// ── Q3 ────────────────────────────────────────────────────────────────────────────────────────
for (const fn of ['m3-random2000-raw.json', 'm3-urban600-raw.json']) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', fn), 'utf8'));
    const rows = Array.isArray(raw) ? raw : raw.rows || raw.parcels || Object.values(raw);
    let double14 = 0; const examples = [];
    for (const r of rows) {
      const hits = r.hits || r.controls || r.vertical || [];
      const n14 = (Array.isArray(hits) ? hits : []).filter((h) => (h.layerId ?? h.layer) === 14).length;
      if (n14 >= 2) { double14++; if (examples.length < 8) examples.push({ id: r.parcel ?? r.lotidstring ?? r.id ?? null, hits14: (hits || []).filter((h) => (h.layerId ?? h.layer) === 14) }); }
    }
    out.q3 ??= {}; out.q3[fn] = { rows: rows.length, double14, examples, sampleKeys: rows[0] ? Object.keys(rows[0]) : null };
    console.log(`\n=== Q3 ${fn}: ${rows.length} rows · parcels with TWO+ layer-14 hits: ${double14}`);
    for (const e of examples) console.log('   ', JSON.stringify(e).slice(0, 400));
  } catch (e) { out.q3 ??= {}; out.q3[fn] = { error: String(e) }; console.log(`\n=== Q3 ${fn}: ${String(e).slice(0, 120)}`); }
}

// ── extra: OLS (278) and "Reduced Level" (718) sample rows, verbatim ─────────────────────────
for (const id of [278, 718]) {
  const q = await get(`${base(id)}/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=6&f=json`);
  out.extra[id] = (q.body?.features || []).map((f) => f.attributes);
  console.log(`\n=== SEPP/${id} rows:`); for (const r of out.extra[id]) console.log('   ', JSON.stringify(r).slice(0, 500));
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
