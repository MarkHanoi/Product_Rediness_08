// C108 §3.11 / SPEC S16 (brief §13) — the facade surface as a PARAMETER.
//
//     "Regular small-scale tiled/grid surface. Do NOT model every tile
//      individually. Represent as a material/surface parameter."  — brief §13
//
// So the output is `{ pattern, scaleX, scaleY, confidence }` and there is no
// per-tile geometry anywhere in this subsystem. A tiled facade at 1200 px is tens
// of thousands of tiles; representing them individually would be a hundred
// megabytes of IR describing something a procedural material renders in one line.
//
// ── METHOD ───────────────────────────────────────────────────────────────────
// High-pass residual (image minus a local mean) removes the facade's large-scale
// structure — openings, slab lines, shading gradients — and leaves the tiling. Its
// 1-D autocorrelations then show a peak at the tile pitch, or they do not, and "do
// not" is reported as `pattern: 'none'` rather than as a tiny scale.

import type { GrayImage } from '../../contracts/RasterImage.js';
import type { FacadeReconstructionOptions } from '../../contracts/Options.js';
import { blur } from '../preprocess/filters.js';
import { autocorrelation } from '../periodicity/comb.js';

export interface SurfaceMeasurement {
    readonly pattern: 'grid' | 'none';
    /** Tile pitch across, as a fraction of facade width. `null` when none found. */
    readonly scaleX: number | null;
    /** Tile pitch down, as a fraction of facade height. `null` when none found. */
    readonly scaleY: number | null;
    readonly confidence: number | null;
    readonly notes: readonly string[];
}

/** The strongest autocorrelation peak at a lag of at least `minLag`. */
function strongestPeak(ac: readonly number[], minLag: number): { lag: number; value: number } | null {
    let bestLag = -1;
    let bestValue = -Infinity;
    for (let lag = minLag; lag < ac.length - 1; lag++) {
        const v = ac[lag]!;
        if (v > ac[lag - 1]! && v >= ac[lag + 1]! && v > bestValue) {
            bestValue = v;
            bestLag = lag;
        }
    }
    return bestLag < 0 ? null : { lag: bestLag, value: bestValue };
}

/**
 * Measure a regular surface treatment on the rectified facade.
 *
 * ⛔ Reports `pattern: 'none'` rather than a weak grid when the peak is below
 * `surfaceMinPeak`. A tiling scale nobody can see is not a cheaper answer than
 * "no tiling"; it is a wrong one that a procedural material would then render.
 */
export function measureSurface(
    rectified: GrayImage,
    opts: FacadeReconstructionOptions,
): SurfaceMeasurement {
    const notes: string[] = [];
    const w = rectified.width;
    const h = rectified.height;
    if (w < 16 || h < 16) {
        return { pattern: 'none', scaleX: null, scaleY: null, confidence: null, notes: ['surface: image too small'] };
    }

    // High-pass: subtract a local mean whose radius is large enough to keep the
    // tiling and small enough to remove the facade's own structure.
    const lowPass = blur(rectified, Math.max(2, Math.round(Math.min(w, h) * 0.02)));
    const residualRows = new Array<number>(h).fill(0);
    const residualCols = new Array<number>(w).fill(0);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const r = Math.abs(rectified.data[i]! - lowPass.data[i]!);
            residualRows[y] = residualRows[y]! + r;
            residualCols[x] = residualCols[x]! + r;
        }
    }

    const minLag = 2;
    const acX = autocorrelation(residualCols);
    const acY = autocorrelation(residualRows);
    const px = strongestPeak(acX, minLag);
    const py = strongestPeak(acY, minLag);
    const strength = Math.max(px?.value ?? 0, py?.value ?? 0);

    if (px === null || py === null || strength < opts.surfaceMinPeak) {
        notes.push(
            `surface: none — strongest residual autocorrelation ${strength.toFixed(3)} < ${opts.surfaceMinPeak}`,
        );
        return { pattern: 'none', scaleX: null, scaleY: null, confidence: strength, notes };
    }
    notes.push(`surface: grid at pitch ${px.lag}x${py.lag} px, peak ${strength.toFixed(3)}`);
    return {
        pattern: 'grid',
        scaleX: px.lag / w,
        scaleY: py.lag / h,
        confidence: Math.max(0, Math.min(1, strength)),
        notes,
    };
}
