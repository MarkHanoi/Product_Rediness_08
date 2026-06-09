// §STAIR-CONTAIN — pure footprint-containment helper tests (2026-06-09).

import { describe, expect, it } from 'vitest';
import {
    computeInwardContainmentOffset,
    allCornersInside,
} from '../src/workflows/houseLayout/stairContainment.js';

// A 20×20 m axis-aligned shell.
const SHELL = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }, { x: 0, z: 20 },
];

describe('§STAIR-CONTAIN — computeInwardContainmentOffset', () => {
    it('returns {0,0} when the footprint is already inside (axis-aligned no-op)', () => {
        const fp = [{ x: 5, z: 5 }, { x: 7, z: 5 }, { x: 7, z: 8 }, { x: 5, z: 8 }];
        const off = computeInwardContainmentOffset(fp, SHELL, { x: 1, z: 0 });
        expect(off).toEqual({ dx: 0, dz: 0 });
    });

    it('nudges a footprint poking past the RIGHT wall back inside (inward = −x)', () => {
        // Corners at x=19..21 → the x=21 corners are outside (>20). Inward dir −x.
        const fp = [{ x: 19, z: 5 }, { x: 21, z: 5 }, { x: 21, z: 8 }, { x: 19, z: 8 }];
        expect(allCornersInside(fp, SHELL)).toBe(false);
        const off = computeInwardContainmentOffset(fp, SHELL, { x: -1, z: 0 }, 0.1, 3.0);
        expect(off.dx).toBeLessThan(0);                    // moved left (inward)
        expect(off.dz).toBeCloseTo(0, 9);
        const shifted = fp.map(c => ({ x: c.x + off.dx, z: c.z + off.dz }));
        expect(allCornersInside(shifted, SHELL)).toBe(true);  // now contained
        // Minimal: ~1.0 m brings the x=21 corner to x=20.
        expect(off.dx).toBeGreaterThanOrEqual(-1.05);
        expect(off.dx).toBeLessThanOrEqual(-0.95);
    });

    it('nudges along an arbitrary (rotated) inward direction until contained', () => {
        // A footprint whose corner pokes past the top-right; inward ≈ (−1,−1).
        const fp = [{ x: 19, z: 19 }, { x: 21, z: 19 }, { x: 21, z: 21 }, { x: 19, z: 21 }];
        const off = computeInwardContainmentOffset(fp, SHELL, { x: -1, z: -1 }, 0.1, 4.0);
        const shifted = fp.map(c => ({ x: c.x + off.dx, z: c.z + off.dz }));
        expect(allCornersInside(shifted, SHELL)).toBe(true);
        expect(off.dx).toBeLessThan(0);
        expect(off.dz).toBeLessThan(0);
    });

    it('returns {0,0} (best-effort) when no offset within maxM can contain it', () => {
        const fp = [{ x: 19, z: 5 }, { x: 25, z: 5 }, { x: 25, z: 8 }, { x: 19, z: 8 }];
        const off = computeInwardContainmentOffset(fp, SHELL, { x: -1, z: 0 }, 0.1, 0.5); // maxM too small
        expect(off).toEqual({ dx: 0, dz: 0 });
    });

    it('is deterministic + degenerate-safe (no shell / zero dir → {0,0})', () => {
        const fp = [{ x: 21, z: 5 }, { x: 23, z: 5 }, { x: 23, z: 8 }, { x: 21, z: 8 }];
        const a = computeInwardContainmentOffset(fp, SHELL, { x: -1, z: 0 });
        const b = computeInwardContainmentOffset(fp, SHELL, { x: -1, z: 0 });
        expect(a).toEqual(b);
        expect(computeInwardContainmentOffset(fp, [], { x: -1, z: 0 })).toEqual({ dx: 0, dz: 0 });
        expect(computeInwardContainmentOffset(fp, SHELL, { x: 0, z: 0 })).toEqual({ dx: 0, dz: 0 });
    });
});
