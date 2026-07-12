/**
 * §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) / ADR-0098 — the stair span chokepoint.
 *
 * These pin the two lies the old inline resolvers told, which together produced the
 * founder's "stair in plan view can not yet be created":
 *   1. base level is topmost  → old code returned `top = base` → ZERO span → the
 *      solver computed riserHeight 0 → isValid=false → the tool died in a console.warn.
 *   2. base level not found   → old code fabricated `${baseLevelId}:top`, an id in no
 *      store, which CreateStairCommand.canExecute would reject.
 * Neither is expressible in the resolver's return type any more.
 */
import { describe, it, expect } from 'vitest';
import {
    resolveStairVerticalSpan,
    deriveRisers,
    DEFAULT_STOREY_HEIGHT,
} from '../StairVerticalSpanResolver';

const GROUND = { id: 'L0', name: 'Ground',  elevation: 0 };
const L1     = { id: 'L1', name: 'Level 1', elevation: 3 };
const L2     = { id: 'L2', name: 'Level 2', elevation: 6 };

describe('resolveStairVerticalSpan — ADR-0098', () => {
    it('THE FOUNDER SCENARIO: a fresh single-level project implies the level above (never a zero span)', () => {
        const span = resolveStairVerticalSpan([GROUND], 'L0');
        expect(span.status).toBe('needs-level-above');
        if (span.status !== 'needs-level-above') throw new Error('unreachable');
        expect(span.height).toBe(DEFAULT_STOREY_HEIGHT);
        expect(span.suggestedElevation).toBe(3);
        expect(span.baseElevation).toBe(0);
        expect(span.suggestedName).toBe('Level 1');
    });

    it('resolves the NEAREST level above — not the topmost', () => {
        const span = resolveStairVerticalSpan([GROUND, L1, L2], 'L0');
        expect(span.status).toBe('ok');
        if (span.status !== 'ok') throw new Error('unreachable');
        expect(span.topLevelId).toBe('L1');   // not L2
        expect(span.height).toBe(3);
    });

    it('REGRESSION: drawing on the TOPMOST level implies a new storey — it must NEVER return a zero span', () => {
        // The old `_resolveAdjacentLevel` returned `top = base` here. That fed the solver
        // totalHeight = 0 → riserHeight = 0 → silent death. This is the exact defect.
        const span = resolveStairVerticalSpan([GROUND, L1], 'L1');
        expect(span.status).toBe('needs-level-above');
        if (span.status !== 'needs-level-above') throw new Error('unreachable');
        expect(span.height).toBeGreaterThan(0);
        expect(span.suggestedElevation).toBe(6);
    });

    it('REGRESSION: an unknown base level is UNRESOLVABLE — it must never fabricate a top level id', () => {
        // The old code invented `${baseLevelId}:top`, an id present in no store.
        const span = resolveStairVerticalSpan([GROUND, L1], 'does-not-exist');
        expect(span.status).toBe('unresolvable');
        if (span.status !== 'unresolvable') throw new Error('unreachable');
        expect(span.reason).toContain('does not exist');
    });

    it('an empty project is unresolvable, not a zero span', () => {
        expect(resolveStairVerticalSpan([], 'L0').status).toBe('unresolvable');
        expect(resolveStairVerticalSpan([GROUND], '').status).toBe('unresolvable');
    });

    it('never returns a non-positive height on ANY status', () => {
        const cases = [
            resolveStairVerticalSpan([GROUND], 'L0'),
            resolveStairVerticalSpan([GROUND, L1], 'L0'),
            resolveStairVerticalSpan([GROUND, L1], 'L1'),
            resolveStairVerticalSpan([GROUND, L1, L2], 'L1'),
        ];
        for (const span of cases) {
            if (span.status === 'unresolvable') continue;
            expect(span.height).toBeGreaterThan(0);
        }
    });

    it('tolerates the legacy `height`-as-elevation alias some stores use', () => {
        const span = resolveStairVerticalSpan(
            [{ id: 'A', height: 0 }, { id: 'B', height: 2.8 }],
            'A',
        );
        expect(span.status).toBe('ok');
        if (span.status !== 'ok') throw new Error('unreachable');
        expect(span.height).toBeCloseTo(2.8, 6);
    });
});

describe('deriveRisers — the invariant riserHeight × riserCount === height (P3-iii)', () => {
    // CreateStairCommand.canExecute validates this against HEIGHT_TOLERANCE (50 mm).
    // Deriving the other way round (fixed nominal riser, rounded count) is what used to
    // break it: 2.7 / 0.175 = 15.43 → 15 × 0.175 = 2.625 → 75 mm off → command rejected.
    const HEIGHTS = [2.4, 2.7, 2.8, 3.0, 3.3, 3.6, 4.2, 2.55, 3.15];

    it.each(HEIGHTS)('holds EXACTLY for height = %s m', (height) => {
        const { riserCount, riserHeight } = deriveRisers(height);
        expect(riserCount).toBeGreaterThanOrEqual(2);
        expect(riserHeight * riserCount).toBeCloseTo(height, 9);
    });

    it('keeps the riser height inside the code-compliant band for normal storeys', () => {
        for (const height of HEIGHTS) {
            const { riserHeight } = deriveRisers(height);
            expect(riserHeight).toBeGreaterThanOrEqual(0.100);   // STAIR_CONSTRAINTS.MIN_RISER_HEIGHT
            expect(riserHeight).toBeLessThanOrEqual(0.220);      // MAX_RISER_HEIGHT
        }
    });

    it('the span the resolver returns always yields a code-compliant riser (end-to-end)', () => {
        const span = resolveStairVerticalSpan([GROUND], 'L0');
        if (span.status === 'unresolvable') throw new Error('unreachable');
        const { riserHeight, riserCount } = deriveRisers(span.height);
        expect(riserHeight * riserCount).toBeCloseTo(span.height, 9);
        expect(riserHeight).toBeGreaterThanOrEqual(0.100);
    });
});
