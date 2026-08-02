#!/usr/bin/env node
// PROBE A · stage 2 — RPUC /basica is GET-with-query-params (500 = missing params, 405 on POST).
// Brute the param name. TIME-BOXED: one round.
import { writeFileSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/probe-a/';
const B = 'https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/basica';
const hdr = { 'user-agent': UA, accept: 'application/json, text/plain, */*' };
const keys = ['municipi', 'codiMunicipi', 'municipis', 'idMunicipi', 'ine', 'codiIne', 'municipiSel', 'nomMunicipi'];
for (const k of keys) {
  const url = `${B}?${k}=08196`;
  try {
    const r = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(30000) });
    const b = await r.text();
    console.log(`${k.padEnd(14)} ${String(r.status).padEnd(4)} ${String(b.length).padStart(8)}B  ${b.slice(0, 90).replace(/\s+/g, ' ')}`);
    if (r.status === 200 && b.length > 100) { writeFileSync(OUT + 'rpuc_basica.json', b); console.log('  ⭐ SAVED'); break; }
  } catch (e) { console.log(`${k.padEnd(14)} ERR ${String(e.message).slice(0, 40)}`); }
}
// also: municipi name instead of code
for (const v of ['Sant Andreu de la Barca', '08196', '196']) {
  const url = `${B}?municipi=${encodeURIComponent(v)}&pagina=1&registres=25`;
  try {
    const r = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(30000) });
    const b = await r.text();
    console.log(`v="${v}" ${String(r.status).padEnd(4)} ${String(b.length).padStart(8)}B  ${b.slice(0, 90).replace(/\s+/g, ' ')}`);
    if (r.status === 200 && b.length > 100) { writeFileSync(OUT + 'rpuc_basica.json', b); console.log('  ⭐ SAVED'); break; }
  } catch (e) { console.log(`v="${v}" ERR`); }
}
