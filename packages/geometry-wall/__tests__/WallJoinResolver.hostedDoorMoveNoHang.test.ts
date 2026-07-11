/**
 * L-234 §FIX-WALL-MOVE-HOSTED-DOOR-FREEZE regression — moving a wall that HOSTS a
 * door must never hang the resolve/rebuild pass.
 *
 * Founder (RECURRENT): "Moving a wall with a hosted door freezes the project, but
 * the logs don't seem to say much." The trigger captured in prod:
 *
 *   [WallTransform] Wall "wall_…" — gizmo aligned with direction N {x:-1, y:0, z:1.157…e-16}
 *   [CommandManager] EXECUTE: UPDATE_WALL_BASELINE
 *   …then the tab freezes with no further output.
 *
 * MEASURE-FIRST findings this suite pins (see the L-234 report):
 *
 *  1. The `z ≈ 1.16e-16` in the trigger is NOT a degenerate baseline — it is the
 *     float-noise `z` of a NORMALISED wall-direction unit vector (the wall runs
 *     along −X). The "gizmo aligned with direction" line is emitted by
 *     WallTransformController.activateFor on SELECTION, so it reports the wall's
 *     own axis, not the move delta. A full-length wall whose direction carries
 *     ~1e-16 float noise must be treated as an ordinary wall — never flagged
 *     degenerate/invalid. (a) below asserts exactly that.
 *
 *  2. A 3D-gizmo wall MOVE is a pure TRANSLATION: both endpoints shift by the same
 *     (dx,dz) (registerTransformDragHandler:148-149), so the moved baseline keeps
 *     its direction. The endpoint-reversal / BaselineReversalError swap path in
 *     UpdateWallBaselineCommand is therefore NOT taken on a move — ruling out the
 *     "dot ≈ 0 oscillation" hypothesis for this trigger.
 *
 *  3. `WallJoinResolver.resolveLevel` — the one whole-level synchronous span a move
 *     funnels through — TERMINATES and returns finite geometry on the hosted-door
 *     move, and is IDEMPOTENT (a fixed point: re-running on its own output does not
 *     oscillate). There is no unbounded loop or NaN vector on this path; the
 *     degenerate/NaN classes are already caught by §WJR-NAN-GUARD /
 *     §RESOLVED-STUB-SWEEP / the WallFragmentBuilder consumer guard.
 *
 * These are permanent guards: if a future change reintroduces a non-terminating or
 * non-finite result on a hosted-door wall move, this suite fails loudly rather than
 * shipping a silent frozen tab.
 */

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData, Opening } from '../src/WallTypes';

let _seq = 0;

function door(offset: number): Opening {
    return {
        id: `op_${_seq}`,
        type: 'door',
        elementId: `door_${_seq}`,
        offset,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
    } as Opening;
}

function wall(
    start: [number, number],
    end: [number, number],
    thickness: number,
    openings: Opening[] = [],
): WallData {
    const id = `wall_${_seq++}`;
    return {
        id,
        type: 'wall',
        levelId: 'level-0',
        properties: {},
        childrenIds: openings.map(o => o.elementId).filter(Boolean) as string[],
        baseLine: [
            { x: start[0], y: 0, z: start[1] },
            { x: end[0], y: 0, z: end[1] },
        ],
        height: 3,
        thickness,
        baseOffset: 0,
        openings,
    } as WallData;
}

/** Translate a wall's baseline by (dx,dz) — the exact 3D-gizmo move transform. */
function translate(w: WallData, dx: number, dz: number): WallData {
    return {
        ...w,
        baseLine: [
            { x: w.baseLine[0].x + dx, y: w.baseLine[0].y, z: w.baseLine[0].z + dz },
            { x: w.baseLine[1].x + dx, y: w.baseLine[1].y, z: w.baseLine[1].z + dz },
        ],
    } as WallData;
}

function allFinite(bl: { x: number; y: number; z: number }[]): boolean {
    return bl.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}

describe('WallJoinResolver — L-234 hosted-door wall MOVE never hangs (§FIX-WALL-MOVE-HOSTED-DOOR-FREEZE)', () => {
    it('(a) a full-length host wall whose direction carries ~1e-16 float noise (the trigger) is NOT flagged degenerate', () => {
        _seq = 0;
        // A 5 m host wall running along −X with the EXACT float-noise z of a
        // normalised unit direction from the founder's log — i.e. a perfectly
        // ordinary wall, not a degenerate one. It hosts a door near its middle.
        const zNoise = 1.157487755090348e-16 * 5; // endpoint offset for a unit dir over a 5 m span
        const host = wall([5, 0], [0, zNoise], 0.2, [door(2.5)]);
        // A perpendicular neighbour forming a corner at the host's (5,0) end.
        const perp = wall([5, 0], [5, 5], 0.2);

        let result: Map<string, any> | undefined;
        expect(() => { result = WallJoinResolver.resolveLevel([host, perp]) as any; }).not.toThrow();
        expect(result).toBeDefined();

        const hostAdj = (result as any).get(host.id);
        expect(hostAdj).toBeDefined();
        // The float-noise direction must NOT be read as a degeneracy: a 5 m wall
        // stays a valid, buildable wall.
        expect(hostAdj.invalid).toBeFalsy();
        expect(allFinite(hostAdj.baseLine)).toBe(true);
        const [s, e] = hostAdj.baseLine;
        expect(s.distanceTo(e)).toBeGreaterThan(4.5);
    });

    it('(b) TRANSLATING a hosted-door host wall terminates, stays finite, and is not dropped', () => {
        _seq = 0;
        // T-junction: a long shell, a perpendicular partition butting its body, and
        // a hosted-door wall corner-joined at one end — the dense case a whole-level
        // resolve touches on a move.
        const shell = wall([0, 0], [10, 0], 0.2);
        const partition = wall([4, 0], [4, 4], 0.1);
        const host = wall([10, 0], [10, 4], 0.2, [door(2.0)]);

        // Baseline resolve of the un-moved level (proves the fixture is well-formed).
        expect(() => WallJoinResolver.resolveLevel([shell, partition, host])).not.toThrow();

        // Now MOVE (pure translation) the hosted-door wall by (+0.3, 0) — the exact
        // gizmo-move transform, the (dx,dz) from registerTransformDragHandler. This
        // slides it off the corner into a near-parallel / offset relationship with
        // the shell end — the geometry that used to feed the extruder/CSG a spike.
        const movedHost = translate(host, 0.3, 0);
        let result: Map<string, any> | undefined;
        expect(() => { result = WallJoinResolver.resolveLevel([shell, partition, movedHost]) as any; }).not.toThrow();
        expect(result).toBeDefined();

        // Every resolved wall is finite and either usable (>= 0.15 m) or explicitly
        // flagged invalid — NOTHING ships a NaN or an unguarded degenerate baseline
        // (the §PARITY-GATE invariant, applied to the moved-host level).
        for (const [, adj] of result as any) {
            expect(allFinite(adj.baseLine)).toBe(true);
            const [s, e] = adj.baseLine;
            const len = s.distanceTo(e);
            expect(len < 1e-3 || len >= 0.15 || adj.invalid === true).toBe(true);
        }

        // The moved host is a full 4 m wall — it must survive the move, not be dropped.
        const hostAdj = (result as any).get(movedHost.id);
        expect(hostAdj).toBeDefined();
        expect(hostAdj.invalid).toBeFalsy();
        expect(hostAdj.baseLine[0].distanceTo(hostAdj.baseLine[1])).toBeGreaterThan(3.5);
    });

    it('(c) resolveLevel is a FIXED POINT on the moved geometry — feeding its own output back does not oscillate (no per-frame re-arm)', () => {
        _seq = 0;
        // The coordinator commits the resolved baselines back to the store and may
        // re-flush; a non-idempotent resolve would re-dirty the level every frame
        // (the silent freeze). Prove convergence: apply the resolved baselines and
        // re-run — the second pass must produce byte-stable (sub-µm) baselines.
        const shell = wall([0, 0], [10, 0], 0.2);
        const host = wall([10, 0], [10, 4], 0.2, [door(2.0)]);
        const movedHost = translate(host, 0.3, 0.0);

        const r1 = WallJoinResolver.resolveLevel([shell, movedHost]) as any;

        // Fold r1's resolved baselines back onto the walls (what the store commit does).
        const apply = (w: WallData): WallData => {
            const adj = r1.get(w.id);
            if (!adj) return w;
            return {
                ...w,
                baseLine: [
                    { x: adj.baseLine[0].x, y: adj.baseLine[0].y, z: adj.baseLine[0].z },
                    { x: adj.baseLine[1].x, y: adj.baseLine[1].y, z: adj.baseLine[1].z },
                ],
            } as WallData;
        };
        const r2 = WallJoinResolver.resolveLevel([apply(shell), apply(movedHost)]) as any;

        for (const id of [shell.id, movedHost.id]) {
            const a1 = r1.get(id);
            const a2 = r2.get(id);
            expect(a1).toBeDefined();
            expect(a2).toBeDefined();
            // Idempotent: the second resolve must not move the baseline (a fixed point).
            for (let k = 0; k < 2; k++) {
                expect(a2.baseLine[k].x).toBeCloseTo(a1.baseLine[k].x, 6);
                expect(a2.baseLine[k].z).toBeCloseTo(a1.baseLine[k].z, 6);
            }
            // And the invalid classification is stable — never flips (which would re-dirty).
            expect(!!a2.invalid).toBe(!!a1.invalid);
        }
    });
});
