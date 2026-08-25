import { reconstructFacade } from '../src/index.js';
import { caseA, caseB, caseC, caseG, caseI, caseJ, caseK2, caseK4 } from '../src/testing/syntheticFacades.js';

for (const c of [caseA(), caseB(), caseI(), caseJ()]) {
  const { ir, diagnostics } = await reconstructFacade(c.image);
  console.log('=== case', c.id, '===');
  console.log('crop', JSON.stringify(diagnostics.crop.rect), diagnostics.crop.applied, diagnostics.crop.refusedReason);
  console.log('lines', diagnostics.lines.length, 'H', diagnostics.lines.filter(l=>l.family==='horizontal').length, 'V', diagnostics.lines.filter(l=>l.family==='vertical').length);
  console.log('quad', diagnostics.facadeQuad.status, JSON.stringify(diagnostics.facadeQuad.quad), diagnostics.facadeQuad.confidence);
  console.log('rect', diagnostics.rectified.image?.width, 'x', diagnostics.rectified.image?.height, 'aspect', diagnostics.rectified.aspect);
  console.log('rows period', diagnostics.rows?.period, 'fit', diagnostics.rows?.fit, 'breaks', diagnostics.rows?.breaks);
  console.log('cols period', diagnostics.cols?.period, 'fit', diagnostics.cols?.fit, 'breaks', diagnostics.cols?.breaks);
  console.log('periodicity', JSON.stringify(ir.facade.periodicity));
  console.log('zones', ir.facade.zones.length, 'cells/zone', ir.facade.zones[0]?.cells.length);
  console.log('blobs', diagnostics.blobs.length, 'matched', diagnostics.blobs.filter(b=>b.matchedCell).length);
  console.log('features', ir.facade.features.length, 'outliers', ir.facade.outliers.length);
  console.log('notes:'); for (const n of diagnostics.notes) console.log('  -', n);
}
