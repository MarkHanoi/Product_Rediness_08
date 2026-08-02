#!/usr/bin/env node
// PROBE A · stage 2 — RPUC (Registre de planejament urbanístic de Catalunya) REST API.
// API base extracted from the Angular bundle: /RPUC-portal/rest/consulta
import { writeFileSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const H = 'https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta';
const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/probe-a/';
const hdr = { 'user-agent': UA, accept: 'application/json, text/plain, */*', 'content-type': 'application/json' };

async function hit(label, url, init = {}) {
  try {
    const r = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(40000), ...init });
    const b = await r.text();
    console.log(`${label.padEnd(28)} ${String(r.status).padEnd(4)} ${String(b.length).padStart(9)}B  ${(r.headers.get('content-type') || '?').slice(0, 26)}`);
    return { status: r.status, body: b };
  } catch (e) { console.log(`${label.padEnd(28)} ERR  ${String(e.message).slice(0, 60)}`); return null; }
}

// The search form posts a filter object. Try the documented shapes.
const bodies = [
  { label: 'cerca municipi 08196', body: { municipi: '08196' } },
  { label: 'cerca codiMunicipi', body: { codiMunicipi: '08196' } },
  { label: 'cerca ine', body: { ine: '08196', tipusConsulta: 'BASICA' } },
];
for (const { label, body } of bodies) {
  const r = await hit(label, `${H}/cerca`, { method: 'POST', body: JSON.stringify(body) });
  if (r && r.status === 200 && r.body.length > 50) { writeFileSync(OUT + 'rpuc_cerca.json', r.body); console.log('   saved →', r.body.slice(0, 300)); break; }
}
await hit('llistatResultats GET', `${H}/llistatResultats`);
await hit('llistatResultats?muni', `${H}/llistatResultats?municipi=08196`);
