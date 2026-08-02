#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/probe-a/';
const hdr = { 'user-agent': UA, accept: 'application/json, text/plain, */*', 'content-type': 'application/json' };
const hit = async (label, url, init = {}) => {
  try {
    const r = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(40000), ...init });
    const b = await r.text();
    console.log(`${label.padEnd(40)} ${String(r.status).padEnd(4)} ${String(b.length).padStart(9)}B`);
    return { status: r.status, body: b };
  } catch (e) { console.log(`${label.padEnd(40)} ERR ${String(e.message).slice(0, 50)}`); return null; }
};
// 1. runtime environment config → the true API host
for (const e of ['production', 'prod', 'pro', 'default']) {
  const r = await hit(`env ${e}.json`, `https://planejamenturbanisme.territori.gencat.cat/rpucportal/environments/${e}.json`);
  if (r?.status === 200 && r.body.length > 10) { console.log('   ', r.body.slice(0, 600)); writeFileSync(OUT + `rpuc_env_${e}.json`, r.body); }
}
// 2. the consulta endpoints, both mounts, GET + POST
for (const base of ['https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta',
                    'https://planejamenturbanisme.territori.gencat.cat/rpucportal/rest/consulta']) {
  for (const ep of ['/basica', '/codi', '/avancada']) {
    await hit(`GET  ${base.split('.cat')[1]}${ep}`, base + ep);
    const r = await hit(`POST ${base.split('.cat')[1]}${ep}`, base + ep, { method: 'POST', body: JSON.stringify({ municipi: '08196', codiIne: '08196', pagina: 0, mida: 50 }) });
    if (r?.status === 200 && r.body.length > 100) { writeFileSync(OUT + 'rpuc_hit.json', r.body); console.log('   ⭐', r.body.slice(0, 400)); }
  }
}
