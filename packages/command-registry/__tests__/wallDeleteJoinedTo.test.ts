// ADR-0321 / C71 §3.6 — `joinedTo` delete behaviour is INHERITED from the
// wall-family cascade purge (commit 3ee632f6): DeleteElementCommand captures
// getRelationships() verbatim, purges via removeAllRelationshipsForElement,
// and restores verbatim on undo. That mechanism is type-blind, so it must
// cover the NEW `joinedTo` family too — this file is the proof, per ADR-0320
// rule 4 (a new type lands with its delete behaviour verified, not assumed).
//
// Harness mirrors wallDeleteLeavesGraphEdges.test.ts (same real
// semanticGraphManager singleton, same wallStore double), trimmed to the
// no-openings wall branch — joinedTo needs no hosted children to exist.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import type { CommandContext } from '../src/types';

interface FakeWall {
    id: string; type: 'wall'; levelId: string;
    baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    height: number; thickness: number; openings: never[]; childrenIds: string[];
}

function makeWall(id: string, x0: number, x1: number): FakeWall {
    return {
        id, type: 'wall', levelId: 'L0',
        baseLine: [{ x: x0, y: 0, z: 0 }, { x: x1, y: 0, z: 0 }],
        height: 2.4, thickness: 0.2, openings: [], childrenIds: [],
    };
}

function makeCtx(walls: FakeWall[]) {
    const byId = new Map(walls.map(w => [w.id, w]));
    const wallStore = {
        getById: (id: string) => byId.get(id),
        getAll: () => [...byId.values()],
        add: (w: any) => { byId.set(w.id, w); },
        remove: (id: string) => { byId.delete(id); },
        update: (id: string, patch: any) => { const w = byId.get(id); if (w) Object.assign(w, patch); },
        getWindow: () => undefined,
        getDoor: () => undefined,
        removeWindow: () => {},
        removeDoor: () => {},
        addWindow: () => {},
        addDoor: () => {},
        restoreOpening: () => {},
        removeOpening: () => {},
    };
    return { ctx: { stores: { wallStore }, bimManager: {} } as unknown as CommandContext };
}

const W1 = 'jt-wall-1';
const W2 = 'jt-wall-2';

function seedJoinedTo() {
    // Exactly what the flush writer emits: both directions, junction metadata,
    // createdBy 'system', NO junction record id (C71 §3.5).
    const metadata = { junctionType: 'L', junctionDegree: 2 };
    semanticGraphManager.addRelationship({ type: 'joinedTo', sourceId: W1, targetId: W2, metadata, createdBy: 'system' });
    semanticGraphManager.addRelationship({ type: 'joinedTo', sourceId: W2, targetId: W1, metadata, createdBy: 'system' });
}

beforeEach(() => {
    for (const id of [W1, W2]) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES × ADR-0321 — the cascade purges joinedTo and undo restores it verbatim', () => {
    it('(c) delete a wall → NO joinedTo edge references it (either direction, either endpoint)', () => {
        const { ctx } = makeCtx([makeWall(W1, 0, 4), makeWall(W2, 4, 8)]);
        seedJoinedTo();
        expect(semanticGraphManager.getRelationships(W1, 'joinedTo')).toHaveLength(2);

        const cmd = new DeleteElementCommand(W1);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        expect(semanticGraphManager.getAll().some(
            r => r.type === 'joinedTo' && (r.sourceId === W1 || r.targetId === W1),
        )).toBe(false);
        // The survivor holds no dangling edge either — both directions referenced W1.
        expect(semanticGraphManager.getRelationships(W2, 'joinedTo')).toHaveLength(0);
    });

    it('(c2) undo restores BOTH directions verbatim — metadata and createdBy intact', () => {
        const { ctx } = makeCtx([makeWall(W1, 0, 4), makeWall(W2, 4, 8)]);
        seedJoinedTo();

        const cmd = new DeleteElementCommand(W1);
        cmd.execute(ctx);
        expect(semanticGraphManager.getRelationships(W1, 'joinedTo')).toHaveLength(0);

        cmd.undo(ctx);

        const edges = semanticGraphManager.getRelationships(W1, 'joinedTo');
        expect(edges).toHaveLength(2);
        expect(edges.some(r => r.sourceId === W1 && r.targetId === W2)).toBe(true);
        expect(edges.some(r => r.sourceId === W2 && r.targetId === W1)).toBe(true);
        for (const r of edges) {
            expect(r.metadata).toMatchObject({ junctionType: 'L', junctionDegree: 2 });
            expect(r.createdBy).toBe('system');
        }
    });

    it('redo purges again, second undo restores again — exactly 2 edges, not 4 (idempotency)', () => {
        const { ctx } = makeCtx([makeWall(W1, 0, 4), makeWall(W2, 4, 8)]);
        seedJoinedTo();

        const cmd = new DeleteElementCommand(W1);
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        expect(semanticGraphManager.getRelationships(W1, 'joinedTo')).toHaveLength(0);
        cmd.undo(ctx);
        expect(semanticGraphManager.getRelationships(W1, 'joinedTo')).toHaveLength(2);
    });
});
