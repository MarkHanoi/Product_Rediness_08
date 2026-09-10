import { treesFetchHalfDeg, groundFetchHalfDeg } from '../apps/editor/src/ui/geospatial/contextExtentBudget';
import { scopeReadCompleteCeilingM } from '../apps/editor/src/ui/geospatial/scopeReadCeiling';
const good = scopeReadCompleteCeilingM(41.3874, 2.1686);
const bad = scopeReadCompleteCeilingM(NaN, NaN);
console.log('good ceiling', good.radiusM, '-> treesHalfDeg', treesFetchHalfDeg(undefined, good.radiusM));
console.log('NaN  ceiling', bad.radiusM, '-> treesHalfDeg', treesFetchHalfDeg(undefined, bad.radiusM));
console.log('bad.line:', bad.line);
console.log('groundFetchHalfDeg', groundFetchHalfDeg());
