// §RESI-GROUND-FLOOR — entrance placement unit tests (pure executor helpers).
//
// Proves the entrance-door host resolver + offset deriver:
//   - resolveEntranceOnShell picks the shell wall NEAREST the world entrance point + the
//     projected centre distance along it;
//   - works on a ROTATED parcel (the wall baseLines are already world; the entrance point is
//     the rotated LOCAL centre, so "nearest segment + projection" is rotation-agnostic);
//   - entranceOffsetOnWall turns the centre into a START offset that keeps the whole leaf
//     inside the wall (occupancy convention: opening occupies [offset, offset+width]);
//   - returns undefined when no workable wall exists.

import { describe, expect, it } from 'vitest';
import {
    resolveEntranceOnShell,
    entranceOffsetOnWall,
} from '../src/ui/residential-building/groundFloorPlacement.js';

// A simple axis-aligned 30×18 shell: 4 walls, CCW, pre-minted ids.
const shell = [
    { id: 'w-z0', baseLine: [{ x: 0, z: 0 }, { x: 30, z: 0 }] },   // front (z=0)
    { id: 'w-x1', baseLine: [{ x: 30, z: 0 }, { x: 30, z: 18 }] }, // right (x=30)
    { id: 'w-z1', baseLine: [{ x: 30, z: 18 }, { x: 0, z: 18 }] }, // back (z=18)
    { id: 'w-x0', baseLine: [{ x: 0, z: 18 }, { x: 0, z: 0 }] },   // left (x=0)
];

describe('resolveEntranceOnShell — §RESI-GROUND-FLOOR (pure)', () => {
    it('picks the front (z0) wall for a point on the z0 façade + centre = projected X', () => {
        const hit = resolveEntranceOnShell(shell, { x: 15, z: 0 });
        expect(hit).toBeTruthy();
        expect(hit!.wallId).toBe('w-z0');
        expect(hit!.wallLengthM).toBeCloseTo(30, 6);
        expect(hit!.centerAlongM).toBeCloseTo(15, 6);
    });

    it('picks the back (z1) wall for a point on the z1 façade', () => {
        const hit = resolveEntranceOnShell(shell, { x: 10, z: 18 });
        expect(hit!.wallId).toBe('w-z1');
        // w-z1 runs from (30,18)→(0,18): point x=10 ⇒ 20 m along it.
        expect(hit!.centerAlongM).toBeCloseTo(20, 6);
    });

    it('chooses the nearest wall when the point is interior-ish', () => {
        const hit = resolveEntranceOnShell(shell, { x: 1, z: 9 });
        expect(hit!.wallId).toBe('w-x0');
    });

    it('returns undefined when no wall has a valid baseLine', () => {
        expect(resolveEntranceOnShell([], { x: 0, z: 0 })).toBeUndefined();
        expect(resolveEntranceOnShell([{ id: 'x', baseLine: [{ x: 0, z: 0 }] }], { x: 0, z: 0 })).toBeUndefined();
        // Degenerate (zero-length) wall is skipped.
        expect(resolveEntranceOnShell([{ id: 'x', baseLine: [{ x: 5, z: 5 }, { x: 5, z: 5 }] }], { x: 5, z: 5 })).toBeUndefined();
    });

    it('handles a rotated shell — point on a tilted front wall resolves to that wall', () => {
        // A 45° rotated front edge from (0,0) to (~21.2, ~21.2) (length 30).
        const c = Math.SQRT1_2;
        const rot = [
            { id: 'r-z0', baseLine: [{ x: 0, z: 0 }, { x: 30 * c, z: 30 * c }] },
            { id: 'r-far', baseLine: [{ x: 100, z: 100 }, { x: 130, z: 100 }] },
        ];
        const mid = { x: 15 * c, z: 15 * c }; // midpoint of the tilted front wall
        const hit = resolveEntranceOnShell(rot, mid);
        expect(hit!.wallId).toBe('r-z0');
        expect(hit!.centerAlongM).toBeCloseTo(15, 4);
    });
});

describe('entranceOffsetOnWall — §RESI-GROUND-FLOOR (pure)', () => {
    it('centres the door leaf on the projected centre, fitting inside the wall', () => {
        const hit = { wallId: 'w-z0', wallLengthM: 30, centerAlongM: 15 };
        const { offset, width } = entranceOffsetOnWall(hit, 1.8);
        expect(width).toBeCloseTo(1.8, 6);
        // centre 15, width 1.8 → start 14.1.
        expect(offset).toBeCloseTo(14.1, 6);
        // The whole leaf stays inside [0, 30].
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset + width).toBeLessThanOrEqual(30);
    });

    it('clamps the start so a door near the wall end never overflows', () => {
        const hit = { wallId: 'w', wallLengthM: 10, centerAlongM: 10 };
        const { offset, width } = entranceOffsetOnWall(hit, 1.8, 0.4);
        expect(offset + width).toBeLessThanOrEqual(10 + 1e-9);
        // Pinned to the far jamb minus margin.
        expect(offset).toBeCloseTo(10 - width - 0.4, 6);
    });

    it('shrinks the leaf when the wall is too short to host the full width', () => {
        const hit = { wallId: 'w', wallLengthM: 1.5, centerAlongM: 0.75 };
        const { offset, width } = entranceOffsetOnWall(hit, 1.8, 0.4);
        expect(width).toBeLessThan(1.8);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset + width).toBeLessThanOrEqual(1.5 + 1e-9);
    });
});
