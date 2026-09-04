// §OVERLAY-CLAUSE-CENSUS (round 3) — per (layer, EPI_NAME): how many rows cite a clause, WHICH
// clause, and which LAY_NAMEs — the evidence base for registry-unsigned draft rows. A clause the
// SAME instrument served on SOME rows of the SAME map is evidence (not proof) for its uncited rows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, pool, HOST, SVC } from './probe.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../overlay-clause-census.json');
const LAYERS = [422, 771, 485, 509, 429, 430, 469, 572, 573, 763, 420, 512];
const SENTINELS = ['', 'Null', '<Null>', 'NULL', 'null'];
const nul = (v) => v === null || v === undefined || (typeof v === 'string' && SENTINELS.includes(v.trim()));
const inc = (m, k) => { m[k] = (m[k] || 0) + 1; };
const out = { probedAt: new Date().toISOString().slice(0, 10), layers: {} };
const rows = await pool(LAYERS, 4, async (id) => {
  const fields = 'EPI_NAME,LGA_NAME,LAY_NAME,LAY_CLASS,LEGIS_REF_CLAUSE,LEGIS_REF_AREA,LEGIS_REF_VALUE,PCO_REF_KEY,CLASS_DESCRIPTION,LABEL,SUGGESTED_CATEGORY';
  const u = `https://${HOST}/arcgis/rest/services/${SVC.LocalProvisions}/MapServer/${id}/query?where=1%3D1&outFields=${fields}&returnGeometry=false&f=json`;
  const q = await get(u);
  const feats = q.body?.features || [];
  const byEpi = {};
  for (const f of feats) {
    const a = f.attributes;
    const k = a.EPI_NAME ?? '(none)';
    byEpi[k] ??= { rows: 0, cited: 0, clauses: {}, layNames: {}, layClasses: {}, lga: a.LGA_NAME ?? null, pco: a.PCO_REF_KEY ?? null, areas: {}, classDesc: {}, suggested: {} };
    const e = byEpi[k];
    e.rows++;
    if (!nul(a.LEGIS_REF_CLAUSE)) { e.cited++; inc(e.clauses, a.LEGIS_REF_CLAUSE); }
    if (!nul(a.LAY_NAME)) inc(e.layNames, a.LAY_NAME);
    if (!nul(a.LAY_CLASS) && Object.keys(e.layClasses).length < 30) inc(e.layClasses, a.LAY_CLASS);
    if (!nul(a.LEGIS_REF_AREA) && Object.keys(e.areas).length < 10) inc(e.areas, a.LEGIS_REF_AREA);
    if (!nul(a.CLASS_DESCRIPTION) && Object.keys(e.classDesc).length < 10) inc(e.classDesc, a.CLASS_DESCRIPTION);
    if (!nul(a.SUGGESTED_CATEGORY)) inc(e.suggested, a.SUGGESTED_CATEGORY);
  }
  return { id, features: feats.length, byEpi };
});
for (const r of rows) {
  out.layers[r.id] = r;
  console.log(`\n=== LP/${r.id}  features=${r.features}`);
  for (const [epi, e] of Object.entries(r.byEpi).sort((a, b) => b[1].rows - a[1].rows)) {
    console.log(`  ${epi} [${e.lga}; PCO ${e.pco}] rows=${e.rows} cited=${e.cited} clauses=${JSON.stringify(e.clauses)} layNames=${JSON.stringify(e.layNames)} suggested=${JSON.stringify(e.suggested)}`);
    if (Object.keys(e.areas).length) console.log(`      LEGIS_REF_AREA: ${JSON.stringify(e.areas)}`);
    if (Object.keys(e.classDesc).length) console.log(`      CLASS_DESCRIPTION: ${JSON.stringify(e.classDesc)}`);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
