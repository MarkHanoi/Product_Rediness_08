// ─── §FIX-STAIR-PARAM-NO-REGEN (L-215) — derived-geometry reconciler tests ────
//
// Pins the invariant that a stair's DERIVED geometry (flights[].riserCount,
// landings[].depth, total riserCount, adjusted riserHeight) is a pure function of
// its PRIMITIVE parameters + the connecting level height. Before the fix these
// fields went stale on a parameter edit, so the founder's width / riser-height /
// tread-depth changes produced no visible change.

import { describe, it, expect } from 'vitest';
import {
    deriveStairGeometry,
    stairHasAuthoredFlightGeometry,
} from '../StairParameterReconciler';
import { DEFAULT_STAIR_PROPERTIES, type StairData, type StairShape } from '../StairTypes';

/** Minimal StairData with an axis-aligned (+X) first flight. */
function makeStair(shape: StairShape, overrides: Partial<StairData> = {}): StairData {
    const now = new Date().toISOString();
    return {
        id: 'st-1',
        type: 'stair',
        levelId: 'L0',
        baseLevelId: 'L0',
        topLevelId: 'L1',
        baseOffset: 0,
        topOffset: 0,
        shape,
        startPosition: { x: 0, y: 0, z: 0 },
        width: 1.0,
        riserHeight: 0.17,
        treadDepth: 0.28,
        riserCount: 18,
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 18 }],
        landings: shape === 'I' ? [] : [{ depth: 1.0 }],
        properties: { ...DEFAULT_STAIR_PROPERTIES },
        parameters: {},
        metadata: { createdAt: now, modifiedAt: now, version: 0, source: 'user' },
        ...overrides,
    };
}

describe('deriveStairGeometry — §FIX-STAIR-PARAM-NO-REGEN (L-215)', () => {
    it('width drives the L-shape landing polygon depth', () => {
        const stair = makeStair('L', { width: 1.0 });
        const wide = deriveStairGeometry({ ...stair, width: 1.4 }, 3.0);
        expect(wide).not.toBeNull();
        expect(wide!.landings).toHaveLength(1);
        expect(wide!.landings[0].depth).toBeCloseTo(1.4, 6);
    });

    it('width drives the U-shape landing polygon depth (2 × width)', () => {
        const stair = makeStair('U', {
            width: 1.0,
            flights: [
                { direction: { x: 1, y: 0, z: 0 }, riserCount: 9 },
                { direction: { x: -1, y: 0, z: 0 }, riserCount: 9, startOverride: { x: 1, y: 0, z: 1 } },
            ],
            landings: [{ depth: 2.0 }],
        });
        const wide = deriveStairGeometry({ ...stair, width: 1.4 }, 3.0);
        expect(wide!.landings[0].depth).toBeCloseTo(2.8, 6);
    });

    it('riserHeight drives the riser COUNT (not merely the height)', () => {
        const stair = makeStair('I');
        const lower = deriveStairGeometry({ ...stair, riserHeight: 0.15 }, 3.0);
        expect(lower!.riserCount).toBe(20);            // round(3.0 / 0.15)
        expect(lower!.flights[0].riserCount).toBe(20); // flight count re-derived too
        expect(lower!.riserHeight).toBeCloseTo(0.15, 6); // adjusted to reach the level exactly

        const higher = deriveStairGeometry({ ...stair, riserHeight: 0.19 }, 3.0);
        expect(higher!.riserCount).toBe(16);           // round(3.0 / 0.19) = 16
        expect(higher!.riserCount).not.toBe(lower!.riserCount);
    });

    it('treadDepth drives the going (U-shape flight-2 start offset moves with it)', () => {
        const stair = makeStair('U', {
            flights: [
                { direction: { x: 1, y: 0, z: 0 }, riserCount: 9 },
                { direction: { x: -1, y: 0, z: 0 }, riserCount: 9, startOverride: { x: 1, y: 0, z: 1 } },
            ],
            landings: [{ depth: 2.0 }],
        });
        const a = deriveStairGeometry({ ...stair, treadDepth: 0.28 }, 3.0);
        const b = deriveStairGeometry({ ...stair, treadDepth: 0.34 }, 3.0);
        const aStart = a!.flights[1].startOverride!;
        const bStart = b!.flights[1].startOverride!;
        // dir1 = +X ⇒ forward offset = before·treadDepth + treadDepth lands on x.
        expect(bStart.x).toBeGreaterThan(aStart.x);
        const before = a!.flights[0].riserCount;
        expect(aStart.x).toBeCloseTo(before * 0.28 + 0.28, 6);
        expect(bStart.x).toBeCloseTo(before * 0.34 + 0.34, 6);
    });

    it('preserves authored per-flight geometry (returns null for polyline/curved stairs)', () => {
        const authored = makeStair('L', {
            flights: [
                { direction: { x: 1, y: 0, z: 0 }, riserCount: 9, treadDepth: 0.31 },
                { direction: { x: 0, y: 0, z: 1 }, riserCount: 9 },
            ],
        });
        expect(stairHasAuthoredFlightGeometry(authored)).toBe(true);
        expect(deriveStairGeometry(authored, 3.0)).toBeNull();
    });

    it('falls back to riserHeight × riserCount when level height is unavailable', () => {
        const stair = makeStair('I', { riserHeight: 0.17, riserCount: 18 });
        const derived = deriveStairGeometry(stair, 0);
        // levelHeight fallback = 0.17 × 18 = 3.06 ⇒ round(3.06/0.17) = 18
        expect(derived!.riserCount).toBe(18);
    });
});
