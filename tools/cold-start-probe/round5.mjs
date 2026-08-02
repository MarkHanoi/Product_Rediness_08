// PROBE C — round 5. VC via bbox + post-filter on cod_ine_mun (the OGC <Filter> route 500s).
// CN via WMS GetFeatureInfo at a point INSIDE Telde. GA via SIOTUGA ArcGIS.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const stage0 = JSON.parse(fs.readFileSync(path.join(DIR, '_stage0_siu.json'), 'utf8'));
const byIne = Object.fromEntries(stage0.map((m) => [m.ine, m]));
async function get(u) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) }); return { http: r.status, ok: r.ok, body: await r.text() }; }
  catch (e) { return { http: null, ok: false, body: '', err: String(e.name || e) }; }
}
const out = { vc: [], cn: [], ga: [] };

// ---- VC: bbox (lat,lon + CRS token — the only order that returns anything) then post-filter ----
for (const ine of ['03130', '12126', '46190']) {
  const m = byIne[ine], e = m.extent;
  const bbox = `${e.ymin},${e.xmin},${e.ymax},${e.xmax},EPSG:4326`;
  const rec = { ine, name: m.name, layers: {} };
  for (const [key, tn] of [['zonificacion', 'ms:Planeamiento.Zonificacion'], ['clasificacion', 'ms:Planeamiento.Clasificacion']]) {
    const u = `https://terramapas.icv.gva.es/0702_Planeamiento?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(tn)}&bbox=${encodeURIComponent(bbox)}&maxfeatures=1500`;
    const r = await get(u);
    if (!r.ok) { rec.layers[key] = { st: 'UNKNOWN', why: 'HTTP ' + (r.http ?? r.err) }; continue; }
    if (/ExceptionText/.test(r.body)) { rec.layers[key] = { st: 'UNKNOWN', why: 'OWS' }; continue; }
    const members = r.body.split('<gml:featureMember>').slice(1);
    const mine = members.filter((s) => new RegExp(`<ms:cod_ine_mun>${ine}</ms:cod_ine_mun>`).test(s));
    const ex = mine[0] || '';
    const props = {}; for (const mm of ex.matchAll(/<ms:([A-Za-z0-9_]+)>([^<]*)<\/ms:\1>/g)) if (mm[1] !== 'msGeometry') props[mm[1]] = mm[2];
    rec.layers[key] = { st: mine.length ? 'COVERED' : 'EMPTY', nTotalInBbox: members.length, nThisMuni: mine.length, props: mine.length ? props : undefined };
  }
  out.vc.push(rec);
  console.error('VC', ine, m.name, JSON.stringify(Object.fromEntries(Object.entries(rec.layers).map(([k, v]) => [k, v.st + ' ' + (v.nThisMuni ?? '') + '/' + (v.nTotalInBbox ?? '')]))));
}

// ---- CN: GetFeatureInfo at Telde town centre ----
{
  const pts = [[-15.4194, 27.9950], [-15.4160, 28.0000]];
  for (const [cx, cy] of pts) {
    for (const lyr of ['ZONIF', 'CLASI', 'EDIFL', 'ZUSO']) {
      const d = 0.0015;
      const u = `https://idecan2.grafcan.es/ServicioWMS/Planeamiento?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=${lyr}&query_layers=${lyr}&srs=EPSG:4326&bbox=${cx - d},${cy - d},${cx + d},${cy + d}&width=101&height=101&x=50&y=50&info_format=text/plain&feature_count=2`;
      const r = await get(u);
      const body = (r.body || r.err || '').replace(/\s+/g, ' ').trim();
      const hit = /Feature \d+:/.test(body);
      out.cn.push({ pt: [cx, cy], lyr, http: r.http, hit, body: body.slice(0, 420) });
      console.error('CN', lyr, cx, r.http, hit ? 'HIT' : 'no-result', body.slice(0, 200));
    }
  }
}

// ---- GA: SIOTUGA ArcGIS layers 8 (SUNc) and 28 (SUc) ----
{
  const m = byIne['36043'], e = m.extent;
  const geom = encodeURIComponent(JSON.stringify({ xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax, spatialReference: { wkid: 4326 } }));
  for (const l of [8, 28, 5, 29]) {
    const u = `https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/${l}/query?geometry=${geom}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&resultRecordCount=3&f=json`;
    const r = await get(u);
    let res = 'HTTP ' + (r.http ?? r.err);
    if (r.ok) { try { const j = JSON.parse(r.body); res = j.error ? 'ESRI ' + j.error.code + ' ' + j.error.message : { n: (j.features || []).length, props: j.features?.[0]?.attributes }; } catch { res = 'PARSE'; } }
    out.ga.push({ layer: l, res });
    console.error('GA layer', l, '->', JSON.stringify(res).slice(0, 320));
  }
}
fs.writeFileSync(path.join(DIR, '_round5.json'), JSON.stringify(out, null, 1));
