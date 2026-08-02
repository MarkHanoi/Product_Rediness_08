// PROBE C — round 3. VC with the axis order that actually works (lat,lon + explicit CRS),
// IB restricted to the drawn municipality (the bbox hit a NEIGHBOUR first — a service
// covering the bbox is not the same as covering the municipality), and attribute capture.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const stage0 = JSON.parse(fs.readFileSync(path.join(DIR, '_stage0_siu.json'), 'utf8'));
const byIne = Object.fromEntries(stage0.map((m) => [m.ine, m]));

async function get(u) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) }); return { http: r.status, ok: r.ok, body: await r.text() }; }
  catch (e) { return { http: null, ok: false, body: '', err: String(e.name || e) }; }
}
function gmlProps(xml) {
  const mem = xml.split('<gml:featureMember>')[1] || '';
  const props = {};
  for (const m of mem.matchAll(/<ms:([A-Za-z0-9_]+)>([^<]*)<\/ms:\1>/g)) if (m[1] !== 'msGeometry') props[m[1]] = m[2];
  return props;
}

const out = { vc: [], ib: [] };

// ---- VC ----
for (const ine of ['03130', '12126', '46190']) {
  const m = byIne[ine], e = m.extent;
  const bbox = `${e.ymin},${e.xmin},${e.ymax},${e.xmax},EPSG:4326`;
  const rec = { ine, name: m.name, layers: {} };
  for (const [key, tn] of [['zonificacion', 'ms:Planeamiento.Zonificacion'], ['clasificacion', 'ms:Planeamiento.Clasificacion']]) {
    const u = `https://terramapas.icv.gva.es/0702_Planeamiento?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(tn)}&bbox=${encodeURIComponent(bbox)}&maxfeatures=3`;
    const r = await get(u);
    if (!r.ok) { rec.layers[key] = { fail: 'HTTP ' + r.http }; continue; }
    if (/ExceptionText/.test(r.body)) { rec.layers[key] = { fail: 'OWS ' + (r.body.match(/ExceptionText>([^<]{0,140})/) || [])[1] }; continue; }
    const n = (r.body.match(/<gml:featureMember>/g) || []).length;
    rec.layers[key] = { n, props: n ? gmlProps(r.body) : null };
  }
  out.vc.push(rec);
  console.error('VC', ine, m.name, JSON.stringify(rec.layers).slice(0, 420));
}

// ---- IB: restrict to Eivissa itself ----
{
  const m = byIne['07026'];
  for (const where of ["MUNICIPI='EIVISSA'", "CODIMUNI='026'", "MUNICIPI LIKE '%EIVISSA%'", "MUNICIPI LIKE '%IBIZA%'"]) {
    const u = `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer/10/query?where=${encodeURIComponent(where)}&outFields=*&returnGeometry=false&resultRecordCount=3&returnCountOnly=false&f=json`;
    const r = await get(u);
    let res = 'FAIL ' + r.http;
    if (r.ok) { try { const j = JSON.parse(r.body); res = j.error ? 'ESRI ' + j.error.code + ' ' + j.error.message : { n: (j.features || []).length, props: j.features?.[0]?.attributes }; } catch { res = 'PARSE'; } }
    out.ib.push({ where, res });
    console.error('IB', where, '->', JSON.stringify(res).slice(0, 330));
  }
}
fs.writeFileSync(path.join(DIR, '_round3.json'), JSON.stringify(out, null, 1));
