// §FIX-WINDOW-OOB-OPENING-RESTORE (L-82) — WallOccupancyStore.clampToWall.
//
// A window/door dimension edit (width / height / offset / sillHeight) had no
// wall-extent guard, so an out-of-bounds edit produced an opening that exceeded
// the host wall and orphaned/destroyed its cut. `clampToWall` is the pure guard
// that keeps the frame span entirely inside the wall (length × height) — making
// the out-of-bounds state impossible so the opening always stays a valid,
// in-bounds, cuttable span that recovers on any later edit.
//
// Pure data test — no THREE, no store.

import { describe, it, expect } from 'vitest';
import { wallOccupancyStore, WallOccupancyStore } from '../src/WallOccupancyStore';
import type { WallData } from '../src/WallTypes';

// A 3 m long × 2.4 m tall wall along +X. baseLine Y carries level elevation (0 here).
function wall(lengthM = 3, heightM = 2.4): WallData {
    return {
        id: 'w1',
        type: 'wall',
        levelId: 'L0',
        baseLine: [
            { x: 0, y: 0, z: 0 },
            { x: lengthM, y: 0, z: 0 },
        ],
        height: heightM,
        thickness: 0.2,
        openings: [],
        childrenIds: [],
    } as unknown as WallData;
}

describe('§FIX-WINDOW-OOB-OPENING-RESTORE — WallOccupancyStore.clampToWall', () => {
    it('leaves an in-bounds frame untouched (clamped=false)', () => {
        const r = wallOccupancyStore.clampToWall(wall(), {
            offset: 0.9, width: 1.2, height: 1.2, sillHeight: 0.9,
        });
        expect(r.clamped).toBe(false);
        expect(r).toMatchObject({ offset: 0.9, width: 1.2, height: 1.2, sillHeight: 0.9 });
    });

    it('a width that fits the wall is PRESERVED by shifting the offset inward', () => {
        // offset 2.5 + width 1.2 = 3.7 > 3 (wall length). Width (1.2) still fits the
        // 3 m wall, so keep it and pull the offset back to 3 − 1.2 = 1.8.
        const r = wallOccupancyStore.clampToWall(wall(), {
            offset: 2.5, width: 1.2, height: 1.2, sillHeight: 0.9,
        });
        expect(r.clamped).toBe(true);
        expect(r.width).toBeCloseTo(1.2, 6);
        expect(r.offset).toBeCloseTo(1.8, 6);
        expect(r.offset + r.width).toBeLessThanOrEqual(3 + 1e-9);
    });

    it('a width larger than the whole wall is itself shrunk to the wall length', () => {
        const r = wallOccupancyStore.clampToWall(wall(3), {
            offset: 1.0, width: 5.0, height: 1.2, sillHeight: 0.9,
        });
        expect(r.clamped).toBe(true);
        expect(r.width).toBeCloseTo(3, 6);
        expect(r.offset).toBeCloseTo(0, 6);
        expect(r.offset + r.width).toBeLessThanOrEqual(3 + 1e-9);
    });

    it('clamps a frame taller than the wall (height + sill) into the wall height', () => {
        // height 3 > wall 2.4 → height clamped to 2.4, sill to 0.
        const r = wallOccupancyStore.clampToWall(wall(3, 2.4), {
            offset: 0.5, width: 1.0, height: 3.0, sillHeight: 1.5,
        });
        expect(r.clamped).toBe(true);
        expect(r.height).toBeCloseTo(2.4, 6);
        expect(r.sillHeight).toBeCloseTo(0, 6);
        expect(r.sillHeight + r.height).toBeLessThanOrEqual(2.4 + 1e-9);
    });

    it('a high sill is pulled down so sill + height stay within the wall', () => {
        // sill 2.0 + height 1.2 = 3.2 > 2.4 → sill clamped to 2.4 − 1.2 = 1.2.
        const r = wallOccupancyStore.clampToWall(wall(3, 2.4), {
            offset: 0.5, width: 1.0, height: 1.2, sillHeight: 2.0,
        });
        expect(r.clamped).toBe(true);
        expect(r.height).toBeCloseTo(1.2, 6);
        expect(r.sillHeight).toBeCloseTo(1.2, 6);
    });

    it('never produces a zero/negative span (floors at MIN_OPENING_M)', () => {
        const r = wallOccupancyStore.clampToWall(wall(3), {
            offset: 0, width: -1, height: 0, sillHeight: -5,
        });
        expect(r.width).toBeGreaterThanOrEqual(WallOccupancyStore.MIN_OPENING_M);
        expect(r.height).toBeGreaterThanOrEqual(WallOccupancyStore.MIN_OPENING_M);
        expect(r.offset).toBeGreaterThanOrEqual(0);
        expect(r.sillHeight).toBeGreaterThanOrEqual(0);
    });

    it('bringing dimensions back within the wall reports in-bounds again (recovery)', () => {
        // First an OOB edit is clamped; then a subsequent in-bounds edit is a no-op —
        // proving the opening never gets stuck out of bounds.
        const oob = wallOccupancyStore.clampToWall(wall(), {
            offset: 1.0, width: 6.0, height: 1.2, sillHeight: 0.9,
        });
        expect(oob.clamped).toBe(true);
        const back = wallOccupancyStore.clampToWall(wall(), {
            offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9,
        });
        expect(back.clamped).toBe(false);
        expect(back).toMatchObject({ offset: 1.0, width: 1.0 });
    });

    it('degenerate (zero-length) wall leaves dims untouched', () => {
        const zero = wall(0);
        const r = wallOccupancyStore.clampToWall(zero, {
            offset: 0.5, width: 1.0, height: 1.2, sillHeight: 0.9,
        });
        expect(r.clamped).toBe(false);
    });
});
