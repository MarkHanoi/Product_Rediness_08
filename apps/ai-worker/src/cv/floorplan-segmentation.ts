// @pryzm/ai-worker — Floor-plan segmentation (S50 D3).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S50
//     lines 257-259 ("Segmentation: produce binary mask of 'wall'
//     pixels.").
//   • `SPEC-45 §2.2` — input/output contract.
//   • SPEC-15 §2.4 — GPU/CPU runtime placement.
//
// At S50 the model is a deterministic mock: given a page width +
// height it produces a `BinaryMask` whose "wall pixels" are a thin
// border ring around the page (so the next pipeline stage at S55
// always has something non-trivial to vectorize). The mock matches
// the production surface (input → `SegmentationResult`); the real
// ONNX-CUDA / ONNX-CPU adapters at S52 swap in at this seam without
// touching the handler.

import type {
  BinaryMask,
  ModelRuntime,
  PdfPage,
  SegmentationResult,
} from './types.js';

/** Mock "wall" border thickness, in pixels at the page's native
 *  resolution. Calibrated so a typical 1700 × 2200 page produces a
 *  wall coverage ratio inside the SPEC-45 §8 sanity range
 *  (0.05–0.25). */
const MOCK_WALL_BORDER_PX = 24;

/** Run the floor-plan segmentation model on one page. Returns a
 *  binary mask + wall coverage ratio + inference wall-clock. */
export async function runSegmentationModel(
  page: PdfPage,
  runtime: ModelRuntime,
): Promise<SegmentationResult> {
  if (page.width <= 0 || page.height <= 0) {
    throw new Error(
      `[ai-worker/cv/segmentation] Invalid page dimensions: ${page.width}×${page.height}`,
    );
  }

  if (!runtime.mock) {
    // Real runtime branch — the porter's `segment` adapter does the
    // ONNX inference and returns the mask. Loaded inside
    // `runtime.ts` (S52 wiring); at S50 we only exercise the mock.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const realRuntime = runtime as any;
    if (typeof realRuntime.segment === 'function') {
      return realRuntime.segment(page) as Promise<SegmentationResult>;
    }
  }

  const start = performance.now();
  const mask = makeMockMask(page.width, page.height);
  const inferenceMs = performance.now() - start;
  const wallCoverage = countOnes(mask.data) / mask.data.length;

  return { mask, wallCoverage, inferenceMs };
}

/** Build a deterministic mock mask: a `MOCK_WALL_BORDER_PX`-thick
 *  border + a single internal divider running horizontally across
 *  the middle of the page. This gives the next pipeline stage a
 *  non-trivial polygon set to vectorize while keeping the wall
 *  coverage ratio inside the SPEC-45 §8 sanity range. */
function makeMockMask(width: number, height: number): BinaryMask {
  const data = new Uint8Array(width * height);
  const t = MOCK_WALL_BORDER_PX;
  const midY = Math.floor(height / 2);
  const halfBand = Math.max(2, Math.floor(t / 4));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onBorder =
        x < t || x >= width - t || y < t || y >= height - t;
      const onMidWall = y >= midY - halfBand && y < midY + halfBand;
      if (onBorder || onMidWall) {
        data[y * width + x] = 1;
      }
    }
  }

  return { width, height, data };
}

function countOnes(data: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 1) n++;
  }
  return n;
}
