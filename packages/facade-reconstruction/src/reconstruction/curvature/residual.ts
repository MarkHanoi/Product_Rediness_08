// C108 §3.9 / SPEC S14 (brief §12) — curved facade corners, measured as a RESIDUAL.
//
// ── WHAT THIS STAGE REFUSES TO CLAIM ─────────────────────────────────────────
// Brief §12 is emphatic that a curved facade must not be flattened into a
// rectangle, and it also anticipates the limit:
//
//     "If a single image cannot reliably recover the curvature radius, estimate a
//      normalized curvature and mark confidence appropriately."
//
// It cannot. One uncalibrated photograph determines THAT the edges bend and ROUGHLY
// BY HOW MUCH; it does not determine a radius. So `normalizedRadius` is `null`
// (L-11004) and `normalizedDeviation` carries the measurement.
//
// ⚠ Reporting a radius here would be the [[envelope-solid-overstates-partial-data]]
// defect transplanted onto a facade: an UNKNOWN constraint drawn as a number, which
// downstream reads as a measurement because it has the shape of one.
//
// ── THE MEASUREMENT ──────────────────────────────────────────────────────────
// After rectification a genuinely flat facade's floor lines are straight ACROSS THE
// WHOLE WIDTH. A facade that wraps around a corner does not flatten: its outer
// bands deviate from the central fit SYSTEMATICALLY and IN THE SAME DIRECTION at
// every storey. So the discriminator is not "is there deviation" — noise always
// deviates — but "is the deviation CONSISTENT in sign across storeys".

import type { GrayImage } from '../../contracts/RasterImage.js';
import type { FacadeReconstructionOptions } from '../../contracts/Options.js';
import { sobel } from '../preprocess/filters.js';

export interface EdgeCurvature {
    /** Systematic outer-band deviation from straight, as a fraction of height. */
    readonly normalizedDeviation: number | null;
    /** ⛔ Always `null` in Milestone 1 — see the header (C108 §3.9, L-11004). */
    readonly normalizedRadius: null;
    /** Agreement across storeys, in [0,1] — the confidence this stage reports. */
    readonly consistency: number | null;
}

export interface CurvatureMeasurement {
    readonly left: EdgeCurvature;
    readonly right: EdgeCurvature;
    readonly notes: readonly string[];
}

/**
 * For one storey row band, the y of the strongest horizontal gradient in a column
 * slice — i.e. where the floor line actually sits at that x.
 */
function traceLine(g: ReturnType<typeof sobel>, x0: number, x1: number, yCentre: number, halfBand: number): (number | null)[] {
    const out: (number | null)[] = [];
    for (let x = x0; x < x1; x++) {
        let bestY: number | null = null;
        let bestV = 0;
        for (let y = Math.max(0, yCentre - halfBand); y < Math.min(g.height, yCentre + halfBand); y++) {
            const v = Math.abs(g.gy[y * g.width + x]!);
            if (v > bestV) {
                bestV = v;
                bestY = y;
            }
        }
        out.push(bestV > 0 ? bestY : null);
    }
    return out;
}

/** Least-squares line through `(index, value)` pairs, ignoring nulls. */
function fitLine(values: readonly (number | null)[], offset: number): { m: number; c: number } | null {
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === null || v === undefined) continue;
        const x = i + offset;
        n++;
        sx += x;
        sy += v;
        sxx += x * x;
        sxy += x * v;
    }
    if (n < 2) return null;
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-9) return null;
    const m = (n * sxy - sx * sy) / denom;
    return { m, c: (sy - m * sx) / n };
}

/**
 * Measure curved left/right regions on the RECTIFIED facade (brief §12).
 *
 * `slabRows` are the storey line y-positions found by the structure stage. Fewer
 * than two and the measurement is refused: one line cannot show consistency, and
 * consistency is the whole discriminator.
 */
export function measureCurvature(
    rectified: GrayImage,
    slabRows: readonly number[],
    opts: FacadeReconstructionOptions,
): CurvatureMeasurement {
    const notes: string[] = [];
    const unknownEdge: EdgeCurvature = {
        normalizedDeviation: null,
        normalizedRadius: null,
        consistency: null,
    };
    if (slabRows.length < 2) {
        notes.push(
            `curvature: UNKNOWN — ${slabRows.length} storey line(s), need >= 2 to judge CONSISTENCY of deviation (C108 §3.9)`,
        );
        return { left: unknownEdge, right: unknownEdge, notes };
    }

    const g = sobel(rectified);
    const w = rectified.width;
    const h = rectified.height;
    const centralHalf = (w * opts.curvatureCentralFraction) / 2;
    const cx0 = Math.round(w / 2 - centralHalf);
    const cx1 = Math.round(w / 2 + centralHalf);
    const edgeW = Math.max(2, Math.round(w * opts.curvatureEdgeFraction));
    const halfBand = Math.max(2, Math.round(h * 0.02));

    const leftDeviations: number[] = [];
    const rightDeviations: number[] = [];

    for (const yc of slabRows) {
        const central = traceLine(g, cx0, cx1, yc, halfBand);
        const fit = fitLine(central, cx0);
        if (fit === null) continue;

        const leftTrace = traceLine(g, 0, edgeW, yc, halfBand * 3);
        const rightTrace = traceLine(g, w - edgeW, w, yc, halfBand * 3);

        const meanDeviation = (trace: readonly (number | null)[], offset: number): number | null => {
            let s = 0;
            let n = 0;
            for (let i = 0; i < trace.length; i++) {
                const v = trace[i];
                if (v === null || v === undefined) continue;
                const x = i + offset;
                s += v - (fit.m * x + fit.c);
                n++;
            }
            return n > 0 ? s / n : null;
        };
        const dl = meanDeviation(leftTrace, 0);
        const dr = meanDeviation(rightTrace, w - edgeW);
        if (dl !== null) leftDeviations.push(dl / h);
        if (dr !== null) rightDeviations.push(dr / h);
    }

    /**
     * Consistency is the fraction of storeys whose deviation shares the MAJORITY
     * SIGN. Noise gives ~0.5 (random signs); a real wrap gives ~1.0. Reporting the
     * magnitude without this would call every noisy facade curved.
     */
    const summarise = (deviations: readonly number[], side: string): EdgeCurvature => {
        if (deviations.length < 2) {
            notes.push(`curvature ${side}: UNKNOWN — fewer than 2 usable storey traces`);
            return unknownEdge;
        }
        const positives = deviations.filter((d) => d > 0).length;
        const majority = Math.max(positives, deviations.length - positives);
        const consistency = majority / deviations.length;
        const magnitude =
            deviations.reduce((a, b) => a + Math.abs(b), 0) / deviations.length;
        if (magnitude < opts.curvatureMinDeviation) {
            notes.push(
                `curvature ${side}: FLAT — mean |deviation| ${magnitude.toFixed(4)} < ${opts.curvatureMinDeviation}`,
            );
            return { normalizedDeviation: 0, normalizedRadius: null, consistency };
        }
        notes.push(
            `curvature ${side}: deviation ${magnitude.toFixed(4)}, sign-consistency ${consistency.toFixed(2)} — RADIUS NOT RECOVERABLE from one image (L-11004)`,
        );
        return { normalizedDeviation: magnitude, normalizedRadius: null, consistency };
    };

    return {
        left: summarise(leftDeviations, 'left'),
        right: summarise(rightDeviations, 'right'),
        notes,
    };
}
