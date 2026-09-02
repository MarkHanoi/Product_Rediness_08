import { DatabaseSync } from 'node:sqlite';
for (const layer of ['prescription_surf', 'prescription_lin']) {
  const db = new DatabaseSync(layer + '.gpkg', { readOnly: true });
  console.log('======== ' + layer + ' (extract vintage 2026-08-29) ========');
  const T = db.prepare(`SELECT COUNT(*) c FROM ${layer}`).get().c;
  console.log('total rows:', T);
  console.log('-- TYPEPSC=15 by stypepsc --');
  for (const r of db.prepare(`SELECT COALESCE(NULLIF(TRIM(stypepsc),''),'<empty>') s, COUNT(*) c FROM ${layer} WHERE TRIM(typepsc)='15' GROUP BY 1 ORDER BY c DESC`).all()) console.log('  15/' + r.s, r.c);
  const t15 = db.prepare(`SELECT COUNT(*) c, COUNT(DISTINCT partition) dp, COUNT(DISTINCT NULLIF(TRIM(idurba),'')) di FROM ${layer} WHERE TRIM(typepsc)='15'`).get();
  console.log('  15 TOTAL:', t15.c, 'distinct partitions:', t15.dp, 'distinct idurba:', t15.di);
  console.log('-- TYPEPSC=14 --');
  const t14 = db.prepare(`SELECT COUNT(*) c, COUNT(DISTINCT partition) dp, COUNT(DISTINCT NULLIF(TRIM(insee),'')) dinsee FROM ${layer} WHERE TRIM(typepsc)='14'`).get();
  console.log('  14 TOTAL:', t14.c, 'distinct partitions:', t14.dp, 'distinct insee (nb: insee sparsely filled):', t14.dinsee);
  console.log('-- TYPEPSC=29 by stypepsc --');
  for (const r of db.prepare(`SELECT COALESCE(NULLIF(TRIM(stypepsc),''),'<empty>') s, COUNT(*) c FROM ${layer} WHERE TRIM(typepsc)='29' GROUP BY 1 ORDER BY c DESC`).all()) console.log('  29/' + r.s, r.c);
  console.log('-- TYPEPSC=30 by stypepsc --');
  for (const r of db.prepare(`SELECT COALESCE(NULLIF(TRIM(stypepsc),''),'<empty>') s, COUNT(*) c FROM ${layer} WHERE TRIM(typepsc)='30' GROUP BY 1 ORDER BY c DESC`).all()) console.log('  30/' + r.s, r.c);
  const f = c => db.prepare(`SELECT COUNT(*) c FROM ${layer} WHERE ${c} IS NOT NULL AND TRIM(CAST(${c} AS TEXT)) <> ''`).get().c;
  console.log('-- fills --');
  for (const col of ['nomfic','urlfic','idurba','insee']) { const c = f(col); console.log('  ' + col, c, '=', (100*c/T).toFixed(2) + '%'); }
  console.log('-- top TYPEPSC codes overall --');
  for (const r of db.prepare(`SELECT COALESCE(NULLIF(TRIM(typepsc),''),'<empty>') t, COUNT(*) c FROM ${layer} GROUP BY 1 ORDER BY c DESC LIMIT 12`).all()) console.log('  ' + r.t, r.c);
  db.close();
}
