import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('zone_urba.gpkg', { readOnly: true });
db.exec("ATTACH DATABASE 'prescription_surf.gpkg' AS ps");
db.exec("ATTACH DATABASE 'prescription_lin.gpkg' AS pl");
// DOCUMENT-LEVEL PROXY (not the spatial intersect — that is DEFERRED-NEEDS-SPATIAL-DB):
// zones belonging to a document that carries >=1 TYPEPSC=15 prescription.
const r = db.prepare(`
  WITH docs15 AS (
    SELECT DISTINCT NULLIF(TRIM(idurba),'') i FROM ps.prescription_surf WHERE TRIM(typepsc)='15'
    UNION
    SELECT DISTINCT NULLIF(TRIM(idurba),'') i FROM pl.prescription_lin WHERE TRIM(typepsc)='15'
  )
  SELECT COUNT(*) zones, COUNT(DISTINCT z.idurba) docs
  FROM zone_urba z JOIN docs15 d ON z.idurba = d.i WHERE d.i IS NOT NULL`).get();
console.log('zones in documents carrying >=1 drawn-setback (TYPEPSC=15) prescription:', r.zones, 'across', r.docs, 'documents');
const t = db.prepare(`SELECT COUNT(*) c FROM zone_urba`).get().c;
console.log('= ' + (100*r.zones/t).toFixed(2) + '% of all ' + t + ' zones (DOCUMENT-level proxy; true geometric intersect DEFERRED)');
// union of distinct partitions across both layers for 15
const p = db.prepare(`
  SELECT COUNT(*) c FROM (
    SELECT DISTINCT partition FROM ps.prescription_surf WHERE TRIM(typepsc)='15'
    UNION SELECT DISTINCT partition FROM pl.prescription_lin WHERE TRIM(typepsc)='15')`).get();
console.log('distinct partitions with TYPEPSC=15 (surf UNION lin):', p.c);
