// PROBE C — round 7. Mine the regional VIEWERS (the SIU UrlLink targets) for the service
// URLs they call. This is the last discovery tactic before MD/EX/CM are recorded as
// "searched, not found".
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
async function get(u) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) }); return { http: r.status, ok: r.ok, body: await r.text() }; }
  catch (e) { return { http: null, ok: false, body: '', err: String(e.name || e) }; }
}
const VIEWERS = [
  ['MD', 'https://idem.madrid.org/cartografia/sitcm/html/visor.htm'],
  ['CM', 'https://urbanismo.castillalamancha.es/planeamiento/sistema-de-informacion-urbana'],
  ['EX', 'https://sitex.juntaex.es/SITEX/'],
];
const out = [];
for (const [cc, u] of VIEWERS) {
  const r = await get(u);
  const rec = { cc, viewer: u, http: r.http };
  if (r.ok) {
    const urls = [...new Set([...r.body.matchAll(/https?:\/\/[A-Za-z0-9._\-]+(?:\/[A-Za-z0-9._\-~%/]*)?/g)].map((m) => m[0]))];
    rec.services = urls.filter((x) => /geoserver|arcgis|wms|wfs|rest\/services|MapServer|ows|geoserveis|cartografia|servicios|mapas/i.test(x)).slice(0, 40);
    rec.allHosts = [...new Set(urls.map((x) => x.split('/')[2]))].slice(0, 25);
    // also look for JS config files that might carry the endpoints
    rec.scripts = [...new Set([...r.body.matchAll(/(?:src|href)=["']([^"']+\.(?:js|json))["']/g)].map((m) => m[1]))].slice(0, 25);
  }
  out.push(rec);
  console.error('==', cc, r.http, u);
  console.error('  services:', JSON.stringify(rec.services || []).slice(0, 700));
  console.error('  hosts   :', JSON.stringify(rec.allHosts || []).slice(0, 400));
  console.error('  scripts :', JSON.stringify(rec.scripts || []).slice(0, 400));
}
fs.writeFileSync(path.join(DIR, '_round7.json'), JSON.stringify(out, null, 1));
