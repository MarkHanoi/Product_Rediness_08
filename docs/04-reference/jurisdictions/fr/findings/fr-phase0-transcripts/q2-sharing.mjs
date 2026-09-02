import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('zone_urba.gpkg', { readOnly: true });
console.log('=== FORMDOMI value distribution (codes verbatim, NOT interpreted — brief §10.1) ===');
for (const r of db.prepare(`SELECT COALESCE(NULLIF(TRIM(formdomi),''),'<empty>') f, COUNT(*) c FROM zone_urba GROUP BY 1 ORDER BY c DESC`).all()) console.log(' ', r.f.padEnd(8), r.c);
console.log('=== destdomi distribution ===');
for (const r of db.prepare(`SELECT COALESCE(NULLIF(TRIM(destdomi),''),'<empty>') f, COUNT(*) c FROM zone_urba GROUP BY 1 ORDER BY c DESC LIMIT 25`).all()) console.log(' ', r.f.padEnd(8), r.c);
console.log('=== TYPEZONE distribution ===');
for (const r of db.prepare(`SELECT TRIM(typezone) t, COUNT(*) c FROM zone_urba GROUP BY 1 ORDER BY c DESC`).all()) console.log(' ', r.t.padEnd(6), r.c);
console.log('=== zone-scoped vs shared reglement, per non-empty idurba (8269 docs... those with idurba) ===');
const agg = db.prepare(`
  WITH per AS (
    SELECT idurba,
           COUNT(*) zones,
           COUNT(DISTINCT NULLIF(TRIM(nomfic),'')) d_nomfic,
           COUNT(DISTINCT NULLIF(TRIM(urlfic),'')) d_urlfic
    FROM zone_urba WHERE idurba IS NOT NULL AND TRIM(idurba) <> ''
    GROUP BY idurba)
  SELECT COUNT(*) docs,
         SUM(zones) zones,
         SUM(CASE WHEN d_nomfic = 1 THEN 1 ELSE 0 END) one_file_all_zones,
         SUM(CASE WHEN d_nomfic > 1 AND d_nomfic < zones THEN 1 ELSE 0 END) partial,
         SUM(CASE WHEN d_nomfic >= zones AND zones > 1 THEN 1 ELSE 0 END) per_zone_files,
         SUM(CASE WHEN zones = 1 THEN 1 ELSE 0 END) single_zone_docs,
         SUM(CASE WHEN d_nomfic = 0 THEN 1 ELSE 0 END) no_nomfic_docs,
         SUM(CASE WHEN d_urlfic = 0 THEN 1 ELSE 0 END) no_urlfic_docs,
         SUM(CASE WHEN d_urlfic = 1 THEN 1 ELSE 0 END) one_url_docs,
         SUM(CASE WHEN d_urlfic > 1 THEN 1 ELSE 0 END) multi_url_docs,
         AVG(CAST(d_nomfic AS REAL)/zones) mean_nomfic_ratio,
         AVG(CAST(d_urlfic AS REAL)/zones) mean_urlfic_ratio
  FROM per`).get();
console.log(JSON.stringify(agg, null, 1));
console.log('=== NO-idurba subpopulation cross-fills (the standard-version signal) ===');
const sub = db.prepare(`SELECT COUNT(*) c,
  SUM(CASE WHEN TRIM(COALESCE(insee,'')) <> '' THEN 1 ELSE 0 END) insee_f,
  SUM(CASE WHEN TRIM(COALESCE(datappro,'')) <> '' THEN 1 ELSE 0 END) datappro_f,
  SUM(CASE WHEN TRIM(COALESCE(nomfic,'')) <> '' THEN 1 ELSE 0 END) nomfic_f,
  SUM(CASE WHEN TRIM(COALESCE(destdomi,'')) <> '' THEN 1 ELSE 0 END) destdomi_f
  FROM zone_urba WHERE idurba IS NULL OR TRIM(idurba) = ''`).get();
console.log(JSON.stringify(sub));
