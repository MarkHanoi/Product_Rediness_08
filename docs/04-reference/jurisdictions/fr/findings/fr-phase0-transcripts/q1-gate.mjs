import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('zone_urba.gpkg', { readOnly: true });
db.exec("ATTACH DATABASE 'doc_urba.gpkg' AS docs");
const T = db.prepare('SELECT COUNT(*) c FROM zone_urba').get().c;
const fill = c => db.prepare(`SELECT COUNT(*) c FROM zone_urba WHERE ${c} IS NOT NULL AND TRIM(CAST(${c} AS TEXT)) <> ''`).get().c;
console.log(`=== zone_urba fill rates (non-null AND non-empty; T=${T}) ===`);
for (const col of ['nomfic','urlfic','destoui','destcdt','destnon','destdomi','formdomi','libelle','typezone','idurba','datappro','datvalid','insee','partition']) {
  const c = fill(col); console.log(col.padEnd(9), String(c).padStart(8), '=', (100*c/T).toFixed(2) + '%');
}
console.log('distinct idurba in zone_urba:', db.prepare('SELECT COUNT(DISTINCT idurba) c FROM zone_urba').get().c);
console.log('doc_urba idurba uniqueness:', JSON.stringify(db.prepare('SELECT COUNT(*) n, COUNT(DISTINCT idurba) d FROM docs.doc_urba').get()));
console.log('=== gpu_status distribution (zone rows) ===');
for (const r of db.prepare(`SELECT COALESCE(gpu_status,'<null>') s, COUNT(*) c FROM zone_urba GROUP BY 1`).all()) console.log(' ', r.s, r.c);
console.log('=== NOMFIC/URLFIC fill by TYPEDOC (LEFT JOIN doc_urba on idurba) ===');
const rows = db.prepare(`
  SELECT COALESCE(d.typedoc, 'NO-DOC-ROW') td,
         COUNT(*) zones,
         SUM(CASE WHEN z.nomfic IS NOT NULL AND TRIM(z.nomfic) <> '' THEN 1 ELSE 0 END) nomfic_filled,
         SUM(CASE WHEN z.urlfic IS NOT NULL AND TRIM(z.urlfic) <> '' THEN 1 ELSE 0 END) urlfic_filled
  FROM zone_urba z LEFT JOIN (SELECT idurba, MAX(typedoc) typedoc FROM docs.doc_urba GROUP BY idurba) d ON z.idurba = d.idurba
  GROUP BY 1 ORDER BY zones DESC`).all();
for (const r of rows) console.log(' ', r.td.padEnd(11), 'zones=' + String(r.zones).padStart(8), 'nomfic=' + (100*r.nomfic_filled/r.zones).toFixed(2) + '%', 'urlfic=' + (100*r.urlfic_filled/r.zones).toFixed(2) + '%');
