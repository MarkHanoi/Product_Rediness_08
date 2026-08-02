// PROBE C — round 6, final discovery. GA by CODINE (bbox hit a neighbour again).
// Last targeted candidates for MD / EX / CM so their verdict is "searched and not found",
// with the candidate list recorded — not "absent".
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
async function get(u) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) }); return { http: r.status, ok: r.ok, body: await r.text() }; }
  catch (e) { return { http: null, ok: false, body: '', err: String(e.name || e) }; }
}
const out = { ga: [], cand: [] };

// GA by CODINE
for (const l of [29, 8, 28]) {
  const u = `https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/${l}/query?where=${encodeURIComponent("CODINE='36043'")}&outFields=*&returnGeometry=false&resultRecordCount=3&f=json`;
  const r = await get(u);
  let res = 'HTTP ' + (r.http ?? r.err);
  if (r.ok) { try { const j = JSON.parse(r.body); res = j.error ? 'ESRI ' + j.error.code + ' ' + j.error.message : { n: (j.features || []).length, props: j.features?.[0]?.attributes }; } catch { res = 'PARSE'; } }
  out.ga.push({ layer: l, res });
  console.error('GA', l, JSON.stringify(res).slice(0, 330));
}

const CANDS = [
  ['MD', 'https://idem.madrid.org/geoservicios/urbanismo/wms?service=WMS&version=1.3.0&request=GetCapabilities'],
  ['MD', 'https://idem.madrid.org/wms/urbanismo?service=WMS&version=1.3.0&request=GetCapabilities'],
  ['MD', 'https://gestiona.comunidad.madrid/planea_web/'],
  ['MD', 'https://idem.madrid.org/'],
  ['EX', 'https://sitex.juntaex.es/sitex/rest/services?f=json'],
  ['EX', 'https://sitex.juntaex.es/geoserver/sitex/wms?service=WMS&version=1.3.0&request=GetCapabilities'],
  ['EX', 'https://ideextremadura.com/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CM', 'https://ide.castillalamancha.es/'],
  ['CM', 'https://mapas.jccm.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CM', 'https://urbanismo.castillalamancha.es/geoserver/urbanismo/wms?service=WMS&version=1.3.0&request=GetCapabilities'],
];
for (const [cc, u] of CANDS) {
  const r = await get(u);
  let outc = 'UNKNOWN(' + (r.err || 'http ' + r.http) + ')';
  let det;
  if (r.ok) {
    const ft = [...new Set([...r.body.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((x) => x[1]))];
    if (ft.length) { outc = 'LAYERS ' + ft.length; det = ft.slice(0, 30); }
    else { try { const j = JSON.parse(r.body); outc = 'JSON'; det = (j.services || j.folders || j.layers || []).map((x) => x.name ?? x); } catch { outc = 'HTML(' + r.body.length + 'b)'; } }
  }
  out.cand.push({ cc, url: u, http: r.http, outcome: outc, detail: det });
  console.error(cc, String(r.http).padEnd(5), outc, JSON.stringify(det || '').slice(0, 220));
}
fs.writeFileSync(path.join(DIR, '_round6.json'), JSON.stringify(out, null, 1));
