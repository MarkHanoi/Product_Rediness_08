import { reconstructFacade } from '../src/index.js';
const SRC = process.env.LATTICE_SRC === 'profile' ? { latticeSource: 'projection-profile' as const } : {};
import { allCases, caseL, CASE_L_TRUTH } from '../src/testing/syntheticFacades.js';

function report(id: string, r: Awaited<ReturnType<typeof reconstructFacade>>): void {
  const { ir, diagnostics: d } = r;
  const cells = ir.facade.zones.flatMap((z) => z.cells);
  const matched = cells.filter((c) => c.opening !== null);
  const arch = matched.map((c) => c.opening!.archness);
  const high = arch.filter((a) => a > 0.5).length;
  console.log(
    id.padEnd(3),
    'zones', String(ir.facade.zones.length).padStart(2),
    'bays', String(ir.facade.zones[0]?.cells.length ?? 0).padStart(2),
    'blobs', String(d.blobs.length).padStart(3),
    'matched', String(matched.length).padStart(3),
    'feat', String(ir.facade.features.length).padStart(2),
    'outl', String(ir.facade.outliers.length).padStart(3),
    'repX', ir.facade.periodicity.repeatX,
    'repY', ir.facade.periodicity.repeatY,
    'perConf', ir.facade.periodicity.confidence?.toFixed(2),
    'sym', ir.facade.symmetry.axisX?.toFixed(3), ir.facade.symmetry.score?.toFixed(2),
    'archness>0.5', high,
    'curvL', ir.facade.curvature.left.normalizedDeviation?.toFixed(4), ir.facade.curvature.left.confidence?.toFixed(2),
    'curvR', ir.facade.curvature.right.normalizedDeviation?.toFixed(4), ir.facade.curvature.right.confidence?.toFixed(2),
  );
}

const only = process.argv[2];
if (only === 'L') {
  const c = caseL();
  const r = await reconstructFacade(c.image, SRC);
  console.log('CASE L truth:', JSON.stringify(CASE_L_TRUTH));
  report('L', r);
  console.log('--- notes ---');
  for (const n of r.diagnostics.notes) console.log('  ', n);
  console.log('rows.period', r.diagnostics.rows?.period?.toFixed(2), 'fit', r.diagnostics.rows?.fit?.toFixed(3), 'peaks', r.diagnostics.rows?.peaks.length, 'breaks', r.diagnostics.rows?.breaks.length);
  console.log('cols.period', r.diagnostics.cols?.period?.toFixed(2), 'fit', r.diagnostics.cols?.fit?.toFixed(3), 'peaks', r.diagnostics.cols?.peaks.length, 'breaks', r.diagnostics.cols?.breaks.length);
  console.log('rect', r.diagnostics.rectified.image?.width, 'x', r.diagnostics.rectified.image?.height);
} else {
  for (const c of allCases()) report(c.id, await reconstructFacade(c.image, SRC));
}
