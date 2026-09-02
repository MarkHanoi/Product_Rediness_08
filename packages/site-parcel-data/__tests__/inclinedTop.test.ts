// §K1-INCLINED-TOP — the oracle table for the piecewise-planar height field (inclinedTop.ts).
//
// The load-bearing arm is the DK fixture: *det skrå højdegrænseplan* (h ≤ 1.4 × distance to the
// boundary) over a W × L rectangle with the flat cap H, whose volume has a CLOSED FORM computed
// in this file (not transcribed from anywhere):
//
//   Uncapped hip ("tent") of slope s over W × L (W ≤ L):  V = s · W²(3L − W) / 12
//     (prism of triangular cross-section over the ridge L − W, plus two half-pyramids:
//      s·[W²(L−W)/4 + W³/6] = s·W²(3L−W)/12; sanity: W = L gives the square pyramid s·W³/6).
//   Capped at H (t = H/s < W/2, inner offset rect W' = W−2t, L' = L−2t):
//     the part ABOVE the cap is itself a tent of slope s over W' × L', so
//     V = s · [W²(3L − W) − W'²(3L' − W')] / 12.
//
// A coarse Riemann grid double-pins the closed form (independent arithmetic, same field), and the
// tier emission is checked INSCRIBED: every emitted prism lies inside the true solid, the tier
// stack's volume never exceeds the exact integral, and it converges from below as slices grow.
//
// Direction of error, per the module header: the SOLVE is exact (float-only); the DRAWN tiers
// under-state. The volume assertion's failure message names the excess — severing the plane
// evaluation (the lane-K1 falsification) makes the field fall back to the flat cap and the
// message names exactly the overstated m³.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import {
    inclinedTopHeightAt,
    inclinedTopToTiers,
    planesFromBoundaryEdges,
    solveInclinedTop,
    type InclinedPlaneSpec,
    type InclinedTopSpec,
} from '../src/geometry/inclinedTop.js';

const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
];

// ── The DK fixture: 20 × 30 m footprint, slope 1.4 from every boundary, BR18-shaped 8.5 m cap ──
const W = 20;
const L = 30;
const S = 1.4;
const CAP = 8.5;
const FOOT = rect(0, 0, W, L);
const tentVolume = (w: number, l: number, s: number): number => (s * w * w * (3 * l - w)) / 12;
/** The closed form, computed here (see the header derivation). */
const ANALYTIC_UNCAPPED = tentVolume(W, L, S); // 1.4 · 400 · 70 / 12 = 3266.666…
const T = CAP / S;
const ANALYTIC_CAPPED = tentVolume(W, L, S) - tentVolume(W - 2 * T, L - 2 * T, S);

const dkPlanes = (): InclinedPlaneSpec[] => {
    const p = planesFromBoundaryEdges(FOOT, S, 0, 'skraa');
    if (!Array.isArray(p)) throw new Error(`planesFromBoundaryEdges refused: ${JSON.stringify(p)}`);
    return p;
};

/** Independent coarse Riemann mid-point sum over the rectangle (same field, separate arithmetic). */
function riemann(spec: InclinedTopSpec, n: number): number {
    const dx = W / n;
    const nz = Math.round(L / dx); // square-ish cells
    let v = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < nz; j++) {
            const p = { x: (i + 0.5) * dx, z: (j + 0.5) * (L / nz) };
            v += inclinedTopHeightAt(p, spec) * dx * (L / nz);
        }
    }
    return v;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-INCLINED-TOP — the DK det skrå højdegrænseplan fixture (closed form in-test)', () => {
    it('⭐ THE VOLUME ARM (capped) — exact integral equals the closed form', () => {
        const spec: InclinedTopSpec = { flatCap_m: CAP, planes: dkPlanes() };
        const out = solveInclinedTop(FOOT, spec);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        const flatCapVolume = CAP * W * L; // what a plane-blind (flat-cap) fallback would grant
        expect(
            out.volumeM3,
            `inclined-top volume ${out.volumeM3.toFixed(3)} m³ deviates from the closed form ` +
                `${ANALYTIC_CAPPED.toFixed(3)} m³ by ${(out.volumeM3 - ANALYTIC_CAPPED).toFixed(3)} m³ ` +
                `(a positive delta is OVERSTATED volume; the flat-cap fallback would overstate by ` +
                `+${(flatCapVolume - ANALYTIC_CAPPED).toFixed(3)} m³)`,
        ).toBeCloseTo(ANALYTIC_CAPPED, 6);
        expect(out.footprintAreaM2).toBeCloseTo(W * L, 9);
        expect(out.peakHeightM).toBeCloseTo(CAP, 9); // the cap binds (uncapped ridge would be 14 m)
        expect(out.governedCells).toBeGreaterThanOrEqual(5); // 4 plane cells + the cap plateau
    });

    it('THE VOLUME ARM (uncapped) — the pure tent, ridge at s·W/2', () => {
        const out = solveInclinedTop(FOOT, { flatCap_m: null, planes: dkPlanes() });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(
            out.volumeM3,
            `uncapped tent ${out.volumeM3.toFixed(3)} m³ vs closed form ${ANALYTIC_UNCAPPED.toFixed(3)} m³ ` +
                `(Δ ${(out.volumeM3 - ANALYTIC_UNCAPPED).toFixed(3)} m³)`,
        ).toBeCloseTo(ANALYTIC_UNCAPPED, 6);
        expect(out.peakHeightM).toBeCloseTo((S * W) / 2, 6); // 14 m at the ridge
    });

    it('the independent Riemann grid agrees with the closed form (double-pin, 1 %)', () => {
        const spec: InclinedTopSpec = { flatCap_m: CAP, planes: dkPlanes() };
        const approx = riemann(spec, 80);
        expect(Math.abs(approx - ANALYTIC_CAPPED) / ANALYTIC_CAPPED).toBeLessThan(0.01);
    });

    it('pointwise field values: min over planes and cap, zero at the boundary', () => {
        const spec: InclinedTopSpec = { flatCap_m: CAP, planes: dkPlanes() };
        expect(inclinedTopHeightAt({ x: 10, z: 15 }, spec)).toBeCloseTo(CAP, 9); // centre: cap binds
        expect(inclinedTopHeightAt({ x: 1, z: 15 }, spec)).toBeCloseTo(1.4, 9); // 1 m in: 1.4 m
        expect(inclinedTopHeightAt({ x: 0, z: 15 }, spec)).toBeCloseTo(0, 9); // on the boundary line
        expect(inclinedTopHeightAt({ x: 3, z: 2 }, spec)).toBeCloseTo(1.4 * 2, 9); // nearest edge governs
    });

    it('planes only tighten: capped ≤ flat-cap prism, uncapped ≥ capped', () => {
        const capped = solveInclinedTop(FOOT, { flatCap_m: CAP, planes: dkPlanes() });
        const prism = solveInclinedTop(FOOT, { flatCap_m: CAP, planes: [] });
        expect(capped.ok && prism.ok).toBe(true);
        if (!capped.ok || !prism.ok) return;
        expect(prism.volumeM3).toBeCloseTo(CAP * W * L, 6); // the plane-free prism is exact too
        expect(capped.volumeM3).toBeLessThan(prism.volumeM3); // the skrå planes CUT volume
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-INCLINED-TOP — the DE-shaped single plane (0.4×H ⇒ h ≤ 2.5·d) wedge', () => {
    it('a single boundary plane over a rectangle is a wedge with a trivial closed form', () => {
        // h ≤ 2.5 · x over a 10 × 20 rectangle, cap far above: V = 2.5 · (10²/2) · 20 = 2 500 m³.
        const foot = rect(0, 0, 10, 20);
        const plane: InclinedPlaneSpec = {
            id: 'abstand-west',
            anchorA: { x: 0, z: 20 },
            anchorB: { x: 0, z: 0 },
            baseHeight_m: 0,
            slopePerMeter: 2.5,
        };
        // Anchor direction (0,20)→(0,0): the footprint (x > 0) must be the POSITIVE side.
        const out = solveInclinedTop(foot, { flatCap_m: 100, planes: [plane] });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.volumeM3).toBeCloseTo(2500, 6);
        expect(out.peakHeightM).toBeCloseTo(25, 6);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-INCLINED-TOP — tier emission (the render seam: inscribed, never overstating)', () => {
    const spec: InclinedTopSpec = { flatCap_m: CAP, planes: dkPlanes() };

    it('⭐ INSCRIBED — every tier prism lies inside the true solid; the stack under-states', () => {
        const tiers = inclinedTopToTiers(FOOT, spec, { slices: 16, ordinanceRef: 'BR18 §176-ish (fixture)' });
        expect(Array.isArray(tiers)).toBe(true);
        if (!Array.isArray(tiers)) return;
        expect(tiers.length).toBeGreaterThanOrEqual(8);
        let stack = 0;
        for (const t of tiers) {
            expect(t.maxHeight_m).not.toBeNull();
            stack += t.areaM2 * ((t.maxHeight_m ?? 0) - t.baseHeight_m);
            // Every polygon vertex of the slice must genuinely REACH the slice top: h(v) ≥ top.
            for (const v of t.polygon) {
                expect(
                    inclinedTopHeightAt(v, spec),
                    `tier ${t.id}: vertex (${v.x.toFixed(3)}, ${v.z.toFixed(3)}) sits where the field ` +
                        `is ${inclinedTopHeightAt(v, spec).toFixed(4)} m but the tier top is ` +
                        `${(t.maxHeight_m ?? 0).toFixed(4)} m — the prism pokes OUT of the true solid`,
                ).toBeGreaterThanOrEqual((t.maxHeight_m ?? 0) - 1e-6);
            }
        }
        const exact = solveInclinedTop(FOOT, spec);
        expect(exact.ok).toBe(true);
        if (!exact.ok) return;
        expect(
            stack - exact.volumeM3,
            `tier stack ${stack.toFixed(3)} m³ EXCEEDS the exact volume ${exact.volumeM3.toFixed(3)} m³`,
        ).toBeLessThanOrEqual(1e-9);
        expect(stack).toBeGreaterThan(0.7 * exact.volumeM3); // and it is a real solid, not a token
    });

    it('slice areas are monotone non-increasing with height (terraces of a min-field)', () => {
        const tiers = inclinedTopToTiers(FOOT, spec, { slices: 12 });
        if (!Array.isArray(tiers)) throw new Error('tier emission refused');
        for (let i = 1; i < tiers.length; i++) {
            expect(tiers[i]!.areaM2).toBeLessThanOrEqual(tiers[i - 1]!.areaM2 + 1e-9);
        }
    });

    it('more slices converge to the exact volume FROM BELOW', () => {
        const exact = solveInclinedTop(FOOT, spec);
        if (!exact.ok) throw new Error('solve refused');
        const stackVol = (slices: number): number => {
            const tiers = inclinedTopToTiers(FOOT, spec, { slices });
            if (!Array.isArray(tiers)) throw new Error('tier emission refused');
            return tiers.reduce((s, t) => s + t.areaM2 * ((t.maxHeight_m ?? 0) - t.baseHeight_m), 0);
        };
        const v8 = stackVol(8);
        const v32 = stackVol(32);
        const v128 = stackVol(128);
        expect(v8).toBeLessThanOrEqual(v32 + 1e-9);
        expect(v32).toBeLessThanOrEqual(v128 + 1e-9);
        expect(v128).toBeLessThanOrEqual(exact.volumeM3 + 1e-9);
        expect(exact.volumeM3 - v128).toBeLessThan(0.02 * exact.volumeM3);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§K1-INCLINED-TOP — refusals are typed, never fabricated', () => {
    it('no planes AND no cap → no-vertical-limit (fabricating a top is the forbidden direction)', () => {
        const out = solveInclinedTop(FOOT, { flatCap_m: null, planes: [] });
        expect(out.ok).toBe(false);
        expect(!out.ok && out.reason).toBe('no-vertical-limit');
    });

    it('degenerate origin line → invalid-plane, named', () => {
        const out = solveInclinedTop(FOOT, {
            flatCap_m: CAP,
            planes: [{ id: 'bad', anchorA: { x: 1, z: 1 }, anchorB: { x: 1, z: 1 }, baseHeight_m: 0, slopePerMeter: 1.4 }],
        });
        expect(out.ok).toBe(false);
        expect(!out.ok && out.reason).toBe('invalid-plane');
    });

    it('degenerate footprint (< 3 vertices, zero area) → degenerate-footprint', () => {
        const line = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
        const out = solveInclinedTop(line, { flatCap_m: CAP, planes: [] });
        expect(out.ok).toBe(false);
        expect(!out.ok && out.reason).toBe('degenerate-footprint');
        const collinear = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }];
        const out2 = solveInclinedTop(collinear, { flatCap_m: CAP, planes: [] });
        expect(out2.ok).toBe(false);
        expect(!out2.ok && out2.reason).toBe('degenerate-footprint');
    });

    it('self-intersecting footprint → invalid-footprint-geometry, never repaired', () => {
        // An ASYMMETRIC bow-tie (a symmetric one has signed area exactly 0 and correctly reports
        // the zero-area defect first — see `validateRing`'s ordering note).
        const bowtie: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 2, z: 8 }, { x: 8, z: 12 }];
        const out = solveInclinedTop(bowtie, { flatCap_m: CAP, planes: [] });
        expect(out.ok).toBe(false);
        expect(!out.ok && out.reason).toBe('invalid-footprint-geometry');
    });

    it('a plane below ground everywhere grants ZERO volume, not negative credit', () => {
        const out = solveInclinedTop(FOOT, {
            flatCap_m: null,
            planes: [{ id: 'sunk', anchorA: { x: 0, z: 30 }, anchorB: { x: 0, z: 0 }, baseHeight_m: -100, slopePerMeter: 1 }],
        });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.volumeM3).toBeGreaterThanOrEqual(0);
        expect(out.volumeM3).toBeCloseTo(0, 6); // max height would be −100 + 20 < 0 everywhere
    });
});
