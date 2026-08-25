// C108 §3.6 / SPEC S11-S12 (brief §8, §9) — openings, and the continuous arch fit.
//
// ⛔ EVERY APERTURE IS AN `opening` (brief §8). No `window`, no `door`, no
// `arcade`, no `entrance`. Brief §8 is explicit — *"initially call all of them
// `opening` … Do not use semantic classification unless absolutely necessary"* —
// and C108 §1.3 keeps those words out of the IR entirely.
//
// ⛔ AND THERE IS NO ARCH CLASSIFIER (brief §9):
//
//     "Ground-floor openings appear strongly curved/arched. Do not create a special
//      'Mediterranean arcade' rule — fit their geometry."
//
// So `archness` is a CONTINUOUS measurement of the top boundary's rise, and `n` is
// a fitted superellipse exponent. There is no threshold at which an opening
// "becomes an arch"; a consumer wanting a boolean computes one downstream and owns
// it. That is the difference between a measurement and a label.

import type { GrayImage, Rect } from '../../contracts/RasterImage.js';
import type { FacadeReconstructionOptions } from '../../contracts/Options.js';

export interface Blob {
    readonly bbox: Rect;
    readonly area: number;
    /** area / bbox-area. 1 = a filled rectangle; low = clutter or a thin sliver. */
    readonly rectangularity: number;
    /** The top boundary y for each x across the bbox — the input to the arch fit. */
    readonly topProfile: readonly number[];
}

/**
 * Otsu's threshold on a region's histogram.
 *
 * Chosen over a fixed threshold for the same reason the edge thresholds are
 * percentile-derived: a facade in shade and a facade in sun have completely
 * different absolute levels and the same STRUCTURE, and the structure is what is
 * being measured.
 */
export function otsuThreshold(gray: GrayImage, rect: Rect): number {
    const hist = new Int32Array(256);
    let total = 0;
    for (let y = rect.y0; y < rect.y1; y++) {
        for (let x = rect.x0; x < rect.x1; x++) {
            const v = Math.max(0, Math.min(255, Math.round(gray.data[y * gray.width + x]!)));
            hist[v] = hist[v]! + 1;
            total++;
        }
    }
    if (total === 0) return 128;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i]!;
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let bestVar = -1;
    for (let t = 0; t < 256; t++) {
        wB += hist[t]!;
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t]!;
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > bestVar) {
            bestVar = between;
            best = t;
        }
    }
    return best;
}

/**
 * Connected components of "dark" pixels inside `rect`, 4-connected, iterative.
 *
 * Iterative rather than recursive on purpose: a facade-sized dark region is tens of
 * thousands of pixels and a recursive flood fill blows the stack on exactly the
 * input that matters most.
 *
 * `areaDenominator` is what `openingMinArea` / `openingMaxArea` are measured
 * against. It defaults to the search rect's own area, but the pipeline passes the
 * MEAN CELL AREA instead — because blobs are detected over the WHOLE rectified
 * facade in one pass, not per cell. Detecting per cell would clip the very thing
 * brief §10 asks to be preserved: a central element that spans several storeys is
 * ONE object, and a per-cell search can only ever see slices of it.
 */
export function findBlobs(
    gray: GrayImage,
    rect: Rect,
    threshold: number,
    opts: FacadeReconstructionOptions,
    areaDenominator?: number,
): Blob[] {
    const rw = rect.x1 - rect.x0;
    const rh = rect.y1 - rect.y0;
    if (rw <= 0 || rh <= 0) return [];
    const cellArea = areaDenominator !== undefined && areaDenominator > 0 ? areaDenominator : rw * rh;
    const labelled = new Uint8Array(rw * rh);
    const blobs: Blob[] = [];
    const stack: number[] = [];

    const isDark = (lx: number, ly: number): boolean =>
        gray.data[(rect.y0 + ly) * gray.width + (rect.x0 + lx)]! <= threshold;

    for (let sy = 0; sy < rh; sy++) {
        for (let sx = 0; sx < rw; sx++) {
            const si = sy * rw + sx;
            if (labelled[si] === 1 || !isDark(sx, sy)) continue;
            labelled[si] = 1;
            stack.length = 0;
            stack.push(si);
            let minX = sx;
            let maxX = sx;
            let minY = sy;
            let maxY = sy;
            let area = 0;
            const members: number[] = [];
            while (stack.length > 0) {
                const i = stack.pop() as number;
                const x = i % rw;
                const y = (i - x) / rw;
                area++;
                members.push(i);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                const neighbours = [
                    x > 0 ? i - 1 : -1,
                    x < rw - 1 ? i + 1 : -1,
                    y > 0 ? i - rw : -1,
                    y < rh - 1 ? i + rw : -1,
                ];
                for (const j of neighbours) {
                    if (j < 0 || labelled[j] === 1) continue;
                    const nx = j % rw;
                    const ny = (j - nx) / rw;
                    if (!isDark(nx, ny)) continue;
                    labelled[j] = 1;
                    stack.push(j);
                }
            }
            const bw = maxX - minX + 1;
            const bh = maxY - minY + 1;
            // ⛔ The FLOOR is relative to a cell (reject speckle); the CEILING is
            // relative to the whole facade, and those are deliberately different
            // denominators.
            //
            // An earlier revision applied `openingMaxArea` — a per-CELL ceiling — at
            // detection time. Corpus case F's central element spans every storey, so
            // it measured 1.4 cells and was DISCARDED before the classifier ever saw
            // it: brief §15's "do not force these into the dominant pattern" became
            // "delete these", which is strictly worse than forcing. What does not fit
            // a cell must still reach `features[]` or `outliers[]`.
            const areaFraction = area / cellArea;
            if (areaFraction < opts.openingMinArea) continue;
            if (area > rw * rh * opts.blobMaxAreaFraction) continue;
            const rectangularity = area / (bw * bh);
            if (rectangularity < opts.openingMinRectangularity) continue;

            // The top boundary: for each column of the bbox, the smallest member y.
            const topProfile = new Array<number>(bw).fill(Number.POSITIVE_INFINITY);
            for (const i of members) {
                const x = i % rw;
                const y = (i - x) / rw;
                const c = x - minX;
                if (y < topProfile[c]!) topProfile[c] = y;
            }
            for (let c = 0; c < bw; c++) {
                if (!Number.isFinite(topProfile[c]!)) topProfile[c] = minY;
            }

            blobs.push({
                bbox: {
                    x0: rect.x0 + minX,
                    y0: rect.y0 + minY,
                    x1: rect.x0 + maxX + 1,
                    y1: rect.y0 + maxY + 1,
                },
                area,
                rectangularity,
                topProfile: topProfile.map((v) => v - minY),
            });
        }
    }
    // Deterministic order: largest first, then by position — never scan order.
    blobs.sort(
        (a, b) => b.area - a.area || a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
    );
    return blobs;
}

export interface ArchFit {
    /** Superellipse exponent. ~2 is an ellipse/arch; large approaches a rectangle. */
    readonly n: number;
    /** 0 = flat top, 1 = fully semicircular. CONTINUOUS — never bucketed. */
    readonly archness: number;
    /** Normalised residual of the best fit, in [0,1]. Lower is better. */
    readonly residual: number;
}

/**
 * Fit `|x/a|^n + |y/b|^n = 1` to an opening's top boundary (brief §9).
 *
 * The search over `n` is a fixed log-spaced grid with parabolic refinement —
 * deterministic, and cheap enough that no optimiser is needed. `archness` is
 * measured directly from the boundary's RISE rather than derived from `n`, so the
 * two are independent evidence: a noisy mask can produce a plausible `n` and a rise
 * that contradicts it, and keeping them separate makes that visible.
 */
export function fitArch(topProfile: readonly number[], opts: FacadeReconstructionOptions): ArchFit {
    if (topProfile.length < 8) return { n: opts.superellipseNMax, archness: 0, residual: 1 };
    return fitArchImpl(topProfile, opts);
}

function fitArchImpl(topProfile: readonly number[], opts: FacadeReconstructionOptions): ArchFit {

    // ── THE TWO BUGS THE CORPUS FOUND HERE, AND WHY THE FIT IS SHAPED THIS WAY ──
    //
    // (1) ONE ANTI-ALIASED COLUMN SET THE WHOLE MEASUREMENT. An earlier revision took
    //     `rise = max(top) - min(top)` over the raw profile. Measured on case A, whose
    //     openings are PERFECT RECTANGLES, the profile read `16,0,0,…,0` — flat except
    //     the FIRST column, where only the lower part of the boundary pixel crossed the
    //     threshold. Rectangular windows came back at `archness` 0.23, 0.52 and 0.94:
    //     the arch measurement was reporting the RESAMPLER, not the building.
    //
    // (2) A ROBUST SPREAD UNDER-READS A REAL ARCH. Replacing min/max with a trimmed
    //     percentile fixed (1) and introduced its own error: a semicircular head only
    //     reaches its full rise AT its springing points, so any percentile of the
    //     profile reads ~50% of the true rise, and a true semicircle scored 0.48 where
    //     it should score 1.0.
    //
    // Fitting the AMPLITUDE as a parameter answers both. The trim removes the boundary
    // artefact; the model then extrapolates the springing from the whole curve rather
    // than reading it off the two most damaged samples. For each candidate exponent
    // the amplitude is an exact linear least-squares solve, so the search stays a
    // deterministic 1-D grid (C108 §5.2).
    const margin = Math.max(2, Math.round(topProfile.length * 0.05));
    const core = topProfile.slice(margin, topProfile.length - margin);
    if (core.length < 4) return { n: opts.superellipseNMax, archness: 0, residual: 1 };

    // Depth below the apex, per column. 0 at the apex, `rise` at the springing.
    let apex = Infinity;
    for (const v of core) if (v < apex) apex = v;
    const depth = core.map((v) => v - apex);

    // `u` spans the FULL opening, not just the retained core, so the fitted amplitude
    // is the rise at the real springing points rather than at the trim.
    const halfWidth = topProfile.length / 2;
    const us = core.map((_, i) => {
        const column = i + margin;
        return Math.max(-1, Math.min(1, (column - (topProfile.length - 1) / 2) / halfWidth));
    });

    /**
     * For one exponent: the least-squares amplitude and the residual it leaves.
     * The model is `depth(u) = R * (1 - (1 - |u|^n)^(1/n))`, which is 0 at the apex
     * and `R` at the springing — the superellipse's upper quadrant.
     */
    const fitAt = (n: number): { amplitude: number; residual: number } => {
        let num = 0;
        let den = 0;
        const shape: number[] = [];
        for (const u of us) {
            const inner = 1 - Math.pow(Math.abs(u), n);
            const v = inner <= 0 ? 0 : Math.pow(inner, 1 / n);
            shape.push(1 - v);
        }
        for (let i = 0; i < shape.length; i++) {
            num += depth[i]! * shape[i]!;
            den += shape[i]! * shape[i]!;
        }
        const amplitude = den > 1e-9 ? num / den : 0;
        let sq = 0;
        for (let i = 0; i < shape.length; i++) {
            const d = amplitude * shape[i]! - depth[i]!;
            sq += d * d;
        }
        return { amplitude, residual: Math.sqrt(sq / shape.length) };
    };

    let bestN = opts.superellipseNMax;
    let bestAmplitude = 0;
    let bestResidual = Infinity;
    const logMin = Math.log(opts.superellipseNMin);
    const logMax = Math.log(opts.superellipseNMax);
    for (let i = 0; i < opts.superellipseNSteps; i++) {
        const n = Math.exp(logMin + ((logMax - logMin) * i) / (opts.superellipseNSteps - 1));
        const { amplitude, residual } = fitAt(n);
        // Deterministic tie-break: prefer the SMALLER exponent, so an ambiguous fit
        // reads as "more curved" rather than silently rectangular.
        if (residual < bestResidual || (residual === bestResidual && n < bestN)) {
            bestResidual = residual;
            bestN = n;
            bestAmplitude = amplitude;
        }
    }

    // ── §L-11123 — THE HEAD REGION, NOT THE WHOLE OUTLINE (corpus case M) ─────
    // ⭐ THE DEFECT THE FOUNDER'S SECOND PHOTOGRAPH FOUND. A balcony railing is WIDER
    // than the window above it and dark enough to merge with it, so the blob's top
    // boundary is FLAT over the window and DEEP at the railing's wings on either
    // side — a profile the superellipse fits with a large amplitude. Thirty
    // rectangular windows read archness 1.00; the 5% trim never reaches 12 px wings.
    //
    // The distinction is not a threshold, it is MODEL SELECTION. A wing is a STEP:
    // flat, then a discontinuous drop, then flat again. An arch is SMOOTH. So a
    // second model — plateau at the apex over [L,R], a constant depth on each side
    // — is fitted by exhaustive search over (L,R) with prefix sums (O(n²), n is a
    // window width in samples), and the two residuals are compared in the same
    // units. If the step fits strictly better, the wings are real, the head is the
    // plateau, and the superellipse is re-fitted on the plateau ALONE. A true arch
    // is a ramp the step model cannot follow, so the superellipse keeps winning
    // there — the non-vacuity twin in case M's probe holds the arcade at ~1.0.
    // No new constant is introduced: the only sizes are the existing trim and the
    // existing four-sample minimum.
    //
    // ⛔ §CONF72 (L-11220) — FLATNESS IS TESTED BEFORE THE STEP MODEL. Corpus cases
    // E / I / J (8, 13 and 5 of 20 openings) found the order wrong: a FLAT window
    // head with ONE pixel of boundary raggedness (`1,1,1,0,1,1,…`) let the step
    // model win with a plateau = the short run of min-valued columns, the recursion
    // below re-trimmed a <8-sample head and the `:211` sentinel returned
    // `residual 1` — confidence ZERO for a perfectly rectangular window, and the
    // mapper's MIN over cells turned that one cell into "0.00" for the whole
    // reading. A profile whose fitted rise is below the resampler's own noise has
    // no wings to find; it is the rectangle limit and is reported as such here.
    const flatEpsilon = Math.max(1, halfWidth * 0.03);
    if (bestAmplitude < flatEpsilon) {
        return { n: opts.superellipseNMax, archness: 0, residual: 0 };
    }
    if (core.length >= 8) {
        const n = core.length;
        const ps = new Array<number>(n + 1).fill(0);
        const ps2 = new Array<number>(n + 1).fill(0);
        for (let i = 0; i < n; i++) {
            ps[i + 1] = ps[i]! + depth[i]!;
            ps2[i + 1] = ps2[i]! + depth[i]! * depth[i]!;
        }
        const sseOutside = (a: number, b: number): number => {
            // Sum of squared error of depth[a..b) around its own mean (0 if empty).
            const cnt = b - a;
            if (cnt <= 0) return 0;
            const sum = ps[b]! - ps[a]!;
            const sq = ps2[b]! - ps2[a]!;
            return sq - (sum * sum) / cnt;
        };
        let bestStep = Infinity;
        let bestL = 0;
        let bestR = n - 1;
        for (let L = 0; L < n; L++) {
            for (let R = L + 3; R < n; R++) {
                // Plateau predicts depth 0 (the apex) on [L,R]; sides take their means.
                const inside = ps2[R + 1]! - ps2[L]!;
                const sse = inside + sseOutside(0, L) + sseOutside(R + 1, n);
                if (sse < bestStep) {
                    bestStep = sse;
                    bestL = L;
                    bestR = R;
                }
            }
        }
        const stepResidual = Math.sqrt(bestStep / n);
        const plateauIsWhole = bestL === 0 && bestR === n - 1;
        if (!plateauIsWhole && stepResidual < bestResidual) {
            // Wings detected: measure the head on the plateau only. The sub-profile
            // is re-trimmed by the same rule, so the recursion is bounded by length.
            const head = topProfile.slice(bestL + margin, bestR + margin + 1);
            if (head.length >= 8) return fitArch(head, opts);
            // §CONF72 — A SHORT PLATEAU IS A MEASURED FLAT HEAD, NOT A SENTINEL. The
            // step model has just found that the plateau [L,R] is best described as
            // depth 0; a head too short to fit a superellipse on is therefore a flat
            // head whose evidence is the plateau's own residual about zero — a
            // measurement of THIS opening, in the same units as the arch fit, never
            // "residual 1" (C108 §2.3: a value the stage could not measure must not
            // be reported as certainly wrong).
            const plateauLen = bestR - bestL + 1;
            const plateauResidual = Math.sqrt((ps2[bestR + 1]! - ps2[bestL]!) / plateauLen);
            return {
                n: opts.superellipseNMax,
                archness: 0,
                residual: Math.max(0, Math.min(1, plateauResidual / Math.max(1, flatEpsilon))),
            };
        }
    }

    // archness: the fitted rise over the half-width. A semicircular head has
    // rise == halfWidth (archness 1); a flat head has rise 0. CONTINUOUS throughout —
    // there is no threshold at which an opening "becomes an arch" (brief §9).
    const archness = Math.max(0, Math.min(1, bestAmplitude / halfWidth));
    const normalisedResidual = Math.max(0, Math.min(1, bestResidual / Math.max(1, bestAmplitude)));
    return { n: bestN, archness, residual: normalisedResidual };
}

