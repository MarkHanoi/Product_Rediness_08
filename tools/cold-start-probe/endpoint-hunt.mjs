// PROBE C — candidate-endpoint hunt for the CCAAs not covered by the first sweep.
// Multiple candidates per region; each is tried and its outcome recorded. 404/DNS = UNKNOWN
// for that CANDIDATE, not a verdict on the region.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const CAND = [
  // Comunidad de Madrid
  ['MD', 'https://idem.madrid.org/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['MD', 'https://idem.madrid.org/geoserver/sitcm/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['MD', 'https://gestiona.comunidad.madrid/nomecalles/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['MD', 'https://idem.madrid.org/geoserver/web/'],
  ['MD', 'https://servicios.idem.madrid.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  // Extremadura SITEX
  ['EX', 'https://sitex.juntaex.es/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['EX', 'https://ideextremadura.juntaex.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['EX', 'https://sitex.juntaex.es/SITEX/'],
  ['EX', 'https://ideex.juntaex.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  // Castilla-La Mancha
  ['CM', 'https://ide.jccm.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CM', 'https://geoservicios.castillalamancha.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CM', 'https://urbanismo.castillalamancha.es/planeamiento/sistema-de-informacion-urbana'],
  ['CM', 'https://ides.jccm.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  // Galicia
  ['GA', 'https://ideg.xunta.gal/servizos/rest/services/Ordenacion?f=json'],
  ['GA', 'https://ideg.xunta.gal/servizos/rest/services?f=json'],
  // Canarias
  ['CN', 'https://idecan2.grafcan.es/ServicioWFS/Planeamiento?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['CN', 'https://idecan1.grafcan.es/ServicioWFS/Planeamiento?service=WFS&version=2.0.0&request=GetCapabilities'],
  // Illes Balears
  ['IB', 'https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer/10?f=json'],
  // Andalucia — a planeamiento-specific service, not DERA
  ['AN', 'https://www.ideandalucia.es/services/urbanismo/wfs?service=WFS&version=2.0.0&request=GetCapabilities'],
  ['AN', 'https://ws132.juntadeandalucia.es/situadifusion/rest/services?f=json'],
  ['AN', 'https://ws172.juntadeandalucia.es/arcgis/rest/services?f=json'],
];

const res = [];
for (const [cc, url] of CAND) {
  const row = { cc, url };
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) });
    row.http = r.status;
    const b = await r.text();
    row.bytes = b.length;
    if (r.ok) {
      const ft = [...new Set([...b.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((m) => m[1]))];
      if (ft.length) { row.layers = ft; row.outcome = 'WFS ' + ft.length; }
      else {
        try {
          const j = JSON.parse(b);
          row.outcome = 'JSON';
          row.json = (j.services || j.folders || j.layers || j.fields || []).map?.((x) => x.name || x.id + ':' + x.name || x) ?? Object.keys(j);
        } catch { row.outcome = 'HTML/other'; }
      }
    } else row.outcome = 'UNKNOWN(http ' + r.status + ')';
  } catch (e) { row.http = null; row.outcome = 'UNKNOWN(' + (e.name || e) + ')'; }
  res.push(row);
  console.error(`${cc} ${String(row.http).padEnd(5)} ${String(row.outcome).padEnd(16)} ${row.url.slice(0, 80)}`);
}
fs.writeFileSync(path.join(DIR, '_endpoint_hunt.json'), JSON.stringify(res, null, 1));
