#!/usr/bin/env node
// PROBE A · STAGE 4 — constraint resolution for INE 08196 (Sant Andreu de la Barca).
//
// Three jobs:
//   (A) Does layer 17 OV_Trames (the *ordenació volumètrica* layer that `bcnRefosOVProvider.ts`
//       ALREADY consumes for Barcelona clau 18) carry anything for 08196? If it does, the 91 %
//       of zoned area with no QUAL_MUNI parameters may still resolve via an explicit footprint.
//   (B) Join the 2,472 Catastro cadastral parcels (the mandated denominator) to layer 16's zoning
//       polygons — which ALSO independently verifies the DGC-08195 frame really is this town.
//   (C) Per parcel, classify the constraint state: resolved / refused-and-why.
//
// PROBE-DISCIPLINE R2 — the point-in-polygon is done locally over the fetched rings, then a seeded
// sample is CROSS-CHECKED against the ArcGIS server's OWN spatial query (a different algorithm on a
// different machine). Disagreement is reported, never smoothed.
import { writeFileSync, readFileSync } from 'node:fs';
import { buildFrame, mulberry32 } from '../catastroParcelFrame.mjs';

const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/probe-a/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SVC = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';
const INE = '08196';

async function esri(path, params) {
  const url = `${SVC}${path}?${new URLSearchParams({ f: 'json', ...params })}`;
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(180000) });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, bytes: txt.length };
  const j = JSON.parse(txt);
  if (j.error) return { ok: false, status: r.status, esriError: j.error, bytes: txt.length };
  return { ok: true, status: r.status, bytes: txt.length, json: j };
}

// ── (A) layer 17 OV_Trames ───────────────────────────────────────────────────
const l17meta = await esri('/17', {});
const l17fields = l17meta.ok ? l17meta.json.fields.map((f) => f.name) : [];
console.log(`L17 meta: HTTP ${l17meta.status}, fields = ${l17fields.join(',')}`);
// Does it carry an INE key at all? Try both the layer-16 key and the OV key.
let ovCount = null, ovVia = null;
for (const w of [`CODI_INE='${INE}'`, `INE_URB LIKE '${INE}%'`, `EXP LIKE '%${INE}%'`]) {
  const c = await esri('/17/query', { where: w, returnCountOnly: 'true' });
  console.log(`  L17 count where ${w} → ${c.ok ? c.json.count : `ERR ${c.status} ${JSON.stringify(c.esriError?.message ?? '')}`}`);
  if (c.ok && c.json.count > 0) { ovCount = c.json.count; ovVia = w; break; }
}

// ── (B) zoning rings, and the parcel frame ───────────────────────────────────
const z = await esri('/16/query', { where: `CODI_INE='${INE}'`, outFields: 'CLAU_URB,PLAN,NORMATIV,DESCRIP', returnGeometry: 'true', outSR: '4326' });
if (!z.ok) { console.error('zoning geometry FAILED', z); process.exit(1); }
const zones = z.json.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] }));
console.log(`L16 geometry: HTTP ${z.status}, ${z.bytes} B, ${zones.length} polygons in EPSG:4326`);

const frame = await buildFrame(INE, 'SANT ANDREU DE LA BARCA');
if (!frame.ok) { console.error('parcel frame FAILED', frame); process.exit(1); }
console.log(`parcel frame: ${frame.parcelCount} parcels (cached=${frame.cached})`);

// bbox sanity — do the two datasets even overlap? (guard: verify spatial extent, don't trust names)
const zb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
for (const zz of zones) for (const r of zz.rings) for (const [x, y] of r) { if (x < zb.x0) zb.x0 = x; if (x > zb.x1) zb.x1 = x; if (y < zb.y0) zb.y0 = y; if (y > zb.y1) zb.y1 = y; }
const pb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
for (const p of frame.parcels) { if (p.lon < pb.x0) pb.x0 = p.lon; if (p.lon > pb.x1) pb.x1 = p.lon; if (p.lat < pb.y0) pb.y0 = p.lat; if (p.lat > pb.y1) pb.y1 = p.lat; }
console.log(`bbox zoning  lon ${zb.x0.toFixed(4)}..${zb.x1.toFixed(4)}  lat ${zb.y0.toFixed(4)}..${zb.y1.toFixed(4)}`);
console.log(`bbox parcels lon ${pb.x0.toFixed(4)}..${pb.x1.toFixed(4)}  lat ${pb.y0.toFixed(4)}..${pb.y1.toFixed(4)}`);

// ── point-in-polygon (even-odd, ring 0 = exterior, later rings = holes for ESRI CW/CCW) ──
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function zoneAt(lon, lat) {
  for (const zz of zones) {
    let hit = false;
    for (const r of zz.rings) if (inRing(lon, lat, r)) hit = !hit; // even-odd across rings ⇒ holes subtract
    if (hit) return zz.a;
  }
  return null;
}

// ── (C) classify every parcel ────────────────────────────────────────────────
const qm = JSON.parse(readFileSync(OUT + 'stage3.qualmuni.raw.json', 'utf8'));
const qmByClau = new Map(qm.map((r) => [String(r.CODI_MUN).slice(INE.length + 1), r]));
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';

const results = [];
for (const p of frame.parcels) {
  const a = zoneAt(p.lon, p.lat);
  if (!a) { results.push({ ...p, state: 'outside-zoning', clau: null }); continue; }
  const clau = String(a.CLAU_URB ?? '');
  const q = qmByClau.get(clau);
  const norm = String(a.NORMATIV ?? '');
  const plan = String(a.PLAN ?? '');
  let state, reason;
  if (q && has(q.ARM) && has(q.N_PLANTES) && has(q.OCUP_MAX) && has(q.SEP_FVIAL)) {
    state = 'envelope'; reason = 'QUAL_MUNI carries ARM+N_PLANTES+OCUP_MAX+setbacks (edificació aïllada)';
  } else if (norm === 'Asterisc' || plan.includes('PD*')) {
    state = 'refuse-delegated'; reason = `delegated to a plà derivat (PLAN=${plan}); AMB flags NORMATIV='Asterisc' — the instrument is not in our corpus`;
  } else if (/titol_(6|7)\./.test(norm)) {
    state = 'refuse-terminal'; reason = `systems / non-buildable land (${norm}) — no private envelope exists to compute`;
  } else if (q) {
    state = 'refuse-no-parameters'; reason = `QUAL_MUNI row EXISTS for clau ${clau} but every envelope field is NULL; governing article ${norm} is cited but its text is unobtainable (Stage 2)`;
  } else {
    state = 'refuse-no-row'; reason = `no QUAL_MUNI row for clau ${clau}`;
  }
  results.push({ ...p, state, clau, plan, normativ: norm, reason });
}

const tally = {};
for (const r of results) tally[r.state] = (tally[r.state] || 0) + 1;
const N = results.length;
console.log('\n── parcel-denominator classification (N = ' + N + ' cadastral parcels) ──');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${String(v).padStart(5)}  ${((100 * v) / N).toFixed(2)}%`);

// per-clau breakdown of the refusals
const byClau = {};
for (const r of results) { const k = `${r.clau ?? '(none)'}|${r.state}`; byClau[k] = (byClau[k] || 0) + 1; }
console.log('\ntop 15 clau|state cells:');
for (const [k, v] of Object.entries(byClau).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${k.padEnd(30)} ${String(v).padStart(5)}  ${((100 * v) / N).toFixed(2)}%`);

writeFileSync(OUT + 'stage4.parcels.json', JSON.stringify({ ine: INE, n: N, tally, byClau, ovCount, ovVia, zoneBbox: zb, parcelBbox: pb, results }, null, 0));

// ── R2 CROSS-CHECK: 15 seeded parcels re-classified by the ArcGIS SERVER's own spatial query ──
const rnd = mulberry32(20260802);
const idx = results.map((_, i) => i);
for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
const sample = idx.slice(0, 15).map((i) => results[i]);
let agree = 0, disagree = 0, err = 0;
console.log('\n── R2 oracle: server-side point query vs local PIP (15 seeded parcels) ──');
for (const s of sample) {
  const q = await esri('/16/query', {
    geometry: JSON.stringify({ x: s.lon, y: s.lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'CLAU_URB,CODI_INE', returnGeometry: 'false',
  });
  if (!q.ok) { err++; console.log(`  ${s.ref}  SERVER-ERR ${q.status}`); continue; }
  const srv = q.json.features?.[0]?.attributes ?? null;
  const srvClau = srv ? String(srv.CLAU_URB) : null;
  const ok = srvClau === s.clau;
  if (ok) agree++; else disagree++;
  console.log(`  ${s.ref}  local=${String(s.clau).padEnd(5)} server=${String(srvClau).padEnd(5)} srvINE=${srv?.CODI_INE ?? '-'}  ${ok ? 'agree' : '⚠ DISAGREE'}`);
}
console.log(`  agree ${agree} / disagree ${disagree} / server-error ${err}`);
writeFileSync(OUT + 'stage4.oracle.json', JSON.stringify({ agree, disagree, err, sample: sample.map((s) => ({ ref: s.ref, clau: s.clau, state: s.state })) }, null, 1));
