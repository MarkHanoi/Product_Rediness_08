import { reconstructFacade } from '../src/index.js';
import { allCases } from '../src/testing/syntheticFacades.js';
import { measureSymmetry, projectionProfiles, normalizeProfile } from '../src/reconstruction/periodicity/comb.js';
import { toGray } from '../src/contracts/RasterImage.js';

for (const c of allCases()) {
  const { ir, diagnostics: d } = await reconstructFacade(c.image);
  const rect = d.rectified.image;
  if (rect === null) { console.log(c.id, 'no plane'); continue; }
  const { cols } = projectionProfiles(toGray(rect));
  const n = cols.length;
  const norm = normalizeProfile(cols);
  const mu = norm.reduce((a,b)=>a+b,0)/n;
  const centred = norm.map(v=>v-mu);
  const scores: {axis:number;s:number}[] = [];
  const COMMON = Math.floor(n*0.25);
  for (let axis = Math.floor(n*0.25); axis <= Math.ceil(n*0.75); axis++) {
    const reach = Math.min(axis, n-1-axis, COMMON);
    if (reach < n*0.2) continue;
    let num=0, dl=0, dr=0;
    for (let dd=1; dd<=reach; dd++){ const l=centred[axis-dd]!, r=centred[axis+dd]!; num+=l*r; dl+=l*l; dr+=r*r; }
    const den = Math.sqrt(dl*dr); if (!(den>0)) continue;
    scores.push({axis, s:(num/den+1)/2});
  }
  scores.sort((a,b)=>b.s-a.s);
  const best = scores[0]!;
  const vals = scores.map(x=>x.s).sort((a,b)=>a-b);
  const med = vals[Math.floor(vals.length/2)]!;
  // how many axes are within 2% of the best, and how far apart are they
  const near = scores.filter(x=>x.s >= best.s-0.02);
  console.log(c.id.padEnd(3),
    'axis', (best.axis/n).toFixed(3), 'score', best.s.toFixed(3),
    '| median', med.toFixed(3), 'prominence', ((best.s-med)/Math.max(1e-6,1-med)).toFixed(3),
    '| nearBest', String(near.length).padStart(3), 'spread', ((Math.max(...near.map(x=>x.axis))-Math.min(...near.map(x=>x.axis)))/n).toFixed(3),
    '| IRaxis', ir.facade.symmetry.axisX?.toFixed(3));
}
