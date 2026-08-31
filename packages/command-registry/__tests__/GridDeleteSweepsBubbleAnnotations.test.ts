/**
 * §GRID106 — deleting a grid must also delete its bubble annotations.
 *
 * THE DEFECT (founder report, 2026-08-26, with screenshot)
 * ────────────────────────────────────────────────────────
 * "I created many grids that after I removed — I still can see their bubbles —
 *  but I removed them? why are they there?"
 *
 * Creating a grid mints TWO records:
 *   (1) the Grid in GridStore                    — `grid.add` → AddGridCommand
 *   (2) a 'grid-bubble' AnnotationElement in the ADR-0119 SUBSYSTEM
 *       annotationStore, linked to (1) ONLY by `parameters.gridId`
 *       — GridPlanToolHandler._createPlanBubble (apps/editor/src/engine/views/
 *         plantools/GridPlanToolHandler.ts:319) and GridBubbleTool.
 *
 * `RemoveGridCommand.execute()` removed ONLY (1). Nothing anywhere removed (2):
 * not the StoreEventBus 'delete' listener (BimKernel._handleGridStoreEvent only
 * sweeps the 3D line + sprite), not the annotation dependency graph (bubbles use
 * POINT refs, which are exempt from orphan marking), not the serializer. The
 * bubble annotation therefore rendered forever in every plan view
 * (PlanViewAnnotationRenderer._renderGridBubble), in the 3D annotation overlay
 * (AnnotationRenderLayer._renderGridBubble), stayed hit-testable, and PERSISTED
 * — ProjectSerializer serialises the subsystem annotationStore, so the ghosts
 * survived save/reload. That is the founder's screenshot: orphan bubbles
 * (L, K, J, I, H, G, 8, 7, E) with no grid lines attached.
 *
 * THE CONTRACTED BEHAVIOUR
 * ────────────────────────
 * C84 EI-2: a delete is a delete of the ELEMENT, including its derived visuals.
 * C16 §8.6: one gesture = ONE undo entry — so the sweep must live INSIDE
 * RemoveGridCommand (snapshot + remove in execute, restore in undo), not be a
 * second command. C84 EI-7: affectedStores must name the measured write set,
 * which now includes 'annotation'.
 *
 * WHY REAL STORES
 * ───────────────
 * Same reason as GridPinnedRefusal.test.ts: the defect is a disagreement
 * between the command's claim ("Grid removed") and what the stores still hold.
 * A fake store built from the command's expectations cannot falsify the claim.
 * GridStore and AnnotationStore here are the real classes; the bubble is built
 * by the same makeAnnotationElement factory GridPlanToolHandler uses.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GridStore } from '@pryzm/core-app-model';
import { AnnotationStore, makeAnnotationElement } from '@pryzm/core-app-model';
import { RemoveGridCommand } from '../src/grids/RemoveGridCommand';
import type { CommandContext } from '../src/types';

// ── Fixture builders — mirror GridPlanToolHandler._createPlanBubble exactly ──

function bubbleFor(gridId: string, name: string, axis: 'X' | 'Y', position: number, viewId = 'view-plan-L0') {
    const cachedPosition = { x: axis === 'X' ? position : 100, y: 0, z: axis === 'X' ? 100 : position };
    return makeAnnotationElement(
        `bubble-${gridId}`,
        'grid-bubble',
        viewId,
        [{
            elementId: `pt-${gridId}`,
            elementType: 'point',
            stableKey: `pt-${gridId}`,
            cachedPosition,
        } as never],
        { modelPoints: [cachedPosition], offset: 0 },
        { gridId, gridName: name, axis, position, endIndex: 1, cachedLabel: name },
        { lineColor: '#4b5563', textColor: '#374151', lineWeight: 0.25 },
    );
}

function textNote(id: string, viewId = 'view-plan-L0') {
    return makeAnnotationElement(
        id, 'text-note', viewId,
        [], { modelPoints: [{ x: 1, y: 0, z: 1 }], offset: 0 },
        { text: 'unrelated note' }, {},
    );
}

describe('§GRID106 — RemoveGridCommand sweeps the grid-bubble annotations (founder ghost-bubble report)', () => {
    let gridStore: GridStore;
    let annStore: AnnotationStore;
    let ctx: CommandContext;

    beforeEach(() => {
        gridStore = new GridStore();
        annStore = new AnnotationStore();
        ctx = { stores: { gridStore, annotationStore: annStore } } as unknown as CommandContext;

        // The founder's scenario: several grids, each with its plan bubble.
        gridStore.add({ id: 'grid_A', name: 'A', axis: 'Y', position: 0 });
        gridStore.add({ id: 'grid_B', name: 'B', axis: 'Y', position: 4 });
        gridStore.add({ id: 'grid_1', name: '1', axis: 'X', position: 0 });
        annStore.add(bubbleFor('grid_A', 'A', 'Y', 0));
        annStore.add(bubbleFor('grid_B', 'B', 'Y', 4));
        annStore.add(bubbleFor('grid_1', '1', 'X', 0));
        // Negative controls — must SURVIVE every delete below:
        //   a non-grid annotation, and a bubble belonging to a LIVE grid.
        annStore.add(textNote('note-1'));
    });

    it('THE DEFECT: deleting a grid leaves no ghost bubble in the annotation store', () => {
        const res = new RemoveGridCommand({ gridId: 'grid_A' }).execute(ctx);

        expect(res.success).toBe(true);
        expect(gridStore.has('grid_A')).toBe(false);
        // The ghost: before the fix this record survived forever.
        expect(annStore.has('bubble-grid_A')).toBe(false);
        // Scramble controls — the sweep must not overreach.
        expect(annStore.has('bubble-grid_B')).toBe(true);
        expect(annStore.has('bubble-grid_1')).toBe(true);
        expect(annStore.has('note-1')).toBe(true);
    });

    it('create 3 → delete 3 → NOTHING grid-linked survives (the reload set is clean)', () => {
        for (const id of ['grid_A', 'grid_B', 'grid_1']) {
            expect(new RemoveGridCommand({ gridId: id }).execute(ctx).success).toBe(true);
        }
        expect(gridStore.getAll()).toHaveLength(0);
        // ProjectSerializer persists annotationStore.getAll() — this set IS what
        // a save would write, so an empty grid-linked set here means a reload
        // cannot resurrect ghosts.
        const remaining = annStore.getAll();
        expect(remaining.map(a => a.id)).toEqual(['note-1']);
    });

    it('undo restores the grid AND its bubble — one gesture, one undo entry (C16 §8.6)', () => {
        const cmd = new RemoveGridCommand({ gridId: 'grid_B' });
        cmd.execute(ctx);
        expect(annStore.has('bubble-grid_B')).toBe(false);

        const undone = cmd.undo(ctx);
        expect(undone.success).toBe(true);
        expect(gridStore.has('grid_B')).toBe(true);
        expect(annStore.has('bubble-grid_B')).toBe(true);
        const restored = annStore.getById('bubble-grid_B')!;
        expect(restored.parameters.gridId).toBe('grid_B');
        expect(restored.parameters.cachedLabel).toBe('B');

        // Redo (execute again) removes both again — the treadmill stays consistent.
        cmd.execute(ctx);
        expect(gridStore.has('grid_B')).toBe(false);
        expect(annStore.has('bubble-grid_B')).toBe(false);
    });

    it('a grid with MULTIPLE linked annotations (both GridBubbleTool endpoints) sweeps them all', () => {
        // GridBubbleTool places bubbles at BOTH endpoints (endIndex 0 and 1).
        const second = bubbleFor('grid_1', '1', 'X', 0);
        (second as { id: string }).id = 'bubble-grid_1-end0';
        annStore.add(second);

        new RemoveGridCommand({ gridId: 'grid_1' }).execute(ctx);
        expect(annStore.getAll().filter(a => (a.parameters as { gridId?: unknown }).gridId === 'grid_1')).toHaveLength(0);
        expect(annStore.has('note-1')).toBe(true);
    });

    it('affectedStores names the measured write set (C84 EI-7)', () => {
        const cmd = new RemoveGridCommand({ gridId: 'grid_A' });
        expect(cmd.affectedStores).toContain('grid');
        expect(cmd.affectedStores).toContain('annotation');
    });

    it('an absent annotation store does not break the grid delete (legacy contexts)', () => {
        const bare = { stores: { gridStore } } as unknown as CommandContext;
        const res = new RemoveGridCommand({ gridId: 'grid_A' }).execute(bare);
        expect(res.success).toBe(true);
        expect(gridStore.has('grid_A')).toBe(false);
    });
});
