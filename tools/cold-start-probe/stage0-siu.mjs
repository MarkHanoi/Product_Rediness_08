// PROBE C — per-municipality Stage 0, national layer.
// For each drawn municipality: SIU plan figure, SIU vector presence, and the municipality extent
// (WGS84) used later to SPATIALLY VERIFY regional services (R: verify extent, don't trust a name).
// Failures (HTTP / Esri error / timeout) are recorded as UNKNOWN, never as 0.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const draw = JSON.parse(fs.readFileSync(path.join(DIR, 'probe-c.draw.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(DIR, '_siu_planvigente.json'), 'utf8'));
const P = 'GIS_SIU.SIU.plan_mun.', B = 'GIS_SIU.SIU.EGRN_recintos_municipales_inspire.';
const planBy = new Map(plan.rows.map((r) => [r[B + 'CodINE'], r]));

async function j(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) return { __fail: 'HTTP ' + r.status };
    const b = await r.json();
    if (b.error) return { __fail: 'ESRI ' + b.error.code + ' ' + b.error.message };
    return b;
  } catch (e) { return { __fail: 'NET ' + String(e.name || e) }; }
}

const OGC = 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer';
const PV = 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Planeamiento_Vigente/MapServer/0';

const out = [];
for (const d of draw.drawn) {
  const rec = { ...d };
  const pr = planBy.get(d.ine);
  rec.siu_figura = pr ? pr[P + 'FiguraVigente'] : null;
  rec.siu_fecha = pr ? pr[P + 'FechaFigura'] : null;
  rec.siu_urllink = pr ? pr[P + 'UrlLink'] : null;
  rec.siu_planRecord = pr ? 'present' : 'ABSENT';

  // extent (WGS84) from the INSPIRE municipal boundary carried by the same service
  const ex = await j(`${PV}/query?where=${encodeURIComponent(`${B}CodINE='${d.ine}'`)}&returnExtentOnly=true&outSR=4326&f=json`);
  rec.extent = ex.__fail ? { __fail: ex.__fail } : (ex.extent || { __fail: 'NO_EXTENT' });

  // SIU vector planning layers, matched on the 5-digit INE code
  for (const [lyr, key] of [[15, 'clases_suelo'], [13, 'sectores'], [14, 'recintos']]) {
    const c = await j(`${OGC}/${lyr}/query?where=${encodeURIComponent(`ProvINE='${d.ine}' AND FechaBaja='99999999'`)}&returnCountOnly=true&f=json`);
    rec['siu_' + key] = c.__fail ? 'UNKNOWN:' + c.__fail : c.count;
  }
  out.push(rec);
  console.error(`${d.ine} ${d.name.padEnd(28)} fig=${String(rec.siu_figura).slice(0, 20).padEnd(20)} cls=${rec.siu_clases_suelo} sec=${rec.siu_sectores} rec=${rec.siu_recintos}`);
}
fs.writeFileSync(path.join(DIR, '_stage0_siu.json'), JSON.stringify(out, null, 1));
