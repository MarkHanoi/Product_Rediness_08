// §RESI-OPENING-IN-WALL — a window opening computed against the generation-time edge length, then
// punched on the MITRED (shorter) stored wall, ran PAST the wall end ("Opening [15.827, 16.727] >
// 16.665") and the element FAILED to build. `clampOpeningToWall` is the emit-stage clamp that pulls
// the span back inside [0, storedLen] (or drops it). These cases pin the founder's exact overrun,
// the byte-identical in-bounds passthrough, the over-wide shrink, and the too-short drop.
import { describe, it, expect } from 'vitest';
import { clampOpeningToWall } from '../clampOpeningToWall.js';

describe('clampOpeningToWall — §RESI-OPENING-IN-WALL', () => {
    it("clamps the founder's exact overrun (Opening [15.827, 16.727] > 16.665) back in-bounds", () => {
        // offset 15.827, width 0.900 ⇒ far edge 16.727, but the mitred stored wall is only 16.665 long.
        const res = clampOpeningToWall(15.827, 0.9, 16.665);
        expect(res).not.toBeNull();
        expect(res!.clamped).toBe(true);
        // Width preserved (it fits); offset pulled to storedLen − width = 16.665 − 0.9 = 15.765.
        expect(res!.width).toBeCloseTo(0.9, 6);
        expect(res!.offset).toBeCloseTo(15.765, 6);
        // The far edge now sits exactly ON the wall end — never past it.
        expect(res!.offset + res!.width).toBeLessThanOrEqual(16.665 + 1e-9);
    });

    it('returns an in-bounds opening byte-identical (clamped:false)', () => {
        const res = clampOpeningToWall(2.0, 1.2, 6.0);
        expect(res).not.toBeNull();
        expect(res!.clamped).toBe(false);
        expect(res!.offset).toBe(2.0);
        expect(res!.width).toBe(1.2);
    });

    it('shrinks an over-WIDE opening to fit the wall, then seats it at offset 0', () => {
        // width 5.0 on a 4.0 m wall ⇒ width shrinks to 4.0, offset 0.
        const res = clampOpeningToWall(1.0, 5.0, 4.0);
        expect(res).not.toBeNull();
        expect(res!.clamped).toBe(true);
        expect(res!.width).toBeCloseTo(4.0, 6);
        expect(res!.offset).toBeCloseTo(0, 6);
        expect(res!.offset + res!.width).toBeLessThanOrEqual(4.0 + 1e-9);
    });

    it('pulls a negative offset up to 0', () => {
        const res = clampOpeningToWall(-0.3, 1.0, 5.0);
        expect(res).not.toBeNull();
        expect(res!.clamped).toBe(true);
        expect(res!.offset).toBeCloseTo(0, 6);
        expect(res!.width).toBeCloseTo(1.0, 6);
    });

    it('drops (null) when the wall is too short to host even a minimal opening', () => {
        expect(clampOpeningToWall(0, 0.9, 0.3)).toBeNull();   // 0.3 m wall < 0.4 m minimal opening
    });

    it('drops (null) on a degenerate / non-finite wall length', () => {
        expect(clampOpeningToWall(0, 0.9, 0)).toBeNull();
        expect(clampOpeningToWall(0, 0.9, Number.NaN)).toBeNull();
    });

    it('never emits a span past the wall end across a sweep of offsets', () => {
        const storedLen = 16.665;
        for (let off = -1; off <= 18; off += 0.137) {
            const res = clampOpeningToWall(off, 0.9, storedLen);
            if (res === null) continue;
            expect(res.offset).toBeGreaterThanOrEqual(-1e-9);
            expect(res.offset + res.width).toBeLessThanOrEqual(storedLen + 1e-9);
        }
    });
});
