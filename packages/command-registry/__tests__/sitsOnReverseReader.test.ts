// §SITSON-REVERSE-READER — C71 §2.1 #5 / §2.5 / §1.2 semantics 2, 5, 6.
//
// `sitsOn` was the widest write-only family in the estate: eighteen writers
// across every element kind, ZERO typed readers. C71 §0 names it as THE defect
// the contract was written about — "a writer census alone graded it healthy. It
// was not." The gap was never the writer.
//
// C71 §2.5 is binding: a reader must be added because a real CONSUMER needs it,
// never to satisfy a gate. THE CONSUMER IS `DeleteLevelCommand.canExecute`.
//
// WHY THAT CONSUMER IS GENUINE, and not a call site invented for the ratchet:
// the guard already asks exactly this question — "does anything sit on this
// level?" — and answers it from `level.childrenIds`. That index is populated
// ONLY by `bimManager.registerElement` at creation time, and NOTHING repopulates
// it on load: neither `ProjectLoader` re-registers elements after deserialize.
// The `sitsOn` edge set has the opposite disposition — it is written live by
// every creation command AND reconstructed from each element's authoritative
// `levelId` by `rebuildSemanticGraphFromSnapshot`. So on a reloaded project the
// graph knows what sits on the level and `childrenIds` does not, and the guard
// admits a delete that strands every element on the level.
//
// Test (c) is the one that matters: it reproduces the reloaded-project state
// (edges present, `childrenIds` empty) and proves the guard now REFUSES where it
// previously passed. Tests (a)/(b) prove the reader itself, (d)/(e) prove C71
// §1.2 semantics 6 (deletion) and 5 (move-invalidation), and (f) proves C71 §4.4
// — a refusal is never silently converted into a pass.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager, SemanticGraphManager } from '@pryzm/core-app-model';
import { DeleteLevelCommand } from '../src/levels/DeleteLevelCommand';
import type { CommandContext } from '../src/types';

const L0 = 'L0';
const L1 = 'L1';
const SLAB = 'slab-1';
const COLUMN = 'column-1';

/** Exactly what CreateSlabCommand / CreateColumnCommand write, per element. */
function seedSitsOn(elementId: string, levelId: string, by: string): void {
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: elementId, targetId: levelId,
        createdBy: by, metadata: { addedBy: by },
    });
}

/**
 * A context whose levels have EMPTY `childrenIds` — the reloaded-project state.
 * `bimManager.registerElement` never ran in this session, so the side index is
 * empty while the graph (rebuilt from the snapshot) is populated.
 */
function makeCtx(levelChildren: Record<string, string[]>): CommandContext {
    const levels = new Map<string, any>();
    for (const [id, childrenIds] of Object.entries(levelChildren)) {
        levels.set(id, { id, name: id, elevation: 0, childrenIds: [...childrenIds] });
    }
    return {
        bimManager: {
            getLevelById: (id: string) => levels.get(id),
            getLevels: () => [...levels.values()],
            removeLevel: (id: string) => { levels.delete(id); },
            addLevel: (l: any) => { levels.set(l.id, l); },
            registerElement: () => {},
            unregisterElement: () => {},
        },
        projectContext: { activeLevelId: L0, setActiveLevel: () => {} },
        stores: {},
    } as unknown as CommandContext;
}

beforeEach(() => {
    semanticGraphManager.clear();
});

describe('sitsOn — the typed REVERSE reader (getElementsSittingOn)', () => {
    it('(a) returns the elements sitting on a level, from the edges the creation commands write', () => {
        seedSitsOn(SLAB, L0, 'CreateSlabCommand');
        seedSitsOn(COLUMN, L0, 'CreateColumnCommand');
        seedSitsOn('roof-1', L1, 'CreateRoofCommand');

        const q = semanticGraphManager.getElementsSittingOn(L0);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect([...q.elementIds].sort()).toEqual([COLUMN, SLAB]);

        // Direction matters: the reader must not answer the FORWARD question.
        // `sitsOn` is element → level, so asking the slab returns nothing.
        const fwd = semanticGraphManager.getElementsSittingOn(SLAB);
        expect(fwd.ok).toBe(true);
        if (!fwd.ok) throw new Error('unreachable');
        expect(fwd.elementIds).toEqual([]);
    });

    it('(b) C71 §4.4 — an id the sitsOn writers never covered REFUSES; it does not return []', () => {
        const q = semanticGraphManager.getElementsSittingOn('never-seen');
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('level-unknown-to-sitsOn-writers');
        expect(q.detail).toContain('NO ANSWER');
    });

    it('(b2) a level KNOWN to the graph but with nothing on it is a positive EMPTY, not a refusal', () => {
        // L1 is an endpoint of a circulation edge but carries no sitsOn source.
        semanticGraphManager.addRelationship({
            type: 'connectedByStair', sourceId: L0, targetId: L1,
            authoredBy: 'stair-1', createdBy: 'CreateStairCommand',
        });
        const q = semanticGraphManager.getElementsSittingOn(L1);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.elementIds).toEqual([]);
    });
});

describe('sitsOn — REACHABILITY through the production consumer', () => {
    it('(c) THE TEST THAT MATTERS — DeleteLevelCommand.canExecute REFUSES a reloaded level whose childrenIds is empty but whose sitsOn edges are not', () => {
        // The reloaded-project state: rebuildSemanticGraphFromSnapshot has
        // reconstructed sitsOn from each element's authoritative levelId, but
        // no ProjectLoader re-registers elements into level.childrenIds.
        seedSitsOn(SLAB, L0, 'CreateSlabCommand');
        seedSitsOn(COLUMN, L0, 'CreateColumnCommand');

        const ctx = makeCtx({ [L0]: [], [L1]: [] });
        const cmd = new DeleteLevelCommand({ levelId: L0 });
        const verdict = cmd.canExecute(ctx);

        // BEFORE this reader existed, childrenIds.length === 0 and the guard
        // returned { ok: true } — the level deleted cleanly and stranded two
        // elements. The graph is now the second arm of the same guard.
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toContain('2 element(s) sitting on it');
        expect(verdict.reason).toContain('sitsOn');
    });

    it('(c2) the reader is not merely registered — removing the edges makes the SAME call pass', () => {
        seedSitsOn(SLAB, L0, 'CreateSlabCommand');
        const ctx = makeCtx({ [L0]: [], [L1]: [] });
        const cmd = new DeleteLevelCommand({ levelId: L0 });

        expect(cmd.canExecute(ctx).ok).toBe(false);

        // The user does what the refusal asked: deletes the element. Its delete
        // path purges its edges (the type-agnostic cascade).
        semanticGraphManager.removeAllRelationshipsForElement(SLAB);

        expect(cmd.canExecute(ctx).ok).toBe(true);
    });

    it('(c3) C71 §4.4 — a REFUSAL from the reader never becomes the reason a destructive command proceeds', () => {
        // Nothing in the graph at all: the reader refuses. The guard must fall
        // through to the childrenIds verdict, NOT read the refusal as "empty".
        const ctxPopulated = makeCtx({ [L0]: ['some-element'], [L1]: [] });
        expect(new DeleteLevelCommand({ levelId: L0 }).canExecute(ctxPopulated).ok).toBe(false);

        const ctxEmpty = makeCtx({ [L0]: [], [L1]: [] });
        expect(new DeleteLevelCommand({ levelId: L0 }).canExecute(ctxEmpty).ok).toBe(true);
    });
});

describe('sitsOn — C71 §1.2 semantics 5 (invalidation) and 6 (deletion)', () => {
    it('(d) semantic 6 — deleting the ELEMENT endpoint removes it from the reverse answer', () => {
        seedSitsOn(SLAB, L0, 'CreateSlabCommand');
        seedSitsOn(COLUMN, L0, 'CreateColumnCommand');

        semanticGraphManager.removeAllRelationshipsForElement(SLAB);

        const q = semanticGraphManager.getElementsSittingOn(L0);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.elementIds).toEqual([COLUMN]);
    });

    it('(d2) semantic 6 — deleting the LEVEL endpoint drops the level out of the graph, and the reader REFUSES rather than reporting an empty level', () => {
        seedSitsOn(SLAB, L0, 'CreateSlabCommand');
        semanticGraphManager.removeAllRelationshipsForElement(SLAB);
        semanticGraphManager.removeAllRelationshipsForElement(L0);

        const q = semanticGraphManager.getElementsSittingOn(L0);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('level-unknown-to-sitsOn-writers');
    });

    it('(e) semantic 5 — MOVING an element between levels updates BOTH reverse answers', () => {
        // C71 §1.4 records move-invalidation as UNPROVEN for every family. This
        // is the sitsOn row, proven: the move path is purge-then-re-emit, the
        // same shape DeleteColumnCommand/RemoveColumnsOnLevelCommand use when
        // they restore a `sitsOn` edge to a different level.
        seedSitsOn(COLUMN, L0, 'CreateColumnCommand');
        expect((semanticGraphManager.getElementsSittingOn(L0) as any).elementIds).toEqual([COLUMN]);

        semanticGraphManager.removeAllRelationshipsForElement(COLUMN);
        seedSitsOn(COLUMN, L1, 'MoveElementToLevelCommand');

        const from = semanticGraphManager.getElementsSittingOn(L0);
        const to = semanticGraphManager.getElementsSittingOn(L1);

        // The OLD level must not keep a stale edge — the staleness failure mode
        // C71 §7.e names for joinedTo applies identically here.
        expect(from.ok).toBe(false); // L0 now holds no edge at all → honest refusal
        expect(to.ok).toBe(true);
        if (!to.ok) throw new Error('unreachable');
        expect(to.elementIds).toEqual([COLUMN]);

        // And the moved element is now blocked from deleting ITS level, not the old one.
        const ctx = makeCtx({ [L0]: [], [L1]: [] });
        expect(new DeleteLevelCommand({ levelId: L1 }).canExecute(ctx).ok).toBe(false);
    });
});

describe('sitsOn — reader isolation', () => {
    it('(f) the reader is TYPED: it does not answer from a non-sitsOn edge (C71 §1.3)', () => {
        const g = new SemanticGraphManager();
        // Every other family pointing at the level must contribute NOTHING to
        // the sitsOn answer. An untyped sweep would return all three.
        g.addRelationship({ type: 'supports', sourceId: 'beam-1', targetId: L0, createdBy: 't' });
        g.addRelationship({ type: 'connectedByStair', sourceId: L1, targetId: L0, createdBy: 't' });
        g.addRelationship({ type: 'partOf', sourceId: 'room-1', targetId: L0, createdBy: 't' });

        const q = g.getElementsSittingOn(L0);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.elementIds).toEqual([]); // known to the graph, nothing SITS on it
    });
});
