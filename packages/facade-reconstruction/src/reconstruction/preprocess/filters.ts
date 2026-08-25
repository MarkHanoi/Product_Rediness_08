// C108 §3.2 / SPEC S2 — grayscale gradients, deterministic and dependency-free.
//
// Separable Gaussian, Sobel, non-maximum suppression, hysteresis. Nothing exotic;
// the value is in two decisions:
//
//  1. ⭐ THRESHOLDS COME FROM PERCENTILES OF THE MAGNITUDE HISTOGRAM, never from
//     absolute levels. That is what makes corpus case J (noisy / low-contrast)
//     produce the SAME structural answer as case A at a LOWER reported confidence,
//     rather than producing nothing. An absolute threshold turns contrast into a
//     cliff, and a facade photographed into the sun falls off it.
//
//  2. Everything is a pure function of its input array. No shared scratch buffers,
//     no module state — so a stage can be tested in isolation and two calls with
//     the same input are bit-identical (C108 §5.2).

import type { GrayImage } from '../../contracts/RasterImage.js';

/** A 1-D Gaussian kernel, normalised, radius = ceil(3*sigma). */
export function gaussianKernel(sigma: number): Float32Array {
    if (!(sigma > 0)) return Float32Array.from([1]);
    const radius = Math.max(1, Math.ceil(3 * sigma));
    const size = radius * 2 + 1;
    const k = new Float32Array(size);
    let sum = 0;
    for (let i = 0; i < size; i++) {
        const d = i - radius;
        const v = Math.exp(-(d * d) / (2 * sigma * sigma));
        k[i] = v;
        sum += v;
    }
    for (let i = 0; i < size; i++) k[i] = k[i]! / sum;
    return k;
}

/** Separable Gaussian blur with clamped edges. */
export function blur(image: GrayImage, sigma: number): GrayImage {
    if (!(sigma > 0)) return image;
    const k = gaussianKernel(sigma);
    const r = (k.length - 1) / 2;
    const { width: w, height: h, data } = image;
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let acc = 0;
            for (let i = 0; i < k.length; i++) {
                const sx = Math.min(w - 1, Math.max(0, x + i - r));
                acc += data[y * w + sx]! * k[i]!;
            }
            tmp[y * w + x] = acc;
        }
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let acc = 0;
            for (let i = 0; i < k.length; i++) {
                const sy = Math.min(h - 1, Math.max(0, y + i - r));
                acc += tmp[sy * w + x]! * k[i]!;
            }
            out[y * w + x] = acc;
        }
    }
    return { width: w, height: h, data: out };
}

export interface Gradients {
    readonly width: number;
    readonly height: number;
    /** d/dx, positive to the right. */
    readonly gx: Float32Array;
    /** d/dy, positive DOWNWARD (image convention). */
    readonly gy: Float32Array;
    readonly magnitude: Float32Array;
}

/** Sobel 3x3 with clamped edges. */
export function sobel(image: GrayImage): Gradients {
    const { width: w, height: h, data } = image;
    const gx = new Float32Array(w * h);
    const gy = new Float32Array(w * h);
    const mag = new Float32Array(w * h);
    const at = (x: number, y: number): number =>
        data[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const tl = at(x - 1, y - 1);
            const tc = at(x, y - 1);
            const tr = at(x + 1, y - 1);
            const ml = at(x - 1, y);
            const mr = at(x + 1, y);
            const bl = at(x - 1, y + 1);
            const bc = at(x, y + 1);
            const br = at(x + 1, y + 1);
            const dx = tr + 2 * mr + br - (tl + 2 * ml + bl);
            const dy = bl + 2 * bc + br - (tl + 2 * tc + tr);
            const i = y * w + x;
            gx[i] = dx;
            gy[i] = dy;
            mag[i] = Math.hypot(dx, dy);
        }
    }
    return { width: w, height: h, gx, gy, magnitude: mag };
}

/**
 * The value at `p` (0..1) of the sorted distribution of `values`.
 *
 * Sorting a copy rather than using a histogram keeps this exact — a histogram
 * would make the threshold depend on bin width, which is a hidden tunable nobody
 * would think to name in Options.ts.
 */
export function percentile(values: ArrayLike<number>, p: number): number {
    const n = values.length;
    if (n === 0) return 0;
    const sorted = Float64Array.from(values as ArrayLike<number>);
    sorted.sort();
    const idx = Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))));
    return sorted[idx]!;
}

/**
 * Canny-style edge map: non-maximum suppression along the gradient direction,
 * then hysteresis between `high` and `high * lowRatio`.
 *
 * Returns 0/255 in a `GrayImage`. Thresholds are derived from `highPercentile`
 * of the magnitude distribution — see the header.
 */
export function cannyEdges(
    grads: Gradients,
    highPercentile: number,
    lowRatio: number,
): { edges: GrayImage; highThreshold: number } {
    const { width: w, height: h, gx, gy, magnitude } = grads;
    const high = percentile(magnitude, highPercentile);
    const low = high * lowRatio;

    // ── non-maximum suppression ──────────────────────────────────────────────
    const thin = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            const m = magnitude[i]!;
            if (m === 0) continue;
            // Quantise the gradient direction to one of four neighbour pairs.
            const angle = Math.atan2(gy[i]!, gx[i]!);
            const a = ((angle * 180) / Math.PI + 180) % 180;
            let n1: number;
            let n2: number;
            if (a < 22.5 || a >= 157.5) {
                n1 = magnitude[i - 1]!;
                n2 = magnitude[i + 1]!;
            } else if (a < 67.5) {
                n1 = magnitude[i - w + 1]!;
                n2 = magnitude[i + w - 1]!;
            } else if (a < 112.5) {
                n1 = magnitude[i - w]!;
                n2 = magnitude[i + w]!;
            } else {
                n1 = magnitude[i - w - 1]!;
                n2 = magnitude[i + w + 1]!;
            }
            if (m >= n1 && m >= n2) thin[i] = m;
        }
    }

    // ── hysteresis: seed on `high`, grow through `low`, iteratively ──────────
    const out = new Float32Array(w * h);
    const stack: number[] = [];
    for (let i = 0; i < thin.length; i++) {
        if (thin[i]! >= high) {
            out[i] = 255;
            stack.push(i);
        }
    }
    while (stack.length > 0) {
        const i = stack.pop() as number;
        const x = i % w;
        const y = (i - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const j = ny * w + nx;
                if (out[j] === 255) continue;
                if (thin[j]! >= low) {
                    out[j] = 255;
                    stack.push(j);
                }
            }
        }
    }
    return { edges: { width: w, height: h, data: out }, highThreshold: high };
}

/** Mean of a slice, or 0 for an empty one. */
export function mean(values: ArrayLike<number>, from = 0, to = values.length): number {
    if (to <= from) return 0;
    let s = 0;
    for (let i = from; i < to; i++) s += values[i] as number;
    return s / (to - from);
}

/** Population variance of a slice. */
export function variance(values: ArrayLike<number>, from = 0, to = values.length): number {
    if (to <= from) return 0;
    const m = mean(values, from, to);
    let s = 0;
    for (let i = from; i < to; i++) {
        const d = (values[i] as number) - m;
        s += d * d;
    }
    return s / (to - from);
}
