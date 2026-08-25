import { reconstructFacade } from '../src/index.js';
import { caseA, caseC, caseE } from '../src/testing/syntheticFacades.js';

for (const c of [caseA(), caseC()]) {
  const { ir, diagnostics } = await reconstructFacade(c.image);
  const rect = diagnostics.rectified.image!;
  console.log('=== ', c.id, 'rect', rect.width, 'x', rect.height);
  console.log('bay bands from cells:', ir.facade.zones[0]!.cells.map(x=>[+ (x.x*rect.width).toFixed(0), +((x.x+x.width)*rect.width).toFixed(0)].join('-')).join(' '));
  console.log('blob bboxes (first 6):', diagnostics.blobs.slice(0,6).map(b=>`${b.bbox.x0}-${b.bbox.x1} x ${b.bbox.y0}-${b.bbox.y1}`).join(' | '));
  const cells = ir.facade.zones.flatMap(z=>z.cells).filter(x=>x.opening);
  console.log('ratios:', cells.slice(0,6).map(x=>(x.opening!.width/x.width).toFixed(3)).join(' '), 'archness:', cells.slice(0,6).map(x=>x.opening!.archness.toFixed(3)).join(' '));
}
const e = await reconstructFacade(caseE().image);
console.log('E curvature', JSON.stringify(e.ir.facade.curvature));
for (const n of e.diagnostics.notes) console.log('  E-', n);
