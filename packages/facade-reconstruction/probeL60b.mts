import { reconstructFacade } from './src/index.js';
import { caseL } from './src/testing/syntheticFacades.js';
import type { RasterImage } from './src/contracts/RasterImage.js';

function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function degrade(img: RasterImage, noise: number, contrast: number): RasterImage {
  const out: RasterImage = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const rnd = lcg(0x5eed1234);
  for (let i = 0; i < out.data.length; i += 4) {
    const d = (rnd() - 0.5) * 2 * noise;
    for (let k = 0; k < 3; k++) out.data[i + k] = 128 + (out.data[i + k]! - 128) * contrast + d;
  }
  return out;
}

for (const [noise, contrast] of [[0,1],[6,1],[12,1],[10,0.5],[20,0.6],[30,0.5]] as [number,number][]) {
  const c = caseL();
  const img = noise === 0 && contrast === 1 ? c.image : degrade(c.image, noise, contrast);
  const { ir, diagnostics: d } = await reconstructFacade(img);
  const cells = ir.facade.zones.flatMap((z) => z.cells);
  console.log(
    `noise=${noise} contrast=${contrast}`.padEnd(24),
    'zones', String(ir.facade.zones.length).padStart(2),
    'bays', String(ir.facade.zones[0]?.cells.length ?? 0).padStart(2),
    'blobs', String(d.blobs.length).padStart(3),
    'matched', String(cells.filter((x) => x.opening !== null).length).padStart(3),
    'feat', String(ir.facade.features.length).padStart(2),
    'outl', String(ir.facade.outliers.length).padStart(3),
    'repX', ir.facade.periodicity.repeatX, 'repY', ir.facade.periodicity.repeatY,
    'rowP', d.rows?.period?.toFixed(1), 'rowFit', d.rows?.fit?.toFixed(3),
    'colP', d.cols?.period?.toFixed(1), 'colFit', d.cols?.fit?.toFixed(3),
    'quadConf', d.facadeQuad.confidence?.toFixed(2),
  );
}
