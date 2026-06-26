// §JOIN-SPIKE-GUARD / §CUT-SPIKE-GUARD regression.
//
// The founder reported wall Join producing a "spike": two walls of an L-plan
// shoot to a far-off point forming a sharp triangle. Root cause: JoinWallsCommand
// (and CutWallCommand) move/trim a wall's endpoint to the INFINITE line-line
// intersection — and for near-parallel walls that intersection is far away, so the
// endpoint jumps a huge distance. These tests assert the geometric guards reject
// such joins/cuts (no store mutation) while still allowing a genuine corner join.
//
// Pure data/validation tests (no THREE) — they drive execute()/canExecute()
// against a minimal in-memory wall store double.

import { describe, it, expect } from 'vitest';
import { JoinWallsCommand } from '../src/operations/JoinWallsCommand';
import { CutWallCommand } from '../src/operations/CutWallCommand';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };

interface FakeWall {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    openings: unknown[];
    childrenIds: string[];
    _renderVersion?: number;
}

function wall(id: string, a: [number, number], b: [number, number]): FakeWall {
    return {
        id,
        levelId: 'L0',
        baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        openings: [],
        childrenIds: [],
        _renderVersion: 0,
    };
}

/** Minimal wall store: getById + update (records the new baseLine). */
function makeCtx(walls: FakeWall[]): { ctx: CommandContext; updates: Map<string, [Pt, Pt]> } {
    const byId = new Map(walls.map(w => [w.id, w]));
    const updates = new Map<string, [Pt, Pt]>();
    const wallStore = {
        getById: (id: string) => byId.get(id),
        update: (id: string, patch: { baseLine?: [Pt, Pt] }) => {
            if (patch.baseLine) {
                updates.set(id, patch.baseLine);
                byId.get(id)!.baseLine = patch.baseLine;
            }
            return byId.get(id);
        },
        restoreSnapshot: () => {},
    };
    const ctx = { stores: { wallStore } } as unknown as CommandContext;
    return { ctx, updates };
}

describe('§JOIN-SPIKE-GUARD — JoinWallsCommand', () => {
    it('joins two walls that meet at a clear corner (near-meeting ends move to the corner)', () => {
        // A: along +X ending near (10,0); B: along +Z ending near (10,0). They form
        // an L whose corner is at (10,0,0). Nearest ends move a short way to it.
        const a = wall('a', [0, 0], [9.9, 0]);
        const b = wall('b', [10, 0.1], [10, 10]);
        const { ctx, updates } = makeCtx([a, b]);
        const res = new JoinWallsCommand({ wallAId: 'a', wallBId: 'b' }).execute(ctx);
        expect(res.success).toBe(true);
        // Both nearest endpoints land at the intersection (10,0).
        expect(updates.get('a')![1].x).toBeCloseTo(10, 5);
        expect(updates.get('a')![1].z).toBeCloseTo(0, 5);
        expect(updates.get('b')![0].x).toBeCloseTo(10, 5);
        expect(updates.get('b')![0].z).toBeCloseTo(0, 5);
    });

    it('REJECTS a near-parallel pair (far-off intersection ⇒ spike) without mutating', () => {
        // Two nearly-parallel horizontal walls — intersection is hundreds of metres
        // away. Moving an endpoint there is the spike the founder saw.
        const a = wall('a', [0, 0], [10, 0]);
        const b = wall('b', [0, 1], [10, 1.02]);   // ~0.001 rad off parallel
        const { ctx, updates } = makeCtx([a, b]);
        const res = new JoinWallsCommand({ wallAId: 'a', wallBId: 'b' }).execute(ctx);
        expect(res.success).toBe(false);
        expect(res.info?.[0]).toMatch(/parallel|far-off/i);
        expect(updates.size).toBe(0);              // no store mutation on reject
    });

    it('reports already-joined walls as a no-op rather than silently doing nothing', () => {
        // Both walls already share the corner (10,0) exactly.
        const a = wall('a', [0, 0], [10, 0]);
        const b = wall('b', [10, 0], [10, 10]);
        const { ctx, updates } = makeCtx([a, b]);
        const res = new JoinWallsCommand({ wallAId: 'a', wallBId: 'b' }).execute(ctx);
        expect(res.success).toBe(false);
        expect(res.info?.[0]).toMatch(/already joined/i);
        expect(updates.size).toBe(0);
    });

    it('canExecute rejects the spike case up front', () => {
        const a = wall('a', [0, 0], [10, 0]);
        const b = wall('b', [0, 1], [10, 1.02]);
        const { ctx } = makeCtx([a, b]);
        const v = new JoinWallsCommand({ wallAId: 'a', wallBId: 'b' }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toBe('JOIN_SPIKE');
    });
});

describe('§CUT-SPIKE-GUARD — CutWallCommand', () => {
    it('trims two walls that meet at a clear corner', () => {
        const a = wall('a', [0, 0], [12, 0]);
        const b = wall('b', [10, -2], [10, 10]);
        const { ctx, updates } = makeCtx([a, b]);
        const res = new CutWallCommand({
            wallAId: 'a', wallBId: 'b',
            keepPointA: { x: 0, y: 0, z: 0 },     // keep the left half of A → far end trims to (10,0)
            keepPointB: { x: 10, y: 0, z: 10 },   // keep the upper half of B → lower end trims to (10,0)
        }).execute(ctx);
        expect(res.success).toBe(true);
        expect(updates.get('a')![1].x).toBeCloseTo(10, 5);
    });

    it('REJECTS a near-parallel cut (trim would extend to a far-off point) without mutating', () => {
        const a = wall('a', [0, 0], [10, 0]);
        const b = wall('b', [0, 1], [10, 1.02]);
        const { ctx, updates } = makeCtx([a, b]);
        const res = new CutWallCommand({
            wallAId: 'a', wallBId: 'b',
            keepPointA: { x: 0, y: 0, z: 0 },
            keepPointB: { x: 0, y: 0, z: 1 },
        }).execute(ctx);
        expect(res.success).toBe(false);
        expect(res.info?.[0]).toMatch(/parallel|far-off/i);
        expect(updates.size).toBe(0);
    });
});
