import { describe, it, expect, beforeAll } from 'vitest';
import { StairPathToolController } from '@pryzm/geometry-stair';
import {
    planStairByWalls,
    BY_WALLS_PERPENDICULAR_TOLERANCE_DEG,
    BY_WALLS_CORNER_TOLERANCE_M,
    type ByWallsWall,
    type ByWallsPlan,
    type ByWallsRefusal,
} from '../stairByWalls';

/**
 * §FEAT-STAIR-BY-WALLS (founder, 2026-08-19) — L-1455.
 *
 * *"…or **select 2 walls** [and] create the stair in **L shape against the walls**."*
 *
 * Two things are asserted here and they are of different kinds:
 *
 *  1. **THE REFUSALS CARRY BOTH NUMBERS.** The founder's standing direction is open
 *     language with rule gates that refuse stating the value FOUND *and* the value
 *     REQUIRED. A refusal that says "these walls will not work" is a refusal the
 *     architect cannot act on.
 *
 *  2. ⭐ **THE PLAN PRODUCES A STAIR THE COMMAND ACTUALLY ACCEPTS** — C84 EI-3, "UI
 *     offers ⇒ pipeline accepts". The success case does NOT stop at "the planner
 *     returned three points": it feeds those points to the REAL
 *     `StairPathToolController` and asserts a REAL `CreateStairCommand` came out the
 *     other side, with no `onInvalid` refusal. This family had a LIVE EI-3 breach
 *     three hours ago (a 220 mm tool against a 250 mm command); adding a second one
 *     was the specific thing not to do.
 */

beforeAll(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext =
        () => new Proxy({}, { get: () => () => undefined });
});

const wall = (
    id: string,
    x1: number, z1: number, x2: number, z2: number,
    thickness = 0.2,
): ByWallsWall => ({
    id,
    baseLine: [{ x: x1, z: z1 }, { x: x2, z: z2 }],
    thickness,
});

const refusal = (o: ReturnType<typeof planStairByWalls>): ByWallsRefusal => {
    expect(o.ok).toBe(false);
    return o as ByWallsRefusal;
};
const plan = (o: ReturnType<typeof planStairByWalls>): ByWallsPlan => {
    if (o.ok === false) throw new Error('expected a plan, got refusal: ' + o.message);
    return o;
};

describe('FEAT-STAIR-BY-WALLS -- the By Slab pattern, for stairs', () => {
    describe('REFUSALS -- every one states the value FOUND and the value REQUIRED', () => {
        it('refuses a selection that is not exactly two walls, with both counts', () => {
            const one = refusal(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            expect(one.code).toBe('WALL_COUNT');
            expect(one.found).toBe(1);
            expect(one.required).toBe(2);
            expect(one.unit).toBe('walls');
            expect(one.message).toContain('1 is selected');
            expect(one.message).toContain('2 are required');
            // ...and it names the trap that makes this refusal common: activating the
            // tool clears the selection, so the walls must be picked FIRST (L-1103).
            expect(one.message).toMatch(/clears the selection/i);

            const three = refusal(planStairByWalls({
                walls: [wall('a', 0, 0, 6, 0), wall('b', 0, 0, 0, 6), wall('c', 6, 0, 6, 6)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            expect(three.found).toBe(3);
            expect(three.required).toBe(2);
        });

        it('⭐ refuses NON-PERPENDICULAR walls stating the angle FOUND and the angle REQUIRED', () => {
            // 6 across, 3 up -> 26.57 deg off the X axis; against a wall on the Z axis
            // the two meet at 63.43 deg.
            const out = refusal(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 3), wall('w2', 0, 0, 0, 6)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            expect(out.code).toBe('NOT_PERPENDICULAR');
            expect(out.found).toBeCloseTo(63.43, 1);
            expect(out.required).toBe(90);
            expect(out.unit).toBe('degrees');
            // BOTH numbers in the prose, not just the machine fields.
            expect(out.message).toContain('63.43');
            expect(out.message).toContain('90');
            // ...and it says WHY, rather than only that it will not.
            expect(out.message).toMatch(/landing is a rectangle/i);
        });

        it('ACCEPTS a hand-drawn corner that is off 90 by less than the band', () => {
            // The band is a DOMAIN tolerance, not an epsilon: a wall drawn by hand is
            // never exactly 90, and refusing 89.5 would make By Walls useless outside
            // ortho mode. 3 deg off is inside; 6 deg is not.
            const inside = planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0), wall('w2', 0, 0, 0.31, 6)],   // ~2.96 deg off
                storeyHeight: 3, stairWidth: 1.2,
            });
            expect(inside.ok).toBe(true);

            const outside = refusal(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0), wall('w2', 0, 0, 0.64, 6)],   // ~6.08 deg off
                storeyHeight: 3, stairWidth: 1.2,
            }));
            expect(outside.code).toBe('NOT_PERPENDICULAR');
            expect(Math.abs(90 - outside.found)).toBeGreaterThan(BY_WALLS_PERPENDICULAR_TOLERANCE_DEG);
        });

        it('refuses two PERPENDICULAR walls that never meet, with the miss and the limit', () => {
            // Perpendicular as LINES, but at opposite ends of the room. Two walls that
            // cross only when extended to infinity are not a corner, and "perpendicular"
            // alone would have accepted them.
            const out = refusal(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0), wall('w2', 20, 3, 20, 9)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            expect(out.code).toBe('NO_SHARED_CORNER');
            expect(out.unit).toBe('metres');
            expect(out.required).toBe(BY_WALLS_CORNER_TOLERANCE_M);
            expect(out.found).toBeGreaterThan(BY_WALLS_CORNER_TOLERANCE_M);
            expect(out.message).toContain(String(out.found));
            expect(out.message).toContain(String(BY_WALLS_CORNER_TOLERANCE_M));
        });

        it('refuses walls too SHORT for the climb, quoting the wall available and the run needed', () => {
            const out = refusal(planStairByWalls({
                walls: [wall('w1', 0, 0, 1.6, 0), wall('w2', 0, 0, 0, 1.6)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            expect(out.code).toBe('RUN_TOO_SHORT');
            expect(out.unit).toBe('metres');
            expect(out.found).toBeLessThan(out.required);
            expect(out.message).toContain(String(out.found));
            expect(out.message).toContain(String(out.required));
            // The refusal shows its working: risers, goings and the minimum tread.
            expect(out.message).toMatch(/risers/);
            expect(out.message).toMatch(/mm minimum tread/);
        });
    });

    describe('THE PLAN -- geometry that follows from the walls, not from a picker', () => {
        it('puts the landing in the corner, offset off BOTH wall faces by half the width', () => {
            const p = plan(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0, 0.2), wall('w2', 0, 0, 0, 6, 0.2)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            // thickness/2 (0.1) + width/2 (0.6) = 0.7 off each face.
            expect(p.points[1].x).toBeCloseTo(0.7, 9);
            expect(p.points[1].z).toBeCloseTo(0.7, 9);
            // Run 1 travels along wall 1 (constant z), run 2 along wall 2 (constant x).
            expect(p.points[0].z).toBeCloseTo(0.7, 9);
            expect(p.points[2].x).toBeCloseTo(0.7, 9);
            expect(p.shape).toBe('L');
        });

        it('⭐ the second run SIDE is DERIVED from the corner, never asked of the architect', () => {
            // Against two walls there is exactly one quadrant the stair can occupy, so
            // offering a Left/Right choice would be a control that lies. Mirroring the
            // corner flips the handedness, which is the proof it is derived.
            const a = plan(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0), wall('w2', 0, 0, 0, 6)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            const b = plan(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0), wall('w2', 0, 0, 0, -6)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            expect(a.secondRunSide).not.toBe(b.secondRunSide);
        });

        it('is indifferent to the direction each wall was DRAWN in', () => {
            // A wall drawn "backwards" is the same wall. If the planner keyed on
            // baseLine order it would put the stair outside the building.
            const forward = plan(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0), wall('w2', 0, 0, 0, 6)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            const reversed = plan(planStairByWalls({
                walls: [wall('w1', 6, 0, 0, 0), wall('w2', 0, 6, 0, 0)],
                storeyHeight: 3, stairWidth: 1.2,
            }));
            expect(reversed.points[1].x).toBeCloseTo(forward.points[1].x, 9);
            expect(reversed.points[1].z).toBeCloseTo(forward.points[1].z, 9);
        });
    });

    describe('⭐ C84 EI-3 -- the plan produces a stair the COMMAND accepts', () => {
        it('feeding the planned points to the real tool dispatches a real CreateStairCommand', async () => {
            const p = plan(planStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0, 0.2), wall('w2', 0, 0, 0, 6, 0.2)],
                storeyHeight: 3, stairWidth: 1.2,
            }));

            const dispatched: unknown[] = [];
            const refusals: string[] = [];
            const canvas = document.createElement('canvas');
            document.body.appendChild(canvas);

            const ctrl = new StairPathToolController({
                container: document.body,
                coordinateCanvas: canvas,
                planViewCanvas: {
                    worldToScreen: (x: number, z: number) => ({ x, y: z }),
                    screenToWorld: (x: number, y: number) => ({ x, z: y }),
                } as never,
                commandManager: { execute: (c: unknown) => dispatched.push(c) },
                baseLevelId: 'L0',
                topLevelId: 'L1',
                baseLevelElevation: 0,
                topLevelElevation: 3,
                width: 1.2,
                initialShape: p.shape,
                onInvalid: (m: string) => refusals.push(m),
            });
            ctrl.activate();
            for (const pt of p.points) ctrl.feedClick(pt.x, pt.z);
            await new Promise((r) => setTimeout(r, 60));

            // ⛔ NOT "the planner returned points". The solver ran, the geometry limits
            // ran, and the command was built.
            expect(refusals).toEqual([]);
            expect(dispatched).toHaveLength(1);
            const input = (dispatched[0] as { input: { shape: string; flights: unknown[] } }).input;
            expect(input.shape).toBe('L');
            expect(input.flights).toHaveLength(2);

            ctrl.deactivate(); ctrl.destroy();
        });
    });
});
