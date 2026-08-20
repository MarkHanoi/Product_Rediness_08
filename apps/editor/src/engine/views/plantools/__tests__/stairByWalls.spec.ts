import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { StairPathToolController } from '@pryzm/geometry-stair';
import { DrawingModeBar } from '@app/ui/DrawingModeBar';
import { creationModes } from '../elementCreationMatrix';
import {
    planStairByWalls,
    executeStairByWalls,
    consumePendingStairByWallsPlan,
    __resetStairByWallsForTests,
    ByWallsPickSession,
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

    describe('⭐ THE ARM (L-1456) -- two SEQUENTIAL picks, which need no multi-select API', () => {
        // This lane first WITHHELD the pill, measuring that "there is no multi-select
        // id accessor": selectionManager.selectedObject is singular and
        // `grep selectedElementIds` over apps/ + packages/ returns ONE hit, in a Zod
        // schema. Both facts are true -- and they block the SNAPSHOT route ("read the
        // two walls already selected"), not the PICK route. `_pickSlabThen` already
        // picks ONE object SEQUENTIALLY AFTER activation; two picks are its two-step
        // case. A true measurement can still be the wrong measurement.
        it('collects two DISTINCT walls, in click order', () => {
            const s = new ByWallsPickSession(2);
            expect(s.remaining).toBe(2);
            expect(s.offer('w-a', 'Wall')).toBe('accepted');     // capital W: C15 §12
            expect(s.remaining).toBe(1);
            expect(s.offer('w-b', 'wall')).toBe('complete');
            expect(s.isComplete).toBe(true);
            expect(s.ids).toEqual(['w-a', 'w-b']);
        });

        it('⭐ rejects the SAME wall clicked twice -- the count must mean two DISTINCT walls', () => {
            // `bim-selection-changed` re-fires on re-selection. Without this, one wall
            // would fill both slots and planStairByWalls would refuse it paired with
            // ITSELF as NOT_PERPENDICULAR at 0 degrees -- a refusal that is true and
            // completely misleading, because the architect picked one wall, not two
            // crooked ones.
            const s = new ByWallsPickSession(2);
            expect(s.offer('w-a', 'wall')).toBe('accepted');
            expect(s.offer('w-a', 'wall')).toBe('duplicate');
            expect(s.remaining).toBe(1);       // NOT advanced
            expect(s.isComplete).toBe(false);
        });

        it('ignores clicks on anything that is not a wall, and on ids that are missing', () => {
            const s = new ByWallsPickSession(2);
            expect(s.offer('s-1', 'slab')).toBe('ignored');
            expect(s.offer(undefined, 'wall')).toBe('ignored');
            expect(s.remaining).toBe(2);
        });

        it('the ONE-WALL case still completes on the first valid pick (wall/railing By Slab)', () => {
            // The N-step helper this drives replaced `_pickSlabThen`'s body, and wall's
            // and railing's By Slab are flows the founder is happy with (L-1103/L-1104).
            // count === 1 must complete on the first valid pick, exactly as before.
            const w = new ByWallsPickSession(1);
            expect(w.offer('w-a', 'wall')).toBe('complete');
            expect(w.ids).toEqual(['w-a']);
            expect(w.offer('w-b', 'wall')).toBe('ignored');   // closed after completion
        });
    });

    describe('THE HANDOFF -- one-shot, and cleared by a refusal', () => {
        beforeEach(() => __resetStairByWallsForTests());

        it('a successful execute ARMS a plan, and consuming it CLEARS it', () => {
            const r = executeStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0), wall('w2', 0, 0, 0, 6)],
                storeyHeight: 3, stairWidth: 1.2,
            });
            expect(r.ok).toBe(true);
            const armed = consumePendingStairByWallsPlan();
            expect(armed?.shape).toBe('L');
            // ⭐ ONE-SHOT. A plan left standing would re-draw a stair the next time the
            // tool activated for ANY reason -- a By-Walls click echoing into an
            // unrelated hand-drawn stair ten minutes later.
            expect(consumePendingStairByWallsPlan()).toBeNull();
        });

        it('⭐ a REFUSED execute leaves NO plan armed, even after an earlier success', () => {
            executeStairByWalls({
                walls: [wall('w1', 0, 0, 6, 0), wall('w2', 0, 0, 0, 6)],
                storeyHeight: 3, stairWidth: 1.2,
            });
            const bad = executeStairByWalls({
                walls: [wall('w1', 0, 0, 6, 3), wall('w2', 0, 0, 0, 6)],   // 63.43 deg
                storeyHeight: 3, stairWidth: 1.2,
            });
            expect(bad.ok).toBe(false);
            if (bad.ok === false) expect(bad.code).toBe('NOT_PERPENDICULAR');
            // The stale plan from the first call must be GONE. Otherwise a refusal
            // would be followed by the tool silently drawing the PREVIOUS stair --
            // the worst possible outcome for a gate that just said no.
            expect(consumePendingStairByWallsPlan()).toBeNull();
        });
    });

    describe('THE PILL -- declared on the strip, in the same commit as the arm', () => {
        it('By Walls is an ACTION: it fires and never takes the active highlight', () => {
            document.body.innerHTML = '';
            const bar = new DrawingModeBar();
            const picked: string[] = [];
            bar.show({
                label: 'Mode:', modes: creationModes('stair-path'),
                initialMode: 'ortho', onSelect: (id) => picked.push(id),
            });
            const pills = Array.from(document.querySelectorAll<HTMLButtonElement>('.wdh-bar .wdh-btn'));
            expect(pills.map((b) => b.dataset.mode)).toEqual(['linear', 'ortho', 'bywall']);

            const byWalls = pills.find((b) => b.dataset.mode === 'bywall')!;
            byWalls.click();
            expect(picked).toEqual(['bywall']);
            // The highlight did NOT move -- writing an action to the mode store would
            // leave every later click retrying by-walls while the bar said Ortho
            // (L-956's shape).
            const active = pills.filter((b) => b.classList.contains('wdh-btn--active')).map((b) => b.dataset.mode);
            expect(active).toEqual(['ortho']);
            // ...and it sits after the separator, as every By-* action does.
            expect(document.querySelector('.wdh-sep')).not.toBeNull();
            bar.dismiss();
        });
    });

    describe('⭐ END TO END -- pick, plan, arm, replay, command', () => {
        it('the armed plan replayed as clicks produces a real CreateStairCommand', async () => {
            __resetStairByWallsForTests();

            // 1. Two sequential picks.
            const session = new ByWallsPickSession(2);
            session.offer('w1', 'Wall');
            session.offer('w2', 'Wall');
            expect(session.isComplete).toBe(true);

            // 2. The action plans and arms.
            const store: Record<string, ByWallsWall> = {
                w1: wall('w1', 0, 0, 6, 0, 0.2),
                w2: wall('w2', 0, 0, 0, 6, 0.2),
            };
            const exec = executeStairByWalls({
                walls: session.ids.map((id) => store[id]!),
                storeyHeight: 3, stairWidth: 1.2,
            });
            expect(exec.ok).toBe(true);

            // 3. The tool activates and replays -- byte-for-byte what
            //    `StairPathPlanToolHandler._activate` now does.
            const armed = consumePendingStairByWallsPlan()!;
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
                baseLevelId: 'L0', topLevelId: 'L1',
                baseLevelElevation: 0, topLevelElevation: 3,
                width: 1.2,
                initialShape: armed.shape,
                onInvalid: (m: string) => refusals.push(m),
            });
            ctrl.activate();
            for (const pt of armed.points) ctrl.feedClick(pt.x, pt.z);
            await new Promise((r) => setTimeout(r, 60));

            expect(refusals).toEqual([]);
            expect(dispatched).toHaveLength(1);
            const input = (dispatched[0] as { input: { shape: string; flights: unknown[] } }).input;
            expect(input.shape).toBe('L');
            expect(input.flights).toHaveLength(2);
            ctrl.deactivate(); ctrl.destroy();
        });
    });
});
