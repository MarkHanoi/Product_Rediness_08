import { reconstructFacade } from '../src/index.js';
import { caseA } from '../src/testing/syntheticFacades.js';
import { toGray } from '../src/contracts/RasterImage.js';
import { findBlobs, otsuThreshold, fitArch } from '../src/reconstruction/openings/detect.js';
import { resolveOptions } from '../src/contracts/Options.js';

const opts = resolveOptions();
const { diagnostics } = await reconstructFacade(caseA().image);
const rect = diagnostics.rectified.image!;
const g = toGray(rect);
const full = { x0:0, y0:0, x1: rect.width, y1: rect.height };
const t = otsuThreshold(g, full);
console.log('otsu', t);
const blobs = findBlobs(g, full, t, opts, rect.width*rect.height/20);
console.log('blobs', blobs.length);
for (const b of blobs.slice(0,3)) {
  console.log('bbox', b.bbox.x0, b.bbox.y0, b.bbox.x1, b.bbox.y1, 'area', b.area, 'rect', b.rectangularity.toFixed(3));
  console.log('  topProfile', b.topProfile.slice(0,20).map(v=>v.toFixed(0)).join(','), '... len', b.topProfile.length, 'min', Math.min(...b.topProfile), 'max', Math.max(...b.topProfile));
  console.log('  fitArch', JSON.stringify(fitArch(b.topProfile, opts)));
}
