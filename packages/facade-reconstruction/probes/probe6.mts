import { reconstructFacade } from '../src/index.js';
import { caseA, caseJ } from '../src/testing/syntheticFacades.js';
for (const c of [caseA(), caseJ()]) {
  const { ir, diagnostics } = await reconstructFacade(c.image);
  const blobs = diagnostics.blobs;
  const meanRect = blobs.reduce((a,b)=>a+b.rectangularity,0)/blobs.length;
  const cells = ir.facade.zones.flatMap(z=>z.cells).filter(x=>x.opening);
  const meanOpenConf = cells.reduce((a,x)=>a+(x.opening!.confidence ?? 0),0)/cells.length;
  const meanCellConf = ir.facade.zones.flatMap(z=>z.cells).reduce((a,x)=>a+(x.confidence ?? 0),0)/ir.facade.zones.flatMap(z=>z.cells).length;
  console.log(c.id,
    'rowsFit', diagnostics.rows?.fit?.toFixed(4),
    'colsFit', diagnostics.cols?.fit?.toFixed(4),
    'quadConf', diagnostics.facadeQuad.confidence?.toFixed(4),
    'meanBlobRect', meanRect.toFixed(4),
    'meanOpeningConf', meanOpenConf.toFixed(4),
    'meanCellConf', meanCellConf.toFixed(4),
    'lines', diagnostics.lines.length,
    'symScore', ir.facade.symmetry.score?.toFixed(4));
}
