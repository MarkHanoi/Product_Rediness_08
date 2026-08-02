// PROBE C — spatial verification. A service NAME is not coverage (R: verify extent).
// For each municipality, hit its CCAA planning service AT THE MUNICIPALITY'S OWN BBOX and see
// whether features actually come back.
// EVERY empty result is retried in the ALTERNATE AXIS ORDER before it is believed.
// HTTP/parse failures are UNKNOWN, tallied separately from genuine empties.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const stage0 = JSON.parse(fs.readFileSync(path.join(DIR, '_stage0_siu.json'), 'utf8'));

// prov INE prefix -> CCAA planning service. `kind`: what the layer actually carries.
//   'calificacion' = per-polygon ZONE/ORDINANCE code  -> Tier-1 hook
//   'clasificacion' = soil CLASS only (urbano/urbanizable/rustico) -> NOT an envelope hook
const PROV2CCAA = {
  '05': 'CL', '47': 'CL', '37': 'CL', '09': 'CL', '24': 'CL', '34': 'CL', '40': 'CL', '42': 'CL', '49': 'CL',
  '50': 'AR', '44': 'AR', '22': 'AR',
  '03': 'VC', '12': 'VC', '46': 'VC',
  '04': 'AN', '41': 'AN', '11': 'AN', '14': 'AN', '18': 'AN', '21': 'AN', '23': 'AN', '29': 'AN',
  '16': 'CM', '02': 'CM', '13': 'CM', '19': 'CM', '45': 'CM',
  '36': 'GA', '15': 'GA', '27': 'GA', '32': 'GA',
  '06': 'EX', '10': 'EX',
  '28': 'MD', '30': 'MC', '07': 'IB', '35': 'CN', '38': 'CN',
  '08': 'CT', '17': 'CT', '25': 'CT', '43': 'CT',
};

// WFS probes. Each entry: [label, kind, base, typename, srs]
const WFS = {
  CL: [['plau_cyl_clasificacion', 'clasificacion', 'https://idecyl.jcyl.es/geoserver/urbanismo/wfs', 'urbanismo:plau_cyl_clasificacion']],
  AR: [['SIUa:clasificacion', 'clasificacion', 'https://idearagon.aragon.es/geoserver/wfs', 'SIUa:clasificacion']],
  VC: [['Planeamiento.Zonificacion', 'calificacion', 'https://terramapas.icv.gva.es/0702_Planeamiento', 'ms:Planeamiento.Zonificacion'],
       ['Planeamiento.Clasificacion', 'clasificacion', 'https://terramapas.icv.gva.es/0702_Planeamiento', 'ms:Planeamiento.Clasificacion']],
  AN: [['DERA g07_04_Manzana', 'urban-fabric', 'https://www.ideandalucia.es/services/DERA_g7_sistema_urbano/wfs', 'DERA_g7_sistema_urbano:g07_04_Manzana']],
  MC: [['plu_ze_37_mun_uso_suelo', 'calificacion?', 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs', 'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo'],
       ['plu_clasific_tipos_urbano', 'clasificacion', 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs', 'SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbano']],
  CT: [['MUC_QUALIFICACIONS', 'calificacion', 'https://sig.gencat.cat/ows/PLANEJAMENT/wfs', 'PLANEJAMENT:MUC_QUALIFICACIONS']],
};

async function txt(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) });
    const b = await r.text();
    if (!r.ok) return { __fail: 'HTTP ' + r.status, body: b.slice(0, 200) };
    if (/ExceptionReport|ServiceException/i.test(b)) return { __fail: 'OWS-EXCEPTION', body: b.slice(0, 300) };
    return { body: b };
  } catch (e) { return { __fail: 'NET ' + (e.name || e) }; }
}

// GeoJSON count, both axis orders. Returns {n, axis, sample} or {__fail}
async function wfsCount(base, typename, ext) {
  const orders = [
    ['lonlat', `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax},EPSG:4326`],
    ['latlon', `${ext.ymin},${ext.xmin},${ext.ymax},${ext.xmax},EPSG:4326`],
    ['urn-latlon', `${ext.ymin},${ext.xmin},${ext.ymax},${ext.xmax},urn:ogc:def:crs:EPSG::4326`],
  ];
  const fails = [];
  for (const [axis, bbox] of orders) {
    const u = `${base}?service=WFS&version=2.0.0&request=GetFeature&typenames=${encodeURIComponent(typename)}&bbox=${encodeURIComponent(bbox)}&count=5&outputFormat=${encodeURIComponent('application/json')}&srsName=EPSG:4326`;
    const r = await txt(u);
    if (r.__fail) { fails.push(axis + ':' + r.__fail); continue; }
    let j; try { j = JSON.parse(r.body); } catch { fails.push(axis + ':PARSE'); continue; }
    const n = (j.features || []).length;
    if (n > 0) return { n, axis, sample: j.features[0].properties };
  }
  if (fails.length === 3) return { __fail: fails.join(' | ') };
  return { n: 0, axis: 'all-orders-empty', fails };
}

const out = [];
for (const m of stage0) {
  const cc = PROV2CCAA[m.ine.slice(0, 2)];
  const probes = WFS[cc] || [];
  const rec = { ine: m.ine, name: m.name, band: m.band, ccaa: cc, probes: [] };
  for (const [label, kind, base, tn] of probes) {
    if (!m.extent || m.extent.xmin === undefined) { rec.probes.push({ label, kind, result: 'NO-EXTENT' }); continue; }
    const r = await wfsCount(base, tn, m.extent);
    rec.probes.push({ label, kind, ...r });
    console.error(`${m.ine} ${m.name.slice(0, 20).padEnd(20)} ${cc} ${label.slice(0, 28).padEnd(28)} ${r.__fail ? 'FAIL ' + r.__fail.slice(0, 60) : 'n=' + r.n + ' (' + r.axis + ')'}`);
  }
  if (!probes.length) console.error(`${m.ine} ${m.name.slice(0, 20).padEnd(20)} ${cc} -- no WFS probe configured --`);
  out.push(rec);
}
fs.writeFileSync(path.join(DIR, '_spatial_verify.json'), JSON.stringify(out, null, 1));
