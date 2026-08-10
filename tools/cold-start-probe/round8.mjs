import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
async function get(u) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) }); return { http: r.status, ok: r.ok, body: await r.text() }; }
  catch (e) { return { http: null, ok: false, body: '', err: String(e.name || e) }; }
}
const out = [];
const T = [
  ['MD', 'https://idem.madrid.org/cartografia/js/Config.js'],
  ['MD', 'https://idem.madrid.org/cartografia/sitcm/js/Config.js'],
  ['MD', 'https://idem.madrid.org/cartografia/sitcm/js/Planeamiento.js'],
  ['EX', 'https://geoportal.ideex.es/'],
  ['EX', 'https://geoportal.ideex.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
];
for (const [cc, u] of T) {
  const r = await get(u);
  const rec = { cc, url: u, http: r.http, bytes: r.body?.length };
  if (r.ok) {
    const urls = [...new Set([...r.body.matchAll(/https?:\/\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._\-~%/]*)?/g)].map((m) => m[0]))];
    rec.svc = urls.filter((x) => /geoserver|arcgis|wms|wfs|rest\/services|MapServer|ows|mapas|servicios|geoportal/i.test(x)).slice(0, 30);
    const ft = [...new Set([...r.body.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((x) => x[1]))];
    if (ft.length) rec.layers = ft.slice(0, 60);
  }
  out.push(rec);
  console.error('==', cc, r.http, u, '(' + rec.bytes + 'b)');
  if (rec.svc?.length) console.error('   svc:', JSON.stringify(rec.svc).slice(0, 900));
  if (rec.layers?.length) console.error('   layers:', JSON.stringify(rec.layers).slice(0, 900));
}
fs.writeFileSync(path.join(DIR, '_round8.json'), JSON.stringify(out, null, 1));
