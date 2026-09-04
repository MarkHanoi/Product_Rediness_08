// §P14-SEPP-CENSUS (round 3) — how many Principal/14 HOB polygons are SEPP-drawn, which SEPPs,
// and how they are cited. /query returns the EPI_TYPE domain CODE ('LEP'/'SEPP'); identify returns
// the DESCRIPTION ('Local Environment Plan'/'State Environmental Planning Policy'). Same field.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { get, HOST, SVC } from './probe.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const P14 = `https://${HOST}/arcgis/rest/services/${SVC.Principal}/MapServer/14`;
const nul = (v) => v === null || v === undefined || (typeof v === 'string' && ['', 'Null', '<Null>', 'NULL', 'null'].includes(v.trim()));
const meta = await get(`${P14}?f=json`);
const epiField = (meta.body?.fields || []).find((f) => f.name === 'EPI_TYPE');
console.log('EPI_TYPE field:', JSON.stringify(epiField).slice(0, 600));
const out = { probedAt: new Date().toISOString().slice(0, 10), epiTypeDomain: epiField?.domain ?? null, byType: {}, sepp: {} };
for (const code of ['LEP', 'SEPP']) {
  const c = await get(`${P14}/query?where=${encodeURIComponent(`EPI_TYPE = '${code}'`)}&returnCountOnly=true&f=json`);
  out.byType[code] = c.body?.count ?? c.body;
}
const other = await get(`${P14}/query?where=${encodeURIComponent(`EPI_TYPE <> 'LEP' AND EPI_TYPE <> 'SEPP'`)}&returnCountOnly=true&f=json`);
out.byType.other = other.body?.count ?? other.body;
console.log('Principal/14 by EPI_TYPE:', JSON.stringify(out.byType));
const rows = await get(`${P14}/query?where=${encodeURIComponent(`EPI_TYPE = 'SEPP'`)}&outFields=EPI_NAME,LGA_NAME,UNITS,LEGIS_REF_CLAUSE,MAX_B_H&returnGeometry=false&f=json`);
const feats = rows.body?.features || [];
for (const f of feats) { const a = f.attributes; const e = (out.sepp[a.EPI_NAME] ??= { rows: 0, cited: 0, clauses: {}, units: {}, lgas: {}, nullUnits: 0 }); e.rows++; if (!nul(a.LEGIS_REF_CLAUSE)) { e.cited++; e.clauses[a.LEGIS_REF_CLAUSE] = (e.clauses[a.LEGIS_REF_CLAUSE] || 0) + 1; } if (nul(a.UNITS)) e.nullUnits++; else e.units[a.UNITS] = (e.units[a.UNITS] || 0) + 1; if (!nul(a.LGA_NAME) && Object.keys(e.lgas).length < 12) e.lgas[a.LGA_NAME] = (e.lgas[a.LGA_NAME] || 0) + 1; }
console.log(`SEPP-drawn HOB polygons returned: ${feats.length} (exceeded=${rows.body?.exceededTransferLimit ?? false})`);
for (const [k, e] of Object.entries(out.sepp).sort((a, b) => b[1].rows - a[1].rows)) console.log(`  ${String(e.rows).padStart(5)}  ${k}\n         cited ${e.cited}/${e.rows} ${JSON.stringify(e.clauses)} · UNITS ${JSON.stringify(e.units)} nullUnits=${e.nullUnits} · LGAs ${Object.keys(e.lgas).join(', ')}`);
// 718 "Reduced Level" (SEPP service) — is it on Principal/14 too?
const q718 = await get(`https://${HOST}/arcgis/rest/services/${SVC.SEPP}/MapServer/718/query?where=1%3D1&outFields=OBJECTID,LAY_CLASS,UNITS&returnGeometry=true&outSR=4283&f=json`);
out.rl718 = [];
for (const f of (q718.body?.features || []).slice(0, 5)) {
  const ring = f.geometry?.rings?.[0]; if (!ring) continue;
  let cx = 0, cy = 0; for (const [x, y] of ring) { cx += x; cy += y; } cx /= ring.length; cy /= ring.length;
  const d = 0.0004; const idq = new URLSearchParams({ geometry: `${cx},${cy}`, geometryType: 'esriGeometryPoint', sr: '4283', layers: 'all:14', tolerance: '0', mapExtent: `${cx - d},${cy - d},${cx + d},${cy + d}`, imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' });
  const h = await get(`https://${HOST}/arcgis/rest/services/${SVC.Principal}/MapServer/identify?${idq}`);
  const p14 = (h.body?.results || []).map((r) => ({ epi: r.attributes['EPI Name'], v: r.attributes['Maximum Building Height'], units: r.attributes['Units'] }));
  out.rl718.push({ objectid: f.attributes.OBJECTID, layClass: f.attributes.LAY_CLASS, units: f.attributes.UNITS, lon: cx, lat: cy, p14 });
  console.log(`  718 #${f.attributes.OBJECTID} LAY_CLASS=${f.attributes.LAY_CLASS} UNITS=${f.attributes.UNITS} → P14: ${JSON.stringify(p14)}`);
}
fs.writeFileSync(path.resolve(HERE, '../p14-sepp-census.json'), JSON.stringify(out, null, 1));
