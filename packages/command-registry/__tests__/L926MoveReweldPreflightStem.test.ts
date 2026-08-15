/**
 * §L-926 REACH — does the weld-authorship fix actually get to the founder?
 *
 * `bea6e819` restored the T-stem follow inside `computeMoveReweldPlan`. That is
 * necessary and not sufficient: on the real move path the engine is consulted
 * TWICE, and the second consultation is a GATE. `previewMoveReweld` runs BEFORE
 * the baseline is committed (§L-921-ATOMIC-GESTURE) and its `allowed:false`
 * stops the gesture outright. An engine that follows stems behind a pre-flight
 * that refuses them is authored-but-unreachable — the failure mode this repo
 * keeps paying for, and one an engine-level suite cannot see.
 *
 * So this file measures the FOUNDER'S OWN GESTURE at the gate, on the same
 * fixture the acceptance suite uses: a 12 × 8 m rectangle, full-width partition
 * P at z=4, interior stem T on P's body at x=6, P moved 0.773 m south.
 *
 * MEASURED AT `094acd33`, BEFORE the pre-flight was touched — TWO independent
 * refusals, either one of which alone blocks the move:
 *   1. `previewMoveReweld` called `computeMoveReweldPlan` WITHOUT the host
 *      thickness, so no authorship band could be derived, so T was judged a
 *      corner incumbent: `allowed:false`, `incumbentBreach:true`,
 *      `reason:'INCUMBENT_EXTENSION_REQUIRED'`, `maxIncumbentShiftMm:773`.
 *   2. Even with the thickness supplied, the §10.2.2 incumbent arm counted
 *      EVERY non-subject entry as a breach — including the legitimate stem —
 *      so `incumbentBreach` stayed true and `allowed` stayed false.
 * Both are closed now, and both are asserted below so neither can come back
 * alone.
 *
 * @file packages/command-registry/__tests__/L926MoveReweldPreflightStem.test.ts
 */

import { describe, it, expect } from 'vitest';
import type { WallData } from '@pryzm/geometry-wall';
import { previewMoveReweld, type PreflightWallStoreRef } from '../src/walls/moveReweldPreflight';

const LEVEL = 'L0';
const T_WALL = 0.2;

let seq = 0;
function wall(id: string, a: [number, number], b: [number, number]): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        _sourceBaseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        height: 3, thickness: T_WALL, baseOffset: 0, openings: [],
        metadata: { createdAt: ++seq },
    } as unknown as WallData;
}

/** The founder's shape, as it stands BEFORE the gesture. */
function fixture(): { store: PreflightWallStoreRef; walls: WallData[] } {
    const walls = [
        wall('W', [0, 0], [0, 8]),
        wall('E', [12, 0], [12, 8]),
        wall('S', [0, 0], [12, 0]),
        wall('N', [0, 8], [12, 8]),
        wall('P', [0, 4], [12, 4]),   // the SUBJECT
        wall('T', [6, 4], [6, 8]),    // the DEPENDENT — terminates on P's body
    ];
    const store: PreflightWallStoreRef = {
        getById: (id) => walls.find(w => w.id === id),
        getAll: () => walls,
        getByLevel: () => walls,
    };
    return { store, walls };
}

const MOVE = {
    prev: [{ x: 0, y: 0, z: 4 }, { x: 12, y: 0, z: 4 }] as const,
    next: [{ x: 0, y: 0, z: 3.227 }, { x: 12, y: 0, z: 3.227 }] as const,
};

describe('§L-926-REACH — the pre-flight lets the founder\'s gesture through', () => {
    it('ALLOWS the move, and plans the stem to follow', () => {
        const { store } = fixture();
        const r = previewMoveReweld({
            wallStore: store,
            wallId: 'P',
            prevBaseLine: MOVE.prev as unknown as readonly [never, never],
            newBaseLine: MOVE.next as unknown as readonly [never, never],
            joinedWallIds: ['W', 'E', 'S', 'N', 'T'],
        });

        // AT `094acd33`: allowed=false, incumbentBreach=true, 773 mm.
        expect(r.allowed).toBe(true);
        expect(r.incumbentBreach).toBe(false);
        expect(r.maxIncumbentShiftMm).toBe(0);
        expect(r.incumbentWallIds).toEqual([]);

        // The stem is planned, and it is the ONLY non-subject wall in the plan.
        expect(r.entries.map(e => e.wallId)).toEqual(['T']);
        expect(r.entries[0]!.newBaseLine[0].z).toBeCloseTo(3.227, 9);
        expect(r.entries[0]!.newBaseLine[1].z).toBeCloseTo(8, 9);
    });

    it('a CORNER incumbent is still refused — the L-922 gate did not move', () => {
        // B moves 1 m east; A's endpoint sits AT B's old endpoint (a corner),
        // and the new corner falls 1 m past A's far end. Lengthening A is
        // forbidden, so the gate must still refuse with its number.
        const walls = [wall('A', [0, 0], [5, 0]), wall('B', [5, 0], [5, 5])];
        const store: PreflightWallStoreRef = {
            getById: (id) => walls.find(w => w.id === id),
            getAll: () => walls,
            getByLevel: () => walls,
        };
        const r = previewMoveReweld({
            wallStore: store,
            wallId: 'B',
            prevBaseLine: [{ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }] as unknown as readonly [never, never],
            newBaseLine: [{ x: 6, y: 0, z: 0 }, { x: 6, y: 0, z: 5 }] as unknown as readonly [never, never],
            joinedWallIds: ['A'],
        });
        expect(r.allowed).toBe(false);
        expect(r.incumbentBreach).toBe(true);
        expect(r.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
        expect(r.maxIncumbentShiftMm).toBe(1000);
    });
});
