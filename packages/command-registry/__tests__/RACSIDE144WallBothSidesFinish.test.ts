/**
 * §RACSIDE144 — "change finish of all west-facing walls to red paint (inner
 * and outer)". Founder's problem, verbatim: *"I have a problem — I want to
 * also change the INTERIOR wall finish, but this still would only change the
 * outer finish."*
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The grammar half (WallSideFinishIntent.ts) used to REFUSE outright the
 * moment BOTH an inner word and an outer word appeared in one sentence
 * (`if (hasInner && hasOuter) return null;`) — "inner and outer" stranded the
 * whole ask rather than doing what it plainly asked for. This file pins the
 * COMMAND half: `SetWallSideFinishBatchCommand.side` now accepts `'both'`,
 * applying it as TWO per-wall child writes (exterior then interior) while
 * staying exactly ONE `Command` instance on the history stack — one undo
 * entry reverts everything (C16 §8.6), never two commands.
 *
 * Store fake mirrors L1670SideFinishReadBack.test.ts / RACWALL128's (the
 * faithful arm — `sideFinishes` round-trips).
 */

import { describe, it, expect } from 'vitest';
import { SetWallSideFinishBatchCommand } from '../src/walls/SetWallSideFinishCommand';

const RED = { materialId: 'paint-oxide-red', materialColor: '#8e3b31', materialName: 'Paint · Oxide Red' };

interface FakeWall {
    id: string;
    levelId: string;
    layers: unknown[];
    baseLine: Array<{ x: number; y: number; z: number }>;
    openings: unknown[];
    sideFinishes?: { interior?: { materialId?: string }; exterior?: { materialId?: string } };
}

function makeStore(seed: Array<{ id: string; sideFinishes?: FakeWall['sideFinishes'] }>) {
    const map = new Map<string, FakeWall>();
    for (const s of seed) {
        map.set(s.id, {
            id: s.id,
            levelId: 'L0',
            layers: [{ thickness: 0.1, function: 'structure' }], // single-layer — the founder's default wall
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
            openings: [],
            ...(s.sideFinishes ? { sideFinishes: s.sideFinishes } : {}),
        });
    }
    return {
        getById: (id: string) => map.get(id),
        getAll: () => [...map.values()],
        updateWall: (next: FakeWall) => { map.set(next.id, { ...next }); },
        restoreSnapshot: (snap: FakeWall) => { map.set(snap.id, { ...snap }); },
        _map: map,
    };
}

const ctxFor = (store: ReturnType<typeof makeStore>) => ({ stores: { wallStore: store } }) as never;

describe("§RACSIDE144 — 'both' changes both faces, in ONE undo entry", () => {
    it('writes interior AND exterior on every in-scope wall — ONE command instance', () => {
        const store = makeStore([{ id: 'w0' }, { id: 'w1' }]);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: ['w0', 'w1'], side: 'both', finish: RED });
        const r = cmd.execute(ctxFor(store));

        expect(r.success).toBe(true);
        expect([...r.affectedElementIds].sort()).toEqual(['w0', 'w1']);
        expect(r.info?.[0]).toContain('interior and exterior finish');
        expect(r.info?.[0]).toContain('2 of 2 walls');
        for (const id of ['w0', 'w1']) {
            expect(store.getById(id)!.sideFinishes?.interior?.materialId).toBe('paint-oxide-red');
            expect(store.getById(id)!.sideFinishes?.exterior?.materialId).toBe('paint-oxide-red');
        }
    });

    it('an INTERIOR-only request provably leaves the exterior untouched', () => {
        const store = makeStore([{ id: 'w0' }]);
        new SetWallSideFinishBatchCommand({ wallIds: ['w0'], side: 'interior', finish: RED }).execute(ctxFor(store));
        expect(store.getById('w0')!.sideFinishes?.interior?.materialId).toBe('paint-oxide-red');
        expect(store.getById('w0')!.sideFinishes?.exterior).toBeUndefined();
    });

    it('an EXTERIOR-only request provably leaves the interior untouched', () => {
        const store = makeStore([{ id: 'w0' }]);
        new SetWallSideFinishBatchCommand({ wallIds: ['w0'], side: 'exterior', finish: RED }).execute(ctxFor(store));
        expect(store.getById('w0')!.sideFinishes?.exterior?.materialId).toBe('paint-oxide-red');
        expect(store.getById('w0')!.sideFinishes?.interior).toBeUndefined();
    });

    it('ONE undo() reverts BOTH sides — never two undo steps for one gesture (C16 §8.6)', () => {
        const store = makeStore([{ id: 'w0' }, { id: 'w1' }]);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: ['w0', 'w1'], side: 'both', finish: RED });
        cmd.execute(ctxFor(store));
        const u = cmd.undo(ctxFor(store));

        expect(u.success).toBe(true);
        for (const id of ['w0', 'w1']) {
            expect(store.getById(id)!.sideFinishes).toBeUndefined();
        }
    });

    it('a ZERO-match scope with BOTH requested is still a visible honest no-op, never silent', () => {
        const store = makeStore([]);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'both', finish: RED });
        const v = cmd.canExecute(ctxFor(store));
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('There are no walls in this project');
    });

    it('§L960-STEP3 — BOTH on a single-layer wall discloses the interior is masked, not silently', () => {
        const store = makeStore([{ id: 'w0' }]);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: ['w0'], side: 'both', finish: RED });
        const r = cmd.execute(ctxFor(store));

        // Both are SAVED — the write is real and undoable...
        expect(store.getById('w0')!.sideFinishes?.interior?.materialId).toBe('paint-oxide-red');
        expect(store.getById('w0')!.sideFinishes?.exterior?.materialId).toBe('paint-oxide-red');
        // ...but a 1-layer wall has ONE surface, so the disclosure must ride the
        // success sentence itself (never a separate line a UI might not render).
        expect(cmd.masked).toEqual([{ wallId: 'w0', maskedSide: 'interior' }]);
        expect(r.info?.[0]).toContain('⚠');
        expect(r.info?.[0]).toContain('will NOT show it');
    });

    it('a ROOM-scoped BOTH refuses only the INTERIOR half of a genuine partition — the exterior half still lands', () => {
        // 'w-shared' bounds 2 rooms (a true interior partition — BOTH its faces
        // are interior, and which one looks into the named room is
        // frontSide/backSide, never written in this build). `side: 'exterior'`
        // is never the shared face, so only the interior write may be refused.
        const store = makeStore([{ id: 'w-shared' }]);
        const cmd = new SetWallSideFinishBatchCommand({
            wallIds: ['w-shared'],
            side: 'both',
            finish: RED,
            roomBoundCounts: new Map([['w-shared', 2]]),
        });
        const r = cmd.execute(ctxFor(store));

        // The exterior write is NOT geometrically ambiguous — it lands.
        expect(store.getById('w-shared')!.sideFinishes?.exterior?.materialId).toBe('paint-oxide-red');
        // The interior write IS the ambiguous one, and it is refused BY NAME,
        // never guessed.
        expect(store.getById('w-shared')!.sideFinishes?.interior).toBeUndefined();
        expect(r.success, 'the exterior half landed, so the wall counts as affected').toBe(true);
        expect(r.affectedElementIds).toEqual(['w-shared']);
        const skipReason = r.info!.find((line) => line.includes('separates'));
        expect(skipReason, JSON.stringify(r.info)).toBeDefined();
    });

    it('canExecute() accepts a scope where only ONE side of ONE wall is viable (partial acceptance is not a total refusal)', () => {
        const store = makeStore([{ id: 'w-shared' }]);
        const cmd = new SetWallSideFinishBatchCommand({
            wallIds: ['w-shared'],
            side: 'both',
            finish: RED,
            roomBoundCounts: new Map([['w-shared', 2]]),
        });
        const v = cmd.canExecute(ctxFor(store));
        expect(v.ok, 'the exterior half is viable, so the batch may proceed').toBe(true);
        expect(v.warnings?.length ?? 0).toBeGreaterThan(0);
    });
});
