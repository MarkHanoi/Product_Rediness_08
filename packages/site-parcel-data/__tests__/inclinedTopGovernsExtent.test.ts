// §GOVERNS-EXTENT (lane ENVELOPE-IBERIA, 2026-09-04) — the one shared-solver change PT needed,
// pinned against CLOSED FORMS computed in-test, never against the solver's own output.
//
// WHY THE FIELD EXISTS: RGEU art. 59 §1 lets the 45° line start 1,50 m above ground on the
// DOWNHILL side of sloping ground, and §2 lets the façade on the narrower of two streets rise to
// the wider street's permitted height for 15 m from the corner. Both are planes that govern only
// PART of the footprint. Round one found that without an extent the 1,50 m tolerance would be
// silently ignored (or, applied globally, would OVERSTATE on the uphill run). These tests pin:
//   • no extents ⇒ the pre-extent numbers, exactly (backward compatibility);
//   • a two-segment frontage ⇒ the tolerance is honoured ONLY on its own band, and the delta is
//     exactly 1,50 m × band width × depth;
//   • the corner rule ⇒ the narrower plane is absent on the corner run and the wider street's
//     height governs there, against a hand-integrated closed form;
//   • an uncovered footprint region with no cap ⇒ REFUSED by name, with the m²;
//   • a non-convex extent ⇒ `invalid-plane`, never repaired;
//   • tiers stay INSCRIBED with extents (Σ tiers ≤ exact; every emitted vertex satisfies h ≥ hi).

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

/** Independent mid-point Riemann sum over the 20 × 30 footprint — separate arithmetic from the solver. */
function riemann(spec: InclinedTopSpec, foot: { w: number; l: number }, n: number): number {
    const dx = foot.w / n;
    const nz = Math.round(foot.l / dx);
    const dz = foot.l / nz;
    let v = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < nz; j++) {
            const h = inclinedTopHeightAt({ x: (i + 0.5) * dx, z: (j + 0.5) * dz }, spec);
            v += (Number.isNaN(h) ? 0 : h) * dx * dz;
        }
    }
    return v;
}

const W = 20;
const L = 30;
const FOOT = rect(0, 0, W, L);

/**
 * The PT frontage fixture: the opposing building's alignment runs along z = −10 (street 10 m wide,
 * alinhamento to alinhamento), the parcel's front is z = 0, depth 30 m. A 45° plane from that
 * alignment is h = z + 10 (+ base). Oriented A→B so the parcel (z > −10) is on the LEFT.
 */
const OPPOSING_A: Pt = { x: 0, z: -10 };
const OPPOSING_B: Pt = { x: W, z: -10 };
const artigo59 = (id: string, base: number, extent: Pt[] | null): InclinedPlaneSpec => ({
    id,
    // The positive side is where cross(dir, q − A) > 0 (): with A→B running +x
    // that is +z — the parcel side. Same convention  relies on.
    anchorA: OPPOSING_A,
    anchorB: OPPOSING_B,
    baseHeight_m: base,
    slopePerMeter: 1,
    governsExtent: extent,
});

describe('§GOVERNS-EXTENT — backward compatibility: no extent ⇒ the pre-extent numbers', () => {
    it('the DK tent fixture solves to its closed form exactly, and tier ids are unchanged', () => {
        const planes = planesFromBoundaryEdges(FOOT, 1.4, 0, 'skraa');
        if (!Array.isArray(planes)) throw new Error('refused');
        const spec: InclinedTopSpec = { flatCap_m: null, planes };
        const tent = (1.4 * W * W * (3 * L - W)) / 12;
        const s = solveInclinedTop(FOOT, spec);
        expect(s.ok).toBe(true);
        if (!s.ok) return;
        expect(s.volumeM3).toBeCloseTo(tent, 6);
        const tiers = inclinedTopToTiers(FOOT, spec, { slices: 4 });
        if (!Array.isArray(tiers)) throw new Error('refused');
        // The 4th slice's region {h ≥ 14} is the tent's RIDGE — zero area, skipped (pre-extent
        // behaviour, unchanged). No id carries a `-m` piece suffix when no extent is in play.
        expect(tiers.map((t) => t.id)).toEqual(['inclined-slice-0', 'inclined-slice-1', 'inclined-slice-2']);
    });

    it('an explicit `governsExtent: null` is the same as omitting it', () => {
        const a = solveInclinedTop(FOOT, { flatCap_m: null, planes: [artigo59('p', 0, null)] });
        const b = solveInclinedTop(FOOT, { flatCap_m: null, planes: [{ ...artigo59('p', 0, null), governsExtent: undefined }] });
        expect(a).toEqual(b);
    });
});

describe('§GOVERNS-EXTENT — art. 59 §1: the 1,50 m downhill tolerance on ONE band of the frontage', () => {
    // The western half of the frontage (x < 10) is level: base 0. The eastern half slopes down on
    // the parcel side: base 1,50. Each plane governs only its own band, extended over the depth.
    const westBand = rect(-1, -20, 10, L + 1);
    const eastBand = rect(10, -20, W + 1, L + 1);
    const split: InclinedTopSpec = {
        flatCap_m: null,
        planes: [artigo59('west-level', 0, westBand), artigo59('east-downhill', 1.5, eastBand)],
    };
    const globalNoTolerance: InclinedTopSpec = { flatCap_m: null, planes: [artigo59('all', 0, null)] };

    // Closed forms: ∫∫ (z + 10) over a 10 × 30 band = 10 · (450 + 300) = 7 500;
    //               ∫∫ (z + 11,5) over the other  = 10 · (450 + 345) = 7 950.
    const EXACT_SPLIT = 7500 + 7950;
    const EXACT_GLOBAL = 2 * 7500;

    it('⭐ honours the tolerance ONLY on its band — the exact volume is the sum of the two closed forms', () => {
        const s = solveInclinedTop(FOOT, split);
        expect(s.ok).toBe(true);
        if (!s.ok) return;
        expect(s.volumeM3).toBeCloseTo(EXACT_SPLIT, 6);
        expect(s.governedCells).toBe(2);
        expect(s.peakHeightM).toBeCloseTo(30 + 11.5, 9);
    });

    it('dropping the tolerance UNDER-states by exactly 1,50 m × 10 m × 30 m = 450 m³ (round one\'s "silently ignored")', () => {
        const g = solveInclinedTop(FOOT, globalNoTolerance);
        expect(g.ok).toBe(true);
        if (!g.ok) return;
        expect(g.volumeM3).toBeCloseTo(EXACT_GLOBAL, 6);
        expect(EXACT_SPLIT - g.volumeM3).toBeCloseTo(450, 6);
    });

    it('applying the tolerance GLOBALLY would over-state the level half by the same 450 m³', () => {
        const over = solveInclinedTop(FOOT, { flatCap_m: null, planes: [artigo59('all-1.5', 1.5, null)] });
        expect(over.ok).toBe(true);
        if (!over.ok) return;
        expect(over.volumeM3 - EXACT_SPLIT).toBeCloseTo(450, 6);
    });

    it('the independent Riemann grid agrees with the split closed form (1 %)', () => {
        const r = riemann(split, { w: W, l: L }, 200);
        expect(Math.abs(r - EXACT_SPLIT) / EXACT_SPLIT).toBeLessThan(0.01);
    });

    it('pointwise: the absent plane does not enter the min — east points see base 1,50, west points see base 0', () => {
        expect(inclinedTopHeightAt({ x: 5, z: 0 }, split)).toBeCloseTo(10, 9);
        expect(inclinedTopHeightAt({ x: 15, z: 0 }, split)).toBeCloseTo(11.5, 9);
    });
});

describe('§GOVERNS-EXTENT — art. 59 §2: the corner rule (narrower street absent on the 15 m run)', () => {
    // Narrower street along the south edge (z = 0), width 8 → h_n = z + 8, but only beyond 15 m
    // from the corner at (0, 0), i.e. x ≥ 15. Wider street along the west edge (x = 0), width 16
    // → h_w = x + 16 over its whole frontage. On the corner run (x < 15) the façade on the narrower
    // street may rise to the wider street's permitted façade height (16 m): in the article's own
    // geometry that is the SAME 45° line started 8 m higher — h = z + 16 — present only there. (A
    // flat 16 m cap would be WRONG: it would restrict the deep plot below the base rule z + 8, and
    // an allowance cannot restrict.)
    const narrowExtent = rect(15, -20, W + 1, L + 1);
    const cornerRun = rect(-1, -20, 15, L + 1);
    const narrow: InclinedPlaneSpec = {
        id: 'narrow-z+8', anchorA: { x: 0, z: -8 }, anchorB: { x: W, z: -8 }, baseHeight_m: 0, slopePerMeter: 1, governsExtent: narrowExtent,
    };
    const wide: InclinedPlaneSpec = {
        id: 'wide-x+16', anchorA: { x: -16, z: L }, anchorB: { x: -16, z: 0 }, baseHeight_m: 0, slopePerMeter: 1, governsExtent: null,
    };
    const cornerRaised: InclinedPlaneSpec = {
        id: 'corner-run-z+16', anchorA: { x: 0, z: -8 }, anchorB: { x: W, z: -8 }, baseHeight_m: 8, slopePerMeter: 1, governsExtent: cornerRun,
    };
    const spec: InclinedTopSpec = { flatCap_m: null, planes: [narrow, wide, cornerRaised] };

    // Hand-integrated: x ∈ [0,15] → min(x+16, z+16) = 16 + min(x, z)
    //                              → 16·450 + ∫₀¹⁵ [x²/2 + x(30−x)] dx = 7 200 + 2 812,5 = 10 012,5.
    //                  x ∈ [15,20] → ∫ [∫₀^{x+8}(z+8)dz + ∫_{x+8}^{30}(x+16)dz] dx
    //                              = ∫₁₅²⁰ (−x²/2 + 22x + 448) dx = 3 394,1666…
    const EXACT = 10012.5 + 3394.1666666667;

    it('⭐ solves to the hand-integrated closed form', () => {
        const s = solveInclinedTop(FOOT, spec);
        expect(s.ok).toBe(true);
        if (!s.ok) return;
        expect(s.volumeM3).toBeCloseTo(EXACT, 5);
    });

    it('the corner rule GRANTS relative to the narrower plane governing everywhere (the rule is an allowance)', () => {
        const noCorner: InclinedTopSpec = { flatCap_m: null, planes: [{ ...narrow, governsExtent: null }, wide] };
        const a = solveInclinedTop(FOOT, spec);
        const b = solveInclinedTop(FOOT, noCorner);
        if (!a.ok || !b.ok) throw new Error('refused');
        // Base rule alone: ∫₀¹⁵ (−x²/2 + 22x + 448) dx + 3 394,1666… = 8 632,5 + 3 394,1666… = 12 026,6666…
        expect(b.volumeM3).toBeCloseTo(12026.6666666667, 5);
        expect(a.volumeM3).toBeGreaterThan(b.volumeM3);
        expect(a.volumeM3 - b.volumeM3).toBeCloseTo(1380, 5);
    });

    it('the independent Riemann grid agrees (1 %)', () => {
        const r = riemann(spec, { w: W, l: L }, 200);
        expect(Math.abs(r - EXACT) / EXACT).toBeLessThan(0.01);
    });

    it('pointwise on the corner run the narrower plane is absent: (5, 0) reads 16, not 8', () => {
        expect(inclinedTopHeightAt({ x: 5, z: 0 }, spec)).toBeCloseTo(16, 9);
        expect(inclinedTopHeightAt({ x: 17, z: 0 }, spec)).toBeCloseTo(8, 9);
    });
});

describe('§GOVERNS-EXTENT — refusals are typed, never fabricated', () => {
    it('⛔ a footprint region covered by NO plane and no cap → no-vertical-limit naming the m²', () => {
        // Only the western band is governed; the eastern 10 × 30 = 300 m² is unbounded.
        const s = solveInclinedTop(FOOT, { flatCap_m: null, planes: [artigo59('west', 0, rect(-1, -20, 10, L + 1))] });
        expect(s.ok).toBe(false);
        if (s.ok) return;
        expect(s.reason).toBe('no-vertical-limit');
        expect(s.detail).toMatch(/300\.00 m²/);
    });

    it('a flat cap bounds the uncovered region, so the same spec WITH a cap solves — and the cap governs there', () => {
        const s = solveInclinedTop(FOOT, { flatCap_m: 12, planes: [artigo59('west', 0, rect(-1, -20, 10, L + 1))] });
        expect(s.ok).toBe(true);
        if (!s.ok) return;
        // West band: min(z+10, 12) → z ≤ 2: (z+10); z > 2: 12 → 10·[∫₀²(z+10)dz + 28·12] = 10·(22 + 336) = 3 580.
        // East band: 12 everywhere → 10·30·12 = 3 600.
        expect(s.volumeM3).toBeCloseTo(3580 + 3600, 6);
    });

    it('a non-convex extent → invalid-plane, never split or repaired', () => {
        const reflex: Pt[] = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 30 }, { x: 10, z: 10 }, { x: 0, z: 30 }];
        const s = solveInclinedTop(FOOT, { flatCap_m: 10, planes: [artigo59('bad', 0, reflex)] });
        expect(s.ok).toBe(false);
        if (s.ok) return;
        expect(s.reason).toBe('invalid-plane');
        expect(s.detail).toMatch(/governsExtent/);
    });

    it('a degenerate (collinear) extent → invalid-plane', () => {
        const s = solveInclinedTop(FOOT, { flatCap_m: 10, planes: [artigo59('flat', 0, [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }])] });
        expect(s.ok).toBe(false);
        if (s.ok) return;
        expect(s.reason).toBe('invalid-plane');
    });
});

describe('§GOVERNS-EXTENT — tiers stay INSCRIBED (the render seam never overstates)', () => {
    const spec: InclinedTopSpec = {
        flatCap_m: null,
        planes: [artigo59('west-level', 0, rect(-1, -20, 10, L + 1)), artigo59('east-downhill', 1.5, rect(10, -20, W + 1, L + 1))],
    };

    it('Σ tier volumes ≤ the exact volume, and converges from below as slices grow', () => {
        const exact = solveInclinedTop(FOOT, spec);
        if (!exact.ok) throw new Error('refused');
        const sum = (n: number): number => {
            const t = inclinedTopToTiers(FOOT, spec, { slices: n });
            if (!Array.isArray(t)) throw new Error('refused');
            return t.reduce((s, tier) => s + tier.areaM2 * (tier.maxHeight_m - tier.baseHeight_m), 0);
        };
        const s8 = sum(8);
        const s32 = sum(32);
        expect(s8).toBeLessThanOrEqual(exact.volumeM3 + 1e-6);
        expect(s32).toBeLessThanOrEqual(exact.volumeM3 + 1e-6);
        expect(s32).toBeGreaterThan(s8);
    });

    it('every INTERIOR point of an emitted prism satisfies h ≥ the slice top (inscribed), even where pieces split', () => {
        // Probed at the centroid and at each vertex pulled 1 mm toward it. ⚠ NOT at the bare vertex:
        // two touching extents share a boundary line, and on that measure-zero line the pointwise
        // field sees BOTH planes (closed extents), so a vertex ON x = 10 can read the lower plane
        // while the prism it bounds lies wholly in the other band. Interior points are the claim.
        const tiers = inclinedTopToTiers(FOOT, spec, { slices: 6 });
        if (!Array.isArray(tiers)) throw new Error('refused');
        expect(tiers.length).toBeGreaterThan(0);
        for (const t of tiers) {
            const cx = t.polygon.reduce((s, v) => s + v.x, 0) / t.polygon.length;
            const cz = t.polygon.reduce((s, v) => s + v.z, 0) / t.polygon.length;
            expect(inclinedTopHeightAt({ x: cx, z: cz }, spec)).toBeGreaterThanOrEqual(t.maxHeight_m - 1e-6);
            for (const v of t.polygon) {
                const d = Math.hypot(cx - v.x, cz - v.z) || 1;
                const p = { x: v.x + ((cx - v.x) / d) * 1e-3, z: v.z + ((cz - v.z) / d) * 1e-3 };
                expect(inclinedTopHeightAt(p, spec)).toBeGreaterThanOrEqual(t.maxHeight_m - 1e-6);
            }
        }
    });

    it('a slice that intersects only the downhill band emits pieces whose ids carry the -k[-m] shape', () => {
        // Top of the field is 41,5 m (east) vs 40 m (west). With 83 slices of 0,5 m the slice
        // [40,5–41,0] lies above the west band's peak — only the east piece survives there (the
        // final [41,0–41,5] slice is the zero-area ridge and is skipped, as in the tent).
        const tiers = inclinedTopToTiers(FOOT, spec, { slices: 83 });
        if (!Array.isArray(tiers)) throw new Error('refused');
        const top = tiers.filter((t) => t.maxHeight_m > 40.9);
        expect(top.length).toBeGreaterThanOrEqual(1);
        for (const t of top) for (const v of t.polygon) expect(v.x).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(tiers.every((t) => /^inclined-slice-\d+(-\d+)?$/.test(t.id))).toBe(true);
    });
});
