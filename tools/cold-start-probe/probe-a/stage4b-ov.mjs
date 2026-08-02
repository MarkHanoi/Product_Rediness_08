#!/usr/bin/env node
// PROBE A · STAGE 4b — the OV_Trames (ordenació volumètrica) pass.
// 221 polygons exist for 08196. `bcnRefosOVProvider.ts` already reads exactly this layer for
// Barcelona clau 18 (footprint + PLANTES ⇒ an extrudable envelope, READ not constructed).
// Question: do those 221 convert any `refuse-no-parameters` parcels into envelopes?
import { writeFileSync, readFileSync } from 'node:fs';
const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/probe-a/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SVC = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';
const INE = '08196';
const esri = async (p, q) => {
  const r = await fetch(`${SVC}${p}?${new URLSearchParams({ f: 'json', ...q })}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(180000) });
  const t = await r.text(); const j = JSON.parse(t);
  return { ok: r.ok && !j.error, status: r.status, bytes: t.length, json: j };
};

const ov = await esri('/17/query', { where: `CODI_INE='${INE}'`, outFields: 'CLAU,CLAU_URB,PLANTES,PLAN,EXP,SHAPE_Area', returnGeometry: 'true', outSR: '4326' });
console.log(`OV_Trames: HTTP ${ov.status}, ${ov.bytes} B, ${ov.json.features?.length} polygons`);
const feats = ov.json.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] }));

// PLANTES population — the whole value of this layer. Parsed under assertion, never defaulted.
const pl = {};
for (const f of feats) { const v = f.a.PLANTES; const k = v === null ? '(null)' : String(v).trim() === '' ? '(empty)' : String(v); pl[k] = (pl[k] || 0) + 1; }
console.log('PLANTES distribution:', JSON.stringify(pl));
const clauDist = {};
for (const f of feats) { const k = `${f.a.CLAU_URB}`; clauDist[k] = (clauDist[k] || 0) + 1; }
console.log('CLAU_URB distribution:', JSON.stringify(clauDist));

// Which parcels fall inside an OV polygon?
const st4 = JSON.parse(readFileSync(OUT + 'stage4.parcels.json', 'utf8'));
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const parsable = (v) => v !== null && /^(B|PB|PX)?\s*\+?\s*\d+$/i.test(String(v).trim());
let hit = 0, hitWithPlantes = 0, converts = 0;
const convertedFrom = {};
for (const p of st4.results) {
  let f = null;
  for (const g of feats) { let inside = false; for (const r of g.rings) if (inRing(p.lon, p.lat, r)) inside = !inside; if (inside) { f = g; break; } }
  if (!f) continue;
  hit++;
  if (parsable(f.a.PLANTES)) {
    hitWithPlantes++;
    if (p.state !== 'envelope') { converts++; convertedFrom[p.state] = (convertedFrom[p.state] || 0) + 1; }
  }
}
const N = st4.n;
console.log(`\nparcels inside an OV polygon: ${hit} (${((100 * hit) / N).toFixed(2)}%)`);
console.log(`  …of which PLANTES is PARSABLE: ${hitWithPlantes} (${((100 * hitWithPlantes) / N).toFixed(2)}%)`);
console.log(`  …that were NOT already 'envelope': ${converts} (${((100 * converts) / N).toFixed(2)}%)  from ${JSON.stringify(convertedFrom)}`);
writeFileSync(OUT + 'stage4b.ov.json', JSON.stringify({ ine: INE, ovPolygons: feats.length, plantesDist: pl, clauDist, parcelsInOv: hit, parcelsInOvWithPlantes: hitWithPlantes, converts, convertedFrom }, null, 1));
