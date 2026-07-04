// §FIX-FURNITURE-FFL-DEFAULT (L-87) — resolveFflOffset.
//
// Furniture defaults its placement to the Finished Floor Level (FFL) — the TOP
// face of the applied floor finish, at `level.elevation + boundary.baseOffset` —
// NOT the bare structural slab top (the level datum). This suite pins the pure
// resolver that turns the finishes covering a level into that FFL offset.

import { describe, it, expect } from 'vitest';
import { resolveFflOffset } from './FloorTypes.js';
import type { FloorData } from './FloorTypes.js';

/** Minimal FloorData carrying only what resolveFflOffset reads. */
function floor(over: Partial<FloorData> & { baseOffset: number; polygon?: { x: number; z: number }[] }): FloorData {
    const { baseOffset, polygon, ...rest } = over;
    return {
        id: 'fl', type: 'floor', levelId: 'L0', label: 'F', floorNumber: '1',
        boundary: {
            polygon: (polygon ?? [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }]) as any,
            baseOffset,
            thickness: 0.015,
            detectionMethod: 'from-room',
        },
        finishSpec: { exposedScreed: false },
        serviceHoles: [],
        coveredRoomIds: [],
        boundingWallIds: [],
        visible: true,
        properties: {},
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
        ...rest,
    } as unknown as FloorData;
}

describe('§FIX-FURNITURE-FFL-DEFAULT — resolveFflOffset', () => {
    it('bare slab (no finishes) → 0 (the datum IS the FFL)', () => {
        expect(resolveFflOffset([])).toBe(0);
        expect(resolveFflOffset(undefined)).toBe(0);
        expect(resolveFflOffset(null)).toBe(0);
    });

    it('a covering finish → its top-face offset (FFL above the slab top)', () => {
        const floors = [floor({ baseOffset: 0.015 })]; // 15 mm finish resting on slab
        expect(resolveFflOffset(floors, { x: 5, z: 5 })).toBeCloseTo(0.015, 9);
    });

    it('prefers the finish whose polygon CONTAINS the probe point (per-room FFL)', () => {
        const roomA = floor({ baseOffset: 0.015, polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 10 }, { x: 0, z: 10 }] });
        const roomB = floor({ baseOffset: 0.05, polygon: [{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 5, z: 10 }] });
        // Point in room A → A's thin tile FFL, not B's thicker build-up.
        expect(resolveFflOffset([roomA, roomB], { x: 2, z: 5 })).toBeCloseTo(0.015, 9);
        // Point in room B → B's FFL.
        expect(resolveFflOffset([roomA, roomB], { x: 8, z: 5 })).toBeCloseTo(0.05, 9);
    });

    it('no containing finish → greatest finish offset on the level (fallback)', () => {
        const roomA = floor({ baseOffset: 0.015, polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }] });
        const roomB = floor({ baseOffset: 0.05, polygon: [{ x: 5, z: 5 }, { x: 6, z: 5 }, { x: 6, z: 6 }, { x: 5, z: 6 }] });
        // Probe outside both polygons → thickest FFL wins.
        expect(resolveFflOffset([roomA, roomB], { x: 100, z: 100 })).toBeCloseTo(0.05, 9);
    });

    it('ignores hidden finishes (visible === false)', () => {
        const hidden = floor({ baseOffset: 0.05 });
        (hidden as any).visible = false;
        expect(resolveFflOffset([hidden], { x: 5, z: 5 })).toBe(0);
    });
});
