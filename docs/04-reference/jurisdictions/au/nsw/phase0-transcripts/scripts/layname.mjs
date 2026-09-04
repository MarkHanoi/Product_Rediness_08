import { get, HOST, SVC } from './probe.mjs';
for (const lid of [429, 422, 771, 485, 509, 469, 763, 420, 512]) {
  const u=`https://${HOST}/arcgis/rest/services/${SVC.LocalProvisions}/MapServer/${lid}/query?where=1%3D1&outFields=LAY_NAME,LGA_NAME,LAY_CLASS,SUGGESTED_CATEGORY&returnGeometry=false&returnDistinctValues=true&f=json`;
  const r = await get(u);
  const feats = r.body?.features || [];
  const byName = {};
  for (const f of feats) {
    const k = `${f.attributes.LAY_NAME}`;
    byName[k] = byName[k] || { n:0, lgas:new Set(), cat:new Set(), sample:[] };
    byName[k].n++; byName[k].lgas.add(f.attributes.LGA_NAME); byName[k].cat.add(f.attributes.SUGGESTED_CATEGORY);
    if (byName[k].sample.length<3) byName[k].sample.push(f.attributes.LAY_CLASS);
  }
  console.log(`\n=== layer ${lid} — ${feats.length} distinct rows`);
  for (const [k,v] of Object.entries(byName)) {
    console.log(`  LAY_NAME=${JSON.stringify(k)} rows=${v.n} lgas=${[...v.lgas].slice(0,4).join('|')} cat=${[...v.cat].join('|')} class=${v.sample.join(',')}`);
  }
}
