// PROBE C — regional planning-service capabilities sweep.
// One row per CCAA endpoint. Records HTTP status AND parsed feature types.
// A non-200, a timeout, or an unparseable body is UNKNOWN — never "no service".
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const TARGETS = [
  ['CL', 'Castilla y Leon', 'wfs', 'https://idecyl.jcyl.es/geoserver/urbanismo/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['AR', 'Aragon', 'wfs', 'https://idearagon.aragon.es/Visor2DServices/services/WFS/Urbanismo/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['AR2', 'Aragon geoserver', 'wfs', 'https://idearagon.aragon.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['VC', 'Com. Valenciana ICV planeamiento', 'wfs', 'https://terramapas.icv.gva.es/0702_Planeamiento?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['AN', 'Andalucia DERA g7', 'wfs', 'https://www.ideandalucia.es/services/DERA_g7_sistema_urbano/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['MC', 'Murcia SIT plan urbanistico', 'wfs', 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CT', 'Catalunya PLANEJAMENT', 'wfs', 'https://sig.gencat.cat/ows/PLANEJAMENT/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['MD', 'Madrid IDEM geoserver', 'wfs', 'https://idem.madrid.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['EX', 'Extremadura SITEX', 'wfs', 'https://sitex.juntaex.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['IB', 'Illes Balears IDEIB MUIB', 'arcgis', 'https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer?f=json'],
  ['CN', 'Canarias GRAFCAN planeamiento', 'wms', 'https://idecan2.grafcan.es/ServicioWMS/Planeamiento?service=WMS&version=1.3.0&request=GetCapabilities'],
  ['GA', 'Galicia SIOTUGA', 'arcgis', 'https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer?f=json'],
  ['CM', 'Castilla-La Mancha IDE', 'wfs', 'https://ide.castillalamancha.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
];

const res = [];
for (const [cc, name, kind, url] of TARGETS) {
  const t0 = Date.now();
  const row = { cc, name, kind, url };
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    row.http = r.status;
    const body = await r.text();
    row.bytes = body.length;
    if (!r.ok) { row.outcome = 'UNKNOWN(http)'; }
    else if (kind === 'arcgis') {
      try { const j = JSON.parse(body); row.layers = (j.layers || []).map((l) => l.id + ':' + l.name); row.outcome = 'OK'; }
      catch { row.outcome = 'UNKNOWN(parse)'; row.head = body.slice(0, 200); }
    } else {
      const ft = [...body.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((m) => m[1]);
      const wl = [...body.matchAll(/<Layer[^>]*>\s*(?:<[^>]+>\s*)*?<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
      const all = [...new Set([...ft, ...wl])];
      row.layers = all;
      row.outcome = all.length ? 'OK' : 'EMPTY(no layers parsed)';
      if (!all.length) row.head = body.slice(0, 300);
    }
  } catch (e) { row.http = null; row.outcome = 'UNKNOWN(' + (e.name || e) + ')'; }
  row.ms = Date.now() - t0;
  res.push(row);
  console.error(`${cc.padEnd(4)} http=${String(row.http).padEnd(5)} ${String(row.outcome).padEnd(22)} layers=${(row.layers || []).length} ${row.ms}ms`);
}
fs.writeFileSync(path.join(DIR, '_regional_caps.json'), JSON.stringify(res, null, 1));
