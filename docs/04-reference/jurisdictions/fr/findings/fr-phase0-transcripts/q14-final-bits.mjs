import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const mdb = new DatabaseSync('municipality.gpkg', { readOnly: true });
console.log('=== RNU (municipality.gpkg, extract 2026-08-29) ===');
for (const r of mdb.prepare(`SELECT is_rnu, is_deleted, COUNT(*) c FROM municipality GROUP BY 1,2`).all()) console.log('  is_rnu=' + r.is_rnu, 'is_deleted=' + r.is_deleted, r.c);
const pop = new Map(JSON.parse(readFileSync('communes-population.json','utf8')).map(c => [c.code, c.population || 0]));
const natPop = [...pop.values()].reduce((a,b)=>a+b,0);
let rnuPop = 0, n = 0;
for (const r of mdb.prepare(`SELECT insee FROM municipality WHERE is_rnu=1 AND is_deleted=0`).all()) { n++; rnuPop += pop.get(r.insee) || 0; }
console.log('  non-deleted RNU communes:', n, 'population:', rnuPop.toLocaleString(), '=', (100*rnuPop/natPop).toFixed(2) + '% of', natPop.toLocaleString());
const db = new DatabaseSync('prescription_surf.gpkg', { readOnly: true });
console.log('=== plan-masse partition shapes (TYPEPSC=14 surf) ===');
const parts = db.prepare(`SELECT DISTINCT partition p FROM prescription_surf WHERE TRIM(typepsc)='14'`).all().map(r=>r.p);
const communal = parts.filter(p => /^DU_\d{5}(_|$)/.test(p));
const epci = parts.filter(p => /^DU_\d{9}(_|$)/.test(p));
console.log('  total:', parts.length, 'commune-shaped (5-digit INSEE):', communal.length, 'EPCI-shaped (9-digit SIREN):', epci.length, 'other:', parts.length - communal.length - epci.length);
