// §FEAT-HOSTED-MOVE-DIMENSIONS (founder L-30) — pure along-wall set-out geometry
// unit tests (no browser). Proves the along-wall gap dimension(s) for a hosted
// opening (door/window) dragged along its host wall equal the true 1D distances to
// the nearest reference (wall end or adjacent opening) and update with the offset.

import { describe, it, expect } from 'vitest';
import {
    computeHostedMoveDimensions,
    type HostedMoveDimensionInput,
} from './hostedMoveDimensions';

const base = (over: Partial<HostedMoveDimensionInput>): HostedMoveDimensionInput => ({
    offset: 2,
    width: 0.9,
    wallLength: 6,
    neighbours: [],
    ...over,
});

describe('computeHostedMoveDimensions — §FEAT-HOSTED-MOVE-DIMENSIONS', () => {
    it('measures both gaps to the wall ends when there are no neighbours', () => {
        // Opening centred at 2 m on a 6 m wall, width 0.9 → edges at 1.55 and 2.45.
        const dims = computeHostedMoveDimensions(base({ offset: 2, width: 0.9, wallLength: 6 }));
        expect(dims).toHaveLength(2);
        const start = dims.find((d) => d.side === 'start')!;
        const end = dims.find((d) => d.side === 'end')!;
        expect(start.distanceMm).toBe(1550);  // 1.55 → 0
        expect(start.reference).toBe('wall-end');
        expect(start.fromOffset).toBeCloseTo(1.55);
        expect(start.toOffset).toBe(0);
        expect(end.distanceMm).toBe(3550);    // 6 − 2.45
        expect(end.reference).toBe('wall-end');
        expect(end.fromOffset).toBeCloseTo(2.45);
        expect(end.toOffset).toBe(6);
    });

    it('updates the gaps as the opening slides along the wall', () => {
        const a = computeHostedMoveDimensions(base({ offset: 1 }));
        const b = computeHostedMoveDimensions(base({ offset: 3 }));
        const aStart = a.find((d) => d.side === 'start')!;
        const bStart = b.find((d) => d.side === 'start')!;
        expect(bStart.distanceMm).toBeGreaterThan(aStart.distanceMm); // moved toward the end
    });

    it('measures the start gap to an adjacent opening edge, not the wall end', () => {
        // Neighbour centred at 0.5 (width 0.9) → its right edge is at 0.95.
        // Moving opening centred at 2 (width 0.9) → left edge 1.55.
        // Start gap should be 1.55 − 0.95 = 0.60 m to the OPENING, not 1.55 to the wall end.
        const dims = computeHostedMoveDimensions(
            base({ offset: 2, width: 0.9, wallLength: 6, neighbours: [{ offset: 0.5, width: 0.9 }] }),
        );
        const start = dims.find((d) => d.side === 'start')!;
        expect(start.reference).toBe('opening');
        expect(start.distanceMm).toBe(600);
        expect(start.toOffset).toBeCloseTo(0.95);
        // End side still measures to the wall end (no neighbour to the right).
        const end = dims.find((d) => d.side === 'end')!;
        expect(end.reference).toBe('wall-end');
    });

    it('picks the NEAREST neighbour on each side when there are several', () => {
        // Moving opening centred at 3 (width 1.0) → edges 2.5 and 3.5 on an 8 m wall.
        // Left neighbours at 0.5 and 1.8; right neighbours at 5.0 and 7.0.
        const dims = computeHostedMoveDimensions(
            base({
                offset: 3,
                width: 1.0,
                wallLength: 8,
                neighbours: [
                    { offset: 0.5, width: 0.8 }, // right edge 0.9
                    { offset: 1.8, width: 0.8 }, // right edge 2.2  ← nearest on the left
                    { offset: 5.0, width: 1.0 }, // left edge 4.5   ← nearest on the right
                    { offset: 7.0, width: 0.8 }, // left edge 6.6
                ],
            }),
        );
        const start = dims.find((d) => d.side === 'start')!;
        const end = dims.find((d) => d.side === 'end')!;
        expect(start.toOffset).toBeCloseTo(2.2);
        expect(start.distanceMm).toBe(300);  // 2.5 − 2.2
        expect(end.toOffset).toBeCloseTo(4.5);
        expect(end.distanceMm).toBe(1000);   // 4.5 − 3.5
    });

    it('yields a one-sided result for an opening hard against the wall start', () => {
        // Opening centred at its own half-width → left edge at 0 → start gap 0 (dropped).
        const dims = computeHostedMoveDimensions(base({ offset: 0.45, width: 0.9, wallLength: 6 }));
        expect(dims).toHaveLength(1);
        expect(dims[0].side).toBe('end');
    });

    it('ignores a neighbour that overlaps the moving opening span', () => {
        // Overlapping neighbour centred at 2.2 (width 0.9) straddles the moving opening at 2.
        // It must be ignored → both gaps fall back to the wall ends.
        const dims = computeHostedMoveDimensions(
            base({ offset: 2, width: 0.9, wallLength: 6, neighbours: [{ offset: 2.2, width: 0.9 }] }),
        );
        expect(dims.every((d) => d.reference === 'wall-end')).toBe(true);
    });

    it('returns [] for a degenerate wall length', () => {
        expect(computeHostedMoveDimensions(base({ wallLength: 0 }))).toEqual([]);
    });

    it('returns [] for non-finite inputs', () => {
        expect(computeHostedMoveDimensions(base({ offset: Number.NaN }))).toEqual([]);
    });
});
