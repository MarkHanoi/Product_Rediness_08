import { reconstructFacade } from '../src/index.js';
import { caseL, caseD } from '../src/testing/syntheticFacades.js';
import { toGray } from '../src/contracts/RasterImage.js';
for (const c of [caseD(), caseL()]) {
  const { diagnostics: d } = await reconstructFacade(c.image);
  const rect = d.rectified.image!;
  const g = toGray(rect);
  console.log(c.id, 'rect', rect.width, 'x', rect.height, 'peaks', d.rows!.peaks.join(','));
  console.log('  soffits', JSON.stringify(d.soffits));
  // row means down a column strip, to locate the real dark bands
  const means: number[] = [];
  for (let y = 0; y < g.height; y++) { let s = 0; for (let x = 0; x < g.width; x++) s += g.data[y * g.width + x]!; means.push(s / g.width); }
  const dark = means.map((v, y) => ({ v, y })).filter((r) => r.v < 170 && r.v > 120);
  console.log('  mid-dark rows (120..170):', dark.slice(0, 60).map((r) => `${r.y}:${r.v.toFixed(0)}`).join(' '));
}
