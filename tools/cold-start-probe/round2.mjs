// PROBE C — round 2. VC via WFS 1.1 params; IB/GA via ArcGIS envelope query; CN via WMS
// GetFeatureInfo (the honest test of "are there attributes behind the WMS"); plus a second
// endpoint hunt for MD / EX / CM / CN / AN.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const stage0 = JSON.parse(fs.readFileSync(path.join(DIR, '_stage0_siu.json'), 'utf8'));
const byIne = Object.fromEntries(stage0.map((m) => [m.ine, m]));

async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    const b = await r.text();
    return { http: r.status, ok: r.ok, body: b };
  } catch (e) { return { http: null, ok: false, err: String(e.name || e) }; }
}

const out = { vc: [], ib: [], ga: [], cn: [], hunt2: [] };

// ---- VC: MapServer WFS 1.1.0, typename/maxfeatures, geojson ----
for (const ine of ['03130', '12126', '46190']) {
  const m = byIne[ine], e = m.extent;
  const rows = [];
  for (const tn of ['ms:Planeamiento.Zonificacion', 'ms:Planeamiento.Clasificacion']) {
    let got = null;
    for (const [axis, bbox] of [['lonlat', `${e.xmin},${e.ymin},${e.xmax},${e.ymax}`], ['latlon', `${e.ymin},${e.xmin},${e.ymax},${e.xmax}`]]) {
      for (const fmt of ['geojson', 'application/json']) {
        const u = `https://terramapas.icv.gva.es/0702_Planeamiento?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(tn)}&bbox=${encodeURIComponent(bbox)}&maxfeatures=3&outputformat=${encodeURIComponent(fmt)}&srsname=EPSG:4326`;
        const r = await get(u);
        if (r.ok && r.body.trim().startsWith('{')) {
          try { const j = JSON.parse(r.body); if ((j.features || []).length) { got = { axis, fmt, n: j.features.length, props: j.features[0].properties }; } } catch { /* §SWALLOW-PROBE — a body that does not parse as JSON is the NEGATIVE RESULT this probe is measuring; `got` stays unset and the caller records the miss */ }
        }
        if (got) break;
        if (!got && r.ok && /Exception/i.test(r.body)) rows.push({ tn, axis, fmt, fail: 'OWS-EXCEPTION ' + r.body.slice(0, 160).replace(/\s+/g, ' ') });
        else if (!r.ok) rows.push({ tn, axis, fmt, fail: 'HTTP ' + r.http });
      }
      if (got) break;
    }
    rows.push({ tn, result: got || 'EMPTY-OR-FAIL' });
  }
  out.vc.push({ ine, name: m.name, rows });
  console.error('VC', ine, m.name, JSON.stringify(rows.filter((r) => r.result)).slice(0, 260));
}

// ---- IB: ArcGIS envelope query on layer 10 QUALIFICACIONS ----
{
  const m = byIne['07026'], e = m.extent;
  const geom = encodeURIComponent(JSON.stringify({ xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax, spatialReference: { wkid: 4326 } }));
  const u = `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer/10/query?geometry=${geom}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&resultRecordCount=3&f=json`;
  const r = await get(u);
  let parsed = 'FAIL';
  if (r.ok) { try { const j = JSON.parse(r.body); parsed = j.error ? 'ESRI ' + j.error.code : { n: (j.features || []).length, props: j.features?.[0]?.attributes }; } catch { parsed = 'PARSE'; } }
  else parsed = 'HTTP ' + r.http;
  out.ib.push({ ine: '07026', name: m.name, parsed });
  console.error('IB 07026 Ibiza ->', JSON.stringify(parsed).slice(0, 400));
}

// ---- GA: SIOTUGA layers ----
{
  const r = await get('https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer?f=json');
  let layers = 'FAIL';
  if (r.ok) { try { layers = JSON.parse(r.body).layers.map((l) => l.id + ':' + l.name); } catch { layers = 'PARSE'; } }
  out.ga.push({ layers });
  console.error('GA layers ->', JSON.stringify(layers).slice(0, 600));
}

// ---- CN: WMS GetFeatureInfo at the centre of Telde ----
{
  const m = byIne['35026'], e = m.extent;
  const cx = (e.xmin + e.xmax) / 2, cy = (e.ymin + e.ymax) / 2;
  const d = 0.002;
  for (const lyr of ['ZONIF', 'ZON', 'CLASIF', 'EDIF']) {
    const u = `https://idecan2.grafcan.es/ServicioWMS/Planeamiento?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=${lyr}&query_layers=${lyr}&srs=EPSG:4326&bbox=${cx - d},${cy - d},${cx + d},${cy + d}&width=101&height=101&x=50&y=50&info_format=text/plain&feature_count=3`;
    const r = await get(u);
    const rec = { lyr, http: r.http, body: (r.body || r.err || '').slice(0, 300).replace(/\s+/g, ' ') };
    out.cn.push(rec);
    console.error('CN', lyr, r.http, rec.body.slice(0, 160));
  }
}

// ---- hunt 2 ----
const C2 = [
  ['MD', 'https://idem.madrid.org/arcgis/rest/services?f=json'],
  ['MD', 'https://idem.madrid.org/cartografia/rest/services?f=json'],
  ['MD', 'https://geoportal.comunidad.madrid/arcgis/rest/services?f=json'],
  ['EX', 'https://sitex.juntaex.es/arcgis/rest/services?f=json'],
  ['EX', 'https://www.ideex.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CM', 'https://ide.castillalamancha.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CM', 'https://urbanismo.castillalamancha.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CN', 'https://idecan2.grafcan.es/ServicioWMS/Planeamiento?service=WMS&version=1.1.1&request=GetCapabilities'],
  ['AN', 'https://www.ideandalucia.es/services/DERA_g11_pat/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['AN', 'https://ws132.juntadeandalucia.es/situadifusion/rest/services/situa/MapServer?f=json'],
];
for (const [cc, u] of C2) {
  const r = await get(u);
  let outcome = 'UNKNOWN(' + (r.err || 'http ' + r.http) + ')';
  let detail;
  if (r.ok) {
    const ft = [...new Set([...r.body.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((x) => x[1]))];
    if (ft.length) { outcome = 'WFS/WMS ' + ft.length; detail = ft.slice(0, 40); }
    else { try { const j = JSON.parse(r.body); outcome = 'JSON'; detail = (j.services || j.folders || j.layers || []).map((x) => x.name ?? x); } catch { outcome = 'HTML/other'; } }
  }
  out.hunt2.push({ cc, url: u, http: r.http, outcome, detail });
  console.error('H2', cc, String(r.http).padEnd(5), outcome, JSON.stringify(detail || '').slice(0, 200));
}

fs.writeFileSync(path.join(DIR, '_round2.json'), JSON.stringify(out, null, 1));
