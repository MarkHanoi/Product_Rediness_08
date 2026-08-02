// PROBE C — ROUND 4, DEFINITIVE per-municipality coverage.
// Every earlier bbox hit turned out to be a NEIGHBOURING municipality. Coverage is therefore
// tested by MUNICIPALITY ATTRIBUTE FILTER, not by bbox. Counts only.
// Outcomes are three-valued: COVERED (n>0) / EMPTY (n==0, query succeeded) / UNKNOWN (failure).
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const stage0 = JSON.parse(fs.readFileSync(path.join(DIR, '_stage0_siu.json'), 'utf8'));

async function get(u) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) }); return { http: r.status, ok: r.ok, body: await r.text() }; }
  catch (e) { return { http: null, ok: false, body: '', err: String(e.name || e) }; }
}
// GeoServer WFS 2.0 hits + one sample
async function gsCount(base, tn, cql) {
  const u = `${base}?service=WFS&version=2.0.0&request=GetFeature&typenames=${encodeURIComponent(tn)}&CQL_FILTER=${encodeURIComponent(cql)}&count=3&outputFormat=${encodeURIComponent('application/json')}`;
  const r = await get(u);
  if (!r.ok) return { st: 'UNKNOWN', why: 'HTTP ' + (r.http ?? r.err) };
  if (/Exception/i.test(r.body) && !r.body.trim().startsWith('{')) return { st: 'UNKNOWN', why: 'OWS ' + r.body.slice(0, 120).replace(/\s+/g, ' ') };
  try { const j = JSON.parse(r.body); const n = (j.features || []).length; return { st: n ? 'COVERED' : 'EMPTY', n, props: j.features?.[0]?.properties }; }
  catch { return { st: 'UNKNOWN', why: 'PARSE' }; }
}
// MapServer WFS 1.1 (VC) — GML, needs a Filter; use OGC filter on cod_ine_mun
async function msCount(tn, ine) {
  const filt = `<Filter><PropertyIsEqualTo><PropertyName>cod_ine_mun</PropertyName><Literal>${ine}</Literal></PropertyIsEqualTo></Filter>`;
  const u = `https://terramapas.icv.gva.es/0702_Planeamiento?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(tn)}&filter=${encodeURIComponent(filt)}&maxfeatures=3`;
  const r = await get(u);
  if (!r.ok) return { st: 'UNKNOWN', why: 'HTTP ' + (r.http ?? r.err) };
  if (/ExceptionText/.test(r.body)) return { st: 'UNKNOWN', why: 'OWS ' + ((r.body.match(/ExceptionText>([^<]{0,120})/) || [])[1] || '') };
  const n = (r.body.match(/<gml:featureMember>/g) || []).length;
  const mem = r.body.split('<gml:featureMember>')[1] || '';
  const props = {}; for (const m of mem.matchAll(/<ms:([A-Za-z0-9_]+)>([^<]*)<\/ms:\1>/g)) if (m[1] !== 'msGeometry') props[m[1]] = m[2];
  return { st: n ? 'COVERED' : 'EMPTY', n, props: n ? props : undefined };
}
async function agsCount(base, where) {
  const u = `${base}/query?where=${encodeURIComponent(where)}&outFields=*&returnGeometry=false&resultRecordCount=3&f=json`;
  const r = await get(u);
  if (!r.ok) return { st: 'UNKNOWN', why: 'HTTP ' + (r.http ?? r.err) };
  try { const j = JSON.parse(r.body); if (j.error) return { st: 'UNKNOWN', why: 'ESRI ' + j.error.code }; const n = (j.features || []).length; return { st: n ? 'COVERED' : 'EMPTY', n, props: j.features?.[0]?.attributes }; }
  catch { return { st: 'UNKNOWN', why: 'PARSE' }; }
}

const CFG = {
  CL: async (m) => ({ 'CyL plau_clasificacion (clase)': await gsCount('https://idecyl.jcyl.es/geoserver/urbanismo/wfs', 'urbanismo:plau_cyl_clasificacion', `c_mun='${m.ine}'`) }),
  AR: async (m) => ({ 'AR SIUa:clasificacion (clase+params)': await gsCount('https://idearagon.aragon.es/geoserver/wfs', 'SIUa:clasificacion', `cod_ine=${Number(m.ine)}`) }),
  VC: async (m) => ({ 'VC Zonificacion (CALIF)': await msCount('ms:Planeamiento.Zonificacion', m.ine), 'VC Clasificacion (clase)': await msCount('ms:Planeamiento.Clasificacion', m.ine) }),
  CT: async (m) => ({ 'CT MUC_QUALIFICACIONS (CALIF)': await gsCount('https://sig.gencat.cat/ows/PLANEJAMENT/wfs', 'PLANEJAMENT:MUC_QUALIFICACIONS', `CODI_INE='${m.ine}'`) }),
  MC: async (m) => ({ 'MC plu_ze_37_mun_uso_suelo': await gsCount('https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs', 'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo', `Municipio='${m.name}'`), 'MC plu_clasific_tipos_urbano (EDIFICABILIDAD)': await gsCount('https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs', 'SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbano', `Municipio='${m.name}'`) }),
  AN: async (m) => ({ 'AN DERA g07_04_Manzana (URBAN FABRIC, not planning)': await gsCount('https://www.ideandalucia.es/services/DERA_g7_sistema_urbano/wfs', 'DERA_g7_sistema_urbano:g07_04_Manzana', `cod_mun='${m.ine}'`) }),
  IB: async (m) => ({ 'IB MUIB QUALIFICACIONS (CALIF)': await agsCount('https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer/10', `CODIMUNI='${m.ine.slice(2)}'`) }),
};

const out = [];
for (const m of stage0) {
  const cc = { '05': 'CL', '47': 'CL', '37': 'CL', '50': 'AR', '44': 'AR', '03': 'VC', '12': 'VC', '46': 'VC', '04': 'AN', '41': 'AN', '30': 'MC', '08': 'CT', '07': 'IB' }[m.ine.slice(0, 2)];
  const rec = { ine: m.ine, name: m.name, band: m.band, ccaa: cc || { '16': 'CM', '36': 'GA', '06': 'EX', '28': 'MD', '35': 'CN' }[m.ine.slice(0, 2)], results: {} };
  if (CFG[cc]) rec.results = await CFG[cc](m);
  out.push(rec);
  const summ = Object.entries(rec.results).map(([k, v]) => `${k}=${v.st}${v.n ? '(' + v.n + ')' : ''}${v.why ? '[' + v.why.slice(0, 40) + ']' : ''}`).join(' | ');
  console.error(`${m.ine} ${m.name.slice(0, 24).padEnd(24)} ${rec.ccaa} ${summ || '(no regional probe)'}`);
}
fs.writeFileSync(path.join(DIR, '_round4.json'), JSON.stringify(out, null, 1));
