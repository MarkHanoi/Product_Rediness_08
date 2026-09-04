// §LAY-NAME-CENSUS — is LAY_NAME populated, and how many distinct strings must a parser cover?
import fs from 'node:fs';
import { get, HOST, SVC, countUrl } from './probe.mjs';
const VERT=[422,771,485,509,429,430,469,572,573,763,420,512];
const out={};
let totalFeat=0, totalPop=0;
for (const lid of VERT) {
  const [all, pop, distinct] = await Promise.all([
    get(countUrl('LocalProvisions',lid,'1=1')),
    get(countUrl('LocalProvisions',lid,"LAY_NAME IS NOT NULL AND LAY_NAME <> '' AND LAY_NAME <> 'Null'")),
    get(`https://${HOST}/arcgis/rest/services/${SVC.LocalProvisions}/MapServer/${lid}/query?where=1%3D1&outFields=LAY_NAME&returnGeometry=false&returnDistinctValues=true&f=json`),
  ]);
  const n=all.body?.count ?? null, p=pop.body?.count ?? null;
  const names=[...new Set((distinct.body?.features||[]).map(f=>f.attributes.LAY_NAME))];
  out[lid]={features:n, layNamePopulated:p, distinctLayNames:names};
  totalFeat+=n||0; totalPop+=p||0;
  console.log(`layer ${lid}: ${n} features, LAY_NAME populated ${p} (${n?((p/n)*100).toFixed(1):'-'}%), ${names.length} distinct`);
  for(const nm of names) console.log(`    ${JSON.stringify(nm)}`);
}
console.log(`\nTOTAL vertical overlay: ${totalPop}/${totalFeat} = ${((totalPop/totalFeat)*100).toFixed(1)}% LAY_NAME populated`);
fs.writeFileSync('../layname-census.json', JSON.stringify({capturedAt:new Date().toISOString().slice(0,10), totalFeat, totalPop, layers:out}, null, 1));
