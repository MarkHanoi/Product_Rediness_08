// Apartment Layout Generator — execute-plan builder tests (SPEC §12, A6-core).
//
// Pure: asserts the mm→m conversion, the real wall.batch.create payload SHAPE,
// the wallRef remap after dropping degenerate walls, and loud-fail-soft door
// dropping. No plane, no stores, no mutation.

import { describe, expect, it } from 'vitest';
import { buildLayoutPlan, MIN_WALL_LENGTH_M } from '../src/workflows/apartmentLayout/executePlan.js';
import type { LayoutOption } from '../src/workflows/apartmentLayout/types.js';

const OPTS = { levelId: 'L0', wallTypeId: 'partition', wallHeightM: 2.7, wallThicknessM: 0.1 };

/** A 5 m × 4 m option: one internal wall + one door on it. Coords in mm. */
function option(over: Partial<LayoutOption> = {}): LayoutOption {
    return {
        summary: 'two-room split',
        rooms: [],
        walls: [
            { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } },     // 5 m along +X
            { start: { x: 5000, y: 0 }, end: { x: 5000, y: 4000 } }, // 4 m along +Z
        ],
        doors: [
            { wallRef: 0, offset: 2000, width: 900 },               // mid-wall, fits
        ],
        corridorWidthMin: 1000,
        ...over,
    };
}

describe('buildLayoutPlan (A6-core)', () => {
    it('emits a wall.batch.create ref with metres + the audited payload shape', () => {
        const plan = buildLayoutPlan(option(), OPTS);
        expect(plan.wallCommand.command).toBe('wall.batch.create');
        const payload = plan.wallCommand.payload as { walls: unknown[]; levelId: string };
        expect(payload.levelId).toBe('L0');
        expect(payload.walls).toHaveLength(2);

        const w0 = plan.walls[0]!;
        // mm → m, y = elevation (0), plan y → world z.
        expect(w0.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 });
        expect(w0.baseLine[1]).toEqual({ x: 5, y: 0, z: 0 });
        expect(w0.height).toBe(2.7);
        expect(w0.thickness).toBe(0.1);
        expect(w0.systemTypeId).toBe('partition');
    });

    it('converts the door to metres and references its host wall by index', () => {
        const plan = buildLayoutPlan(option(), OPTS);
        expect(plan.doorPlan).toHaveLength(1);
        const d = plan.doorPlan[0]!;
        expect(d.wallRef).toBe(0);
        expect(d.offset).toBeCloseTo(2.0, 6);
        expect(d.width).toBeCloseTo(0.9, 6);
        expect(d.height).toBe(2.1);
        expect(d.sillHeight).toBe(0);
        expect(d.doorType).toBe('single');
        expect(plan.totalElementCount).toBe(3); // 2 walls + 1 door
        expect(plan.warnings).toHaveLength(0);
    });

    it('drops a degenerate wall and remaps later door wallRefs', () => {
        const plan = buildLayoutPlan(option({
            walls: [
                { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },        // 10 mm → 0.01 m < 0.05 m → dropped
                { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } },      // 5 m → kept, becomes index 0
            ],
            doors: [{ wallRef: 1, offset: 1000, width: 900 }],          // references the kept wall
        }), OPTS);
        expect(plan.walls).toHaveLength(1);
        expect(plan.warnings.some(w => /wall\[0\] dropped/.test(w))).toBe(true);
        // The door's wallRef 1 must remap to the kept wall's new index 0.
        expect(plan.doorPlan).toHaveLength(1);
        expect(plan.doorPlan[0]!.wallRef).toBe(0);
    });

    it('drops a door whose host wall was dropped (loud-fail-soft, no throw)', () => {
        const plan = buildLayoutPlan(option({
            walls: [{ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],   // degenerate → dropped
            doors: [{ wallRef: 0, offset: 1, width: 5 }],
        }), OPTS);
        expect(plan.walls).toHaveLength(0);
        expect(plan.doorPlan).toHaveLength(0);
        expect(plan.warnings.some(w => /door\[0\] dropped/.test(w))).toBe(true);
    });

    it('drops a door with an out-of-range wallRef', () => {
        const plan = buildLayoutPlan(option({ doors: [{ wallRef: 9, offset: 1000, width: 900 }] }), OPTS);
        expect(plan.doorPlan).toHaveLength(0);
        expect(plan.warnings.some(w => /out of range/.test(w))).toBe(true);
    });

    it('drops a door that does not fit on its host wall', () => {
        // wall 0 is 5 m; a door at offset 4.8 m, width 0.9 m → ends at 5.7 m > 5 m.
        const plan = buildLayoutPlan(option({ doors: [{ wallRef: 0, offset: 4800, width: 900 }] }), OPTS);
        expect(plan.doorPlan).toHaveLength(0);
        expect(plan.warnings.some(w => /does not fit/.test(w))).toBe(true);
    });

    it('honours an override plan→world frame (origin shift) + base elevation', () => {
        const plan = buildLayoutPlan(option(), {
            ...OPTS, baseElevationM: 3.0,
            planToWorldXZ: (p) => ({ x: p.x / 1000 + 100, z: p.y / 1000 - 50 }),
        });
        const w0 = plan.walls[0]!;
        expect(w0.baseLine[0]).toEqual({ x: 100, y: 3.0, z: -50 });
        expect(w0.baseLine[1]).toEqual({ x: 105, y: 3.0, z: -50 });
    });

    it('an empty option yields an empty, dispatchable plan (never throws)', () => {
        const plan = buildLayoutPlan(option({ walls: [], doors: [] }), OPTS);
        expect(plan.walls).toHaveLength(0);
        expect(plan.doorPlan).toHaveLength(0);
        expect(plan.totalElementCount).toBe(0);
        expect(plan.wallCommand.command).toBe('wall.batch.create');
        expect(MIN_WALL_LENGTH_M).toBe(0.05);
    });
});
