// §FEAT-BULK-DIMENSIONS (L-949) — the bulk-resize batch's FOUR claims, with teeth.
//
// The chat's Confirm card promises four things before the user agrees to
// "make all windows 2 meters height":
//
//   1. every element in the resolved scope really changes;
//   2. it is ONE undo entry, and that one Ctrl+Z puts every one of them back;
//   3. an id that has gone stale is a COUNTED SKIP WITH ITS REASON, never a
//      silent shrink of the number and never a thrown batch;
//   4. an EMPTY target set REFUSES — it is not a cheerful no-op reporting done
//      (§NO-EMPTY-MEANS-UNKNOWN).
//
// Plus the one that makes it a BATCH rather than a fan-out: every requested
// dimension for a given element rides ONE child dispatch, so the element is
// rebuilt once, after all its values have landed. That is ADR-0314 D3's
// "one dispatch = one rebuild for one element" contract, preserved at batch
// scale — and it is the property that would silently rot if someone "simplified"
// this into a loop over the single-dimension route.
//
// The fixture is a faithful in-memory WALL store driving WINDOW openings,
// because that is the founder's own family and the one whose ids are re-minted
// on rebuild. Data/command test only — no THREE, no DOM.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateElementDimensionsBatchCommand } from '../src/generic/UpdateElementDimensionsBatchCommand';
import type { CommandContext } from '../src/types';

interface FakeWindow {
    id: string;
    wallId: string;
    height: number;
    width: number;
    sillHeight: number;
}

/** How many times each element was written — the FAN-OUT detector. */
const writeCounts = new Map<string, number>();

function makeCtx(windows: FakeWindow[]) {
    const byId = new Map(windows.map((w) => [w.id, w]));
    const wall = { id: 'wall-1', height: 3, thickness: 0.2, metadata: { version: 1 }, _renderVersion: 1 };
    const wallStore = {
        getById: (id: string) => (id === wall.id ? wall : undefined),
        getWindow: (id: string) => byId.get(id),
        getDoor: () => undefined,
        getAll: () => [wall],
        updateWindow: (id: string, params: Record<string, unknown>) => {
            const w = byId.get(id);
            if (!w) return;
            writeCounts.set(id, (writeCounts.get(id) ?? 0) + 1);
            Object.assign(w, params);
        },
        update: () => {},
    };
    return {
        ctx: { stores: { wallStore } } as unknown as CommandContext,
        byId,
    };
}

const win = (id: string): FakeWindow => ({ id, wallId: 'wall-1', height: 1.2, width: 0.8, sillHeight: 0.9 });

beforeEach(() => {
    writeCounts.clear();
    // The child command's rebuild leg reads `window.wallFragmentBuilder` and
    // `window.wallStore`; under node those are absent and its guarded branches
    // only console.warn. Silence the noise, do not fake the builder — the
    // assertion here is about the STORE, which is the authoritative state.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('UpdateElementDimensionsBatchCommand — the founder\'s bulk resize', () => {
    it('changes EVERY element in the scope, and reports N of M', () => {
        const { ctx, byId } = makeCtx([win('w1'), win('w2'), win('w3')]);
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: ['w1', 'w2', 'w3'],
            elementKind: 'window',
            dimensions: { height: 2 },
        });

        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        // The whole point of the ask: EVERY window, not the selected one.
        expect([...byId.values()].map((w) => w.height)).toEqual([2, 2, 2]);
        expect(r.info?.[0]).toBe('Changed 3 of 3 windows (height 2 m)');
        expect(cmd.skipped).toHaveLength(0);
    });

    it('applies SEVERAL dimensions in ONE dispatch per element (never a fan-out)', () => {
        // ADR-0314 D3: one dispatch = one rebuild for one element. Three fields
        // must NOT become three writes — a rebuild between them re-mints the
        // opening id, which is the stale-id hazard the ruling exists to prevent.
        const { ctx, byId } = makeCtx([win('w1'), win('w2')]);
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: ['w1', 'w2'],
            elementKind: 'window',
            dimensions: { height: 2, width: 1, sillHeight: 0.1 },
        });

        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        expect(byId.get('w1')).toMatchObject({ height: 2, width: 1, sillHeight: 0.1 });
        expect(byId.get('w2')).toMatchObject({ height: 2, width: 1, sillHeight: 0.1 });
        // ONE write per element, carrying all three fields.
        expect(writeCounts.get('w1')).toBe(1);
        expect(writeCounts.get('w2')).toBe(1);
    });

    it('ONE undo reverts the WHOLE batch', () => {
        const { ctx, byId } = makeCtx([win('w1'), win('w2'), win('w3')]);
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: ['w1', 'w2', 'w3'],
            elementKind: 'window',
            dimensions: { height: 2, width: 1 },
        });

        cmd.execute(ctx);
        expect([...byId.values()].map((w) => w.height)).toEqual([2, 2, 2]);

        // ONE call — this is the undo entry the history stack holds.
        const u = cmd.undo(ctx);

        expect(u.success).toBe(true);
        expect([...byId.values()].map((w) => w.height)).toEqual([1.2, 1.2, 1.2]);
        expect([...byId.values()].map((w) => w.width)).toEqual([0.8, 0.8, 0.8]);
        // Scoped to the AUTHORED fields: sill was never asked for, never touched.
        expect([...byId.values()].map((w) => w.sillHeight)).toEqual([0.9, 0.9, 0.9]);
    });

    it('a STALE id is a counted skip WITH ITS REASON, never a silent shrink', () => {
        // The realistic failure: the scope was resolved a moment before the
        // Confirm card was clicked, and one window has since gone. C13 §3.12 —
        // refuse it, never repair it by re-resolving the scope (which would act
        // on elements the user never named).
        const { ctx, byId } = makeCtx([win('w1'), win('w2')]);
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: ['w1', 'gone', 'w2'],
            elementKind: 'window',
            dimensions: { height: 2 },
        });

        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        expect(byId.get('w1')!.height).toBe(2);
        expect(byId.get('w2')!.height).toBe(2);
        // The DENOMINATOR still says 3 — the ask was three windows.
        expect(r.info?.[0]).toBe('Changed 2 of 3 windows (height 2 m) — 1 skipped');
        // And the reason is NAMED, grouped, on its own line.
        expect(r.info?.[1]).toContain('1×');
        expect(r.info?.[1]).toMatch(/not found/i);
        expect(cmd.skipped).toEqual([
            { elementId: 'gone', reason: expect.stringMatching(/not found/i) },
        ]);
    });

    it('an EMPTY target set REFUSES — it is not a successful no-op', () => {
        const { ctx } = makeCtx([win('w1')]);
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: [],
            elementKind: 'window',
            dimensions: { height: 2 },
        });

        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('No windows to resize');
    });

    it('a scope where NOTHING is resizable refuses whole, naming the first reason', () => {
        const { ctx } = makeCtx([win('w1')]);
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: ['ghost-a', 'ghost-b'],
            elementKind: 'window',
            dimensions: { height: 2 },
        });

        // canExecute cannot see "not found" (that is an execute-time read), so
        // the honest place this lands is a run that changes nothing and SAYS so.
        const r = cmd.execute(ctx);
        expect(r.success).toBe(false);
        expect(r.info?.[0]).toBe('Changed 0 of 2 windows (height 2 m) — 2 skipped');
    });

    it('an EMPTY dimension set refuses with a concrete example', () => {
        const { ctx } = makeCtx([win('w1')]);
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: ['w1'],
            elementKind: 'window',
            dimensions: {},
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('No dimensions were given');
    });

    it('declares the UNION of stores its children can write (the L-947 firebreak)', () => {
        // `UpdateElementParameterCommand.affectedStores` is hard-coded to
        // ["wall"] while its resolveStore() routes fifteen kinds (L-947, being
        // fixed elsewhere). The transaction snapshot is taken from the TOP-LEVEL
        // command — this one — so the union below is what keeps a window/door/
        // slab rollback correct regardless of that defect. Losing it would
        // silently re-introduce L-947 at batch scale.
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: ['w1'], elementKind: 'window', dimensions: { height: 2 },
        });
        expect(cmd.affectedStores).toContain('window');
        expect(cmd.affectedStores).toContain('door');
        expect(cmd.affectedStores).toContain('wall');
        expect(cmd.affectedStores).toContain('slab');
        expect(cmd.affectedStores.length).toBeGreaterThan(5);
    });

    it('de-dups ids so one element is never resized (or counted) twice', () => {
        const { ctx } = makeCtx([win('w1')]);
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: ['w1', 'w1', 'w1'],
            elementKind: 'window',
            dimensions: { height: 2 },
        });
        const r = cmd.execute(ctx);
        expect(r.info?.[0]).toBe('Changed 1 of 1 window (height 2 m)');
        expect(writeCounts.get('w1')).toBe(1);
    });
});
