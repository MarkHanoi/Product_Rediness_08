/**
 * §FIX-HANDRAIL-BY-SLAB (L-1103) — THE BY-SLAB GUARD, EXECUTED.
 *
 * FOUNDER, from a live session: *"Handrail by slab doesn't work. The same happened
 * with curtain walls. Walls work correctly."*
 *
 * ⛔ THE OLD TEST FOR THIS PASSED WHILE THE FEATURE WAS DEAD, and understanding why
 * is the point of this file. By Slab used to be a canvas gesture that read
 * `window.selectionManager.selectedObject` at click time; the test hand-installed
 * that selection and clicked. In the editor, `ToolManager.activateTool` calls
 * `selectionManager.setEnabled(false)` while activating the railing tool, so the
 * selection is ALREADY CLEARED before any click can land — and the active tool
 * consumes the clicks that would re-acquire one. The condition was unsatisfiable,
 * and the stub was the only place in the universe where it held.
 *
 * So this file asserts against the store, not against a selection: given a slab in
 * the slab store, the command must produce real handrail records on that slab's
 * boundary, hosted by it, removable by one undo.
 */

import { describe, it, expect } from 'vitest';
import { ProjectContext } from '@pryzm/core-app-model';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import { slabOutlineSegments } from '@pryzm/geometry-handrail';
import {
    CreateHandrailRunOnSlabCommand,
    slabWorldRing,
    closedRingSegments,
} from '../src/handrails/CreateHandrailRunOnSlabCommand';
import type { CommandContext } from '../src/types';

const LEVEL_ID = 'L0';

/** A 6 × 4 slab whose local polygon sits at world (10, 20). */
const SLAB = {
    id: 'slab-1',
    levelId: LEVEL_ID,
    polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
    position: { x: 10, y: 0, z: 20 },
};

function makeCtx(slab: unknown = SLAB): { ctx: CommandContext; store: HandrailStore } {
    const store = new HandrailStore(new ProjectContext());
    const ctx = {
        stores: {
            handrailStore: store,
            slabStore: { getById: (id: string) => ((slab as { id?: string })?.id === id ? slab : undefined) },
        },
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL_ID ? { id, elevation: 0 } : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
        },
        projectContext: { activeLevelId: LEVEL_ID },
    } as unknown as CommandContext;
    return { ctx, store };
}

const cmd = (over: Record<string, unknown> = {}) =>
    new CreateHandrailRunOnSlabCommand({
        slabId: 'slab-1',
        height: 1.1,
        thickness: 0.05,
        fillType: 'glass',
        materialId: 'mat.glass.toughened.clear',
        ...over,
    } as never);

describe('L-1103 — BY SLAB creates a real guard on a real slab', () => {
    it('four edges of the slab become four handrails, at the slab’s WORLD position', () => {
        const { ctx, store } = makeCtx();
        const c = cmd();
        expect(c.canExecute(ctx).ok).toBe(true);

        const res = c.execute(ctx);
        expect(res.success).toBe(true);

        const rails = store.getAll();
        expect(rails).toHaveLength(4);

        const xs = rails.flatMap(r => [r.baseLine[0].x, r.baseLine[1].x]);
        const zs = rails.flatMap(r => [r.baseLine[0].z, r.baseLine[1].z]);
        // Local polygon 0..6 / 0..4 PLUS position (10, 20). A guard at the origin
        // instead is the silent, plausible-looking wrong answer this pins down.
        expect(Math.min(...xs)).toBe(10);
        expect(Math.max(...xs)).toBe(16);
        expect(Math.min(...zs)).toBe(20);
        expect(Math.max(...zs)).toBe(24);
    });

    it('every rail is HOSTED BY the slab, so the model can answer "what guards this slab?"', () => {
        const { ctx, store } = makeCtx();
        cmd().execute(ctx);
        for (const r of store.getAll()) {
            expect(r.hostId).toBe('slab-1');
            expect(r.hostKind).toBe('slab');
        }
    });

    it('the armed TYPE reaches every record — a by-slab guard is not a default grey one', () => {
        const { ctx, store } = makeCtx();
        cmd().execute(ctx);
        for (const r of store.getAll()) {
            expect(r.fillType).toBe('glass');
            expect(r.materialId).toBe('mat.glass.toughened.clear');
            expect(r.height).toBe(1.1);
        }
    });

    it('ONE undo removes the WHOLE perimeter, and redo restores the SAME ids', () => {
        const { ctx, store } = makeCtx();
        const c = cmd();
        c.execute(ctx);
        const idsFirst = store.getAll().map(r => r.id).sort();
        expect(idsFirst).toHaveLength(4);

        c.undo(ctx);
        expect(store.getAll()).toHaveLength(0);

        c.execute(ctx); // redo
        expect(store.getAll().map(r => r.id).sort()).toEqual(idsFirst);
    });

    it('every vertex carries exactly ONE post — no coincident pair at the closure', () => {
        const ring = slabWorldRing(SLAB)!;
        const segs = closedRingSegments(ring, i => `s${i}`);
        expect(segs).toHaveLength(4);
        // A closed loop: EVERY segment suppresses its start post, because its
        // predecessor's end post (segment 0's is the LAST segment's) already stands
        // there. One post per vertex, none doubled (C95 §D4).
        expect(segs.every(s => s.suppressStartPost === true)).toBe(true);
    });

    /**
     * ⭐ THE ANTI-DRIFT ARM. `closedRingSegments` restates a join rule that
     * `@pryzm/geometry-handrail`'s `slabOutlineSegments` also implements. Two
     * implementations of one rule is how this family already lost a week, so the
     * agreement is MEASURED rather than asserted in a comment (C84 §8.d).
     */
    it('agrees with @pryzm/geometry-handrail’s slabOutlineSegments — one rule, not two', () => {
        const ring = slabWorldRing(SLAB)!;
        const mine = closedRingSegments(ring, i => `s${i}`);
        const theirs = slabOutlineSegments(ring).segments;
        expect(mine.length).toBe(theirs.length);
        for (let i = 0; i < mine.length; i++) {
            expect(mine[i]!.suppressStartPost).toBe(theirs[i]!.suppressStartPost);
        }
    });

    it('a ring that repeats its first point as its last mints NO zero-length edge', () => {
        const ring = [...slabWorldRing(SLAB)!];
        ring.push({ ...ring[0]! });
        expect(closedRingSegments(ring, i => `s${i}`)).toHaveLength(4);
    });

    describe('every refusal NAMES the mechanism (C16 CA-18) — and refuses, not throws', () => {
        it('an unknown slab', () => {
            const { ctx, store } = makeCtx();
            const v = new CreateHandrailRunOnSlabCommand({ slabId: 'nope', height: 1.1, thickness: 0.05 }).canExecute(ctx);
            expect(v.ok).toBe(false);
            expect(v.reason).toMatch(/no slab 'nope' exists/i);
            expect(store.getAll()).toHaveLength(0);
        });

        it('a slab with no polygon', () => {
            const { ctx } = makeCtx({ id: 'slab-1', levelId: LEVEL_ID, polygon: [{ x: 0, y: 0 }] });
            const v = cmd().canExecute(ctx);
            expect(v.ok).toBe(false);
            expect(v.reason).toMatch(/no boundary polygon/i);
        });

        it('a slab on no level — a railing is never placed at an assumed Y', () => {
            const { ctx } = makeCtx({ ...SLAB, levelId: undefined });
            const v = cmd().canExecute(ctx);
            expect(v.ok).toBe(false);
            expect(v.reason).toMatch(/on no level/i);
        });

        it('a slab too small to carry any edge ≥ 0.1 m', () => {
            const { ctx, store } = makeCtx({
                ...SLAB,
                polygon: [{ x: 0, y: 0 }, { x: 0.02, y: 0 }, { x: 0.02, y: 0.02 }],
            });
            const c = cmd();
            expect(c.canExecute(ctx).ok).toBe(false);
            // And EXECUTING anyway creates nothing — a refusal that still writes is
            // worse than no refusal at all.
            expect(c.execute(ctx).success).toBe(false);
            expect(store.getAll()).toHaveLength(0);
        });
    });
});
