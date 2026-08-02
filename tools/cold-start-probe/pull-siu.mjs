// PROBE C — national pull of SIU/Planeamiento_Vigente (Ministerio de Vivienda).
// Paginated, attributes only. Records HTTP failures SEPARATELY from empty results (R5).
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE = 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Planeamiento_Vigente/MapServer/0/query';
const P = 'GIS_SIU.SIU.plan_mun.';
const B = 'GIS_SIU.SIU.EGRN_recintos_municipales_inspire.';
const FIELDS = [B + 'CodINE', B + 'NAMEUNIT', P + 'FiguraVigente', P + 'FechaFigura', P + 'UrlLink', P + 'textolink', P + 'observaciones'].join(',');

const rows = [];
const errors = [];
let offset = 0;
for (let page = 0; page < 20; page++) {
  const u = `${BASE}?where=1%3D1&outFields=${encodeURIComponent(FIELDS)}&returnGeometry=false&resultOffset=${offset}&resultRecordCount=2000&f=json`;
  let r, j;
  try {
    r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!r.ok) { errors.push({ offset, http: r.status }); break; }
    j = await r.json();
  } catch (e) { errors.push({ offset, err: String(e) }); break; }
  if (j.error) { errors.push({ offset, esri: j.error }); break; }
  const f = j.features || [];
  for (const x of f) rows.push(x.attributes);
  console.error(`page ${page} offset ${offset} -> ${f.length} (total ${rows.length}) exceeded=${j.exceededTransferLimit}`);
  if (f.length === 0) break;
  offset += f.length;
  if (!j.exceededTransferLimit && f.length < 2000) break;
}
fs.writeFileSync(path.join(DIR, '_siu_planvigente.json'), JSON.stringify({ rows, errors }, null, 1));
console.error('DONE rows=', rows.length, 'errors=', JSON.stringify(errors));
