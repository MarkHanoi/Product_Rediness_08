#!/usr/bin/env node
// PROBE A · STAGE 3 — variable resolution for INE 08196 (Sant Andreu de la Barca).
// Pulls AMB table 18 QUAL_MUNI (the per-municipality per-clau numeric envelope parameter table)
// and layer 16 QU_Trames (the zoning polygons), then reports, PER CLAU, which envelope variables
// are actually populated — and how much AREA each state covers.
//
// §CONTEXT-DATA-HONESTY: null / empty-string / absent-row are THREE different values and stay three.
import { writeFileSync } from 'node:fs';
const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/probe-a/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SVC = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';
const INE = '08196';

async function esri(path, params) {
  const qs = new URLSearchParams({ f: 'json', ...params });
  const url = `${SVC}${path}?${qs}`;
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120000) });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, bytes: txt.length };
  const j = JSON.parse(txt);
  if (j.error) return { ok: false, status: r.status, esriError: j.error, bytes: txt.length };
  return { ok: true, status: r.status, bytes: txt.length, json: j };
}

// ── 1. QUAL_MUNI rows for this municipality (key is CODI_MUN = '<INE>_<CLAU>', NOT CODI_INE) ──
const t = await esri('/18/query', { where: `CODI_MUN LIKE '${INE}%'`, outFields: '*', returnGeometry: 'false' });
if (!t.ok) { console.error('QUAL_MUNI FAILED', t); process.exit(1); }
const rows = t.json.features.map((f) => f.attributes);
console.log(`QUAL_MUNI: HTTP ${t.status}, ${t.bytes} B, ${rows.length} rows`);

// ── 2. zoning polygons, with area, so coverage is AREA-weighted not row-weighted ──
const g = await esri('/16/query', { where: `CODI_INE='${INE}'`, outFields: 'CLAU_URB,PLAN,DESCRIP,NORMATIV,INE_URB,SHAPE_Area,CODI_SECT,TIPUS_SECT', returnGeometry: 'false' });
if (!g.ok) { console.error('QU_Trames FAILED', g); process.exit(1); }
const polys = g.json.features.map((f) => f.attributes);
console.log(`QU_Trames: HTTP ${g.status}, ${g.bytes} B, ${polys.length} polygons`);

const VARS = ['IE', 'ARM', 'N_PLANTES', 'OCUP_MAX', 'SEP_FVIAL', 'SEP_LAT', 'SEP_FONS', 'S_MIN_PAR', 'F_MIN_PAR', 'ST_MAX', 'DENS_U', 'ESPLADERIVAT', 'ASTERISC'];
const present = (v) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-';

// index QUAL_MUNI by clau
const byClau = new Map();
for (const r of rows) {
  const clau = String(r.CODI_MUN ?? '').slice(INE.length + 1);
  if (!byClau.has(clau)) byClau.set(clau, []);
  byClau.get(clau).push(r);
}

// area per clau
const areaByClau = new Map();
const planByClau = new Map();
const normByClau = new Map();
let totalArea = 0;
for (const p of polys) {
  const c = String(p.CLAU_URB ?? '');
  const a = Number(p.SHAPE_Area) || 0;
  areaByClau.set(c, (areaByClau.get(c) || 0) + a);
  totalArea += a;
  if (!planByClau.has(c)) planByClau.set(c, new Set());
  planByClau.get(c).add(p.PLAN);
  if (!normByClau.has(c)) normByClau.set(c, new Set());
  normByClau.get(c).add(p.NORMATIV);
}

const claus = [...areaByClau.keys()].sort((a, b) => areaByClau.get(b) - areaByClau.get(a));
console.log(`\nzoning: ${claus.length} distinct CLAU_URB over ${(totalArea / 1e6).toFixed(2)} km2 (SHAPE_Area, EPSG:3857 — RELATIVE weights only, see note)\n`);

const hdr = ['CLAU', 'area_km2', '%', 'QM_rows', ...VARS.map((v) => v.slice(0, 6)), 'PLAN', 'NORMATIV'];
console.log(hdr.join('\t'));
const report = [];
for (const c of claus) {
  const qm = byClau.get(c) || [];
  const flags = VARS.map((v) => (qm.some((r) => present(r[v])) ? '1' : '.'));
  const a = areaByClau.get(c);
  const rec = {
    clau: c, areaM2: a, pct: (a / totalArea) * 100, qualMuniRows: qm.length,
    vars: Object.fromEntries(VARS.map((v, i) => [v, flags[i] === '1'])),
    values: Object.fromEntries(VARS.map((v) => [v, qm.map((r) => r[v]).filter(present)])),
    plan: [...planByClau.get(c)], normativ: [...normByClau.get(c)],
  };
  report.push(rec);
  console.log([c, (a / 1e6).toFixed(4), ((a / totalArea) * 100).toFixed(2), qm.length, ...flags,
    [...planByClau.get(c)].join('|'), [...normByClau.get(c)].join('|').replace('num_poum_sant_andreu_de_la_barca.', '')].join('\t'));
}

// ── headline: what fraction of zoned area has the CORE envelope trio ──
const core = (r) => r.vars.IE || (r.vars.ARM || r.vars.N_PLANTES);
const withCore = report.filter(core);
const withNoQM = report.filter((r) => r.qualMuniRows === 0);
console.log(`\nzones with ≥1 QUAL_MUNI row: ${report.length - withNoQM.length}/${report.length}  (${(100 * report.filter(r=>r.qualMuniRows>0).reduce((s, r) => s + r.areaM2, 0) / totalArea).toFixed(2)}% of zoned area)`);
console.log(`zones with a core envelope var (IE or ARM/N_PLANTES): ${withCore.length}/${report.length}  (${(100 * withCore.reduce((s, r) => s + r.areaM2, 0) / totalArea).toFixed(2)}% of zoned area)`);
writeFileSync(OUT + 'stage3.variables.json', JSON.stringify({ ine: INE, totalAreaM2: totalArea, qualMuniRows: rows.length, polygons: polys.length, report }, null, 1));
writeFileSync(OUT + 'stage3.qualmuni.raw.json', JSON.stringify(rows, null, 1));
console.log('\n→ stage3.variables.json + stage3.qualmuni.raw.json');
