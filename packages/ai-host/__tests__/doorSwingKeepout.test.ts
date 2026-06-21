// §DOOR-SWING-KEEPOUT — pure door-swing keep-out geometry tests (no browser).
import { describe, it, expect } from 'vitest';
import {
    makeSwingSector, pointInSwing, rectIntersectsSwing, rejectFurnitureClashingDoors,
    type RectXZ,
} from '../src/workflows/furnishLayout/doorSwingKeepout.js';

const rect = (minX: number, minZ: number, maxX: number, maxZ: number): RectXZ => ({ minX, minZ, maxX, maxZ });

describe('§DOOR-SWING-KEEPOUT', () => {
    // Door hinged at origin, latch toward +X, 0.9 m leaf, opening CCW (toward +Z).
    const swing = makeSwingSector({ x: 0, z: 0 }, { x: 1, z: 0 }, 0.9, 1);

    it('makeSwingSector sets radius + a 90° sweep from the latch bearing', () => {
        expect(swing.radiusM).toBe(0.9);
        expect(swing.startRad).toBeCloseTo(0, 6);
        expect(Math.abs(swing.sweepRad)).toBeCloseTo(Math.PI / 2, 6);
    });

    it('pointInSwing: inside the quarter-disc is true, outside the arc / past the radius is false', () => {
        expect(pointInSwing({ x: 0.5, z: 0.5 }, swing)).toBe(true);   // within 0.9 m, 45° into sweep
        expect(pointInSwing({ x: 0.5, z: -0.5 }, swing)).toBe(false); // below the latch axis (outside CCW sweep)
        expect(pointInSwing({ x: 2, z: 0.1 }, swing)).toBe(false);    // beyond the leaf radius
    });

    it('rectIntersectsSwing: a chair sitting in the swing arc clashes', () => {
        // 0.5 m chair centred ~45° into the swing, well within 0.9 m.
        expect(rectIntersectsSwing(rect(0.3, 0.3, 0.7, 0.7), swing)).toBe(true);
    });

    it('rectIntersectsSwing: furniture clear of the swing does NOT clash', () => {
        expect(rectIntersectsSwing(rect(2.0, 2.0, 3.0, 3.0), swing)).toBe(false); // far away
        expect(rectIntersectsSwing(rect(0.2, -1.0, 0.6, -0.4), swing)).toBe(false); // on the non-swing side
    });

    it('rectIntersectsSwing: a rect straddling the swing with no corner inside still clashes (arc sampling)', () => {
        // A big rect that surrounds the arc — no corner is inside the SECTOR, but the
        // hinge / arc tips fall inside the rect.
        expect(rectIntersectsSwing(rect(-1, -1, 1, 1), swing)).toBe(true);
    });

    it('a zero-width leaf never clashes', () => {
        const noLeaf = makeSwingSector({ x: 0, z: 0 }, { x: 1, z: 0 }, 0, 1);
        expect(rectIntersectsSwing(rect(0, 0, 0.5, 0.5), noLeaf)).toBe(false);
    });

    it('CW opening sweeps the other way', () => {
        const cw = makeSwingSector({ x: 0, z: 0 }, { x: 1, z: 0 }, 0.9, -1);
        expect(pointInSwing({ x: 0.5, z: -0.5 }, cw)).toBe(true);  // below axis now in-sweep
        expect(pointInSwing({ x: 0.5, z: 0.5 }, cw)).toBe(false);
    });

    it('rejectFurnitureClashingDoors drops only the clashing items, preserving order', () => {
        const items = [
            rect(0.3, 0.3, 0.7, 0.7),   // clashes
            rect(2.0, 2.0, 2.5, 2.5),   // clear
            rect(0.1, 0.1, 0.4, 0.4),   // clashes
        ];
        const kept = rejectFurnitureClashingDoors(items, [swing]);
        expect(kept).toHaveLength(1);
        expect(kept[0]).toEqual(rect(2.0, 2.0, 2.5, 2.5));
    });

    it('no doors ⇒ everything kept', () => {
        const items = [rect(0, 0, 1, 1)];
        expect(rejectFurnitureClashingDoors(items, [])).toHaveLength(1);
    });
});
