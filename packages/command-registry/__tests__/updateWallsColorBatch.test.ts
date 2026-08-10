// §FEAT-WALL-COLOR-BATCH (ADR-0314) — batch wall recolour semantics.
//
// Pins the same contract points as the type batch it mirrors:
//   1. PARTIAL FAILURE (§CONTEXT-DATA-HONESTY): a vanished wall is SKIPPED with
//      its reason; the result reports "Recoloured N of M — K skipped". ALL-
//      refused / empty scope = visible no-op via canExecute, never a throw.
//   2. SINGLE UNDO: one batch = one Command; undo() restores EVERY touched
//      wall's snapshot (children are the reused UpdateWallColorCommand).
//   3. 'all' spans ALL LEVELS; explicit ids are de-duped.
//   4. VALUE CONTRACT: '#rrggbb' only — the colour-NAME table lives in the
//      resolver (ai-host colorRef.ts), never here.
// Plus the generic catalogue resolver the wall-type lookup now delegates to.

import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateWallsColorBatchCommand } from '../src/walls/UpdateWallsColorBatchCommand';
import { resolveCatalogueRef } from '../src/catalogue/resolveCatalogueRef';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };
interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    thickness: number;
    materialColor?: string;
    materialId?: string | null;
    openings: unknown[];
    childrenIds: string[];
}

function p(x: number, z: number): Pt { return { x, y: 0, z }; }

function wall(id: string, over: Partial<W> = {}): W {
    return {
        id, levelId: 'L0',
        baseLine: [p(0, 0), p(5, 0)],
        thickness: 0.2,
        openings: [], childrenIds: [],
        ...over,
    };
}

function makeWallStore(seed: W[]) {
    const map = new Map<string, W>(seed.map(w => [w.id, structuredClone(w)]));
    return {
        map,
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        updateWall(next: W) { map.set(next.id, structuredClone(next)); },
        restoreSnapshot(snap: W) { map.set(snap.id, structuredClone(snap)); },
    };
}

function makeCtx(store: ReturnType<typeof makeWallStore>): CommandContext {
    return { stores: { wallStore: store } } as unknown as CommandContext;
}

describe('UpdateWallsColorBatchCommand — §CONTEXT-DATA-HONESTY batch semantics', () => {
    let store: ReturnType<typeof makeWallStore>;
    let ctx: CommandContext;

    beforeEach(() => {
        store = makeWallStore([
            wall('w1'),
            wall('w2', { materialColor: '#123456', materialId: 'brick' }),
            wall('w3', { levelId: 'L1' }),                // different level — 'all' must reach it
        ]);
        ctx = makeCtx(store);
    });

    it("'all' recolours every wall across ALL levels in one execute", () => {
        const cmd = new UpdateWallsColorBatchCommand({ wallIds: 'all', materialColor: '#ffffff' });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds.sort()).toEqual(['w1', 'w2', 'w3']);
        expect(r.info?.[0]).toContain('Recoloured 3 of 3');
        for (const id of ['w1', 'w2', 'w3']) {
            expect(store.getById(id)?.materialColor).toBe('#ffffff');
        }
        // Untouched fields survive.
        expect(store.getById('w2')?.materialId).toBe('brick');
    });

    it('one undo entry restores EVERY touched wall byte-for-byte', () => {
        const before = new Map([...store.map.entries()].map(([k, v]) => [k, structuredClone(v)]));
        const cmd = new UpdateWallsColorBatchCommand({ wallIds: 'all', materialColor: '#000000' });
        cmd.execute(ctx);
        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        for (const [id, snap] of before) {
            expect(store.getById(id)).toEqual(snap);
        }
    });

    it('a vanished wall is skipped WITH a reason; the rest are changed and reported N of M', () => {
        const cmd = new UpdateWallsColorBatchCommand({
            wallIds: ['w1', 'ghost', 'w3'],
            materialColor: '#ffffff',
        });
        // canExecute pre-announces the skip as a warning (mixed ⇒ proceed).
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);
        expect(v.warnings?.length).toBe(1);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds.sort()).toEqual(['w1', 'w3']);
        expect(r.info?.[0]).toContain('Recoloured 2 of 3');
        expect(r.info?.[0]).toContain('1 skipped');
        expect(cmd.skipped[0]?.wallId).toBe('ghost');
    });

    it('empty scope and no-walls-at-all decline VISIBLY, never throw', () => {
        expect(new UpdateWallsColorBatchCommand({ wallIds: [], materialColor: '#ffffff' })
            .canExecute(ctx).ok).toBe(false);
        const empty = makeCtx(makeWallStore([]));
        const all = new UpdateWallsColorBatchCommand({ wallIds: 'all', materialColor: '#ffffff' });
        const v = all.canExecute(empty);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('no walls');
    });

    it("rejects a non-'#rrggbb' colour and an empty property set at canExecute", () => {
        expect(new UpdateWallsColorBatchCommand({ wallIds: 'all', materialColor: 'white' })
            .canExecute(ctx).ok).toBe(false);
        expect(new UpdateWallsColorBatchCommand({ wallIds: 'all' })
            .canExecute(ctx).ok).toBe(false);
    });

    it('explicit ids are de-duped — one wall is never counted twice', () => {
        const cmd = new UpdateWallsColorBatchCommand({
            wallIds: ['w1', 'w1', 'w1'],
            materialColor: '#ffffff',
        });
        const r = cmd.execute(ctx);
        expect(r.affectedElementIds).toEqual(['w1']);
        expect(r.info?.[0]).toContain('Recoloured 1 of 1');
    });

    it('materialId: null clears the catalogue binding; colour alone leaves it', () => {
        const clear = new UpdateWallsColorBatchCommand({ wallIds: ['w2'], materialId: null });
        expect(clear.canExecute(ctx).ok).toBe(true);
        clear.execute(ctx);
        expect(store.getById('w2')?.materialId ?? null).toBeNull();
    });
});

// ─── resolveCatalogueRef — the generic ladder (ADR-0314 §Reference resolution) ─

describe('resolveCatalogueRef — the ONE forgiving catalogue lookup', () => {
    const ENTRIES = [
        { id: 'dt-single-flush', name: 'Single – Flush 900mm' },
        { id: 'dt-double-glazed', name: 'Double – Glazed 1800mm' },
        { id: 'dt-single-glazed', name: 'Single – Glazed 900mm' },
    ];
    const reader = {
        getById: (id: string) => ENTRIES.find(e => e.id === id),
        getAll: () => [...ENTRIES],
    };

    it('resolves id → name → case-insensitive → unambiguous word subset, in order', () => {
        expect(resolveCatalogueRef(reader, 'dt-single-flush').entry?.id).toBe('dt-single-flush');
        expect(resolveCatalogueRef(reader, 'Single – Flush 900mm').resolvedBy).toBe('name');
        expect(resolveCatalogueRef(reader, ' single – flush 900MM ').resolvedBy).toBe('name-case-insensitive');
        const subset = resolveCatalogueRef(reader, 'single flush');
        expect(subset.resolvedBy).toBe('name-word-subset');
        expect(subset.entry?.id).toBe('dt-single-flush');
    });

    it('AMBIGUITY refuses with the candidate list — never a coin-flip', () => {
        // "glazed" matches the double AND the single glazed doors.
        const r = resolveCatalogueRef(reader, 'glazed');
        expect(r.entry).toBeNull();
        expect(r.resolvedBy).toBe('ambiguous');
        expect(r.candidates?.map(c => c.id).sort()).toEqual(['dt-double-glazed', 'dt-single-glazed']);
    });

    it('domain noise words are dropped from BOTH sides of the comparison', () => {
        const r = resolveCatalogueRef(reader, 'the single flush door type', { domainNoise: ['door', 'doors'] });
        expect(r.entry?.id).toBe('dt-single-flush');
    });

    it('unresolvable returns null with resolvedBy=unresolved, never throws', () => {
        const r = resolveCatalogueRef(reader, 'no such thing');
        expect(r.entry).toBeNull();
        expect(r.resolvedBy).toBe('unresolved');
    });
});
