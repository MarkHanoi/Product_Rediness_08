import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('zone_urba.gpkg', { readOnly: true });
db.exec("ATTACH DATABASE 'doc_urba.gpkg' AS docs");
console.log('=== idurba kind parse across all zones ===');
for (const r of db.prepare(`SELECT CASE
    WHEN idurba IS NULL OR TRIM(idurba)='' THEN '<empty idurba>'
    WHEN instr(upper(idurba), 'PLUI') > 0 THEN 'PLUi-shaped'
    WHEN instr(upper(idurba), 'PSMV') > 0 THEN 'PSMV-shaped'
    WHEN instr(upper(idurba), 'PLU') > 0 THEN 'PLU-shaped'
    WHEN instr(upper(idurba), 'POS') > 0 THEN 'POS-shaped'
    WHEN instr(upper(idurba), 'CC') > 0 THEN 'CC-shaped'
    ELSE 'OTHER' END k, COUNT(*) c,
    SUM(CASE WHEN TRIM(COALESCE(nomfic,'')) <> '' THEN 1 ELSE 0 END) nomfic_f
  FROM zone_urba GROUP BY 1 ORDER BY c DESC`).all()) console.log(' ', r.k.padEnd(15), String(r.c).padStart(8), 'nomfic=' + (100*r.nomfic_f/r.c).toFixed(2) + '%');
console.log('=== OTHER samples ===');
for (const r of db.prepare(`SELECT idurba, COUNT(*) c FROM zone_urba WHERE idurba IS NOT NULL AND TRIM(idurba)<>'' AND instr(upper(idurba),'PLU')=0 AND instr(upper(idurba),'POS')=0 AND instr(upper(idurba),'CC')=0 AND instr(upper(idurba),'PSMV')=0 GROUP BY 1 ORDER BY c DESC LIMIT 10`).all()) console.log(' ', r.idurba, 'x'+r.c);
console.log('=== sample nomfic values ===');
for (const r of db.prepare(`SELECT nomfic, COUNT(*) c FROM zone_urba WHERE TRIM(COALESCE(nomfic,''))<>'' GROUP BY 1 ORDER BY RANDOM() LIMIT 10`).all()) console.log(' ', JSON.stringify(r.nomfic), 'x'+r.c);
console.log('=== sample urlfic values ===');
for (const r of db.prepare(`SELECT urlfic FROM zone_urba WHERE TRIM(COALESCE(urlfic,''))<>'' ORDER BY RANDOM() LIMIT 6`).all()) console.log(' ', JSON.stringify(r.urlfic));
console.log('=== nomfic-empty rows: which docs ===');
for (const r of db.prepare(`SELECT COALESCE(NULLIF(TRIM(idurba),''),'<empty>') i, COUNT(*) c FROM zone_urba WHERE TRIM(COALESCE(nomfic,''))='' GROUP BY 1 ORDER BY c DESC LIMIT 8`).all()) console.log(' ', r.i, r.c);
console.log('=== zones per doc: median-ish (for context) ===');
const zs = db.prepare(`SELECT COUNT(*) z FROM zone_urba WHERE TRIM(COALESCE(idurba,''))<>'' GROUP BY idurba ORDER BY z`).all().map(r=>r.z);
console.log('  docs:', zs.length, 'min:', zs[0], 'p50:', zs[Math.floor(zs.length/2)], 'p90:', zs[Math.floor(zs.length*0.9)], 'max:', zs[zs.length-1]);
