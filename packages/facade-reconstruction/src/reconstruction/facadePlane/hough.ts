// C108 §3.2 / SPEC S3-S5 (brief §6) — lines, vanishing points, facade quadrilateral.
//
// ⛔ DETERMINISM (C108 §5.2). Where the literature reaches for RANSAC — vanishing
// points, in particular — this file uses an EXHAUSTIVE BOUNDED ACCUMULATOR instead.
// At these image sizes (a few dozen lines per family after peak extraction) the
// pairwise intersection is affordable, and it is bit-identical across runs and
// platforms, which RANSAC is not. Ties break on ascending index, never on whichever
// candidate a hash table happened to yield first.
//
// ⭐ THE PARALLEL CASE IS AN ANSWER, NOT A FAILURE. Intersections are computed in
// HOMOGENEOUS coordinates, so two parallel lines meet at `w ~ 0` — a point at
// infinity. That is the correct description of an undistorted, head-on facade, and
// a Cartesian formulation would have had to special-case it (or divide by zero).

import type { GrayImage, Point2, Quad } from '../../contracts/RasterImage.js';
import type { DetectedLine, VanishingPoint } from '../../contracts/Diagnostics.js';
import type { FacadeReconstructionOptions } from '../../contracts/Options.js';

const DEG = Math.PI / 180;
/** Below this |w|, a homogeneous point is treated as being at infinity. */
const W_EPSILON = 1e-9;

/**
 * Hough transform over an edge map.
 *
 * `theta` spans [0, pi); `rho` spans [-diag, +diag] at 1 px resolution. Peaks are
 * extracted with a small non-maximum-suppression window so one physical edge does
 * not contribute a dozen near-identical lines to the vanishing-point accumulator.
 */
export function houghLines(
    edges: GrayImage,
    opts: FacadeReconstructionOptions,
): readonly DetectedLine[] {
    const { width: w, height: h, data } = edges;
    const thetaStep = opts.houghThetaStepDeg * DEG;
    const nTheta = Math.max(1, Math.round(Math.PI / thetaStep));
    const diag = Math.ceil(Math.hypot(w, h));
    const nRho = diag * 2 + 1;
    const acc = new Int32Array(nTheta * nRho);

    const cos = new Float64Array(nTheta);
    const sin = new Float64Array(nTheta);
    for (let t = 0; t < nTheta; t++) {
        cos[t] = Math.cos(t * thetaStep);
        sin[t] = Math.sin(t * thetaStep);
    }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[y * w + x]! < 128) continue;
            for (let t = 0; t < nTheta; t++) {
                const rho = Math.round(x * cos[t]! + y * sin[t]!) + diag;
                acc[t * nRho + rho] = acc[t * nRho + rho]! + 1;
            }
        }
    }

    let maxVotes = 0;
    for (let i = 0; i < acc.length; i++) if (acc[i]! > maxVotes) maxVotes = acc[i]!;
    if (maxVotes === 0) return [];
    const minVotes = Math.max(2, Math.floor(maxVotes * opts.houghPeakFraction));

    // Non-maximum suppression in the accumulator: a 3x9 window (theta x rho).
    const candidates: DetectedLine[] = [];
    const tol = opts.familyAngleToleranceDeg * DEG;
    for (let t = 0; t < nTheta; t++) {
        for (let r = 1; r < nRho - 1; r++) {
            const v = acc[t * nRho + r]!;
            if (v < minVotes) continue;
            let isPeak = true;
            for (let dt = -1; dt <= 1 && isPeak; dt++) {
                const tt = t + dt;
                if (tt < 0 || tt >= nTheta) continue;
                for (let dr = -4; dr <= 4; dr++) {
                    if (dt === 0 && dr === 0) continue;
                    const rr = r + dr;
                    if (rr < 0 || rr >= nRho) continue;
                    if (acc[tt * nRho + rr]! > v) {
                        isPeak = false;
                        break;
                    }
                }
            }
            if (!isPeak) continue;
            const theta = t * thetaStep;
            // A line's NORMAL angle near pi/2 means the LINE itself is horizontal.
            const normalFromVertical = Math.abs(theta - Math.PI / 2);
            const family: DetectedLine['family'] =
                normalFromVertical <= tol
                    ? 'horizontal'
                    : Math.min(theta, Math.PI - theta) <= tol
                      ? 'vertical'
                      : 'other';
            candidates.push({ rho: r - diag, theta, votes: v, family });
        }
    }

    // Deterministic ordering: votes descending, then theta, then rho — a total
    // order, so equal-vote lines never depend on scan order.
    candidates.sort((a, b) => b.votes - a.votes || a.theta - b.theta || a.rho - b.rho);
    return candidates;
}

/** Homogeneous line coefficients `(A, B, C)` for `A*x + B*y + C = 0`. */
export function lineCoefficients(line: DetectedLine): readonly [number, number, number] {
    return [Math.cos(line.theta), Math.sin(line.theta), -line.rho];
}

/** Homogeneous cross product — the intersection of two lines. */
function cross(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
): readonly [number, number, number] {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

/**
 * The dominant vanishing point of one family, by exhaustive pairwise accumulation.
 *
 * Candidates are bucketed on the unit sphere (the homogeneous point normalised to
 * unit length), which handles finite and infinite points in ONE representation —
 * no branch, no epsilon-driven split, and a facade shot head-on lands cleanly on a
 * pole rather than at a divide-by-zero.
 */
export function vanishingPoint(
    lines: readonly DetectedLine[],
    opts: FacadeReconstructionOptions,
): VanishingPoint | null {
    const used = lines.slice(0, opts.maxLinesPerFamily);
    if (used.length < 2) return null;

    const coeffs = used.map(lineCoefficients);
    // Bucket resolution on the unit sphere. 0.02 ~ 1.1 degrees of direction, which
    // is finer than the Hough theta step and so cannot be the limiting resolution.
    const BUCKET = 0.02;
    const buckets = new Map<string, { sx: number; sy: number; sw: number; n: number }>();

    for (let i = 0; i < coeffs.length; i++) {
        for (let j = i + 1; j < coeffs.length; j++) {
            const p = cross(coeffs[i]!, coeffs[j]!);
            const norm = Math.hypot(p[0], p[1], p[2]);
            if (norm < 1e-12) continue; // identical lines
            let [x, y, wv] = [p[0] / norm, p[1] / norm, p[2] / norm];
            // Antipodal points are the same direction; canonicalise the sign so the
            // two representations do not split one cluster into two.
            if (x < 0 || (x === 0 && y < 0) || (x === 0 && y === 0 && wv < 0)) {
                x = -x;
                y = -y;
                wv = -wv;
            }
            const key = `${Math.round(x / BUCKET)},${Math.round(y / BUCKET)},${Math.round(wv / BUCKET)}`;
            const b = buckets.get(key);
            if (b === undefined) buckets.set(key, { sx: x, sy: y, sw: wv, n: 1 });
            else {
                b.sx += x;
                b.sy += y;
                b.sw += wv;
                b.n += 1;
            }
        }
    }
    if (buckets.size === 0) return null;

    // Deterministic argmax: highest count, ties broken by the sorted key.
    let bestKey: string | null = null;
    let best: { sx: number; sy: number; sw: number; n: number } | null = null;
    for (const key of [...buckets.keys()].sort()) {
        const b = buckets.get(key)!;
        if (best === null || b.n > best.n) {
            best = b;
            bestKey = key;
        }
    }
    if (best === null || bestKey === null) return null;

    const total = (used.length * (used.length - 1)) / 2;
    const support = total > 0 ? best.n / total : 0;
    const x = best.sx / best.n;
    const y = best.sy / best.n;
    const wv = best.sw / best.n;
    return { x, y, w: wv, support, atInfinity: Math.abs(wv) < 1e-3 };
}

function intersect(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
): Point2 | null {
    const p = cross(a, b);
    if (Math.abs(p[2]) < W_EPSILON) return null; // parallel — no finite corner
    return { x: p[0] / p[2], y: p[1] / p[2] };
}

export interface QuadResult {
    readonly quad: Quad | null;
    readonly status: 'detected' | 'needs-user';
    readonly confidence: number;
    readonly notes: readonly string[];
}

/**
 * The facade quadrilateral: the outermost supported line of each family, in each
 * direction, intersected.
 *
 * ⛔ **"Do not force automatic detection."** (brief §6). Below
 * `quadMinConfidence` this returns `status: 'needs-user'` and NO quad, and the UI
 * asks for four clicks. A guessed facade plane is the most expensive wrong answer
 * available: every later stage measures the wrong rectangle and reports high
 * confidence while doing it.
 */
export function facadeQuad(
    lines: readonly DetectedLine[],
    width: number,
    height: number,
    opts: FacadeReconstructionOptions,
): QuadResult {
    const notes: string[] = [];
    const hs = lines.filter((l) => l.family === 'horizontal');
    const vs = lines.filter((l) => l.family === 'vertical');
    if (hs.length < 2 || vs.length < 2) {
        notes.push(
            `facadeQuad: needs-user — ${hs.length} horizontal / ${vs.length} vertical lines, need 2 of each (brief §6)`,
        );
        return { quad: null, status: 'needs-user', confidence: 0, notes };
    }

    const strongest = Math.max(...lines.map((l) => l.votes));
    const cutoff = strongest * opts.quadSupportFraction;
    const keptH = hs.filter((l) => l.votes >= cutoff);
    const keptV = vs.filter((l) => l.votes >= cutoff);
    if (keptH.length < 2 || keptV.length < 2) {
        notes.push('facadeQuad: needs-user — too few lines survive the support cutoff (brief §6)');
        return { quad: null, status: 'needs-user', confidence: 0, notes };
    }

    // ── "OUTERMOST" IS A GEOMETRIC POSITION, NOT A SIGNED OFFSET ─────────────
    // ⚠ An earlier revision ranked lines by the signed distance from the image
    // centre along each line's own normal. That is wrong, and wrong in a way the
    // corpus caught immediately: the Hough parameterisation lets the SAME
    // geometric line appear with theta near 0 or near pi, whose normals point in
    // OPPOSITE directions — so two lines on the same side of the image get offsets
    // of opposite sign, the "outermost" pair comes back mixed, and the four
    // intersections no longer fall in four distinct quadrants.
    //
    // Evaluating each line's actual crossing position through the image centre has
    // no such ambiguity: a horizontal line's y at x = cx, a vertical line's x at
    // y = cy. Both are invariant under the theta/theta+pi relabelling.
    const cx = width / 2;
    const cy = height / 2;
    const yAtCentre = (l: DetectedLine): number => {
        const s = Math.sin(l.theta);
        if (Math.abs(s) < 1e-9) return Number.POSITIVE_INFINITY;
        return (l.rho - cx * Math.cos(l.theta)) / s;
    };
    const xAtCentre = (l: DetectedLine): number => {
        const c = Math.cos(l.theta);
        if (Math.abs(c) < 1e-9) return Number.POSITIVE_INFINITY;
        return (l.rho - cy * Math.sin(l.theta)) / c;
    };

    const sortedH = [...keptH]
        .filter((l) => Number.isFinite(yAtCentre(l)))
        .sort((a, b) => yAtCentre(a) - yAtCentre(b) || a.rho - b.rho);
    const sortedV = [...keptV]
        .filter((l) => Number.isFinite(xAtCentre(l)))
        .sort((a, b) => xAtCentre(a) - xAtCentre(b) || a.rho - b.rho);
    if (sortedH.length < 2 || sortedV.length < 2) {
        notes.push('facadeQuad: needs-user — boundary lines are degenerate at the image centre');
        return { quad: null, status: 'needs-user', confidence: 0, notes };
    }
    const hTop = sortedH[0]!;
    const hBottom = sortedH[sortedH.length - 1]!;
    const vLeft = sortedV[0]!;
    const vRight = sortedV[sortedV.length - 1]!;

    const cH1 = lineCoefficients(hTop);
    const cH2 = lineCoefficients(hBottom);
    const cV1 = lineCoefficients(vLeft);
    const cV2 = lineCoefficients(vRight);

    const p00 = intersect(cH1, cV1);
    const p01 = intersect(cH1, cV2);
    const p11 = intersect(cH2, cV2);
    const p10 = intersect(cH2, cV1);
    if (p00 === null || p01 === null || p11 === null || p10 === null) {
        notes.push('facadeQuad: needs-user — boundary lines do not intersect (degenerate)');
        return { quad: null, status: 'needs-user', confidence: 0, notes };
    }

    // Order the four corners TL, TR, BR, BL by their position, so a family whose
    // "top" line is geometrically below its "bottom" one still yields a sane quad.
    const corners = [p00, p01, p11, p10];
    const mx = (corners[0]!.x + corners[1]!.x + corners[2]!.x + corners[3]!.x) / 4;
    const my = (corners[0]!.y + corners[1]!.y + corners[2]!.y + corners[3]!.y) / 4;
    const tl = corners.find((p) => p.x <= mx && p.y <= my);
    const tr = corners.find((p) => p.x > mx && p.y <= my);
    const br = corners.find((p) => p.x > mx && p.y > my);
    const bl = corners.find((p) => p.x <= mx && p.y > my);
    if (tl === undefined || tr === undefined || br === undefined || bl === undefined) {
        notes.push('facadeQuad: needs-user — corners do not form four distinct quadrants');
        return { quad: null, status: 'needs-user', confidence: 0, notes };
    }

    const quad: Quad = [tl, tr, br, bl];

    // ── CONFIDENCE = SUPPORT, GATED BY A SANITY FLOOR ON COVERAGE ────────────
    // ⚠ Coverage is a FLOOR, not a linear multiplier, and the distinction is not
    // cosmetic. An earlier revision multiplied support by the fraction of the frame
    // the quad occupies, which meant a PERFECTLY detected facade photographed with
    // sky and pavement around it reported 0.55 — and since every downstream
    // confidence is capped by this one (C108 §4.3), the whole IR inherited a number
    // that measured the PHOTOGRAPHER'S FRAMING rather than any uncertainty of ours.
    //
    // A quad covering a quarter of the frame or more earns full marks; below that,
    // a small detection really is more likely to be spurious, so the term bites.
    const area = Math.abs(
        (tr.x - tl.x) * (bl.y - tl.y) - (bl.x - tl.x) * (tr.y - tl.y),
    );
    const coverage = Math.min(1, area / (width * height));
    const coverageTerm = Math.min(1, coverage / 0.25);
    const support =
        (hTop.votes + hBottom.votes + vLeft.votes + vRight.votes) / (4 * strongest);
    const confidence = Math.max(0, Math.min(1, coverageTerm * support));

    if (confidence < opts.quadMinConfidence) {
        notes.push(
            `facadeQuad: needs-user — confidence ${confidence.toFixed(3)} < ${opts.quadMinConfidence} (brief §6: do not force detection)`,
        );
        return { quad: null, status: 'needs-user', confidence, notes };
    }
    notes.push(`facadeQuad: detected, confidence ${confidence.toFixed(3)}`);
    return { quad, status: 'detected', confidence, notes };
}
