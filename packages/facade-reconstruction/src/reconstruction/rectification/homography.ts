// C108 §3.3 / SPEC S6 (brief §6) — rectify the facade plane.
//
// ── WHY THERE IS NO SVD HERE ─────────────────────────────────────────────────
// The general DLT needs an SVD because it is over-determined. The FOUR-POINT case
// is not: four correspondences give exactly eight equations in eight unknowns
// (h33 fixed to 1), which Gaussian elimination with partial pivoting solves
// exactly. That keeps the file dependency-free AND deterministic — an iterative
// eigen-solver's last digits are not portable, and C108 §5.2 asks for bit-identical
// output across platforms.
//
// ⚠ THE ASPECT RATIO CARRIES ITS OWN CONFIDENCE, SEPARATE FROM THE QUAD'S.
// A CORRECT quad with a WRONG aspect produces a rectified image that looks right
// and measures wrong — every period, every cell width and every archness is then
// scaled by a factor nobody sees. Merging the two confidences hides exactly that
// case, so they are kept apart (C108 §3.3).

import type { Point2, Quad, RasterImage } from '../../contracts/RasterImage.js';
import type { VanishingPoint } from '../../contracts/Diagnostics.js';

/** A row-major 3x3 matrix. */
export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

/**
 * Solve `A x = b` by Gaussian elimination with partial pivoting.
 * Returns `null` for a singular system rather than producing NaNs downstream.
 */
function solveLinear(A: number[][], b: number[]): number[] | null {
    const n = b.length;
    const m = A.map((row, i) => [...row, b[i]!]);
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
        }
        if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
        if (pivot !== col) {
            const t = m[pivot]!;
            m[pivot] = m[col]!;
            m[col] = t;
        }
        const p = m[col]![col]!;
        for (let c = col; c <= n; c++) m[col]![c] = m[col]![c]! / p;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = m[r]![col]!;
            if (f === 0) continue;
            for (let c = col; c <= n; c++) m[r]![c] = m[r]![c]! - f * m[col]![c]!;
        }
    }
    return m.map((row) => row[n]!);
}

/**
 * The homography mapping `src[i] -> dst[i]` for four correspondences.
 * `null` when the four points are degenerate (three collinear, or coincident).
 */
export function homographyFrom4(src: Quad, dst: Quad): Matrix3 | null {
    const A: number[][] = [];
    const b: number[] = [];
    for (let i = 0; i < 4; i++) {
        const { x, y } = src[i]!;
        const { x: u, y: v } = dst[i]!;
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
        b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
        b.push(v);
    }
    const h = solveLinear(A, b);
    if (h === null) return null;
    return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

/** Apply a homography to a point. `null` when the point maps to infinity. */
export function applyHomography(H: Matrix3, p: Point2): Point2 | null {
    const w = H[6] * p.x + H[7] * p.y + H[8];
    if (Math.abs(w) < 1e-12) return null;
    return {
        x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
        y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
    };
}

/** Invert a 3x3. `null` when singular. */
export function invert3(H: Matrix3): Matrix3 | null {
    const [a, b, c, d, e, f, g, h, i] = H;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) return null;
    const inv = 1 / det;
    return [
        (e * i - f * h) * inv,
        (c * h - b * i) * inv,
        (b * f - c * e) * inv,
        (f * g - d * i) * inv,
        (a * i - c * g) * inv,
        (c * d - a * f) * inv,
        (d * h - e * g) * inv,
        (b * g - a * h) * inv,
        (a * e - b * d) * inv,
    ];
}

export interface AspectEstimate {
    readonly aspect: number;
    /** [0,1]. LOW when the vanishing points were degenerate — see the header. */
    readonly confidence: number;
    readonly method: 'vanishing-points' | 'edge-length-ratio';
}

/**
 * Estimate the rectified facade's width/height ratio.
 *
 * PRIMARY — the standard rectangle-from-two-vanishing-points construction: with
 * both vanishing points finite, the focal length and the plane's true aspect fall
 * out of the orthogonality of the two directions.
 *
 * FALLBACK — the source quad's mean edge-length ratio. This is what a head-on
 * photograph deserves: if the facade lines really are parallel in the image, there
 * is no perspective information to exploit and the quad's own proportions ARE the
 * best estimate. ⚠ It is reported at a LOWER confidence, and the `method` field
 * says which one ran, so a consumer is never left guessing.
 */
export function estimateAspect(
    quad: Quad,
    vpH: VanishingPoint | null,
    vpV: VanishingPoint | null,
): AspectEstimate {
    const edge = (a: Point2, b: Point2): number => Math.hypot(b.x - a.x, b.y - a.y);
    const top = edge(quad[0], quad[1]);
    const bottom = edge(quad[3], quad[2]);
    const left = edge(quad[0], quad[3]);
    const right = edge(quad[1], quad[2]);
    const meanW = (top + bottom) / 2;
    const meanH = (left + right) / 2;
    const fallback: AspectEstimate = {
        aspect: meanH > 1e-6 ? meanW / meanH : 1,
        confidence: 0.35,
        method: 'edge-length-ratio',
    };

    if (vpH === null || vpV === null || vpH.atInfinity || vpV.atInfinity) return fallback;

    const u = { x: vpH.x / vpH.w, y: vpH.y / vpH.w };
    const v = { x: vpV.x / vpV.w, y: vpV.y / vpV.w };
    // Principal point assumed at the quad centroid — the standard assumption, and
    // the one whose failure this estimate's confidence is meant to absorb.
    const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
    const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
    const ux = u.x - cx;
    const uy = u.y - cy;
    const vx = v.x - cx;
    const vy = v.y - cy;
    const f2 = -(ux * vx + uy * vy);
    if (!(f2 > 0)) return fallback; // no real focal length — the VPs are inconsistent
    const f = Math.sqrt(f2);
    const lenU = Math.hypot(ux, uy, f);
    const lenV = Math.hypot(vx, vy, f);
    if (!(lenU > 0) || !(lenV > 0)) return fallback;
    const ratio = (meanW / Math.max(1e-6, meanH)) * (lenV / lenU);
    if (!Number.isFinite(ratio) || ratio <= 0) return fallback;
    // Support-weighted: two weakly-supported vanishing points do not earn a high
    // confidence just because the arithmetic completed.
    const confidence = Math.max(0.35, Math.min(0.95, (vpH.support + vpV.support) / 2 + 0.35));
    return { aspect: ratio, confidence, method: 'vanishing-points' };
}

/**
 * Inverse-map the source quad onto an axis-aligned `outW x outH` raster, sampling
 * bilinearly.
 *
 * ⭐ INVERSE mapping, not forward: iterating over DESTINATION pixels and pulling
 * from the source is what guarantees every output pixel is written exactly once.
 * A forward map leaves holes wherever the transform expands, and those holes then
 * read as edges to the very next stage.
 */
export function warpQuadToRect(
    image: RasterImage,
    quad: Quad,
    outW: number,
    outH: number,
): { image: RasterImage; H: Matrix3; Hinv: Matrix3 } | null {
    const dst: Quad = [
        { x: 0, y: 0 },
        { x: outW - 1, y: 0 },
        { x: outW - 1, y: outH - 1 },
        { x: 0, y: outH - 1 },
    ];
    const H = homographyFrom4(quad, dst);
    if (H === null) return null;
    const Hinv = invert3(H);
    if (Hinv === null) return null;

    const out = new Uint8ClampedArray(outW * outH * 4);
    const { width: sw, height: sh, data } = image;
    for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
            const p = applyHomography(Hinv, { x, y });
            const di = (y * outW + x) * 4;
            if (p === null || p.x < 0 || p.y < 0 || p.x > sw - 1 || p.y > sh - 1) {
                out[di + 3] = 255; // outside the source: opaque black, never garbage
                continue;
            }
            const x0 = Math.floor(p.x);
            const y0 = Math.floor(p.y);
            const x1 = Math.min(sw - 1, x0 + 1);
            const y1 = Math.min(sh - 1, y0 + 1);
            const fx = p.x - x0;
            const fy = p.y - y0;
            for (let c = 0; c < 4; c++) {
                const v00 = data[(y0 * sw + x0) * 4 + c]!;
                const v10 = data[(y0 * sw + x1) * 4 + c]!;
                const v01 = data[(y1 * sw + x0) * 4 + c]!;
                const v11 = data[(y1 * sw + x1) * 4 + c]!;
                out[di + c] =
                    v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
            }
            out[di + 3] = 255;
        }
    }
    return { image: { width: outW, height: outH, data: out }, H, Hinv };
}
