import { reconstructFacade } from '../src/index.js';
import { allCases } from '../src/testing/syntheticFacades.js';
for (const c of allCases()) {
  const { ir, diagnostics: d } = await reconstructFacade(c.image);
  const prot = ir.facade.zones.flatMap(z=>z.cells).filter(x=>x.protrusion !== null).length;
  console.log(c.id.padEnd(3), 'soffits', String(d.soffits.length).padStart(2), 'protrusionCells', String(prot).padStart(3), d.soffits.map(s=>`y${s.y}h${s.bandHeight}`).join(' '));
}
